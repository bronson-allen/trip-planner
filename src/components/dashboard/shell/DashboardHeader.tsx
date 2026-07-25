import { ITALY_FLAG_URL } from '../../../data/places'

type DashboardHeaderProps = {
  title: string
  duration: string
}

export default function DashboardHeader({ title, duration }: DashboardHeaderProps) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header__lead">
        <h1 className="dashboard-header__title">{title}</h1>
        <p className="dashboard-header__duration">{duration}</p>
      </div>
      <img
        className="dashboard-header__flag"
        src={ITALY_FLAG_URL}
        alt=""
        width={32}
        height={21}
        decoding="async"
        aria-hidden="true"
      />
    </header>
  )
}
