import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fmt } from '../utils/helpers'
import {
  LayoutDashboard, Users, Package, FileText,
  Receipt, CreditCard, RefreshCw, BarChart2,
  LogOut, ChevronRight, Building2
} from 'lucide-react'

const NAV = [
  {
    section: 'Overview',
    items: [{ to: '/', icon: LayoutDashboard, label: 'Dashboard' }]
  },
  {
    section: 'Business',
    items: [
      { to: '/organizations', icon: Building2, label: 'Organizations' },
      { to: '/customers', icon: Users, label: 'Customers' },
      { to: '/items', icon: Package, label: 'Items & Services' },
    ]
  },
  {
    section: 'Billing',
    items: [
      { to: '/quotes', icon: FileText, label: 'Quotes' },
      { to: '/invoices', icon: Receipt, label: 'Invoices' },
      { to: '/payments', icon: CreditCard, label: 'Payments' },
      { to: '/subscriptions', icon: RefreshCw, label: 'Subscriptions' },
    ]
  },
  {
    section: 'Insights',
    items: [{ to: '/reports', icon: BarChart2, label: 'Reports' }]
  },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Zentra</h1>
          <span>Finance Platform</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ section, items }) => (
            <div className="nav-section" key={section}>
              <div className="nav-section-label">{section}</div>
              {items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  <Icon />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">
              {fmt.initials(user?.first_name + ' ' + (user?.last_name || ''))}
            </div>
            <div className="user-info">
              <div className="user-name">{user?.first_name} {user?.last_name}</div>
              <div className="user-role">{user?.role || 'Admin'}</div>
            </div>
            <button className="btn-logout" onClick={handleLogout} title="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
