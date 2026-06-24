import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import aiEngineLogoUrl from '../assets/TRAQ.png'

export type WindowCompleteCelebrationPhase = 'idle' | 'evacuate' | 'headline' | 'boardIn' | 'settle' | 'done'

export type WindowCompleteCelebrationPlayer = {
  name: string
  color?: string
  score: number
  tiles: Array<{
    taskId: string
    icon: string
    taskName?: string
  }>
  isWinner: boolean
}

export type WindowCompleteCelebrationViewModel = {
  windowLabel: string
  headline: string
  phase: WindowCompleteCelebrationPhase
  players: WindowCompleteCelebrationPlayer[]
  /** Default `pair`: two columns. `solo`: one-person shift layout. */
  layout?: 'pair' | 'solo'
  /** AI celebration blurb (typed in after generation). */
  completionMessage?: string | null
  /** Secret training mode: shows a fixed "50 points for everyone" screen for up to 4 players. */
  trainingShift?: boolean
}

type WindowCompleteCelebrationProps = {
  celebration: WindowCompleteCelebrationViewModel
  onTileClick?: (taskId: string) => void
  /** Fires once per completion string when the AI message has finished typing (or immediately under reduced motion). */
  onCompletionTypingFinished?: () => void
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function WindowCompleteAiPill(props: { pending?: boolean }) {
  const { pending } = props
  return (
    <span className="window-complete-cinematic__completion-pill">
      <span
        className={`ai-engine-badge ai-engine-badge--window-complete${pending ? ' ai-engine-badge--window-complete--pending' : ''}`}
        aria-label={pending ? undefined : 'AI Engine'}
        aria-hidden={pending ? true : undefined}
      >
        <img className="ai-engine-badge__logo" src={aiEngineLogoUrl} alt="" aria-hidden="true" />
        <span className="ai-engine-badge__pill">AI Engine</span>
      </span>
    </span>
  )
}

const MAX_COMPLETION_BLOCK_VH = 0.38
const MIN_SHRINK_DELTA = 6

/** One typing tick: wait `delayMs`, then reveal `advance` characters. */
type TypingTick = { delayMs: number; advance: number }

function burstPairOk(full: string, i: number): boolean {
  const a = full[i]
  const b = full[i + 1]
  if (a === undefined || b === undefined) return false
  if (a === ' ' || b === ' ' || a === '\n' || b === '\n' || a === '\r' || b === '\r') return false
  const wordish = (c: string) => /[A-Za-z0-9]/.test(c)
  return wordish(a) && wordish(b)
}

function buildTypingSchedule(full: string): TypingTick[] {
  const ticks: TypingTick[] = []
  const n = full.length
  let i = 0
  while (i < n) {
    let advance = 1
    if (i + 1 < n && Math.random() < 0.11 && burstPairOk(full, i)) {
      advance = 2
    }

    const prev = i > 0 ? full[i - 1] : null
    let delayMs = 16 + Math.floor(Math.random() * 24)
    if (prev === null) {
      delayMs += 28 + Math.floor(Math.random() * 55)
    } else if (/[.!?]/.test(prev)) {
      delayMs += 75 + Math.floor(Math.random() * 110)
    } else if (prev === '\n') {
      delayMs += 85 + Math.floor(Math.random() * 120)
    } else if (/[;,]/.test(prev)) {
      delayMs += 32 + Math.floor(Math.random() * 52)
    } else if (prev === ' ') {
      delayMs += 10 + Math.floor(Math.random() * 34)
    }

    if (n > 120) delayMs = Math.floor(delayMs * 0.84)
    if (n > 200) delayMs = Math.floor(delayMs * 0.88)
    delayMs = Math.min(240, Math.max(7, delayMs))

    ticks.push({ delayMs, advance })
    i += advance
  }

  const total = ticks.reduce((s, t) => s + t.delayMs, 0)
  const maxTotal = n > 160 ? 32_000 : n > 90 ? 38_000 : 48_000
  if (total > maxTotal && total > 0) {
    const factor = maxTotal / total
    return ticks.map((t) => ({
      advance: t.advance,
      delayMs: Math.max(7, Math.floor(t.delayMs * factor)),
    }))
  }
  return ticks
}

export function WindowCompleteCelebration({
  celebration,
  onTileClick,
  onCompletionTypingFinished,
}: WindowCompleteCelebrationProps) {
  const layout = celebration.layout ?? 'pair'
  const training = celebration.trainingShift === true
  const p1 = celebration.players[0]
  const p2 = celebration.players[1]
  const solo = layout === 'solo' && celebration.players.length >= 1
  // Training mode shows every participant (capped at 4); otherwise solo=1, pair=2.
  const displayPlayers = training
    ? celebration.players.slice(0, 4)
    : solo
      ? [p1]
      : [p1, p2]
  const reducedMotion = usePrefersReducedMotion()

  const full = useMemo(() => celebration.completionMessage?.trim() ?? '', [celebration.completionMessage])
  const typingSchedule = useMemo(
    () => (full.length > 0 && !reducedMotion ? buildTypingSchedule(full) : []),
    [full, reducedMotion],
  )
  const [typedLen, setTypedLen] = useState(0)

  const outerRef = useRef<HTMLDivElement>(null)
  const measureInnerRef = useRef<HTMLDivElement>(null)
  const visibleInnerRef = useRef<HTMLDivElement>(null)

  const reservedPxRef = useRef(0)
  const shrinkSettledForFullRef = useRef<string | null>(null)
  const shrinkAttemptedForFullRef = useRef<string | null>(null)
  const [lineMinPx, setLineMinPx] = useState<number | null>(null)
  const [shrinkTransition, setShrinkTransition] = useState(false)
  const shrinkTransitionRef = useRef(false)
  useLayoutEffect(() => {
    shrinkTransitionRef.current = shrinkTransition
  }, [shrinkTransition])

  /** Mirror full text + pill (no cursor, pill fully opaque) for reserved height. */
  useLayoutEffect(() => {
    shrinkSettledForFullRef.current = null
    shrinkAttemptedForFullRef.current = null
    if (!full) {
      reservedPxRef.current = 0
      setLineMinPx(null)
      setShrinkTransition(false)
      return
    }
    const outer = outerRef.current
    const inner = measureInnerRef.current
    if (!outer || !inner) return
    const w = outer.clientWidth
    inner.style.width = w > 0 ? `${w}px` : '100%'
    const raw = inner.offsetHeight
    const vhCap =
      typeof window !== 'undefined' ? Math.round(window.innerHeight * MAX_COMPLETION_BLOCK_VH) : 400
    const capped = Math.min(Math.max(raw, 44), vhCap)
    reservedPxRef.current = capped
    setLineMinPx(capped)
    setShrinkTransition(false)
  }, [full])

  useEffect(() => {
    if (!full) {
      setTypedLen(0)
      return
    }
    if (reducedMotion) {
      setTypedLen(full.length)
      return
    }
    setTypedLen(0)
    const ticks = typingSchedule
    if (ticks.length === 0) {
      setTypedLen(full.length)
      return
    }
    let cancelled = false
    let pos = 0
    let idx = 0
    const tidRef = { current: null as number | null }

    const step = () => {
      if (cancelled || idx >= ticks.length) return
      const { delayMs, advance } = ticks[idx]
      tidRef.current = window.setTimeout(() => {
        if (cancelled) return
        pos = Math.min(pos + advance, full.length)
        setTypedLen(pos)
        idx += 1
        tidRef.current = null
        if (pos < full.length) step()
      }, delayMs)
    }
    step()

    return () => {
      cancelled = true
      if (tidRef.current !== null) {
        window.clearTimeout(tidRef.current)
        tidRef.current = null
      }
    }
  }, [full, reducedMotion, typingSchedule])

  const typing = full.length > 0 && typedLen < full.length

  const typingFinishedFullRef = useRef<string | null>(null)
  useEffect(() => {
    typingFinishedFullRef.current = null
  }, [full])

  useEffect(() => {
    if (full.length === 0) return
    if (typedLen < full.length) return
    if (typingFinishedFullRef.current === full) return
    typingFinishedFullRef.current = full
    onCompletionTypingFinished?.()
  }, [full, typedLen, onCompletionTypingFinished])

  /** After typing: ease min-height down if we over-reserved (e.g. vh cap). */
  useLayoutEffect(() => {
    if (!full || typedLen < full.length) return
    if (shrinkSettledForFullRef.current === full) return
    if (shrinkAttemptedForFullRef.current === full) return
    if (reducedMotion) {
      shrinkSettledForFullRef.current = full
      shrinkAttemptedForFullRef.current = full
      setLineMinPx(null)
      setShrinkTransition(false)
      return
    }
    const vis = visibleInnerRef.current
    const reserved = reservedPxRef.current
    if (!vis || !reserved) {
      shrinkSettledForFullRef.current = full
      shrinkAttemptedForFullRef.current = full
      setLineMinPx(null)
      return
    }
    const natural = Math.ceil(vis.getBoundingClientRect().height)
    if (natural >= reserved - MIN_SHRINK_DELTA) {
      shrinkSettledForFullRef.current = full
      shrinkAttemptedForFullRef.current = full
      setLineMinPx(null)
      setShrinkTransition(false)
      return
    }
    setShrinkTransition(true)
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        shrinkAttemptedForFullRef.current = full
        setLineMinPx(natural)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      shrinkAttemptedForFullRef.current = null
    }
  }, [full, typedLen, reducedMotion])

  const onMinHeightTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== 'min-height') return
      if (!shrinkTransitionRef.current) return
      shrinkSettledForFullRef.current = full
      shrinkTransitionRef.current = false
      setShrinkTransition(false)
      setLineMinPx(null)
    },
    [full],
  )

  return (
    <div
      className={`window-complete-cinematic window-complete-phase-${celebration.phase}${
        solo ? ' window-complete-cinematic--solo' : ''
      }${training ? ' window-complete-cinematic--training' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Window complete celebration"
    >
      <div className="window-complete-cinematic__card">
        <div className="window-complete-cinematic__headline">{celebration.headline}</div>

        {training ? (
          <div className="window-complete-cinematic__training-subhead">
            All users were given 50 points
          </div>
        ) : (
        <div
          ref={outerRef}
          className={`window-complete-cinematic__sub window-complete-cinematic__sub--completion-outer${
            shrinkTransition ? ' window-complete-cinematic__sub--completion-outer--shrink' : ''
          }`}
          style={lineMinPx != null ? { minHeight: lineMinPx } : undefined}
          onTransitionEnd={onMinHeightTransitionEnd}
        >
          <div className="window-complete-cinematic__completion-measure-host" aria-hidden>
            <div ref={measureInnerRef} className="window-complete-cinematic__completion-measure-inner">
              <span className="window-complete-cinematic__completion-inline">
                <span className="window-complete-cinematic__typed">{full}</span>
                <WindowCompleteAiPill pending={false} />
              </span>
            </div>
          </div>

          <div ref={visibleInnerRef} className="window-complete-cinematic__completion-visible">
            {!full ? (
              <span className="window-complete-cinematic__cursor window-complete-cinematic__cursor--solo" aria-hidden="true" />
            ) : (
              <span className="window-complete-cinematic__completion-inline">
                <span className="window-complete-cinematic__typed">{full.slice(0, typedLen)}</span>
                {typing ? (
                  <span className="window-complete-cinematic__cursor window-complete-cinematic__cursor--inline" aria-hidden="true" />
                ) : null}
                <WindowCompleteAiPill pending={typing} />
              </span>
            )}
          </div>
        </div>
        )}

        <div className="window-complete-cinematic__players" role="group" aria-label="Players">
          {displayPlayers.map((player, idx) => (
            <div key={`${player?.name || 'empty'}-${idx}`} className="window-complete-cinematic__player">
              <div className="window-complete-cinematic__player-name">
                {player?.name || '—'} {player?.isWinner ? <span className="window-complete-cinematic__crown">👑</span> : null}
              </div>
              <div className="window-complete-cinematic__player-score">{Number.isFinite(player?.score) ? player.score : 0} pts</div>
            </div>
          ))}
        </div>

        <div className="window-complete-cinematic__boards" role="group" aria-label="Completed task icons by player">
          {displayPlayers.map((player, idx) => (
            <div key={`${player?.name || 'board'}-${idx}`} className="window-complete-cinematic__board">
              <div className="window-complete-cinematic__tiles">
                {(player?.tiles || []).map((tile, tileIdx) => (
                  <button
                    type="button"
                    key={`${player?.name || 'tile'}-${tile.taskId}-${tileIdx}`}
                    className="window-complete-cinematic__tile"
                    style={player?.color ? ({ ['--tileColor' as any]: player.color } as CSSProperties) : undefined}
                    aria-label={tile.taskName ? `Open task ${tile.taskName}` : 'Open completed task'}
                    onClick={() => onTileClick?.(tile.taskId)}
                  >
                    {tile.icon}
                  </button>
                ))}
                {(!player?.tiles || player.tiles.length === 0) && (
                  <span className="window-complete-cinematic__empty">No task icons</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
