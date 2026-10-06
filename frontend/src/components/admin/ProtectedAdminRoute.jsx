import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedAdminRoute() {
  const token = localStorage.getItem('admin_token')
  if (!token) return <Navigate to="/login/admin" replace />
  return <Outlet />
}
