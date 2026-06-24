import { useState, useEffect } from 'react'
import './LogsPage.css'
import {
  subscribeToAdminLoginAttempts,
  subscribeToReloadLogs,
  subscribeToSelectionLogs,
  type AdminLoginAttempt,
  type AppReloadLogEntry,
  type SelectionLogEntry,
} from '../../services/firestore'
import {
  subscribeToMusicControlLogs,
  type MusicControlLogEntry,
} from '../../services/music'
import {
  incrementGoodMorningForceEpoch,
  subscribeToGoodMorningLogs,
  subscribeToGoodMorningSessions,
  type GoodMorningLogEntry,
  type GoodMorningSession,
} from '../../services/goodMorning'

const GOOD_MORNING_STALE_MS = 30_000

export function LogsPage() {
  // Selection logs from Firestore (synced across all devices)
  const [selectionLogs, setSelectionLogs] = useState<SelectionLogEntry[]>([])
  const [showAllSelection, setShowAllSelection] = useState(false)

  // Music control logs
  const [musicLogs, setMusicLogs] = useState<MusicControlLogEntry[]>([])
  const [showAllMusic, setShowAllMusic] = useState(false)

  // Admin login attempts
  const [loginAttempts, setLoginAttempts] = useState<AdminLoginAttempt[]>([])
  const [showAllLogin, setShowAllLogin] = useState(false)

  const [reloadLogs, setReloadLogs] = useState<AppReloadLogEntry[]>([])
  const [showAllReloads, setShowAllReloads] = useState(false)

  const [goodMorningLogs, setGoodMorningLogs] = useState<GoodMorningLogEntry[]>([])
  const [goodMorningSessions, setGoodMorningSessions] = useState<GoodMorningSession[]>([])
  const [showAllGmLogs, setShowAllGmLogs] = useState(false)
  const [gmForceBusy, setGmForceBusy] = useState(false)
  const [gmForceError, setGmForceError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [])

  // Subscribe to selection logs from Firestore
  useEffect(() => {
    const unsub = subscribeToSelectionLogs((logs) => {
      setSelectionLogs(logs)
    }, 200)
    return () => unsub?.()
  }, [])

  // Subscribe to music control logs
  useEffect(() => {
    const unsub = subscribeToMusicControlLogs((logs) => {
      setMusicLogs(logs)
    }, 200)
    return () => unsub?.()
  }, [])

  // Subscribe to admin login attempts
  useEffect(() => {
    const unsub = subscribeToAdminLoginAttempts((attempts) => {
      setLoginAttempts(attempts)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeToReloadLogs((logs) => {
      setReloadLogs(logs)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeToGoodMorningLogs((logs) => setGoodMorningLogs(logs), 100)
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeToGoodMorningSessions((sessions) => setGoodMorningSessions(sessions))
    return () => unsub?.()
  }, [])

  // Display limits
  const selectionDisplayed = showAllSelection ? selectionLogs : selectionLogs.slice(0, 5)
  const musicDisplayed = showAllMusic ? musicLogs : musicLogs.slice(0, 5)
  const loginDisplayed = showAllLogin ? loginAttempts : loginAttempts.slice(0, 5)
  const reloadDisplayed = showAllReloads ? reloadLogs : reloadLogs.slice(0, 5)
  const gmLogsDisplayed = showAllGmLogs ? goodMorningLogs : goodMorningLogs.slice(0, 8)

  const reloadKindLabel = (kind: string) => {
    if (kind === 'unexpected') return 'Unexpected'
    if (kind === 'nightly-update') return 'Nightly update'
    if (kind === 'force-refresh') return 'Force refresh'
    if (kind === 'manual-refresh') return 'Manual refresh'
    if (kind === 'error-boundary-manual') return 'Error recovery'
    return kind
  }

  return (
    <div className="logs-page">
      <header className="admin-page-header">
        <h1>Activity Logs</h1>
        <p>Track task selections, music controls, admin login attempts, app reloads, and Good Morning screen activity.</p>
      </header>

      {/* Good Morning */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>☀️</span> Good Morning
          {goodMorningLogs.length > 0 && <span className="logs-count">{goodMorningLogs.length}</span>}
        </h3>
        <p className="logs-page-subtle">
          Devices on the Good Morning screen heartbeat while the overlay is open. Stale means no heartbeat for 30s.
        </p>
        <div className="good-morning-force-row">
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={gmForceBusy}
            onClick={async () => {
              setGmForceError(null)
              setGmForceBusy(true)
              try {
                await incrementGoodMorningForceEpoch()
              } catch (e) {
                setGmForceError(e instanceof Error ? e.message : 'Failed to update')
              } finally {
                setGmForceBusy(false)
              }
            }}
          >
            {gmForceBusy ? 'Updating…' : 'Show Good Morning again today (all devices)'}
          </button>
          {gmForceError && <span className="logs-inline-error">{gmForceError}</span>}
        </div>

        <h4 className="logs-subheading">Active on Good Morning</h4>
        {goodMorningSessions.length === 0 ? (
          <div className="admin-empty admin-empty--compact">
            <p>No sessions reporting — no kiosk is on the Good Morning screen right now.</p>
          </div>
        ) : (
          <div className="logs-list">
            {goodMorningSessions.map((s) => {
              const stale = nowMs - s.lastSeenAtMs > GOOD_MORNING_STALE_MS
              return (
                <div
                  key={s.sessionId}
                  className={`log-entry log-entry-good-morning ${stale ? 'log-entry-good-morning--stale' : ''}`}
                >
                  <div className="log-entry-header">
                    <span className="log-action-badge">{stale ? 'Stale' : 'Live'}</span>
                    <span className="log-timestamp">
                      {s.lastSeenAtMs
                        ? new Date(s.lastSeenAtMs).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '—'}
                    </span>
                  </div>
                  <div className="log-detail-row">
                    <span>📅 {s.dateKey || '—'}</span>
                    <span>{s.deviceInfo}</span>
                  </div>
                  <div className="log-session-id" title={s.sessionId}>
                    {s.sessionId}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <h4 className="logs-subheading">Dismiss taps (recent)</h4>
        {goodMorningLogs.length === 0 ? (
          <div className="admin-empty admin-empty--compact">
            <p>No taps logged yet.</p>
          </div>
        ) : (
          <>
            <div className="logs-list">
              {gmLogsDisplayed.map((log) => (
                <div key={log.id} className="log-entry log-entry-good-morning-tap">
                  <div className="log-entry-header">
                    <span className="log-action-badge log-action-selected">Tap</span>
                    <span className="log-timestamp">
                      {new Date(log.ts).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="log-detail-row">
                    <span>📅 {log.dateKey}</span>
                    <span>{log.deviceInfo || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
            {goodMorningLogs.length > 8 && (
              <button
                className="admin-btn logs-toggle-btn"
                type="button"
                onClick={() => setShowAllGmLogs((v) => !v)}
              >
                {showAllGmLogs ? 'Show less' : `View all (${goodMorningLogs.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Selection Logs */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>📋</span> Selection Logs
          {selectionLogs.length > 0 && (
            <span className="logs-count">{selectionLogs.length}</span>
          )}
        </h3>

        {selectionLogs.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📋</span>
            <h3>No selection logs</h3>
            <p>Task selections and clearings will appear here</p>
          </div>
        ) : (
          <>
            <div className="logs-list">
              {selectionDisplayed.map((log, idx) => (
                <div key={idx} className="log-entry log-entry-selection">
                  <div className="log-entry-header">
                    <span className={`log-action-badge ${log.action === 'selected' ? 'log-action-selected' : 'log-action-cleared'}`}>
                      {log.action === 'selected' ? '✓ Selected' : '✕ Cleared'}
                    </span>
                    <span className="log-timestamp">
                      {new Date(log.ts).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="log-task-name">{log.taskName}</div>
                  {(log.selectedDate || log.selectedWindow) && (
                    <div className="log-detail-row">
                      {log.selectedDate && <span>📅 {log.selectedDate}</span>}
                      {log.selectedWindow && <span>🕐 {log.selectedWindow}</span>}
                    </div>
                  )}
                  {log.assignees && log.assignees.length > 0 && (
                    <div className="log-assignees">
                      👥 {log.assignees.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {selectionLogs.length > 5 && (
              <button
                className="admin-btn logs-toggle-btn"
                onClick={() => setShowAllSelection((v) => !v)}
              >
                {showAllSelection ? 'Show less' : `View all (${selectionLogs.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Music Control Logs */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🎵</span> Music Control Logs
          {musicLogs.length > 0 && (
            <span className="logs-count">{musicLogs.length}</span>
          )}
        </h3>

        {musicLogs.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🎵</span>
            <h3>No music logs</h3>
            <p>Play, pause, skip events will appear here</p>
          </div>
        ) : (
          <>
            <div className="logs-list">
              {musicDisplayed.map((log, idx) => (
                <div key={idx} className="log-entry log-entry-music">
                  <div className="log-entry-header">
                    <span className={`log-action-badge log-action-${log.action}`}>
                      {log.action === 'play' && '▶ Play'}
                      {log.action === 'pause' && '⏸ Pause'}
                      {log.action === 'next' && '⏭ Next'}
                      {log.action === 'prev' && '⏮ Prev'}
                    </span>
                    <span className="log-timestamp">
                      {new Date(log.ts).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {log.trackTitle && (
                    <div className="log-track-title">{log.trackTitle}</div>
                  )}
                </div>
              ))}
            </div>
            {musicLogs.length > 5 && (
              <button
                className="admin-btn logs-toggle-btn"
                onClick={() => setShowAllMusic((v) => !v)}
              >
                {showAllMusic ? 'Show less' : `View all (${musicLogs.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* App Reloads */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🔄</span> App Reloads
          {reloadLogs.length > 0 && (
            <span className="logs-count">{reloadLogs.length}</span>
          )}
        </h3>
        <p className="logs-page-subtle">
          Full page reloads on kiosk devices. Unexpected reloads often mean WebKit killed the tab (e.g. main-thread hang).
        </p>

        {reloadLogs.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔄</span>
            <h3>No reloads logged</h3>
            <p>App reload events will appear here after devices restart the page</p>
          </div>
        ) : (
          <>
            <div className="logs-list">
              {reloadDisplayed.map((log) => {
                const isUnexpected = log.kind === 'unexpected'
                return (
                  <div
                    key={log.id}
                    className={`log-entry log-entry-login ${isUnexpected ? 'log-login-failed' : 'log-login-success'}`}
                  >
                    <div className="log-entry-header">
                      <span className={`log-action-badge ${isUnexpected ? 'log-action-failed' : 'log-action-success'}`}>
                        {reloadKindLabel(log.kind)}
                      </span>
                      <span className="log-timestamp">
                        {new Date(log.ts).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    {log.lastAction && (
                      <div className="log-detail-row">
                        <span>Last action: {log.lastAction}</span>
                        {typeof log.lastActionSecAgo === 'number' && (
                          <span>{log.lastActionSecAgo}s before reload</span>
                        )}
                      </div>
                    )}
                    {log.userAgent && (
                      <div className="log-user-agent">{log.userAgent}</div>
                    )}
                  </div>
                )
              })}
            </div>
            {reloadLogs.length > 5 && (
              <button
                className="admin-btn logs-toggle-btn"
                type="button"
                onClick={() => setShowAllReloads((v) => !v)}
              >
                {showAllReloads ? 'Show less' : `View all (${reloadLogs.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Admin Login Attempts */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🔐</span> Admin Login Attempts
          {loginAttempts.length > 0 && (
            <span className="logs-count">{loginAttempts.length}</span>
          )}
        </h3>

        {loginAttempts.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔐</span>
            <h3>No login attempts</h3>
            <p>Admin login attempts will appear here</p>
          </div>
        ) : (
          <>
            <div className="logs-list">
              {loginDisplayed.map((attempt) => (
                <div key={attempt.id} className={`log-entry log-entry-login ${attempt.success ? 'log-login-success' : 'log-login-failed'}`}>
                  <div className="log-entry-header">
                    <span className={`log-action-badge ${attempt.success ? 'log-action-success' : 'log-action-failed'}`}>
                      {attempt.success ? '✓ Success' : '✕ Failed'}
                    </span>
                    <span className="log-timestamp">
                      {new Date(attempt.ts).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {attempt.userAgent && (
                    <div className="log-user-agent">{attempt.userAgent}</div>
                  )}
                </div>
              ))}
            </div>
            {loginAttempts.length > 5 && (
              <button
                className="admin-btn logs-toggle-btn"
                onClick={() => setShowAllLogin((v) => !v)}
              >
                {showAllLogin ? 'Show less' : `View all (${loginAttempts.length})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default LogsPage
