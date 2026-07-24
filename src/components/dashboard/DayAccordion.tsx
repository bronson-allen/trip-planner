import type { ReactNode } from 'react'
import { parseIsoDate, formatWeekdayLongDate } from '../../lib/dates'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="itinerary-day__chevron"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type DayAccordionProps = {
  iso: string
  dayNumber: number
  activityCount: number
  open: boolean
  mapActive?: boolean
  onToggle: () => void
  panelId: string
  action?: ReactNode
  children: ReactNode
}

export default function DayAccordion({
  iso,
  dayNumber,
  activityCount,
  open,
  mapActive = false,
  onToggle,
  panelId,
  action,
  children,
}: DayAccordionProps) {
  const dateTitle = formatWeekdayLongDate(parseIsoDate(iso))
  const activityLabel =
    activityCount === 1 ? '1 activity' : `${activityCount} activities`

  return (
    <section
      className={`itinerary-day${open ? ' itinerary-day--open' : ''}${
        mapActive ? ' itinerary-day--map-active' : ''
      }`}
    >
      <div className="itinerary-day__bar">
        <h2 className="itinerary-day__heading">
          <button
            type="button"
            className="itinerary-day__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            <Chevron open={open} />
            <span className="itinerary-day__toggle-copy">
              <span className="itinerary-day__title">{dateTitle}</span>
              <span className="itinerary-day__meta">
                Day {dayNumber} · {activityLabel}
              </span>
            </span>
          </button>
        </h2>
        {action ? <div className="itinerary-day__action">{action}</div> : null}
      </div>

      {open ? (
        <div id={panelId} className="itinerary-day__panel">
          {children}
        </div>
      ) : null}
    </section>
  )
}
