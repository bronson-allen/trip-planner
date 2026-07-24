import { describe, expect, it } from 'vitest'
import rawPlaces from '../data/italy.json'
import { isClosedForTrip, parseOpenWeekdays, parseSeasonWindow } from './availability'
import { normalizePlace } from './normalize'

const normalized = rawPlaces.map(normalizePlace)
function byName(fragment: string) {
  const place = normalized.find((p) => p.name.toLowerCase().includes(fragment.toLowerCase()))
  if (!place) throw new Error(`no place matching ${fragment}`)
  return place
}

describe('parseOpenWeekdays', () => {
  it('parses ranges, lists, and Daily', () => {
    expect([...(parseOpenWeekdays('Sat-Sun') ?? [])]).toEqual([6, 0])
    expect([...(parseOpenWeekdays('Mon-Sat') ?? [])]).toEqual([1, 2, 3, 4, 5, 6])
    expect(parseOpenWeekdays('Daily')?.size).toBe(7)
  })

  it('returns null for unknown (no day constraint)', () => {
    expect(parseOpenWeekdays(null)).toBeNull()
  })
})

describe('parseSeasonWindow distinguishes closures from advice', () => {
  it('parses real closures', () => {
    expect(parseSeasonWindow('Open April-October only.')).toEqual({ startMonth: 4, endMonth: 10 })
    expect(parseSeasonWindow('Rooftop open May-September only.')).toEqual({
      startMonth: 5,
      endMonth: 9,
    })
  })

  it('ignores advisory prose, even when it mentions months or "closed"/"only"', () => {
    expect(parseSeasonWindow('Best April-October.')).toBeNull()
    expect(parseSeasonWindow('Booking essential April-October.')).toBeNull()
    // the trap: has a month range AND "closed" AND "only", but it's advice
    expect(parseSeasonWindow('Best April-October. Road closed to cars on Sundays only.')).toBeNull()
  })
})

describe('isClosedForTrip', () => {
  it('excludes a summer-only rooftop from an off-season trip', () => {
    const ceresio = byName('Ceresio 7') // "Rooftop open May-September only"
    const january = [new Date(2026, 0, 10), new Date(2026, 0, 11)]
    const july = [new Date(2026, 6, 10), new Date(2026, 6, 11)]
    expect(isClosedForTrip(ceresio, january)).toBe(true)
    expect(isClosedForTrip(ceresio, july)).toBe(false)
  })

  it('never excludes when there is no date-based signal', () => {
    const pantheon = byName('Pantheon')
    expect(isClosedForTrip(pantheon, [new Date(2026, 0, 1)])).toBe(false)
  })
})
