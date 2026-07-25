import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/dashboard/shell/DashboardHeader'
import Sidebar from '../components/dashboard/shell/Sidebar'
import DayAtAGlance from '../components/dashboard/itinerary/DayAtAGlance'
import ItineraryList from '../components/dashboard/itinerary/ItineraryList'
import TripList from '../components/dashboard/itinerary/TripList'
import TripCalendar from '../components/dashboard/calendar/TripCalendar'
import ExplorePlaces from '../components/dashboard/explore/ExplorePlaces'
import NaviAssistant from '../components/dashboard/assistant/NaviAssistant'
import TripMap, { type MapStop } from '../components/dashboard/map/TripMap'
import { PLACES, type NormalizedPlace } from '../data/places'
import { type RouteSegment } from '../lib/geo/directions'
import {
  defaultTripPlan,
  loadTripPlan,
  tripRangeLabel,
  tripTitle,
} from '../data/tripPlan'
import {
  initTripState,
  loadTripState,
  resolveTrip,
  saveTripState,
} from '../lib/trip/tripState'
import {
  addStop,
  removeStop,
  reorderStop,
  type MutationResult,
  type ToolResult,
} from '../lib/trip/tools'
import '../components/dashboard/Dashboard.css'

type DashboardView = 'map' | 'list'

/** A confirmation of the last itinerary edit. The token lets an identical message re-appear. */
type Toast = { message: string; token: number }

const TOAST_MS = 3600

export default function DashboardPage() {
  const navigate = useNavigate()
  const [plan] = useState(() => loadTripPlan() ?? defaultTripPlan())
  const [view, setView] = useState<DashboardView>('map')
  const [tripState, setTripState] = useState(() => {
    const saved = loadTripState()
    const initial = initTripState(plan)
    const samePlan =
      saved?.city === initial.city &&
      saved.startDate === initial.startDate &&
      JSON.stringify(saved.prefs) === JSON.stringify(initial.prefs)
    return samePlan ? saved : initial
  })
  const [mapDay, setMapDay] = useState(1)
  const [routeDay, setRouteDay] = useState<number | null>(null)
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [highlightPlaceId, setHighlightPlaceId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const visibleDay = routeDay ?? mapDay
  const days = useMemo(() => resolveTrip(tripState), [tripState])

  useEffect(() => {
    saveTripState(tripState)
  }, [tripState])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

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
    const placeId = tripState.days[dayIndex]?.stops[fromIndex]?.placeId
    if (!placeId) return
    applyMutation(reorderStop(tripState, PLACES, { placeId, toIndex }))
  }

  function applyMutation(result: ToolResult<MutationResult>) {
    if (result.ok) setTripState(result.value.tripState)
  }

  /** Mutations started from Explore happen away from the itinerary, so they report back. */
  function applyMutationWithToast(result: ToolResult<MutationResult>) {
    applyMutation(result)
    setToast({
      message: result.ok ? result.value.summary : result.error.message,
      token: Date.now(),
    })
  }

  function removePlace(placeId: string) {
    applyMutation(removeStop(tripState, PLACES, placeId))
  }

  function addPlace(placeId: string, day: number) {
    applyMutationWithToast(addStop(tripState, PLACES, { placeId, day }))
  }

  /** A place outside the base city can't join this trip, so offer a new trip anchored there. */
  function planCity(city: string) {
    navigate(`/?city=${encodeURIComponent(city)}`)
  }

  function focusPlace(id: string) {
    setFocusPlaceId(id)
    setFocusToken((token) => token + 1)
  }

  /** Switching days keeps the route drawn if it was already on, just for the new day. */
  function selectDay(day: number) {
    setMapDay(day)
    setRouteDay((current) => (current === null ? null : day))
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
          <ItineraryList
            days={days}
            onReorderStops={reorderStops}
            onRemoveStop={removePlace}
          />
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
              highlightPlaceId={highlightPlaceId}
            />
            <div className="trip-detail">
              <TripList
                days={days}
                mapDay={mapDay}
                onMapDayChange={setMapDay}
                onReorderStops={reorderStops}
                onFocusPlace={focusPlace}
                onRemoveStop={removePlace}
              />
              <DayAtAGlance
                days={days}
                day={days.find((day) => day.day === visibleDay)}
                highlightPlaceId={highlightPlaceId}
                routeActive={routeDay === visibleDay}
                onHighlightPlace={setHighlightPlaceId}
                onFocusPlace={focusPlace}
                onSelectDay={selectDay}
                onToggleRoute={() => toggleDayRoute(visibleDay)}
              />
            </div>
          </>
        )}
      </div>

      <aside
        className={`dashboard__aside${view === 'list' ? ' dashboard__aside--list' : ''}`}
        aria-label="Trip schedule and assistant"
      >
        <TripCalendar startDate={plan.startDate} days={days} />
        {view === 'list' ? (
          <ExplorePlaces
            tripState={tripState}
            onAddPlace={addPlace}
            onPlanCity={planCity}
          />
        ) : (
          <NaviAssistant tripState={tripState} onTripStateChange={setTripState} />
        )}
      </aside>

      <div className="toast-region" role="status" aria-live="polite">
        {toast ? <p className="toast">{toast.message}</p> : null}
      </div>
    </div>
  )
}
