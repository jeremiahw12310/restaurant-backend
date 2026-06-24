import React, { useEffect, useRef } from 'react'
import { CinematicReveal } from './CinematicReveal'
import { GoldenCurtainReveal } from './GoldenCurtainReveal'

export type DailyTaskModalProps = {
  uiVariant?: 'v2' | 'v3'
  open: boolean
  onClose: () => void

  shouldIgnoreClick: () => boolean
  recordTouch: () => void

  beginTap: (e: React.TouchEvent) => void
  moveTap: (e: React.TouchEvent) => void
  endTap: (fn: () => void, e: React.TouchEvent) => void

  busy: boolean
  error: string | null

  step: number
  setStep: (n: number) => void

  /** True while the reveal animation is playing */
  isRevealing: boolean

  revealedAtMs?: number
  completedAtMs?: number
  completedBy?: string

  taskName: string
  materialsDesc: string
  materialsUrl: string
  whatToDoDesc: string
  whatToDoUrl: string

  /** Up to 2 names for split credit */
  selectedEmployees: string[]
  onOpenEmployeeSelector: () => void

  onReveal: () => Promise<void>
  onSlotRevealComplete: () => void
  onComplete: () => Promise<void>
}

export function DailyTaskModal(props: DailyTaskModalProps) {
  const {
    uiVariant = 'v2',
    open,
    onClose,
    shouldIgnoreClick,
    recordTouch,
    beginTap,
    moveTap,
    endTap,
    busy,
    error,
    step,
    setStep,
    isRevealing,
    revealedAtMs,
    completedAtMs,
    completedBy,
    taskName,
    materialsDesc,
    materialsUrl,
    whatToDoDesc,
    whatToDoUrl,
    selectedEmployees,
    onOpenEmployeeSelector,
    onReveal,
    onSlotRevealComplete,
    onComplete,
  } = props

  // Track whether a touch began on the backdrop itself (outside the modal sheet).
  // This prevents "inside tap" touchend bubbling from closing the modal on iOS.
  const startedOnBackdropRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const isCompleted = !!completedAtMs || step === 4
  const isRevealed = !!revealedAtMs && !isCompleted

  // Determine header title
  // During reveal animation, keep "Today's Task" to maintain suspense
  const headerTitle = isRevealing
    ? "Today's Task"
    : isRevealed || isCompleted
    ? taskName
    : "Today's Task"

  return (
    <div
      className="modal-backdrop daily-task-modal-backdrop"
      onTouchStart={(e) => {
        // Always allow tapping outside the card to close (avoid shouldIgnoreClick gating).
        startedOnBackdropRef.current = e.target === e.currentTarget
        beginTap(e)
      }}
      onTouchMove={(e) => {
        moveTap(e)
      }}
      onTouchEnd={(e) => {
        if (!startedOnBackdropRef.current) return
        startedOnBackdropRef.current = false
        endTap(onClose, e)
      }}
      onClick={(e) => {
        // Only close on actual backdrop clicks (not clicks inside the sheet).
        if (e.target !== e.currentTarget) return
        recordTouch()
        onClose()
      }}
    >
      <div
        className="modal-sheet daily-task-modal-sheet"
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="daily-task-modal-header">
          <div className="daily-task-modal-title">
            <div className="daily-task-modal-h1">{headerTitle}</div>
          </div>
          <button
            className="close-button daily-task-modal-close"
            onTouchStart={(e) => {
              recordTouch()
              onClose()
              e.preventDefault()
            }}
            onClick={() => {
              if (!shouldIgnoreClick()) onClose()
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="daily-task-modal-scroll">
          {error ? <div className="daily-task-error">{error}</div> : null}

          {/* Unrevealed - Show reveal button */}
          {!revealedAtMs && !completedAtMs && !isRevealing ? (
            <>
              <div className="daily-task-body daily-task-body-center daily-task-reveal-prompt">
                Tap below to reveal today's randomly selected task
              </div>
              <button
                className="daily-task-primary-btn"
                type="button"
                disabled={busy}
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => void onReveal(), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  void onReveal()
                }}
              >
                {busy ? '...' : 'Reveal Task'}
              </button>
            </>
          ) : null}

          {/* Golden Curtain Wipe Reveal */}
          {isRevealing && taskName ? (
            uiVariant === 'v3' ? (
              <CinematicReveal
                text={taskName}
                onContinue={onSlotRevealComplete}
                beginTap={beginTap}
                moveTap={moveTap}
                endTap={endTap}
                shouldIgnoreClick={shouldIgnoreClick}
              />
            ) : (
              <GoldenCurtainReveal
                text={taskName}
                onContinue={onSlotRevealComplete}
                beginTap={beginTap}
                moveTap={moveTap}
                endTap={endTap}
                shouldIgnoreClick={shouldIgnoreClick}
              />
            )
          ) : null}

          {/* Step 1: Materials (now the first step after reveal) */}
          {revealedAtMs && !completedAtMs && !isRevealing && step === 1 ? (
            <>
              <div className="daily-task-section-header">Materials needed</div>
              <div className="daily-task-image-shell">
                {materialsUrl ? (
                  <img className="daily-task-image" src={materialsUrl} alt="Materials needed" />
                ) : (
                  <div className="daily-task-image-placeholder">No image uploaded</div>
                )}
              </div>
              <div className="daily-task-body daily-task-desc">{materialsDesc || ''}</div>
              <button
                className="daily-task-primary-btn"
                type="button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => setStep(2), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setStep(2)
                }}
              >
                Continue
              </button>
            </>
          ) : null}

          {/* Step 2: What to do */}
          {revealedAtMs && !completedAtMs && !isRevealing && step === 2 ? (
            <>
              <div className="daily-task-section-header">What to do</div>
              <div className="daily-task-image-shell">
                {whatToDoUrl ? (
                  <img className="daily-task-image" src={whatToDoUrl} alt="What to do" />
                ) : (
                  <div className="daily-task-image-placeholder">No image uploaded</div>
                )}
              </div>
              <div className="daily-task-body daily-task-desc">{whatToDoDesc || ''}</div>
              <button
                className="daily-task-primary-btn"
                type="button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => setStep(3), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setStep(3)
                }}
              >
                Task complete
              </button>
            </>
          ) : null}

          {/* Step 3: Employee selection + photo reminder */}
          {revealedAtMs && !completedAtMs && !isRevealing && step === 3 ? (
            <>
              {selectedEmployees.length === 0 ? (
                <>
                  <div className="daily-task-body daily-task-body-center">
                    Select who completed this task (up to 2)
                  </div>
                  <button
                    className="daily-task-primary-btn"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) => endTap(() => onOpenEmployeeSelector(), e)}
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      onOpenEmployeeSelector()
                    }}
                  >
                    Select Employee(s)
                  </button>
                </>
              ) : (
                <>
                  <div className="daily-task-section-header">Almost done!</div>
                  <div className="daily-task-body daily-task-big-callout">
                    Send a photo of the completed area to the groupchat
                  </div>
                  <div className="daily-task-selected-employee">
                    Selected: <strong>{selectedEmployees.join(' + ')}</strong>
                    <button
                      type="button"
                      className="daily-task-change-employee"
                      onTouchStart={beginTap}
                      onTouchMove={moveTap}
                      onTouchEnd={(e) => endTap(() => onOpenEmployeeSelector(), e)}
                      onClick={() => {
                        if (shouldIgnoreClick()) return
                        onOpenEmployeeSelector()
                      }}
                    >
                      Change
                    </button>
                  </div>
                  <button
                    className="daily-task-primary-btn"
                    type="button"
                    disabled={busy}
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) => endTap(() => void onComplete(), e)}
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      void onComplete()
                    }}
                  >
                    {busy ? 'Saving...' : 'Done'}
                  </button>
                </>
              )}
            </>
          ) : null}

          {/* Step 4: Completed */}
          {isCompleted ? (
            <>
              <div className="daily-task-golden-title">{taskName || 'Daily task'} completed</div>
              <div className="daily-task-body">{completedBy ? `Completed by ${completedBy}.` : ''}</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
