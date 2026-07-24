import { describe, expect, it } from 'vitest'
import { estimateTravel, haversineMeters } from './directions'

describe('haversineMeters', () => {
  it('returns ~0 for identical points', () => {
    const point = { latitude: 41.8902, longitude: 12.4922 }
    expect(haversineMeters(point, point)).toBeLessThan(0.01)
  })

  it('estimates Colosseum → Trastevere at roughly 1.8 km', () => {
    const colosseum = { latitude: 41.8902, longitude: 12.4922 }
    const trastevere = { latitude: 41.8893, longitude: 12.4706 }
    const meters = haversineMeters(colosseum, trastevere)
    expect(meters).toBeGreaterThan(1600)
    expect(meters).toBeLessThan(2000)
  })
})

describe('estimateTravel', () => {
  const from = { latitude: 41.8902, longitude: 12.4922 }
  const to = { latitude: 41.8893, longitude: 12.4706 }

  it('returns a walking estimate longer than the straight-line distance', () => {
    const estimate = estimateTravel(from, to)

    expect(estimate.durationSeconds).toBeGreaterThan(0)
    expect(estimate.distanceMeters).toBeGreaterThan(estimate.straightLineMeters)
    expect(estimate.straightLineMeters).toBe(haversineMeters(from, to))
  })
})
