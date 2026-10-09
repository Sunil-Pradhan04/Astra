import axios from './axios'

// ── Auth ──────────────────────────────────────────────────────────────
export const healthWorkerLogin = (data) =>
  axios.post('/auth/health-worker/login', data)

/**
 * Call on sign-out — immediately marks the worker as offline in the DB.
 * Uses the worker token from localStorage.
 */
export const healthWorkerLogout = () =>
  axios.post('/auth/health-worker/logout')

/**
 * Call every ~2 minutes while the worker tab is open.
 * Keeps is_online = True and refreshes last_seen_at.
 */
export const healthWorkerHeartbeat = () =>
  axios.post('/auth/health-worker/heartbeat')

// ── Patient Intake & Queue ────────────────────────────────────────────
export const intakePatient = (data) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  return axios.post('/patients', {
    ...data,
    care_hub_id: data.care_hub_id || worker.care_hub_id || 'default_hub',
  }, {
    headers: {
      'X-Worker-Id': worker.worker_id || 'REC-DESK',
    },
  })
}

export const getPatientQueue = (hubId, status = 'all') => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  const activeHubId = hubId || worker.care_hub_id
  return axios.get('/patients/queue', {
    params: { hub_id: activeHubId, status },
  })
}

export const getPatientDetail = (patientId) =>
  axios.get(`/patients/${patientId}`)

// ── Mid-Level Health Worker Review & Doctor Queue Dispatch ─────────────
export const getGroupedPatientQueues = (hubId, scope = 'pending_review') => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  const activeHubId = hubId || worker.care_hub_id
  return axios.get('/patients/queues/grouped', {
    params: { hub_id: activeHubId, scope },
  })
}

export const manualUpdatePatientReport = (patientId, data) =>
  axios.patch(`/patients/${patientId}/manual-update`, data)

export const aiUpdatePatientReport = (patientId, data) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  return axios.post(`/patients/${patientId}/ai-update`, {
    ...data,
    worker_id: data.worker_id || worker.worker_id || 'HW-DESK',
    worker_name: data.worker_name || worker.full_name || 'Mid-Level Health Worker',
  })
}

export const verifyPatientToDoctor = (patientId, data = {}) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  return axios.post(`/patients/${patientId}/verify-to-doctor`, {
    ...data,
    verified_by: data.verified_by || worker.worker_id || 'HW-VERIFIER',
    verified_worker_name: data.verified_worker_name || worker.full_name || 'Mid-Level Health Worker',
  })
}

export const requestPatientRescreen = (patientId, data = {}) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  return axios.post(`/patients/${patientId}/request-rescreen`, {
    ...data,
    worker_id: data.worker_id || worker.worker_id || 'HW-DESK',
    worker_name: data.worker_name || worker.full_name || 'Mid-Level Health Worker',
  })
}

export const getDoctorsQueues = (hubId) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  const activeHubId = hubId || worker.care_hub_id
  return axios.get('/doctors/queues', {
    params: { hub_id: activeHubId },
  })
}

export const dispensePatientMedicine = (patientId) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  return axios.post(`/doctors/desk/dispense/${patientId}`, null, {
    params: {
      worker_name: worker.full_name || 'Pharmacist',
      worker_id: worker.worker_id || 'HW-PHARMACY',
    },
  })
}

// ── External Referral Radar & Dispatch ─────────────────────────────────────
export const getNearbyFacilities = (params = {}) =>
  axios.get('/care-hub/nearby-facilities', { params })

export const dispatchExternalReferral = (patientId, data) => {
  const worker = JSON.parse(localStorage.getItem('worker_info') || '{}')
  return axios.post(`/patients/${patientId}/dispatch-external-referral`, {
    ...data,
    worker_id: data.worker_id || worker.worker_id || 'HW-VERIFIER',
    worker_name: data.worker_name || worker.full_name || 'Mid-Level Health Worker',
  })
}



