type DashboardHeaderProps = {
  title: string
  duration: string
}

export default function DashboardHeader({ title, duration }: DashboardHeaderProps) {
  return (
    <header className="dashboard-header">
      <h1 className="dashboard-header__title">{title}</h1>
      <p className="dashboard-header__duration">{duration}</p>
    </header>
  )
}
