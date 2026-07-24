import italy from '../data/italy.json'

type RawPlace = (typeof italy)[number]

/** One parsed open/close window, in minutes since midnight. 24:00 = 1440. */
export type HoursWindow = {
  startMinutes: number
  /** May exceed 1440 when the window crosses midnight (e.g. 8pm-1am -> 1500). */
  endMinutes: number
  /** True when the close time is on the following day (e.g. "8:00-01:00"). */
  crossesMidnight: boolean
  /** Day-range for this window when known (from a segment prefix or inherited). */
  days: string | null
}

export type ParsedHours = {
  /** Untouched source string, for provenance. */
  raw: string | null
  /** Shared day-range when all windows agree; null when mixed or unspecified. */
  days: string | null
  windows: HoursWindow[]
  /**
   * 'parsed' = every comma segment produced a window.
   * 'partial' = some segments parsed, others did not (e.g. "Tues, Thurs-Sun 10:00-18:00").
   * 'unknown' = nothing usable (null, "Evenings", etc).
   */
  confidence: 'parsed' | 'partial' | 'unknown'
  /** Human-friendly text for display — the raw string when parsed, a plain-language fallback otherwise. */
  display: string
}

export type NormalizedDuration = {
  minutes: number
  /** True when the source had no duration and this was defaulted by place type. */
  inferred: boolean
}

export type NormalizedPlace = {
  id: string
  name: string
  type: string
  city: string
  region: string
  neighborhood: string | null
  description: string
  latitude: number
  longitude: number
  hours: ParsedHours
  duration: NormalizedDuration
  priceRange: string
  rating: number
  tags: string[]
  seasonalNotes: string | null
  bookingRequired: boolean
}

const DEFAULT_DURATION_MINUTES_BY_TYPE: Record<string, number> = {
  restaurant: 90,
  cafe: 30,
  museum: 120,
  historic_site: 90,
  viewpoint: 20,
  market: 45,
  park: 60,
  neighborhood: 120,
  experience: 120,
  shop: 30,
}

const FALLBACK_DURATION_MINUTES = 60

function inferDurationMinutes(type: string): number {
  return DEFAULT_DURATION_MINUTES_BY_TYPE[type] ?? FALLBACK_DURATION_MINUTES
}

/** Parses one time token: "14:30", "24:00", "8am", "7:30pm". Returns minutes since midnight, or null. */
function parseTimeToken(token: string): number | null {
  const t = token.trim().toLowerCase()

  const clock24 = t.match(/^(\d{1,2}):(\d{2})$/)
  if (clock24) {
    const hours = Number(clock24[1])
    const minutes = Number(clock24[2])
    return hours * 60 + minutes
  }

  const clock12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (clock12) {
    let hours = Number(clock12[1])
    const minutes = clock12[2] ? Number(clock12[2]) : 0
    const period = clock12[3]
    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    return hours * 60 + minutes
  }

  return null
}

function parseTimeRange(segment: string): Omit<HoursWindow, 'days'> | null {
  const parts = segment.split('-')
  if (parts.length !== 2) return null

  const start = parseTimeToken(parts[0])
  const end = parseTimeToken(parts[1])
  if (start === null || end === null) return null

  const crossesMidnight = end <= start
  return {
    startMinutes: start,
    endMinutes: crossesMidnight ? end + 24 * 60 : end,
    crossesMidnight,
  }
}

const DAY_PREFIX = /^(Daily|[A-Za-z]{3,9}(?:-[A-Za-z]{3,9})?)\s+(?=\d)/

function parseHoursSegment(
  segment: string,
  inheritedDays: string | null,
): { days: string | null; window: HoursWindow | null } {
  const trimmed = segment.trim()
  if (!trimmed) return { days: inheritedDays, window: null }

  const dayMatch = trimmed.match(DAY_PREFIX)
  const days = dayMatch ? dayMatch[1] : inheritedDays
  const timePart = dayMatch ? trimmed.slice(dayMatch[0].length).trim() : trimmed

  const range = parseTimeRange(timePart)
  if (!range) return { days, window: null }

  return { days, window: { ...range, days } }
}

function summarizeDays(windows: HoursWindow[]): string | null {
  const unique = [...new Set(windows.map((window) => window.days))]
  if (unique.length === 1) return unique[0] ?? null
  return null
}

/**
 * Tolerant parser for the dataset's ~8 distinct hours formats (see plan_proposal.md §2).
 * Never throws — unparseable input becomes `confidence: 'unknown'` with the raw text
 * preserved for display, rather than a guessed value presented as fact.
 */
export function parseHours(raw: string | null): ParsedHours {
  if (!raw) {
    return { raw: null, days: null, windows: [], confidence: 'unknown', display: 'Hours not listed' }
  }

  const segments = raw.split(',').map((segment) => segment.trim()).filter(Boolean)
  let activeDays: string | null = null
  const windows: HoursWindow[] = []
  let parsedSegmentCount = 0

  for (const segment of segments) {
    const { days, window } = parseHoursSegment(segment, activeDays)
    if (days) activeDays = days
    if (window) {
      windows.push(window)
      parsedSegmentCount++
    }
  }

  if (windows.length === 0) {
    return { raw, days: null, windows: [], confidence: 'unknown', display: raw }
  }

  const confidence =
    parsedSegmentCount === segments.length ? 'parsed' : 'partial'

  return {
    raw,
    days: summarizeDays(windows),
    windows,
    confidence,
    display: raw,
  }
}

/** Canonicalizes tag spelling (e.g. "local_favorite" -> "local-favorite") and dedupes. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const tag of tags) {
    const canonical = tag.replaceAll('_', '-').toLowerCase()
    if (!seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }

  return out
}

/**
 * Pure, non-destructive transform: raw place -> typed NormalizedPlace. Never mutates or
 * reads back `italy.json` — every filled gap is attributed (`inferred`, `confidence`)
 * rather than silently guessed. See plan_proposal.md §2 for the audited gotchas this exists
 * to handle (messy hours strings, missing duration, tag spelling drift).
 */
export function normalizePlace(raw: RawPlace): NormalizedPlace {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    city: raw.city,
    region: raw.region,
    neighborhood: raw.neighborhood,
    description: raw.description,
    latitude: raw.latitude,
    longitude: raw.longitude,
    hours: parseHours(raw.hours),
    duration:
      raw.duration_minutes != null
        ? { minutes: raw.duration_minutes, inferred: false }
        : { minutes: inferDurationMinutes(raw.type), inferred: true },
    priceRange: raw.price_range,
    rating: raw.rating,
    tags: normalizeTags(raw.tags),
    seasonalNotes: raw.seasonal_notes,
    bookingRequired: raw.booking_required === true,
  }
}
