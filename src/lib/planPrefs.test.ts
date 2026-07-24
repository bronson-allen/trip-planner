import { describe, expect, it } from 'vitest'
import { defaultTripPlan, type TripPlan } from '../data/tripPlan'
import { planToPrefs } from './planPrefs'

function planWith(overrides: Partial<TripPlan>): TripPlan {
  return { ...defaultTripPlan(), ...overrides }
}

describe('planToPrefs maps form state onto engine prefs', () => {
  it('routes interest/aesthetic/vibe chips into interests', () => {
    const prefs = planToPrefs(planWith({ interests: ['Food', 'Scenic', 'Quiet'] }))
    expect(prefs.interests).toEqual(['food', 'scenic', 'quiet'])
    expect(prefs.authenticityPref).toBe(0)
  })

  it('routes authenticity chips into authenticityPref, not interests', () => {
    const prefs = planToPrefs(planWith({ interests: ['Hidden gem', 'Local favorite', 'Food'] }))
    expect(prefs.interests).toEqual(['food'])
    expect(prefs.authenticityPref).toBe(2)
  })

  it('maps the budget symbol to a spend level', () => {
    expect(planToPrefs(planWith({ budget: '€' })).budget).toBe('budget')
    expect(planToPrefs(planWith({ budget: '€€' })).budget).toBe('moderate')
    expect(planToPrefs(planWith({ budget: '€€€€' })).budget).toBe('splurge')
  })

  it('maps the pace label to a scheduler pace', () => {
    expect(planToPrefs(planWith({ pace: 'Relaxed' })).pace).toBe('relaxed')
    expect(planToPrefs(planWith({ pace: 'Balanced' })).pace).toBe('balanced')
    expect(planToPrefs(planWith({ pace: 'Packed' })).pace).toBe('packed')
  })
})
