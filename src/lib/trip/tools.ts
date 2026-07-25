import { buildTripDays } from '../../data/tripPlan'
import type { NormalizedPlace } from '../places/normalize'
import { parseIsoDate } from '../dates'
import { estimateTravel, haversineMeters, type TravelEstimate } from '../geo/directions'
import {
  daypartRank,
  isMeal,
  isPlaceEligibleForTrip,
  type SlotKind,
} from './itinerary'
import { priceLevel, rankPlaces, scorePlace, type ScoreBreakdown } from '../places/score'
import { tagMeta } from '../places/tags'
import type { PlannedStop, TripState } from './tripState'

export type ToolErrorCode =
  | 'PLACE_NOT_FOUND'
  | 'STOP_NOT_FOUND'
  | 'DAY_NOT_FOUND'
  | 'DUPLICATE_STOP'
  | 'INELIGIBLE_PLACE'
  | 'INVALID_ARGUMENT'
  | 'NO_CANDIDATES'

export type ToolError = {
  code: ToolErrorCode
  message: string
}

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ToolError }

export type PlaceCandidate = {
  id: string
  name: string
  type: string
  neighborhood: string | null
  priceRange: string
  rating: number
  tags: string[]
  distanceMeters?: number
  score: number
}

export type SearchPlacesArgs = {
  tags?: string[]
  maxPrice?: number
  /** Match any of these exact place types. */
  types?: string[]
  nearPlaceId?: string
  radiusKm?: number
  limit?: number
}

export type ExplainStopResult = {
  placeId: string
  placeName: string
  day: number
  slot: SlotKind
  scoreBreakdown: ScoreBreakdown
  daypartReason: string
  travelFromPrev: (TravelEstimate & { fromPlaceName: string }) | null
}

export type NearbyPlace = PlaceCandidate & {
  distanceMeters: number
}

export type MutationResult = {
  tripState: TripState
  summary: string
}

function success<T>(value: T): ToolResult<T> {
  return { ok: true, value }
}

function failure(code: ToolErrorCode, message: string): ToolResult<never> {
  return { ok: false, error: { code, message } }
}

/** The real calendar dates of the trip — the availability gate's input. */
export function tripDates(state: TripState): Date[] {
  return buildTripDays(state.startDate).map((day) => parseIsoDate(day.iso))
}

export function usedIds(state: TripState): Set<string> {
  return new Set(state.days.flatMap((day) => day.stops.map((stop) => stop.placeId)))
}

function findStop(state: TripState, placeId: string) {
  for (const day of state.days) {
    const index = day.stops.findIndex((stop) => stop.placeId === placeId)
    if (index >= 0) return { day, index, stop: day.stops[index] }
  }
  return null
}

function findPlace(places: NormalizedPlace[], placeId: string): NormalizedPlace | null {
  return places.find((place) => place.id === placeId) ?? null
}

function validateNewPlace(
  state: TripState,
  places: NormalizedPlace[],
  placeId: string,
  replacedPlaceId?: string,
): ToolResult<NormalizedPlace> {
  const place = findPlace(places, placeId)
  if (!place) return failure('PLACE_NOT_FOUND', `No dataset place has id "${placeId}".`)

  if (placeId !== replacedPlaceId && usedIds(state).has(placeId)) {
    return failure('DUPLICATE_STOP', `${place.name} is already in the itinerary.`)
  }

  if (!isPlaceEligibleForTrip(place, places, state.city, tripDates(state))) {
    return failure(
      'INELIGIBLE_PLACE',
      `${place.name} is outside the trip's city, travel radius, or known availability.`,
    )
  }

  return success(place)
}

function inferredSlot(place: NormalizedPlace): SlotKind {
  if (isMeal(place)) return place.type === 'cafe' ? 'lunch' : 'dinner'
  const rank = daypartRank(place)
  if (rank === 0) return 'morning'
  if (rank === 2) return 'evening'
  return 'afternoon'
}

const SIGHT_SLOTS: SlotKind[] = ['morning', 'afternoon', 'evening']

/** Pick a slot that fits the place without duplicating an occupied label on this day. */
function resolveSlotForDay(
  existingStops: PlannedStop[],
  place: NormalizedPlace,
  preferredSlot?: SlotKind,
): SlotKind {
  const used = new Set(existingStops.map((stop) => stop.slot))
  const candidate = preferredSlot ?? inferredSlot(place)
  if (!used.has(candidate)) return candidate

  if (isMeal(place)) {
    const mealSlot = place.type === 'cafe' ? 'lunch' : 'dinner'
    const alternate = mealSlot === 'lunch' ? 'dinner' : 'lunch'
    if (!used.has(mealSlot)) return mealSlot
    if (!used.has(alternate)) return alternate
    return mealSlot
  }

  const startIndex = Math.max(0, SIGHT_SLOTS.indexOf(candidate))
  for (let offset = 0; offset < SIGHT_SLOTS.length; offset += 1) {
    const slot = SIGHT_SLOTS[(startIndex + offset) % SIGHT_SLOTS.length]
    if (!used.has(slot)) return slot
  }

  // Packed pace may carry two afternoon sights; afternoon is the only intentional duplicate.
  return 'afternoon'
}

const SLOT_ORDER: Record<SlotKind, number> = {
  morning: 0,
  lunch: 1,
  afternoon: 2,
  evening: 3,
  dinner: 4,
}

function insertStopBySlot(
  stops: PlannedStop[],
  stop: PlannedStop,
  places: NormalizedPlace[],
  state: TripState,
): PlannedStop[] {
  const byId = new Map(places.map((place) => [place.id, place]))
  return [...stops, stop].sort((left, right) => {
    const slotDiff = SLOT_ORDER[left.slot] - SLOT_ORDER[right.slot]
    if (slotDiff !== 0) return slotDiff
    const leftPlace = byId.get(left.placeId)
    const rightPlace = byId.get(right.placeId)
    if (!leftPlace || !rightPlace) return 0
    return scorePlace(rightPlace, state.prefs).total - scorePlace(leftPlace, state.prefs).total
  })
}

/**
 * Every unused, eligible place matching the supplied constraints, best-first and uncapped.
 * `searchPlaces` wraps this for the assistant (validated args, capped payload); the Explore
 * UI consumes it directly so the manual filters and the tool can never disagree.
 */
export function filterPlaces(
  state: TripState,
  places: NormalizedPlace[],
  args: SearchPlacesArgs,
): NormalizedPlace[] {
  const anchor = args.nearPlaceId ? findPlace(places, args.nearPlaceId) : null
  const used = usedIds(state)
  const dates = tripDates(state)
  const radiusMeters = (args.radiusKm ?? 8) * 1000

  const eligible = places.filter((place) => {
    if (used.has(place.id)) return false
    if (!isPlaceEligibleForTrip(place, places, state.city, dates)) return false
    if (args.types?.length && !args.types.includes(place.type)) return false
    if (args.tags?.length && !args.tags.every((tag) => place.tags.includes(tag))) return false
    if (args.maxPrice !== undefined && priceLevel(place.priceRange) > args.maxPrice) return false
    if (anchor && haversineMeters(anchor, place) > radiusMeters) return false
    return true
  })

  return rankPlaces(eligible, state.prefs)
}

/** Returns real, unused candidates satisfying every supplied constraint, best-first. */
export function searchPlaces(
  state: TripState,
  places: NormalizedPlace[],
  args: SearchPlacesArgs,
): ToolResult<PlaceCandidate[]> {
  const anchor = args.nearPlaceId ? findPlace(places, args.nearPlaceId) : null
  if (args.nearPlaceId && (!anchor || !usedIds(state).has(args.nearPlaceId))) {
    return failure('STOP_NOT_FOUND', 'The nearby-search anchor must be a stop in this itinerary.')
  }
  if (args.maxPrice !== undefined && (args.maxPrice < 1 || args.maxPrice > 4)) {
    return failure('INVALID_ARGUMENT', 'maxPrice must be between 1 and 4.')
  }

  const candidates = filterPlaces(state, places, args)
    .slice(0, Math.min(args.limit ?? 5, 10))
    .map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      neighborhood: place.neighborhood,
      priceRange: place.priceRange,
      rating: place.rating,
      tags: place.tags,
      score: scorePlace(place, state.prefs).total,
      ...(anchor ? { distanceMeters: Math.round(haversineMeters(anchor, place)) } : {}),
    }))

  return success(candidates)
}

export function explainStop(
  state: TripState,
  places: NormalizedPlace[],
  placeId: string,
): ToolResult<ExplainStopResult> {
  const found = findStop(state, placeId)
  const place = findPlace(places, placeId)
  if (!found || !place) return failure('STOP_NOT_FOUND', 'That place is not in this itinerary.')

  const previousStop = found.day.stops[found.index - 1]
  const previousPlace = previousStop ? findPlace(places, previousStop.placeId) : null
  const daypartTags = place.tags
    .filter((tag) => tagMeta(tag).daypart)
    .map((tag) => tagMeta(tag).daypart)

  return success({
    placeId,
    placeName: place.name,
    day: found.day.day,
    slot: found.stop.slot,
    scoreBreakdown: scorePlace(place, state.prefs),
    daypartReason: daypartTags.length
      ? `Its ${daypartTags.join(' and ')} tag supports this time of day.`
      : `Its slot fits the day's geographic and meal rhythm.`,
    travelFromPrev: previousPlace
      ? { ...estimateTravel(previousPlace, place), fromPlaceName: previousPlace.name }
      : null,
  })
}

export function nearbyPlaces(
  state: TripState,
  places: NormalizedPlace[],
  placeId: string,
  radiusKm = 2,
): ToolResult<NearbyPlace[]> {
  const anchor = findPlace(places, placeId)
  if (!anchor || !usedIds(state).has(placeId)) {
    return failure('STOP_NOT_FOUND', 'The nearby-search anchor is not in this itinerary.')
  }
  if (radiusKm <= 0 || radiusKm > 20) {
    return failure('INVALID_ARGUMENT', 'radiusKm must be greater than 0 and no more than 20.')
  }

  const result = searchPlaces(state, places, { nearPlaceId: placeId, radiusKm, limit: 8 })
  if (!result.ok) return result
  return success(
    result.value.map((candidate) => ({
      ...candidate,
      distanceMeters: candidate.distanceMeters ?? 0,
    })),
  )
}

export function addStop(
  state: TripState,
  places: NormalizedPlace[],
  args: { placeId: string; day: number; slot?: SlotKind },
): ToolResult<MutationResult> {
  const day = state.days.find((candidate) => candidate.day === args.day)
  if (!day) return failure('DAY_NOT_FOUND', `Day ${args.day} is not in this itinerary.`)

  const validation = validateNewPlace(state, places, args.placeId)
  if (!validation.ok) return validation
  const place = validation.value
  const stop = {
    placeId: place.id,
    slot: resolveSlotForDay(day.stops, place, args.slot),
  }
  const next = {
    ...state,
    days: state.days.map((entry) =>
      entry.day === args.day
        ? { ...entry, stops: insertStopBySlot(entry.stops, stop, places, state) }
        : entry,
    ),
  }
  return success({ tripState: next, summary: `Added ${place.name} to day ${args.day}.` })
}

export function removeStop(
  state: TripState,
  places: NormalizedPlace[],
  placeId: string,
): ToolResult<MutationResult> {
  const found = findStop(state, placeId)
  const place = findPlace(places, placeId)
  if (!found || !place) return failure('STOP_NOT_FOUND', 'That place is not in this itinerary.')

  const next = {
    ...state,
    days: state.days.map((day) => ({
      ...day,
      stops: day.stops.filter((stop) => stop.placeId !== placeId),
    })),
  }
  return success({ tripState: next, summary: `Removed ${place.name} from day ${found.day.day}.` })
}

export function swapStop(
  state: TripState,
  places: NormalizedPlace[],
  args: { placeId: string; replacementPlaceId: string },
): ToolResult<MutationResult> {
  const found = findStop(state, args.placeId)
  const current = findPlace(places, args.placeId)
  if (!found || !current) return failure('STOP_NOT_FOUND', 'The stop to replace is not in this itinerary.')

  const validation = validateNewPlace(state, places, args.replacementPlaceId, args.placeId)
  if (!validation.ok) return validation
  const replacement = validation.value
  const next = {
    ...state,
    days: state.days.map((day) =>
      day.day === found.day.day
        ? {
            ...day,
            stops: day.stops.map((stop) =>
              stop.placeId === args.placeId
                ? { placeId: replacement.id, slot: stop.slot }
                : stop,
            ),
          }
        : day,
    ),
  }
  return success({
    tripState: next,
    summary: `Swapped ${current.name} for ${replacement.name} on day ${found.day.day}.`,
  })
}

export function reorderStop(
  state: TripState,
  places: NormalizedPlace[],
  args: { placeId: string; toIndex: number },
): ToolResult<MutationResult> {
  const found = findStop(state, args.placeId)
  const place = findPlace(places, args.placeId)
  if (!found || !place) return failure('STOP_NOT_FOUND', 'That stop is not in this itinerary.')
  if (args.toIndex < 0 || args.toIndex >= found.day.stops.length) {
    return failure('INVALID_ARGUMENT', 'toIndex is outside that day.')
  }

  // Slots describe chronological positions, not permanent place attributes. Keep the day's
  // existing rhythm attached to positions so a moved stop does not leave "Evening" first.
  const slots = found.day.stops.map((stop) => stop.slot)
  const stops = [...found.day.stops]
  const [moved] = stops.splice(found.index, 1)
  stops.splice(args.toIndex, 0, moved)
  const reorderedStops = stops.map((stop, index) => ({ ...stop, slot: slots[index] }))
  const next = {
    ...state,
    days: state.days.map((day) =>
      day.day === found.day.day ? { ...day, stops: reorderedStops } : day,
    ),
  }
  return success({
    tripState: next,
    summary: `Moved ${place.name} to position ${args.toIndex + 1} on day ${found.day.day}.`,
  })
}

export function rebalanceDay(
  state: TripState,
  places: NormalizedPlace[],
  args: { day: number; direction: 'lighter' | 'fuller'; targetDay?: number },
): ToolResult<MutationResult> {
  const day = state.days.find((entry) => entry.day === args.day)
  if (!day) return failure('DAY_NOT_FOUND', `Day ${args.day} is not in this itinerary.`)

  if (args.direction === 'fuller') {
    const candidates = searchPlaces(state, places, { limit: 1 })
    if (!candidates.ok) return candidates
    const candidate = candidates.value[0]
    if (!candidate) return failure('NO_CANDIDATES', 'No eligible unused places remain.')
    return addStop(state, places, { placeId: candidate.id, day: args.day })
  }

  if (day.stops.length <= 1) {
    return failure('INVALID_ARGUMENT', `Day ${args.day} is already as light as it can be.`)
  }
  const ranked = day.stops
    .map((stop) => ({ stop, place: findPlace(places, stop.placeId) }))
    .filter((entry): entry is { stop: PlannedStop; place: NormalizedPlace } => Boolean(entry.place))
    .sort((left, right) => scorePlace(left.place, state.prefs).total - scorePlace(right.place, state.prefs).total)
  const selected = ranked.find((entry) => !isMeal(entry.place)) ?? ranked[0]
  if (!selected) return failure('STOP_NOT_FOUND', `Day ${args.day} has no resolvable stops.`)

  const removed = removeStop(state, places, selected.place.id)
  if (!removed.ok || args.targetDay === undefined) return removed
  if (args.targetDay === args.day) {
    return failure('INVALID_ARGUMENT', 'targetDay must be different from the day being lightened.')
  }
  const moved = addStop(removed.value.tripState, places, {
    placeId: selected.place.id,
    day: args.targetDay,
    slot: selected.stop.slot,
  })
  if (!moved.ok) return moved
  return success({
    tripState: moved.value.tripState,
    summary: `Moved ${selected.place.name} from day ${args.day} to day ${args.targetDay}.`,
  })
}
