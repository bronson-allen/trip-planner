import { isPlannableCity } from '../../data/cities'
import { haversineMeters } from '../geo/directions'
import { cityCenter, isPlaceEligibleForTrip, MAX_CITY_RADIUS_KM } from '../trip/itinerary'
import type { NormalizedPlace } from './normalize'
import { priceLevel, rankPlaces } from './score'
import { TAG_TAXONOMY, tagMeta, type TagAxis } from './tags'
import { tripDates, usedIds } from '../trip/tools'
import type { TripState } from '../trip/tripState'

/**
 * Explore-aside view model — the only surface that shows the whole Italy dataset, not just the
 * chosen itinerary or base city. Filters and ranking still use the same preference scorer and
 * normalized place fields as everywhere else; the raw JSON is never read.
 */

export type ExploreFilters = {
  query: string
  tag: string | null
  type: string | null
  /** 1-4, matching the dataset's € levels; null means no cap. */
  maxPrice: number | null
}

export const NO_EXPLORE_FILTERS: ExploreFilters = {
  query: '',
  tag: null,
  type: null,
  maxPrice: null,
}

/**
 * Why the trip cannot schedule a place the browse surface still shows.
 *
 * - `other-city` — a different city entirely. Reachable only by planning a trip there.
 * - `day-trip`   — close enough to the base city to be a genuine day trip (inside the same radius
 *                  the scheduler uses), but still not schedulable: see `blockedPlace`.
 * - `unavailable` — in the base city, yet closed on the trip dates or outside its travel radius.
 */
export type ExploreBlock = 'other-city' | 'day-trip' | 'unavailable'

/** A place the browse surface shows but the itinerary can't take, with the reason why. */
export type BlockedPlace = {
  place: NormalizedPlace
  block: ExploreBlock
  /** Straight-line km from the base city centre. Only set for `day-trip`. */
  distanceKm?: number
}

/**
 * The single classifier for "why can't I add this?", shared by the Explore list and the place
 * detail pane so the two can never explain the same place differently. Returns null when the
 * place is addable — i.e. exactly when `addStop` would accept it.
 *
 * The `day-trip` case is the honest edge: a handful of towns (Burano, Padua, Como) sit inside the
 * scheduler's own city radius, so geography says "reachable" while the city gate says no. They
 * stay blocked because travel time here is a walking estimate — a lagoon crossing or a regional
 * train has no representation — but they're labeled for what they are rather than lumped in with
 * places 100km away.
 */
export function blockedPlace(
  place: NormalizedPlace,
  places: NormalizedPlace[],
  city: string,
  dates: Date[],
): BlockedPlace | null {
  if (isPlaceEligibleForTrip(place, places, city, dates)) return null
  if (place.city === city) return { place, block: 'unavailable' }
  // A city that can anchor its own trip is better served by the "plan a trip there" path.
  if (isPlannableCity(place.city)) return { place, block: 'other-city' }

  const inCity = places.filter((candidate) => candidate.city === city)
  if (inCity.length > 0) {
    const km = haversineMeters(cityCenter(inCity), place) / 1000
    if (km <= MAX_CITY_RADIUS_KM) {
      return { place, block: 'day-trip', distanceKm: Math.round(km) }
    }
  }
  return { place, block: 'other-city' }
}

export type ExploreLists = {
  /** Best-ranked addable matches, surfaced above the rest as curated picks. */
  topPicks: NormalizedPlace[]
  /** Everything else that matched, is addable, and is not already scheduled. */
  results: NormalizedPlace[]
  /** Matches already in the itinerary — shown as satisfied instead of silently dropped. */
  inTrip: Array<{ place: NormalizedPlace; day: number }>
  /**
   * Matches this trip cannot schedule. Still browsable — the catalog is Italy-wide — but never
   * offered with an add control, so the list can't invite an action `addStop` would reject.
   */
  elsewhere: BlockedPlace[]
  /** Total matches, including scheduled and unschedulable ones. */
  total: number
}

/** Axes that describe what a place *is like* — the useful ones to filter an explore list by. */
const FILTERABLE_TAG_AXES: ReadonlySet<TagAxis> = new Set([
  'interest',
  'aesthetic',
  'vibe',
  'authenticity',
])

function matchesQuery(place: NormalizedPlace, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    place.name,
    place.city,
    place.type.replaceAll('_', ' '),
    place.neighborhood ?? '',
    ...place.tags,
  ].some((field) => field.toLowerCase().includes(needle))
}

/** Which day of the trip each scheduled place sits on. */
function tripDayByPlaceId(state: TripState): Map<string, number> {
  return new Map(
    state.days.flatMap((day) => day.stops.map((stop) => [stop.placeId, day.day] as const)),
  )
}

function matchesFilters(place: NormalizedPlace, filters: ExploreFilters): boolean {
  if (filters.type && place.type !== filters.type) return false
  if (filters.tag && !place.tags.includes(filters.tag)) return false
  if (filters.maxPrice !== null && priceLevel(place.priceRange) > filters.maxPrice) return false
  if (!matchesQuery(place, filters.query)) return false
  return true
}

/**
 * Splits the Italy-wide catalog into curated picks, remaining results, already-scheduled matches,
 * and matches this trip can't schedule.
 *
 * Browsing stays Italy-wide — seeing the whole catalog is the point of this surface — but the
 * addable/`elsewhere` split runs the *same* `isPlaceEligibleForTrip` gate `addStop` enforces. So
 * the list can only offer an add the engine will accept, and an out-of-city place is explained up
 * front instead of failing after the click.
 */
export function exploreLists(
  state: TripState,
  places: NormalizedPlace[],
  filters: ExploreFilters,
  topPickCount = 2,
): ExploreLists {
  const scheduled = usedIds(state)
  const dayByPlaceId = tripDayByPlaceId(state)
  const dates = tripDates(state)

  const matches = rankPlaces(
    places.filter((place) => matchesFilters(place, filters)),
    state.prefs,
  )

  const addable: NormalizedPlace[] = []
  const elsewhere: BlockedPlace[] = []
  for (const place of matches) {
    if (scheduled.has(place.id)) continue
    const blocked = blockedPlace(place, places, state.city, dates)
    if (blocked) elsewhere.push(blocked)
    else addable.push(place)
  }

  return {
    topPicks: addable.slice(0, topPickCount),
    results: addable.slice(topPickCount),
    inTrip: matches
      .filter((place) => scheduled.has(place.id))
      .map((place) => ({ place, day: dayByPlaceId.get(place.id) ?? 0 })),
    elsewhere,
    total: matches.length,
  }
}

/** Every place type in the catalog, so the filter only offers real options. */
export function catalogTypes(places: NormalizedPlace[]): string[] {
  return [...new Set(places.map((place) => place.type))].sort()
}

/** Filterable tags present in the catalog, in the taxonomy's curated order. */
export function catalogTags(places: NormalizedPlace[]): string[] {
  const present = new Set(places.flatMap((place) => place.tags))
  return Object.keys(TAG_TAXONOMY).filter(
    (tag) => present.has(tag) && FILTERABLE_TAG_AXES.has(tagMeta(tag).axis),
  )
}

/** "hidden-gem" -> "Hidden gem" */
export function formatTag(tag: string): string {
  return tag.replaceAll('-', ' ').replace(/^\w/, (character) => character.toUpperCase())
}
