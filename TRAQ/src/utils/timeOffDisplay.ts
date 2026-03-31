import type { RequestedShift, TimeOffRequest } from '../services/firestore'

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function displayDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function countInclusiveCalendarDays(startDateKey: string, endDateKey: string): number {
  const toUtcDayMs = (dateKey: string): number => {
    const [yy, mm, dd] = String(dateKey || '')
      .split('-')
      .map((x) => parseInt(x, 10))
    if (!yy || !mm || !dd) return NaN
    return Date.UTC(yy, mm - 1, dd)
  }
  const startMs = toUtcDayMs(startDateKey)
  const endMs = toUtcDayMs(endDateKey)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
}

export function formatDateRangeDisplay(startDateKey: string, endDateKey: string): string {
  const start = parseDateKey(startDateKey)
  const end = parseDateKey(endDateKey)
  if (startDateKey === endDateKey) {
    return displayDateShort(start)
  }
  return `${displayDateShort(start)} – ${displayDateShort(end)}`
}

/** Single-line summary for cards and notifications (matches prior in-app admin behavior). */
export function formatTimeOffSummaryLine(req: TimeOffRequest): string {
  if (req.requestKind === 'date_range' && req.dateRange) {
    const { startDateKey, endDateKey } = req.dateRange
    const calendarDays = countInclusiveCalendarDays(startDateKey, endDateKey)
    return `${formatDateRangeDisplay(startDateKey, endDateKey)} (${calendarDays} day${calendarDays !== 1 ? 's' : ''})`
  }
  const uniqueDates = new Set(req.requestedShifts.map((s) => s.dateKey))
  const calendarDays = uniqueDates.size
  if (calendarDays === 0) return 'No days'
  if (calendarDays === 1) {
    const dateKey = req.requestedShifts[0]?.dateKey
    if (dateKey) return `${displayDateShort(parseDateKey(dateKey))} (1 day)`
    return '1 day'
  }
  const sortedDates = Array.from(uniqueDates).sort()
  const firstDate = sortedDates[0]
  const lastDate = sortedDates[sortedDates.length - 1]
  return `${formatDateRangeDisplay(firstDate, lastDate)} (${calendarDays} day${calendarDays !== 1 ? 's' : ''})`
}

export function formatShiftTypeLabel(shift: 'lunch' | 'dinner'): string {
  return shift === 'lunch' ? 'Lunch' : 'Dinner'
}

export function groupRequestedShiftsByDateSorted(
  requestedShifts: RequestedShift[]
): { dateKey: string; shifts: ('lunch' | 'dinner')[] }[] {
  const byDate = new Map<string, Set<'lunch' | 'dinner'>>()
  for (const { dateKey, shift } of requestedShifts) {
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Set())
    byDate.get(dateKey)!.add(shift)
  }
  const order: ('lunch' | 'dinner')[] = ['lunch', 'dinner']
  return Array.from(byDate.keys())
    .sort()
    .map((dateKey) => {
      const set = byDate.get(dateKey)!
      const shifts = order.filter((s) => set.has(s))
      return { dateKey, shifts }
    })
}

/** Summary plus per-day shifts for approve/deny notifications (shift_blocks only). */
export function formatTimeOffNotificationBody(req: TimeOffRequest): string {
  const line = formatTimeOffSummaryLine(req)
  if (req.requestKind !== 'shift_blocks' || !req.requestedShifts?.length) return line
  const detail = groupRequestedShiftsByDateSorted(req.requestedShifts)
    .map(
      ({ dateKey, shifts }) =>
        `${displayDateShort(parseDateKey(dateKey))} — ${shifts.map(formatShiftTypeLabel).join(', ')}`
    )
    .join('\n')
  return `${line}\n${detail}`
}
