import { describe, expect, it } from 'vitest'
import rawPlaces from '../data/italy.json'
import { auditPlaces } from './audit'
import { normalizePlace, normalizeTags, parseHours } from './normalize'

const raw = rawPlaces
const normalized = raw.map(normalizePlace)

function byId(id: string) {
  const place = normalized.find((p) => p.id === id)
  if (!place) throw new Error(`fixture id not found in italy.json: ${id}`)
  return place
}

describe('normalizePlace against the full italy.json source of truth', () => {
  it('produces exactly one normalized place per raw place, matched 1:1 by id', () => {
    expect(normalized).toHaveLength(raw.length)
    expect(normalized.map((p) => p.id)).toEqual(raw.map((p) => p.id))
  })

  it('never mutates the source data it reads from', () => {
    const before = JSON.parse(JSON.stringify(raw))
    raw.map(normalizePlace)
    expect(raw).toEqual(before)
  })

  it('passes identity fields through unchanged for every place', () => {
    normalized.forEach((place, i) => {
      const source = raw[i]
      expect(place.name).toBe(source.name)
      expect(place.type).toBe(source.type)
      expect(place.city).toBe(source.city)
      expect(place.region).toBe(source.region)
      expect(place.neighborhood).toBe(source.neighborhood)
      expect(place.description).toBe(source.description)
      expect(place.latitude).toBe(source.latitude)
      expect(place.longitude).toBe(source.longitude)
      expect(place.priceRange).toBe(source.price_range)
      expect(place.rating).toBe(source.rating)
      expect(place.seasonalNotes).toBe(source.seasonal_notes)
      expect(place.bookingRequired).toBe(source.booking_required === true)
    })
  })

  it('never invents or drops a tag — every normalized tag traces back to a raw one', () => {
    normalized.forEach((place, i) => {
      const source = raw[i]
      const rawCanonical = new Set(
        source.tags.map((tag) => tag.toLowerCase().replaceAll('_', '-')),
      )
      expect(place.tags.length).toBeLessThanOrEqual(source.tags.length)
      place.tags.forEach((tag) => expect(rawCanonical.has(tag)).toBe(true))
    })
  })

  it('flags inferred duration explicitly instead of guessing silently', () => {
    normalized.forEach((place, i) => {
      const source = raw[i]
      if (source.duration_minutes != null) {
        expect(place.duration).toEqual({ minutes: source.duration_minutes, inferred: false })
      } else {
        expect(place.duration.inferred).toBe(true)
        expect(place.duration.minutes).toBeGreaterThan(0)
      }
    })
  })

  it('preserves the raw hours string verbatim and never presents unparseable hours as parsed', () => {
    normalized.forEach((place, i) => {
      const source = raw[i]
      expect(place.hours.raw).toBe(source.hours)

      if (place.hours.confidence === 'unknown') {
        expect(place.hours.windows).toEqual([])
      } else {
        expect(place.hours.display).toBe(source.hours)
        expect(place.hours.windows.length).toBeGreaterThan(0)
        place.hours.windows.forEach((window) =>
          expect(window.endMinutes).toBeGreaterThan(window.startMinutes),
        )
      }
    })
  })
})

describe('known dataset gotchas (regression pins from the data audit)', () => {
  it('Hard Rock Cafe Rome keeps its low rating — normalize never filters or reweights', () => {
    const place = byId('place_025')
    expect(place.rating).toBe(2.1)
    expect(place.tags).toContain('tourist-heavy')
  })

  it('Osteria Francescana keeps duration_minutes as given, even though it exceeds any single hours window', () => {
    const place = byId('place_043')
    expect(place.duration).toEqual({ minutes: 240, inferred: false })
    const longestWindow = Math.max(
      ...place.hours.windows.map((w) => w.endMinutes - w.startMinutes),
    )
    expect(longestWindow).toBeLessThan(place.duration.minutes)
  })

  it('booking-required experiences with null hours fall back to "unknown", not a guessed schedule', () => {
    for (const id of ['place_035', 'place_044', 'place_053', 'place_071']) {
      const place = byId(id)
      expect(place.bookingRequired).toBe(true)
      expect(place.hours.confidence).toBe('unknown')
      expect(place.hours.raw).toBeNull()
    }
  })

  it('canonicalizes the one underscore-spelled tag in the dataset', () => {
    const place = byId('place_100')
    expect(place.tags).toContain('local-favorite')
    expect(place.tags).not.toContain('local_favorite')
  })

  it('Il Sorpasso ("8:00-01:00") is recognized as crossing midnight, not a backwards window', () => {
    const place = byId('place_020')
    expect(place.hours.confidence).toBe('parsed')
    expect(place.hours.windows).toEqual([
      { startMinutes: 480, endMinutes: 1500, crossesMidnight: true, days: null },
    ])
  })

  it('extracts both day-prefixed segments from "Mon-Fri ..., Sat ..."', () => {
    const place = byId('place_030')
    expect(place.hours.confidence).toBe('parsed')
    expect(place.hours.windows).toHaveLength(2)
    expect(place.hours.windows[0]?.days).toBe('Mon-Fri')
    expect(place.hours.windows[1]?.days).toBe('Sat')
    expect(place.hours.days).toBeNull()
  })

  it('marks irregular day lists as partial rather than silently dropping windows', () => {
    const place = byId('place_064')
    expect(place.hours.confidence).toBe('partial')
    expect(place.hours.windows).toHaveLength(1)
    expect(place.hours.windows[0]?.days).toBe('Thurs-Sun')
  })
})

describe('parseHours — the messy format zoo', () => {
  it('parses a plain 24h window', () => {
    expect(parseHours('9:00-19:00').windows).toEqual([
      { startMinutes: 540, endMinutes: 1140, crossesMidnight: false, days: null },
    ])
  })

  it('parses a day-range prefix with multiple comma-separated windows', () => {
    const result = parseHours('Tues-Sun 12:30-14:30, 19:30-22:30')
    expect(result.days).toBe('Tues-Sun')
    expect(result.confidence).toBe('parsed')
    expect(result.windows).toHaveLength(2)
    expect(result.windows.every((window) => window.days === 'Tues-Sun')).toBe(true)
  })

  it('parses each comma segment with its own day prefix', () => {
    const result = parseHours('Mon-Fri 7:00-14:00, Sat 7:00-17:00')
    expect(result.confidence).toBe('parsed')
    expect(result.windows).toEqual([
      { startMinutes: 420, endMinutes: 840, crossesMidnight: false, days: 'Mon-Fri' },
      { startMinutes: 420, endMinutes: 1020, crossesMidnight: false, days: 'Sat' },
    ])
    expect(result.days).toBeNull()
  })

  it('parses 12-hour am/pm without minutes', () => {
    expect(parseHours('8am-7pm').windows).toEqual([
      { startMinutes: 480, endMinutes: 1140, crossesMidnight: false, days: null },
    ])
  })

  it('parses 24:00 as end-of-day (1440 minutes)', () => {
    expect(parseHours('7:30-24:00').windows).toEqual([
      { startMinutes: 450, endMinutes: 1440, crossesMidnight: false, days: null },
    ])
  })

  it('parses an overnight window ("8:00-01:00") as crossing midnight rather than reading backwards', () => {
    expect(parseHours('8:00-01:00').windows).toEqual([
      { startMinutes: 480, endMinutes: 1500, crossesMidnight: true, days: null },
    ])
  })

  it('treats free-text hours ("Evenings") as unknown rather than a fabricated schedule', () => {
    const result = parseHours('Evenings')
    expect(result.confidence).toBe('unknown')
    expect(result.windows).toEqual([])
    expect(result.display).toBe('Evenings')
  })

  it('treats null hours as unknown with a clear display fallback', () => {
    const result = parseHours(null)
    expect(result.confidence).toBe('unknown')
    expect(result.display).toBe('Hours not listed')
  })

  it('marks irregular day lists as partial when only some segments parse', () => {
    const result = parseHours('Tues, Thurs-Sun 10:00-18:00')
    expect(result.confidence).toBe('partial')
    expect(result.windows).toEqual([
      { startMinutes: 600, endMinutes: 1080, crossesMidnight: false, days: 'Thurs-Sun' },
    ])
  })
})

describe('normalizeTags', () => {
  it('canonicalizes underscore variants and dedupes case-insensitively', () => {
    expect(normalizeTags(['local-favorite', 'local_favorite', 'Food'])).toEqual([
      'local-favorite',
      'food',
    ])
  })
})

describe('auditPlaces', () => {
  const report = auditPlaces(raw, normalized)

  it('audits all 103 places without mutating source data', () => {
    expect(report.placeCount).toBe(103)
    expect(report.missingFields.hours).toBe(33)
    expect(report.missingFields.duration).toBe(9)
    expect(report.inferredDurations).toBe(9)
  })

  it('flags Osteria Francescana duration vs hours-window mismatch', () => {
    expect(
      report.findings.some(
        (finding) =>
          finding.placeId === 'place_043' &&
          finding.category === 'duration_exceeds_window',
      ),
    ).toBe(true)
  })

  it('flags Hard Rock Cafe as a low-rating outlier', () => {
    expect(
      report.findings.some(
        (finding) =>
          finding.placeId === 'place_025' && finding.category === 'low_rating_outlier',
      ),
    ).toBe(true)
  })

  it('flags booking-required places with no parseable hours', () => {
    expect(
      report.findings.filter((finding) => finding.category === 'booking_required_no_hours')
        .length,
    ).toBeGreaterThanOrEqual(4)
  })
})
