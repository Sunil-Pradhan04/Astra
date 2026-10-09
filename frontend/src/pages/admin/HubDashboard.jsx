import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Stethoscope,
  Users,
  Smartphone,
  Mail,
  Settings,
  Menu,
  Building2,
  ArrowLeft,
  FlaskConical,
} from 'lucide-react'
import Sidebar from '../../components/admin/Sidebar'
import DashboardTab from '../../components/admin/tabs/DashboardTab'
import AddDoctorsTab from '../../components/admin/tabs/AddDoctorsTab'
import AddHealthWorkersTab from '../../components/admin/tabs/AddHealthWorkersTab'
import AddEndpointDevicesTab from '../../components/admin/tabs/AddEndpointDevicesTab'
import CommunicateTab from '../../components/admin/tabs/CommunicateTab'
import SettingsTab from '../../components/admin/tabs/SettingsTab'
import TestingLabTab from '../../components/admin/tabs/TestingLabTab'

const TABS = [
  { id: 'dashboard',        label: 'Dashboard',         icon: LayoutDashboard },
  { id: 'doctors',          label: 'Add Doctors',        icon: Stethoscope },
  { id: 'health-workers',   label: 'Health Workers',     icon: Users },
  { id: 'devices',          label: 'Endpoint Devices',   icon: Smartphone },
  { id: 'communicate',      label: 'Communicate',        icon: Mail },
  { id: 'testing-lab',      label: 'Component Test Lab', icon: FlaskConical },
  { id: 'settings',         label: 'Settings',           icon: Settings },
]

export default function HubDashboard() {
  const navigate        = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const hub   = JSON.parse(localStorage.getItem('current_hub') || '{}')
  const admin = JSON.parse(localStorage.getItem('admin_info')  || '{}')

  useEffect(() => {
    if (!hub?.id) navigate('/admin/care-point')
  }, [])

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':      return <DashboardTab hub={hub} />
      case 'doctors':        return <AddDoctorsTab hub={hub} />
      case 'health-workers': return <AddHealthWorkersTab hub={hub} />
      case 'devices':        return <AddEndpointDevicesTab hub={hub} />
      case 'communicate':    return <CommunicateTab hub={hub} />
      case 'testing-lab':    return <TestingLabTab hub={hub} />
      case 'settings':       return <SettingsTab hub={hub} admin={admin} />
      default:               return null
    }
  }

  const currentTabObj = TABS.find(t => t.id === activeTab) || TABS[0]
  const TabIcon = currentTabObj.icon
  const adminInitials = (admin?.username || admin?.email || 'A').slice(0, 2).toUpperCase()

  return (
    <div className="hub-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="hub-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        tabs={TABS}
        active={activeTab}
        hub={hub}
        admin={admin}
        isOpen={sidebarOpen}
        onSelect={(id) => { setActiveTab(id); setSidebarOpen(false) }}
        onExit={() => navigate('/admin/care-point')}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <div className="hub-main">
        {/* Care Hub Header Interface */}
        <header className="hub-topbar">
          <div className="hub-topbar__left">
            <button
              className="hub-topbar__menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>

            <div className="hub-topbar__current-view">
              <div className="hub-topbar__view-icon">
                <TabIcon size={16} strokeWidth={2.2} />
              </div>
              <h1 className="hub-topbar__view-title">{currentTabObj.label}</h1>
            </div>

            <div className="hub-topbar__divider" />

            <div className="hub-topbar__facility-pill">
              <Building2 size={13} className="hub-topbar__facility-icon" />
              <span className="hub-topbar__facility-name">{hub?.name || 'Facility'}</span>
              {hub?.hub_type && (
                <span className="hub-topbar__facility-type">{hub.hub_type}</span>
              )}
            </div>
          </div>

          <div className="hub-topbar__right">
            <div className="hub-topbar__status">
              <span className="hub-topbar__status-dot" />
              <span>System Online</span>
            </div>

            <button
              className="hub-topbar__exit-btn"
              onClick={() => navigate('/admin/care-point')}
              title="Return to facility selection"
            >
              <ArrowLeft size={13} />
              <span>Switch Facility</span>
            </button>

            <div className="hub-topbar__profile">
              <div className="hub-topbar__avatar">
                {adminInitials}
              </div>
              <div className="hub-topbar__profile-text">
                <span className="hub-topbar__profile-name">{admin?.username || 'Admin'}</span>
                <span className="hub-topbar__profile-role">Administrator</span>
              </div>
            </div>
          </div>
        </header>

        <div className="hub-content">
          {renderTab()}
        </div>
      </div>
    </div>
  )
}
