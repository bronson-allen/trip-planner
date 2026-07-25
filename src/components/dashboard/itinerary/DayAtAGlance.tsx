import { useMemo } from 'react'
import {
  buildDayGlance,
  formatClock,
  formatClockParts,
  formatDistanceParts,
  formatSpan,
  type GlanceBlock,
} from '../../../lib/trip/dayGlance'
import type { DayPlan } from '../../../lib/trip/tripState'
import { WalkIcon } from '../shared/parts'
import Panel from '../shared/Panel'

type DayAtAGlanceProps = {
  /** Every day in the trip, for the day picker. */
  days: DayPlan[]
  day: DayPlan | undefined
  highlightPlaceId: string | null
  /** Whether the map is currently drawing this day's walking route. */
  routeActive: boolean
  onHighlightPlace: (placeId: string | null) => void
  onFocusPlace: (placeId: string) => void
  onSelectDay: (day: number) => void
  onToggleRoute: () => void
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path
        d="M12 4.5 21 19.5H3L12 4.5Zm0 5v4.6m0 2.3v.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <p className="glance-stat">
      <span className="glance-stat__value">
        {value}
        {unit ? <span className="glance-stat__unit">{unit}</span> : null}
      </span>
      {label ? <span className="glance-stat__label">{label}</span> : null}
    </p>
  )
}

function TimelineBlock({
  block,
  highlighted,
  onHighlightPlace,
  onFocusPlace,
}: {
  block: GlanceBlock
  highlighted: boolean
  onHighlightPlace: (placeId: string | null) => void
  onFocusPlace: (placeId: string) => void
}) {
  const { place } = block.stop
  const spanLabel = formatSpan(place.duration.minutes)

  return (
    <button
      type="button"
      className={`glance-block${highlighted ? ' glance-block--active' : ''}`}
      title={block.advisory ?? undefined}
      aria-label={`${place.name}, ${formatClock(block.startMinutes)} for ${spanLabel}${
        block.advisory ? `. ${block.advisory}` : ''
      }`}
      onMouseEnter={() => onHighlightPlace(place.id)}
      onMouseLeave={() => onHighlightPlace(null)}
      onFocus={() => onHighlightPlace(place.id)}
      onBlur={() => onHighlightPlace(null)}
      onClick={() => onFocusPlace(place.id)}
    >
      <span className="glance-block__name">
        {place.name} <span className="glance-block__span">· {spanLabel}</span>
      </span>
      {block.advisory ? (
        <span className="glance-block__warn">
          <WarnIcon />
        </span>
      ) : null}
    </button>
  )
}

/**
 * The map view's right-hand column: the same day the map is plotting, laid out on a clock.
 * Every value shown comes from `buildDayGlance`, which reads the already-resolved day — this
 * component makes no scheduling decisions of its own.
 */
export default function DayAtAGlance({
  days,
  day,
  highlightPlaceId,
  routeActive,
  onHighlightPlace,
  onFocusPlace,
  onSelectDay,
  onToggleRoute,
}: DayAtAGlanceProps) {
  const glance = useMemo(() => (day ? buildDayGlance(day) : null), [day])

  const dayPicker = day ? (
    <label className="glance__picker">
      <span className="visually-hidden">Day to view</span>
      <select
        className="glance__select"
        value={day.day}
        onChange={(event) => onSelectDay(Number(event.target.value))}
      >
        {days.map((option) => (
          <option key={option.iso} value={option.day}>
            Day {option.day}
          </option>
        ))}
      </select>
      <span className="glance__caret" aria-hidden="true">
        ⌄
      </span>
    </label>
  ) : null

  const routeButton = day ? (
    <button
      type="button"
      className={`trip-list__route-btn${routeActive ? ' trip-list__route-btn--active' : ''}`}
      disabled={day.stops.length < 2}
      aria-pressed={routeActive}
      onClick={onToggleRoute}
    >
      {routeActive ? 'Hide route' : 'View route'}
    </button>
  ) : null

  if (!day || !glance || glance.entries.length === 0) {
    return (
      <Panel title="Day at a glance" className="glance-panel" action={dayPicker}>
        <div className="glance-stats">
          <p className="glance__empty">
            Nothing scheduled for this day yet. Add a stop and its timing appears here.
          </p>
          {routeButton}
        </div>
      </Panel>
    )
  }

  const walking = formatDistanceParts(glance.walkingMeters)
  const starts = glance.startMinutes === null ? null : formatClockParts(glance.startMinutes)
  const ends = glance.endMinutes === null ? null : formatClockParts(glance.endMinutes)
  const timeRange =
    starts && ends
      ? `${starts.time}${starts.suffix} – ${ends.time}${ends.suffix}`
      : null

  return (
    <Panel
      title="Day at a glance"
      className="glance-panel"
      action={dayPicker}
    >
      <div className="glance-stats">
        <div className="glance-stats__labels">
          <Stat value={walking.value} unit={walking.unit} label="distance" />
          <Stat value={'€'.repeat(glance.priceLevel)} unit="" label="est. cost" />
          {timeRange ? <Stat value={timeRange} unit="" label="" /> : null}
        </div>
        {routeButton}
      </div>

      <ol className="glance-timeline">
        {glance.entries.map((entry) =>
          entry.kind === 'gap' ? (
            <li className="glance-row" key={`gap-${entry.startMinutes}`}>
              <div className="glance-row__line">
                <span className="glance-row__time">{formatClock(entry.startMinutes)}</span>
                <p className="glance-gap">
                  {formatSpan(entry.endMinutes - entry.startMinutes)} gap · free time
                </p>
              </div>
            </li>
          ) : (
            <li className="glance-row" key={entry.stop.place.id}>
              {entry.travelMinutes !== null ? (
                <p className="glance-travel">
                  <WalkIcon />
                  {entry.travelMinutes} min walk
                </p>
              ) : null}
              <div className="glance-row__line">
                <span className="glance-row__time">{formatClock(entry.startMinutes)}</span>
                <TimelineBlock
                  block={entry}
                  highlighted={highlightPlaceId === entry.stop.place.id}
                  onHighlightPlace={onHighlightPlace}
                  onFocusPlace={onFocusPlace}
                />
              </div>
            </li>
          ),
        )}
      </ol>
    </Panel>
  )
}
