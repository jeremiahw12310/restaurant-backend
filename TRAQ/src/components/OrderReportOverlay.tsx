import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  open: boolean
  employees: [string, string]
  allEmployees?: string[]
  onChangeEmployees?: (employees: [string, string]) => void
  initialCounts?: Record<string, number>
  title?: string
  description?: string
  isSaving?: boolean
  error?: string | null
  onClose: () => void
  onSave: (counts: Record<string, number>, opts?: { clear?: boolean }) => void
  // Admin late forgiveness
  isAdmin?: boolean
  completedLate?: boolean
  lateForgiven?: boolean
  onToggleLateForgiven?: () => void
}

const digitsOnly = (s: string): string => s.replace(/[^\d]/g, '')

export const OrderReportOverlay = memo(function OrderReportOverlay({
  open,
  employees,
  allEmployees,
  onChangeEmployees,
  initialCounts,
  title = 'Order Report',
  description = 'Report the number of orders taken by each employee (as shown in KwickPOS UserReport).',
  isSaving,
  error,
  onClose,
  onSave,
  isAdmin,
  completedLate: _completedLate,
  lateForgiven,
  onToggleLateForgiven,
}: Props) {
  void _completedLate // Reserved for future use
  const lastTouchTsRef = useRef<number>(0)
  const recordTouch = useCallback(() => {
    lastTouchTsRef.current = Date.now()
  }, [])
  const shouldIgnoreClick = useCallback(() => {
    return Date.now() - lastTouchTsRef.current < 700
  }, [])

  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [draftByEmployee, setDraftByEmployee] = useState<Record<string, string>>({})
  const [clearAllArmed, setClearAllArmed] = useState(false)
  const [adminPickSlot, setAdminPickSlot] = useState<0 | 1 | null>(null)

  useEffect(() => {
    if (!open) return
    const [a, b] = employees
    const next: Record<string, string> = {}
    const ca = initialCounts?.[a]
    const cb = initialCounts?.[b]
    if (typeof ca === 'number' && Number.isFinite(ca) && ca >= 0) next[a] = String(Math.floor(ca))
    else next[a] = ''
    if (typeof cb === 'number' && Number.isFinite(cb) && cb >= 0) next[b] = String(Math.floor(cb))
    else next[b] = ''
    setDraftByEmployee(next)
    // Default focus to the first employee for fast entry
    setEditingEmployee(a || null)
    setClearAllArmed(false)
  }, [employees, initialCounts, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const [a, b] = employees
  const canAdminEditEmployees =
    !!isAdmin && typeof onChangeEmployees === 'function' && Array.isArray(allEmployees) && allEmployees.length > 0
  const aStr = draftByEmployee[a] ?? ''
  const bStr = draftByEmployee[b] ?? ''
  const canSave = useMemo(() => {
    const aa = digitsOnly(aStr)
    const bb = digitsOnly(bStr)
    if (!aa || !bb) return false
    const na = Number(aa)
    const nb = Number(bb)
    return Number.isFinite(na) && Number.isFinite(nb) && na >= 0 && nb >= 0
  }, [aStr, bStr])

  const clearAll = useCallback(() => {
    const [ea, eb] = employees
    // Set both to 0 so Save stays enabled; when clearAllArmed is true, Save will UNCOMPLETE (delete) the task.
    setDraftByEmployee({ [ea]: '0', [eb]: '0' })
    setEditingEmployee(ea || null)
    setClearAllArmed(true)
  }, [employees])

  const inputDigit = useCallback(
    (d: string) => {
      if (!editingEmployee) return
      setClearAllArmed(false)
      setDraftByEmployee((prev) => {
        const cur = digitsOnly(prev[editingEmployee] ?? '')
        const next = (cur + d).slice(0, 5)
        return { ...prev, [editingEmployee]: next }
      })
    },
    [editingEmployee]
  )

  const backspace = useCallback(() => {
    if (!editingEmployee) return
    setClearAllArmed(false)
    setDraftByEmployee((prev) => {
      const cur = digitsOnly(prev[editingEmployee] ?? '')
      const next = cur.length <= 1 ? '' : cur.slice(0, -1)
      return { ...prev, [editingEmployee]: next }
    })
  }, [editingEmployee])

  const clear = useCallback(() => {
    if (!editingEmployee) return
    setClearAllArmed(false)
    setDraftByEmployee((prev) => ({ ...prev, [editingEmployee]: '' }))
  }, [editingEmployee])

  const submit = useCallback(() => {
    const aa = digitsOnly(draftByEmployee[a] ?? '')
    const bb = digitsOnly(draftByEmployee[b] ?? '')
    if (!aa || !bb) return
    const na = Number(aa)
    const nb = Number(bb)
    if (!Number.isFinite(na) || !Number.isFinite(nb) || na < 0 || nb < 0) return
    onSave({ [a]: Math.floor(na), [b]: Math.floor(nb) }, { clear: clearAllArmed })
  }, [a, b, clearAllArmed, draftByEmployee, onSave])

  if (!open) return null

  return (
    <div
      className="calc-backdrop"
      onTouchStart={(e) => {
        recordTouch()
        e.preventDefault()
      }}
      onTouchEnd={(e) => {
        recordTouch()
        e.preventDefault()
        onClose()
      }}
      onClick={() => {
        if (shouldIgnoreClick()) return
        onClose()
      }}
    >
      <div
        className="calc-card order-report-card"
        data-task-transition-target="order-report"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="calc-header">
          <div className="calc-title">{title}</div>
          <button
            className="calc-close"
            type="button"
            aria-label="Close"
            onTouchStart={(e) => {
              recordTouch()
              e.stopPropagation()
            }}
            onTouchEnd={(e) => {
              recordTouch()
              e.stopPropagation()
              onClose()
            }}
            onClick={() => {
              if (shouldIgnoreClick()) return
              onClose()
            }}
          >
            ✕
          </button>
        </div>

        <div className="order-report-body">
          <div className="order-report-desc">{description}</div>

          <div className="order-report-two-col" aria-label="Order report entry">
            <div className="order-report-left">
              {canAdminEditEmployees ? (
                <div className="order-report-employee-picker" aria-label="Order report employees (admin)">
                  <div className="order-report-employee-picker-title">Employees (admin)</div>
                  <div className="order-report-employee-picker-row">
                    <button
                      className="order-report-employee-picker-btn"
                      type="button"
                      onClick={() => setAdminPickSlot(0)}
                      disabled={!!isSaving}
                    >
                      A: {a || '—'}
                    </button>
                    <button
                      className="order-report-employee-picker-btn"
                      type="button"
                      onClick={() => setAdminPickSlot(1)}
                      disabled={!!isSaving}
                    >
                      B: {b || '—'}
                    </button>
                  </div>

                  {adminPickSlot !== null ? (
                    <div className="order-report-employee-picker-panel" role="dialog" aria-label="Pick employee">
                      <div className="order-report-employee-picker-panel-title">
                        Pick {adminPickSlot === 0 ? 'A' : 'B'}
                      </div>
                      <div className="order-report-employee-picker-list">
                        {allEmployees
                          .map((x) => String(x || '').trim())
                          .filter(Boolean)
                          .map((name) => {
                            const other = adminPickSlot === 0 ? b : a
                            const disabled = name === other
                            return (
                              <button
                                key={name}
                                className={`order-report-employee-option ${disabled ? 'disabled' : ''}`}
                                type="button"
                                disabled={disabled || !!isSaving}
                                onClick={() => {
                                  const next: [string, string] = adminPickSlot === 0 ? [name, b] : [a, name]
                                  if (!next[0] || !next[1] || next[0] === next[1]) return
                                  onChangeEmployees?.(next)
                                  setAdminPickSlot(null)
                                }}
                              >
                                {name}
                              </button>
                            )
                          })}
                      </div>
                      <button
                        className="order-report-employee-picker-cancel"
                        type="button"
                        onClick={() => setAdminPickSlot(null)}
                        disabled={!!isSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                className={`order-report-emp-card ${editingEmployee === a ? 'active' : ''}`}
                type="button"
                onTouchStart={recordTouch}
                onClick={() => setEditingEmployee(a)}
              >
                <div className="order-report-name">{a}</div>
                <div className="order-report-value">{aStr ? aStr : '0'}</div>
                <div className="order-report-hint">Tap to edit</div>
              </button>

              <button
                className={`order-report-emp-card ${editingEmployee === b ? 'active' : ''}`}
                type="button"
                onTouchStart={recordTouch}
                onClick={() => setEditingEmployee(b)}
              >
                <div className="order-report-name">{b}</div>
                <div className="order-report-value">{bStr ? bStr : '0'}</div>
                <div className="order-report-hint">Tap to edit</div>
              </button>

              {typeof error === 'string' && error.trim() ? (
                <div className="order-report-error" role="status" aria-live="polite">
                  {error}
                </div>
              ) : null}

              {isAdmin && (
                <div className="order-report-admin-actions">
                  <button
                    className={`admin-action-btn ${lateForgiven ? 'active' : ''}`}
                    type="button"
                    onClick={onToggleLateForgiven}
                  >
                    {lateForgiven
                      ? '✓ Late forgiven (counts for points)'
                      : 'Forgive late (allow points)'}
                  </button>
                </div>
              )}

              <div className="order-report-actions">
                <button className="order-report-clearall" type="button" onClick={clearAll} disabled={!!isSaving}>
                  Clear all
                </button>
                <button className="order-report-cancel" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="order-report-save calc-key calc-key-eq"
                  type="button"
                  disabled={!canSave || !!isSaving}
                  onClick={submit}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="order-report-right">
              <div className="calc-display order-report-entry-display" aria-label="Entered orders">
                {editingEmployee ? (draftByEmployee[editingEmployee] ? draftByEmployee[editingEmployee] : '0') : '0'}
              </div>

              <div className="order-report-keypad" aria-label="Order report keypad">
                <button className="calc-key" type="button" onClick={() => inputDigit('7')}>
                  7
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('8')}>
                  8
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('9')}>
                  9
                </button>

                <button className="calc-key" type="button" onClick={() => inputDigit('4')}>
                  4
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('5')}>
                  5
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('6')}>
                  6
                </button>

                <button className="calc-key" type="button" onClick={() => inputDigit('1')}>
                  1
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('2')}>
                  2
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('3')}>
                  3
                </button>

                <button className="calc-key calc-key-fn" type="button" onClick={clear} disabled={!editingEmployee}>
                  C
                </button>
                <button className="calc-key" type="button" onClick={() => inputDigit('0')}>
                  0
                </button>
                <button
                  className="calc-key calc-key-fn"
                  type="button"
                  onClick={backspace}
                  aria-label="Backspace"
                  disabled={!editingEmployee}
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})


