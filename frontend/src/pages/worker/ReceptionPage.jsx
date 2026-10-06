import { useState, useEffect } from 'react'
import WorkerLayout from '../../components/worker/WorkerLayout'
import { intakePatient, getPatientQueue } from '../../api/workerApi'
import {
  UserPlus,
  Users,
  RefreshCw,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Phone,
  MapPin,
  Bot,
  X,
} from 'lucide-react'

export default function ReceptionPage() {
  // Form State — Registration Data Only
  const initialFormState = {
    full_name: '',
    age: '',
    gender: 'Male',
    contact_number: '',
    address: '',
  }

  const [form, setForm] = useState(initialFormState)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [successPatient, setSuccessPatient] = useState(null)

  // Queue State
  const [queue, setQueue] = useState([])
  const [loadingQueue, setLoadingQueue] = useState(true)

  // Hover Popover State (Fixed Viewport Floating Card for Absolute Top Privilege)
  const [hoveredPatient, setHoveredPatient] = useState(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, showBelow: false })

  // Load Queue
  const fetchQueue = async () => {
    setLoadingQueue(true)
    try {
      const res = await getPatientQueue(null, 'all')
      setQueue(res.data || [])
    } catch (err) {
      console.error('Failed to load patient queue:', err)
    } finally {
      setLoadingQueue(false)
    }
  }

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 15000)
    return () => clearInterval(interval)
  }, [])

  // Form Field Change Handler
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (formError) setFormError('')
  }

  // Hover Handler with Viewport Coordinates (Never clipped or trapped by stacking context)
  const handleMouseEnter = (patient, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const showBelow = rect.top < 220
    setPopoverPos({
      top: showBelow ? rect.bottom + 10 : rect.top - 10,
      left: rect.left + rect.width / 2,
      showBelow,
    })
    setHoveredPatient(patient)
  }

  const handleMouseLeave = () => {
    setHoveredPatient(null)
  }

  // Submit Patient Registration
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccessPatient(null)

    if (!form.full_name.trim()) {
      setFormError('Patient full name is required.')
      return
    }
    if (!form.age || parseInt(form.age, 10) <= 0) {
      setFormError('Please enter a valid age.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        full_name: form.full_name.trim(),
        age: parseInt(form.age, 10),
        gender: form.gender,
        contact_number: form.contact_number.trim() || null,
        address: form.address.trim() || null,
      }

      const res = await intakePatient(payload)
      setSuccessPatient(res.data)
      setForm(initialFormState)
      fetchQueue()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to process patient registration. Please verify details.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WorkerLayout
      title="Reception & Patient Intake"
      subtitle="Enter patient demographic data and view the active live queue."
      hideNav={true}
    >
      {/* ── Station Scope Header ── */}
      <div className="reception-station-strip">
        <div className="reception-station-info">
          <span className="station-dot" />
          <span>Patient Registration Desk</span>
        </div>
        <div className="reception-queue-badge">
          <Users size={14} />
          <span><strong>{queue.length}</strong> Patients in Queue</span>
        </div>
      </div>

      {/* ── Registration Success Alert ── */}
      {successPatient && (
        <div className="patient-success-modal fade-in" style={{ marginBottom: 20 }}>
          <div className="patient-success-modal__content">
            <div className="patient-success-modal__badge">
              <CheckCircle2 size={24} color="#16a34a" />
            </div>
            <div className="patient-success-modal__body">
              <div className="patient-success-modal__title">
                Patient Enrolled: <span className="highlight-id">{successPatient.patient_id}</span>
              </div>
              <p className="patient-success-modal__desc">
                <strong>{successPatient.full_name}</strong> ({successPatient.age}y, {successPatient.gender}) has been assigned ID <strong>{successPatient.patient_id}</strong> and added to the queue.
              </p>
            </div>
            <button
              onClick={() => setSuccessPatient(null)}
              className="patient-success-modal__close"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Two-Column Workspace ── */}
      <div className="reception-workspace-grid">
        
        {/* ── Left Column: Pure Demographic Registration Form ── */}
        <section className="reception-form-section">
          <div className="reception-card">
            <div className="reception-card__header">
              <div className="reception-card__title-wrap">
                <UserPlus size={18} className="reception-card__icon" />
                <div>
                  <h3 className="reception-card__title">Patient Registration</h3>
                  <p className="reception-card__sub">
                    Enter basic demographic information to register the patient into the system.
                  </p>
                </div>
              </div>
            </div>

            {formError && (
              <div className="form-error-banner" style={{ margin: '16px 20px 0' }}>
                <AlertCircle size={15} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="reception-form">
              <div className="form-sub-header">
                <span className="form-sub-header__step">01</span>
                <span>Personal Demographics</span>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="full_name">
                    Full Name <span className="text-red">*</span>
                  </label>
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Ramesh Chandra Behera"
                    value={form.full_name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-grid-2-inner">
                  <div className="form-group">
                    <label className="form-label" htmlFor="age">
                      Age <span className="text-red">*</span>
                    </label>
                    <input
                      id="age"
                      name="age"
                      type="number"
                      min="1"
                      max="125"
                      className="form-input"
                      placeholder="e.g. 42"
                      value={form.age}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="gender">
                      Gender <span className="text-red">*</span>
                    </label>
                    <select
                      id="gender"
                      name="gender"
                      className="form-input"
                      value={form.gender}
                      onChange={handleChange}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-sub-header" style={{ marginTop: 20 }}>
                <span className="form-sub-header__step">02</span>
                <span>Contact Details</span>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="contact_number">
                    Contact Phone Number
                  </label>
                  <input
                    id="contact_number"
                    name="contact_number"
                    type="tel"
                    className="form-input"
                    placeholder="e.g. +91 98765 43210"
                    value={form.contact_number}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="address">
                    Residential Address / Village / District
                  </label>
                  <input
                    id="address"
                    name="address"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Ward 4, Balasore"
                    value={form.address}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="reception-form-footer" style={{ marginTop: 20 }}>
                <button
                  type="submit"
                  className="btn-submit-intake"
                  disabled={submitting}
                  id="btn-register-patient"
                >
                  <UserPlus size={16} />
                  <span>{submitting ? 'Registering...' : 'Register Patient & Add to Queue'}</span>
                  <ArrowRight size={16} />
                </button>
                <p className="reception-form-footer__hint">
                  Patient will be assigned a sequential ID (e.g. <code>P-0001</code>) and placed in the queue.
                </p>
              </div>
            </form>
          </div>
        </section>

        {/* ── Right Column: Square Bot Queue (Hover to see all details) ── */}
        <section className="reception-queue-section" style={{ position: 'relative', zIndex: 10 }}>
          <div className="reception-card" style={{ overflow: 'visible' }}>
            <div className="reception-card__header queue-header-flex">
              <div>
                <h3 className="reception-card__title">Patients in Queue</h3>
                <p className="reception-card__sub">
                  Hover over any patient bot to view full details
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="queue-counter-badge">
                  <span className="queue-counter-badge__dot" />
                  <span>{queue.length} in Queue</span>
                </div>
                <button
                  onClick={fetchQueue}
                  className="btn-refresh-queue"
                  title="Refresh Queue"
                  disabled={loadingQueue}
                >
                  <RefreshCw size={13} className={loadingQueue ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Queue Bots Grid */}
            <div className="queue-bots-container" style={{ overflow: 'visible' }}>
              {loadingQueue && queue.length === 0 ? (
                <div className="queue-empty-square-state">
                  <RefreshCw size={24} className="spin text-slate-400" style={{ marginBottom: 12 }} />
                  <p>Loading queue...</p>
                </div>
              ) : queue.length === 0 ? (
                <div className="queue-empty-square-state">
                  <Bot size={40} className="empty-bot-icon" />
                  <h4>No Patients in Queue</h4>
                  <p>Register a patient on the left to add them to the queue.</p>
                </div>
              ) : (
                <div className="queue-bots-grid">
                  {queue.map(patient => (
                    <div
                      key={patient.patient_id}
                      className="patient-bot-box"
                      tabIndex={0}
                      onMouseEnter={(e) => handleMouseEnter(patient, e)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <div className="patient-bot-box__inner">
                        <span className="patient-bot-box__pulse" />
                        <Bot size={22} className="patient-bot-box__icon" />
                        <span className="patient-bot-box__id">{patient.patient_id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── Fixed Viewport Floating Details Popover (Always on Top of Everything) ── */}
      {hoveredPatient && (
        <div
          className={`patient-fixed-popover ${popoverPos.showBelow ? 'show-below' : 'show-above'}`}
          style={{
            top: `${popoverPos.top}px`,
            left: `${popoverPos.left}px`,
            transform: popoverPos.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
        >
          <div className="bot-popover-header">
            <div className="bot-popover-id-wrap">
              <span className="bot-popover-id">{hoveredPatient.patient_id}</span>
              <span className="queue-counter-badge__dot" />
            </div>
            <span className="bot-popover-status">In Queue</span>
          </div>

          <div className="bot-popover-name">{hoveredPatient.full_name}</div>
          
          <div className="bot-popover-meta">
            <span>{hoveredPatient.age} yrs</span>
            <span>·</span>
            <span>{hoveredPatient.gender}</span>
          </div>

          <div className="bot-popover-details">
            <div className="bot-popover-row">
              <Phone size={12} className="bot-popover-icon" />
              <span>{hoveredPatient.contact_number || 'No phone provided'}</span>
            </div>
            <div className="bot-popover-row">
              <MapPin size={12} className="bot-popover-icon" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hoveredPatient.address || 'No address provided'}
              </span>
            </div>
          </div>

          <div className="bot-popover-footer">
            <Clock size={11} />
            <span>Registered at {new Date(hoveredPatient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      )}
    </WorkerLayout>
  )
}
