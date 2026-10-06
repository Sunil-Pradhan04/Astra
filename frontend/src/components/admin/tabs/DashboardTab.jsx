import { useEffect, useState } from 'react'
import {
  Stethoscope,
  Users,
  Smartphone,
  UserCheck,
  Building2,
  Activity,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { getDashboard, getMyCareHub } from '../../../api/adminApi'

function StatCard({ label, value, icon: Icon, sub, status }) {
  return (
    <div className="stat-card">
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <div className="stat-card__icon-wrap">
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      <div className="stat-card__value">{value ?? '—'}</div>
      {sub && (
        <div className="stat-card__sub">
          {status && <span className="stat-card__sub-dot" />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  )
}

export default function DashboardTab({ hub }) {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let activeHubId = hub?.id
    if (!activeHubId) {
      try {
        const stored = JSON.parse(localStorage.getItem('current_hub') || '{}')
        activeHubId = stored?.id
      } catch {}
    }

    if (!activeHubId) {
      getMyCareHub()
        .then(r => {
          const h = r.data?.[0]
          if (h?.id) {
            localStorage.setItem('current_hub', JSON.stringify(h))
            return getDashboard(h.id)
          }
          throw new Error('No facility found')
        })
        .then(r => {
          if (r?.data) setStats(r.data)
        })
        .catch(() => setError('Failed to load dashboard statistics'))
        .finally(() => setLoading(false))
      return
    }

    getDashboard(activeHubId)
      .then(r => {
        setStats(r.data)
        setError('')
      })
      .catch((err) => {
        console.error('Failed to load dashboard stats:', err)
        setError('Failed to load dashboard statistics')
      })
      .finally(() => setLoading(false))
  }, [hub?.id])


  return (
    <div className="tab-panel">
      <div className="tab-panel__header">
        <div>
          <h2 className="tab-panel__title">Dashboard Overview</h2>
          <p className="tab-panel__sub">Live operational data for {hub?.name}</p>
        </div>
        <div className="tab-panel__facility-tag">
          <Building2 size={13} />
          <span>{hub?.hub_type || 'Facility'}</span>
        </div>
      </div>

      {loading && (
        <div className="tab-loading">
          <div className="tab-spinner" />
          <span>Loading statistics…</span>
        </div>
      )}

      {error && (
        <div className="form-error-banner">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {stats && (
        <>
          <div className="stats-grid">
            <StatCard
              label="Total Doctors"
              value={stats.total_doctors}
              icon={Stethoscope}
              sub={`${stats.online_doctors} Active Online`}
              status={stats.online_doctors > 0}
            />
            <StatCard
              label="Health Workers"
              value={stats.total_health_workers}
              icon={Users}
              sub={`${stats.online_health_workers} Active Online`}
              status={stats.online_health_workers > 0}
            />
            <StatCard
              label="Endpoint Devices"
              value={stats.total_endpoint_devices}
              icon={Smartphone}
              sub={`${stats.total_endpoint_devices} Configured`}
            />
            <StatCard
              label="Total Patients"
              value={stats.total_patients}
              icon={UserCheck}
              sub="EMR Integration Ready"
            />
          </div>

          <div className="dashboard-info-card">
            <div className="dashboard-info-card__header">
              <h3 className="dashboard-info-card__title">Facility Status & Details</h3>
              <span className="dashboard-info-card__badge">
                <CheckCircle2 size={12} /> Live Sync
              </span>
            </div>
            <div className="dashboard-info-card__grid">
              <div className="dashboard-info-card__row">
                <span className="dashboard-info-card__label">Facility Name</span>
                <span className="dashboard-info-card__value">{stats.hub_name}</span>
              </div>
              <div className="dashboard-info-card__row">
                <span className="dashboard-info-card__label">Facility Category</span>
                <span className="dashboard-info-card__value">{stats.hub_type}</span>
              </div>
              <div className="dashboard-info-card__row">
                <span className="dashboard-info-card__label">Total Staff Active Online</span>
                <span className="dashboard-info-card__value dashboard-info-card__value--highlight">
                  {stats.online_doctors + stats.online_health_workers} Personnel
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
