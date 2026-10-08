import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import CarePointPage from './pages/admin/CarePointPage'
import HubDashboard from './pages/admin/HubDashboard'
import ProtectedAdminRoute from './components/admin/ProtectedAdminRoute'
import ProtectedWorkerRoute from './components/worker/ProtectedWorkerRoute'
import ProtectedDoctorRoute from './components/doctor/ProtectedDoctorRoute'
import ReceptionPage from './pages/worker/ReceptionPage'
import VerificationPage from './pages/worker/VerificationPage'
import DispensingPage from './pages/worker/DispensingPage'
import EndpointDevicePage from './pages/device/EndpointDevicePage'
import DoctorDeskPage from './pages/doctor/DoctorDeskPage'

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login/:role" element={<LoginPage />} />

      {/* Endpoint Device Kiosk (Autonomous AI Terminal) */}
      <Route path="/device/terminal" element={<EndpointDevicePage />} />
      <Route path="/endpoint-device" element={<EndpointDevicePage />} />

      {/* Protected Doctor Desk */}
      <Route element={<ProtectedDoctorRoute />}>
        <Route path="/doctor/desk" element={<DoctorDeskPage />} />
        <Route path="/doctor" element={<Navigate to="/doctor/desk" replace />} />
      </Route>

      {/* Protected Admin */}
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin/care-point" element={<CarePointPage />} />
        <Route path="/admin/hub" element={<HubDashboard />} />
      </Route>

      {/* Protected Health Worker Workspaces */}
      <Route element={<ProtectedWorkerRoute />}>
        <Route path="/health-worker/reception" element={<ReceptionPage />} />
        <Route path="/health-worker/verification" element={<VerificationPage />} />
        <Route path="/health-worker/dispensing" element={<DispensingPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
