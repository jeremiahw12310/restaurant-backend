import { memo, useEffect, useMemo, useState } from 'react'

const formatClock = (d: Date): string => {
  const h24 = d.getHours()
  const h12 = h24 % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  return `${h12}:${m} ${ampm}`
}

export const HeaderClock = memo(function HeaderClock() {
  const [tick, setTick] = useState(() => Date.now())

  const label = useMemo(() => formatClock(new Date(tick)), [tick])

  useEffect(() => {
    const refresh = () => setTick(Date.now())
    // Low frequency updates are enough (no seconds shown).
    const id = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return (
    <span className="hero-clock" aria-label="Current time">
      {label}
    </span>
  )
})



