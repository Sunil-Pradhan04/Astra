import axios from 'axios'

export const getDynamicApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname
    const protocol = window.location.protocol || 'http:'
    return `${protocol}//${host}:8000/api`
  }
  return 'http://localhost:8000/api'
}

const api = axios.create({
  baseURL: getDynamicApiBase(),
  headers: { 'Content-Type': 'application/json' },
})

// Attach correct JWT token based on the route and request domain
api.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('admin_token')
  const workerToken = localStorage.getItem('worker_token')
  const doctorToken = localStorage.getItem('doctor_token')
  const deviceToken = localStorage.getItem('device_token')

  let token = null
  const pathname = window.location.pathname
  const url = config.url || ''

  if (url.includes('/kiosk') || pathname.startsWith('/device') || pathname.startsWith('/endpoint-device')) {
    token = deviceToken || adminToken
  } else if (pathname.startsWith('/doctor') || url.includes('/doctors/desk')) {
    token = doctorToken || adminToken
  } else if (pathname.startsWith('/health-worker') || url.includes('/health-worker') || (url.includes('/patients') && !pathname.startsWith('/doctor'))) {
    token = workerToken || adminToken
  } else if (pathname.startsWith('/admin') || url.includes('/care-hub') || url.includes('/doctors') || url.includes('/health-workers') || url.includes('/endpoint-devices') || url.includes('/communicate') || url.includes('/settings')) {
    token = adminToken
  } else {
    token = doctorToken || workerToken || adminToken || deviceToken
  }

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle token expiry without hijacking login forms
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/')
    if (err.response?.status === 401 && !isLoginRequest) {
      if (window.location.pathname.startsWith('/doctor')) {
        localStorage.removeItem('doctor_token')
        localStorage.removeItem('doctor_info')
        window.location.href = '/login'
      } else if (window.location.pathname.startsWith('/health-worker')) {
        localStorage.removeItem('worker_token')
        localStorage.removeItem('worker_info')
        window.location.href = '/login/health-worker'
      } else if (window.location.pathname.startsWith('/admin')) {
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_info')
        window.location.href = '/login/admin'
      }
    }
    return Promise.reject(err)
  }
)

export default api
