import { useEffect, useState } from 'react'
import {
  Mail,
  Send,
  Check,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Users,
  Search,
} from 'lucide-react'
import { getRecipients, sendEmail } from '../../../api/adminApi'

export default function CommunicateTab() {
  const [recipients, setRecipients] = useState([])
  const [selected, setSelected]     = useState([])
  const [form, setForm]             = useState({ subject: '', message: '' })
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState('')

  useEffect(() => {
    getRecipients()
      .then(r => setRecipients(r.data.recipients))
      .catch(() => {})
  }, [])

  const toggleSelect = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectAll = () => setSelected(recipients.map(r => r.id))
  const clearAll  = () => setSelected([])

  const submit = async (e) => {
    e.preventDefault()
    if (selected.length === 0) {
      setError('Please select at least one recipient from the directory.')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const res = await sendEmail({ to_ids: selected, ...form })
      setResult(res.data)
      setForm({ subject: '', message: '' })
      setSelected([])
    } catch {
      setError('Failed to dispatch emails. Please verify connectivity.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tab-panel">
      <div className="tab-panel__header">
        <div>
          <h2 className="tab-panel__title">Communications Hub</h2>
          <p className="tab-panel__sub">Dispatch direct operational notices and alerts to doctors and staff.</p>
        </div>
      </div>

      {error && (
        <div className="form-error-banner">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="credentials-box">
          <div className="credentials-box__title">
            <CheckCircle2 size={16} />
            <span>Dispatch Results</span>
          </div>
          <div className="credentials-box__row">
            <span>Successfully Sent</span>
            <strong>{result.sent}</strong>
          </div>
          <div className="credentials-box__row">
            <span>Simulated / Unsent</span>
            <strong>{result.failed}</strong>
          </div>
          {result.failed > 0 && (
            <div className="credentials-box__note">
              <AlertCircle size={13} />
              <span>Some emails were logged in demo mode because SMTP is not configured in backend .env.</span>
            </div>
          )}
        </div>
      )}

      <div className="comm-layout">
        {/* Recipient selector */}
        <div className="comm-recipients">
          <div className="comm-recipients__header">
            <span className="staff-list__title">Staff Directory ({recipients.length})</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="comm-sel-btn" onClick={selectAll}>Select All</button>
              <button className="comm-sel-btn" onClick={clearAll}>Clear</button>
            </div>
          </div>

          {recipients.length === 0 && (
            <div className="staff-list__empty">
              <Users size={20} />
              <p>No staff accounts registered yet.</p>
            </div>
          )}

          <div className="comm-recipients__list">
            {recipients.map(r => {
              const isSelected = selected.includes(r.id)
              return (
                <label
                  key={r.id}
                  className={`comm-recipient ${isSelected ? 'comm-recipient--selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(r.id)}
                    style={{ display: 'none' }}
                  />
                  <div className="staff-row__avatar">
                    {r.role === 'Doctor' ? <Stethoscope size={15} /> : <Users size={15} />}
                  </div>
                  <div className="staff-row__info">
                    <div className="staff-row__name">{r.name}</div>
                    <div className="staff-row__meta">{r.role} · {r.id}</div>
                  </div>
                  <div className={`comm-recipient__check ${isSelected ? 'active' : ''}`}>
                    {isSelected && <Check size={13} strokeWidth={3} />}
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Compose */}
        <form className="comm-compose login-form" onSubmit={submit}>
          <div className="staff-form-card__header">
            <Mail size={16} />
            <h3 className="staff-form-card__title">Compose Notice</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Subject Line *</label>
            <div className="form-input-wrap">
              <input
                className="form-input form-input--no-icon"
                placeholder="e.g. Schedule Update or Facility Notice"
                value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Message Content *</label>
            <div className="form-input-wrap">
              <textarea
                className="form-input form-input--no-icon"
                rows={6}
                placeholder="Compose announcement, emergency briefing or instructions…"
                value={form.message}
                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="comm-compose__footer">
            <span className="comm-compose__count">
              Recipients selected: <strong>{selected.length}</strong>
            </span>
            <button type="submit" className="btn-submit" style={{ maxWidth: 200 }} disabled={loading}>
              <Send size={14} />
              <span>{loading ? 'Transmitting…' : 'Send Broadcast'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
