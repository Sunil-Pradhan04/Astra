import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedWorkerRoute({ expectedRole }) {
  const token = localStorage.getItem('worker_token')
  const rawInfo = localStorage.getItem('worker_info')

  if (!token || !rawInfo) {
    return <Navigate to="/login/health-worker" replace />
  }

  try {
    const worker = JSON.parse(rawInfo)
    if (expectedRole) {
      const subRole = (worker.sub_role || 'Reception').toLowerCase()
      const target = expectedRole.toLowerCase()
      if (!subRole.includes(target)) {
        // Redirect to their assigned role station
        if (subRole.includes('verif')) {
          return <Navigate to="/health-worker/verification" replace />
        } else if (subRole.includes('dispens')) {
          return <Navigate to="/health-worker/dispensing" replace />
        } else {
          return <Navigate to="/health-worker/reception" replace />
        }
      }
    }
  } catch {
    return <Navigate to="/login/health-worker" replace />
  }

  return <Outlet />
}
