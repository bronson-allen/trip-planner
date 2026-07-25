import { useMemo, useState } from 'react'
import {
  formatPlaceType,
  PLACES,
  PLACES_BY_ID,
  type NormalizedPlace,
} from '../../../data/places'
import { isPlannableCity } from '../../../data/cities'
import {
  catalogTags,
  catalogTypes,
  exploreLists,
  formatTag,
  NO_EXPLORE_FILTERS,
  type ExploreBlock,
  type ExploreFilters,
} from '../../../lib/places/explore'
import type { TripState } from '../../../lib/trip/tripState'
import { PlaceImage } from '../shared/parts'
import Panel from '../shared/Panel'
import PlaceDetail from './PlaceDetail'

type ExplorePlacesProps = {
  tripState: TripState
  onAddPlace: (placeId: string, day: number) => void
  onPlanCity: (city: string) => void
}

const PRICE_OPTIONS = [1, 2, 3, 4]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path
        d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6L12 3.5ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A native select dressed as a filter chip: accent-filled once it narrows the list. */
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
}) {
  return (
    <label className={`explore-filter${value ? ' explore-filter--on' : ''}`}>
      <span className="visually-hidden">{label}</span>
      <select
        className="explore-filter__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="explore-filter__caret" aria-hidden="true">
        ⌄
      </span>
    </label>
  )
}

function StarIcon() {
  return (
    <svg className="explore-row__star" viewBox="0 0 20 20" width="11" height="11" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 1.5l2.35 4.76 5.25.76-3.8 3.7.9 5.24L10 13.52l-4.7 2.44.9-5.24-3.8-3.7 5.25-.76L10 1.5z"
      />
    </svg>
  )
}

function PlaceMeta({ place, inTripDay }: { place: NormalizedPlace; inTripDay?: number }) {
  const parts = [formatPlaceType(place.type), place.city, place.neighborhood].filter(Boolean)

  return (
    <p className="explore-row__meta">
      {parts.join(' · ')}
      {inTripDay ? (
        ` · already in Day ${inTripDay}`
      ) : (
        <>
          {` · ${place.priceRange} · `}
          <span className="explore-row__rating">
            <StarIcon />
            {place.rating}
          </span>
        </>
      )}
    </p>
  )
}

/** The trailing control for a place this trip can't schedule — never an add. */
function BlockedControl({
  place,
  block,
  distanceKm,
  baseCity,
  onPlanCity,
}: {
  place: NormalizedPlace
  block: ExploreBlock
  distanceKm?: number
  baseCity: string
  onPlanCity: () => void
}) {
  if (block === 'other-city' && isPlannableCity(place.city)) {
    return (
      <button
        type="button"
        className="explore-row__plan"
        onClick={onPlanCity}
        title={`Start a new 3-day trip based in ${place.city}`}
      >
        Plan {place.city}
      </button>
    )
  }

  if (block === 'day-trip') {
    return (
      <span
        className="explore-row__blocked"
        title={`${place.city} is about ${distanceKm}km from ${baseCity} — reachable, but a day trip out of a 3-day trip`}
      >
        Day trip
      </span>
    )
  }

  return (
    <span
      className="explore-row__blocked"
      title={
        block === 'other-city'
          ? `${place.city} has too few places to anchor a 3-day trip, and it's too far to visit from ${baseCity}`
          : "Outside this trip's area or closed on your dates"
      }
    >
      {block === 'other-city' ? 'Not in this trip' : 'Unavailable'}
    </span>
  )
}

function ExploreRow({
  place,
  pick = false,
  inTripDay,
  block,
  distanceKm,
  baseCity,
  dayNumbers,
  picking,
  onOpen,
  onStartPicking,
  onCancelPicking,
  onAddPlace,
  onPlanCity,
}: {
  place: NormalizedPlace
  pick?: boolean
  inTripDay?: number
  block?: ExploreBlock
  distanceKm?: number
  baseCity: string
  dayNumbers: number[]
  picking: boolean
  onOpen: () => void
  onStartPicking: () => void
  onCancelPicking: () => void
  onAddPlace: (day: number) => void
  onPlanCity: () => void
}) {
  return (
    <li
      className={`explore-row${pick ? ' explore-row--pick' : ''}${
        inTripDay ? ' explore-row--satisfied' : ''
      }${block ? ' explore-row--blocked' : ''}`}
    >
      {/* Stretched over the card so the whole row opens the detail, while the add controls
          stay clickable on their own layer. */}
      <button
        type="button"
        className="explore-row__open"
        aria-label={`View details for ${place.name}`}
        onClick={onOpen}
      />

      <div className="explore-row__media" aria-hidden="true">
        <PlaceImage place={place} />
      </div>

      <div className="explore-row__copy">
        <p className="explore-row__name">{place.name}</p>
        <PlaceMeta place={place} inTripDay={inTripDay} />
      </div>

      {inTripDay ? (
        <span className="explore-row__done" title={`Already in Day ${inTripDay}`}>
          <CheckIcon />
        </span>
      ) : block ? (
        <BlockedControl
          place={place}
          block={block}
          distanceKm={distanceKm}
          baseCity={baseCity}
          onPlanCity={onPlanCity}
        />
      ) : picking ? (
        <div className="explore-row__days" role="group" aria-label={`Add ${place.name} to a day`}>
          {dayNumbers.map((day) => (
            <button
              key={day}
              type="button"
              className="explore-row__day"
              aria-label={`Add ${place.name} to day ${day}`}
              onClick={() => onAddPlace(day)}
            >
              {day}
            </button>
          ))}
          <button
            type="button"
            className="explore-row__day explore-row__day--cancel"
            aria-label="Cancel"
            onClick={onCancelPicking}
          >
            ×
          </button>
        </div>
      ) : (
        <button type="button" className="explore-row__add" onClick={onStartPicking}>
          + Add
        </button>
      )}
    </li>
  )
}

/**
 * The list view's aside: the one surface that shows every place in the Italy dataset, not just
 * the chosen itinerary. Results are ranked with the same scorer as the rest of the app.
 */
export default function ExplorePlaces({
  tripState,
  onAddPlace,
  onPlanCity,
}: ExplorePlacesProps) {
  const [filters, setFilters] = useState<ExploreFilters>(NO_EXPLORE_FILTERS)
  const [pickingPlaceId, setPickingPlaceId] = useState<string | null>(null)
  const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null)
  /** True once a detail has been dismissed, so the list only animates back on a real pop. */
  const [popped, setPopped] = useState(false)

  const lists = useMemo(() => exploreLists(tripState, PLACES, filters), [tripState, filters])
  const tagOptions = useMemo(() => catalogTags(PLACES), [])
  const typeOptions = useMemo(() => catalogTypes(PLACES), [])

  const dayNumbers = tripState.days.map((day) => day.day)
  const filtersActive =
    filters.query.trim() !== '' ||
    filters.tag !== null ||
    filters.type !== null ||
    filters.maxPrice !== null
  const dayByPlaceId = useMemo(
    () =>
      new Map(
        tripState.days.flatMap((day) => day.stops.map((stop) => [stop.placeId, day.day] as const)),
      ),
    [tripState],
  )
  const detailPlace = detailPlaceId ? PLACES_BY_ID.get(detailPlaceId) : undefined
  /** Everything below the curated picks: unscheduled matches first, already-scheduled ones last. */
  const remaining: Array<{ place: NormalizedPlace; day?: number }> = [
    ...lists.results.map((place) => ({ place })),
    ...lists.inTrip.map(({ place, day }) => ({ place, day })),
  ]

  function update(patch: Partial<ExploreFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
    setPickingPlaceId(null)
  }

  function addPlace(placeId: string, day: number) {
    setPickingPlaceId(null)
    onAddPlace(placeId, day)
  }

  function rowProps(place: NormalizedPlace) {
    return {
      place,
      baseCity: tripState.city,
      dayNumbers,
      picking: pickingPlaceId === place.id,
      onOpen: () => {
        setPickingPlaceId(null)
        setDetailPlaceId(place.id)
      },
      onStartPicking: () => setPickingPlaceId(place.id),
      onCancelPicking: () => setPickingPlaceId(null),
      onAddPlace: (day: number) => addPlace(place.id, day),
      onPlanCity: () => onPlanCity(place.city),
    }
  }

  if (detailPlace) {
    return (
      <PlaceDetail
        key={detailPlace.id}
        place={detailPlace}
        tripState={tripState}
        inTripDay={dayByPlaceId.get(detailPlace.id)}
        dayNumbers={dayNumbers}
        onBack={() => {
          setPopped(true)
          setDetailPlaceId(null)
        }}
        onAddPlace={(day) => onAddPlace(detailPlace.id, day)}
        onPlanCity={() => onPlanCity(detailPlace.city)}
      />
    )
  }

  return (
    <Panel
      title="Explore places"
      className={`explore-panel${popped ? ' explore-panel--pop' : ''}`}
      action={<p className="explore__count">{PLACES.length} in Italy</p>}
    >
      <div className="explore__controls">
        <div className="explore__search">
          <SearchIcon />
          <label className="visually-hidden" htmlFor="explore-search">
            Search places
          </label>
          <input
            id="explore-search"
            type="search"
            className="explore__input"
            value={filters.query}
            placeholder="Search restaurants, sites, tags…"
            autoComplete="off"
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>

        <div className="explore__filters">
          <FilterSelect
            label="Vibe"
            value={filters.tag ?? ''}
            options={tagOptions.map((tag) => ({ value: tag, label: formatTag(tag) }))}
            onChange={(next) => update({ tag: next || null })}
          />
          <FilterSelect
            label="Type"
            value={filters.type ?? ''}
            options={typeOptions.map((type) => ({ value: type, label: formatPlaceType(type) }))}
            onChange={(next) => update({ type: next || null })}
          />
          <FilterSelect
            label="Price"
            value={filters.maxPrice === null ? '' : String(filters.maxPrice)}
            options={PRICE_OPTIONS.map((level) => ({
              value: String(level),
              label: `${'€'.repeat(level)} or less`,
            }))}
            onChange={(next) => update({ maxPrice: next ? Number(next) : null })}
          />
          {filtersActive ? (
            <button
              type="button"
              className="explore-filter explore-filter--clear"
              onClick={() => {
                setFilters(NO_EXPLORE_FILTERS)
                setPickingPlaceId(null)
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>

      {lists.topPicks.length > 0 ? (
        <>
          <p className="explore__section">
            <SparkIcon />
            Top picks not in your trip
          </p>
          <ul className="explore__list">
            {lists.topPicks.map((place) => (
              <ExploreRow key={place.id} pick {...rowProps(place)} />
            ))}
          </ul>
        </>
      ) : null}

      {lists.total === 0 ? (
        <p className="explore__empty">Nothing matches these filters. Try clearing one.</p>
      ) : null}

      {remaining.length > 0 ? (
        <>
          <p className="explore__section explore__section--all">
            In {tripState.city} · {remaining.length}
          </p>
          <ul className="explore__list">
            {remaining.map(({ place, day }) => (
              <ExploreRow key={place.id} inTripDay={day} {...rowProps(place)} />
            ))}
          </ul>
        </>
      ) : null}

      {lists.elsewhere.length > 0 ? (
        <>
          <p className="explore__section explore__section--all">
            Elsewhere in Italy · {lists.elsewhere.length}
          </p>
          <p className="explore__note">
            This trip is based in {tripState.city}, so these aren&apos;t schedulable — three days
            isn&apos;t enough to add another city. Browse them, or start a trip there instead.
          </p>
          <ul className="explore__list">
            {lists.elsewhere.map(({ place, block, distanceKm }) => (
              <ExploreRow
                key={place.id}
                block={block}
                distanceKm={distanceKm}
                {...rowProps(place)}
              />
            ))}
          </ul>
        </>
      ) : null}

      <p className="explore__hint">Add opens a day picker · a toast confirms the change</p>
    </Panel>
  )
}
