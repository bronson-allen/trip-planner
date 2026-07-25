import { describe, expect, it } from 'vitest'
import { PLACES } from '../../src/data/places'
import { defaultTripPlan } from '../../src/data/tripPlan'
import { haversineMeters } from '../../src/lib/geo/directions'
import { isMeal } from '../../src/lib/trip/itinerary'
import { initTripState, resolveTrip } from '../../src/lib/trip/tripState'
import {
  addStop,
  explainStop,
  nearbyPlaces,
  rebalanceDay,
  removeStop,
  reorderStop,
  searchPlaces,
  swapStop,
} from '../../src/lib/trip/tools'

function stateFixture() {
  return initTripState(defaultTripPlan())
}

describe('trip tools', () => {
  it('searches only eligible unused dataset places', () => {
    const state = stateFixture()
    const result = searchPlaces(state, PLACES, { maxPrice: 2, limit: 5 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const used = new Set(state.days.flatMap((day) => day.stops.map((stop) => stop.placeId)))
    expect(result.value.length).toBeGreaterThan(0)
    expect(result.value.every((place) => !used.has(place.id))).toBe(true)
    expect(result.value.every((place) => PLACES.some((datasetPlace) => datasetPlace.id === place.id))).toBe(true)
  })

  it('supports matching any of several requested place types', () => {
    const result = searchPlaces(stateFixture(), PLACES, {
      types: ['restaurant', 'cafe'],
      limit: 10,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.every((place) => ['restaurant', 'cafe'].includes(place.type))).toBe(true)
  })

  it('explains an existing stop and rejects unknown ids', () => {
    const state = stateFixture()
    const placeId = state.days[0].stops[0].placeId

    expect(explainStop(state, PLACES, placeId).ok).toBe(true)
    expect(explainStop(state, PLACES, 'invented-id')).toEqual({
      ok: false,
      error: { code: 'STOP_NOT_FOUND', message: 'That place is not in this itinerary.' },
    })
  })

  it('finds nearby unused places from a real stop', () => {
    const state = stateFixture()
    const placeId = state.days[0].stops[0].placeId
    const result = nearbyPlaces(state, PLACES, placeId, 5)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.every((place) => place.distanceMeters <= 5_000)).toBe(true)
  })

  it('adds, removes, swaps, and reorders without mutating its input', () => {
    const state = stateFixture()
    const original = structuredClone(state)
    const candidates = searchPlaces(state, PLACES, { limit: 2 })
    expect(candidates.ok).toBe(true)
    if (!candidates.ok) return

    const added = addStop(state, PLACES, { placeId: candidates.value[0].id, day: 1 })
    expect(added.ok).toBe(true)
    expect(state).toEqual(original)
    if (!added.ok) return

    const removed = removeStop(added.value.tripState, PLACES, candidates.value[0].id)
    expect(removed.ok).toBe(true)

    const currentId = state.days[0].stops[0].placeId
    const swapped = swapStop(state, PLACES, {
      placeId: currentId,
      replacementPlaceId: candidates.value[1].id,
    })
    expect(swapped.ok).toBe(true)
    if (!swapped.ok) return

    const reordered = reorderStop(swapped.value.tripState, PLACES, {
      placeId: candidates.value[1].id,
      toIndex: 1,
    })
    expect(reordered.ok).toBe(true)
    if (!reordered.ok) return
    expect(reordered.value.tripState.days[0].stops.map((stop) => stop.slot)).toEqual(
      swapped.value.tripState.days[0].stops.map((stop) => stop.slot),
    )
  })

  it('rejects duplicates and hallucinated ids with structured errors', () => {
    const state = stateFixture()
    const existingId = state.days[0].stops[0].placeId

    expect(addStop(state, PLACES, { placeId: existingId, day: 2 })).toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_STOP' },
    })
    expect(addStop(state, PLACES, { placeId: 'invented-id', day: 1 })).toMatchObject({
      ok: false,
      error: { code: 'PLACE_NOT_FOUND' },
    })
  })

  it('can lighten a day or move its lowest-value sight to another day', () => {
    const state = stateFixture()
    const lighter = rebalanceDay(state, PLACES, { day: 1, direction: 'lighter' })
    const moved = rebalanceDay(state, PLACES, {
      day: 1,
      direction: 'lighter',
      targetDay: 3,
    })

    expect(lighter.ok).toBe(true)
    expect(moved.ok).toBe(true)
    if (!lighter.ok || !moved.ok) return
    expect(lighter.value.tripState.days[0].stops).toHaveLength(state.days[0].stops.length - 1)
    expect(moved.value.tripState.days[2].stops).toHaveLength(state.days[2].stops.length + 1)
  })

  it('resolves slot collisions when a day already has that label', () => {
    const state = stateFixture()
    const used = new Set(state.days.flatMap((day) => day.stops.map((stop) => stop.placeId)))
    const candidate = PLACES.find(
      (place) =>
        place.city === state.city &&
        !used.has(place.id) &&
        !['restaurant', 'cafe'].includes(place.type),
    )
    expect(candidate).toBeDefined()
    if (!candidate) return

    const added = addStop(state, PLACES, {
      placeId: candidate.id,
      day: 1,
      slot: 'morning',
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return

    const morningCount = added.value.tripState.days[0].stops.filter(
      (stop) => stop.slot === 'morning',
    ).length
    expect(morningCount).toBeLessThanOrEqual(1)

    const moved = rebalanceDay(added.value.tripState, PLACES, {
      day: 1,
      direction: 'lighter',
      targetDay: 3,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return

    const day3Slots = moved.value.tripState.days[2].stops.map((stop) => stop.slot)
    expect(day3Slots.filter((slot) => slot === 'morning').length).toBeLessThanOrEqual(1)
  })

  it('makes a day fuller with a stop that does not explode the walking distance', () => {
    // Taking the globally best unused place used to drop a stop 4–7 km from every existing
    // day-3 stop. fuller now prefers the best-scoring candidate whose added walking stays
    // under the day-cost budget (with a cheapest-fallback when every option is expensive).
    const state = initTripState({ ...defaultTripPlan(), city: 'Rome', startDate: '2026-08-03' })
    const before = resolveTrip(state).find((day) => day.day === 3)
    expect(before).toBeDefined()
    if (!before) return

    const walk = (stops: typeof before.stops) =>
      stops.reduce((sum, stop) => sum + (stop.travelFromPrev?.distanceMeters ?? 0), 0)

    const result = rebalanceDay(state, PLACES, { day: 3, direction: 'fuller' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const after = resolveTrip(result.value.tripState).find((day) => day.day === 3)
    expect(after).toBeDefined()
    if (!after) return

    const added = after.stops.find(
      (stop) => !before.stops.some((existing) => existing.place.id === stop.place.id),
    )
    expect(added).toBeDefined()
    if (!added) return

    const nearestExisting = Math.min(
      ...before.stops.map((stop) => haversineMeters(stop.place, added.place)),
    )
    expect(nearestExisting).toBeLessThan(3_000)
    expect(walk(after.stops) - walk(before.stops)).toBeLessThan(4_000)
  })

  it('re-slots a museum out of dinner when swapStop crosses meal-ness', () => {
    const state = initTripState({ ...defaultTripPlan(), city: 'Rome', startDate: '2026-08-03' })
    const dinner = resolveTrip(state)
      .flatMap((day) => day.stops.map((stop) => ({ day: day.day, stop })))
      .find((entry) => entry.stop.slot === 'dinner')
    expect(dinner).toBeDefined()
    if (!dinner) return

    const museum = searchPlaces(state, PLACES, { types: ['museum'], limit: 1 })
    expect(museum.ok).toBe(true)
    if (!museum.ok || !museum.value[0]) return

    const result = swapStop(state, PLACES, {
      placeId: dinner.stop.place.id,
      replacementPlaceId: museum.value[0].id,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const day = resolveTrip(result.value.tripState).find((entry) => entry.day === dinner.day)
    expect(day).toBeDefined()
    if (!day) return

    const replaced = day.stops.find((stop) => stop.place.id === museum.value[0].id)
    expect(replaced).toBeDefined()
    expect(replaced?.slot).not.toBe('dinner')
    expect(isMeal(replaced!.place)).toBe(false)
    expect(day.stops.find((stop) => stop.slot === 'dinner')).toBeUndefined()
  })

  it('keeps the slot on a like-for-like meal swap', () => {
    const state = initTripState({ ...defaultTripPlan(), city: 'Rome', startDate: '2026-08-03' })
    const lunch = resolveTrip(state)
      .flatMap((day) => day.stops.map((stop) => ({ day: day.day, stop })))
      .find((entry) => entry.stop.slot === 'lunch')
    expect(lunch).toBeDefined()
    if (!lunch) return

    const restaurant = searchPlaces(state, PLACES, { types: ['restaurant'], limit: 1 })
    expect(restaurant.ok).toBe(true)
    if (!restaurant.ok || !restaurant.value[0]) return

    const result = swapStop(state, PLACES, {
      placeId: lunch.stop.place.id,
      replacementPlaceId: restaurant.value[0].id,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const replaced = resolveTrip(result.value.tripState)
      .find((day) => day.day === lunch.day)
      ?.stops.find((stop) => stop.place.id === restaurant.value[0].id)
    expect(replaced?.slot).toBe('lunch')
  })
})
