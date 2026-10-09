import api from './axios'

// ── Auth ──────────────────────────────────────────────────────────────────────

export const adminRegister = (data) => api.post('/auth/admin/register', data)
export const adminLogin    = (data) => api.post('/auth/admin/login', data)

// ── Facilities ────────────────────────────────────────────────────────────────
export const getMyCareHub    = ()     => api.get('/care-hub')
export const getFacilities   = ()     => api.get('/care-hub')
export const createCareHub   = (data) => api.post('/care-hub', data)
export const createFacility  = (data) => api.post('/care-hub', data)
export const deleteFacility  = (id)   => api.delete(`/care-hub/${id}`)
export const deleteCareHub   = (id)   => api.delete(`/care-hub/${id}`)
export const getDashboard    = (id)   => api.get(`/care-hub/${id}/stats`)

// ── Doctors ───────────────────────────────────────────────────────────────────

export const getDoctors    = ()     => api.get('/doctors')
export const createDoctor  = (data) => api.post('/doctors', data)
export const deleteDoctor  = (id)   => api.delete(`/doctors/${id}`)

// ── Health Workers ────────────────────────────────────────────────────────────

export const getHealthWorkers   = ()     => api.get('/health-workers')
export const createHealthWorker = (data) => api.post('/health-workers', data)
export const deleteHealthWorker = (id)   => api.delete(`/health-workers/${id}`)

// ── Endpoint Devices ──────────────────────────────────────────────────────────

export const getDevices    = ()     => api.get('/endpoint-devices')
export const createDevice  = (data) => api.post('/endpoint-devices', data)
export const deleteDevice  = (id)   => api.delete(`/endpoint-devices/${id}`)

// ── Communicate ───────────────────────────────────────────────────────────────

export const getRecipients = ()     => api.get('/communicate/recipients')
export const sendEmail     = (data) => api.post('/communicate/send', data)

export const getProfile      = ()     => api.get('/settings/profile')
export const updateUsername  = (name) => api.put('/settings/username', { username: name })

// ── Component Test Lab (Stateless Sandbox) ──────────────────────────────────
export const testGenerateAgentQuestion = (data) =>
  api.post('/test/agent-question', data)

export const testSimulateAgentAnswer = (formData) =>
  api.post('/test/agent-simulate-answer', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const testOcrDocumentInspection = (formData) =>
  api.post('/test/ocr-inspection', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

