import { useEffect, useState } from 'react'
import {
  Users,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Mail,
  UserPlus,
} from 'lucide-react'
import { getHealthWorkers, createHealthWorker, deleteHealthWorker } from '../../../api/adminApi'

export default function AddHealthWorkersTab() {
  const [workers, setWorkers] = useState([])
  const [form, setForm]       = useState({ full_name: '', email: '', designation: '', sub_role: 'Reception' })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError]     = useState('')
  const [created, setCreated] = useState(null)

  const load = () => {
    setFetching(true)
    getHealthWorkers()
      .then(r => setWorkers(r.data))
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
      const res = await createHealthWorker(form)
      setCreated(res.data)
      setForm({ full_name: '', email: '', designation: '', sub_role: 'Reception' })
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create health worker')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Are you sure you want to remove this health worker?')) return
    await deleteHealthWorker(id).catch(() => {})
    load()
  }

  return (
    <div className="tab-panel">
      <div className="tab-panel__header">
        <div>
          <h2 className="tab-panel__title">Health Workers</h2>
          <p className="tab-panel__sub">Register receptionists, AI verification specialists, and pharmacy dispensers.</p>
        </div>
      </div>

      <div className="staff-form-card">
        <div className="staff-form-card__header">
          <UserPlus size={16} />
          <h3 className="staff-form-card__title">Register New Health Worker</h3>
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
              <span>Health Worker Account Created</span>
            </div>
            <div className="credentials-box__row">
              <span>Full Name</span>
              <strong>{created.worker.full_name}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Assigned Role</span>
              <strong>{created.worker.sub_role || 'Reception'}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Unique Worker ID</span>
              <strong className="credentials-box__code">{created.worker.worker_id}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Temporary Password</span>
              <strong className="credentials-box__code">{created.plain_password}</strong>
            </div>
            <div className="credentials-box__note">
              {created.email_sent ? (
                <>
                  <Mail size={13} />
                  <span>Credentials have been securely dispatched via email to {created.worker.email}.</span>
                </>
              ) : (
                <>
                  <AlertCircle size={13} />
                  <span>Email not dispatched. Please share credentials manually.</span>
                </>
              )}
            </div>
          </div>
        )}

        <form className="staff-form login-form" onSubmit={submit}>
          <div className="staff-form__row" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="sub_role">Operational Department / Role *</label>
              <div className="form-input-wrap">
                <select
                  id="sub_role"
                  name="sub_role"
                  className="form-input form-input--no-icon"
                  value={form.sub_role}
                  onChange={handle}
                  required
                >
                  <option value="Reception">Reception Desk (Auto ID: REC-XXXXX)</option>
                  <option value="Verification">Clinical Verification (Auto ID: VER-XXXXX)</option>
                  <option value="Dispensing">Pharmacy Dispensing (Auto ID: DIS-XXXXX)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="full_name">Full Name *</label>
              <div className="form-input-wrap">
                <input
                  id="full_name"
                  name="full_name"
                  className="form-input form-input--no-icon"
                  placeholder="Sarah Jenkins"
                  value={form.full_name}
                  onChange={handle}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address *</label>
              <div className="form-input-wrap">
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-input form-input--no-icon"
                  placeholder="worker@clinic.org"
                  value={form.email}
                  onChange={handle}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="designation">Designation / Title</label>
              <div className="form-input-wrap">
                <input
                  id="designation"
                  name="designation"
                  className="form-input form-input--no-icon"
                  placeholder="e.g. Lead Receptionist, Nurse"
                  value={form.designation}
                  onChange={handle}
                />
              </div>
            </div>
          </div>



          <button type="submit" className="btn-submit" style={{ maxWidth: 220 }} disabled={loading}>
            {loading ? 'Registering…' : 'Create Worker Account'}
          </button>
        </form>
      </div>

      <div className="staff-list">
        <div className="staff-list__header">
          <h3 className="staff-list__title">Registered Health Workers ({workers.length})</h3>
        </div>

        {fetching && (
          <div className="tab-loading">
            <div className="tab-spinner" />
            <span>Loading health workers…</span>
          </div>
        )}

        {!fetching && workers.length === 0 && (
          <div className="staff-list__empty">
            <Users size={24} />
            <p>No health workers registered to this facility yet.</p>
          </div>
        )}

        <div className="staff-list__items">
          {workers.map(w => (
            <div key={w.worker_id} className="staff-row">
              <div className="staff-row__avatar">
                <Users size={16} />
              </div>
              <div className="staff-row__info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="staff-row__name">{w.full_name}</div>
                  <span className={`staff-role-badge staff-role-badge--${w.sub_role?.toLowerCase() || 'reception'}`}>
                    {w.sub_role || 'Reception'}
                  </span>
                </div>
                <div className="staff-row__meta">
                  <span className="staff-row__id-pill">{w.worker_id}</span>
                  <span>{w.email}</span>
                </div>
                {w.designation && (
                  <div className="staff-row__tag">{w.designation}</div>
                )}
              </div>
              <div className={`staff-row__status ${w.is_online ? 'online' : ''}`}>
                <span className="staff-row__status-dot" />
                {w.is_online ? 'Online' : 'Offline'}
              </div>
              <button
                className="staff-row__del"
                onClick={() => remove(w.worker_id)}
                aria-label={`Remove worker ${w.full_name}`}
                title="Remove worker"
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
