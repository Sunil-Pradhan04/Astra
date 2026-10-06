import { useEffect, useState } from 'react'
import {
  Stethoscope,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Mail,
  UserPlus,
  KeyRound,
  IdCard,
} from 'lucide-react'
import { getDoctors, createDoctor, deleteDoctor } from '../../../api/adminApi'

export default function AddDoctorsTab() {
  const [doctors, setDoctors] = useState([])
  const [form, setForm]       = useState({ full_name: '', email: '', specialization: '' })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError]     = useState('')
  const [created, setCreated] = useState(null)

  const load = () => {
    setFetching(true)
    getDoctors()
      .then(r => setDoctors(r.data))
      .catch(() => {})
      .finally(() => setFetching(false))
  }

  useEffect(() => { load() }, [])

  const handle = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setCreated(null)
    setLoading(true)
    try {
      const res = await createDoctor(form)
      setCreated(res.data)
      setForm({ full_name: '', email: '', specialization: '' })
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create doctor account')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Are you sure you want to remove this doctor?')) return
    await deleteDoctor(id).catch(() => {})
    load()
  }

  return (
    <div className="tab-panel">
      <div className="tab-panel__header">
        <div>
          <h2 className="tab-panel__title">Add Doctors</h2>
          <p className="tab-panel__sub">Create and manage medical practitioner accounts for this hub.</p>
        </div>
      </div>

      {/* Creation form */}
      <div className="staff-form-card">
        <div className="staff-form-card__header">
          <UserPlus size={16} />
          <h3 className="staff-form-card__title">Register New Doctor</h3>
        </div>

        {error && (
          <div className="form-error-banner">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {created && (
          <div className="credentials-box">
            <div className="credentials-box__title">
              <CheckCircle2 size={16} />
              <span>Doctor Account Created</span>
            </div>
            <div className="credentials-box__row">
              <span>Full Name</span>
              <strong>{created.doctor.full_name}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Doctor ID</span>
              <strong className="credentials-box__code">{created.doctor.doctor_id}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Temporary Password</span>
              <strong className="credentials-box__code">{created.plain_password}</strong>
            </div>
            <div className="credentials-box__note">
              {created.email_sent ? (
                <>
                  <Mail size={13} />
                  <span>Credentials have been securely dispatched via email to {created.doctor.email}.</span>
                </>
              ) : (
                <>
                  <AlertCircle size={13} />
                  <span>Email not dispatched (SMTP unconfigured). Please record and share these credentials manually.</span>
                </>
              )}
            </div>
          </div>
        )}

        <form className="staff-form login-form" onSubmit={submit}>
          <div className="staff-form__row">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <div className="form-input-wrap">
                <input
                  name="full_name"
                  className="form-input form-input--no-icon"
                  placeholder="Dr. Eleanor Vance"
                  value={form.full_name}
                  onChange={handle}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <div className="form-input-wrap">
                <input
                  name="email"
                  type="email"
                  className="form-input form-input--no-icon"
                  placeholder="doctor@hospital.org"
                  value={form.email}
                  onChange={handle}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Specialization</label>
              <div className="form-input-wrap">
                <input
                  name="specialization"
                  className="form-input form-input--no-icon"
                  placeholder="e.g. Cardiology, General Medicine"
                  value={form.specialization}
                  onChange={handle}
                />
              </div>
            </div>
          </div>
          <button type="submit" className="btn-submit" style={{ maxWidth: 200 }} disabled={loading}>
            {loading ? 'Registering…' : 'Create Doctor Account'}
          </button>
        </form>
      </div>

      {/* Doctors list */}
      <div className="staff-list">
        <div className="staff-list__header">
          <h3 className="staff-list__title">Registered Doctors ({doctors.length})</h3>
        </div>

        {fetching && (
          <div className="tab-loading">
            <div className="tab-spinner" />
            <span>Loading doctors list…</span>
          </div>
        )}

        {!fetching && doctors.length === 0 && (
          <div className="staff-list__empty">
            <Stethoscope size={24} />
            <p>No doctors registered to this facility yet.</p>
          </div>
        )}

        <div className="staff-list__items">
          {doctors.map(d => (
            <div key={d.doctor_id} className="staff-row">
              <div className="staff-row__avatar">
                <Stethoscope size={16} />
              </div>
              <div className="staff-row__info">
                <div className="staff-row__name">{d.full_name}</div>
                <div className="staff-row__meta">
                  <span className="staff-row__id-pill">{d.doctor_id}</span>
                  <span>{d.email}</span>
                </div>
                {d.specialization && (
                  <div className="staff-row__tag">{d.specialization}</div>
                )}
              </div>
              <div className={`staff-row__status ${d.is_online ? 'online' : ''}`}>
                <span className="staff-row__status-dot" />
                {d.is_online ? 'Online' : 'Offline'}
              </div>
              <button
                className="staff-row__del"
                onClick={() => remove(d.doctor_id)}
                aria-label={`Remove doctor ${d.full_name}`}
                title="Remove doctor"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
