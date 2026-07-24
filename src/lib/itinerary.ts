import { isClosedForTrip } from './availability'
import { estimateTravel, haversineMeters, type TravelEstimate } from './directions'
import type { NormalizedPlace } from './normalize'
import { rankPlaces, type Pace, type TripPrefs } from './score'
import { tagMeta } from './tags'

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
const MAX_CITY_RADIUS_KM = 40

function isMeal(place: NormalizedPlace): boolean {
  return MEAL_TYPES.has(place.type)
}

/** Chronological rank from the daypart tag: morning first (0), evening last (2), rest mid (1). */
function daypartRank(place: NormalizedPlace): number {
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
function cityCenter(places: NormalizedPlace[]): LatLng {
  return {
    latitude: median(places.map((p) => p.latitude)),
    longitude: median(places.map((p) => p.longitude)),
  }
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
 * Picks one day's worth of sights: a high-scored anchor plus its nearest unused neighbours,
 * so the day stays geographically tight. `ranked` is score-ordered, so `find` yields the best
 * remaining place as the anchor. Marks chosen ids in `used`.
 */
function selectDaySights(
  ranked: NormalizedPlace[],
  used: Set<string>,
  sightSlots: number,
): NormalizedPlace[] {
  const anchor = ranked.find((place) => !used.has(place.id))
  if (!anchor) return []

  const chosen = [anchor]
  used.add(anchor.id)

  while (chosen.length < sightSlots) {
    const pool = ranked.filter((place) => !used.has(place.id))
    const next = nearest(anchor, pool)
    if (!next) break
    used.add(next.id)
    chosen.push(next)
  }
  return chosen
}

/** Assembles one day: sights ordered by daypart, meals slotted in nearest to the day's centre. */
function buildDay(
  dayNumber: number,
  template: ReadonlyArray<Slot>,
  sights: NormalizedPlace[],
  meals: NormalizedPlace[],
  used: Set<string>,
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
      place = nearest(center, meals.filter((meal) => !used.has(meal.id)))
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
  const inCity = ranked.filter((place) => place.city === city)

  // Two sanity gates before scheduling: drop places whose coordinates fall implausibly far
  // from the city centre (bad data), and — when trip dates are known — places closed for the
  // whole trip. Both are exclusions of provably-unusable candidates, never guesses.
  const center = inCity.length ? cityCenter(inCity) : null
  const candidates = inCity.filter((place) => {
    if (center && haversineMeters(center, place) / 1000 > MAX_CITY_RADIUS_KM) return false
    if (options.tripDates && isClosedForTrip(place, options.tripDates)) return false
    return true
  })

  const sights = candidates.filter((place) => !isMeal(place))
  const meals = candidates.filter(isMeal)

  const used = new Set<string>()
  const days: ItineraryDay[] = []

  for (let day = 1; day <= dayCount; day++) {
    const daySights = selectDaySights(sights, used, sightSlots)
    if (daySights.length === 0) break // ran out of places
    days.push(buildDay(day, template, daySights, meals, used))
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
