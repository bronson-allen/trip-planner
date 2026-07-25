import { describe, expect, it } from 'vitest'
import { defaultTripPlan } from '../../src/data/tripPlan'
import { initTripState, resolveTrip } from '../../src/lib/trip/tripState'

describe('trip state', () => {
  it('resolves the light state into the dashboard view with derived travel', () => {
    const plan = defaultTripPlan()
    const state = initTripState(plan)
    const days = resolveTrip(state)

    expect(days.map((day) => day.stops.map((stop) => stop.place.id))).toEqual(
      state.days.map((day) => day.stops.map((stop) => stop.placeId)),
    )
    expect(days[0].stops[0].travelFromPrev).toBeNull()
    expect(days[0].stops[1].travelFromPrev?.distanceMeters).toBeGreaterThan(0)
  })
})
