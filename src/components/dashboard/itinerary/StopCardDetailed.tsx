import { formatDuration, formatPlaceType } from '../../../data/places'
import type { ScheduledStop } from '../../../lib/trip/itinerary'
import { SLOT_LABEL } from '../../../lib/trip/tripState'
import { cardBadges } from '../../../lib/places/tags'
import { DragHandle, hoursLine, PlaceImage, PlacePin, TrashIcon, ClockIcon } from '../shared/parts'

type StopCardDetailedProps = {
  stop: ScheduledStop
  index: number
  onDragStart: () => void
  onDragEnd: () => void
  onFocusPlace?: (id: string) => void
  onRemove: () => void
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
  onRemove,
}: StopCardDetailedProps) {
  const { place, slot } = stop
  const durationLabel = place.duration.inferred
    ? `~${formatDuration(place.duration.minutes)}`
    : formatDuration(place.duration.minutes)
  const badges = cardBadges(place.tags)

  return (
    <div className="trip-stop-row">
      <div className="trip-stop">
        <PlacePin index={index + 1} />

        <div className="trip-stop__actions">
          <DragHandle
            label={`Drag to reorder ${place.name}`}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </div>

        <div className="trip-stop__body">
          <div className="trip-stop__media">
            <PlaceImage place={place} />
          </div>

          <div className="trip-stop__text">
            <div className="trip-stop__title">
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
              {place.neighborhood ? (
                <span className="trip-stop__place">
                  {place.neighborhood} neighborhood
                </span>
              ) : null}
            </div>

            <p className="trip-stop__meta">
              <span className="trip-stop__slot">{SLOT_LABEL[slot]}</span>
              <span aria-hidden="true"> · </span>
              {hoursLine(place)}
              <span aria-hidden="true"> · </span>
              {formatPlaceType(place.type)}
            </p>

            <p className="trip-stop__description">{place.description}</p>

            <p className="trip-stop__rating">
              <StarIcon />
              <span>{place.rating.toFixed(1)}</span>
            </p>
            <p className="trip-stop__cost">{place.priceRange}</p>
            <p className="trip-stop__duration">
              <span className="trip-stop__duration-value">
                <ClockIcon />
                {durationLabel} visit
              </span>
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

        <div className="trip-stop__footer">
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
          ) : (
            <span />
          )}
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
    </div>
  )
}
