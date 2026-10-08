import api from './axios'

// ── Auth ──────────────────────────────────────────────────────────────────
export const doctorLogin = (data) =>
  api.post('/auth/doctor/login', data)

export const getDoctorMe = () =>
  api.get('/auth/doctor/me')

export const doctorLogout = () => {
  localStorage.removeItem('doctor_token')
  localStorage.removeItem('doctor_info')
  window.location.href = '/login'
}

export const doctorHeartbeat = () =>
  api.post('/doctors/heartbeat')

// ── Consultation Queue & Prescriptions ─────────────────────────────────────
export const getDoctorDeskQueue = () =>
  api.get('/doctors/desk/my-queue')

export const submitDoctorPrescription = (patientId, data) =>
  api.post(`/doctors/desk/prescriptions/${patientId}`, data)
