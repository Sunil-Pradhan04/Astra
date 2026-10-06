import { useNavigate } from 'react-router-dom'
import {
  User,
  ShieldCheck,
  Stethoscope,
  Activity,
  Smartphone,
  ArrowRight,
} from 'lucide-react'

// ── Role Data ─────────────────────────────────────────────────────────────────
const roles = [
  {
    id: 'patient',
    number: '01',
    title: 'Patient',
    desc: 'Access your medical records, appointments and health history.',
    icon: <User size={24} strokeWidth={1.8} />,
    credentials: 'User ID · Password',
  },
  {
    id: 'admin',
    number: '02',
    title: 'Admin',
    desc: 'Manage the system, users, and all operational data.',
    icon: <ShieldCheck size={24} strokeWidth={1.8} />,
    credentials: 'Email · Password',
  },
  {
    id: 'doctor',
    number: '03',
    title: 'Doctor',
    desc: 'View patient profiles, prescriptions and consultation history.',
    icon: <Stethoscope size={24} strokeWidth={1.8} />,
    credentials: 'Doctor ID · Password',
  },
  {
    id: 'health-worker',
    number: '04',
    title: 'Health Worker',
    desc: 'Log and monitor patient vitals and field health data.',
    icon: <Activity size={24} strokeWidth={1.8} />,
    credentials: 'Worker ID · Password',
  },
  {
    id: 'endpoint-device',
    number: '05',
    title: 'Endpoint Device',
    desc: 'Patient interaction terminal connected to a healthcare facility.',
    icon: <Smartphone size={24} strokeWidth={1.8} />,
    credentials: 'Device ID · Password',
  },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing">
      {/* ── Topbar ── */}
      <header className="landing__topbar">
        <div className="topbar__logo">
          <div className="topbar__logo-mark">A</div>
          <span className="topbar__brand">Astra</span>
        </div>
        <span className="topbar__tagline">Healthcare Portal</span>
      </header>

      {/* ── Hero ── */}
      <main className="landing__hero">
        <h1 className="hero__title fade-up delay-1">
          Welcome to{' '}
          <span>Astra</span>
        </h1>

        <p className="hero__subtitle fade-up delay-2">
          A unified smart healthcare portal connecting patients, doctors,
          health workers and administrators on a single secure platform.
        </p>

        <div className="hero__divider fade-up delay-3">
          <div className="hero__divider-line" />
          <span className="hero__divider-text">Select your role to continue</span>
          <div className="hero__divider-line" />
        </div>

        {/* ── Role Cards ── */}
        <div className="role-grid">
          {roles.map((role, i) => (
            <button
              key={role.id}
              id={`role-card-${role.id}`}
              className={`role-card fade-up delay-${i + 3}`}
              onClick={() => navigate(`/login/${role.id}`)}
              aria-label={`Login as ${role.title}`}
            >
              <span className="role-card__number">{role.number}</span>

              <div className="role-card__icon-wrap">
                {role.icon}
              </div>

              <div className="role-card__text-group">
                <span className="role-card__title">{role.title}</span>
                <span className="role-card__desc">{role.desc}</span>
              </div>

              <span className="role-card__arrow">
                {role.credentials} <ArrowRight size={13} strokeWidth={2.2} />
              </span>
            </button>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="landing__footer">
        <span className="footer__copy">© 2025 Astra Healthcare. All rights reserved.</span>
        <nav className="footer__links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Use</a>
          <a href="#">Support</a>
        </nav>
      </footer>
    </div>
  )
}
