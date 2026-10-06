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
