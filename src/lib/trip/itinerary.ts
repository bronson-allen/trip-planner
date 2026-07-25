import { isClosedForTrip, isOpenOnDate } from '../places/availability'
import { estimateTravel, haversineMeters, type TravelEstimate } from '../geo/directions'
import type { NormalizedPlace } from '../places/normalize'
import { rankPlaces, type Pace, type TripPrefs } from '../places/score'
import { tagMeta } from '../places/tags'

/**
 * Scheduler — the second deterministic stage. `score.ts` decides *which* places are worth
 * visiting; this decides *when*: which day, which slot, in what order. Still pure, still no AI.
 *
 * Two judgment calls the brief rewards, made structurally here:
 *   1. Anchor on ONE base city (the top-ranked place's city) so 3 days don't become
 *      impossible cross-country hops.
 *   2. Cluster each day geographically (nearest-neighbour from a high-scored anchor) so the
 *      traveler isn't zig-zagging, then order stops by their `morning`/`evening` daypart tag.
 */

export type SlotKind = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'dinner'

type SlotType = 'sight' | 'meal'

type Slot = { kind: SlotKind; type: SlotType }

/**
 * Each pace is a day rhythm. Meals (lunch + dinner) are constant; pace only changes how many
 * sights get packed between them — relaxed drops the evening stop, packed adds an extra
 * afternoon one. Fewer stops = more relaxed.
 */
const DAY_TEMPLATES: Record<Pace, ReadonlyArray<Slot>> = {
  relaxed: [
    { kind: 'morning', type: 'sight' },
    { kind: 'lunch', type: 'meal' },
    { kind: 'afternoon', type: 'sight' },
    { kind: 'dinner', type: 'meal' },
  ],
  balanced: [
    { kind: 'morning', type: 'sight' },
    { kind: 'lunch', type: 'meal' },
    { kind: 'afternoon', type: 'sight' },
    { kind: 'evening', type: 'sight' },
    { kind: 'dinner', type: 'meal' },
  ],
  packed: [
    { kind: 'morning', type: 'sight' },
    { kind: 'lunch', type: 'meal' },
    { kind: 'afternoon', type: 'sight' },
    { kind: 'afternoon', type: 'sight' },
    { kind: 'evening', type: 'sight' },
    { kind: 'dinner', type: 'meal' },
  ],
}

const DEFAULT_PACE: Pace = 'balanced'

function countSightSlots(template: ReadonlyArray<Slot>): number {
  return template.filter((slot) => slot.type === 'sight').length
}

/** Types that fill a meal slot; everything else is a "sight". */
const MEAL_TYPES = new Set(['restaurant', 'cafe'])

export type ScheduledStop = {
  place: NormalizedPlace
  slot: SlotKind
  /** Walking estimate from the previous stop; null for the first stop of a day. */
  travelFromPrev: TravelEstimate | null
}

export type ItineraryDay = {
  day: number
  stops: ScheduledStop[]
}

export type Itinerary = {
  /** The single base city the whole trip is anchored on. */
  city: string
  days: ItineraryDay[]
}

export type BuildOptions = {
  days?: number
  /** Force the base city (e.g. the user's pick). When omitted, anchors on the top-ranked place's city. */
  city?: string
  /** Real trip dates; when given, places closed on every one are dropped as candidates. */
  tripDates?: Date[]
}

type LatLng = Pick<NormalizedPlace, 'latitude' | 'longitude'>

/**
 * Max distance a candidate may sit from its city's centre. The trip anchors on one base city
 * for tight days, so a place claiming that city but plotting far outside it (a bad coordinate
 * or mislabelled city) is excluded rather than sending the traveler on a multi-hour detour.
 */
export const MAX_CITY_RADIUS_KM = 40

export function isMeal(place: NormalizedPlace): boolean {
  return MEAL_TYPES.has(place.type)
}

/**
 * Rating floor for places the planner picks on the traveler's behalf. The dataset contains exactly
 * one entry below it — a 2.1-rated tourist-trap restaurant, more than two points below anything
 * else, which `audit.ts` already reports as a `low_rating_outlier`.
 *
 * This is a floor on what the planner *volunteers*, not on what a trip may contain: the place
 * stays visible in Explore and `addStop` still accepts it, so a traveler who wants it can have it.
 */
const AUTO_SCHEDULE_MIN_RATING = 3

/** Whether the planner may choose this place without being asked for it by name. */
export function isAutoSchedulable(place: NormalizedPlace): boolean {
  return place.rating >= AUTO_SCHEDULE_MIN_RATING
}

/** Chronological rank from the daypart tag: morning first (0), evening last (2), rest mid (1). */
export function daypartRank(place: NormalizedPlace): number {
  for (const tag of place.tags) {
    const daypart = tagMeta(tag).daypart
    if (daypart === 'morning') return 0
    if (daypart === 'evening') return 2
  }
  return 1
}

/** Closest place in `pool` to `target` by straight-line distance; null if the pool is empty. */
function nearest(target: LatLng, pool: NormalizedPlace[]): NormalizedPlace | null {
  let best: NormalizedPlace | null = null
  let bestMeters = Infinity
  for (const place of pool) {
    const meters = haversineMeters(target, place)
    if (meters < bestMeters) {
      bestMeters = meters
      best = place
    }
  }
  return best
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Robust city centre — median coordinate, so one bad outlier can't drag it off the city. */
export function cityCenter(places: NormalizedPlace[]): LatLng {
  return {
    latitude: median(places.map((p) => p.latitude)),
    longitude: median(places.map((p) => p.longitude)),
  }
}

/** The same city, geography, and availability gates used by the initial scheduler and edits. */
export function isPlaceEligibleForTrip(
  place: NormalizedPlace,
  places: NormalizedPlace[],
  city: string,
  tripDates: Date[],
): boolean {
  if (place.city !== city) return false
  const inCity = places.filter((candidate) => candidate.city === city)
  const center = inCity.length ? cityCenter(inCity) : null
  if (center && haversineMeters(center, place) / 1000 > MAX_CITY_RADIUS_KM) return false
  return !isClosedForTrip(place, tripDates)
}

function centroid(places: NormalizedPlace[]): LatLng {
  const sum = places.reduce(
    (acc, place) => ({
      latitude: acc.latitude + place.latitude,
      longitude: acc.longitude + place.longitude,
    }),
    { latitude: 0, longitude: 0 },
  )
  return { latitude: sum.latitude / places.length, longitude: sum.longitude / places.length }
}

/**
 * Narrows a pool to what the data says is open on this date, but never to nothing: a stop the
 * UI flags as "may be closed" is more useful to the traveler than a hole in the day. Preserves
 * the incoming order, so a score-ranked pool stays score-ranked.
 */
function openOnDateFirst(pool: NormalizedPlace[], date: Date | null): NormalizedPlace[] {
  if (!date) return pool
  const open = pool.filter((place) => isOpenOnDate(place, date))
  return open.length > 0 ? open : pool
}

/**
 * Picks one day's worth of sights: a high-scored anchor plus its nearest unused neighbours,
 * so the day stays geographically tight. `ranked` is score-ordered, so the first eligible entry
 * is the best remaining place. Marks chosen ids in `used`.
 *
 * `date` makes the choice day-aware: `isClosedForTrip` only drops places closed across the whole
 * trip, which still leaves a Tues-Sun museum landing on a Monday when another day was free.
 */
function selectDaySights(
  ranked: NormalizedPlace[],
  used: Set<string>,
  sightSlots: number,
  date: Date | null,
): NormalizedPlace[] {
  const unused = () => ranked.filter((place) => !used.has(place.id))

  const anchor = openOnDateFirst(unused(), date)[0]
  if (!anchor) return []

  const chosen = [anchor]
  used.add(anchor.id)

  while (chosen.length < sightSlots) {
    const next = nearest(anchor, openOnDateFirst(unused(), date))
    if (!next) break
    used.add(next.id)
    chosen.push(next)
  }
  return chosen
}

/**
 * How far from the day's centre a meal may sit and still count as on the way. Wide enough that
 * every day has real choice, tight enough that lunch isn't across the city.
 */
const MEAL_RADIUS_METERS = 2_500

/**
 * Best meal near the day's centre, preferring one open on the date. `meals` arrives
 * score-ordered, so the first candidate inside the radius is also the best-scoring one.
 *
 * Distance alone is not enough: the dataset's worst-rated place is a tourist-trap restaurant
 * that happens to sit close to the middle of a classic Rome day, and picking purely by
 * proximity schedules it over far better options a few hundred metres further out. Nothing in
 * range falls back to the closest, since a distant meal still beats an empty slot.
 */
function selectMeal(
  center: LatLng,
  meals: NormalizedPlace[],
  date: Date | null,
): NormalizedPlace | null {
  const pool = openOnDateFirst(meals, date)
  const inRange = pool.find((meal) => haversineMeters(center, meal) <= MEAL_RADIUS_METERS)
  return inRange ?? nearest(center, pool)
}

/** Assembles one day: sights ordered by daypart, meals chosen near the day's centre. */
function buildDay(
  dayNumber: number,
  template: ReadonlyArray<Slot>,
  sights: NormalizedPlace[],
  meals: NormalizedPlace[],
  used: Set<string>,
  date: Date | null,
): ItineraryDay {
  const orderedSights = [...sights].sort((a, b) => daypartRank(a) - daypartRank(b))
  const center = sights.length ? centroid(sights) : null

  let sightIndex = 0
  const stops: ScheduledStop[] = []

  for (const slot of template) {
    let place: NormalizedPlace | null = null

    if (slot.type === 'sight') {
      place = orderedSights[sightIndex++] ?? null
    } else if (center) {
      place = selectMeal(center, meals.filter((meal) => !used.has(meal.id)), date)
      if (place) used.add(place.id)
    }

    if (place) stops.push({ place, slot: slot.kind, travelFromPrev: null })
  }

  // Fill in walking travel between consecutive stops once the day's order is fixed.
  for (let i = 1; i < stops.length; i++) {
    stops[i].travelFromPrev = estimateTravel(stops[i - 1].place, stops[i].place)
  }

  return { day: dayNumber, stops }
}

/**
 * Builds a multi-day itinerary from the scored places and the user's prefs. Deterministic:
 * same inputs → same plan. Dedup is by `id` (never name/coordinate), so legitimately paired
 * stops like "Trevi Fountain" / "Trevi Fountain by Night" can both appear.
 */
export function buildItinerary(
  places: NormalizedPlace[],
  prefs: TripPrefs,
  options: BuildOptions = {},
): Itinerary {
  const dayCount = options.days ?? 3
  const template = DAY_TEMPLATES[prefs.pace ?? DEFAULT_PACE]
  const sightSlots = countSightSlots(template)
  const ranked = rankPlaces(places, prefs)

  // Anchor the whole trip on one base city: the caller's pick when given, else the
  // top-ranked place's city. Everything after this only ever sees that one city.
  const city = options.city ?? ranked[0]?.city ?? ''
  // Keep scheduler and edit tools behind the same deterministic eligibility gate.
  const candidates = ranked.filter(
    (place) =>
      isAutoSchedulable(place) &&
      isPlaceEligibleForTrip(place, places, city, options.tripDates ?? []),
  )

  const sights = candidates.filter((place) => !isMeal(place))
  const meals = candidates.filter(isMeal)

  const used = new Set<string>()
  const days: ItineraryDay[] = []
  const dates = options.tripDates ?? []

  for (let day = 1; day <= dayCount; day++) {
    const date = dates[day - 1] ?? null
    const daySights = selectDaySights(sights, used, sightSlots, date)
    if (daySights.length === 0) break // ran out of places
    days.push(buildDay(day, template, daySights, meals, used, date))
  }

  return { city, days }
}

/**
 * A short human label for a day, derived from where its stops cluster: the most common
 * neighbourhood among the day's places, falling back to the city. Pure — used for calendar
 * and day headings so the UI has a meaningful theme without hardcoded copy.
 */
export function dayTheme(day: ItineraryDay, fallback: string): string {
  const counts = new Map<string, number>()
  for (const { place } of day.stops) {
    if (place.neighborhood) counts.set(place.neighborhood, (counts.get(place.neighborhood) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [neighborhood, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      best = neighborhood
    }
  }
  return best ?? fallback
}
