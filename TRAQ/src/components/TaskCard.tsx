import { memo, type CSSProperties, type DragEvent, type TouchEvent } from 'react'
import type { EmployeeColors } from '../services/firestore'
import type { EffectiveStatus, Task, TaskCompletion } from '../types/task'

export type TaskCardProps = {
  task: Task
  status: EffectiveStatus
  completion?: TaskCompletion
  showNewBadge?: boolean
  showUpdatedRequirementsBadge?: boolean
  highlightEarlyCompletable?: boolean
  deferredBadgeAt?: string | null
  previewAssignees?: string[]
  iceDraftPreview?: { left: string | null; right: string | null }
  towelDraftPreview?: { diningBar: string | null; bowlStation: string | null }
  interactionLocked?: boolean
  cardRef?: (el: HTMLDivElement | null) => void
  isAdmin: boolean
  draggedTaskId: string | null
  dragOverTaskId: string | null
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical'
  isPulsing?: boolean
  employeeColors?: EmployeeColors
  onTaskClick: (taskId: string) => void
  onTaskTouchStart: (taskId: string, e: TouchEvent) => void
  onTaskTouchMove: (e: TouchEvent) => void
  onTaskTouchEnd: (taskId: string, e: TouchEvent) => void
  onDragStart: (taskId: string, e: DragEvent) => void
  onDragEnd: () => void
  onDragEnter: (taskId: string) => void
  onDragLeave: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (taskId: string, e: DragEvent) => void
}

// Memoized TaskCard component to prevent unnecessary re-renders
export const TaskCard = memo(({
  task,
  status,
  completion,
  showNewBadge,
  showUpdatedRequirementsBadge,
  highlightEarlyCompletable,
  deferredBadgeAt,
  previewAssignees,
  iceDraftPreview,
  towelDraftPreview,
  interactionLocked,
  cardRef,
  isAdmin,
  draggedTaskId,
  dragOverTaskId,
  urgency,
  isPulsing,
  employeeColors,
  onTaskClick,
  onTaskTouchStart,
  onTaskTouchMove,
  onTaskTouchEnd,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: TaskCardProps) => {
  const displayStatus = status === 'missing' ? 'missing' : status === 'late' ? 'late' : status
  const isWeighted = (task.weight ?? 1) > 1
  const isDeferredVisual = !!completion?.deferredToClose || !!deferredBadgeAt
  const locked = !!interactionLocked && !isAdmin
  const displayAssignees = (() => {
    // Combined Ice: if both sides are the same person, display only once.
    if ((task.id === 'ice-5pm' || task.id === 'ice-close') && completion?.iceSides) {
      const a = String(completion.iceSides.left || '').trim()
      const b = String(completion.iceSides.right || '').trim()
      if (a && b && a === b) return [a]
      return [a, b].filter(Boolean)
    }
    // Split Towels: Dining/Bar + Bowl Station
    if ((task.id === 'towels-5pm' || task.id === 'towels-close') && completion?.towelSides) {
      const a = String(completion.towelSides.diningBar || '').trim()
      const b = String(completion.towelSides.bowlStation || '').trim()
      if (a && b && a === b) return [a]
      return [a, b].filter(Boolean)
    }
    return completion?.assignees || []
  })()
  const statusClass =
    status === 'done'
      ? 'pill-done'
      : status === 'late' || status === 'missing'
      ? 'pill-overdue'
      : 'pill-pending'

  const showLate = status === 'done' && !!completion?.completedLate && !completion?.lateForgiven
  const showEarly = status === 'done' && !!completion?.completedEarly && !showLate
  const showStatusPill = (status !== 'pending' && status !== 'done') || showLate || showEarly

  const urgencyClass = urgency !== 'none' ? `urgency-${urgency}` : ''
  const pulseClass = isPulsing ? 'next-task-pulse' : ''
  const extraBadges: { key: string; text: string; className: string }[] = []
  if (showNewBadge) extraBadges.push({ key: 'new', text: 'new', className: 'pill-new' })
  if (showUpdatedRequirementsBadge) {
    extraBadges.push({ key: 'updated', text: 'updated requirements', className: 'pill-updated' })
  }

  // Get the tint color from the first assignee's color (if task is done)
  const tintColor =
    status === 'done' && displayAssignees.length && employeeColors
      ? employeeColors[displayAssignees[0]] || null
      : null

  return (
    <div
      className={`task-card ${status === 'done' ? 'done' : ''} ${highlightEarlyCompletable ? 'early-completable' : ''} ${isAdmin ? 'draggable' : ''} ${draggedTaskId === task.id ? 'dragging' : ''} ${dragOverTaskId === task.id ? 'drag-over' : ''} ${completion?.assignedByAdmin ? 'admin-assigned' : ''} ${isDeferredVisual ? 'deferred' : ''} ${locked ? 'interaction-locked' : ''} ${urgencyClass} ${pulseClass}`}
      data-task-id={task.id}
      ref={cardRef}
      style={tintColor ? ({ '--employee-tint': tintColor } as CSSProperties) : undefined}
      onClick={() => {
        if (locked) return
        onTaskClick(task.id)
      }}
      onTouchStart={(e) => {
        if (locked) return
        onTaskTouchStart(task.id, e)
      }}
      onTouchMove={onTaskTouchMove}
      onTouchEnd={(e) => {
        if (locked) return
        onTaskTouchEnd(task.id, e)
      }}
      draggable={isAdmin}
      onDragStart={(e) => onDragStart(task.id, e)}
      onDragEnd={onDragEnd}
      onDragEnter={() => onDragEnter(task.id)}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(task.id, e)}
    >
      {/* Color tint overlay for completed tasks */}
      {tintColor && <div className="task-color-tint" aria-hidden="true" />}
      {completion?.assignedByAdmin && (
        <span className="admin-badge">
          ⭐ Assigned - {task.name}
          {isWeighted ? ' ★' : ''}
        </span>
      )}
      {extraBadges.map((b, idx) => {
        const baseTop = showStatusPill ? 54 : 14
        const top = baseTop + idx * 40
        return (
          <span key={b.key} className={`status-pill ${b.className}`} style={{ top }}>
            {b.text}
          </span>
        )
      })}
      {showStatusPill ? (
        <span className={`status-pill ${showLate ? 'pill-overdue' : showEarly ? 'pill-early' : statusClass}`}>
          {showLate ? 'late' : showEarly ? 'early' : displayStatus}
        </span>
      ) : null}
      <div className="task-header">
        <div className="task-icon" aria-hidden>
          {task.icon}
        </div>
        <div className="task-info">
          <div className="task-label">
            <span className="task-name">{task.name}</span>
            {isWeighted && (
              <span className="weighted-star" aria-hidden title="Counts for more points">
                ★
              </span>
            )}
          </div>
        </div>
      </div>
      {((displayAssignees && displayAssignees.length > 0) ||
        (previewAssignees && previewAssignees.length > 0)) &&
        !((task.id === 'ice-5pm' || task.id === 'ice-close') && completion?.iceSides) &&
        !((task.id === 'towels-5pm' || task.id === 'towels-close') && completion?.towelSides) && (
        <div className="completed-names">
          {(displayAssignees && displayAssignees.length > 0 ? displayAssignees : previewAssignees || []).join(' & ')}
        </div>
      )}
      {/* Ice completion: show split format (Left/Right) on card */}
      {(task.id === 'ice-5pm' || task.id === 'ice-close') &&
        completion?.iceSides &&
        (completion.iceSides.left || completion.iceSides.right) && (
        <div className="ice-preview-names">
          <div>Left: {completion.iceSides.left || 'Open'}</div>
          <div>Right: {completion.iceSides.right || 'Open'}</div>
        </div>
      )}
      {/* Towel completion (full or partial): show split format so partial stays visible on card */}
      {(task.id === 'towels-5pm' || task.id === 'towels-close') &&
        completion?.towelSides &&
        (completion.towelSides.diningBar || completion.towelSides.bowlStation) && (
        <div className="ice-preview-names">
          <div>Dining/Bar: {completion.towelSides.diningBar || 'Open'}</div>
          <div>Bowl Station: {completion.towelSides.bowlStation || 'Open'}</div>
        </div>
      )}
      {/* Ice draft preview: show partial selection when one side is filled but task not completed */}
      {(task.id === 'ice-5pm' || task.id === 'ice-close') &&
        !completion &&
        iceDraftPreview &&
        (iceDraftPreview.left || iceDraftPreview.right) && (
        <div className="ice-preview-names">
          <div>Left: {iceDraftPreview.left || 'Open'}</div>
          <div>Right: {iceDraftPreview.right || 'Open'}</div>
        </div>
      )}
      {/* Towel draft preview: show partial selection when one side is filled but task not completed */}
      {(task.id === 'towels-5pm' || task.id === 'towels-close') &&
        !completion &&
        towelDraftPreview &&
        (towelDraftPreview.diningBar || towelDraftPreview.bowlStation) && (
        <div className="ice-preview-names">
          <div>Dining/Bar: {towelDraftPreview.diningBar || 'Open'}</div>
          <div>Bowl Station: {towelDraftPreview.bowlStation || 'Open'}</div>
        </div>
      )}
      {completion?.deferredToClose && (
        <div className="card-deferred-badge">Will be counted at {completion.deferredToClose}PM</div>
      )}
      {!completion?.deferredToClose && deferredBadgeAt && (
        <div className="card-deferred-badge">Will be counted at {deferredBadgeAt}PM</div>
      )}
    </div>
  )
})

TaskCard.displayName = 'TaskCard'



