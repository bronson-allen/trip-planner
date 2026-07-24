import { useMemo } from 'react'
import type { DayPlan } from '../../data/tripView'
import MonthView from './MonthView'
import Panel from './Panel'

type TripCalendarProps = {
  startDate: string
  days: DayPlan[]
}

export default function TripCalendar({ startDate, days }: TripCalendarProps) {
  const highlightedDates = useMemo(() => days.map((day) => day.iso), [days])

  return (
    <Panel title="Calendar">
      <MonthView month={startDate} highlightedDates={highlightedDates} />
    </Panel>
  )
}
