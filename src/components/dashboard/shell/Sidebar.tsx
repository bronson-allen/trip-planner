type NavItem = {
  id: 'map' | 'list'
  label: string
  icon: 'map' | 'list'
}

const NAV_ITEMS: NavItem[] = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'list', label: 'List', icon: 'list' },
]

type SidebarProps = {
  activeId?: NavItem['id']
  onSelect?: (id: NavItem['id']) => void
}

function BrandMark() {
  return (
    <span className="sidebar__brand" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 21s-6.5-5.2-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.8 12 21 12 21Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10.8" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  )
}

function NavIcon({ icon }: { icon: NavItem['icon'] }) {
  if (icon === 'map') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 4.5 3.5 6.5v13l5.5-2 5.5 2 5.5-2v-13L15 6.5 9 4.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9 4.5v13M15 6.5v13" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (icon === 'list') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8 7h12M8 12h12M8 17h12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="4.5" cy="7" r="1.2" fill="currentColor" />
        <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
        <circle cx="4.5" cy="17" r="1.2" fill="currentColor" />
      </svg>
    )
  }

  return null
}

export default function Sidebar({ activeId = 'map', onSelect }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Dashboard navigation">
      <BrandMark />
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__item${activeId === item.id ? ' sidebar__item--active' : ''}`}
            aria-label={item.label}
            aria-current={activeId === item.id ? 'page' : undefined}
            title={item.label}
            onClick={() => onSelect?.(item.id)}
          >
            <NavIcon icon={item.icon} />
          </button>
        ))}
      </nav>
    </aside>
  )
}
