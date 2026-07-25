import {
  addDays,
  defaultStartDate,
  formatShortDate,
  toDateInputValue,
} from '../lib/dates'

export const TRIP_DAYS = 3

const STORAGE_KEY = 'trip-planner:plan'

export type TripPlan = {
  startDate: string
  location: string
  city: string
  interests: string[]
  pace: string
  budget: string
}

/** Date metadata for one trip day. The itinerary supplies the stops and theme separately. */
export type TripDayView = {
  day: number
  iso: string
  dateLabel: string
  weekday: string
}

export function defaultTripPlan(): TripPlan {
  return {
    startDate: defaultStartDate(),
    location: 'Italy',
    city: 'Rome',
    interests: [],
    pace: 'Balanced',
    budget: '€€',
  }
}

export function saveTripPlan(plan: TripPlan) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
}

export function loadTripPlan(): TripPlan | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TripPlan>
    if (typeof parsed.startDate !== 'string' || !parsed.startDate) return null
    return { ...defaultTripPlan(), ...parsed, startDate: parsed.startDate }
  } catch {
    return null
  }
}

export function buildTripDays(startDate: string): TripDayView[] {
  return Array.from({ length: TRIP_DAYS }, (_, index) => {
    const date = addDays(startDate, index)
    return {
      day: index + 1,
      iso: toDateInputValue(date),
      dateLabel: formatShortDate(date),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    }
  })
}

export function tripRangeLabel(startDate: string) {
  const start = addDays(startDate, 0)
  const end = addDays(startDate, TRIP_DAYS - 1)
  const sameYear = start.getFullYear() === end.getFullYear()
  const startLabel = sameYear
    ? formatShortDate(start)
    : start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
  const endLabel = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startLabel} – ${endLabel}`
}

export function tripTitle(city: string) {
  return `${TRIP_DAYS} Day Trip to ${city}`
}
