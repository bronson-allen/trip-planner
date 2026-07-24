/**
 * Tag taxonomy — the single source of truth for what the dataset's ~30 raw tags *mean*.
 *
 * The dataset has 30 distinct tags after `normalizeTags` (see normalize.ts). Treating them
 * as one flat filter is the naive move: "quiet" vs "lively", "hidden-gem" vs "tourist-heavy",
 * "budget" vs "splurge" look contradictory only if you flatten them. They aren't — they're
 * opposite ends of a few independent axes. This map assigns every tag to one axis and one
 * role, so each tag feeds the system in exactly the way it should:
 *
 *   - `interest`     -> user-selectable chips; scorer rewards overlap with picks.
 *   - `aesthetic`    -> near-synonyms (scenic/views/photogenic) collapsed to one concept.
 *   - `vibe`         -> soft pace/mood preference, never a hard filter.
 *   - `authenticity` -> ONE signed axis (hidden-gem +2 ... tourist-heavy -2), not 4 booleans.
 *   - `cost`         -> defers to the structured `priceRange` field; tag is just an echo.
 *   - `schedule`     -> input to the scheduler (morning/evening), not a preference.
 *   - `practical`    -> opt-in filter (family-friendly).
 *   - `noise`        -> too sparse (<=2 occurrences) to build UI around; kept, not surfaced.
 *
 * Anything not in this map falls through as `unknown` — handled, never crashed.
 */

export type TagAxis =
  | 'interest'
  | 'aesthetic'
  | 'vibe'
  | 'authenticity'
  | 'cost'
  | 'schedule'
  | 'practical'
  | 'noise'

export type TagMeta = {
  axis: TagAxis
  /** Signed weight for the authenticity axis; undefined elsewhere. +ve = authentic, -ve = touristy. */
  weight?: number
  /** Day part this tag suggests, for the scheduler. */
  daypart?: 'morning' | 'evening'
  /** Short human badge to surface on a card. Only a handful earn one — the rest work invisibly. */
  badge?: string
}

export const TAG_TAXONOMY: Record<string, TagMeta> = {
  // --- interest: the chips a user actually picks ---
  cultural: { axis: 'interest' },
  food: { axis: 'interest' },
  historic: { axis: 'interest' },
  art: { axis: 'interest' },
  wine: { axis: 'interest' },
  outdoors: { axis: 'interest' },
  market: { axis: 'interest' },
  shop: { axis: 'interest' },
  experience: { axis: 'interest' },

  // --- aesthetic: near-synonyms collapsed to one concept, not three chips ---
  scenic: { axis: 'aesthetic' },
  views: { axis: 'aesthetic' },
  photogenic: { axis: 'aesthetic' },

  // --- vibe: soft mood/pace preference ---
  quiet: { axis: 'vibe' },
  relaxing: { axis: 'vibe' },
  active: { axis: 'vibe' },
  lively: { axis: 'vibe' },
  romantic: { axis: 'vibe' },

  // --- authenticity: ONE signed axis, resolves the apparent contradiction ---
  'hidden-gem': { axis: 'authenticity', weight: 2, badge: 'Local secret' },
  'local-favorite': { axis: 'authenticity', weight: 1 },
  iconic: { axis: 'authenticity', weight: -1, badge: 'Must-see' },
  'tourist-heavy': { axis: 'authenticity', weight: -2, badge: 'Very touristy' },

  // --- cost: defers to the numeric priceRange field; here only for completeness ---
  free: { axis: 'cost' },
  budget: { axis: 'cost' },
  splurge: { axis: 'cost' },

  // --- schedule: shapes WHEN a stop lands in the day, not whether it's picked ---
  morning: { axis: 'schedule', daypart: 'morning' },
  evening: { axis: 'schedule', daypart: 'evening' },
  'rainy-day': { axis: 'schedule' }, // boosted only when weather/season context exists
  seasonal: { axis: 'schedule' },

  // --- practical: opt-in filter ---
  'family-friendly': { axis: 'practical' },

  // --- noise: too sparse to earn UI ---
  modern: { axis: 'noise' },
}

/** Interest tags in a stable order — the source of truth for the interest-chip UI. */
export const INTEREST_TAGS: string[] = Object.keys(TAG_TAXONOMY).filter(
  (tag) => TAG_TAXONOMY[tag].axis === 'interest',
)

/** Metadata for a tag; `noise` fallback for anything unmapped (never throws). */
export function tagMeta(tag: string): TagMeta {
  return TAG_TAXONOMY[tag] ?? { axis: 'noise' }
}

/**
 * Collapses a place's tags to a single authenticity score by summing signed weights.
 * hidden-gem/local-favorite push positive; iconic/tourist-heavy push negative; 0 = neutral.
 * This is the mechanism behind an "avoid touristy / find hidden gems" preference.
 */
export function authenticityScore(tags: string[]): number {
  return tags.reduce((sum, tag) => sum + (tagMeta(tag).weight ?? 0), 0)
}

export type CardBadge = {
  tag: string
  label: string
}

/** The badges a card should show — at most a couple, not the whole tag array. */
export function cardBadges(tags: string[]): CardBadge[] {
  return tags.flatMap((tag) => {
    const label = tagMeta(tag).badge
    return label ? [{ tag, label }] : []
  })
}

/**
 * Axes that behave as soft "what I'm into" preferences the user picks as chips. Authenticity,
 * cost, and schedule are deliberately excluded — they're their own dedicated dimensions.
 */
const SOFT_PREFERENCE_AXES: ReadonlySet<TagAxis> = new Set(['interest', 'aesthetic', 'vibe'])

/** The user's selected preference tags that this place satisfies — for scoring overlap. */
export function matchedPreferences(tags: string[], selected: string[]): string[] {
  const wanted = new Set(selected)
  return tags.filter((tag) => SOFT_PREFERENCE_AXES.has(tagMeta(tag).axis) && wanted.has(tag))
}
