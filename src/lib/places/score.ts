import type { NormalizedPlace } from './normalize'
import { authenticityScore, matchedPreferences } from './tags'

/**
 * The structured preferences the scorer consumes. Chips fill `interests` / `budget` / `pace`
 * directly (zero AI). The LLM intent-parse call fills the same shape from free text — it
 * proposes preferences, it never picks places. Everything downstream is deterministic.
 */
/** How densely to pack each day. Fewer stops = more relaxed. */
export type Pace = 'relaxed' | 'balanced' | 'packed'

export type TripPrefs = {
  interests: string[]
  /** Desired spend level; compared against each place's priceRange. */
  budget?: 'budget' | 'moderate' | 'splurge'
  /**
   * Where the traveler sits on the authenticity axis, -2..+2. Positive = "find hidden gems,
   * avoid tourist traps"; negative = "I want the famous must-sees"; 0 = no opinion.
   */
  authenticityPref?: number
  /** Day density. Affects how many stops the scheduler places per day; defaults to balanced. */
  pace?: Pace
}

/** Transparent per-signal contribution — surfaced in the UI and the walkthrough, not just summed. */
export type ScoreBreakdown = {
  total: number
  preference: number
  rating: number
  authenticity: number
  budget: number
}

/** Relative importance of each signal. Kept explicit so the ranking is legible, not magic. */
const WEIGHTS = {
  preference: 3, // each matched preference tag (interest / aesthetic / vibe)
  rating: 2, // scaled 0..1 over the dataset's rating range
  authenticity: 1, // signed axis * user's stance
  budget: 2, // penalty for price mismatch
} as const

/** "€" -> 1 ... "€€€€" -> 4. Missing/odd values fall back to the middle. */
export function priceLevel(priceRange: string): number {
  const n = (priceRange.match(/€/g) ?? []).length
  return n >= 1 && n <= 4 ? n : 2
}

const BUDGET_TARGET: Record<NonNullable<TripPrefs['budget']>, number> = {
  budget: 1,
  moderate: 2,
  splurge: 4,
}

/** Dataset rating range, used to normalize rating into 0..1 so it can't swamp the other signals. */
const RATING_MIN = 2.0
const RATING_MAX = 5.0

/**
 * Pure ranking function: place + prefs -> score. No AI, no I/O, no randomness. This is what
 * actually decides the itinerary; the LLM only produces the `prefs` and later narrates the
 * result. Returns a breakdown so callers can explain the ranking (and tests can assert it).
 */
export function scorePlace(place: NormalizedPlace, prefs: TripPrefs): ScoreBreakdown {
  const preference = matchedPreferences(place.tags, prefs.interests).length * WEIGHTS.preference

  const ratingNorm = (place.rating - RATING_MIN) / (RATING_MAX - RATING_MIN)
  const rating = Math.max(0, Math.min(1, ratingNorm)) * WEIGHTS.rating

  // authenticityScore is signed; multiplying by the user's stance means "avoid touristy"
  // (positive pref) rewards hidden gems and penalizes tourist-heavy, and vice versa.
  const authenticity =
    authenticityScore(place.tags) * (prefs.authenticityPref ?? 0) * WEIGHTS.authenticity + 0 // +0 normalizes -0

  let budget = 0
  if (prefs.budget) {
    const distance = Math.abs(priceLevel(place.priceRange) - BUDGET_TARGET[prefs.budget])
    budget = -distance * WEIGHTS.budget // 0 when it matches, more negative as it drifts
  }

  const total = preference + rating + authenticity + budget
  return { total, preference, rating, authenticity, budget }
}

/** Ranks places best-first. Ties broken by rating so the order is stable and sensible. */
export function rankPlaces(places: NormalizedPlace[], prefs: TripPrefs): NormalizedPlace[] {
  return [...places].sort((a, b) => {
    const diff = scorePlace(b, prefs).total - scorePlace(a, prefs).total
    return diff !== 0 ? diff : b.rating - a.rating
  })
}
