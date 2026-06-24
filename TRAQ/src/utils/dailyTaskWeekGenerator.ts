import type { DailyTaskDef, DailyTaskRun, DailyTaskWeek } from '../services/firestore'
import {
  createAutoDayEntry,
  createOverrideDayEntry,
  parseWeekDayEntry,
  preserveApprovedAutoDay,
} from './dailyTaskApproval'
import { isDailyTaskSchedulable } from './dailyTaskArchive'
import {
  isWindowCleaningRelatedTaskName,
  pickMonthlyTaskForDay,
  sortMonthlyTaskIdsForScheduling,
} from './dailyTaskWindowScheduling'

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (self-contained; keep in sync with App admin date utilities)
// ─────────────────────────────────────────────────────────────────────────────

export const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const formatDateKey = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const startOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const addDays = (date: Date, delta: number): Date => {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}

export const addDaysToDateKey = (dateKey: string, delta: number): string => {
  return formatDateKey(addDays(parseDateKey(dateKey), delta))
}

export const getWeekStartDateKeySunday = (dateKey: string): string => {
  const d = startOfDay(parseDateKey(dateKey))
  const dow = d.getDay()
  const weekStart = addDays(d, -dow)
  return formatDateKey(weekStart)
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Task Scheduling (Sun–Sat, exact weekly quotas 1–3/week)
// ─────────────────────────────────────────────────────────────────────────────

export const DAILY_TASK_WEEK_GENERATOR_VERSION = 'v1'
export const DAILY_TASK_WEEK_GENERATOR_VERSION_AI = 'v2-ai'

export const isDailyTaskEnabled = (t: DailyTaskDef): boolean => {
  return !(typeof t.disabledAtMs === 'number' && Number.isFinite(t.disabledAtMs))
}

const hashStringToUint32 = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const makeSeededRng = (seed: string): (() => number) => {
  let x = hashStringToUint32(seed) || 0x12345678
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) % 1_000_000) / 1_000_000
  }
}

export type DailyWeekGenResult = {
  week: DailyTaskWeek | null
  warnings: string[]
  error?: string
}

const runRecencyTimestampMs = (r: DailyTaskRun): number => {
  if (typeof r.completedAtMs === 'number' && Number.isFinite(r.completedAtMs) && r.completedAtMs > 0) {
    return r.completedAtMs
  }
  if (typeof r.revealedAtMs === 'number' && Number.isFinite(r.revealedAtMs) && r.revealedAtMs > 0) {
    return r.revealedAtMs
  }
  if (typeof r.selectedAtMs === 'number' && Number.isFinite(r.selectedAtMs) && r.selectedAtMs > 0) {
    return r.selectedAtMs
  }
  return 0
}

/** Last activity timestamp per task id: completed, then revealed, then selected. */
export const buildDailyTaskRecencyMap = (runs: DailyTaskRun[]): Record<string, number> => {
  const lastByTask: Record<string, number> = {}
  const consider = (taskId: string, ts: number) => {
    const id = String(taskId || '').trim()
    if (!id || id === '__none__') return
    if (!Number.isFinite(ts) || ts <= 0) return
    if (!lastByTask[id] || ts > lastByTask[id]) lastByTask[id] = ts
  }
  runs.forEach((r) => {
    const ts = runRecencyTimestampMs(r)
    if (ts <= 0) return
    consider(r.taskId, ts)
    const credit = typeof r.schedulingCreditTaskId === 'string' ? r.schedulingCreditTaskId.trim() : ''
    if (credit) consider(credit, ts)
  })
  return lastByTask
}

/** Merge max timestamp per task from scheduled week grids (days may lack `dailyTaskRuns` docs). */
export function mergeRecencyFromScheduleWeeks(
  lastByTask: Record<string, number>,
  weeks: DailyTaskWeek[] | null | undefined
): void {
  if (!weeks?.length) return
  const nowMs = Date.now()
  for (const week of weeks) {
    if (!week?.days) continue
    Object.entries(week.days).forEach(([dk, entry]) => {
      const tid = entry?.taskId
      if (!tid || tid === '__none__') return
      const dayMs = parseDateKey(dk).getTime()
      if (!Number.isFinite(dayMs)) return
      if (dayMs > nowMs) return // omit future days — avoids bogus recency + negative “days ago” in debug
      if (!lastByTask[tid] || dayMs > lastByTask[tid]) lastByTask[tid] = dayMs
    })
  }
}

/**
 * Marks monthly tasks as satisfied for a calendar month when they already appear on another week's grid.
 * Skips the week being generated so stale future autos on that doc are not treated as locked-in.
 */
function mergeMonthlySatisfiedFromSiblingWeeks(
  satisfiedByMonth: Record<string, Set<string>>,
  siblingWeeks: DailyTaskWeek[] | null | undefined,
  generatingWeekStartDateKey: string,
  monthlyTaskIds: Set<string>
): void {
  if (!siblingWeeks?.length || monthlyTaskIds.size === 0) return
  const genKey = String(generatingWeekStartDateKey || '')
  for (const week of siblingWeeks) {
    if (!week?.days) continue
    const ws = String(week.weekStartDateKey || '')
    if (ws === genKey) continue
    for (const [dk, entry] of Object.entries(week.days)) {
      const tid = String(entry?.taskId || '').trim()
      if (!tid || tid === '__none__') continue
      if (!monthlyTaskIds.has(tid)) continue
      const d = parseDateKey(dk)
      const t = d.getTime()
      if (!Number.isFinite(t)) continue
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`
      if (!satisfiedByMonth[monthKey]) satisfiedByMonth[monthKey] = new Set()
      satisfiedByMonth[monthKey].add(tid)
    }
  }
}

/** Every Sunday `weekStartDateKey` from the week containing `fromDateKey` through the week containing `toDateKey`. */
export function enumerateWeekStartDateKeysInclusive(fromDateKey: string, toDateKey: string): string[] {
  const out: string[] = []
  let ws = getWeekStartDateKeySunday(fromDateKey)
  const endWs = getWeekStartDateKeySunday(toDateKey)
  const maxWeeks = 80
  let n = 0
  while (ws <= endWs && n++ < maxWeeks) {
    out.push(ws)
    ws = addDaysToDateKey(ws, 7)
  }
  return out
}

/** Runs + optional week schedules + optional merge map (same order as `generateDailyTaskWeek`). */
export function buildMergedRecencyMap(
  recentRuns: DailyTaskRun[],
  scheduleWeeks?: DailyTaskWeek[] | null,
  recencyMerge?: Record<string, number> | null
): Record<string, number> {
  let m = buildDailyTaskRecencyMap(recentRuns)
  mergeRecencyFromScheduleWeeks(m, scheduleWeeks)
  if (recencyMerge && typeof recencyMerge === 'object') {
    m = { ...m }
    Object.keys(recencyMerge).forEach((tid) => {
      const ts = recencyMerge[tid]
      if (!Number.isFinite(ts) || ts <= 0) return
      if (!m[tid] || ts > m[tid]) m[tid] = ts
    })
  }
  return m
}

const findOptimalDaysForWeeklyTaskWithRng = (
  quota: number,
  usedDayIndices: number[],
  availableDayIndices: number[],
  rng: () => number
): number[] => {
  const toPlace = quota - usedDayIndices.length
  if (toPlace <= 0) return []

  const allUsed = [...usedDayIndices]
  const result: number[] = []

  for (let i = 0; i < toPlace; i++) {
    let bestDays: number[] = []
    let bestScore = -1

    for (const day of availableDayIndices) {
      if (result.includes(day)) continue

      let minDist: number
      if (allUsed.length === 0) {
        minDist = 7
      } else {
        minDist = Math.min(...allUsed.map((used) => Math.abs(day - used)))
      }

      if (minDist > bestScore) {
        bestScore = minDist
        bestDays = [day]
      } else if (minDist === bestScore) {
        bestDays.push(day)
      }
    }

    if (bestDays.length > 0) {
      const randomIdx = Math.floor(rng() * bestDays.length)
      const bestDay = bestDays[randomIdx]
      result.push(bestDay)
      allUsed.push(bestDay)
    }
  }

  return result
}

export type GenerateDailyTaskWeekArgs = {
  weekStartDateKey: string
  tasks: DailyTaskDef[]
  recentRuns: DailyTaskRun[]
  existingWeek?: DailyTaskWeek | null
  /** If set, preserves past days (before today) from existingWeek as auto. */
  todayDateKey?: string
  /** Pre-filled weekly quota slots (dateKey -> taskId). Only applied to free future slots; must be weekly task ids. */
  weeklyPlacementOverrides?: Record<string, string>
  /** Merged into recency map (max timestamp per task) after runs, e.g. validated AI attributions. */
  recencyMerge?: Record<string, number>
  /** Week docs whose `days` contribute schedule-only recency (max with run-based times). */
  scheduleWeeksForRecency?: DailyTaskWeek[] | null
  /** Stored on generated week (default v1). */
  generatorVersion?: string
}

export const generateDailyTaskWeek = (args: GenerateDailyTaskWeekArgs): DailyWeekGenResult => {
  const {
    weekStartDateKey,
    tasks,
    recentRuns,
    existingWeek,
    todayDateKey,
    weeklyPlacementOverrides,
    recencyMerge,
    scheduleWeeksForRecency,
    generatorVersion: generatorVersionArg,
  } = args
  const warnings: string[] = []
  const generatorVersion = generatorVersionArg || DAILY_TASK_WEEK_GENERATOR_VERSION

  const enabled = (tasks || []).filter(isDailyTaskSchedulable)
  if (enabled.length === 0) {
    return {
      week: {
        weekStartDateKey,
        days: {},
        generatedAtMs: Date.now(),
        generatorVersion,
      },
      warnings: ['No daily tasks are enabled.'],
    }
  }

  const rng = makeSeededRng(`${generatorVersion}:${weekStartDateKey}`)
  let lastByTask = buildMergedRecencyMap(recentRuns, scheduleWeeksForRecency ?? undefined, recencyMerge ?? undefined)

  const recencyScore = (taskId: string): number => {
    const last = lastByTask[taskId]
    return typeof last === 'number' && Number.isFinite(last) ? Date.now() - last : 1e15
  }

  const dateKeys = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(weekStartDateKey, i))
  const dateKeySet = new Set(dateKeys)
  const days: DailyTaskWeek['days'] = {}

  if (existingWeek?.days && typeof existingWeek.days === 'object') {
    Object.keys(existingWeek.days).forEach((dk) => {
      const entry = existingWeek.days[dk]
      if (!entry || typeof entry.taskId !== 'string') return

      const isPastDay = todayDateKey && dk < todayDateKey

      if (entry.source === 'override') {
        days[dk] = parseWeekDayEntry(entry) || createOverrideDayEntry(entry.taskId)
      } else if (isPastDay && entry.taskId) {
        days[dk] = parseWeekDayEntry(entry) || createAutoDayEntry(entry.taskId)
      }
    })
  }

  const weeklyTasks = enabled
    .filter((t) => t.frequency?.type === 'weekly')
    .map((t) => ({ taskId: t.id, quota: (t.frequency as { quotaPerWeek: 1 | 2 | 3 }).quotaPerWeek }))
  const weeklyIdSet = new Set(weeklyTasks.map((w) => w.taskId))

  const slotIsFree = (dk: string) => !days[dk]

  if (weeklyPlacementOverrides && typeof weeklyPlacementOverrides === 'object') {
    Object.entries(weeklyPlacementOverrides).forEach(([dk, tid]) => {
      if (!dateKeySet.has(dk)) {
        warnings.push(`Weekly AI placement ignored: ${dk} is not in this week.`)
        return
      }
      if (todayDateKey && dk < todayDateKey) {
        warnings.push(`Weekly AI placement ignored for past day ${dk}.`)
        return
      }
      if (!slotIsFree(dk)) {
        warnings.push(`Weekly AI placement ignored for ${dk}: slot not free.`)
        return
      }
      const taskId = String(tid || '').trim()
      if (!taskId || !weeklyIdSet.has(taskId)) {
        warnings.push(`Weekly AI placement ignored for ${dk}: invalid weekly task id "${taskId}".`)
        return
      }
      days[dk] = createAutoDayEntry(taskId)
    })
  }

  const lockedTaskCounts: Record<string, number> = {}
  Object.keys(days).forEach((dk) => {
    const tid = days[dk]?.taskId
    if (!tid || tid === '__none__') return
    lockedTaskCounts[tid] = (lockedTaskCounts[tid] || 0) + 1
  })

  const weekEndDateKey = addDaysToDateKey(weekStartDateKey, 6)

  const completionIdsForQuota = (run: DailyTaskRun): string[] => {
    if (!run.completedAtMs) return []
    const out: string[] = []
    const raw = String(run.taskId || '').trim()
    const credit = typeof run.schedulingCreditTaskId === 'string' ? run.schedulingCreditTaskId.trim() : ''
    if (raw && raw !== '__none__') out.push(raw)
    if (credit && !out.includes(credit)) out.push(credit)
    return out
  }

  recentRuns.forEach((run) => {
    if (run.dateKey < weekStartDateKey || run.dateKey > weekEndDateKey) return
    const scheduledId = days[run.dateKey]?.taskId
    completionIdsForQuota(run).forEach((tid) => {
      if (!tid || tid === '__none__') return
      const lockedOnThisDay = scheduledId === tid
      if (!lockedOnThisDay) {
        lockedTaskCounts[tid] = (lockedTaskCounts[tid] || 0) + 1
      }
    })
  })

  const monthlyTasks = enabled.filter((t) => t.frequency?.type === 'monthly')

  const quotaSum = weeklyTasks.reduce((sum, w) => sum + (w.quota || 0), 0)
  if (quotaSum > 7) {
    return {
      week: null,
      warnings,
      error: `Weekly quota sum is ${quotaSum}, but a week only has 7 days. Reduce quotas before generating.`,
    }
  }

  weeklyTasks.forEach((w) => {
    const count = lockedTaskCounts[w.taskId] || 0
    if (count > w.quota) {
      warnings.push(
        `"${w.taskId}" already scheduled/completed ${count}x, exceeding its weekly quota of ${w.quota}.`
      )
    }
  })

  const weekStartDate = parseDateKey(weekStartDateKey)
  const weekEndDate = addDays(weekStartDate, 6)
  const coveredMonths = new Set<string>()
  for (let d = new Date(weekStartDate); d <= weekEndDate; d.setDate(d.getDate() + 1)) {
    coveredMonths.add(`${d.getFullYear()}-${d.getMonth()}`)
  }

  const monthlySatisfiedInMonth: Record<string, Set<string>> = {}
  recentRuns.forEach((run) => {
    if (!run.completedAtMs) return
    const d = parseDateKey(run.dateKey)
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`
    if (!monthlySatisfiedInMonth[monthKey]) monthlySatisfiedInMonth[monthKey] = new Set()
    const tid = String(run.taskId || '').trim()
    if (tid && tid !== '__none__') monthlySatisfiedInMonth[monthKey].add(tid)
    const credit = typeof run.schedulingCreditTaskId === 'string' ? run.schedulingCreditTaskId.trim() : ''
    if (credit) monthlySatisfiedInMonth[monthKey].add(credit)
  })

  const monthlyTaskIdSet = new Set(monthlyTasks.map((t) => t.id))
  const taskNameById = (id: string): string => {
    const t = enabled.find((x) => x.id === id)
    return t?.name?.trim() || id
  }
  mergeMonthlySatisfiedFromSiblingWeeks(
    monthlySatisfiedInMonth,
    scheduleWeeksForRecency ?? undefined,
    weekStartDateKey,
    monthlyTaskIdSet
  )

  const monthlyToSchedule: Map<string, string[]> = new Map()
  coveredMonths.forEach((monthKey) => {
    const satisfiedSet = monthlySatisfiedInMonth[monthKey] || new Set()
    const needsScheduling = monthlyTasks
      .filter((t) => !satisfiedSet.has(t.id))
      .map((t) => t.id)
    monthlyToSchedule.set(
      monthKey,
      sortMonthlyTaskIdsForScheduling(needsScheduling, taskNameById)
    )
  })

  const getAssignedTaskId = (dk: string) => (days[dk]?.taskId ? days[dk]!.taskId : '')

  const weeklyTaskDayIndices: Record<string, number[]> = {}
  dateKeys.forEach((dk, dayIdx) => {
    const entry = days[dk]
    if (entry?.taskId && entry.taskId !== '__none__') {
      const wt = weeklyTasks.find((w) => w.taskId === entry.taskId)
      if (wt) {
        if (!weeklyTaskDayIndices[wt.taskId]) weeklyTaskDayIndices[wt.taskId] = []
        weeklyTaskDayIndices[wt.taskId].push(dayIdx)
      }
    }
  })

  const availableDayIndices: number[] = []
  dateKeys.forEach((dk, dayIdx) => {
    if (slotIsFree(dk)) {
      if (todayDateKey && dk < todayDateKey) return
      availableDayIndices.push(dayIdx)
    }
  })

  const sortedWeeklyTasks = weeklyTasks.slice().sort((a, b) => b.quota - a.quota || a.taskId.localeCompare(b.taskId))

  const usedDayIndices = new Set<number>()

  for (const { taskId, quota } of sortedWeeklyTasks) {
    const alreadyScheduledIndices = weeklyTaskDayIndices[taskId] || []
    const alreadyUsedCount = lockedTaskCounts[taskId] || 0
    const stillNeeded = quota - alreadyUsedCount

    if (stillNeeded <= 0) continue

    const stillAvailable = availableDayIndices.filter((idx) => !usedDayIndices.has(idx))

    if (stillAvailable.length === 0 && stillNeeded > 0) {
      warnings.push(`Not enough free days to place quota task "${taskId}" (needs ${stillNeeded} more).`)
      continue
    }

    const optimalDays = findOptimalDaysForWeeklyTaskWithRng(
      stillNeeded + alreadyScheduledIndices.length,
      alreadyScheduledIndices,
      stillAvailable,
      rng
    ).slice(0, stillNeeded)

    for (const dayIdx of optimalDays) {
      const dk = dateKeys[dayIdx]
      days[dk] = createAutoDayEntry(taskId)
      usedDayIndices.add(dayIdx)
    }
  }

  const normalTasks = enabled.filter((t) => t.frequency?.type === 'normal')
  if (!normalTasks.length && !monthlyTasks.length) {
    warnings.push('No Normal daily tasks exist; remaining days may repeat quota tasks or remain empty.')
  }

  const normalSorted = normalTasks.slice().sort((a, b) => {
    const sa = recencyScore(a.id)
    const sb = recencyScore(b.id)
    if (sb !== sa) return sb - sa
    return a.id.localeCompare(b.id)
  })

  const monthlyScheduledThisGen: Record<string, Set<string>> = {}

  dateKeys.forEach((dk, idx) => {
    if (!slotIsFree(dk)) return
    if (todayDateKey && dk < todayDateKey) return
    const prevTaskId = idx > 0 ? getAssignedTaskId(dateKeys[idx - 1]!) : ''

    const dayDate = parseDateKey(dk)
    const dayMonthKey = `${dayDate.getFullYear()}-${dayDate.getMonth()}`

    let picked: string | null = null
    const needsMonthlyScheduling = monthlyToSchedule.get(dayMonthKey) || []
    const alreadyScheduledThisMonth = monthlyScheduledThisGen[dayMonthKey] || new Set()

    picked = pickMonthlyTaskForDay({
      needsScheduling: needsMonthlyScheduling,
      alreadyScheduledThisMonth,
      prevTaskId,
      nameForId: taskNameById,
    })

    if (picked) {
      if (!monthlyScheduledThisGen[dayMonthKey]) monthlyScheduledThisGen[dayMonthKey] = new Set()
      monthlyScheduledThisGen[dayMonthKey].add(picked)
    }

    if (!picked) {
      const pickFrom = normalSorted.length ? normalSorted : enabled.filter((t) => t.frequency?.type !== 'monthly')
      const prevName = prevTaskId ? taskNameById(prevTaskId) : ''
      const prevIsWindow = prevName ? isWindowCleaningRelatedTaskName(prevName) : false
      let candidates = pickFrom.filter((t) => t.id !== prevTaskId)
      if (prevIsWindow) {
        const nonWindow = candidates.filter((t) => !isWindowCleaningRelatedTaskName(t.name || ''))
        if (nonWindow.length) candidates = nonWindow
      }
      const pool = candidates.length ? candidates : pickFrom

      const best = pool.reduce<{ id: string; score: number } | null>((acc, t) => {
        const base = recencyScore(t.id)
        const jitter = rng() * 0.01
        const tieBreak = (hashStringToUint32(`${weekStartDateKey}:${t.id}`) % 10_000) * 1e-9
        const score = base + jitter + tieBreak
        if (!acc || score > acc.score) return { id: t.id, score }
        return acc
      }, null)
      if (best) picked = best.id
    }

    if (picked) days[dk] = createAutoDayEntry(picked)
  })

  const previousDays = existingWeek?.days || {}
  Object.keys(days).forEach((dk) => {
    const next = parseWeekDayEntry(days[dk])
    if (!next) return
    const prev = parseWeekDayEntry(previousDays[dk])
    days[dk] = preserveApprovedAutoDay(prev, next)
  })

  return {
    week: {
      weekStartDateKey,
      days,
      generatedAtMs: Date.now(),
      generatorVersion,
    },
    warnings,
  }
}
