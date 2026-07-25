import { describe, expect, it } from 'vitest'
import { PLACES } from '../../src/data/places'
import { defaultTripPlan } from '../../src/data/tripPlan'
import { exploreLists, NO_EXPLORE_FILTERS } from '../../src/lib/places/explore'
import { MAX_CITY_RADIUS_KM } from '../../src/lib/trip/itinerary'
import { addStop } from '../../src/lib/trip/tools'
import { initTripState } from '../../src/lib/trip/tripState'

const state = initTripState({ ...defaultTripPlan(), city: 'Rome' })
const lists = exploreLists(state, PLACES, NO_EXPLORE_FILTERS)

describe('explore lists', () => {
  it('still browses the whole Italy catalog, not just the base city', () => {
    expect(lists.total).toBe(PLACES.length)
    expect(lists.elsewhere.some(({ place }) => place.city !== 'Rome')).toBe(true)
  })

  it('only offers places addStop will actually accept', () => {
    // The contract this surface exists to keep: every addable row must survive the engine's gate,
    // so the list can never invite an action that fails after the click.
    for (const place of [...lists.topPicks, ...lists.results]) {
      expect(addStop(state, PLACES, { placeId: place.id, day: 1 }).ok).toBe(true)
    }
  })

  it('blocks every place the engine would reject, with a reason', () => {
    for (const { place, block } of lists.elsewhere) {
      expect(addStop(state, PLACES, { placeId: place.id, day: 1 }).ok).toBe(false)
      expect(block).toBe(place.city === 'Rome' ? 'unavailable' : 'other-city')
    }
  })

  it('labels towns inside the base city radius as day trips, not distant cities', () => {
    // Burano (~9km) and Padua (~34km) fall inside MAX_CITY_RADIUS_KM of Venice: geography says
    // reachable, the city gate still says no. They should read differently from Parma at 116km.
    const venice = initTripState({ ...defaultTripPlan(), city: 'Venice' })
    const blocked = exploreLists(venice, PLACES, NO_EXPLORE_FILTERS).elsewhere
    const byCity = new Map(blocked.map((entry) => [entry.place.city, entry]))

    expect(byCity.get('Burano')?.block).toBe('day-trip')
    expect(byCity.get('Burano')?.distanceKm).toBeLessThanOrEqual(MAX_CITY_RADIUS_KM)
    expect(byCity.get('Padua')?.block).toBe('day-trip')
    expect(byCity.get('Parma')?.block).toBe('other-city')
    // Another base city keeps the "plan a trip there" path rather than becoming a day trip.
    expect(byCity.get('Rome')?.block).toBe('other-city')
    // Day trips stay unschedulable — the label explains the gate, it doesn't open it.
    for (const entry of blocked.filter((item) => item.block === 'day-trip')) {
      expect(addStop(venice, PLACES, { placeId: entry.place.id, day: 1 }).ok).toBe(false)
    }
  })

  it('partitions every match exactly once', () => {
    const seen = [
      ...lists.topPicks,
      ...lists.results,
      ...lists.inTrip.map(({ place }) => place),
      ...lists.elsewhere.map(({ place }) => place),
    ].map((place) => place.id)

    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toHaveLength(lists.total)
  })
})
