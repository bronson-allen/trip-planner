import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { TRIP_DAYS, type TripPlan } from '../../data/tripPlan'
import {
  addDays,
  defaultStartDate,
  formatShortDate,
  toDateInputValue,
} from '../../lib/dates'
import ChipGroup from './ChipGroup'
import './PlannerCard.css'

const LOCATIONS = ['Italy'] as const
const CITIES = ['Rome', 'Florence', 'Venice', 'Milan'] as const
const INTERESTS = [
  'Food',
  'Historic',
  'Scenic',
  'Art',
  'Local favorite',
  'Outdoors',
  'Quiet',
  'Hidden gem',
] as const
const PACES = ['Relaxed', 'Balanced', 'Packed'] as const
const BUDGETS = ['€', '€€', '€€€', '€€€€'] as const

type PlannerCardProps = {
  open: boolean
  /** Pre-selects the base city, for the "plan a trip to X" entry point. */
  initialCity?: string
  onClose: () => void
  onSubmit: (plan: TripPlan) => void
}

export default function PlannerCard({
  open,
  initialCity,
  onClose,
  onSubmit,
}: PlannerCardProps) {
  const titleId = useId()
  const locationId = useId()
  const startDateId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  const [location, setLocation] = useState<string>(LOCATIONS[0])
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [city, setCity] = useState<string>(initialCity ?? 'Rome')
  const [interests, setInterests] = useState<string[]>([])
  const [pace, setPace] = useState<string>('Balanced')
  const [budget, setBudget] = useState<string>('€€')

  const tripRangeLabel = useMemo(() => {
    if (!startDate) return `${TRIP_DAYS}-day trip`
    const start = addDays(startDate, 0)
    const end = addDays(startDate, TRIP_DAYS - 1)
    return `${TRIP_DAYS}-day trip · ${formatShortDate(start)} – ${formatShortDate(end)}`
  }, [startDate])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      startDate,
      location,
      city,
      interests,
      pace,
      budget,
    })
  }

  return (
    <div className="planner-overlay" onClick={onClose}>
      <div
        className="planner-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="planner-card__close"
          aria-label="Close trip planner"
          onClick={onClose}
        >
          ×
        </button>

        <header className="planner-card__header">
          <h2 id={titleId} className="planner-card__title">
            Plan your trip
          </h2>
          <p className="planner-card__subtitle">
            3 days, one city, built around what you like.
          </p>
        </header>

        <form className="planner-card__form" onSubmit={handleSubmit}>
          <div className="planner-field-row">
            <div className="planner-field">
              <label className="planner-field__label" htmlFor={locationId}>
                Location
              </label>
              <select
                id={locationId}
                className="planner-input"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              >
                {LOCATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <p className="planner-field__hint">Trip to {location}.</p>
            </div>

            <div className="planner-field">
              <label className="planner-field__label" htmlFor={startDateId}>
                Start date
              </label>
              <input
                id={startDateId}
                className="planner-input"
                type="date"
                required
                value={startDate}
                min={toDateInputValue(new Date())}
                onChange={(event) => setStartDate(event.target.value)}
              />
              <p className="planner-field__hint">{tripRangeLabel}</p>
            </div>
          </div>

          <fieldset className="planner-field">
            <legend className="planner-field__label">
              <svg
                className="planner-field__pin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="10" r="2.5" fill="currentColor" />
              </svg>
              Base city
            </legend>
            <ChipGroup
              options={CITIES}
              value={city}
              onChange={setCity}
              even
              aria-label="Base city"
            />
          </fieldset>

          <fieldset className="planner-field">
            <legend className="planner-field__label">What are you into?</legend>
            <ChipGroup
              options={INTERESTS}
              value={interests}
              onChange={setInterests}
              multiple
              aria-label="Interests"
            />
          </fieldset>

          <fieldset className="planner-field">
            <legend className="planner-field__label">Pace</legend>
            <ChipGroup
              options={PACES}
              value={pace}
              onChange={setPace}
              even
              aria-label="Pace"
            />
          </fieldset>

          <fieldset className="planner-field">
            <legend className="planner-field__label">Budget</legend>
            <ChipGroup
              options={BUDGETS}
              value={budget}
              onChange={setBudget}
              even
              aria-label="Budget"
            />
          </fieldset>

          <div className="planner-card__divider" aria-hidden="true" />

          <button type="submit" className="planner-card__submit">
            Let's go!
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </div>
    </div>
  )
}
