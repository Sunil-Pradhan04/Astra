import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedDoctorRoute() {
  const doctorToken = localStorage.getItem('doctor_token')
  const adminToken = localStorage.getItem('admin_token')

  // Allow access if doctor token is present (or admin token for supervision)
  if (!doctorToken && !adminToken) {
    return <Navigate to="/login/doctor" replace />
  }

  return <Outlet />
}
