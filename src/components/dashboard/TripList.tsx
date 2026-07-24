import { useState } from 'react'
import { type DayPlan } from '../../data/tripView'
import DayAccordion from './DayAccordion'
import StopCardCompact from './itinerary/StopCardCompact'
import { TravelConnector } from './itinerary/parts'
import { useDragReorder } from './itinerary/useDragReorder'
import Panel from './Panel'

type TripListProps = {
  days: DayPlan[]
  mapDay: number
  routeDay: number | null
  onMapDayChange: (day: number) => void
  onReorderStops: (dayIndex: number, fromIndex: number, toIndex: number) => void
  onToggleDayRoute: (day: number) => void
  onFocusPlace: (id: string) => void
}

export default function TripList({
  days,
  mapDay,
  routeDay,
  onMapDayChange,
  onReorderStops,
  onToggleDayRoute,
  onFocusPlace,
}: TripListProps) {
  const [openDayIso, setOpenDayIso] = useState<string | null>(days[0]?.iso ?? null)
  const { setDragging, finishDrag, entryDragProps } = useDragReorder(onReorderStops)

  function openDay(day: DayPlan) {
    setOpenDayIso(day.iso)
    onMapDayChange(day.day)
  }

  function toggleDay(day: DayPlan) {
    if (openDayIso === day.iso) {
      setOpenDayIso(null)
      return
    }
    openDay(day)
  }

  return (
    <Panel title="Itinerary" className="trip-list-panel">
      <div className="itinerary__days trip-list__days">
        {days.map((day, dayIndex) => {
          const open = openDayIso === day.iso
          const panelId = `map-itinerary-day-panel-${day.iso}`
          const dayRouteActive = routeDay === day.day

          return (
            <DayAccordion
              key={day.iso}
              iso={day.iso}
              dayNumber={day.day}
              activityCount={day.stops.length}
              open={open}
              mapActive={mapDay === day.day}
              onToggle={() => toggleDay(day)}
              panelId={panelId}
              action={
                <button
                  type="button"
                  className={`trip-list__route-btn${
                    dayRouteActive ? ' trip-list__route-btn--active' : ''
                  }`}
                  disabled={day.stops.length < 2}
                  aria-pressed={dayRouteActive}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleDayRoute(day.day)
                    if (!open) openDay(day)
                  }}
                >
                  {dayRouteActive ? 'Hide route' : 'View route'}
                </button>
              }
            >
              <ol className="trip-list trip-list--compact">
                {day.stops.map((stop, localIndex) => {
                  const { place } = stop
                  const next = day.stops[localIndex + 1]?.place
                  const dragProps = entryDragProps(dayIndex, localIndex)

                  return (
                    <li key={place.id} {...dragProps}>
                      <StopCardCompact
                        stop={stop}
                        index={localIndex}
                        onDragStart={() => setDragging({ day: dayIndex, index: localIndex })}
                        onDragEnd={finishDrag}
                        onFocusPlace={(id) => {
                          onMapDayChange(day.day)
                          onFocusPlace(id)
                        }}
                      />
                      {next ? <TravelConnector from={place} to={next} showToLabel={false} /> : null}
                    </li>
                  )
                })}
              </ol>
            </DayAccordion>
          )
        })}
      </div>
    </Panel>
  )
}
