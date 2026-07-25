import { useMemo } from 'react'
import { formatMonthYear, parseIsoDate } from '../../../lib/dates'
import type { DayPlan } from '../../../lib/trip/tripState'
import MonthView from './MonthView'
import Panel from '../shared/Panel'

type TripCalendarProps = {
  startDate: string
  days: DayPlan[]
}

export default function TripCalendar({ startDate, days }: TripCalendarProps) {
  const highlightedDates = useMemo(() => days.map((day) => day.iso), [days])
  const monthLabel = formatMonthYear(parseIsoDate(startDate))

  return (
    <Panel
      title="Calendar"
      className="calendar-panel"
      action={<p className="calendar-panel__month">{monthLabel}</p>}
    >
      <MonthView month={startDate} highlightedDates={highlightedDates} />
    </Panel>
  )
}
