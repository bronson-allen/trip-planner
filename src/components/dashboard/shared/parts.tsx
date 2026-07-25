import { useState } from 'react'
import { MAPBOX_TOKEN } from '../../../config/mapbox'
import { placeImageUrl, type NormalizedPlace } from '../../../data/places'
import {
  estimateTravel,
  formatRouteDistance,
  formatRouteDuration,
} from '../../../lib/geo/directions'

export type DragRef = { day: number; index: number }

export function hoursLine(place: NormalizedPlace) {
  if (place.hours.confidence === 'unknown') {
    return place.hours.raw
      ? `Hours unclear · ${place.hours.raw}`
      : 'Hours not listed'
  }
  if (place.hours.confidence === 'partial') {
    return `Hours · ${place.hours.display}`
  }
  return `Open · ${place.hours.display}`
}

export function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <button
      type="button"
      className="trip-stop__drag"
      draggable
      aria-label={label}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', 'drag')
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
        <circle cx="2.5" cy="2.5" r="1.25" fill="currentColor" />
        <circle cx="7.5" cy="2.5" r="1.25" fill="currentColor" />
        <circle cx="2.5" cy="8" r="1.25" fill="currentColor" />
        <circle cx="7.5" cy="8" r="1.25" fill="currentColor" />
        <circle cx="2.5" cy="13.5" r="1.25" fill="currentColor" />
        <circle cx="7.5" cy="13.5" r="1.25" fill="currentColor" />
      </svg>
    </button>
  )
}

export function PlacePin({ index }: { index: number }) {
  return (
    <span className="trip-stop__pin" aria-hidden="true">
      {index}
    </span>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function ClockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.5V12l3 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WalkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.5 5.5a2 2 0 1 0-2-2 2 2 0 0 0 2 2ZM9.8 21.5l1-4.5 2.1 2v4h1.8v-5.2l-2.1-2 0.6-3c1.3 1.5 3.1 2.4 5.1 2.4v-1.8c-1.6 0-3-0.8-3.8-2.1l-1-1.6a2.4 2.4 0 0 0-2-1.1c-0.4 0-0.7 0.1-1 0.2L6 11.2v4.3h1.8v-3.1l1.6-0.8-1.3 6.4-4.4-0.9 0.4 1.8 6.7 1.6Z"
      />
    </svg>
  )
}

export function TravelConnector({
  from,
  to,
  showToLabel = true,
}: {
  from: NormalizedPlace
  to: NormalizedPlace
  showToLabel?: boolean
}) {
  const estimate = estimateTravel(from, to)
  const estimateLabel = `${formatRouteDuration(estimate.durationSeconds)} · ${formatRouteDistance(estimate.distanceMeters)}`

  return (
    <div className={`trip-leg${showToLabel ? '' : ' trip-leg--compact'}`}>
      <div className="trip-leg__rail" aria-hidden="true" />
      <div className="trip-leg__summary">
        <WalkIcon />
        <span className="trip-leg__stats">{estimateLabel}</span>
        <span className="trip-leg__mode">Walk</span>
      </div>
      {showToLabel ? <p className="trip-leg__to">to {to.name}</p> : null}
    </div>
  )
}

export function PlaceImage({ place }: { place: NormalizedPlace }) {
  const src = placeImageUrl(place.id, MAPBOX_TOKEN)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className="trip-stop__placeholder" aria-hidden="true">
        <span>{place.name.charAt(0)}</span>
      </div>
    )
  }

  return (
    <img
      className="trip-stop__image"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
