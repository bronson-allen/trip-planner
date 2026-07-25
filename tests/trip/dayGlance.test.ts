import { describe, expect, it } from 'vitest'
import { defaultTripPlan } from '../../src/data/tripPlan'
import {
  buildDayGlance,
  formatClock,
  formatSpan,
  type GlanceBlock,
} from '../../src/lib/trip/dayGlance'
import { initTripState, resolveTrip } from '../../src/lib/trip/tripState'

function firstDay() {
  return resolveTrip(initTripState(defaultTripPlan()))[0]
}

function blocksOf(entries: ReturnType<typeof buildDayGlance>['entries']): GlanceBlock[] {
  return entries.filter((entry): entry is GlanceBlock => entry.kind === 'stop')
}

describe('day glance', () => {
  it('lays the day out in order, leaving room for the walk between stops', () => {
    const day = firstDay()
    const glance = buildDayGlance(day)
    const blocks = blocksOf(glance.entries)

    expect(blocks.map((block) => block.stop.place.id)).toEqual(
      day.stops.map((stop) => stop.place.id),
    )

    blocks.forEach((block, index) => {
      expect(block.endMinutes - block.startMinutes).toBe(block.stop.place.duration.minutes)
      const previous = blocks[index - 1]
      if (!previous) return
      const walk = Math.round((block.stop.travelFromPrev?.durationSeconds ?? 0) / 60)
      expect(block.startMinutes).toBeGreaterThanOrEqual(previous.endMinutes + walk)
    })
  })

  it('reports the day totals from the resolved stops', () => {
    const day = firstDay()
    const glance = buildDayGlance(day)
    const blocks = blocksOf(glance.entries)

    expect(glance.walkingMeters).toBeCloseTo(
      day.stops.reduce((sum, stop) => sum + (stop.travelFromPrev?.distanceMeters ?? 0), 0),
    )
    expect(glance.priceLevel).toBeGreaterThanOrEqual(1)
    expect(glance.priceLevel).toBeLessThanOrEqual(4)
    expect(glance.startMinutes).toBe(blocks[0].startMinutes)
    expect(glance.endMinutes).toBe(blocks.at(-1)?.endMinutes)
  })

  it('fills dead time between stops with a gap rather than hiding it', () => {
    const glance = buildDayGlance(firstDay())
    const gaps = glance.entries.filter((entry) => entry.kind === 'gap')

    for (const gap of gaps) {
      expect(gap.endMinutes - gap.startMinutes).toBeGreaterThanOrEqual(30)
    }

    // Entries stay chronological across both kinds, so the timeline never reads backwards.
    const starts = glance.entries.map((entry) => entry.startMinutes)
    expect([...starts].sort((left, right) => left - right)).toEqual(starts)
  })

  it('returns an empty layout for a day with no stops', () => {
    const glance = buildDayGlance({ ...firstDay(), stops: [] })

    expect(glance.entries).toEqual([])
    expect(glance.walkingMeters).toBe(0)
    expect(glance.startMinutes).toBeNull()
    expect(glance.endMinutes).toBeNull()
  })

  it('formats clock and span labels for the timeline', () => {
    expect(formatClock(9 * 60)).toBe('9:00')
    expect(formatClock(13 * 60 + 30)).toBe('13:30')
    expect(formatSpan(45)).toBe('45m')
    expect(formatSpan(240)).toBe('4h')
    expect(formatSpan(100)).toBe('1h40')
  })
})
