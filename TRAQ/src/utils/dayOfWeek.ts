import type { DayOfWeek } from '../services/firestore'

/** Calendar order Sun–Sat (matches JS `Date.getDay()` index). */
export const DAY_OF_WEEK_KEYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

export function getDayOfWeekKey(date: Date): DayOfWeek {
  return DAY_OF_WEEK_KEYS[date.getDay()]
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Monday of the Mon–Sun week containing `dateKey`. */
export function getWeekStartDateKeyMonday(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  d.setHours(0, 0, 0, 0)
  const offsetFromMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offsetFromMonday)
  return formatDateKey(d)
}
