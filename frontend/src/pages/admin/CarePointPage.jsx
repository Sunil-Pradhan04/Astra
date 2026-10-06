import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Home,
  Tent,
  Factory,
  GraduationCap,
  HeartPulse,
  LogOut,
  ArrowLeft,
  ArrowRight,
  MapPin,
  User,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react'
import { getFacilities, createFacility, deleteFacility } from '../../api/adminApi'
import LocationPickerModal from '../../components/admin/LocationPickerModal'

const FACILITY_TYPES = [
  { type: 'Government Hospital',          icon: Building2,     desc: 'Public government-run hospital' },
  { type: 'Primary Health Center (PHC)',  icon: HeartPulse,    desc: 'Rural primary care center' },
  { type: 'Public Health Camp',           icon: Tent,          desc: 'Temporary field health camp' },
  { type: 'Company Clinic',               icon: Home,          desc: 'Corporate employee clinic' },
  { type: 'Industrial Health Unit',       icon: Factory,       desc: 'Factory / industrial facility' },
  { type: 'Campus Health Center',         icon: GraduationCap, desc: 'College / university health unit' },
]

function LogoutBtn() {
  const navigate = useNavigate()
  const logout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_info')
    localStorage.removeItem('current_hub')
    navigate('/login/admin')
  }
  return (
    <button onClick={logout} className="cp-logout-btn">
      <LogOut size={13} />
      <span>Sign Out</span>
    </button>
  )
}

export default function CarePointPage() {
  const navigate = useNavigate()
  const [facilities, setFacilities] = useState([])
  const [loading, setLoading]       = useState(true)
  const [creating, setCreating]     = useState(false)
  const [step, setStep]             = useState('view')   // 'view' | 'choose' | 'form'
  const [chosen, setChosen]         = useState(null)
  const [form, setForm]             = useState({ name: '', address: '', description: '', latitude: null, longitude: null })
  const [showMapModal, setShowMapModal] = useState(false)
  const [error, setError]           = useState('')
  const [notification, setNotification] = useState('')

  // Delete Modal State
  const [facilityToDelete, setFacilityToDelete] = useState(null)
  const [deleting, setDeleting]                 = useState(false)

  const admin = JSON.parse(localStorage.getItem('admin_info') || '{}')

  const fetchAllFacilities = async () => {
    setLoading(true)
    try {
      const res = await getFacilities()
      setFacilities(res.data || [])
    } catch (err) {
      console.error('Failed to load facilities:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllFacilities()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Facility name is required'); return }
    setCreating(true)
    setError('')
    try {
      const res = await createFacility({ ...form, hub_type: chosen })
      setFacilities(prev => [...prev, res.data])
      setNotification(`Facility "${res.data.name}" created successfully.`)
      setForm({ name: '', address: '', description: '', latitude: null, longitude: null })
      setChosen(null)
      setStep('view')
      setTimeout(() => setNotification(''), 4500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create facility')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!facilityToDelete) return
    setDeleting(true)
    try {
      await deleteFacility(facilityToDelete.id)
      setFacilities(prev => prev.filter(f => f.id !== facilityToDelete.id))

      // Clear current_hub from localStorage if it was the deleted one
      try {
        const current = JSON.parse(localStorage.getItem('current_hub') || '{}')
        if (current.id === facilityToDelete.id) {
          localStorage.removeItem('current_hub')
        }
      } catch {}

      setNotification(`Facility "${facilityToDelete.name}" was permanently deleted.`)
      setFacilityToDelete(null)
      setTimeout(() => setNotification(''), 4500)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete facility. Please retry.')
    } finally {
      setDeleting(false)
    }
  }

  const handleEnterFacility = (facility) => {
    localStorage.setItem('current_hub', JSON.stringify(facility))
    navigate('/admin/hub')
  }

  if (loading) return (
    <div className="cp-loading">
      <div className="cp-spinner" />
      <p>Loading your healthcare facilities…</p>
    </div>
  )

  return (
    <div className="cp-page">
      {/* Header */}
      <header className="cp-header">
        <div className="cp-header__logo">
          <div className="topbar__logo-mark">A</div>
          <span className="topbar__brand">Astra Healthcare</span>
        </div>
        <div className="cp-header__right">
          <div className="cp-header__user">
            <User size={15} />
            <span>{admin.username || admin.email}</span>
          </div>
          <LogoutBtn />
        </div>
      </header>

      <main className="cp-main">
        {/* Toast / Banner Notification */}
        {notification && (
          <div className="cp-notification-toast fade-in">
            <CheckCircle2 size={16} color="#16a34a" />
            <span>{notification}</span>
          </div>
        )}

        {/* ── View Step 1: No facilities yet ── */}
        {facilities.length === 0 && step === 'view' && (
          <div className="cp-empty fade-up">
            <div className="cp-empty__icon">
              <Building2 size={44} strokeWidth={1.5} />
            </div>
            <h1 className="cp-empty__title">Healthcare Facilities</h1>
            <p className="cp-empty__subtitle">
              No healthcare facilities configured yet. Create a facility to begin managing clinical staff, endpoint devices, and patient queues.
            </p>
            <button
              className="btn-submit"
              style={{ maxWidth: 280, margin: '0 auto' }}
              onClick={() => { setStep('choose'); setError('') }}
            >
              <Plus size={16} />
              <span>Create a Facility</span>
            </button>
          </div>
        )}

        {/* ── View Step 2: List of facilities ── */}
        {facilities.length > 0 && step === 'view' && (
          <div className="cp-facilities-container fade-up">
            <div className="cp-facilities-header">
              <div>
                <h1 className="cp-section-title">Healthcare Facilities</h1>
                <p className="cp-section-sub">
                  Select an active facility to access its clinical workspaces, or manage and create new facilities.
                </p>
              </div>
              <button
                className="btn-create-facility-top"
                onClick={() => { setStep('choose'); setError('') }}
              >
                <Plus size={16} />
                <span>Create Facility</span>
              </button>
            </div>

            <div className="cp-facilities-grid">
              {facilities.map(facility => (
                <div key={facility.id} className="cp-facility-card">
                  <div className="facility-card-badge">{facility.hub_type || 'Healthcare Facility'}</div>
                  <div className="facility-card-icon">
                    <Building2 size={32} strokeWidth={1.7} />
                  </div>
                  <h3 className="facility-card-title">{facility.name}</h3>

                  {facility.address && (
                    <p className="facility-card-addr">
                      <MapPin size={13} />
                      <span>{facility.address}</span>
                    </p>
                  )}

                  {facility.description && (
                    <p className="facility-card-desc">{facility.description}</p>
                  )}

                  {facility.latitude != null && facility.longitude != null && (
                    <div className="facility-card-coords">
                      <MapPin size={12} />
                      <span>GPS: {facility.latitude.toFixed(4)}, {facility.longitude.toFixed(4)}</span>
                      <a
                        href={`https://www.google.com/maps?q=${facility.latitude},${facility.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="facility-card-map-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Map ↗
                      </a>
                    </div>
                  )}

                  <div className="facility-card-actions">
                    <button
                      className="btn-enter-facility"
                      onClick={() => handleEnterFacility(facility)}
                    >
                      <span>Enter Facility</span>
                      <ArrowRight size={15} />
                    </button>
                    <button
                      className="btn-delete-facility"
                      title={`Delete ${facility.name}`}
                      onClick={() => setFacilityToDelete(facility)}
                    >
                      <Trash2 size={15} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pick facility type ── */}
        {step === 'choose' && (
          <div className="cp-choose fade-up">
            <button className="cp-back-btn" onClick={() => setStep('view')}>
              <ArrowLeft size={14} />
              <span>Back to Facilities</span>
            </button>
            <h1 className="cp-section-title">Select Facility Type</h1>
            <p className="cp-section-sub">Choose the operational model of the healthcare facility you manage.</p>
            <div className="hub-type-grid">
              {FACILITY_TYPES.map(h => {
                const IconComponent = h.icon
                return (
                  <button
                    key={h.type}
                    className="hub-type-card"
                    onClick={() => { setChosen(h.type); setStep('form') }}
                  >
                    <div className="hub-type-card__icon">
                      <IconComponent size={26} strokeWidth={1.8} />
                    </div>
                    <span className="hub-type-card__name">{h.type}</span>
                    <span className="hub-type-card__desc">{h.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Fill facility details ── */}
        {step === 'form' && (
          <div className="cp-form-wrap fade-up">
            <button className="cp-back-btn" onClick={() => setStep('choose')}>
              <ArrowLeft size={14} />
              <span>Back to Type Selection</span>
            </button>
            <h1 className="cp-section-title">Create {chosen}</h1>
            <p className="cp-section-sub">Configure the operational profile for your new facility.</p>

            {error && <div className="form-error-banner">{error}</div>}

            <form className="cp-form login-form" onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Facility Name *</label>
                <div className="form-input-wrap">
                  <input
                    className="form-input form-input--no-icon"
                    placeholder="e.g. City General Hospital"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address <span>(optional)</span></label>
                <div className="form-input-wrap">
                  <input
                    className="form-input form-input--no-icon"
                    placeholder="Street address, City, State"
                    value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description <span>(optional)</span></label>
                <div className="form-input-wrap">
                  <textarea
                    className="form-input form-input--no-icon"
                    rows={3}
                    placeholder="Brief description of departments and clinical capacity"
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* Facility Location / Map Picker */}
              <div className="form-group">
                <label className="form-label">
                  Facility Location & GPS Coordinates <span>(for Patient Transfer)</span>
                </label>
                <div className={`form-location-box ${form.latitude != null && form.longitude != null ? 'form-location-box--selected' : ''}`}>
                  <div className="form-location-row">
                    <div className="form-location-left">
                      <div className="form-location-icon">
                        <MapPin size={20} />
                      </div>
                      <div className="form-location-text">
                        <h4>{form.latitude != null && form.longitude != null ? 'GPS Coordinates Locked' : 'No Location Selected'}</h4>
                        {form.latitude != null && form.longitude != null ? (
                          <div>
                            <p>Accurate facility coordinates saved for patient routing:</p>
                            <div className="form-location-coords-tag">
                              📍 {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                            </div>
                          </div>
                        ) : (
                          <p>Pinpoint facility on Google Maps or use device GPS for transfer routing.</p>
                        )}
                      </div>
                    </div>
                    <div className="form-location-actions">
                      <button
                        type="button"
                        className="btn-open-map-picker"
                        onClick={() => setShowMapModal(true)}
                      >
                        <MapPin size={14} />
                        <span>{form.latitude != null && form.longitude != null ? 'Change on Map' : 'Select on Map'}</span>
                      </button>
                      {form.latitude != null && (
                        <button
                          type="button"
                          className="btn-clear-coords"
                          onClick={() => setForm(p => ({ ...p, latitude: null, longitude: null }))}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-submit" disabled={creating}>
                <span>{creating ? 'Establishing Facility…' : 'Create Facility'}</span>
                <ArrowRight size={15} />
              </button>
            </form>
          </div>
        )}
      </main>

      {/* ── Delete Confirmation Modal ── */}
      {facilityToDelete && (
        <div className="cp-modal-backdrop fade-in">
          <div className="cp-modal-card">
            <div className="cp-modal-icon-wrap">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h3 className="cp-modal-title">Delete Facility?</h3>
            <p className="cp-modal-desc">
              Are you sure you want to permanently delete <strong>{facilityToDelete.name}</strong>?
            </p>
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
                onClick={() => setFacilityToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cp-modal-btn-delete"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? 'Deleting Facility…' : 'Yes, Delete Facility'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Google Maps Location Picker Modal ── */}
      {showMapModal && (
        <LocationPickerModal
          initialLat={form.latitude}
          initialLng={form.longitude}
          onClose={() => setShowMapModal(false)}
          onConfirm={({ latitude, longitude }) => {
            setForm(p => ({ ...p, latitude, longitude }))
            setShowMapModal(false)
          }}
        />
      )}
    </div>
  )
}
