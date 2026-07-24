import { parseIsoDate } from '../lib/dates'
import { buildItinerary, dayTheme, type ScheduledStop, type SlotKind } from '../lib/itinerary'
import { planToPrefs } from '../lib/planPrefs'
import { PLACES } from './places'
import { buildTripDays, type TripPlan } from './tripPlan'

/** One day of the itinerary as the dashboard renders it: date metadata + theme + ordered stops. */
export type DayPlan = {
  day: number
  iso: string
  dateLabel: string
  weekday: string
  theme: string
  stops: ScheduledStop[]
}

/** Human labels for each slot in the day's rhythm. */
export const SLOT_LABEL: Record<SlotKind, string> = {
  morning: 'Morning',
  lunch: 'Lunch',
  afternoon: 'Afternoon',
  evening: 'Evening',
  dinner: 'Dinner',
}

/**
 * Turns the user's plan into the day-grouped view model the dashboard consumes. Runs the
 * deterministic engine once (rank -> schedule) and zips its days onto the trip's calendar dates.
 */
export function buildDayPlans(plan: TripPlan): DayPlan[] {
  const dates = buildTripDays(plan.startDate)
  const itinerary = buildItinerary(PLACES, planToPrefs(plan), {
    city: plan.city,
    tripDates: dates.map((date) => parseIsoDate(date.iso)),
  })
  return dates.map((date, index) => {
    const day = itinerary.days[index]
    return {
      ...date,
      stops: day?.stops ?? [],
      theme: day ? dayTheme(day, plan.city) : plan.city,
    }
  })
}
