import axios from './axios'

// ── Device Auth & Session Launch ───────────────────────────────────────────
export const deviceLogin = (data) =>
  axios.post('/auth/device/login', data)

export const deviceLogout = () =>
  axios.post('/auth/device/logout')

export const deviceHeartbeat = () =>
  axios.post('/auth/device/heartbeat')

export const getDeviceLaunchToken = (deviceId) =>
  axios.post(`/endpoint-devices/${deviceId}/launch-token`)

// ── Kiosk AI Interrogation ────────────────────────────────────────────────
export const getQueuedPatientIds = () =>
  axios.get('/kiosk/queued-patients')

export const getPatientDetails = (patientId) =>
  axios.get(`/kiosk/patient/${patientId}`)

export const getConsentAudio = (data) =>
  axios.post('/kiosk/consent-audio', data)

export const startKioskSession = (data) =>
  axios.post('/kiosk/session/start', data)

export const replyText = (data) =>
  axios.post('/kiosk/session/reply-text', data)

export const replyAudio = (formData) =>
  axios.post('/kiosk/session/reply-audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getSessionMemory = (sessionId) =>
  axios.get(`/kiosk/session/${sessionId}/memory`)

export const uploadPrescription = (formData) =>
  axios.post('/kiosk/session/upload-prescription', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const skipPrescription = (formData) =>
  axios.post('/kiosk/session/skip-prescription', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const updatePatientVitals = (patientId, data) =>
  axios.patch(`/patients/${patientId}/manual-update`, data)

// ── QR-Based Mobile Photo Import ──────────────────────────────────────────
export const createQRSession = (data) =>
  axios.post('/kiosk/qr-upload/create', data)

export const getQRSessionStatus = (token) =>
  axios.get(`/kiosk/qr-upload/status/${token}`)

export const getQRMobileSession = (token) =>
  axios.get(`/kiosk/qr-upload/session/${token}`)

export const submitQRMobileUpload = (token, formData) =>
  axios.post(`/kiosk/qr-upload/submit/${token}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })


