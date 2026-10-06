import { useEffect, useState } from 'react'
import {
  Smartphone,
  Trash2,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  MapPin,
  Cpu,
} from 'lucide-react'
import { getDevices, createDevice, deleteDevice } from '../../../api/adminApi'

export default function AddEndpointDevicesTab() {
  const [devices, setDevices] = useState([])
  const [form, setForm]       = useState({ device_name: '', location: '' })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError]     = useState('')
  const [created, setCreated] = useState(null)

  const load = () => {
    setFetching(true)
    getDevices()
      .then(r => setDevices(r.data))
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
      const res = await createDevice(form)
      setCreated(res.data)
      setForm({ device_name: '', location: '' })
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to register endpoint device')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Are you sure you want to remove this endpoint device?')) return
    await deleteDevice(id).catch(() => {})
    load()
  }


  return (
    <div className="tab-panel">
      <div className="tab-panel__header">
        <div>
          <h2 className="tab-panel__title">Endpoint Devices</h2>
          <p className="tab-panel__sub">Register hardware kiosk devices, tablet stations, and point-of-care terminals.</p>
        </div>
      </div>

      <div className="staff-form-card">
        <div className="staff-form-card__header">
          <PlusCircle size={16} />
          <h3 className="staff-form-card__title">Register New Endpoint Device</h3>
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
              <span>Device Registered Successfully</span>
            </div>
            <div className="credentials-box__row">
              <span>Device Name</span>
              <strong>{created.device.device_name}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Assigned Device ID</span>
              <strong className="credentials-box__code">{created.device.device_id}</strong>
            </div>
            <div className="credentials-box__row">
              <span>Access Password</span>
              <strong className="credentials-box__code">{created.plain_password}</strong>
            </div>
            <div className="credentials-box__note">
              <AlertCircle size={13} />
              <span>Please record these credentials immediately. For security, the plain password will not be displayed again.</span>
            </div>
          </div>
        )}

        <form className="staff-form login-form" onSubmit={submit}>
          <div className="staff-form__row">
            <div className="form-group">
              <label className="form-label">Device Name / Label *</label>
              <div className="form-input-wrap">
                <input
                  name="device_name"
                  className="form-input form-input--no-icon"
                  placeholder="e.g. OPD Reception Kiosk 01"
                  value={form.device_name}
                  onChange={handle}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Installation Location</label>
              <div className="form-input-wrap">
                <input
                  name="location"
                  className="form-input form-input--no-icon"
                  placeholder="e.g. Ground Floor, Room 104"
                  value={form.location}
                  onChange={handle}
                />
              </div>
            </div>
          </div>
          <button type="submit" className="btn-submit" style={{ maxWidth: 220 }} disabled={loading}>
            {loading ? 'Registering…' : 'Register Terminal'}
          </button>
        </form>
      </div>

      <div className="staff-list">
        <div className="staff-list__header">
          <h3 className="staff-list__title">Configured Devices ({devices.length})</h3>
        </div>

        {fetching && (
          <div className="tab-loading">
            <div className="tab-spinner" />
            <span>Loading devices…</span>
          </div>
        )}

        {!fetching && devices.length === 0 && (
          <div className="staff-list__empty">
            <Smartphone size={24} />
            <p>No endpoint devices configured for this facility yet.</p>
          </div>
        )}

        <div className="staff-list__items">
          {devices.map(d => (
            <div key={d.device_id} className="staff-row">
              <div className="staff-row__avatar">
                <Smartphone size={16} />
              </div>
              <div className="staff-row__info">
                <div className="staff-row__name">{d.device_name}</div>
                <div className="staff-row__meta">
                  <span className="staff-row__id-pill">{d.device_id}</span>
                  {d.location && (
                    <span className="staff-row__location">
                      <MapPin size={11} /> {d.location}
                    </span>
                  )}
                </div>
              </div>
              <div className={`staff-row__status ${d.is_online ? 'online' : ''}`}>
                <span className="staff-row__status-dot" />
                {d.is_online ? 'Online' : 'Offline'}
              </div>
              <button
                className="staff-row__del"
                onClick={() => remove(d.device_id)}
                aria-label={`Remove device ${d.device_name}`}
                title="Remove device"
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
