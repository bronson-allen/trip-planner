import type { NormalizedPlace, ParsedHours } from './normalize'

/**
 * Temporal availability — does a place's own stated schedule let it be open during the trip?
 * Pure, deterministic, and deliberately conservative: it only reports "closed" when the data
 * *positively* says so. Two reliable signals are parsed; ambiguous prose is left alone rather
 * than mis-parsed (see the "advisory vs closure" gate in parseSeasonWindow).
 *
 *   1. Day-of-week — from the parsed hours ("Sat-Sun", "Mon-Sat", …).
 *   2. Seasonal month window — from seasonal_notes, but ONLY when the wording denotes a real
 *      closure ("open Apr–Oct only", "closed …"), never advice ("best Apr–Oct").
 *
 * Ordinal rules ("third weekend of each month", "closed Sundays except the last") are NOT
 * parsed — too bespoke to do safely — so a place gated only by those is treated as open here
 * and its note is surfaced to the traveler to verify.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const MONTH_ALT = MONTHS.join('|')

function weekdayToIndex(token: string): number | null {
  const key = token.trim().toLowerCase().slice(0, 3)
  return key in WEEKDAY_INDEX ? WEEKDAY_INDEX[key] : null
}

/**
 * The set of weekday numbers (0=Sun) a place is open, from its parsed hours day-range string.
 * Returns null when unknown or unparseable — meaning "no day constraint", treated as open.
 */
export function parseOpenWeekdays(days: string | null): Set<number> | null {
  if (!days) return null
  if (days.trim().toLowerCase() === 'daily') return new Set([0, 1, 2, 3, 4, 5, 6])

  const result = new Set<number>()
  for (const rawSegment of days.split(',')) {
    const segment = rawSegment.trim()
    if (!segment) continue

    if (segment.includes('-')) {
      const [fromToken, toToken] = segment.split('-')
      const from = weekdayToIndex(fromToken)
      const to = weekdayToIndex(toToken)
      if (from === null || to === null) return null // can't parse confidently → unknown
      for (let day = from; ; day = (day + 1) % 7) {
        result.add(day)
        if (day === to) break
      }
    } else {
      const day = weekdayToIndex(segment)
      if (day === null) return null
      result.add(day)
    }
  }
  return result.size > 0 ? result : null
}

/**
 * Every weekday the place is open, across all of its parsed windows.
 *
 * `hours.days` is only set when the windows agree, so a place with two different ranges
 * ("Mon-Fri 7:00-14:00, Sat 7:00-17:00") collapses to null and would read as having no day
 * constraint at all. Each window carries its own range, so union them instead. A window whose
 * range can't be parsed still means "unknown", and unknown stays open.
 */
export function openWeekdays(hours: ParsedHours): Set<number> | null {
  const shared = parseOpenWeekdays(hours.days)
  if (shared) return shared

  const union = new Set<number>()
  for (const window of hours.windows) {
    const days = parseOpenWeekdays(window.days)
    if (!days) return null
    for (const day of days) union.add(day)
  }
  return union.size > 0 ? union : null
}

export type SeasonWindow = { startMonth: number; endMonth: number }

/**
 * A hard seasonal closure window from prose, or null. Only matches wording that denotes a real
 * closure — "open <range>" or "<range> only" — so advisory notes ("Best April-October",
 * "Booking essential April-October") are correctly ignored.
 */
export function parseSeasonWindow(notes: string | null): SeasonWindow | null {
  if (!notes) return null
  const text = notes.toLowerCase()

  const closurePatterns = [
    new RegExp(`open\\s+(${MONTH_ALT})\\s*[-–]\\s*(${MONTH_ALT})`),
    new RegExp(`(${MONTH_ALT})\\s*[-–]\\s*(${MONTH_ALT})\\s+only`),
  ]

  for (const pattern of closurePatterns) {
    const match = text.match(pattern)
    if (match) {
      return { startMonth: MONTHS.indexOf(match[1]) + 1, endMonth: MONTHS.indexOf(match[2]) + 1 }
    }
  }
  return null
}

/** Whether month (1-12) falls inside the window, handling wrap-around (e.g. Nov–Feb). */
function monthInWindow(month: number, window: SeasonWindow): boolean {
  const { startMonth, endMonth } = window
  return startMonth <= endMonth
    ? month >= startMonth && month <= endMonth
    : month >= startMonth || month <= endMonth
}

/** Whether the place can be open on this specific date, per the signals we can parse. */
export function isOpenOnDate(place: NormalizedPlace, date: Date): boolean {
  const weekdays = openWeekdays(place.hours)
  if (weekdays && !weekdays.has(date.getDay())) return false

  const window = parseSeasonWindow(place.seasonalNotes)
  if (window && !monthInWindow(date.getMonth() + 1, window)) return false

  return true
}

/**
 * True only when we can positively determine the place is closed on *every* trip day. When no
 * date-based signal exists, returns false (assume open) — we never exclude on a guess.
 */
export function isClosedForTrip(place: NormalizedPlace, tripDates: Date[]): boolean {
  if (tripDates.length === 0) return false
  return tripDates.every((date) => !isOpenOnDate(place, date))
}
