import type { ReactNode } from 'react'

type PanelProps = {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function Panel({
  title,
  action,
  children,
  className = '',
}: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel__header">
        <div>
          <h2 className="panel__title">{title}</h2>
        </div>
        {action}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}
