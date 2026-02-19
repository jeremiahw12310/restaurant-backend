import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Mode = 'calc' | 'tip'

type Props = {
  open: boolean
  onClose: () => void
}

type HistoryRow = {
  ts: string
  expr: string
  result: string
}

const LS_CALC_HISTORY_KEY = 'traq-calc-history-v1'

const safeParseNumber = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return n
}

const formatTipDisplay = (digits: string): string => {
  const cents = parseInt(digits || '0', 10)
  return (cents / 100).toFixed(2)
}

const fmt = (n: number): string => {
  // keep up to 2 decimals, but avoid trailing zeros when possible
  const fixed = n.toFixed(2)
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

const opSymbol = (o: '+' | '-' | '*' | '/' | null): string => {
  if (!o) return ''
  if (o === '/') return '÷'
  if (o === '*') return '×'
  if (o === '-') return '−'
  return '+'
}

const readHistory = (): HistoryRow[] => {
  try {
    const raw = localStorage.getItem(LS_CALC_HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HistoryRow[]
  } catch {
    return []
  }
}

const saveHistory = (rows: HistoryRow[]) => {
  try {
    localStorage.setItem(LS_CALC_HISTORY_KEY, JSON.stringify(rows))
  } catch {
    // ignore
  }
}

export const CalculatorOverlay = memo(function CalculatorOverlay({ open, onClose }: Props) {
  const lastTouchTsRef = useRef<number>(0)

  const [mode, setMode] = useState<Mode>('tip')

  // Tip calc input
  const [tipInput, setTipInput] = useState('')

  // Calculator state (simple immediate-exec)
  const [display, setDisplay] = useState('0')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<'+' | '-' | '*' | '/' | null>(null)
  const [awaiting, setAwaiting] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>(() => readHistory())

  const recordTouch = useCallback(() => {
    lastTouchTsRef.current = Date.now()
  }, [])

  const shouldIgnoreClick = useCallback(() => {
    return Date.now() - lastTouchTsRef.current < 700
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    saveHistory(history)
  }, [history])

  const clearCalc = useCallback(() => {
    setDisplay('0')
    setAcc(null)
    setOp(null)
    setAwaiting(false)
  }, [])

  const backspace = useCallback(() => {
    setDisplay((prev) => {
      if (awaiting) return '0'
      if (prev.length <= 1) return '0'
      const next = prev.slice(0, -1)
      return next === '-' ? '0' : next
    })
  }, [awaiting])

  const inputDigit = useCallback(
    (d: string) => {
      setDisplay((prev) => {
        if (awaiting) {
          setAwaiting(false)
          return d
        }
        if (prev === '0') return d
        if (prev === '-0') return '-' + d
        return prev + d
      })
    },
    [awaiting]
  )

  const inputDot = useCallback(() => {
    setDisplay((prev) => {
      if (awaiting) {
        setAwaiting(false)
        return '0.'
      }
      if (prev.includes('.')) return prev
      return prev + '.'
    })
  }, [awaiting])

  const compute = useCallback((a: number, b: number, o: '+' | '-' | '*' | '/'): number => {
    if (o === '+') return a + b
    if (o === '-') return a - b
    if (o === '*') return a * b
    // '/'
    return b === 0 ? NaN : a / b
  }, [])

  const applyOp = useCallback(
    (nextOp: '+' | '-' | '*' | '/') => {
      const curr = safeParseNumber(display) ?? 0

      if (acc === null) {
        setAcc(curr)
        setOp(nextOp)
        setAwaiting(true)
        return
      }

      if (op === null) {
        setAcc(curr)
        setOp(nextOp)
        setAwaiting(true)
        return
      }

      const out = compute(acc, curr, op)
      const outStr = Number.isFinite(out) ? fmt(out) : 'Error'
      setDisplay(outStr)
      setAcc(Number.isFinite(out) ? out : null)
      setOp(nextOp)
      setAwaiting(true)
    },
    [acc, compute, display, op]
  )

  const equals = useCallback(() => {
    if (acc === null || op === null) return
    const curr = safeParseNumber(display) ?? 0
    const out = compute(acc, curr, op)
    const outStr = Number.isFinite(out) ? fmt(out) : 'Error'

    const expr = `${fmt(acc)} ${opSymbol(op)} ${fmt(curr)}`
    const row: HistoryRow = { ts: new Date().toISOString(), expr, result: outStr }
    setHistory((prev) => {
      const next = [row, ...prev]
      if (next.length > 50) next.length = 50
      return next
    })

    setDisplay(outStr)
    setAcc(null)
    setOp(null)
    setAwaiting(true)
  }, [acc, compute, display, op])

  const liveExpression = useMemo(() => {
    if (acc === null || op === null) return ''
    const left = fmt(acc)
    const sym = opSymbol(op)
    if (awaiting) return `${left} ${sym}`
    // show the current right-hand side while typing
    const rhs = safeParseNumber(display)
    const right = rhs === null ? display : fmt(rhs)
    return `${left} ${sym} ${right}`
  }, [acc, awaiting, display, op])

  const tip = useMemo(() => {
    const cents = parseInt(tipInput || '0', 10)
    if (cents === 0) return null
    const total = cents / 100
    return { total, half: total / 2 }
  }, [tipInput])

  const tipClear = useCallback(() => setTipInput(''), [])
  const tipBackspace = useCallback(() => {
    setTipInput((prev) => prev.slice(0, -1))
  }, [])
  const tipDigit = useCallback((d: string) => {
    setTipInput((prev) => {
      const next = prev + d
      // Max 5 digits for $999.99
      if (next.length > 5) return prev
      // Remove leading zeros
      return next.replace(/^0+/, '') || ''
    })
  }, [])

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
        className="calc-card"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="calc-header">
          <div className="calc-title">Calculator</div>
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

        {mode === 'tip' ? (
          <div className="calc-body calc-body-tip">
            <div className="tip-left">
              <div className="tip-display" aria-label="Tip amount">
                <div className="tip-label">Amount</div>
                <div className="tip-amount" aria-label="Entered amount">
                  {formatTipDisplay(tipInput)}
                </div>
                <div className="tip-hint">Use the keypad to enter the amount.</div>
              </div>

              <div className="tip-result">
                <div className="tip-math">
                  {tipInput ? formatTipDisplay(tipInput) : '___'} ÷ 2 = {tip ? fmt(tip.half) : '___'}
                </div>
                <div className="tip-each">{tip ? `${fmt(tip.half)} each` : '___ each'}</div>
              </div>
            </div>

            <div className="tip-grid" aria-label="Tip keypad">
              <button className="calc-key" type="button" onClick={() => tipDigit('7')}>
                7
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('8')}>
                8
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('9')}>
                9
              </button>

              <button className="calc-key" type="button" onClick={() => tipDigit('4')}>
                4
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('5')}>
                5
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('6')}>
                6
              </button>

              <button className="calc-key" type="button" onClick={() => tipDigit('1')}>
                1
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('2')}>
                2
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('3')}>
                3
              </button>

              <button className="calc-key calc-key-fn" type="button" onClick={tipClear}>
                C
              </button>
              <button className="calc-key" type="button" onClick={() => tipDigit('0')}>
                0
              </button>
              <button className="calc-key calc-key-fn" type="button" onClick={tipBackspace} aria-label="Backspace">
                ⌫
              </button>
            </div>
          </div>
        ) : (
          <div className="calc-body calc-body-calc">
            <div className="calc-left">
              <div className="calc-expression" aria-label="Current expression">
                {liveExpression}
              </div>
              <div className="calc-display" aria-label="Calculator display">
                {display}
              </div>

              <div className="calc-grid" aria-label="Calculator keypad">
                {/* Row 1 */}
                <button className="calc-key" onClick={() => inputDigit('7')} type="button">
                  7
                </button>
                <button className="calc-key" onClick={() => inputDigit('8')} type="button">
                  8
                </button>
                <button className="calc-key" onClick={() => inputDigit('9')} type="button">
                  9
                </button>
                <button className="calc-key calc-key-op" onClick={() => applyOp('/')} type="button">
                  ÷
                </button>

                {/* Row 2 */}
                <button className="calc-key" onClick={() => inputDigit('4')} type="button">
                  4
                </button>
                <button className="calc-key" onClick={() => inputDigit('5')} type="button">
                  5
                </button>
                <button className="calc-key" onClick={() => inputDigit('6')} type="button">
                  6
                </button>
                <button className="calc-key calc-key-op" onClick={() => applyOp('*')} type="button">
                  ×
                </button>

                {/* Row 3 */}
                <button className="calc-key" onClick={() => inputDigit('1')} type="button">
                  1
                </button>
                <button className="calc-key" onClick={() => inputDigit('2')} type="button">
                  2
                </button>
                <button className="calc-key" onClick={() => inputDigit('3')} type="button">
                  3
                </button>
                <button className="calc-key calc-key-op" onClick={() => applyOp('-')} type="button">
                  −
                </button>

                {/* Row 4 */}
                <button className="calc-key calc-key-fn" onClick={clearCalc} type="button">
                  C
                </button>
                <button className="calc-key" onClick={() => inputDigit('0')} type="button">
                  0
                </button>
                <button className="calc-key calc-key-fn" onClick={backspace} type="button" aria-label="Backspace">
                  ⌫
                </button>
                <button className="calc-key calc-key-op" onClick={() => applyOp('+')} type="button">
                  +
                </button>

                {/* Row 5 */}
                <button className="calc-key calc-key-fn" onClick={inputDot} type="button">
                  .
                </button>
                <button className="calc-key calc-key-eq calc-key-eq-wide" onClick={equals} type="button">
                  =
                </button>
              </div>
            </div>

            <div className="calc-history" aria-label="Calculator history">
              <div className="calc-history-title">History</div>
              {history.length === 0 ? (
                <div className="calc-history-empty">No history yet.</div>
              ) : (
                history.slice(0, 6).map((h) => (
                  <div key={h.ts + h.expr} className="calc-history-row">
                    <div className="calc-history-expr">{h.expr}</div>
                    <div className="calc-history-res">= {h.result}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="calc-footer">
          <button
            className={`calc-mode ${mode === 'calc' ? 'active' : ''}`}
            type="button"
            onClick={() => setMode('calc')}
          >
            Calculator
          </button>
          <button
            className={`calc-mode ${mode === 'tip' ? 'active' : ''}`}
            type="button"
            onClick={() => setMode('tip')}
          >
            Tip calculator
          </button>
        </div>
      </div>
    </div>
  )
})

