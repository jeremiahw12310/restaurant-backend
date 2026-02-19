import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  text: string
  onContinue: () => void
  beginTap: (e: React.TouchEvent) => void
  moveTap: (e: React.TouchEvent) => void
  endTap: (fn: () => void, e: React.TouchEvent) => void
  shouldIgnoreClick: () => boolean
}

type RevealPhase = 'intro' | 'suspense' | 'reveal' | 'done'

export function GoldenCurtainReveal({
  text,
  onContinue,
  beginTap,
  moveTap,
  endTap,
  shouldIgnoreClick,
}: Props) {
  const [phase, setPhase] = useState<RevealPhase>('intro')
  const prefersReducedMotionRef = useRef(false)
  const didInitRef = useRef(false)

  useEffect(() => {
    // If reduced motion is enabled, skip animation and show the Continue button immediately.
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        prefersReducedMotionRef.current = true
        setPhase('done')
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (prefersReducedMotionRef.current) return
    if (didInitRef.current) return
    didInitRef.current = true

    // Option A: Drumroll → Spotlight → Title Pop
    // Total ~2000ms (plus user's reaction time).
    const t1 = window.setTimeout(() => setPhase('suspense'), 400)
    const t2 = window.setTimeout(() => setPhase('reveal'), 1400)
    const t3 = window.setTimeout(() => setPhase('done'), 2000)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [])

  const skipToDone = useCallback(() => {
    if (prefersReducedMotionRef.current) return
    setPhase('done')
  }, [])

  return (
    <div className={`curtain-reveal-container curtain-phase-${phase}`}>
      <div
        className="curtain-reveal-frame"
        aria-label="Today's task revealed"
        onTouchStart={beginTap}
        onTouchMove={moveTap}
        onTouchEnd={(e) =>
          endTap(() => {
            if (phase !== 'done') skipToDone()
          }, e)
        }
        onClick={() => {
          if (shouldIgnoreClick()) return
          if (phase !== 'done') skipToDone()
        }}
      >
        <div className="curtain-reveal-vignette" aria-hidden="true" />
        <div className="curtain-reveal-spotlight" aria-hidden="true" />
        <div className="curtain-reveal-shimmer" aria-hidden="true" />

        <div className="curtain-reveal-subtitle" aria-hidden="true">
          And today’s task is…
        </div>
        <div className="curtain-reveal-text">{text}</div>
      </div>

      {phase === 'done' ? (
        <button
          className="daily-task-primary-btn curtain-continue-btn"
          type="button"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) => endTap(onContinue, e)}
          onClick={() => {
            if (shouldIgnoreClick()) return
            onContinue()
          }}
        >
          Continue to Materials
        </button>
      ) : (
        <div className="curtain-reveal-skip-hint" aria-hidden="true">
          Tap to skip
        </div>
      )}
    </div>
  )
}


