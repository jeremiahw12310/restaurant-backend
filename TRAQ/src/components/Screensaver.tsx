import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import traqLogoUrl from '../assets/tasklogo.png'
import aiEngineLogoUrl from '../assets/TRAQ.png'
import { getMusicScreensaverUi, subscribeMusicScreensaverUi } from '../musicScreensaverBridge.ts'
import type { TimeOfDay } from '../solarTimeOfDay.ts'

/** Mirrors tasks-row break / shift countdown; parent supplies live remaining ms. */
export type ScreensaverCountdown =
  | { kind: 'break'; remainingMs: number; employee: string }
  | { kind: 'shift'; remainingMs: number }

export type ScreensaverProps = {
  visible: boolean
  onDismiss: () => void
  timeOfDay: TimeOfDay
  /** Time-of-day hello (e.g. Good afternoon). Omitted when null and no quote. */
  greetingHeadline: string | null
  /** Motivational line; paired with headline when both set. */
  greetingQuote: string | null
  /** Show TRAQ + AI Engine badge inline after the quote (screensaver), not on the headline row. */
  greetingQuoteShowAiBadge: boolean
  /** Non-AI speaker quote: quote on top (with quotation marks), "- Name" row below; AI uses team layout. */
  greetingAttributionBelowQuote?: boolean
  /** Same logic as dash greeting: break takes priority over shift; no greeting block when set. */
  countdown: ScreensaverCountdown | null
  /** Suggested task shown in the center during valid suggestion windows. */
  suggestedTask: {
    id: string
    icon: string
    name: string
  } | null
  /** Today's task completion for the live clock window (not selected calendar window). */
  shiftProgress: { resolved: number; total: number; percent: number }
  /** Same gradient as main shift / task progress bar. */
  progressGradient: string | null
}

/** 30s suggested task (replaces quote), then 60s quote-only before next task slot. */
const SUGGESTED_TASK_SLOT_MS = 30_000
const SUGGESTED_TASK_CYCLE_MS = 90_000

function formatCountdownMmSs(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Full-viewport idle overlay: clock, date, optional break/shift countdown or greeting. Tap anywhere to dismiss.
 * Does not touch audio / MusicPlayer — visual only.
 */
export function Screensaver({
  visible,
  onDismiss,
  timeOfDay,
  greetingHeadline,
  greetingQuote,
  greetingQuoteShowAiBadge,
  greetingAttributionBelowQuote = false,
  countdown,
  suggestedTask,
  shiftProgress,
  progressGradient,
}: ScreensaverProps) {
  const [now, setNow] = useState(() => new Date())
  const [musicUi, setMusicUi] = useState(() => getMusicScreensaverUi())
  /** When screensaver opens, start the 30s task / 60s quote cycle from this instant. */
  const suggestedSlotAnchorRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!visible) {
      suggestedSlotAnchorRef.current = null
      return
    }
    suggestedSlotAnchorRef.current = Date.now()
    setNow(new Date())
  }, [visible])

  useEffect(() => {
    if (!visible) return
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    setMusicUi(getMusicScreensaverUi())
    return subscribeMusicScreensaverUi(setMusicUi)
  }, [visible])

  if (!visible) return null

  const hours = now.getHours()
  const h12 = hours % 12 || 12
  const mm = now.getMinutes().toString().padStart(2, '0')
  const ss = now.getSeconds().toString().padStart(2, '0')
  const sec = now.getSeconds()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const isBuffering = !!musicUi.statusLine && musicUi.statusLine.startsWith('Buffering')
  const { resolved, total, percent } = shiftProgress
  const progressNumbersStyle = progressGradient
    ? ({
        background: progressGradient,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      } as CSSProperties)
    : undefined

  const anchorMs = suggestedSlotAnchorRef.current
  const phaseBase = anchorMs ?? now.getTime()
  const phaseMs = (now.getTime() - phaseBase) % SUGGESTED_TASK_CYCLE_MS
  const inSuggestedTaskPhase =
    !countdown && !!suggestedTask && phaseMs < SUGGESTED_TASK_SLOT_MS
  const showQuoteRow = Boolean(greetingQuote?.trim()) && !inSuggestedTaskPhase

  const showGreetingStack =
    !countdown &&
    (Boolean(greetingHeadline?.trim()) || Boolean(greetingQuote?.trim()) || (inSuggestedTaskPhase && !!suggestedTask))
  /** Curated speaker lines: wrap quote in “ ” and prefix name with "- " */
  const speakerAttributionFormat =
    greetingAttributionBelowQuote && !greetingQuoteShowAiBadge && Boolean(greetingHeadline?.trim())

  const suggestedTaskCard =
    inSuggestedTaskPhase && suggestedTask ? (
      <div
        className="screensaver__suggested-task screensaver__suggested-task--in-greeting"
        aria-live="polite"
      >
        <div className="screensaver__suggested-task-kicker">Suggested task</div>
        <div className="screensaver__suggested-task-body">
          <span className="screensaver__suggested-task-icon" aria-hidden="true">
            {suggestedTask.icon}
          </span>
          <span className="screensaver__suggested-task-name">{suggestedTask.name}</span>
        </div>
      </div>
    ) : null

  return (
    <div
      className={`screensaver screensaver--time-${timeOfDay}`}
      role="dialog"
      aria-modal="true"
      aria-label="Screensaver, tap anywhere to return"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.cancelable) e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e) => {
        if (!e.isPrimary) return
        e.stopPropagation()
        e.preventDefault()
        const el = e.currentTarget as HTMLElement
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        onDismiss()
      }}
      onPointerCancel={(e) => {
        try {
          ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <div className="screensaver__orbs" aria-hidden="true">
        <span className="screensaver__orb screensaver__orb--a" />
        <span className="screensaver__orb screensaver__orb--b" />
        <span className="screensaver__orb screensaver__orb--c" />
      </div>
      <div className="screensaver__brand-row" aria-hidden="true">
        <img className="screensaver__brand-logo" src={traqLogoUrl} alt="" loading="lazy" />
      </div>
      <div className="screensaver__now-playing-pill screensaver__now-playing-pill--top-right" aria-live="polite">
        <span className="screensaver__now-playing-pill-label">Now playing</span>
        <span className="screensaver__now-playing-pill-title">{musicUi.primaryLine || '—'}</span>
        {isBuffering ? (
          <span className="screensaver__now-playing-pill-refresh" aria-hidden="true" title="Buffering">
            ↻
          </span>
        ) : null}
      </div>
      <div className="screensaver__inner">
        <div className="screensaver__center">
          <div className="screensaver__clock" aria-live="polite">
            <span className="screensaver__clock-digits">
              {h12}
              <span className={`screensaver__clock-colon ${sec % 2 === 0 ? '' : 'screensaver__clock-colon--dim'}`}>:</span>
              {mm}
              <span className="screensaver__clock-colon">:</span>
              {ss}
            </span>
            <span className="screensaver__clock-ampm">{ampm}</span>
          </div>
          <div className="screensaver__date">{dateStr}</div>
          {countdown ? (
            <div className="screensaver__countdown" aria-live="polite">
              <div className="screensaver__countdown-time">
                {countdown.kind === 'break' ? '☕' : '⏰'} {formatCountdownMmSs(countdown.remainingMs)}
              </div>
              <div className="screensaver__countdown-label">
                {countdown.kind === 'break'
                  ? `until ${countdown.employee}'s break`
                  : 'until shift change'}
              </div>
            </div>
          ) : showGreetingStack ? (
            <div
              className={`screensaver__greeting-stack${
                greetingAttributionBelowQuote ? ' screensaver__greeting-stack--attributed-below' : ''
              }`}
            >
              {greetingAttributionBelowQuote ? (
                <>
                  {showQuoteRow ? (
                    <div
                      className="screensaver__greeting screensaver__greeting--quote screensaver__greeting--quote-attributed-lead screensaver__greeting--quote-line"
                      role="docsubtitle"
                    >
                      <span className="screensaver__quote-inline-host">
                        <span className="screensaver__quote-inline-text">
                          {speakerAttributionFormat
                            ? `\u201C${greetingQuote}\u201D`
                            : greetingQuote}
                        </span>
                        {greetingQuoteShowAiBadge ? (
                          <span className="ai-engine-badge ai-engine-badge--screensaver" aria-label="AI Engine">
                            <img className="ai-engine-badge__logo" src={aiEngineLogoUrl} alt="" aria-hidden="true" />
                            <span className="ai-engine-badge__pill">AI Engine</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {suggestedTaskCard}
                  {greetingHeadline ? (
                    <div className="screensaver__headline-row">
                      <p className="screensaver__greeting screensaver__greeting--headline">
                        {speakerAttributionFormat ? `- ${greetingHeadline}` : greetingHeadline}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {greetingHeadline ? (
                    <div className="screensaver__headline-row">
                      <p className="screensaver__greeting screensaver__greeting--headline">{greetingHeadline}</p>
                    </div>
                  ) : null}
                  {showQuoteRow ? (
                    <div
                      className="screensaver__greeting screensaver__greeting--quote screensaver__greeting--quote-line"
                      role="docsubtitle"
                    >
                      <span className="screensaver__quote-inline-host">
                        <span className="screensaver__quote-inline-text">{greetingQuote}</span>
                        {greetingQuoteShowAiBadge ? (
                          <span className="ai-engine-badge ai-engine-badge--screensaver" aria-label="AI Engine">
                            <img className="ai-engine-badge__logo" src={aiEngineLogoUrl} alt="" aria-hidden="true" />
                            <span className="ai-engine-badge__pill">AI Engine</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {suggestedTaskCard}
                </>
              )}
            </div>
          ) : null}
          <div className="screensaver__hint">Tap anywhere to continue</div>
        </div>

        <div
          className={`screensaver__shift-progress${total === 0 ? ' screensaver__shift-progress--empty' : ''}`}
          role="progressbar"
          aria-label="Task completion"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={resolved}
        >
          <div className="screensaver__shift-progress-line">
            <span className="screensaver__shift-progress-numbers" style={progressNumbersStyle}>
              {resolved}/{total}
            </span>
            <span className="screensaver__shift-progress-suffix"> completed</span>
          </div>
          <div className="screensaver__shift-progress-track-wrap" aria-hidden="true">
            <div className="progress-track screensaver__shift-progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${percent}%`,
                  background: progressGradient || undefined,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
