import { useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  LogOut,
  User,
  ShieldCheck,
  Building2,
  ClipboardList,
  CheckCircle2,
  Pill,
  Radio,
} from 'lucide-react'
import { healthWorkerHeartbeat, healthWorkerLogout } from '../../api/workerApi'

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000  // 2 minutes

export default function WorkerLayout({ children, activeStation, title, subtitle, hideNav = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const heartbeatRef = useRef(null)

  const rawInfo = localStorage.getItem('worker_info')
  const worker = rawInfo ? JSON.parse(rawInfo) : {
    full_name: 'Health Worker',
    worker_id: 'REC-00001',
    sub_role: 'Reception',
    care_hub_id: 'CARE-HUB',
  }

  // ── Heartbeat: keep is_online alive every 2 minutes ──────────────────
  useEffect(() => {
    // Send immediately on mount (login already set it, but keep fresh)
    healthWorkerHeartbeat().catch(() => {})

    heartbeatRef.current = setInterval(() => {
      healthWorkerHeartbeat().catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)

    // Cleanup on unmount (tab close / component unmount)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [])

  // ── Logout: immediately mark offline, clear local state ──────────────
  const handleLogout = async () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    try {
      await healthWorkerLogout()
    } catch {
      // If network fails we still log out locally
    }
    localStorage.removeItem('worker_token')
    localStorage.removeItem('worker_info')
    navigate('/login/health-worker', { replace: true })
  }

  const roleColorMap = {
    reception:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'Reception' },
    verification: { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9', label: 'Verification' },
    dispensing:   { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', label: 'Dispensing' },
  }

  const currentRoleKey = (worker.sub_role || 'reception').toLowerCase()
  const roleStyle = roleColorMap[currentRoleKey] || roleColorMap.reception

  return (
    <div className="worker-app">
      {/* ── Top Header ── */}
      <header className="worker-header">
        <div className="worker-header__inner">
          <div className="worker-header__brand">
            <Link to="/" className="worker-logo">
              <div className="worker-logo__mark">A</div>
              <div className="worker-logo__text">
                <span className="worker-logo__name">Astra</span>
                <span className="worker-logo__tag">Clinical Station</span>
              </div>
            </Link>

            <div className="worker-station-indicator">
              <span className="worker-station-indicator__dot" />
              <span className="worker-station-indicator__label">
                {title || `${worker.sub_role || 'Reception'} Station`}
              </span>
            </div>
          </div>

          <div className="worker-header__actions">
            {/* Facility Hub Badge */}
            <div className="worker-hub-badge">
              <Building2 size={13} className="worker-hub-badge__icon" />
              <span>Facility: {worker.care_hub_id || 'Active Facility'}</span>
            </div>

            {/* Worker Role Badge */}
            <div
              className="worker-role-pill"
              style={{
                backgroundColor: roleStyle.bg,
                borderColor: roleStyle.border,
                color: roleStyle.text,
              }}
            >
              <ShieldCheck size={13} />
              <span>{worker.sub_role || 'Reception'}</span>
              <span className="worker-role-pill__id">{worker.worker_id}</span>
            </div>

            {/* Worker Profile Card */}
            <div className="worker-profile">
              <div className="worker-profile__avatar">
                <User size={14} />
              </div>
              <div className="worker-profile__details">
                <span className="worker-profile__name">{worker.full_name}</span>
                <span className="worker-profile__status">Online · Active</span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="worker-logout-btn"
              title="Sign Out from Station"
              id="worker-logout-btn"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Station Navigation Strip — completely hidden for Verification Desk and non-reception roles */}
        {!hideNav && !location.pathname.includes('verification') && worker.sub_role === 'Reception' && (
          <div className="worker-nav-strip">
            <div className="worker-nav-strip__inner">
              <div className="worker-nav-links">
                <Link
                  to="/health-worker/reception"
                  className={`worker-nav-link ${location.pathname.includes('reception') ? 'active' : ''}`}
                >
                  <ClipboardList size={14} />
                  <span>Reception &amp; Patient Intake</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Content Area ── */}
      <main className="worker-main">
        <div className="worker-container">
          {children}
        </div>
      </main>
    </div>
  )
}
