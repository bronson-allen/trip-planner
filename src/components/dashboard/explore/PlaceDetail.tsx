import { useMemo, useState } from 'react'
import { isPlannableCity } from '../../../data/cities'
import { formatDuration, formatPlaceType, PLACES, type NormalizedPlace } from '../../../data/places'
import { isOpenOnDate } from '../../../lib/places/availability'
import { blockedPlace, formatTag } from '../../../lib/places/explore'
import { cardBadges } from '../../../lib/places/tags'
import { tripDates } from '../../../lib/trip/tools'
import type { TripState } from '../../../lib/trip/tripState'
import { hoursLine, PlaceImage, ClockIcon } from '../shared/parts'

type PlaceDetailProps = {
  place: NormalizedPlace
  tripState: TripState
  /** Set when the place is already scheduled, so the pane shows its day instead of an add button. */
  inTripDay?: number
  dayNumbers: number[]
  onBack: () => void
  onAddPlace: (day: number) => void
  /** Starts a fresh trip anchored on this place's city, for places this trip can't schedule. */
  onPlanCity: () => void
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M14.5 5 8 12l6.5 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 1.5l2.35 4.76 5.25.76-3.8 3.7.9 5.24L10 13.52l-4.7 2.44.9-5.24-3.8-3.7 5.25-.76L10 1.5z"
      />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        d="M12 4.5 21 20H3L12 4.5Zm0 5.5v4.2m0 2.6v.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** How the place's own schedule lines up with the trip dates, in plain language. */
function tripDateAvailability(place: NormalizedPlace, dates: Date[]) {
  if (place.hours.confidence === 'unknown' || dates.length === 0) {
    return { label: 'Hours unconfirmed', tone: 'unknown' as const }
  }
  const openDays = dates.filter((date) => isOpenOnDate(place, date)).length
  if (openDays === 0) return { label: 'Closed on all trip dates', tone: 'closed' as const }
  if (openDays === dates.length) return { label: 'Open every trip date', tone: 'open' as const }
  return { label: `Open ${openDays} of ${dates.length} trip dates`, tone: 'partial' as const }
}

/**
 * The pushed half of the Explore master-detail: one place, full-panel, with a back arrow to
 * the list. Reads only normalized fields, so anything unparsed is labeled rather than guessed.
 */
export default function PlaceDetail({
  place,
  tripState,
  inTripDay,
  dayNumbers,
  onBack,
  onAddPlace,
  onPlanCity,
}: PlaceDetailProps) {
  const [picking, setPicking] = useState(false)

  const dates = useMemo(() => tripDates(tripState), [tripState])
  const availability = tripDateAvailability(place, dates)
  const outsideBaseCity = place.city !== tripState.city
  /**
   * The same classifier the Explore list uses, so the pane and the row can't disagree about why
   * a place isn't addable. Null means `addStop` would accept it.
   */
  const blocked = useMemo(
    () => blockedPlace(place, PLACES, tripState.city, dates),
    [place, tripState.city, dates],
  )
  const badges = cardBadges(place.tags)
  const tags = badges.length > 0
    ? badges.map((badge) => ({ key: badge.tag, label: badge.label }))
    : place.tags.slice(0, 4).map((tag) => ({ key: tag, label: formatTag(tag) }))
  const durationLabel = `${place.duration.inferred ? '~' : ''}${formatDuration(place.duration.minutes)} visit`
  const whereParts = [formatPlaceType(place.type), place.neighborhood, place.city].filter(Boolean)

  return (
    <section className="panel explore-panel place-detail">
      <header className="panel__header place-detail__bar">
        <button type="button" className="place-detail__back" onClick={onBack}>
          <BackIcon />
          All places
        </button>
      </header>

      <div className="panel__body place-detail__body">
        <div className="place-detail__hero">
          <PlaceImage place={place} />
        </div>

        <h3 className="place-detail__name">{place.name}</h3>
        <p className="place-detail__where">{whereParts.join(' · ')}</p>

        <p className="place-detail__stats">
          <span className="place-detail__stat place-detail__stat--rating">
            <StarIcon />
            {place.rating.toFixed(1)}
          </span>
          <span className="place-detail__stat">{place.priceRange}</span>
          <span className="place-detail__stat">
            <ClockIcon />
            {durationLabel}
          </span>
        </p>

        <p className="place-detail__description">{place.description}</p>

        <dl className="place-detail__facts">
          <dt>Hours</dt>
          <dd>{hoursLine(place)}</dd>
          <dt>On your trip dates</dt>
          <dd className={`place-detail__availability place-detail__availability--${availability.tone}`}>
            {availability.label}
          </dd>
        </dl>

        {place.bookingRequired ? (
          <p className="place-detail__note">
            <WarnIcon />
            Booking required
          </p>
        ) : null}

        {place.seasonalNotes ? (
          <p className="place-detail__seasonal">{place.seasonalNotes}</p>
        ) : null}

        {blocked?.block === 'day-trip' ? (
          <p className="place-detail__note place-detail__note--warn">
            <WarnIcon />
            Day trip — {place.city} is about {blocked.distanceKm}km from {tripState.city}. Close
            enough to reach, but the round trip costs most of a day, which is a lot when you only
            have three. Left off the plan for that reason, not because it isn&apos;t worth it.
          </p>
        ) : outsideBaseCity ? (
          <p className="place-detail__note place-detail__note--warn">
            <WarnIcon />
            In {place.city}, not {tripState.city} — three days only covers one base city
          </p>
        ) : null}

        {tags.length > 0 ? (
          <ul className="place-detail__tags">
            {tags.map((tag) => (
              <li key={tag.key} className="place-detail__tag">
                {tag.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <footer className="place-detail__footer">
        {inTripDay ? (
          <p className="place-detail__scheduled">Already in Day {inTripDay}</p>
        ) : blocked ? (
          blocked.block === 'other-city' && isPlannableCity(place.city) ? (
            <button type="button" className="place-detail__add" onClick={onPlanCity}>
              Plan a trip to {place.city}
            </button>
          ) : (
            <p className="place-detail__scheduled">
              {blocked.block === 'day-trip'
                ? `Day trip from ${tripState.city} — not in this plan`
                : blocked.block === 'other-city'
                  ? `${place.city} has too few places to anchor a trip`
                  : 'Not schedulable on your dates'}
            </p>
          )
        ) : picking ? (
          <div className="place-detail__days" role="group" aria-label={`Add ${place.name} to a day`}>
            {dayNumbers.map((day) => (
              <button
                key={day}
                type="button"
                className="place-detail__day"
                onClick={() => {
                  setPicking(false)
                  onAddPlace(day)
                }}
              >
                Day {day}
              </button>
            ))}
            <button
              type="button"
              className="place-detail__day place-detail__day--cancel"
              onClick={() => setPicking(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="place-detail__add" onClick={() => setPicking(true)}>
            + Add to trip
          </button>
        )}
      </footer>
    </section>
  )
}
