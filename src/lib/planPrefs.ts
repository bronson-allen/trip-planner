import type { TripPlan } from '../data/tripPlan'
import type { Pace, TripPrefs } from './score'
import { tagMeta } from './tags'

/**
 * Adapter: the UI's form state (`TripPlan`) -> the engine's `TripPrefs`. This is the single
 * seam between the human-facing chips and the deterministic scorer. Later, the LLM intent-parse
 * call will produce the same `TripPrefs` shape from free text — so the engine never needs to
 * know whether a preference came from a chip or a sentence.
 */

/** PlannerCard's interest chip labels -> canonical dataset tags. */
const INTEREST_LABEL_TO_TAG: Record<string, string> = {
  Food: 'food',
  Historic: 'historic',
  Scenic: 'scenic',
  Art: 'art',
  'Local favorite': 'local-favorite',
  Outdoors: 'outdoors',
  Quiet: 'quiet',
  'Hidden gem': 'hidden-gem',
}

/** Budget symbol (€…€€€€) -> the scorer's spend level. */
const BUDGET_SYMBOL_TO_LEVEL: Record<string, TripPrefs['budget']> = {
  '€': 'budget',
  '€€': 'moderate',
  '€€€': 'splurge',
  '€€€€': 'splurge',
}

/** PlannerCard pace label -> the scheduler's day density. */
const PACE_LABEL_TO_PACE: Record<string, Pace> = {
  Relaxed: 'relaxed',
  Balanced: 'balanced',
  Packed: 'packed',
}

export function planToPrefs(plan: TripPlan): TripPrefs {
  const interests: string[] = []
  let authenticityPref = 0

  for (const label of plan.interests) {
    const tag = INTEREST_LABEL_TO_TAG[label]
    if (!tag) continue
    // Authenticity chips (hidden-gem / local-favorite) drive the dedicated axis, not the
    // preference-overlap list — that's what makes "find hidden gems" a ranking lever.
    if (tagMeta(tag).axis === 'authenticity') authenticityPref += 1
    else interests.push(tag)
  }

  return {
    interests,
    budget: BUDGET_SYMBOL_TO_LEVEL[plan.budget] ?? 'moderate',
    authenticityPref,
    pace: PACE_LABEL_TO_PACE[plan.pace] ?? 'balanced',
  }
}
