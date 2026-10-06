import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  User,
  CheckCircle2,
  Save,
  Shield,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  MapPin,
} from 'lucide-react'
import { getProfile, updateUsername, deleteFacility } from '../../../api/adminApi'

export default function SettingsTab({ hub, admin: adminProp }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [username, setUsername] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  // Delete Facility Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingFacility, setDeletingFacility] = useState(false)
  const [deleteError, setDeleteError]         = useState('')

  useEffect(() => {
    getProfile()
      .then(r => { setProfile(r.data); setUsername(r.data.username) })
      .catch(() => {})
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await updateUsername(username)
      setMsg('Username updated successfully.')
      const info = JSON.parse(localStorage.getItem('admin_info') || '{}')
      info.username = username
      localStorage.setItem('admin_info', JSON.stringify(info))
    } catch {
      setMsg('Failed to update username.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteFacility = async () => {
    if (!hub?.id) return
    setDeletingFacility(true)
    setDeleteError('')
    try {
      await deleteFacility(hub.id)
      localStorage.removeItem('current_hub')
      navigate('/admin/care-point')
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Failed to delete facility. Please retry.')
      setDeletingFacility(false)
    }
  }

  return (
    <div className="tab-panel">
      <div className="tab-panel__header">
        <div>
          <h2 className="tab-panel__title">Settings & Configuration</h2>
          <p className="tab-panel__sub">Facility parameters, administrative profile, and system settings.</p>
        </div>
      </div>

      {/* Facility Profile */}
      <div className="settings-card">
        <div className="staff-form-card__header">
          <Building2 size={16} />
          <h3 className="staff-form-card__title">Facility Profile</h3>
        </div>
        <div className="dashboard-info-card">
          <div className="dashboard-info-card__row">
            <span className="dashboard-info-card__label">Facility Name</span>
            <span className="dashboard-info-card__value">{hub?.name}</span>
          </div>
          <div className="dashboard-info-card__row">
            <span className="dashboard-info-card__label">Facility Classification</span>
            <span className="dashboard-info-card__value">{hub?.hub_type}</span>
          </div>
          {hub?.address && (
            <div className="dashboard-info-card__row">
              <span className="dashboard-info-card__label">Physical Address</span>
              <span className="dashboard-info-card__value">{hub.address}</span>
            </div>
          )}
          {hub?.latitude != null && hub?.longitude != null && (
            <div className="dashboard-info-card__row">
              <span className="dashboard-info-card__label">GPS Coordinates</span>
              <span className="dashboard-info-card__value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={13} color="#2563eb" />
                <span>{hub.latitude.toFixed(5)}, {hub.longitude.toFixed(5)}</span>
                <a
                  href={`https://www.google.com/maps?q=${hub.latitude},${hub.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#2563eb', fontSize: 12, textDecoration: 'none', fontWeight: 600, marginLeft: 6 }}
                >
                  Open in Google Maps ↗
                </a>
              </span>
            </div>
          )}
          <div className="dashboard-info-card__row">
            <span className="dashboard-info-card__label">Facility Identifier</span>
            <span className="dashboard-info-card__value" style={{ fontSize: 12, fontFamily: 'monospace' }}>
              {hub?.id}
            </span>
          </div>
        </div>
      </div>

      {/* Admin profile */}
      <div className="settings-card">
        <div className="staff-form-card__header">
          <User size={16} />
          <h3 className="staff-form-card__title">Administrator Account</h3>
        </div>

        {profile && (
          <div className="dashboard-info-card" style={{ marginBottom: 20 }}>
            <div className="dashboard-info-card__row">
              <span className="dashboard-info-card__label">Registered Email</span>
              <span className="dashboard-info-card__value">{profile.email}</span>
            </div>
            <div className="dashboard-info-card__row">
              <span className="dashboard-info-card__label">Registration Date</span>
              <span className="dashboard-info-card__value">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        {msg && (
          <div className="credentials-box" style={{ marginBottom: 16 }}>
            <div className="credentials-box__title">
              <CheckCircle2 size={15} />
              <span>{msg}</span>
            </div>
          </div>
        )}

        <form className="login-form" onSubmit={save} style={{ maxWidth: 440 }}>
          <div className="form-group">
            <label className="form-label">Display Username</label>
            <div className="form-input-wrap">
              <input
                className="form-input form-input--no-icon"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn-submit" style={{ maxWidth: 180 }} disabled={saving}>
            <Save size={14} />
            <span>{saving ? 'Updating…' : 'Save Changes'}</span>
          </button>
        </form>
      </div>

      {/* Danger Zone: Delete Facility */}
      <div className="settings-card" style={{ borderColor: '#fecaca', background: '#fffafa' }}>
        <div className="staff-form-card__header" style={{ borderBottomColor: '#fee2e2' }}>
          <AlertTriangle size={16} color="#dc2626" />
          <h3 className="staff-form-card__title" style={{ color: '#dc2626' }}>Danger Zone: Delete Facility</h3>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          Permanently delete <strong>{hub?.name}</strong>. All associated clinical staff, doctors, endpoint devices, and patient queue records will be cascade deleted.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="btn-danger-outline"
        >
          <Trash2 size={14} />
          <span>Delete Facility ({hub?.name})</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="cp-modal-backdrop fade-in">
          <div className="cp-modal-card">
            <div className="cp-modal-icon-wrap">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h3 className="cp-modal-title">Delete Facility?</h3>
            <p className="cp-modal-desc">
              Are you sure you want to permanently delete <strong>{hub?.name}</strong>?
            </p>
            {deleteError && (
              <div className="form-error-banner" style={{ marginBottom: 12 }}>
                {deleteError}
              </div>
            )}
            <div className="cp-modal-warning-box">
              <ShieldAlert size={16} />
              <span>
                All registered medical doctors, health workers, endpoint devices, and patient queue records associated with this facility will be permanently deleted.
              </span>
            </div>
            <div className="cp-modal-actions">
              <button
                type="button"
                className="cp-modal-btn-cancel"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingFacility}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cp-modal-btn-delete"
                onClick={handleDeleteFacility}
                disabled={deletingFacility}
              >
                {deletingFacility ? 'Deleting Facility…' : 'Yes, Delete Facility'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
