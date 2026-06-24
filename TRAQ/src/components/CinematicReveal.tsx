import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

type Props = {
  text: string
  onContinue: () => void
  beginTap: (e: React.TouchEvent) => void
  moveTap: (e: React.TouchEvent) => void
  endTap: (fn: () => void, e: React.TouchEvent) => void
  shouldIgnoreClick: () => boolean
}

type Phase = 'playing' | 'done'

const REVEAL_MS = 1650

export function CinematicReveal({
  text,
  onContinue,
  beginTap,
  moveTap,
  endTap,
  shouldIgnoreClick,
}: Props) {
  const [phase, setPhase] = useState<Phase>('playing')
  const [reducedMotion, setReducedMotion] = useState(false)

  useLayoutEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setReducedMotion(true)
        setPhase('done')
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return
      }
    } catch {
      // ignore
    }

    const t = window.setTimeout(() => setPhase('done'), REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [])

  const skipToDone = useCallback(() => {
    setPhase('done')
  }, [])

  return (
    <div
      className={`cinematic-reveal-container cinematic-phase-${phase}${reducedMotion ? ' cinematic-reveal--reduced' : ''}`}
    >
      <div
        className="cinematic-reveal-hero"
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
        <div className="cinematic-reveal-vignette" aria-hidden="true" />
        <div className="cinematic-reveal-spotlight" aria-hidden="true" />
        <div className="cinematic-reveal-accent-bar" aria-hidden="true" />

        <p className="cinematic-reveal-kicker">Today&apos;s task</p>
        <h2 className="cinematic-reveal-title" aria-live="polite">
          {text}
        </h2>
        {phase !== 'done' ? (
          <div className="cinematic-reveal-skip-hint" aria-hidden="true">
            Tap to skip
          </div>
        ) : null}
      </div>

      {phase === 'done' ? (
        <button
          className="daily-task-primary-btn cinematic-continue-btn"
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
      ) : null}
    </div>
  )
}
