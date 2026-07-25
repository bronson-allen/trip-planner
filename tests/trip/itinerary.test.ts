import { describe, expect, it } from 'vitest'
import rawPlaces from '../../src/data/italy.json'
import { buildItinerary } from '../../src/lib/trip/itinerary'
import { normalizePlace } from '../../src/lib/places/normalize'
import type { TripPrefs } from '../../src/lib/places/score'

const normalized = rawPlaces.map(normalizePlace)
const prefs: TripPrefs = { interests: ['food', 'historic', 'art'], authenticityPref: 1 }

describe('buildItinerary produces a correct plan', () => {
  const plan = buildItinerary(normalized, prefs)

  it('anchors on a single base city', () => {
    const cities = new Set(plan.days.flatMap((d) => d.stops.map((s) => s.place.city)))
    expect(cities.size).toBe(1)
    expect([...cities][0]).toBe(plan.city)
  })

  it('builds the requested number of days', () => {
    expect(plan.days).toHaveLength(3)
  })

  it('never repeats a place across the whole trip (dedup by id)', () => {
    const ids = plan.days.flatMap((d) => d.stops.map((s) => s.place.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('puts restaurants/cafes in the lunch and dinner slots', () => {
    for (const day of plan.days) {
      for (const stop of day.stops) {
        const isMealType = stop.place.type === 'restaurant' || stop.place.type === 'cafe'
        if (stop.slot === 'lunch' || stop.slot === 'dinner') {
          expect(isMealType).toBe(true)
        }
      }
    }
  })

  it('orders the day so morning-tagged sights precede evening-tagged ones', () => {
    for (const day of plan.days) {
      const sightStops = day.stops.filter((s) => !['lunch', 'dinner'].includes(s.slot))
      const morningIdx = sightStops.findIndex((s) => s.place.tags.includes('morning'))
      const eveningIdx = sightStops.findIndex((s) => s.place.tags.includes('evening'))
      if (morningIdx !== -1 && eveningIdx !== -1) {
        expect(morningIdx).toBeLessThan(eveningIdx)
      }
    }
  })

  it('reports a walking estimate between consecutive stops, but not before the first', () => {
    for (const day of plan.days) {
      expect(day.stops[0].travelFromPrev).toBeNull()
      for (const stop of day.stops.slice(1)) {
        expect(stop.travelFromPrev?.durationSeconds).toBeGreaterThan(0)
      }
    }
  })

  it('is deterministic — same inputs, same plan', () => {
    const again = buildItinerary(normalized, prefs)
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan))
  })
})

describe('sanity gates keep bad candidates out of the plan', () => {
  const milanPrefs: TripPrefs = { interests: ['market', 'local-favorite'], authenticityPref: 2 }

  it('excludes a geo-outlier: Brera Antique Market never appears in a Milan trip', () => {
    // place_059 claims city Milan but its longitude (11.19) puts it ~156km away.
    const plan = buildItinerary(normalized, milanPrefs, { city: 'Milan' })
    const names = plan.days.flatMap((d) => d.stops.map((s) => s.place.name))
    expect(names).not.toContain('Brera Antique Market')
  })

  it('excludes a place closed for the whole trip window when dates are given', () => {
    // Aperitivo at Ceresio 7 — "Rooftop open May-September only" — should be gone in January.
    const january = [new Date(2026, 0, 8), new Date(2026, 0, 9), new Date(2026, 0, 10)]
    const plan = buildItinerary(normalized, { interests: [] }, { city: 'Milan', tripDates: january })
    const names = plan.days.flatMap((d) => d.stops.map((s) => s.place.name))
    expect(names.some((n) => n.includes('Ceresio 7'))).toBe(false)
  })
})

describe('pace controls how densely each day is packed', () => {
  function day1StopCount(pace: TripPrefs['pace']) {
    return buildItinerary(normalized, { ...prefs, pace }).days[0].stops.length
  }

  it('gives a relaxed day fewer stops than a packed day', () => {
    const relaxed = day1StopCount('relaxed')
    const balanced = day1StopCount('balanced')
    const packed = day1StopCount('packed')
    expect(relaxed).toBeLessThan(balanced)
    expect(balanced).toBeLessThan(packed)
  })

  it('defaults to balanced when pace is unset', () => {
    expect(day1StopCount(undefined)).toBe(day1StopCount('balanced'))
  })

  it('keeps lunch and dinner at every pace', () => {
    for (const pace of ['relaxed', 'balanced', 'packed'] as const) {
      const slots = buildItinerary(normalized, { ...prefs, pace }).days[0].stops.map((s) => s.slot)
      expect(slots).toContain('lunch')
      expect(slots).toContain('dinner')
    }
  })
})
