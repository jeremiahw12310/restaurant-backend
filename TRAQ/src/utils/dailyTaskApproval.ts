import type {
  DailyTaskDayApprovalStatus,
  DailyTaskWeekDayEntry,
} from '../services/firestore'

export type { DailyTaskDayApprovalStatus, DailyTaskWeekDayEntry }

export function getDayApprovalStatus(
  entry: DailyTaskWeekDayEntry | null | undefined
): DailyTaskDayApprovalStatus {
  const s = entry?.approvalStatus
  if (s === 'pending' || s === 'approved' || s === 'denied') return s
  return 'approved'
}

export function isDayApproved(entry: DailyTaskWeekDayEntry | null | undefined): boolean {
  return getDayApprovalStatus(entry) === 'approved'
}

/** Players may see and reveal this day's assignment. */
export function isDayVisibleToPlayers(entry: DailyTaskWeekDayEntry | null | undefined): boolean {
  if (!entry) return false
  if (getDayApprovalStatus(entry) !== 'approved') return false
  const tid = String(entry.taskId || '').trim()
  return !!tid && tid !== '__none__'
}

export function parseWeekDayEntry(raw: unknown): DailyTaskWeekDayEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const taskId = typeof o.taskId === 'string' ? o.taskId.trim() : ''
  if (!taskId) return null
  const source = o.source === 'override' ? 'override' : 'auto'
  const approvalStatus =
    o.approvalStatus === 'pending' || o.approvalStatus === 'approved' || o.approvalStatus === 'denied'
      ? o.approvalStatus
      : undefined
  const entry: DailyTaskWeekDayEntry = { taskId, source }
  if (approvalStatus) entry.approvalStatus = approvalStatus
  if (typeof o.approvalAtMs === 'number' && Number.isFinite(o.approvalAtMs)) {
    entry.approvalAtMs = o.approvalAtMs
  }
  if (typeof o.approvalBy === 'string' && o.approvalBy.trim()) {
    entry.approvalBy = o.approvalBy.trim()
  }
  return entry
}

export function createAutoDayEntry(taskId: string): DailyTaskWeekDayEntry {
  return {
    taskId,
    source: 'auto',
    approvalStatus: 'pending',
  }
}

export function createOverrideDayEntry(taskId: string): DailyTaskWeekDayEntry {
  return {
    taskId,
    source: 'override',
    approvalStatus: 'approved',
    approvalAtMs: Date.now(),
    approvalBy: 'admin',
  }
}

export function withApproval(
  entry: DailyTaskWeekDayEntry,
  status: DailyTaskDayApprovalStatus
): DailyTaskWeekDayEntry {
  const next: DailyTaskWeekDayEntry = {
    ...entry,
    approvalStatus: status,
    approvalAtMs: Date.now(),
    approvalBy: 'admin',
  }
  return next
}

/** After generator writes auto slots, keep approval if task unchanged and was already approved. */
export function preserveApprovedAutoDay(
  previous: DailyTaskWeekDayEntry | null | undefined,
  generated: DailyTaskWeekDayEntry
): DailyTaskWeekDayEntry {
  if (generated.source !== 'auto') return generated
  if (previous?.source === 'override') return generated
  if (
    previous &&
    getDayApprovalStatus(previous) === 'approved' &&
    previous.taskId === generated.taskId
  ) {
    const preserved: DailyTaskWeekDayEntry = {
      ...generated,
      approvalStatus: 'approved',
    }
    if (typeof previous.approvalAtMs === 'number' && Number.isFinite(previous.approvalAtMs)) {
      preserved.approvalAtMs = previous.approvalAtMs
    }
    if (typeof previous.approvalBy === 'string' && previous.approvalBy.trim()) {
      preserved.approvalBy = previous.approvalBy.trim()
    }
    return preserved
  }
  return generated
}

export function countPendingDays(
  days: Record<string, DailyTaskWeekDayEntry | unknown> | null | undefined
): number {
  if (!days) return 0
  let n = 0
  Object.values(days).forEach((raw) => {
    const entry = parseWeekDayEntry(raw)
    if (entry && getDayApprovalStatus(entry) === 'pending') n += 1
  })
  return n
}

export function approvalStatusLabel(status: DailyTaskDayApprovalStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'denied':
      return 'Denied'
    default:
      return 'Approved'
  }
}
