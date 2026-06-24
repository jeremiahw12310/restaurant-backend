import React from 'react'

type Props = {
  label: string
  completed: boolean
  completedBy?: string
  subtitle?: string
  className?: string
  /** Reserve grid space but hide while a task modal is open (prevents layout shift). */
  layoutLocked?: boolean
  attention: boolean
  onOpen: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

export const DailyTaskTeaserCard = React.forwardRef<HTMLDivElement, Props>(
  (
    {
      label,
      completed,
      completedBy,
      subtitle,
      className,
      layoutLocked = false,
      attention,
      onOpen,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={[
          'daily-task-golden-card',
          'daily-task-teaser',
          className || '',
          layoutLocked ? 'daily-task-teaser--layout-locked' : '',
          attention ? 'daily-task-attention' : '',
          completed ? 'daily-task-completed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={layoutLocked ? -1 : 0}
        aria-hidden={layoutLocked ? true : undefined}
        aria-label="Open today's task"
        {...(layoutLocked ? { inert: '' as const } : {})}
        onTouchStart={layoutLocked ? undefined : onTouchStart}
        onTouchMove={layoutLocked ? undefined : onTouchMove}
        onTouchEnd={layoutLocked ? undefined : onTouchEnd}
        onClick={layoutLocked ? undefined : onOpen}
        onKeyDown={
          layoutLocked
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen()
                }
              }
        }
      >
        <div className="daily-task-teaser-title">{label}</div>
        {completed ? (
          <div className="daily-task-teaser-sub">{`Completed by ${completedBy || 'unknown'}`}</div>
        ) : (
          <div className="daily-task-teaser-sub">{subtitle || 'Tap to open'}</div>
        )}
      </div>
    )
  }
)
DailyTaskTeaserCard.displayName = 'DailyTaskTeaserCard'
