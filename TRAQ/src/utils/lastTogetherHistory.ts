import type { TaskCompletion, TaskState, WindowKey } from '../services/firestore'
import type { Task } from '../types/task'

const LAST_TOGETHER_SUMMARY_MAX = 4000

/**
 * Streak helpers for the "Last time: [name] ×N" line and split AI rotation context.
 * Scoped to two employees and shifts (same window) those two worked together.
 */
export function isManualLastTimeCompletion(completion: TaskCompletion | undefined): boolean {
  if (!completion || completion.status !== 'done') return false
  if (completion.didNotNeedToComplete) return false
  if (completion.autoAssigned) return false
  if (completion.deferredToClose) return false
  if (!completion.assignees?.length) return false
  return true
}

export function findSharedShiftDates(
  taskState: TaskState,
  windowKey: WindowKey,
  employees: [string, string],
  excludeDateKey: string,
): string[] {
  const a = employees[0].trim()
  const b = employees[1].trim()
  if (!a || !b || a === b) return []
  const dates: string[] = []
  for (const dateKey of Object.keys(taskState)) {
    if (dateKey === excludeDateKey) continue
    const windowData = taskState[dateKey]?.[windowKey]
    if (!windowData) continue
    let hasA = false
    let hasB = false
    for (const taskId of Object.keys(windowData)) {
      const completion = windowData[taskId]
      if (!isManualLastTimeCompletion(completion)) continue
      const assignees = completion!.assignees.map((n: string) => n.trim())
      if (assignees.includes(a)) hasA = true
      if (assignees.includes(b)) hasB = true
      if (hasA && hasB) break
    }
    if (hasA && hasB) dates.push(dateKey)
  }
  dates.sort((x, y) => (x < y ? 1 : x > y ? -1 : 0))
  return dates
}

export function findLastTogetherCompleter(
  taskState: TaskState,
  taskId: string,
  windowKey: WindowKey,
  employees: [string, string],
  sharedDates: string[],
): { dateKey: string; completers: string[]; wasSplit: boolean } | null {
  const a = employees[0].trim()
  const b = employees[1].trim()
  for (const dateKey of sharedDates) {
    const completion = taskState[dateKey]?.[windowKey]?.[taskId]
    if (!isManualLastTimeCompletion(completion)) continue
    const assignees = completion!.assignees.map((n: string) => n.trim())
    const hasA = assignees.includes(a)
    const hasB = assignees.includes(b)
    if (!hasA && !hasB) continue
    const wasSplit = hasA && hasB
    const completers = wasSplit ? [a, b] : hasA ? [a] : [b]
    return { dateKey, completers, wasSplit }
  }
  return null
}

export function computeSplitTogetherStreak(
  taskState: TaskState,
  taskId: string,
  windowKey: WindowKey,
  employees: [string, string],
  sharedDates: string[],
  anchorDateKey?: string,
): number {
  const a = employees[0].trim()
  const b = employees[1].trim()
  if (!a || !b || a === b) return 0

  const anchorIdx = anchorDateKey ? sharedDates.indexOf(anchorDateKey) : 0
  const datesToWalk = anchorIdx >= 0 ? sharedDates.slice(anchorIdx) : sharedDates

  let count = 0
  for (const dateKey of datesToWalk) {
    const completion = taskState[dateKey]?.[windowKey]?.[taskId]
    if (!isManualLastTimeCompletion(completion)) continue
    const assignees = completion!.assignees.map((n: string) => n.trim())
    if (assignees.includes(a) && assignees.includes(b)) {
      count++
      continue
    }
    break
  }
  return count
}

export function computeTogetherStreak(
  taskState: TaskState,
  taskId: string,
  windowKey: WindowKey,
  employee: string,
  employees: [string, string],
  sharedDates: string[],
  anchorDateKey?: string,
): number {
  const target = employee.trim()
  const a = employees[0].trim()
  const b = employees[1].trim()
  if (!target || !a || !b) return 0
  const other = target === a ? b : target === b ? a : ''
  if (!other) return 0

  const anchorIdx = anchorDateKey ? sharedDates.indexOf(anchorDateKey) : 0
  const datesToWalk = anchorIdx >= 0 ? sharedDates.slice(anchorIdx) : sharedDates

  let count = 0
  for (const dateKey of datesToWalk) {
    const completion = taskState[dateKey]?.[windowKey]?.[taskId]
    if (!isManualLastTimeCompletion(completion)) continue
    const assignees = completion!.assignees.map((n: string) => n.trim())
    if (assignees.includes(target)) {
      count++
      continue
    }
    if (assignees.includes(other)) break
  }
  return count
}

export function buildLastTogetherSummaryForSplit(args: {
  taskState: TaskState
  dateKey: string
  windowKey: '17' | '21'
  employeeA: string
  employeeB: string
  candidateTaskIds: string[]
  allTasks: Task[]
}): string {
  const a = args.employeeA.trim()
  const b = args.employeeB.trim()
  if (!a || !b || a === b) {
    return 'No prior shared-shift completions for this pair in this window.'
  }

  const pair: [string, string] = [a, b]
  const sharedDates = findSharedShiftDates(args.taskState, args.windowKey, pair, args.dateKey)
  if (sharedDates.length === 0) {
    return 'No prior shared-shift completions for this pair in this window.'
  }

  const taskName = (id: string) => args.allTasks.find((t) => t.id === id)?.name || id
  const lines: string[] = []

  for (const taskId of args.candidateTaskIds) {
    const last = findLastTogetherCompleter(args.taskState, taskId, args.windowKey, pair, sharedDates)
    if (!last) continue

    const name = taskName(taskId)
    if (last.wasSplit) {
      const count = computeSplitTogetherStreak(
        args.taskState,
        taskId,
        args.windowKey,
        pair,
        sharedDates,
        last.dateKey,
      )
      if (count < 1) continue
      lines.push(`${name}: both split together ×${count} (${last.dateKey}) — no rotation`)
      continue
    }

    const solo = last.completers[0]
    if (!solo) continue
    const count = computeTogetherStreak(
      args.taskState,
      taskId,
      args.windowKey,
      solo,
      pair,
      sharedDates,
      last.dateKey,
    )
    if (count < 1) continue
    const other = solo === a ? b : solo === b ? a : ''
    if (!other) continue
    lines.push(`${name}: ${solo} ×${count} (${last.dateKey}) → prefer ${other}`)
  }

  if (lines.length === 0) {
    return 'No prior shared-shift completions for this pair in this window.'
  }

  const body = lines.join('\n')
  return body.length > LAST_TOGETHER_SUMMARY_MAX ? body.slice(0, LAST_TOGETHER_SUMMARY_MAX) : body
}

export type RotationPref = { lastCompleter: string; streak: number }
export type RotationPreferenceMap = Record<string, RotationPref>

/**
 * Steep escalation with streak so very long same-person streaks get strongly
 * prioritized for rotation. 1,4,9,16,...
 */
export function rotationStreakWeight(streak: number): number {
  return streak <= 0 ? 0 : streak * streak
}

/**
 * Per candidate task: only SOLO last completions by one of the pair (skip
 * split-together / no-history tasks). Mirrors the solo branch of
 * `buildLastTogetherSummaryForSplit`.
 */
export function buildRotationPreferenceMap(args: {
  taskState: TaskState
  dateKey: string
  windowKey: '17' | '21'
  employeeA: string
  employeeB: string
  candidateTaskIds: string[]
}): RotationPreferenceMap {
  const a = args.employeeA.trim()
  const b = args.employeeB.trim()
  const out: RotationPreferenceMap = {}
  if (!a || !b || a === b) return out

  const pair: [string, string] = [a, b]
  const sharedDates = findSharedShiftDates(args.taskState, args.windowKey, pair, args.dateKey)
  if (sharedDates.length === 0) return out

  for (const taskId of args.candidateTaskIds) {
    const last = findLastTogetherCompleter(args.taskState, taskId, args.windowKey, pair, sharedDates)
    if (!last || last.wasSplit) continue
    const solo = last.completers[0]
    if (!solo) continue
    const streak = computeTogetherStreak(
      args.taskState,
      taskId,
      args.windowKey,
      solo,
      pair,
      sharedDates,
      last.dateKey,
    )
    if (streak < 1) continue
    out[taskId] = { lastCompleter: solo, streak }
  }

  return out
}

/**
 * Anti-rotation cost: penalize tasks kept with the person who completed them
 * last, scaled steeply by streak length. Zero when the task is now shared
 * (split across both => rotated) or rotated to the other person.
 */
export function computeAntiRotationCost(
  assignment: Record<string, string>,
  sharedTaskIds: string[],
  rot: RotationPreferenceMap,
): number {
  const shared = new Set(sharedTaskIds)
  let cost = 0
  for (const [tid, pref] of Object.entries(rot)) {
    if (shared.has(tid)) continue
    if ((assignment[tid] || '').trim() === pref.lastCompleter) cost += rotationStreakWeight(pref.streak)
  }
  return cost
}
