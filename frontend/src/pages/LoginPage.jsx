import { useState } from 'react'
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom'
import AdminLoginPage from './admin/AdminLoginPage'
import { healthWorkerLogin } from '../api/workerApi'
import { deviceLogin } from '../api/deviceApi'
import { doctorLogin } from '../api/doctorApi'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
)

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M2 7l10 7 10-7"/>
  </svg>
)

const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

const IconId = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <circle cx="8" cy="12" r="2"/>
    <path d="M14 9h4M14 12h4M14 15h2"/>
  </svg>
)

const IconEyeOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

const IconSubmit = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
)

// Role-specific icons for left panel
const RoleIcons = {
  patient: () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
      <path d="M12 11v4M10 13h4"/>
    </svg>
  ),
  admin: () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  doctor: () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
    </svg>
  ),
  'health-worker': () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  'endpoint-device': () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
         stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <line x1="12" y1="18" x2="12" y2="18"/>
    </svg>
  ),
}

// ── Role Config ───────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  patient: {
    label: 'Patient',
    number: '01',
    heading: 'Patient Portal',
    tagline: 'Securely access your medical records, appointments and personal health dashboard.',
    pills: ['Medical Records', 'Appointments'],
    hint: {
      title: 'Patient Login',
      text: 'Enter your assigned User ID and password to access your health portal.',
    },
    fields: {
      login: [
        { name: 'userId',   label: 'User ID',  type: 'text',     icon: 'id',   placeholder: 'e.g. PAT-00123' },
        { name: 'password', label: 'Password', type: 'password', icon: 'lock', placeholder: 'Your password' },
      ],
    },
    tabs: false,
  },
  admin: {
    label: 'Admin',
    number: '02',
    heading: 'Admin Panel',
    tagline: 'Full system access. Manage users, data and all operational configurations.',
    pills: ['System Control', 'User Management'],
    hint: {
      title: 'Admin Access',
      text: 'Use your registered email and password. New admin? Register below.',
    },
    fields: {
      login: [
        { name: 'email',    label: 'Email Address', type: 'email',    icon: 'mail', placeholder: 'admin@hospital.com' },
        { name: 'password', label: 'Password',      type: 'password', icon: 'lock', placeholder: 'Your password' },
      ],
      register: [
        { name: 'username',        label: 'Username',         type: 'text',     icon: 'user', placeholder: 'Choose a username' },
        { name: 'email',           label: 'Email Address',    type: 'email',    icon: 'mail', placeholder: 'admin@hospital.com' },
        { name: 'password',        label: 'Password',         type: 'password', icon: 'lock', placeholder: 'Create a strong password' },
        { name: 'confirmPassword', label: 'Confirm Password', type: 'password', icon: 'lock', placeholder: 'Re-enter your password' },
      ],
    },
    tabs: true,
  },
  doctor: {
    label: 'Doctor',
    number: '03',
    heading: 'Doctor Portal',
    tagline: 'Access patient consultations, prescriptions and medical case histories.',
    pills: ['Patient Cases', 'Prescriptions'],
    hint: {
      title: 'Doctor Login',
      text: 'Use your hospital-assigned Doctor ID and password to sign in.',
    },
    fields: {
      login: [
        { name: 'doctorId', label: 'Doctor ID', type: 'text',     icon: 'id',   placeholder: 'e.g. DOC-00456' },
        { name: 'password', label: 'Password',  type: 'password', icon: 'lock', placeholder: 'Your password' },
      ],
    },
    tabs: false,
  },
  'health-worker': {
    label: 'Health Worker',
    number: '04',
    heading: 'Health Worker Workspace',
    tagline: 'Role-dedicated workstation: Reception Desk, AI Verification, or Dispensing.',
    pills: ['Reception Intake', 'AI Verification', 'Medication Dispensing'],
    hint: {
      title: 'Role-Based Authentication',
      text: 'Enter your assigned Worker ID (REC-, VER-, or DIS-) and password. Your role workspace will be assigned automatically upon sign in.',
    },
    fields: {
      login: [
        { name: 'workerId', label: 'Worker ID', type: 'text',     icon: 'id',   placeholder: 'e.g. REC-00001 / VER-00001 / DIS-00001' },
        { name: 'password', label: 'Password',  type: 'password', icon: 'lock', placeholder: 'Your password' },
      ],
    },
    tabs: false,
  },
  'endpoint-device': {
    label: 'Endpoint Device',
    number: '05',
    heading: 'Device Login',
    tagline: 'Patient interaction terminal. Connect to your assigned facility.',
    pills: ['Device Portal'],
    hint: {
      title: 'Device Login',
      text: 'Use your assigned Device ID and password to connect.',
    },
    fields: {
      login: [
        { name: 'deviceId', label: 'Device ID', type: 'text',     icon: 'id',   placeholder: 'e.g. DEV-00001' },
        { name: 'password', label: 'Password',  type: 'password', icon: 'lock', placeholder: 'Device password' },
      ],
    },
    tabs: false,
  },
}

// ── Icon Map ──────────────────────────────────────────────────────────────────
const ICON_MAP = {
  id:   <IconId />,
  user: <IconUser />,
  mail: <IconMail />,
  lock: <IconLock />,
}

// ── Field Component ───────────────────────────────────────────────────────────
function FormField({ field, value, onChange }) {
  const [showPw, setShowPw] = useState(false)
  const isPassword = field.type === 'password'
  const inputType  = isPassword ? (showPw ? 'text' : 'password') : field.type

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={field.name}>
        {field.label}
      </label>
      <div className="form-input-wrap">
        <span className="form-input-icon">{ICON_MAP[field.icon]}</span>
        <input
          id={field.name}
          name={field.name}
          type={inputType}
          className="form-input"
          placeholder={field.placeholder}
          value={value}
          onChange={onChange}
          autoComplete={isPassword ? 'current-password' : 'off'}
          required
        />
        {isPassword && (
          <button
            type="button"
            className="form-input-toggle"
            onClick={() => setShowPw(s => !s)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? <IconEyeOff /> : <IconEyeOn />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Login Page ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { role } = useParams()
  const navigate  = useNavigate()
  const config    = ROLE_CONFIG[role]

  // Redirect unknown roles
  if (!config) {
    navigate('/', { replace: true })
    return null
  }

  // Admin has its own dedicated page with real API integration
  if (role === 'admin') {
    return <AdminLoginPage />
  }

  const [activeTab, setActiveTab] = useState('login')
  const [formData,  setFormData]  = useState({})
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const fields = config.fields[activeTab] || config.fields.login

  function handleChange(e) {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (role === 'health-worker') {
      if (!formData.workerId || !formData.password) {
        setError('Please enter your Worker ID and password.')
        return
      }

      setLoading(true)
      try {
        const res = await healthWorkerLogin({
          worker_id: formData.workerId.trim().toUpperCase(),
          password: formData.password,
        })
        localStorage.setItem('worker_token', res.data.access_token)
        localStorage.setItem('worker_info', JSON.stringify(res.data))

        const subRole = (res.data.sub_role || 'Reception').toLowerCase()
        if (subRole.includes('verif')) {
          navigate('/health-worker/verification')
        } else if (subRole.includes('dispens')) {
          navigate('/health-worker/dispensing')
        } else {
          navigate('/health-worker/reception')
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid Worker ID or password')
      } finally {
        setLoading(false)
      }
      return
    }

    if (role === 'endpoint-device') {
      setLoading(true)
      try {
        const res = await deviceLogin({
          device_id: formData.deviceId.trim().toUpperCase(),
          password: formData.password,
        })
        localStorage.setItem('device_token', res.data.access_token)
        localStorage.setItem('device_info', JSON.stringify(res.data))
        navigate('/device/terminal')
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid Device ID or password')
      } finally {
        setLoading(false)
      }
      return
    }

    if (role === 'doctor') {
      setLoading(true)
      try {
        const res = await doctorLogin({
          doctor_id: formData.doctorId?.trim().toUpperCase(),
          password: formData.password,
        })
        localStorage.setItem('doctor_token', res.data.access_token)
        localStorage.setItem('doctor_info', JSON.stringify(res.data.doctor || res.data))
        navigate('/doctor/desk')
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid Doctor ID or password')
      } finally {
        setLoading(false)
      }
      return
    }

    // Default mock behavior for other pending roles
    console.log(`[${role}] ${activeTab}:`, formData)
  }

  const LeftIcon = RoleIcons[role] || RoleIcons.patient

  return (
    <div className="login-page fade-in">

      {/* ── Top nav strip ── */}
      <header className="login-topbar">
        <Link to="/" className="login-topbar__back">
          <IconBack /> Back to portal
        </Link>

        <div className="login-topbar__logo">
          <div className="login-box__logo-mark">A</div>
          <span className="login-box__logo-text">Astra</span>
        </div>

        <div className="login-topbar__role-badge">
          {config.label} <span>·</span> {config.number}
        </div>
      </header>

      {/* ── Centered form ── */}
      <main className="login-page__center">
        <div className="login-box">

          <div className="login-box__header">
            <h2 className="login-box__title">
              {activeTab === 'register' ? 'Create Admin Account' : `Sign in as ${config.label}`}
            </h2>
            <p className="login-box__subtitle">
              {activeTab === 'register'
                ? 'Fill in the details below to register a new admin.'
                : 'Enter your credentials to access your portal.'}
            </p>
          </div>

          {/* Tabs — Admin only */}
          {config.tabs && (
            <div className="login-box__tabs" role="tablist" aria-label="Auth mode">
              <button
                id="tab-login"
                role="tab"
                className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
                onClick={() => { setActiveTab('login'); setFormData({}); setError('') }}
                aria-selected={activeTab === 'login'}
              >
                Login
              </button>
              <button
                id="tab-register"
                role="tab"
                className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
                onClick={() => { setActiveTab('register'); setFormData({}); setError('') }}
                aria-selected={activeTab === 'register'}
              >
                Register
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="form-error-banner" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {fields.map(field => (
              <FormField
                key={field.name}
                field={field}
                value={formData[field.name] || ''}
                onChange={handleChange}
              />
            ))}

            <button
              id={`btn-${activeTab}-${role}`}
              type="submit"
              className="btn-submit"
              disabled={loading}
            >
              {loading ? 'Authenticating...' : (activeTab === 'register' ? 'Create Account' : 'Sign In')}
              <IconSubmit />
            </button>
          </form>

          {/* Role hint */}
          <div className="role-hint">
            <div className="role-hint__icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <div className="role-hint__text">
              <strong>{config.hint.title}</strong>
              {config.hint.text}
            </div>
          </div>

          {/* Help text */}
          <p className="login-box__help">
            Wrong portal?{' '}
            <Link to="/">Select a different role</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
