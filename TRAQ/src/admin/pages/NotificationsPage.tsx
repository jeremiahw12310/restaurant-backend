import { useState, useEffect, useCallback, useMemo } from 'react'
import './NotificationsPage.css'
import {
  subscribeToEmployees,
  subscribeToNotifications,
  createNotification,
  setNotificationActive,
  deleteNotification,
  type NotificationDoc,
} from '../../services/firestore'

export function NotificationsPage() {
  const [employees, setEmployees] = useState<string[]>([])
  const [notifications, setNotifications] = useState<NotificationDoc[]>([])
  
  // Form state
  const [target, setTarget] = useState<string>('all')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Subscribe to employees
  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployees(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to notifications
  useEffect(() => {
    const unsub = subscribeToNotifications((list) => {
      setNotifications(list)
    })
    return () => unsub?.()
  }, [])

  // Split notifications
  const activeNotifications = useMemo(() => {
    return notifications.filter((n) => n.active)
  }, [notifications])

  const inactiveNotifications = useMemo(() => {
    return notifications.filter((n) => !n.active).slice(0, 10)
  }, [notifications])

  // Send notification
  const handleSend = useCallback(async () => {
    if (!message.trim()) return
    setSending(true)
    setSendError(null)

    try {
      await createNotification(target, message.trim())
      setMessage('')
      setTarget('all')
    } catch (err) {
      console.error('Failed to send notification:', err)
      setSendError('Failed to send notification. Please try again.')
    } finally {
      setSending(false)
    }
  }, [target, message])

  // Deactivate notification
  const handleDeactivate = useCallback(async (id: string) => {
    try {
      await setNotificationActive(id, false)
    } catch (err) {
      console.error('Failed to deactivate notification:', err)
    }
  }, [])

  // Reactivate notification
  const handleReactivate = useCallback(async (id: string) => {
    try {
      await setNotificationActive(id, true)
    } catch (err) {
      console.error('Failed to reactivate notification:', err)
    }
  }, [])

  // Delete notification
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this notification?')) return
    try {
      await deleteNotification(id)
    } catch (err) {
      console.error('Failed to delete notification:', err)
    }
  }, [])

  return (
    <div className="notifications-page">
      <header className="admin-page-header">
        <h1>Notifications</h1>
        <p>Send notifications that employees will see when selected for a task.</p>
      </header>

      {/* Send Form */}
      <div className="admin-card notif-form-card">
        <h3 className="admin-card-title">
          <span>📤</span> Send Notification
        </h3>

        <div className="notif-form">
          <div className="notif-form-row">
            <label className="admin-label">To:</label>
            <select
              className="admin-input notif-target-select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={sending}
            >
              <option value="all">All Employees</option>
              {employees.map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>

          <div className="notif-form-field">
            <label className="admin-label">Message:</label>
            <textarea
              className="admin-input notif-message-input"
              placeholder="Enter notification message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={3}
            />
          </div>

          {sendError && <div className="notif-error">{sendError}</div>}

          <button
            className="admin-btn admin-btn-primary"
            onClick={handleSend}
            disabled={sending || !message.trim()}
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      </div>

      {/* Active Notifications */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🔔</span> Active Notifications
          {activeNotifications.length > 0 && (
            <span className="notif-count">{activeNotifications.length}</span>
          )}
        </h3>

        {activeNotifications.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔔</span>
            <h3>No active notifications</h3>
            <p>Send a notification above to get started</p>
          </div>
        ) : (
          <div className="notif-list">
            {activeNotifications.map((notif) => (
              <div key={notif.id} className="notif-card notif-card-active">
                <div className="notif-card-header">
                  <span className="notif-card-target">
                    {notif.to === 'all' ? '📢 All Employees' : `👤 ${notif.to}`}
                  </span>
                  <span className="notif-card-time">
                    {new Date(notif.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="notif-card-message">{notif.message}</div>

                {notif.to === 'all' && Object.keys(notif.dismissedBy || {}).length > 0 && (
                  <div className="notif-card-seen">
                    <span className="notif-seen-label">Seen by:</span>{' '}
                    {Object.keys(notif.dismissedBy).join(', ')}
                  </div>
                )}

                <div className="notif-card-actions">
                  <button
                    className="admin-btn notif-btn-deactivate"
                    onClick={() => handleDeactivate(notif.id)}
                  >
                    Deactivate
                  </button>
                  <button
                    className="admin-btn notif-btn-delete"
                    onClick={() => handleDelete(notif.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive Notifications */}
      {inactiveNotifications.length > 0 && (
        <div className="admin-card">
          <h3 className="admin-card-title">
            <span>📭</span> Inactive Notifications
            <span className="notif-count notif-count-muted">{inactiveNotifications.length}</span>
          </h3>

          <div className="notif-list notif-list-inactive">
            {inactiveNotifications.map((notif) => (
              <div key={notif.id} className="notif-card notif-card-inactive">
                <div className="notif-card-header">
                  <span className="notif-card-target">
                    {notif.to === 'all' ? '📢 All' : `👤 ${notif.to}`}
                  </span>
                  <span className="notif-card-time">
                    {new Date(notif.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <div className="notif-card-message">{notif.message}</div>

                <div className="notif-card-actions">
                  <button
                    className="admin-btn notif-btn-reactivate"
                    onClick={() => handleReactivate(notif.id)}
                  >
                    Reactivate
                  </button>
                  <button
                    className="admin-btn notif-btn-delete"
                    onClick={() => handleDelete(notif.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationsPage
