import { useMemo } from 'react'
import {
  formatMonthYear,
  parseIsoDate,
  toDateInputValue,
} from '../../lib/dates'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

type MonthCell = {
  iso: string
  day: number
  inMonth: boolean
}

type MonthViewProps = {
  /** ISO date (YYYY-MM-DD) — month to display */
  month: string
  /** ISO dates to highlight (trip days) */
  highlightedDates: string[]
}

function buildMonthCells(anchorIso: string): MonthCell[] {
  const anchor = parseIsoDate(anchorIso)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const first = new Date(year, month, 1, 12)
  const startOffset = first.getDay() // Sunday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: MonthCell[] = []

  for (let i = 0; i < startOffset; i++) {
    const date = new Date(year, month, 1 - startOffset + i, 12)
    cells.push({
      iso: toDateInputValue(date),
      day: date.getDate(),
      inMonth: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day, 12)
    cells.push({
      iso: toDateInputValue(date),
      day,
      inMonth: true,
    })
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]
    const date = parseIsoDate(last.iso)
    date.setDate(date.getDate() + 1)
    cells.push({
      iso: toDateInputValue(date),
      day: date.getDate(),
      inMonth: false,
    })
  }

  return cells
}

export default function MonthView({ month, highlightedDates }: MonthViewProps) {
  const highlighted = useMemo(
    () => new Set(highlightedDates),
    [highlightedDates],
  )
  const cells = useMemo(() => buildMonthCells(month), [month])
  const title = formatMonthYear(parseIsoDate(month))

  return (
    <div className="month-view" aria-label={`${title} calendar`}>
      <p className="month-view__title">{title}</p>
      <div className="month-view__weekdays" aria-hidden="true">
        {WEEKDAYS.map((label) => (
          <span key={label} className="month-view__weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="month-view__grid" role="presentation">
        {cells.map((cell) => {
          const isTripDay = highlighted.has(cell.iso)
          return (
            <span
              key={cell.iso}
              className={[
                'month-view__day',
                !cell.inMonth ? 'month-view__day--muted' : '',
                isTripDay ? 'month-view__day--trip' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={
                isTripDay
                  ? `${cell.iso}, trip day`
                  : undefined
              }
            >
              {cell.day}
            </span>
          )
        })}
      </div>
    </div>
  )
}
