import { useNavigate } from 'react-router-dom'
import {
  Building2,
  LogOut,
  ArrowLeft,
  X,
  Shield,
  Activity,
} from 'lucide-react'

export default function Sidebar({ tabs, active, hub, admin, isOpen, onSelect, onExit, onCloseMobile }) {
  const navigate = useNavigate()

  const logout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_info')
    localStorage.removeItem('current_hub')
    navigate('/login/admin')
  }

  // Admin initials
  const initials = (admin?.username || admin?.email || 'A')
    .slice(0, 2)
    .toUpperCase()

  return (
    <aside className={`hub-sidebar ${isOpen ? 'hub-sidebar--open' : ''}`}>
      {/* Mobile close button */}
      <button className="hub-sidebar__close" onClick={onCloseMobile} aria-label="Close navigation">
        <X size={18} />
      </button>

      {/* Brand header */}
      <div className="hub-sidebar__brand">
        <div className="hub-sidebar__brand-logo">
          <Activity size={18} strokeWidth={2.5} />
        </div>
        <div className="hub-sidebar__brand-meta">
          <div className="hub-sidebar__brand-title">ASTRA</div>
          <div className="hub-sidebar__brand-badge">Facility</div>
        </div>
      </div>

      {/* Current Facility Card */}
      <div className="hub-sidebar__facility">
        <div className="hub-sidebar__facility-icon">
          <Building2 size={16} />
        </div>
        <div className="hub-sidebar__facility-meta">
          <div className="hub-sidebar__facility-name" title={hub?.name || 'Facility'}>
            {hub?.name || 'Facility'}
          </div>
          <div className="hub-sidebar__facility-type" title={hub?.hub_type || 'Facility'}>
            {hub?.hub_type || 'Facility'}
          </div>
        </div>
        <div className="hub-sidebar__facility-status" title="Facility active" />
      </div>

      {/* Navigation tabs */}
      <div className="hub-sidebar__nav-section-title">MANAGEMENT</div>
      <nav className="hub-sidebar__nav">
        {tabs.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              className={`hub-nav-item ${isActive ? 'hub-nav-item--active' : ''}`}
              onClick={() => onSelect(t.id)}
            >
              <span className="hub-nav-item__icon-box">
                {Icon && <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />}
              </span>
              <span className="hub-nav-item__label">{t.label}</span>
              {isActive && <span className="hub-nav-item__active-pill" />}
            </button>
          )
        })}
      </nav>

      {/* Sidebar bottom / Admin account */}
      <div className="hub-sidebar__bottom">
        <button className="hub-sidebar__exit-btn" onClick={onExit}>
          <ArrowLeft size={14} />
          <span>Exit Facility</span>
        </button>

        <div className="hub-sidebar__admin-profile">
          <div className="hub-sidebar__admin-avatar">
            {initials}
          </div>
          <div className="hub-sidebar__admin-meta">
            <div className="hub-sidebar__admin-name" title={admin?.username || 'Administrator'}>
              {admin?.username || 'Administrator'}
            </div>
            <div className="hub-sidebar__admin-email" title={admin?.email || ''}>
              {admin?.email}
            </div>
          </div>
        </div>

        <button className="hub-sidebar__logout-btn" onClick={logout}>
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
