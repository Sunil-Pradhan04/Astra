import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminLogin, adminRegister } from '../../api/adminApi'

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
)
const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
  </svg>
)
const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconEye = ({ off }) => off ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

// ── Field ──────────────────────────────────────────────────────────────────────
function Field({ label, name, type = 'text', icon, placeholder, value, onChange }) {
  const [show, setShow] = useState(false)
  const isPw = type === 'password'
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={name}>{label}</label>
      <div className="form-input-wrap">
        <span className="form-input-icon">{icon}</span>
        <input
          id={name} name={name}
          type={isPw ? (show ? 'text' : 'password') : type}
          className="form-input"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
        />
        {isPw && (
          <button type="button" className="form-input-toggle" onClick={() => setShow(s => !s)}>
            <IconEye off={show} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [tab, setTab]       = useState('login')
  const [form, setForm]     = useState({})
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let res
      if (tab === 'login') {
        res = await adminLogin({ email: form.email, password: form.password })
      } else {
        if (form.password !== form.confirm_password) {
          setError('Passwords do not match'); setLoading(false); return
        }
        res = await adminRegister({
          username: form.username,
          email: form.email,
          password: form.password,
          confirm_password: form.confirm_password,
        })
      }
      const data = res.data
      localStorage.setItem('admin_token', data.access_token)
      localStorage.setItem('admin_info', JSON.stringify({
        admin_id: data.admin_id,
        email: data.email,
        username: data.username,
      }))
      navigate('/admin/care-point')
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page fade-in">
      {/* Topbar */}
      <header className="login-topbar">
        <Link to="/" className="login-topbar__back"><IconBack /> Back</Link>
        <div className="login-topbar__logo">
          <div className="login-box__logo-mark">A</div>
          <span className="login-box__logo-text">Astra</span>
        </div>
        <div className="login-topbar__role-badge">Admin <span>·</span> 02</div>
      </header>

      <main className="login-page__center">
        <div className="login-box">
          <div className="login-box__header">
            <h2 className="login-box__title">
              {tab === 'login' ? 'Admin Sign In' : 'Create Admin Account'}
            </h2>
            <p className="login-box__subtitle">
              {tab === 'login' ? 'Access your Facility control panel.' : 'Register a new admin account.'}
            </p>
          </div>

          {/* Tabs */}
          <div className="login-box__tabs" role="tablist">
            <button className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setForm({}); setError('') }}>Login</button>
            <button className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setForm({}); setError('') }}>Register</button>
          </div>

          {error && (
            <div className="form-error-banner">{error}</div>
          )}

          <form className="login-form" onSubmit={submit} noValidate>
            {tab === 'register' && (
              <Field label="Username" name="username" type="text"
                icon={<IconUser />} placeholder="Choose a username"
                value={form.username || ''} onChange={handle} />
            )}
            <Field label="Email Address" name="email" type="email"
              icon={<IconMail />} placeholder="admin@hospital.com"
              value={form.email || ''} onChange={handle} />
            <Field label="Password" name="password" type="password"
              icon={<IconLock />} placeholder="Your password"
              value={form.password || ''} onChange={handle} />
            {tab === 'register' && (
              <Field label="Confirm Password" name="confirm_password" type="password"
                icon={<IconLock />} placeholder="Re-enter your password"
                value={form.confirm_password || ''} onChange={handle} />
            )}
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
              {!loading && <IconArrow />}
            </button>
          </form>

          <p className="login-box__help">
            Wrong portal? <Link to="/">Select a different role</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
