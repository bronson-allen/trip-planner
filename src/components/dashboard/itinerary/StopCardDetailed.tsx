import { formatDuration, formatPlaceType } from '../../../data/places'
import { SLOT_LABEL } from '../../../data/tripView'
import type { ScheduledStop } from '../../../lib/itinerary'
import { cardBadges } from '../../../lib/tags'
import { DragHandle, hoursLine, PlaceImage, PlacePin } from './parts'

type StopCardDetailedProps = {
  stop: ScheduledStop
  index: number
  onDragStart: () => void
  onDragEnd: () => void
  onFocusPlace?: (id: string) => void
}

function StarIcon() {
  return (
    <svg className="trip-stop__star" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 1.5l2.35 4.76 5.25.76-3.8 3.7.9 5.24L10 13.52l-4.7 2.44.9-5.24-3.8-3.7 5.25-.76L10 1.5z"
      />
    </svg>
  )
}

export default function StopCardDetailed({
  stop,
  index,
  onDragStart,
  onDragEnd,
  onFocusPlace,
}: StopCardDetailedProps) {
  const { place, slot } = stop
  const durationLabel = place.duration.inferred
    ? `~${formatDuration(place.duration.minutes)}`
    : formatDuration(place.duration.minutes)
  const badges = cardBadges(place.tags)

  return (
    <div className="trip-stop-row">
      <DragHandle
        label={`Drag to reorder ${place.name}`}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />

      <div className="trip-stop">
        <PlacePin index={index + 1} />

        <div className="trip-stop__body">
          <div className="trip-stop__media">
            <PlaceImage place={place} />
          </div>

          <div className="trip-stop__text">
            {onFocusPlace ? (
              <button
                type="button"
                className="trip-stop__name-btn"
                onClick={() => onFocusPlace(place.id)}
              >
                {place.name}
              </button>
            ) : (
              <p className="trip-stop__name">{place.name}</p>
            )}

            <p className="trip-stop__meta">
              <span className="trip-stop__slot">{SLOT_LABEL[slot]}</span>
              <span aria-hidden="true"> · </span>
              {hoursLine(place)}
              <span aria-hidden="true"> · </span>
              {formatPlaceType(place.type)}
              {place.neighborhood ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {place.neighborhood}
                </>
              ) : null}
            </p>

            <p className="trip-stop__description">{place.description}</p>

            <p className="trip-stop__rating">
              <StarIcon />
              <span>{place.rating.toFixed(1)}</span>
            </p>
            <p className="trip-stop__cost">{place.priceRange}</p>
            <p className="trip-stop__duration">
              {durationLabel} visit
              {place.bookingRequired ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="trip-stop__booking">Booking required</span>
                </>
              ) : null}
            </p>

            {place.seasonalNotes ? (
              <p className="trip-stop__seasonal">{place.seasonalNotes}</p>
            ) : null}
          </div>
        </div>

        {badges.length > 0 ? (
          <ul className="trip-stop__tags">
            {badges.map((badge) => (
              <li
                key={badge.tag}
                className={`trip-stop__pill trip-stop__pill--${badge.tag}`}
              >
                {badge.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
