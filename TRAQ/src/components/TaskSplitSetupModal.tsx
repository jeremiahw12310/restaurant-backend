import { useEffect, useRef, useState } from 'react'
import './TaskSplitSetupModal.css'

export type TaskSplitSetupModalProps = {
  open: boolean
  windowLabel: string
  empA: string
  empB: string
  onSetEmpA: (v: string) => void
  onSetEmpB: (v: string) => void
  allEmployees: string[]
  iceSplit: boolean
  onSetIceSplit: (v: boolean) => void
  /** When false, the "Split ice?" question is hidden (no ice task in the window). */
  hasIceTask: boolean
  /** When true the "who is working" picker is hidden because A and B are known. */
  employeesKnown: boolean
  canGenerate: boolean
  onGenerate: () => void
  onClose: () => void
  errorBanner: string | null
}

export function TaskSplitSetupModal(props: TaskSplitSetupModalProps) {
  const {
    open,
    windowLabel,
    empA,
    empB,
    onSetEmpA,
    onSetEmpB,
    allEmployees,
    iceSplit,
    onSetIceSplit,
    hasIceTask,
    employeesKnown,
    canGenerate,
    onGenerate,
    onClose,
    errorBanner,
  } = props

  const [pickSlot, setPickSlot] = useState<0 | 1 | null>(null)
  const startedOnBackdropRef = useRef(false)

  useEffect(() => {
    if (!open) setPickSlot(null)
  }, [open])

  if (!open) return null

  const cleanedEmployees = allEmployees.map((x) => String(x || '').trim()).filter(Boolean)

  return (
    <div
      className="modal-backdrop task-split-setup-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) startedOnBackdropRef.current = true
      }}
      onPointerUp={(e) => {
        if (e.target === e.currentTarget && startedOnBackdropRef.current) {
          startedOnBackdropRef.current = false
          onClose()
          return
        }
        startedOnBackdropRef.current = false
      }}
    >
      <div
        className="modal-sheet task-split-setup-sheet"
        role="dialog"
        aria-label={`Generate fair task split (${windowLabel})`}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <div className="task-split-setup__header">
          <div className="task-split-setup__title">Generate fair split</div>
          <div className="task-split-setup__sub">{windowLabel} window</div>
        </div>

        {errorBanner ? <div className="task-split-setup__error">{errorBanner}</div> : null}

        {!employeesKnown ? (
          <section className="task-split-setup__section">
            <div className="task-split-setup__label">Who is working?</div>
            <div className="task-split-setup__pick-row">
              <button
                type="button"
                className={`task-split-setup__pick-slot ${pickSlot === 0 ? 'is-active' : ''}`}
                onClick={() => setPickSlot(0)}
              >
                <span className="task-split-setup__pick-tag">A</span>
                <span className="task-split-setup__pick-name">{empA || 'Tap to pick'}</span>
              </button>
              <button
                type="button"
                className={`task-split-setup__pick-slot ${pickSlot === 1 ? 'is-active' : ''}`}
                onClick={() => setPickSlot(1)}
              >
                <span className="task-split-setup__pick-tag">B</span>
                <span className="task-split-setup__pick-name">{empB || 'Tap to pick'}</span>
              </button>
            </div>

            {pickSlot !== null ? (
              <div className="task-split-setup__picker" role="dialog" aria-label="Pick employee">
                <div className="task-split-setup__picker-title">Pick {pickSlot === 0 ? 'A' : 'B'}</div>
                <div className="task-split-setup__picker-list">
                  {cleanedEmployees.map((name) => {
                    const other = pickSlot === 0 ? empB : empA
                    const disabled = name === other
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`task-split-setup__picker-option ${disabled ? 'is-disabled' : ''}`}
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          if (pickSlot === 0) onSetEmpA(name)
                          else onSetEmpB(name)
                          setPickSlot(null)
                        }}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="task-split-setup__picker-cancel"
                  onClick={() => setPickSlot(null)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {hasIceTask ? (
          <section className="task-split-setup__section task-split-setup__section--ice">
            <div className="task-split-setup__ice-heading">Split Ice?</div>
            <div className="task-split-setup__choice-row">
              <button
                type="button"
                className={`task-split-setup__choice ${iceSplit ? 'is-active' : ''}`}
                onClick={() => onSetIceSplit(true)}
              >
                <span className="task-split-setup__choice-title">Split Ice</span>
              </button>
              <button
                type="button"
                className={`task-split-setup__choice ${!iceSplit ? 'is-active' : ''}`}
                onClick={() => onSetIceSplit(false)}
              >
                <span className="task-split-setup__choice-title">One Person</span>
              </button>
            </div>
          </section>
        ) : null}

        <div className="task-split-setup__actions">
          <button type="button" className="task-split-setup__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="task-split-setup__btn task-split-setup__btn--primary"
            disabled={!canGenerate}
            onClick={onGenerate}
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
