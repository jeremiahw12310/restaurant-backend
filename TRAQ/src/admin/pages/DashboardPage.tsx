import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotificationsHub, type NotificationItem } from '../components/NotificationsHub'
import { StatCard } from '../components/StatCard'
import './DashboardPage.css'

// Import Firestore services
import {
  subscribeToApplications,
  type Application,
} from '../../services/applications'
import {
  subscribeToTimeOffRequests,
  subscribeToManagementReports,
  subscribeToStockReports,
  subscribeToNotifications,
  subscribeToAdminLoginAttempts,
  subscribeToRecentTaskCompletions,
  retroactivelyFixDailyTaskCompletions,
  type TimeOffRequest,
  type ManagementReport,
  type StockReport,
  type NotificationDoc,
  type AdminLoginAttempt,
  type TaskState,
} from '../../services/firestore'

export function DashboardPage() {
  const navigate = useNavigate()
  
  // Data state
  const [applications, setApplications] = useState<Application[]>([])
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [managementReports, setManagementReports] = useState<ManagementReport[]>([])
  const [stockReports, setStockReports] = useState<StockReport[]>([])
  const [notifications, setNotifications] = useState<NotificationDoc[]>([])
  const [loginAttempts, setLoginAttempts] = useState<AdminLoginAttempt[]>([])
  const [taskState, setTaskState] = useState<TaskState>({})
  
  const [loading, setLoading] = useState(true)
  const [retroactiveFixLoading, setRetroactiveFixLoading] = useState(false)
  const [retroactiveFixError, setRetroactiveFixError] = useState<string | null>(null)

  // Subscribe to all data sources
  useEffect(() => {
    const unsubscribes: (() => void)[] = []

    // Applications
    const unsubApps = subscribeToApplications((apps) => {
      setApplications(apps)
    })
    if (unsubApps) unsubscribes.push(unsubApps)

    // Time Off Requests
    const unsubTimeOff = subscribeToTimeOffRequests((requests) => {
      setTimeOffRequests(requests)
    })
    if (unsubTimeOff) unsubscribes.push(unsubTimeOff)

    // Management Reports
    const unsubReports = subscribeToManagementReports((reports) => {
      setManagementReports(reports)
    })
    if (unsubReports) unsubscribes.push(unsubReports)

    // Stock Reports
    const unsubStock = subscribeToStockReports((reports) => {
      setStockReports(reports)
    })
    if (unsubStock) unsubscribes.push(unsubStock)

    // Notifications
    const unsubNotif = subscribeToNotifications((notifs) => {
      setNotifications(notifs)
    })
    if (unsubNotif) unsubscribes.push(unsubNotif)

    // Admin Login Attempts
    const unsubLogins = subscribeToAdminLoginAttempts((attempts) => {
      setLoginAttempts(attempts)
    })
    if (unsubLogins) unsubscribes.push(unsubLogins)

    // Recent Task Completions (last 7 days)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const formatDateKey = (d: Date): string => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const startKey = formatDateKey(weekAgo)
    const endKey = formatDateKey(now)
    
    const unsubCompletions = subscribeToRecentTaskCompletions(
      startKey,
      endKey,
      (state) => {
        setTaskState(state)
      }
    )
    if (unsubCompletions) unsubscribes.push(unsubCompletions)

    // Mark loading as false after a short delay to allow initial data
    const timer = setTimeout(() => setLoading(false), 1000)

    return () => {
      unsubscribes.forEach(unsub => unsub())
      clearTimeout(timer)
    }
  }, [])

  // Transform data into NotificationItems
  const notificationItems: NotificationItem[] = useMemo(() => {
    const items: NotificationItem[] = []

    // New Applications
    applications
      .filter(app => app.status === 'new')
      .forEach(app => {
        items.push({
          id: `app-${app.id}`,
          type: 'application',
          title: `New Application: ${app.name}`,
          subtitle: `Applied for position - ${app.email}`,
          timestamp: new Date(app.createdAt),
          priority: 'high',
          actionPath: '/admin/hiring',
        })
      })

    // Pending Time Off Requests
    timeOffRequests
      .filter(req => req.status === 'pending')
      .forEach(req => {
        const dateInfo = req.dateRange 
          ? `${req.dateRange.startDateKey} - ${req.dateRange.endDateKey}`
          : req.requestedShifts?.length 
            ? `${req.requestedShifts.length} shift(s) requested`
            : 'Dates pending'
        items.push({
          id: `timeoff-${req.id}`,
          type: 'timeoff',
          title: `Time Off Request: ${req.employee}`,
          subtitle: dateInfo,
          timestamp: new Date(req.createdAt),
          priority: 'medium',
          actionPath: '/admin/time-off',
        })
      })

    // New Management Reports (unresolved)
    managementReports
      .filter(rep => rep.status === 'new')
      .forEach(rep => {
        items.push({
          id: `report-${rep.id}`,
          type: 'report',
          title: `Report: ${rep.customTitle || rep.kind}`,
          subtitle: `From ${rep.createdBy} - ${rep.kind}`,
          timestamp: new Date(rep.createdAt),
          priority: 'medium',
          actionPath: '/admin/reports',
        })
      })

    // Pending Stock Reports
    stockReports
      .filter(rep => rep.status === 'pending')
      .forEach(rep => {
        items.push({
          id: `stock-${rep.id}`,
          type: 'stock',
          title: `Stock Alert: ${rep.item || 'Item'}`,
          subtitle: `${rep.kind === 'low' ? 'Low stock' : 'Out of stock'} reported`,
          timestamp: new Date(rep.createdAt),
          priority: rep.kind === 'out' ? 'high' : 'medium',
          actionPath: '/admin/reports',
        })
      })

    // Active Notifications
    notifications
      .filter(notif => notif.active)
      .forEach(notif => {
        items.push({
          id: `notif-${notif.id}`,
          type: 'notification',
          title: `To: ${notif.to === 'all' ? 'Everyone' : notif.to}`,
          subtitle: notif.message || '',
          timestamp: new Date(notif.createdAt),
          priority: 'low',
          actionPath: '/admin/notify',
        })
      })

    // Failed Login Attempts (security alerts)
    loginAttempts
      .filter(attempt => !attempt.success)
      .slice(0, 5) // Only show recent failed attempts
      .forEach(attempt => {
        items.push({
          id: `login-${attempt.id}`,
          type: 'security',
          title: 'Failed Login Attempt',
          subtitle: `User agent: ${attempt.userAgent?.slice(0, 40) || 'Unknown'}...`,
          timestamp: new Date(attempt.ts),
          priority: 'high',
          actionPath: '/admin/logs',
        })
      })

    return items
  }, [applications, timeOffRequests, managementReports, stockReports, notifications, loginAttempts])

  // Calculate stats from TaskState
  const stats = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const todayKey = `${year}-${month}-${day}`
    
    // Count completions from TaskState structure: { dateKey: { windowKey: { taskId: completion } } }
    let todayCount = 0
    let weekCount = 0
    
    Object.entries(taskState).forEach(([dateKey, windows]) => {
      Object.values(windows).forEach((tasks) => {
        const completedCount = Object.values(tasks).filter(t => t.status === 'done').length
        weekCount += completedCount
        if (dateKey === todayKey) {
          todayCount += completedCount
        }
      })
    })
    
    const totalTasks = 15 * 3 // Approximate: 15 tasks * 3 windows
    const completionRate = totalTasks > 0 
      ? Math.round((todayCount / totalTasks) * 100) 
      : 0

    const avgPerDay = Math.round(weekCount / 7)

    return {
      todayCompleted: todayCount,
      completionRate,
      weekCompletions: weekCount,
      avgPerDay,
      pendingApplications: applications.filter(a => a.status === 'new').length,
      pendingTimeOff: timeOffRequests.filter(t => t.status === 'pending').length,
      pendingReports: managementReports.filter(r => r.status === 'new').length + 
                      stockReports.filter(s => s.status === 'pending').length,
      activeNotifications: notifications.filter(n => n.active).length,
    }
  }, [taskState, applications, timeOffRequests, managementReports, stockReports, notifications])

  // Handle retroactive fix
  const handleRetroactiveFix = async () => {
    if (!confirm('This will retroactively apply new scoring logic to shifts from Jan 1-18, 2026. Continue?')) {
      return
    }
    
    setRetroactiveFixLoading(true)
    setRetroactiveFixError(null)
    
    try {
      const fromDateKey = '2026-01-01'
      const toDateKey = '2026-01-18'
      const created = await retroactivelyFixDailyTaskCompletions(fromDateKey, toDateKey)
      alert(`Retroactive fix complete! Created ${created} daily task completion entries.`)
    } catch (error) {
      console.error('Retroactive fix failed:', error)
      setRetroactiveFixError('Failed to apply retroactive fix. See console for details.')
    } finally {
      setRetroactiveFixLoading(false)
    }
  }

  // Quick action items
  const quickActions = [
    { icon: '👥', label: 'Manage Team', path: '/admin/team' },
    { icon: '✅', label: 'Edit Tasks', path: '/admin/tasks' },
    { icon: '📋', label: 'Daily Tasks', path: '/admin/daily-tasks' },
    { icon: '🏖️', label: 'Time Off', path: '/admin/time-off' },
    { icon: '🎵', label: 'Music', path: '/admin/music' },
    { icon: '📜', label: 'View Logs', path: '/admin/logs' },
  ]

  return (
    <div className="dashboard-page">
      <header className="admin-page-header">
        <h1>Dashboard</h1>
        <p>Welcome back! Here's what's happening today.</p>
      </header>

      {/* Stats Row */}
      <section className="dashboard-stats admin-grid admin-grid-4">
        <StatCard
          icon="✅"
          label="Today's Tasks"
          value={stats.todayCompleted}
          subtitle={`${stats.completionRate}% complete`}
          color="success"
          onClick={() => navigate('/')}
        />
        <StatCard
          icon="💼"
          label="Applications"
          value={stats.pendingApplications}
          subtitle="Awaiting review"
          color={stats.pendingApplications > 0 ? 'accent' : 'default'}
          onClick={() => navigate('/admin/hiring')}
        />
        <StatCard
          icon="🏖️"
          label="Time Off"
          value={stats.pendingTimeOff}
          subtitle="Pending requests"
          color={stats.pendingTimeOff > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/admin/time-off')}
        />
        <StatCard
          icon="📝"
          label="Reports"
          value={stats.pendingReports}
          subtitle="Need attention"
          color={stats.pendingReports > 0 ? 'info' : 'default'}
          onClick={() => navigate('/admin/reports')}
        />
      </section>

      {/* Main Content Grid */}
      <div className="dashboard-main-grid">
        {/* Notifications Hub - Prominent */}
        <section className="dashboard-notifications">
          <NotificationsHub
            items={notificationItems}
            maxItems={8}
            loading={loading}
            onViewAll={() => navigate('/admin/logs')}
          />
        </section>

        {/* Quick Actions + Week Stats */}
        <aside className="dashboard-sidebar">
          {/* Quick Actions */}
          <div className="admin-card dashboard-quick-actions">
            <h3 className="admin-card-title">
              <span>⚡</span> Quick Actions
            </h3>
            <div className="quick-actions-grid">
              {quickActions.map((action) => (
                <button
                  key={action.path}
                  className="quick-action-btn"
                  onClick={() => navigate(action.path)}
                >
                  <span className="quick-action-icon">{action.icon}</span>
                  <span className="quick-action-label">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Week Overview */}
          <div className="admin-card dashboard-week-overview">
            <h3 className="admin-card-title">
              <span>📊</span> This Week
            </h3>
            <div className="week-stats">
              <div className="week-stat">
                <span className="week-stat-value">{stats.weekCompletions}</span>
                <span className="week-stat-label">Tasks Completed</span>
              </div>
              <div className="week-stat">
                <span className="week-stat-value">{stats.avgPerDay}</span>
                <span className="week-stat-label">Avg Per Day</span>
              </div>
            </div>
            <div className="week-progress">
              <div className="week-progress-header">
                <span>Weekly Progress</span>
                <span>{Math.min(100, Math.round((stats.weekCompletions / (15 * 3 * 7)) * 100))}%</span>
              </div>
              <div className="week-progress-bar">
                <div 
                  className="week-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((stats.weekCompletions / (15 * 3 * 7)) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Active Alerts */}
          {stats.activeNotifications > 0 && (
            <div className="admin-card dashboard-active-alerts">
              <h3 className="admin-card-title">
                <span>🔔</span> Active Alerts
              </h3>
              <p className="alert-count">
                {stats.activeNotifications} notification{stats.activeNotifications !== 1 ? 's' : ''} sent to staff
              </p>
              <button 
                className="admin-btn admin-btn-secondary"
                onClick={() => navigate('/admin/notify')}
              >
                Manage Notifications
              </button>
            </div>
          )}

          {/* Retroactive Fix Tool */}
          <div className="admin-card dashboard-retroactive-fix">
            <h3 className="admin-card-title">
              <span>🔧</span> Scoring Fixes
            </h3>
            <p className="retroactive-fix-description">
              Apply new scoring logic (balanced shifts, optional tasks, daily task points) retroactively to Jan 1-18, 2026.
            </p>
            {retroactiveFixError && (
              <div className="retroactive-fix-error" style={{ color: '#d13242', marginBottom: '12px', fontSize: '14px' }}>
                {retroactiveFixError}
              </div>
            )}
            <button 
              className="admin-btn admin-btn-primary"
              onClick={handleRetroactiveFix}
              disabled={retroactiveFixLoading}
            >
              {retroactiveFixLoading ? 'Processing...' : 'Fix Jan 1-18 Shifts'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default DashboardPage
