import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import './AdminLayout.css'
import traqLogoUrl from '../assets/tasklogo.png'
import { logAdminLoginAttempt, subscribeToStockReports, triggerForceRefresh } from '../services/firestore'
import { AP } from './adminPaths.ts'
import { getTraqAppUrl } from './traqAppUrl.ts'

/** Tab session (clears when the browser session ends). */
const ADMIN_SESSION_KEY = 'traq-admin-session'
/** This browser only — stay signed in after closing the tab / reopening the app. */
const ADMIN_PERSIST_DEVICE_KEY = 'traq-admin-persist-device'

type AdminView = 'dashboard' | 'team' | 'tasks' | 'dailyTasks' | 'availability' | 'timeoff' | 'reports' | 'logs' | 'music' | 'notifications' | 'sendPrint' | 'hiring' | 'applyAnalytics' | 'analytics' | 'leaderboard' | 'stock'

interface NavItem {
  id: AdminView
  label: string
  icon: string
  path: string
  badge?: number
}

interface AdminLayoutProps {
  /** Optional badge counts for nav items */
  badgeCounts?: Partial<Record<AdminView, number>>
}

export function AdminLayout({ badgeCounts = {} }: AdminLayoutProps) {
  const [pendingStockCount, setPendingStockCount] = useState(0)

  useEffect(() => {
    const unsub = subscribeToStockReports((reports) => {
      setPendingStockCount(reports.filter((r) => r.status === 'pending').length)
    })
    return () => unsub?.()
  }, [])

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loginPersistedOnDevice, setLoginPersistedOnDevice] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [forceAllLoading, setForceAllLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const navigate = useNavigate()
  const location = useLocation()

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Tab session or device-persisted login (this browser only)
  useEffect(() => {
    const persisted = localStorage.getItem(ADMIN_PERSIST_DEVICE_KEY) === '1'
    setLoginPersistedOnDevice(persisted)
    const sessionOk = sessionStorage.getItem(ADMIN_SESSION_KEY) === 'authenticated'
    if (sessionOk || persisted) {
      setIsAuthenticated(true)
    }
  }, [])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const handlePinSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    // PIN validation - same as existing admin panel
    const success = pin === '2233'
    // Log the attempt to Firestore (fire-and-forget)
    void logAdminLoginAttempt(success)
    if (success) {
      setIsAuthenticated(true)
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'authenticated')
      setPinError(null)
    } else {
      setPinError('Invalid PIN')
    }
  }, [pin])

  const handleLockLogin = useCallback(() => {
    localStorage.setItem(ADMIN_PERSIST_DEVICE_KEY, '1')
    sessionStorage.setItem(ADMIN_SESSION_KEY, 'authenticated')
    setLoginPersistedOnDevice(true)
  }, [])

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false)
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    localStorage.removeItem(ADMIN_PERSIST_DEVICE_KEY)
    setLoginPersistedOnDevice(false)
    setPin('')
    navigate(AP.home)
  }, [navigate])

  const handleUpdateAllBrowsers = useCallback(async () => {
    if (!confirm('Force refresh all connected browsers?')) return
    try {
      setForceAllLoading(true)
      await triggerForceRefresh()
    } catch (err) {
      console.error(err)
      alert('Could not trigger refresh. Check connection and try again.')
    } finally {
      setForceAllLoading(false)
    }
  }, [])

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: AP.home },
    { id: 'leaderboard', label: 'Leaderboard', icon: '🏆', path: AP.leaderboard },
    { id: 'analytics', label: 'Analytics', icon: '📊', path: AP.analytics },
    { id: 'team', label: 'Team', icon: '👥', path: AP.team },
    { id: 'tasks', label: 'Tasks', icon: '✅', path: AP.tasks },
    { id: 'dailyTasks', label: 'Daily Tasks', icon: '📋', path: AP.dailyTasks },
    { id: 'availability', label: 'Availability', icon: '📅', path: AP.availability },
    { id: 'timeoff', label: 'Time Off', icon: '🏖️', path: AP.timeOff },
    { id: 'reports', label: 'Reports', icon: '📝', path: AP.reports },
    { id: 'stock', label: 'Stock', icon: '📦', path: AP.stock, badge: pendingStockCount > 0 ? pendingStockCount : badgeCounts.stock },
    { id: 'logs', label: 'Logs', icon: '📜', path: AP.logs },
    { id: 'music', label: 'Music', icon: '🎵', path: AP.music },
    { id: 'notifications', label: 'Notify', icon: '🔔', path: AP.notify },
    { id: 'sendPrint', label: 'Send to Print', icon: '🖨️', path: AP.sendPrint },
    { id: 'hiring', label: 'Hiring', icon: '💼', path: AP.hiring, badge: badgeCounts.hiring },
    { id: 'applyAnalytics', label: 'Apply Analytics', icon: '📈', path: AP.applyAnalytics, badge: badgeCounts.applyAnalytics },
  ]

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    })
  }

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <img src={traqLogoUrl} alt="TRAQ" className="admin-login-logo" />
          <h1>Admin Portal</h1>
          <p>Enter your PIN to continue</p>
          
          <form onSubmit={handlePinSubmit} className="admin-login-form">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="admin-pin-input"
              autoFocus
            />
            {pinError && <p className="admin-pin-error">{pinError}</p>}
            <button type="submit" className="admin-login-btn" disabled={pin.length !== 4}>
              Enter
            </button>
          </form>
          
          <button
            type="button"
            className="admin-back-link"
            onClick={() => {
              window.location.href = getTraqAppUrl()
            }}
          >
            ← Back to TRAQ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      {/* Mobile header */}
      <header className="admin-header">
        <button 
          className="admin-menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${sidebarOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
        
        <div className="admin-header-brand">
          <img src={traqLogoUrl} alt="TRAQ" className="admin-header-logo" />
          <span className="admin-header-title">Admin</span>
        </div>
        
        <div className="admin-header-right">
          <button
            type="button"
            className="admin-header-update-all"
            disabled={forceAllLoading}
            onClick={() => void handleUpdateAllBrowsers()}
          >
            {forceAllLoading ? '…' : 'Update all'}
          </button>
          <div className="admin-header-time">
            <span className="admin-header-clock">{formatTime(currentTime)}</span>
            <span className="admin-header-date">{formatDate(currentTime)}</span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <img src={traqLogoUrl} alt="TRAQ" className="admin-sidebar-logo" />
          <h2>Admin Portal</h2>
        </div>
        
        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === AP.home}
              className={({ isActive }) => 
                `admin-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="admin-nav-icon">{item.icon}</span>
              <span className="admin-nav-label">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="admin-nav-badge">{item.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-update-all-btn"
            disabled={forceAllLoading}
            onClick={() => void handleUpdateAllBrowsers()}
          >
            {forceAllLoading ? 'Sending…' : '🔄 Update all browsers'}
          </button>
          <button
            type="button"
            className="admin-lock-login-btn"
            onClick={handleLockLogin}
            disabled={loginPersistedOnDevice}
            title="Remember admin login on this browser only (this device). Logout clears it."
          >
            {loginPersistedOnDevice ? '🔒 Login saved on this device' : '🔓 Lock login'}
          </button>
          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            🚪 Logout
          </button>
          <div className="admin-sidebar-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatDate(currentTime)}</span>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div 
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
