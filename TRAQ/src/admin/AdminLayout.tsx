import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import './AdminLayout.css'
import tlogoUrl from '../assets/TLOGO.png'
import { logAdminLoginAttempt } from '../services/firestore'

type AdminView = 'dashboard' | 'team' | 'tasks' | 'dailyTasks' | 'availability' | 'timeoff' | 'reports' | 'logs' | 'music' | 'notifications' | 'sendPrint' | 'hiring' | 'analytics' | 'leaderboard' | 'stock'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const navigate = useNavigate()
  const location = useLocation()

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Check for existing admin session
  useEffect(() => {
    const adminSession = sessionStorage.getItem('traq-admin-session')
    if (adminSession === 'authenticated') {
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
      sessionStorage.setItem('traq-admin-session', 'authenticated')
      setPinError(null)
    } else {
      setPinError('Invalid PIN')
    }
  }, [pin])

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false)
    sessionStorage.removeItem('traq-admin-session')
    setPin('')
    navigate('/admin')
  }, [navigate])

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/admin' },
    { id: 'leaderboard', label: 'Leaderboard', icon: '🏆', path: '/admin/leaderboard' },
    { id: 'analytics', label: 'Analytics', icon: '📊', path: '/admin/analytics' },
    { id: 'team', label: 'Team', icon: '👥', path: '/admin/team' },
    { id: 'tasks', label: 'Tasks', icon: '✅', path: '/admin/tasks' },
    { id: 'dailyTasks', label: 'Daily Tasks', icon: '📋', path: '/admin/daily-tasks' },
    { id: 'availability', label: 'Availability', icon: '📅', path: '/admin/availability' },
    { id: 'timeoff', label: 'Time Off', icon: '🏖️', path: '/admin/time-off' },
    { id: 'reports', label: 'Reports', icon: '📝', path: '/admin/reports' },
    { id: 'stock', label: 'Stock', icon: '📦', path: '/admin/stock' },
    { id: 'logs', label: 'Logs', icon: '📜', path: '/admin/logs' },
    { id: 'music', label: 'Music', icon: '🎵', path: '/admin/music' },
    { id: 'notifications', label: 'Notify', icon: '🔔', path: '/admin/notify' },
    { id: 'sendPrint', label: 'Send to Print', icon: '🖨️', path: '/admin/send-print' },
    { id: 'hiring', label: 'Hiring', icon: '💼', path: '/admin/hiring', badge: badgeCounts.hiring },
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
          <img src={tlogoUrl} alt="TRAQ" className="admin-login-logo" />
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
          
          <button className="admin-back-link" onClick={() => navigate('/')}>
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
          <img src={tlogoUrl} alt="TRAQ" className="admin-header-logo" />
          <span className="admin-header-title">Admin</span>
        </div>
        
        <div className="admin-header-time">
          <span className="admin-header-clock">{formatTime(currentTime)}</span>
          <span className="admin-header-date">{formatDate(currentTime)}</span>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <img src={tlogoUrl} alt="TRAQ" className="admin-sidebar-logo" />
          <h2>Admin Portal</h2>
        </div>
        
        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/admin'}
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
          <button className="admin-logout-btn" onClick={handleLogout}>
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
