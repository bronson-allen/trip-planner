import { formatDuration, formatPlaceType } from '../../../data/places'
import type { ScheduledStop } from '../../../lib/trip/itinerary'
import { SLOT_LABEL } from '../../../lib/trip/tripState'
import { DragHandle, PlacePin, TrashIcon, ClockIcon } from '../shared/parts'

type StopCardCompactProps = {
  stop: ScheduledStop
  index: number
  onDragStart: () => void
  onDragEnd: () => void
  onFocusPlace: (id: string) => void
  onRemove: () => void
}

export default function StopCardCompact({
  stop,
  index,
  onDragStart,
  onDragEnd,
  onFocusPlace,
  onRemove,
}: StopCardCompactProps) {
  const { place, slot } = stop
  const durationLabel = place.duration.inferred
    ? `~${formatDuration(place.duration.minutes)}`
    : formatDuration(place.duration.minutes)

  return (
    <div className="trip-stop-row">
      <div className="trip-stop-compact">
        <PlacePin index={index + 1} />

        <div className="trip-stop-compact__copy">
          <div className="trip-stop-compact__title">
            <button
              type="button"
              className="trip-stop-compact__name"
              onClick={() => onFocusPlace(place.id)}
            >
              {place.name}
            </button>
            {place.neighborhood ? (
              <span className="trip-stop-compact__place">
                {place.neighborhood} neighborhood
              </span>
            ) : null}
          </div>
          <p className="trip-stop-compact__meta">
            <span>{SLOT_LABEL[slot]}</span>
            <span className="trip-stop-compact__meta-sep" aria-hidden="true">
              ·
            </span>
            <span className="trip-stop__duration-value">
              <ClockIcon size={11} />
              <span>{durationLabel}</span>
            </span>
            <span className="trip-stop-compact__meta-sep" aria-hidden="true">
              ·
            </span>
            <span>{formatPlaceType(place.type)}</span>
          </p>
        </div>

        <div className="trip-stop-compact__side">
          <DragHandle
            label={`Drag to reorder ${place.name}`}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </div>

        <button
          type="button"
          className="trip-stop__remove"
          aria-label={`Remove ${place.name}`}
          title="Remove stop"
          onClick={onRemove}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}
