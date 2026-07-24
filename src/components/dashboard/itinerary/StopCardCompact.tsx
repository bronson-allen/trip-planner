import { formatDuration, formatPlaceType } from '../../../data/places'
import { SLOT_LABEL } from '../../../data/tripView'
import type { ScheduledStop } from '../../../lib/itinerary'
import { DragHandle, PlacePin } from './parts'

type StopCardCompactProps = {
  stop: ScheduledStop
  index: number
  onDragStart: () => void
  onDragEnd: () => void
  onFocusPlace: (id: string) => void
}

export default function StopCardCompact({
  stop,
  index,
  onDragStart,
  onDragEnd,
  onFocusPlace,
}: StopCardCompactProps) {
  const { place, slot } = stop
  const durationLabel = place.duration.inferred
    ? `~${formatDuration(place.duration.minutes)}`
    : formatDuration(place.duration.minutes)

  return (
    <div className="trip-stop-row">
      <DragHandle
        label={`Drag to reorder ${place.name}`}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />

      <div className="trip-stop-compact">
        <PlacePin index={index + 1} />

        <div className="trip-stop-compact__copy">
          <button
            type="button"
            className="trip-stop-compact__name"
            onClick={() => onFocusPlace(place.id)}
          >
            {place.name}
          </button>
          <p className="trip-stop-compact__meta">
            {SLOT_LABEL[slot]} · {durationLabel} · {formatPlaceType(place.type)}
          </p>
        </div>

        {place.neighborhood ? (
          <span className="trip-stop-compact__place">{place.neighborhood}</span>
        ) : null}
      </div>
    </div>
  )
}
