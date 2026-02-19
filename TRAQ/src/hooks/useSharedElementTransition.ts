import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export type SharedElementTransitionPhase = 'idle' | 'animating'

export type SharedElementClone = {
  key: string
  style: CSSProperties
  content: ReactNode
}

type StartArgs = {
  sourceEl: HTMLElement | null
  targetEl: HTMLElement | null
  content: ReactNode
  prefersReducedMotion: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function useSharedElementTransition() {
  const [clone, setClone] = useState<SharedElementClone | null>(null)
  const [backdropVisible, setBackdropVisible] = useState(false)
  const phaseRef = useRef<SharedElementTransitionPhase>('idle')
  const animRef = useRef<{ cancel: () => void } | null>(null)
  const nonceRef = useRef(0)

  const cancel = useCallback(() => {
    animRef.current?.cancel()
    animRef.current = null
    phaseRef.current = 'idle'
    setBackdropVisible(false)
    setClone(null)
  }, [])

  const start = useCallback((args: StartArgs) => {
    nonceRef.current += 1
    const nonce = nonceRef.current

    // Cancel any in-flight transition.
    cancel()

    if (args.prefersReducedMotion) return
    if (!args.sourceEl || !args.targetEl) return

    const src = args.sourceEl.getBoundingClientRect()
    const dst = args.targetEl.getBoundingClientRect()
    if (src.width <= 1 || src.height <= 1 || dst.width <= 1 || dst.height <= 1) return

    // Initial clone positioned exactly over the source element.
    const initStyle: CSSProperties = {
      width: `${round2(src.width)}px`,
      height: `${round2(src.height)}px`,
      transform: `translate3d(${round2(src.left)}px, ${round2(src.top)}px, 0)`,
      opacity: 1,
    }

    phaseRef.current = 'animating'
    setBackdropVisible(true)
    setClone({
      key: `task-${Date.now()}-${nonce}`,
      style: initStyle,
      content: args.content,
    })

    let raf1 = 0
    let raf2 = 0
    let finished = false

    const cleanup = () => {
      if (finished) return
      finished = true
      phaseRef.current = 'idle'
      setBackdropVisible(false)
      setClone(null)
      animRef.current = null
    }

    const cancelImpl = () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
      cleanup()
    }

    animRef.current = { cancel: cancelImpl }

    // Two RAFs: allow the clone to mount before we apply the end transform.
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (nonceRef.current !== nonce) return

        // Animate from src rect to dst rect using translate+scale and a quick flip.
        const sx = dst.width / src.width
        const sy = dst.height / src.height

        const durMs = 200
        setClone((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            style: {
              ...prev.style,
              transition:
                `transform ${durMs}ms cubic-bezier(0.2, 0.9, 0.2, 1), ` +
                `opacity ${durMs}ms ease-out, ` +
                `filter ${durMs}ms ease-out`,
              transform:
                `translate3d(${round2(dst.left)}px, ${round2(dst.top)}px, 0) ` +
                `scale(${round2(sx)}, ${round2(sy)}) ` +
                `rotateY(-10deg)`,
              filter: 'drop-shadow(0 18px 28px rgba(0,0,0,0.18))',
            },
          }
        })

        // End: clear clone after animation completes.
        const t = window.setTimeout(() => cleanup(), durMs + 30)
        animRef.current = {
          cancel: () => {
            window.clearTimeout(t)
            cancelImpl()
          },
        }
      })
    })
  }, [cancel])

  return useMemo(
    () => ({
      clone,
      backdropVisible,
      start,
      cancel,
      get phase() {
        return phaseRef.current
      },
    }),
    [backdropVisible, cancel, clone, start]
  )
}


