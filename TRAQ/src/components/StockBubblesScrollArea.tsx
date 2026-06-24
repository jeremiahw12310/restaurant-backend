import { useEffect, useRef, useState, type ReactNode } from 'react'

export type StockBubblesScrollAreaProps = {
  children: ReactNode
  itemCount: number
}

export function StockBubblesScrollArea({ children, itemCount }: StockBubblesScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showHint, setShowHint] = useState(false)
  const [moreCount, setMoreCount] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      setShowHint(overflow && !atBottom)

      if (overflow) {
        const avgItemHeight = itemCount > 0 ? el.scrollHeight / itemCount : 0
        const visibleCount =
          avgItemHeight > 0 ? Math.max(1, Math.floor(el.clientHeight / avgItemHeight)) : 1
        setMoreCount(Math.max(1, itemCount - visibleCount))
      } else {
        setMoreCount(0)
      }
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [children, itemCount])

  const wrapClass = [
    'stock-bubbles-scroll-wrap',
    showHint ? 'stock-bubbles-scroll-wrap--hint' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hintLabel =
    moreCount === 1 ? 'Scroll for 1 more item' : `Scroll for ${moreCount} more items`

  return (
    <div className={wrapClass}>
      <div ref={scrollRef} className="stock-bubbles-scroll">
        {children}
      </div>
      {showHint ? (
        <div className="stock-bubbles-scroll-hint" aria-hidden="true">
          ↓ {hintLabel}
        </div>
      ) : null}
    </div>
  )
}
