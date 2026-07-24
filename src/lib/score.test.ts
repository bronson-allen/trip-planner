import { describe, expect, it } from 'vitest'
import rawPlaces from '../data/italy.json'
import { normalizePlace } from './normalize'
import { rankPlaces, scorePlace, type TripPrefs } from './score'

const normalized = rawPlaces.map(normalizePlace)

describe('scorePlace rewards preference overlap', () => {
  it('scores a place higher when its tags match the picked preferences', () => {
    const place = normalized.find((p) => p.tags.includes('food'))!
    const withMatch = scorePlace(place, { interests: ['food'] }).preference
    const withoutMatch = scorePlace(place, { interests: [] }).preference
    expect(withMatch).toBeGreaterThan(withoutMatch)
  })
})

describe('authenticity stance flips the sign', () => {
  const touristy = normalized.find((p) => p.tags.includes('tourist-heavy'))!

  it('penalizes a tourist trap when the user wants authentic', () => {
    expect(scorePlace(touristy, { interests: [], authenticityPref: 2 }).authenticity).toBeLessThan(0)
  })

  it('rewards the same place when the user wants the famous must-sees', () => {
    expect(scorePlace(touristy, { interests: [], authenticityPref: -2 }).authenticity).toBeGreaterThan(0)
  })

  it('is neutral when the user has no opinion', () => {
    expect(scorePlace(touristy, { interests: [] }).authenticity).toBe(0)
  })
})

describe('budget fit penalizes price mismatch', () => {
  it('penalizes an expensive place for a budget traveler', () => {
    const splurgey = normalized.find((p) => p.priceRange.length >= 3)!
    const budgetFit = scorePlace(splurgey, { interests: [], budget: 'budget' }).budget
    expect(budgetFit).toBeLessThan(0)
  })
})

describe('the rating trap sorts to the bottom', () => {
  it('ranks Hard Rock Cafe (2.1★, tourist-heavy) below the field for an authenticity-seeker', () => {
    const prefs: TripPrefs = { interests: ['food'], authenticityPref: 2 }
    const ranked = rankPlaces(normalized, prefs)
    const hardRockIndex = ranked.findIndex((p) => p.name.toLowerCase().includes('hard rock'))
    // deep in the back half of 103 places, not near the top
    expect(hardRockIndex).toBeGreaterThan(ranked.length / 2)
  })
})
