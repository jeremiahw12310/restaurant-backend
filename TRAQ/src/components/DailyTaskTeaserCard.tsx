import React from 'react'

type Props = {
  label: string
  completed: boolean
  completedBy?: string
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
          attention ? 'daily-task-attention' : '',
          completed ? 'daily-task-completed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        aria-label="Open today's task"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <div className="daily-task-teaser-title">{label}</div>
        {completed ? (
          <div className="daily-task-teaser-sub">{`Completed by ${completedBy || 'unknown'}`}</div>
        ) : (
          <div className="daily-task-teaser-sub">Tap to open</div>
        )}
      </div>
    )
  }
)
DailyTaskTeaserCard.displayName = 'DailyTaskTeaserCard'
