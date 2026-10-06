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
