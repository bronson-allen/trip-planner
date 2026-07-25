import { isOpenOnDate } from '../places/availability'
import { parseIsoDate } from '../dates'
import type { ScheduledStop, SlotKind } from './itinerary'
import { priceLevel } from '../places/score'
import type { DayPlan } from './tripState'

/**
 * "Day at a glance" view model — turns one already-resolved day into wall-clock blocks.
 *
 * Nothing here re-decides the itinerary: the day's stops, order, slots, durations and walking
 * estimates all come from `resolveTrip`. This only lays them out on a clock, so an over- or
 * under-packed day becomes visible. Pure and deterministic, like the rest of the planning layer.
 */

/** Earliest a slot may start. A stop begins at its slot anchor or when the previous one ends. */
const SLOT_EARLIEST_MINUTES: Record<SlotKind, number> = {
  morning: 9 * 60,
  lunch: 12 * 60 + 30,
  afternoon: 14 * 60,
  evening: 18 * 60,
  dinner: 19 * 60 + 30,
}

/** Start times snap to this grid, so the gutter reads like a schedule rather than a stopwatch. */
const GRID_MINUTES = 15

/** Below this, dead time is just slack in the estimates and not worth calling out. */
const MIN_GAP_MINUTES = 30

export type GlanceBlock = {
  kind: 'stop'
  stop: ScheduledStop
  startMinutes: number
  endMinutes: number
  /** Walking minutes from the previous stop; null when a gap row carries that space instead. */
  travelMinutes: number | null
  /** Why this stop needs checking before the traveler relies on it, if it does. */
  advisory: string | null
}

export type GlanceGap = {
  kind: 'gap'
  startMinutes: number
  endMinutes: number
}

export type GlanceEntry = GlanceBlock | GlanceGap

export type DayGlance = {
  entries: GlanceEntry[]
  walkingMeters: number
  /** Typical spend level across the day's stops, 1-4, expressed as € signs in the UI. */
  priceLevel: number
  startMinutes: number | null
  endMinutes: number | null
}

function roundUpToGrid(minutes: number): number {
  return Math.ceil(minutes / GRID_MINUTES) * GRID_MINUTES
}

function travelMinutes(stop: ScheduledStop): number {
  return stop.travelFromPrev ? Math.round(stop.travelFromPrev.durationSeconds / 60) : 0
}

/**
 * The one thing about a stop the traveler must act on, worst first. Deliberately narrow:
 * unparseable hours are already reported on the itinerary cards and map popup, and flagging
 * them here too would badge most of the day and make the badge mean nothing.
 */
function advisoryFor(stop: ScheduledStop, date: Date): string | null {
  const { place } = stop
  if (!isOpenOnDate(place, date)) return 'May be closed on this date — check ahead'
  if (place.bookingRequired) return 'Booking required'
  return null
}

function averagePriceLevel(stops: ScheduledStop[]): number {
  if (stops.length === 0) return 0
  const total = stops.reduce((sum, stop) => sum + priceLevel(stop.place.priceRange), 0)
  return Math.min(4, Math.max(1, Math.round(total / stops.length)))
}

/** Lays a resolved day out on a clock: blocks, the walk between them, and the free time left over. */
export function buildDayGlance(day: DayPlan): DayGlance {
  const date = parseIsoDate(day.iso)
  const entries: GlanceEntry[] = []
  let cursor: number | null = null

  for (const stop of day.stops) {
    const walk = travelMinutes(stop)
    const readyAt = cursor === null ? SLOT_EARLIEST_MINUTES[stop.slot] : cursor + walk
    const startMinutes = roundUpToGrid(Math.max(SLOT_EARLIEST_MINUTES[stop.slot], readyAt))
    const gapMinutes = startMinutes - readyAt
    const showGap = cursor !== null && gapMinutes >= MIN_GAP_MINUTES

    if (showGap) {
      entries.push({
        kind: 'gap',
        startMinutes: roundUpToGrid(readyAt),
        endMinutes: startMinutes,
      })
    }

    entries.push({
      kind: 'stop',
      stop,
      startMinutes,
      endMinutes: startMinutes + stop.place.duration.minutes,
      travelMinutes: showGap || walk === 0 ? null : walk,
      advisory: advisoryFor(stop, date),
    })

    cursor = startMinutes + stop.place.duration.minutes
  }

  const blocks = entries.filter((entry): entry is GlanceBlock => entry.kind === 'stop')

  return {
    entries,
    walkingMeters: day.stops.reduce(
      (sum, stop) => sum + (stop.travelFromPrev?.distanceMeters ?? 0),
      0,
    ),
    priceLevel: averagePriceLevel(day.stops),
    startMinutes: blocks[0]?.startMinutes ?? null,
    endMinutes: blocks.at(-1)?.endMinutes ?? null,
  }
}

/** 24-hour clock label for the timeline gutter, e.g. "13:30". Wraps past midnight. */
export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  return `${hours}:${String(wrapped % 60).padStart(2, '0')}`
}

/** 12-hour clock split so the meridiem can be styled down, e.g. `{ time: "8:00", suffix: "pm" }`. */
export function formatClockParts(minutes: number): { time: string; suffix: string } {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const hours24 = Math.floor(wrapped / 60)
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return {
    time: `${hours12}:${String(wrapped % 60).padStart(2, '0')}`,
    suffix: hours24 < 12 ? 'am' : 'pm',
  }
}

/** Distance split so the unit can be styled down, e.g. `{ value: "7.2", unit: "km" }`. */
export function formatDistanceParts(meters: number): { value: string; unit: string } {
  if (meters < 1000) return { value: String(Math.round(meters)), unit: 'm' }
  return { value: (meters / 1000).toFixed(1), unit: 'km' }
}

/** Compact duration for blocks and gaps, e.g. "4h", "1h40", "45m". */
export function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`
}
