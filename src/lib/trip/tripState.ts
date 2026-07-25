import { PLACES, type NormalizedPlace } from '../../data/places'
import { buildTripDays, type TripPlan } from '../../data/tripPlan'
import { parseIsoDate } from '../dates'
import { estimateTravel } from '../geo/directions'
import {
  buildItinerary,
  dayTheme,
  type ItineraryDay,
  type ScheduledStop,
  type SlotKind,
} from './itinerary'
import { planToPrefs } from './planPrefs'
import type { TripPrefs } from '../places/score'

export type PlannedStop = {
  placeId: string
  slot: SlotKind
}

export type TripState = {
  city: string
  startDate: string
  prefs: TripPrefs
  days: Array<{ day: number; stops: PlannedStop[] }>
}

/** One day of the itinerary as the dashboard renders it. */
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

const STORAGE_KEY = 'trip-planner:trip-state'

/** Builds the light, serializable itinerary state used by the UI and assistant API. */
export function initTripState(plan: TripPlan, places: NormalizedPlace[] = PLACES): TripState {
  const prefs = planToPrefs(plan)
  const dates = buildTripDays(plan.startDate)
  const itinerary = buildItinerary(places, prefs, {
    city: plan.city,
    tripDates: dates.map((date) => parseIsoDate(date.iso)),
  })

  return {
    city: plan.city,
    startDate: plan.startDate,
    prefs,
    days: itinerary.days.map((day) => ({
      day: day.day,
      stops: day.stops.map((stop) => ({ placeId: stop.place.id, slot: stop.slot })),
    })),
  }
}

/** Resolves ids and recomputes all derived display data, including travel estimates. */
export function resolveTrip(state: TripState, places: NormalizedPlace[] = PLACES): DayPlan[] {
  const byId = new Map(places.map((place) => [place.id, place]))
  const dates = buildTripDays(state.startDate)

  return dates.map((date) => {
    const plannedDay = state.days.find((day) => day.day === date.day)
    const stops: ScheduledStop[] = []

    for (const plannedStop of plannedDay?.stops ?? []) {
      const place = byId.get(plannedStop.placeId)
      if (!place) continue
      stops.push({ place, slot: plannedStop.slot, travelFromPrev: null })
    }

    for (let index = 1; index < stops.length; index += 1) {
      const previous = stops[index - 1].place
      const current = stops[index].place
      stops[index].travelFromPrev = estimateTravel(previous, current)
    }

    const itineraryDay: ItineraryDay = { day: date.day, stops }
    return {
      ...date,
      stops,
      theme: dayTheme(itineraryDay, state.city),
    }
  })
}

export function saveTripState(state: TripState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadTripState(): TripState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TripState>
    if (
      typeof parsed.city !== 'string' ||
      typeof parsed.startDate !== 'string' ||
      !parsed.prefs ||
      !Array.isArray(parsed.days)
    ) {
      return null
    }
    return parsed as TripState
  } catch {
    return null
  }
}
