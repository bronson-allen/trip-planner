import { useMemo, useState } from 'react'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import ItineraryList from '../components/dashboard/ItineraryList'
import NaviAssistant from '../components/dashboard/NaviAssistant'
import Sidebar from '../components/dashboard/Sidebar'
import TripCalendar from '../components/dashboard/TripCalendar'
import TripList from '../components/dashboard/TripList'
import TripMap, { type MapStop } from '../components/dashboard/TripMap'
import { type NormalizedPlace } from '../data/places'
import { buildDayPlans } from '../data/tripView'
import { type RouteSegment } from '../lib/directions'
import {
  defaultTripPlan,
  loadTripPlan,
  tripRangeLabel,
  tripTitle,
} from '../data/tripPlan'
import '../components/dashboard/Dashboard.css'

type DashboardView = 'map' | 'list'

/** Moves an array item from one index to another, returning a new array. */
function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export default function DashboardPage() {
  const [plan] = useState(() => loadTripPlan() ?? defaultTripPlan())
  const [view, setView] = useState<DashboardView>('map')
  const [days, setDays] = useState(() => buildDayPlans(plan))
  const [mapDay, setMapDay] = useState(1)
  const [routeDay, setRouteDay] = useState<number | null>(null)
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)

  const visibleDay = routeDay ?? mapDay

  /** Stops for the active day — what the map plots. */
  const mapStops = useMemo<MapStop[]>(() => {
    const day = days.find((entry) => entry.day === visibleDay)
    if (!day) return []
    return day.stops.map((stop, index) => ({
      place: stop.place,
      stopNumber: index + 1,
      day: day.day,
    }))
  }, [days, visibleDay])

  const routeDayPlaces = useMemo<NormalizedPlace[]>(() => {
    if (routeDay === null) return []
    const day = days.find((entry) => entry.day === routeDay)
    return day ? day.stops.map((stop) => stop.place) : []
  }, [routeDay, days])

  const routeSegments = useMemo<RouteSegment[]>(() => {
    const legs: RouteSegment[] = []
    for (let index = 0; index < routeDayPlaces.length - 1; index += 1) {
      legs.push({ from: routeDayPlaces[index], to: routeDayPlaces[index + 1] })
    }
    return legs
  }, [routeDayPlaces])

  function reorderStops(dayIndex: number, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    setDays((current) =>
      current.map((day, index) =>
        index === dayIndex ? { ...day, stops: move(day.stops, fromIndex, toIndex) } : day,
      ),
    )
  }

  function focusPlace(id: string) {
    setFocusPlaceId(id)
    setFocusToken((token) => token + 1)
  }

  function toggleDayRoute(day: number) {
    setMapDay(day)
    setRouteDay((current) => (current === day ? null : day))
  }

  return (
    <div className="dashboard">
      <Sidebar
        activeId={view}
        onSelect={(id) => {
          if (id === 'map' || id === 'list') setView(id)
        }}
      />

      <DashboardHeader title={tripTitle(plan.city)} duration={tripRangeLabel(plan.startDate)} />

      <div className={`dashboard__main${view === 'list' ? ' dashboard__main--list' : ''}`}>
        {view === 'list' ? (
          <ItineraryList days={days} onReorderStops={reorderStops} />
        ) : (
          <>
            <TripMap
              city={plan.city}
              stops={mapStops}
              dayLabel={`Day ${visibleDay}`}
              routePlaces={routeDayPlaces}
              segments={routeSegments}
              routeVisible={routeDay !== null}
              focusPlaceId={focusPlaceId}
              focusToken={focusToken}
            />
            <TripList
              days={days}
              mapDay={mapDay}
              routeDay={routeDay}
              onMapDayChange={setMapDay}
              onReorderStops={reorderStops}
              onToggleDayRoute={toggleDayRoute}
              onFocusPlace={focusPlace}
            />
          </>
        )}
      </div>

      <aside className="dashboard__aside" aria-label="Trip schedule and assistant">
        <TripCalendar startDate={plan.startDate} days={days} />
        <NaviAssistant />
      </aside>
    </div>
  )
}
