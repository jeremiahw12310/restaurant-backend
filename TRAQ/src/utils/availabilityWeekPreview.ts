import type {
  RequestedShift,
  ShiftType,
  TimeOffRequest,
} from '../services/firestore'
import {
  isShiftAvailableOnDateKey,
  type AvailabilityState,
} from './availabilityEffective'
import { addDaysToDateKey } from './dailyTaskWeekGenerator'
import { DAY_OF_WEEK_LABELS, formatDateKey, getDayOfWeekKey, getWeekStartDateKeyMonday } from './dayOfWeek'
import { displayDateShort, parseDateKey } from './timeOffDisplay'

export { getWeekStartDateKeyMonday }

export type ShiftRoster = {
  available: string[]
  off: string[]
  pending: string[]
}

export type WeekPreviewDay = {
  dateKey: string
  label: string
  isToday: boolean
  lunch: ShiftRoster
  dinner: ShiftRoster
}

export type WeekPreviewModel = {
  weekStartDateKey: string
  weekEndDateKey: string
  weekLabel: string
  days: WeekPreviewDay[]
  pendingRequestCount: number
}

const MAX_RANGE_DAYS = 90

export function getWeekDateKeys(weekStartDateKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStartDateKey, i))
}

export function expandTimeOffRequestToShifts(req: TimeOffRequest): RequestedShift[] {
  if (req.requestKind === 'shift_blocks') {
    return (req.requestedShifts || []).filter((s) => s.dateKey && s.shift)
  }

  const range = req.dateRange
  if (!range?.startDateKey || !range?.endDateKey) {
    return (req.requestedShifts || []).filter((s) => s.dateKey && s.shift)
  }

  const shifts: RequestedShift[] = []
  const startDate = parseDateKey(range.startDateKey)
  const endDate = parseDateKey(range.endDateKey)
  let current = new Date(startDate)
  let count = 0

  while (current <= endDate && count < MAX_RANGE_DAYS) {
    const dateKey = formatDateKey(current)
    shifts.push({ dateKey, shift: 'lunch' })
    shifts.push({ dateKey, shift: 'dinner' })
    current.setDate(current.getDate() + 1)
    count += 1
  }

  return shifts
}

function matchesSearch(name: string, searchQuery: string): boolean {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().includes(q)
}

function employeeOffForShift(
  employee: string,
  dateKey: string,
  shift: ShiftType,
  timeOffRequests: TimeOffRequest[],
  status: 'approved' | 'pending'
): boolean {
  return timeOffRequests.some((req) => {
    if (req.employee !== employee || req.status !== status) return false
    const expanded = expandTimeOffRequestToShifts(req)
    return expanded.some((s) => s.dateKey === dateKey && s.shift === shift)
  })
}

export function buildDayShiftRoster(args: {
  dateKey: string
  shift: ShiftType
  employees: string[]
  availabilityState: AvailabilityState
  timeOffRequests: TimeOffRequest[]
  searchQuery?: string
}): ShiftRoster {
  const { dateKey, shift, employees, availabilityState, timeOffRequests, searchQuery = '' } = args
  const available: string[] = []
  const off: string[] = []
  const pending: string[] = []

  for (const emp of employees) {
    if (!matchesSearch(emp, searchQuery)) continue

    const patternAvailable = isShiftAvailableOnDateKey(emp, dateKey, shift, availabilityState)
    const approvedOff = employeeOffForShift(emp, dateKey, shift, timeOffRequests, 'approved')
    const pendingOff = employeeOffForShift(emp, dateKey, shift, timeOffRequests, 'pending')

    if (approvedOff) {
      off.push(emp)
    } else if (pendingOff) {
      pending.push(emp)
    }

    if (patternAvailable && !approvedOff) {
      available.push(emp)
    }
  }

  available.sort((a, b) => a.localeCompare(b))
  off.sort((a, b) => a.localeCompare(b))
  pending.sort((a, b) => a.localeCompare(b))

  return { available, off, pending }
}

function formatDayColumnLabel(dateKey: string): string {
  const d = parseDateKey(dateKey)
  const dow = getDayOfWeekKey(d)
  const short = displayDateShort(d)
  const parts = short.split(', ')
  const datePart = parts.length > 1 ? parts.slice(1).join(', ') : short
  return `${DAY_OF_WEEK_LABELS[dow]} ${datePart}`
}

function formatWeekLabel(weekStartDateKey: string, weekEndDateKey: string): string {
  const start = parseDateKey(weekStartDateKey)
  const end = parseDateKey(weekEndDateKey)
  const startStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined,
  })
  const yearSuffix =
    start.getFullYear() === end.getFullYear() ? `, ${start.getFullYear()}` : ''
  return `${startStr} – ${endStr}${yearSuffix}`
}

export function buildWeekPreviewModel(args: {
  weekStartDateKey: string
  todayDateKey: string
  employees: string[]
  availabilityState: AvailabilityState
  timeOffRequests: TimeOffRequest[]
  searchQuery?: string
}): WeekPreviewModel {
  const { weekStartDateKey, todayDateKey, employees, availabilityState, timeOffRequests, searchQuery = '' } =
    args
  const dateKeys = getWeekDateKeys(weekStartDateKey)
  const weekEndDateKey = dateKeys[6]!

  const days: WeekPreviewDay[] = dateKeys.map((dateKey) => ({
    dateKey,
    label: formatDayColumnLabel(dateKey),
    isToday: dateKey === todayDateKey,
    lunch: buildDayShiftRoster({
      dateKey,
      shift: 'lunch',
      employees,
      availabilityState,
      timeOffRequests,
      searchQuery,
    }),
    dinner: buildDayShiftRoster({
      dateKey,
      shift: 'dinner',
      employees,
      availabilityState,
      timeOffRequests,
      searchQuery,
    }),
  }))

  const pendingRequestCount = timeOffRequests.filter((r) => r.status === 'pending').length

  return {
    weekStartDateKey,
    weekEndDateKey,
    weekLabel: formatWeekLabel(weekStartDateKey, weekEndDateKey),
    days,
    pendingRequestCount,
  }
}
