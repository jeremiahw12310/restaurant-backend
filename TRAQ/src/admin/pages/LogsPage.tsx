import { useState, useEffect } from 'react'
import './LogsPage.css'
import {
  subscribeToAdminLoginAttempts,
  subscribeToSelectionLogs,
  type AdminLoginAttempt,
  type SelectionLogEntry,
} from '../../services/firestore'
import {
  subscribeToMusicControlLogs,
  type MusicControlLogEntry,
} from '../../services/music'

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

  // Display limits
  const selectionDisplayed = showAllSelection ? selectionLogs : selectionLogs.slice(0, 5)
  const musicDisplayed = showAllMusic ? musicLogs : musicLogs.slice(0, 5)
  const loginDisplayed = showAllLogin ? loginAttempts : loginAttempts.slice(0, 5)

  return (
    <div className="logs-page">
      <header className="admin-page-header">
        <h1>Activity Logs</h1>
        <p>Track task selections, music controls, and admin login attempts.</p>
      </header>

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
