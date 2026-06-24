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
  subscribeToStockReportLogs,
  subscribeToNotifications,
  subscribeToAdminLoginAttempts,
  subscribeToRecentTaskCompletions,
  retroactivelyFixDailyTaskCompletions,
  triggerForceRefresh,
  type TimeOffRequest,
  type ManagementReport,
  type StockReport,
  type StockReportLogEntry,
  type NotificationDoc,
  type AdminLoginAttempt,
  type TaskState,
} from '../../services/firestore'
import {
  effectiveV3ReleaseForChannel,
  subscribeToAppUiSettings,
  setProductionShell,
  setV3AdminPosEnabled,
  setV3Release,
  setV3ReleaseBeta,
  type ProductionShell,
  type V3Release,
} from '../../services/appSettings.ts'
import { AP } from '../adminPaths.ts'
import { getTraqAppUrl } from '../traqAppUrl.ts'

function stockReportTimestampMs(rep: StockReport): number {
  if (typeof rep.createdAtMs === 'number' && Number.isFinite(rep.createdAtMs)) return rep.createdAtMs
  if (rep.createdAt) {
    const t = Date.parse(rep.createdAt)
    if (Number.isFinite(t)) return t
  }
  return 0
}

export function DashboardPage() {
  const navigate = useNavigate()
  
  // Data state
  const [applications, setApplications] = useState<Application[]>([])
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [managementReports, setManagementReports] = useState<ManagementReport[]>([])
  const [stockReports, setStockReports] = useState<StockReport[]>([])
  const [stockReportLogs, setStockReportLogs] = useState<StockReportLogEntry[]>([])
  const [notifications, setNotifications] = useState<NotificationDoc[]>([])
  const [loginAttempts, setLoginAttempts] = useState<AdminLoginAttempt[]>([])
  const [taskState, setTaskState] = useState<TaskState>({})
  
  const [loading, setLoading] = useState(true)
  const [retroactiveFixLoading, setRetroactiveFixLoading] = useState(false)
  const [retroactiveFixError, setRetroactiveFixError] = useState<string | null>(null)

  const [productionShell, setProductionShellState] = useState<ProductionShell>('v2')
  const [v3Release, setV3ReleaseState] = useState<V3Release>('3.0')
  const [v3ReleaseBetaOverride, setV3ReleaseBetaOverride] = useState<V3Release | null>(null)
  const [v3AdminPosEnabled, setV3AdminPosEnabledState] = useState(true)
  const [shellToggleLoading, setShellToggleLoading] = useState(false)
  const [shellToggleError, setShellToggleError] = useState<string | null>(null)
  const [v3ReleaseMainToggleLoading, setV3ReleaseMainToggleLoading] = useState(false)
  const [v3ReleaseMainToggleError, setV3ReleaseMainToggleError] = useState<string | null>(null)
  const [v3ReleaseBetaToggleLoading, setV3ReleaseBetaToggleLoading] = useState(false)
  const [v3ReleaseBetaToggleError, setV3ReleaseBetaToggleError] = useState<string | null>(null)
  const [posToggleLoading, setPosToggleLoading] = useState(false)
  const [posToggleError, setPosToggleError] = useState<string | null>(null)

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

    // Stock History (created / deleted events)
    const unsubStockLogs = subscribeToStockReportLogs((logs) => {
      setStockReportLogs(logs)
    }, 120)
    if (unsubStockLogs) unsubscribes.push(unsubStockLogs)

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

  useEffect(() => {
    return subscribeToAppUiSettings((s) => {
      setProductionShellState(s.productionShell)
      setV3ReleaseState(s.v3Release)
      setV3ReleaseBetaOverride(s.v3ReleaseBeta)
      setV3AdminPosEnabledState(s.v3AdminPosEnabled)
    })
  }, [])

  const handleSetProductionShell = async (next: ProductionShell) => {
    if (next === productionShell) return
    const label = next === 'v3' ? 'TRAQ 3.x shell' : 'TRAQ 2.x'
    if (!confirm(`Switch the main TRAQ app to ${label}? Open kiosks will reload.`)) {
      return
    }
    setShellToggleLoading(true)
    setShellToggleError(null)
    try {
      await setProductionShell(next)
      await triggerForceRefresh()
    } catch (e) {
      console.error('Production shell update failed:', e)
      setShellToggleError('Could not update production shell. Check console.')
    } finally {
      setShellToggleLoading(false)
    }
  }

  const v3ReleaseBetaEffective = useMemo(
    () => effectiveV3ReleaseForChannel('beta', { v3Release, v3ReleaseBeta: v3ReleaseBetaOverride }),
    [v3Release, v3ReleaseBetaOverride]
  )

  const handleSetV3ReleaseMain = async (next: V3Release) => {
    if (next === v3Release) return
    const title =
      next === '3.1'
        ? 'Activate TRAQ 3.1 on the main site'
        : 'Roll back the main site to TRAQ 3.0'
    if (
      !confirm(
        `${title}? Devices on the main site that use the 3.x shell will pick this up from Firestore (footer and 3.1 features).`
      )
    ) {
      return
    }
    setV3ReleaseMainToggleLoading(true)
    setV3ReleaseMainToggleError(null)
    try {
      await setV3Release(next)
      await triggerForceRefresh()
    } catch (e) {
      console.error('v3 release (main) update failed:', e)
      setV3ReleaseMainToggleError('Could not update live 3.x release. Check console.')
    } finally {
      setV3ReleaseMainToggleLoading(false)
    }
  }

  const handlePreview31OnBeta = async () => {
    if (v3ReleaseBetaEffective === '3.1') return
    if (
      !confirm(
        'Turn on 3.1 for the beta Hosting URL only? The main site keeps its current live release until you use Activate 3.1 there.'
      )
    ) {
      return
    }
    setV3ReleaseBetaToggleLoading(true)
    setV3ReleaseBetaToggleError(null)
    try {
      await setV3ReleaseBeta('3.1')
      await triggerForceRefresh()
    } catch (e) {
      console.error('v3 release beta update failed:', e)
      setV3ReleaseBetaToggleError('Could not update beta preview. Check console.')
    } finally {
      setV3ReleaseBetaToggleLoading(false)
    }
  }

  const handleBetaMatchLive = async () => {
    if (v3ReleaseBetaOverride === null) return
    if (
      !confirm(
        'Remove the beta-only setting so the beta site uses the same 3.x release as the main site?'
      )
    ) {
      return
    }
    setV3ReleaseBetaToggleLoading(true)
    setV3ReleaseBetaToggleError(null)
    try {
      await setV3ReleaseBeta(null)
      await triggerForceRefresh()
    } catch (e) {
      console.error('v3 release beta clear failed:', e)
      setV3ReleaseBetaToggleError('Could not clear beta override. Check console.')
    } finally {
      setV3ReleaseBetaToggleLoading(false)
    }
  }

  const handleSetV3AdminPosEnabled = async (next: boolean) => {
    if (next === v3AdminPosEnabled) return
    setPosToggleLoading(true)
    setPosToggleError(null)
    try {
      await setV3AdminPosEnabled(next)
    } catch (e) {
      console.error('v3 POS toggle failed:', e)
      setPosToggleError('Could not update POS visibility. Check console.')
    } finally {
      setPosToggleLoading(false)
    }
  }

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
          actionPath: AP.hiring,
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
          actionPath: AP.timeOff,
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
          actionPath: AP.reports,
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
          timestamp: new Date(stockReportTimestampMs(rep) || Date.now()),
          priority: rep.kind === 'out' ? 'high' : 'medium',
          actionPath: AP.stock,
        })
      })

    // Stock add/delete events (from history logs)
    stockReportLogs
      .filter((l) => l.action === 'created' || l.action === 'deleted')
      .slice(0, 40)
      .forEach((l) => {
        const by = l.actor || l.createdBy
        const kindLabel = l.kind === 'low' ? 'Low stock' : 'Out of stock'
        items.push({
          id: `stocklog-${l.id}`,
          type: 'stock',
          title: l.action === 'created' ? `Stock added: ${l.item || 'Item'}` : `Stock deleted: ${l.item || 'Item'}`,
          subtitle:
            l.action === 'created'
              ? `${kindLabel}${by ? ` · by ${by}` : ''}`
              : `Removed${by ? ` · by ${by}` : ''}`,
          timestamp: new Date((l.tsMs || 0) > 0 ? l.tsMs : Date.now()),
          priority: l.kind === 'out' ? 'high' : 'medium',
          actionPath: AP.stock,
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
          actionPath: AP.notify,
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
          actionPath: AP.logs,
        })
      })

    return items
  }, [applications, timeOffRequests, managementReports, stockReports, stockReportLogs, notifications, loginAttempts])

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
  const quickActions: { icon: string; label: string; path: string; hash?: string }[] = [
    { icon: '👥', label: 'Manage Team', path: AP.team },
    { icon: '✅', label: 'Edit Tasks', path: AP.tasks },
    { icon: '📋', label: 'Daily Tasks', path: AP.dailyTasks, hash: 'recent-daily-runs' },
    { icon: '🏖️', label: 'Time Off', path: AP.timeOff },
    { icon: '🎵', label: 'Music', path: AP.music },
    { icon: '📜', label: 'View Logs', path: AP.logs },
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
          onClick={() => {
            window.location.href = `${getTraqAppUrl()}/`
          }}
        />
        <StatCard
          icon="💼"
          label="Applications"
          value={stats.pendingApplications}
          subtitle="Awaiting review"
          color={stats.pendingApplications > 0 ? 'accent' : 'default'}
          onClick={() => navigate(AP.hiring)}
        />
        <StatCard
          icon="🏖️"
          label="Time Off"
          value={stats.pendingTimeOff}
          subtitle="Pending requests"
          color={stats.pendingTimeOff > 0 ? 'warning' : 'default'}
          onClick={() => navigate(AP.timeOff)}
        />
        <StatCard
          icon="📝"
          label="Reports"
          value={stats.pendingReports}
          subtitle="Need attention"
          color={stats.pendingReports > 0 ? 'info' : 'default'}
          onClick={() => navigate(AP.reports)}
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
            onViewAll={() => navigate(AP.logs)}
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
                  key={action.path + (action.hash || '')}
                  className="quick-action-btn"
                  onClick={() =>
                    navigate(action.hash ? { pathname: action.path, hash: action.hash } : action.path)
                  }
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
                onClick={() => navigate(AP.notify)}
              >
                Manage Notifications
              </button>
            </div>
          )}

          {/* Production UI (main Hosting site) */}
          <div className="admin-card dashboard-production-shell">
            <h3 className="admin-card-title">
              <span>🖥️</span> Main app UI
            </h3>
            <p className="dashboard-production-shell-desc">
              Controls which shell loads on the main TRAQ site (<code className="dashboard-inline-code">traq-caab9</code>
              ). Use <strong>beta Hosting</strong> to preview 3.1 before you activate it on the main site.
            </p>
            <div className="dashboard-shell-status">
              <span className="dashboard-shell-label">Production shell</span>
              <strong className="dashboard-shell-value">
                {productionShell === 'v3' ? '3.x' : '2.x'}
              </strong>
            </div>
            {shellToggleError && (
              <div className="dashboard-shell-error" role="alert">
                {shellToggleError}
              </div>
            )}
            <div className="dashboard-shell-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={shellToggleLoading || productionShell === 'v2'}
                onClick={() => void handleSetProductionShell('v2')}
              >
                {shellToggleLoading ? 'Saving…' : 'Use 2.x'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={shellToggleLoading || productionShell === 'v3'}
                onClick={() => void handleSetProductionShell('v3')}
              >
                {shellToggleLoading ? 'Saving…' : 'Use 3.x shell'}
              </button>
            </div>
            <div className="dashboard-v3-release-row">
              <div className="dashboard-v3-pos-label">
                <span className="dashboard-shell-label">Main site — 3.x release (live)</span>
                <span className="dashboard-v3-pos-hint">
                  Applies on the main URL when the 3.x shell is on. Footer shows this version for staff.
                </span>
              </div>
              <div className="dashboard-shell-status dashboard-shell-status--inline">
                <span className="dashboard-shell-label">Live</span>
                <strong className="dashboard-shell-value">{v3Release}</strong>
              </div>
              {v3ReleaseMainToggleError && (
                <div className="dashboard-shell-error" role="alert">
                  {v3ReleaseMainToggleError}
                </div>
              )}
              <div className="dashboard-shell-actions dashboard-v3-pos-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={v3ReleaseMainToggleLoading || v3Release === '3.1'}
                  onClick={() => void handleSetV3ReleaseMain('3.1')}
                >
                  {v3ReleaseMainToggleLoading ? 'Saving…' : 'Activate 3.1'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={v3ReleaseMainToggleLoading || v3Release === '3.0'}
                  onClick={() => void handleSetV3ReleaseMain('3.0')}
                >
                  {v3ReleaseMainToggleLoading ? 'Saving…' : 'Rollback main to 3.0'}
                </button>
              </div>
            </div>
            <div className="dashboard-v3-release-row">
              <div className="dashboard-v3-pos-label">
                <span className="dashboard-shell-label">Beta Hosting — 3.x release</span>
                <span className="dashboard-v3-pos-hint">
                  Preview 3.1 here before activating on main. “Match live” clears a beta-only override.
                </span>
              </div>
              <div className="dashboard-shell-status dashboard-shell-status--inline">
                <span className="dashboard-shell-label">Beta effective</span>
                <strong className="dashboard-shell-value">
                  {v3ReleaseBetaEffective}
                  {v3Release === '3.0' && v3ReleaseBetaEffective === '3.1' ? ' · preview' : ''}
                </strong>
              </div>
              {v3ReleaseBetaToggleError && (
                <div className="dashboard-shell-error" role="alert">
                  {v3ReleaseBetaToggleError}
                </div>
              )}
              <div className="dashboard-shell-actions dashboard-v3-pos-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={v3ReleaseBetaToggleLoading || v3ReleaseBetaEffective === '3.1'}
                  onClick={() => void handlePreview31OnBeta()}
                >
                  {v3ReleaseBetaToggleLoading ? 'Saving…' : 'Preview 3.1 on beta'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={v3ReleaseBetaToggleLoading || v3ReleaseBetaOverride === null}
                  onClick={() => void handleBetaMatchLive()}
                >
                  {v3ReleaseBetaToggleLoading ? 'Saving…' : 'Match live'}
                </button>
              </div>
            </div>
            <div className="dashboard-v3-pos-row">
              <div className="dashboard-v3-pos-label">
                <span className="dashboard-shell-label">3.0 Home — Cash Only POS</span>
                <span className="dashboard-v3-pos-hint">Hidden from staff when off (v2 More menu unchanged).</span>
              </div>
              <div className="dashboard-shell-actions dashboard-v3-pos-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={posToggleLoading || !v3AdminPosEnabled}
                  onClick={() => void handleSetV3AdminPosEnabled(false)}
                >
                  {posToggleLoading ? 'Saving…' : 'Hide'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={posToggleLoading || v3AdminPosEnabled}
                  onClick={() => void handleSetV3AdminPosEnabled(true)}
                >
                  {posToggleLoading ? 'Saving…' : 'Show'}
                </button>
              </div>
            </div>
            {posToggleError && (
              <div className="dashboard-shell-error" role="alert">
                {posToggleError}
              </div>
            )}
          </div>

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
