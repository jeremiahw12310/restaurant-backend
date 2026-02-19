import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './NotificationsHub.css'

export type NotificationType = 
  | 'application' 
  | 'timeoff' 
  | 'report' 
  | 'stock' 
  | 'security' 
  | 'notification'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  subtitle: string
  timestamp: Date
  priority?: 'high' | 'medium' | 'low'
  actionLabel?: string
  actionPath?: string
  meta?: Record<string, unknown>
}

interface NotificationsHubProps {
  items: NotificationItem[]
  maxItems?: number
  onAction?: (item: NotificationItem) => void
  onViewAll?: () => void
  loading?: boolean
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; label: string; color: string }> = {
  application: { icon: '💼', label: 'Application', color: 'info' },
  timeoff: { icon: '🏖️', label: 'Time Off', color: 'warning' },
  report: { icon: '📝', label: 'Report', color: 'accent' },
  stock: { icon: '📦', label: 'Stock', color: 'warning' },
  security: { icon: '🔐', label: 'Security', color: 'accent' },
  notification: { icon: '🔔', label: 'Alert', color: 'info' },
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function NotificationsHub({ 
  items, 
  maxItems = 8, 
  onAction,
  onViewAll,
  loading = false 
}: NotificationsHubProps) {
  const navigate = useNavigate()

  const sortedItems = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        // Sort by timestamp first (newest first)
        const timeDiff = b.timestamp.getTime() - a.timestamp.getTime()
        if (timeDiff !== 0) return timeDiff
        
        // Only use priority as tiebreaker for identical timestamps
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        const aPriority = priorityOrder[a.priority || 'low']
        const bPriority = priorityOrder[b.priority || 'low']
        return aPriority - bPriority
      })
      .slice(0, maxItems)
  }, [items, maxItems])

  const handleItemClick = (item: NotificationItem) => {
    if (onAction) {
      onAction(item)
    } else if (item.actionPath) {
      navigate(item.actionPath)
    }
  }

  const groupedByType = useMemo(() => {
    const groups: Record<NotificationType, number> = {
      application: 0,
      timeoff: 0,
      report: 0,
      stock: 0,
      security: 0,
      notification: 0,
    }
    items.forEach(item => {
      groups[item.type]++
    })
    return groups
  }, [items])

  if (loading) {
    return (
      <div className="notifications-hub notifications-hub-loading">
        <div className="notifications-hub-header">
          <h2 className="notifications-hub-title">
            <span>🔔</span> Recent Notifications
          </h2>
        </div>
        <div className="notifications-hub-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="notification-skeleton">
              <div className="skeleton-icon" />
              <div className="skeleton-content">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-subtitle" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="notifications-hub notifications-hub-empty">
        <div className="notifications-hub-header">
          <h2 className="notifications-hub-title">
            <span>🔔</span> Recent Notifications
          </h2>
        </div>
        <div className="notifications-empty-state">
          <span className="notifications-empty-icon">✨</span>
          <h3>All caught up!</h3>
          <p>No pending notifications right now</p>
        </div>
      </div>
    )
  }

  return (
    <div className="notifications-hub">
      <div className="notifications-hub-header">
        <h2 className="notifications-hub-title">
          <span>🔔</span> Recent Notifications
          <span className="notifications-count">{items.length}</span>
        </h2>
        
        <div className="notifications-type-pills">
          {Object.entries(groupedByType)
            .filter(([, count]) => count > 0)
            .map(([type, count]) => (
              <span 
                key={type} 
                className={`notifications-pill notifications-pill-${TYPE_CONFIG[type as NotificationType].color}`}
              >
                {TYPE_CONFIG[type as NotificationType].icon} {count}
              </span>
            ))
          }
        </div>
      </div>

      <div className="notifications-list">
        {sortedItems.map((item) => {
          const config = TYPE_CONFIG[item.type]
          return (
            <div 
              key={item.id}
              className={`notification-item notification-item-${config.color} ${item.priority === 'high' ? 'notification-high-priority' : ''}`}
              onClick={() => handleItemClick(item)}
              role="button"
              tabIndex={0}
            >
              <div className="notification-icon">
                {config.icon}
              </div>
              
              <div className="notification-content">
                <div className="notification-header-row">
                  <span className={`notification-type-badge notification-badge-${config.color}`}>
                    {config.label}
                  </span>
                  <span className="notification-time">
                    {formatTimeAgo(item.timestamp)}
                  </span>
                </div>
                <h4 className="notification-title">{item.title}</h4>
                <p className="notification-subtitle">{item.subtitle}</p>
              </div>
              
              <div className="notification-action">
                <span className="notification-arrow">→</span>
              </div>
            </div>
          )
        })}
      </div>

      {items.length > maxItems && (
        <div className="notifications-footer">
          <button className="notifications-view-all" onClick={onViewAll}>
            View all {items.length} notifications
          </button>
        </div>
      )}
    </div>
  )
}

export default NotificationsHub
