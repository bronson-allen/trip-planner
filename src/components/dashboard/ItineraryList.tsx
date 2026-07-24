import { useState } from 'react'
import { parseIsoDate, formatWeekdayLongDate } from '../../lib/dates'
import { type DayPlan } from '../../data/tripView'
import StopCardDetailed from './itinerary/StopCardDetailed'
import { TravelConnector } from './itinerary/parts'
import { useDragReorder } from './itinerary/useDragReorder'

type ItineraryListProps = {
  days: DayPlan[]
  onReorderStops: (dayIndex: number, fromIndex: number, toIndex: number) => void
}

export default function ItineraryList({ days, onReorderStops }: ItineraryListProps) {
  const [activeDay, setActiveDay] = useState(days[0]?.day ?? 1)
  const { setDragging, finishDrag, entryDragProps } = useDragReorder(onReorderStops)

  const totalStops = days.reduce((sum, day) => sum + day.stops.length, 0)
  const activeDayPlan = days.find((day) => day.day === activeDay) ?? days[0]
  const activeDayIndex = days.findIndex((day) => day.day === activeDayPlan?.day)

  if (!activeDayPlan) {
    return (
      <section className="itinerary itinerary--detailed" aria-label="Trip itinerary">
        <p className="itinerary__summary">No itinerary yet</p>
      </section>
    )
  }

  const dateTitle = formatWeekdayLongDate(parseIsoDate(activeDayPlan.iso))

  return (
    <section className="itinerary itinerary--detailed" aria-label="Trip itinerary">

      <div className="itinerary-tabs" role="tablist" aria-label="Itinerary days">
        {days.map((day) => {
          const selected = day.day === activeDayPlan.day
          const tabId = `itinerary-tab-${day.day}`
          const panelId = `itinerary-panel-${day.day}`

          return (
            <button
              key={day.iso}
              type="button"
              role="tab"
              id={tabId}
              className={`itinerary-tab${selected ? ' itinerary-tab--active' : ''}`}
              aria-selected={selected}
              aria-controls={panelId}
              onClick={() => setActiveDay(day.day)}
            >
              Day {day.day}
            </button>
          )
        })}
      </div>

      <div
        id={`itinerary-panel-${activeDayPlan.day}`}
        role="tabpanel"
        aria-labelledby={`itinerary-tab-${activeDayPlan.day}`}
        className="itinerary-day-panel"
      >
        <header className="itinerary-day-header">
          <h2 className="itinerary-day-header__title">{dateTitle}</h2>
          <p className="itinerary-day-header__meta">
            {activeDayPlan.stops.length === 1
              ? '1 activity'
              : `${activeDayPlan.stops.length} activities`}
            {activeDayPlan.theme ? (
              <>
                <span aria-hidden="true"> · </span>
                {activeDayPlan.theme}
              </>
            ) : null}
          </p>
        </header>

        <ol className="trip-list trip-list--detailed">
          {activeDayPlan.stops.map((stop, localIndex) => {
            const { place } = stop
            const next = activeDayPlan.stops[localIndex + 1]?.place
            const dragProps = entryDragProps(activeDayIndex, localIndex)

            return (
              <li key={place.id} {...dragProps}>
                <StopCardDetailed
                  stop={stop}
                  index={localIndex}
                  onDragStart={() =>
                    setDragging({ day: activeDayIndex, index: localIndex })
                  }
                  onDragEnd={finishDrag}
                />
                {next ? <TravelConnector from={place} to={next} /> : null}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
