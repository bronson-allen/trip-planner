import { describe, expect, it } from 'vitest'
import rawPlaces from '../../src/data/italy.json'
import { normalizePlace } from '../../src/lib/places/normalize'
import {
  authenticityScore,
  cardBadges,
  INTEREST_TAGS,
  matchedPreferences,
  tagMeta,
  TAG_TAXONOMY,
} from '../../src/lib/places/tags'

const normalized = rawPlaces.map(normalizePlace)

describe('TAG_TAXONOMY covers the dataset', () => {
  it('maps every tag that actually appears in italy.json', () => {
    const seen = new Set(normalized.flatMap((p) => p.tags))
    const unmapped = [...seen].filter((tag) => !(tag in TAG_TAXONOMY))
    expect(unmapped).toEqual([])
  })

  it('exposes interest tags in a stable, non-empty list', () => {
    expect(INTEREST_TAGS).toContain('food')
    expect(INTEREST_TAGS).not.toContain('morning') // schedule, not an interest
  })
})

describe('authenticityScore collapses the axis to one signed number', () => {
  it('rewards hidden gems and penalizes tourist traps', () => {
    expect(authenticityScore(['hidden-gem', 'local-favorite'])).toBe(3)
    expect(authenticityScore(['tourist-heavy'])).toBe(-2)
    expect(authenticityScore(['food', 'scenic'])).toBe(0) // neutral tags don't move it
  })
})

describe('cardBadges surfaces only the tags a traveler wants flagged', () => {
  it('returns badges, not the whole tag array', () => {
    expect(cardBadges(['tourist-heavy', 'cultural', 'photogenic'])).toEqual([
      { tag: 'tourist-heavy', label: 'Very touristy' },
    ])
    expect(cardBadges(['food', 'quiet'])).toEqual([]) // most tags work invisibly
  })
})

describe('matchedPreferences scopes overlap to the soft-preference axes', () => {
  it('matches interest, aesthetic, and vibe tags the user picked', () => {
    // food = interest, scenic = aesthetic, quiet = vibe — all soft preferences
    expect(matchedPreferences(['food', 'scenic', 'quiet'], ['food', 'scenic', 'quiet'])).toEqual([
      'food',
      'scenic',
      'quiet',
    ])
  })

  it('ignores tags on dedicated axes even if named', () => {
    // morning = schedule, hidden-gem = authenticity — neither is a soft preference
    expect(matchedPreferences(['morning', 'hidden-gem', 'food'], ['morning', 'hidden-gem', 'food'])).toEqual(
      ['food'],
    )
  })
})

describe('tagMeta never throws on unknown input', () => {
  it('falls back to noise', () => {
    expect(tagMeta('totally-made-up').axis).toBe('noise')
  })
})
