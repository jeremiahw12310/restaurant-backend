import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const ITEM_H = 44
const VISIBLE_ROWS = 5
/** Top/bottom padding inside each wheel so the first/last row can scroll to the viewport center. */
const PAD = ((VISIBLE_ROWS - 1) / 2) * ITEM_H
/** Must match `h-[220px]` on the wheel (`VISIBLE_ROWS * ITEM_H`). */
const WHEEL_VIEWPORT_H = VISIBLE_ROWS * ITEM_H

/** Scroll offset so row `index` is centered in the viewport (aligns with `snap-center`). */
function scrollTopForIndex(index: number): number {
  return PAD + index * ITEM_H + ITEM_H / 2 - WHEEL_VIEWPORT_H / 2
}

function indexFromScroll(scrollTop: number): number {
  return Math.round((scrollTop + WHEEL_VIEWPORT_H / 2 - PAD - ITEM_H / 2) / ITEM_H)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null
  const dim = daysInMonth(y, mo)
  if (d > dim) return null
  return { y, m: mo, d }
}

function toYmd(y: number, m: number, d: number): string {
  const dim = daysInMonth(y, m)
  const dd = Math.min(Math.max(1, d), dim)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

type Ymd = { y: number; m: number; d: number }

type Props = {
  value: string
  onChange: (ymd: string) => void
  disabled?: boolean
  minYear?: number
  maxYear?: number
  id?: string
  'aria-labelledby'?: string
}

function defaultYmd(maxYear: number): Ymd {
  const y = Math.min(maxYear, new Date().getFullYear() - 22)
  return { y, m: 0, d: Math.min(15, daysInMonth(y, 0)) }
}

export function ScrollBirthDatePicker({
  value,
  onChange,
  disabled = false,
  minYear = 1940,
  maxYear: maxYearProp,
  id,
  'aria-labelledby': ariaLabelledBy,
}: Props) {
  const maxYear = maxYearProp ?? new Date().getFullYear() - 16

  const years = useMemo(() => {
    const a: number[] = []
    for (let y = maxYear; y >= minYear; y--) a.push(y)
    return a
  }, [minYear, maxYear])

  const [inner, setInner] = useState<Ymd>(() => parseYmd(value) ?? defaultYmd(maxYear))

  useEffect(() => {
    const p = parseYmd(value)
    if (p) {
      setInner((prev) => (prev.y === p.y && prev.m === p.m && prev.d === p.d ? prev : p))
      return
    }
    setInner(defaultYmd(maxYear))
  }, [value, maxYear])

  const monthRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  const suppress = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const scrollWheelsTo = useCallback(
    (next: Ymd, behavior: ScrollBehavior = 'auto') => {
      const yi = years.indexOf(next.y)
      const mi = next.m
      const dim = daysInMonth(next.y, next.m)
      const dd = Math.min(Math.max(1, next.d), dim)
      const di = dd - 1
      const yI = Math.max(0, yi)
      suppress.current = true
      yearRef.current?.scrollTo({ top: scrollTopForIndex(yI), behavior })
      monthRef.current?.scrollTo({ top: scrollTopForIndex(mi), behavior })
      dayRef.current?.scrollTo({ top: scrollTopForIndex(di), behavior })
      requestAnimationFrame(() => {
        suppress.current = false
      })
    },
    [years]
  )

  useLayoutEffect(() => {
    scrollWheelsTo(inner)
  }, [inner, scrollWheelsTo])

  // Keep parent `value` in sync when it is empty so the visible wheels match submitted YYYY-MM-DD.
  useLayoutEffect(() => {
    if (parseYmd(value)) return
    const ymd = toYmd(inner.y, inner.m, inner.d)
    onChangeRef.current(ymd)
  }, [value, inner])

  const dayCount = daysInMonth(inner.y, inner.m)
  const days = Array.from({ length: dayCount }, (_, i) => i + 1)

  /** Must apply scroll instantly: callers read `scrollTop` immediately after snap (smooth scroll would leave stale positions). */
  const snap = (el: HTMLDivElement | null, maxIndex: number) => {
    if (!el) return 0
    const idx = Math.min(Math.max(0, indexFromScroll(el.scrollTop)), maxIndex)
    el.scrollTop = scrollTopForIndex(idx)
    return idx
  }

  const commitFromWheels = useCallback(() => {
    if (suppress.current || disabled) return
    const ye = yearRef.current
    const me = monthRef.current
    const de = dayRef.current
    if (!ye || !me || !de) return

    snap(me, 11)
    snap(ye, years.length - 1)
    const yi = Math.min(indexFromScroll(ye.scrollTop), years.length - 1)
    const mi = Math.min(indexFromScroll(me.scrollTop), 11)
    const y = years[yi] ?? years[0]!
    const dim = daysInMonth(y, mi)
    snap(de, dim - 1)

    const di = Math.min(indexFromScroll(de.scrollTop), dim - 1)
    const d = di + 1
    const next: Ymd = { y, m: mi, d }
    setInner(next)
    const ymd = toYmd(y, mi, d)
    if (ymd !== value) {
      onChangeRef.current(ymd)
    }
  }, [disabled, value, years])

  useEffect(() => {
    if (disabled) return
    const month = monthRef.current
    const day = dayRef.current
    const year = yearRef.current
    if (!month || !day || !year) return

    let timeout: ReturnType<typeof setTimeout> | undefined
    const scheduleCommit = () => {
      if (suppress.current) return
      if (timeout !== undefined) clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (!suppress.current) commitFromWheels()
      }, 110)
    }

    const nodes = [month, day, year]
    for (const el of nodes) {
      el.addEventListener('scrollend', scheduleCommit as EventListener)
      el.addEventListener('scroll', scheduleCommit, { passive: true })
    }
    return () => {
      if (timeout !== undefined) clearTimeout(timeout)
      for (const el of nodes) {
        el.removeEventListener('scrollend', scheduleCommit as EventListener)
        el.removeEventListener('scroll', scheduleCommit)
      }
    }
  }, [commitFromWheels, disabled])

  const colClass =
    'relative flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-50'
  const wheelClass =
    'scrollbar-none h-[220px] snap-y snap-mandatory overflow-y-scroll overscroll-y-contain outline-none focus-visible:ring-2 focus-visible:ring-brand/30'

  return (
    <div
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={`mt-2 flex gap-1 sm:gap-2 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      role="group"
      aria-disabled={disabled || undefined}
    >
      <div className={colClass}>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -mt-[22px] h-11 border-y border-brand/25 bg-brand/[0.06]"
          aria-hidden
        />
        <div
          ref={monthRef}
          className={wheelClass}
          tabIndex={disabled ? -1 : 0}
          aria-label="Birth month"
        >
          <div style={{ height: PAD }} aria-hidden />
          {MONTHS.map((label) => (
            <div
              key={label}
              className="flex h-11 shrink-0 snap-center items-center justify-center text-base font-medium text-gray-900"
            >
              {label}
            </div>
          ))}
          <div style={{ height: PAD }} aria-hidden />
        </div>
      </div>

      <div className={`${colClass} w-[4.5rem] shrink-0 sm:w-auto sm:flex-1`}>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -mt-[22px] h-11 border-y border-brand/25 bg-brand/[0.06]"
          aria-hidden
        />
        <div
          ref={dayRef}
          className={wheelClass}
          tabIndex={disabled ? -1 : 0}
          aria-label="Birth day"
        >
          <div style={{ height: PAD }} aria-hidden />
          {days.map((day) => (
            <div
              key={day}
              className="flex h-11 shrink-0 snap-center items-center justify-center text-base font-medium text-gray-900"
            >
              {day}
            </div>
          ))}
          <div style={{ height: PAD }} aria-hidden />
        </div>
      </div>

      <div className={`${colClass} w-[5.25rem] shrink-0 sm:w-auto sm:flex-1`}>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -mt-[22px] h-11 border-y border-brand/25 bg-brand/[0.06]"
          aria-hidden
        />
        <div
          ref={yearRef}
          className={wheelClass}
          tabIndex={disabled ? -1 : 0}
          aria-label="Birth year"
        >
          <div style={{ height: PAD }} aria-hidden />
          {years.map((year) => (
            <div
              key={year}
              className="flex h-11 shrink-0 snap-center items-center justify-center text-base font-medium text-gray-900"
            >
              {year}
            </div>
          ))}
          <div style={{ height: PAD }} aria-hidden />
        </div>
      </div>

      <style>{`
        .scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
