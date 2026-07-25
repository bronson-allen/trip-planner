import { formatWeekdayLongDate, parseIsoDate } from '../../../lib/dates'
import { type DayPlan } from '../../../lib/trip/tripState'
import StopCardCompact from './StopCardCompact'
import { TravelConnector } from '../shared/parts'
import { useDragReorder } from './useDragReorder'
import Panel from '../shared/Panel'

type TripListProps = {
  days: DayPlan[]
  mapDay: number
  onMapDayChange: (day: number) => void
  onReorderStops: (dayIndex: number, fromIndex: number, toIndex: number) => void
  onFocusPlace: (id: string) => void
  onRemoveStop: (placeId: string) => void
}

export default function TripList({
  days,
  mapDay,
  onMapDayChange,
  onReorderStops,
  onFocusPlace,
  onRemoveStop,
}: TripListProps) {
  const { setDragging, finishDrag, entryDragProps } = useDragReorder(onReorderStops)

  return (
    <Panel title="Itinerary" className="trip-list-panel">
      <div className="itinerary__days trip-list__days">
        {days.map((day, dayIndex) => {
          const activityLabel =
            day.stops.length === 1 ? '1 activity' : `${day.stops.length} activities`

          return (
            <section
              key={day.iso}
              className={`itinerary-day${mapDay === day.day ? ' itinerary-day--map-active' : ''}`}
            >
              <div className="itinerary-day__bar">
                <h2 className="itinerary-day__heading itinerary-day__heading--static">
                  <span className="itinerary-day__title">
                    {formatWeekdayLongDate(parseIsoDate(day.iso))}
                  </span>
                  <span className="itinerary-day__meta">
                    Day {day.day} · {activityLabel}
                  </span>
                </h2>
              </div>

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
                        onRemove={() => onRemoveStop(place.id)}
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
            </section>
          )
        })}
      </div>
    </Panel>
  )
}
