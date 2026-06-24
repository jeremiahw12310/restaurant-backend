import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import {
  DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT,
  resolveDailyTaskScheduleSystemPrompt,
} from '../constants/dailyTaskScheduleSystemPrompt'
import type { DailyTaskDef, DailyTaskRun, DailyTaskWeek } from './firestore'
import { addDaysToDateKey } from '../utils/dailyTaskWeekGenerator'
import { isDailyTaskSchedulable } from '../utils/dailyTaskArchive'
import { parseWeekDayEntry } from '../utils/dailyTaskApproval'

const COLLECTION = 'aiDailyTaskScheduleRequests'
const TIMEOUT_MS = 12_000

export type DailyTaskScheduleAiWeekInput = {
  weekStartDateKey: string
  existingWeek: DailyTaskWeek | null
  todayDateKey?: string
}

export type DailyTaskScheduleAiPayload = {
  payloadVersion: 1
  catalogTasks: {
    id: string
    name: string
    frequencyType: string
    quotaPerWeek?: number
  }[]
  historyDays: {
    dateKey: string
    taskId: string
    completed: boolean
    historyDisplayName?: string
    override?: boolean
  }[]
  weeks: {
    weekStartDateKey: string
    lockedDayEntries: Record<string, { taskId: string; source: string }>
    freeDateKeys: string[]
    weeklyTasksNeedingPlacements: {
      taskId: string
      name: string
      quotaPerWeek: number
      quotaStillNeeded: number
      alreadyOnDayIndices: number[]
    }[]
  }[]
}

const completionIdsForQuota = (run: DailyTaskRun): string[] => {
  if (!run.completedAtMs) return []
  const out: string[] = []
  const raw = String(run.taskId || '').trim()
  const credit = typeof run.schedulingCreditTaskId === 'string' ? run.schedulingCreditTaskId.trim() : ''
  if (raw && raw !== '__none__') out.push(raw)
  if (credit && !out.includes(credit)) out.push(credit)
  return out
}

function buildWeekSectionForPayload(
  tasks: DailyTaskDef[],
  recentRuns: DailyTaskRun[],
  week: DailyTaskScheduleAiWeekInput
): DailyTaskScheduleAiPayload['weeks'][0] {
  const { weekStartDateKey, existingWeek, todayDateKey } = week
  const enabled = tasks.filter(isDailyTaskSchedulable)
  const dateKeys = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(weekStartDateKey, i))
  const days: DailyTaskWeek['days'] = {}

  if (existingWeek?.days && typeof existingWeek.days === 'object') {
    Object.keys(existingWeek.days).forEach((dk) => {
      const entry = existingWeek.days![dk]
      if (!entry || typeof entry.taskId !== 'string') return
      const isPastDay = todayDateKey && dk < todayDateKey
      if (entry.source === 'override') {
        days[dk] = parseWeekDayEntry(entry) || { taskId: entry.taskId, source: 'override' }
      } else if (isPastDay && entry.taskId) {
        days[dk] = parseWeekDayEntry(entry) || { taskId: entry.taskId, source: 'auto' }
      }
    })
  }

  const lockedTaskCounts: Record<string, number> = {}
  Object.keys(days).forEach((dk) => {
    const tid = days[dk]?.taskId
    if (!tid || tid === '__none__') return
    lockedTaskCounts[tid] = (lockedTaskCounts[tid] || 0) + 1
  })

  const weekEndDateKey = addDaysToDateKey(weekStartDateKey, 6)
  recentRuns.forEach((run) => {
    if (run.dateKey < weekStartDateKey || run.dateKey > weekEndDateKey) return
    const scheduledId = days[run.dateKey]?.taskId
    completionIdsForQuota(run).forEach((tid) => {
      if (!tid || tid === '__none__') return
      if (scheduledId !== tid) {
        lockedTaskCounts[tid] = (lockedTaskCounts[tid] || 0) + 1
      }
    })
  })

  const weeklyTasks = enabled
    .filter((t) => t.frequency?.type === 'weekly')
    .map((t) => ({
      taskId: t.id,
      name: t.name || t.id,
      quotaPerWeek: (t.frequency as { quotaPerWeek: number }).quotaPerWeek,
    }))

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

  const freeDateKeys = dateKeys.filter((dk) => {
    if (days[dk]) return false
    if (todayDateKey && dk < todayDateKey) return false
    return true
  })

  const weeklyTasksNeedingPlacements = weeklyTasks.map((wt) => {
    const used = lockedTaskCounts[wt.taskId] || 0
    const still = Math.max(0, wt.quotaPerWeek - used)
    return {
      taskId: wt.taskId,
      name: wt.name,
      quotaPerWeek: wt.quotaPerWeek,
      quotaStillNeeded: still,
      alreadyOnDayIndices: weeklyTaskDayIndices[wt.taskId] || [],
    }
  })

  const lockedDayEntries: Record<string, { taskId: string; source: string }> = {}
  Object.keys(days).forEach((dk) => {
    const e = days[dk]
    if (e) lockedDayEntries[dk] = { taskId: e.taskId, source: e.source }
  })

  return {
    weekStartDateKey,
    lockedDayEntries,
    freeDateKeys,
    weeklyTasksNeedingPlacements,
  }
}

export function buildDailyTaskSchedulePayload(args: {
  tasks: DailyTaskDef[]
  /** Run docs for history (align with generator recency window, e.g. last 120 days). */
  recentRunsForHistory: DailyTaskRun[]
  weeks: DailyTaskScheduleAiWeekInput[]
}): DailyTaskScheduleAiPayload {
  const { tasks, recentRunsForHistory, weeks } = args
  const enabled = tasks.filter(isDailyTaskSchedulable)

  const catalogTasks = enabled.map((t) => {
    const base = { id: t.id, name: t.name || t.id, frequencyType: t.frequency?.type || 'normal' }
    if (t.frequency?.type === 'weekly') {
      return { ...base, quotaPerWeek: (t.frequency as { quotaPerWeek: number }).quotaPerWeek }
    }
    return base
  })

  const historyDays = recentRunsForHistory
    .slice()
    .sort((a, b) => (a.dateKey || '').localeCompare(b.dateKey || ''))
    .map((r) => ({
      dateKey: r.dateKey,
      taskId: r.taskId,
      completed: typeof r.completedAtMs === 'number' && Number.isFinite(r.completedAtMs),
      ...(r.historyDisplayName ? { historyDisplayName: r.historyDisplayName } : {}),
      ...(r.override ? { override: true } : {}),
    }))

  return {
    payloadVersion: 1,
    catalogTasks,
    historyDays,
    weeks: weeks.map((w) => buildWeekSectionForPayload(tasks, recentRunsForHistory, w)),
  }
}

export type AiScheduleModelWeek = { weekStartDateKey: string; placements: Record<string, string> }
export type AiScheduleModelResult = { weeks: AiScheduleModelWeek[] }

function parseModelJson(text: string): AiScheduleModelResult | null {
  try {
    const data = JSON.parse(text) as unknown
    if (!data || typeof data !== 'object') return null
    const weeks = (data as { weeks?: unknown }).weeks
    if (!Array.isArray(weeks)) return null
    const out: AiScheduleModelWeek[] = []
    for (const w of weeks) {
      if (!w || typeof w !== 'object') continue
      const ws = (w as { weekStartDateKey?: unknown }).weekStartDateKey
      const pl = (w as { placements?: unknown }).placements
      if (typeof ws !== 'string' || !pl || typeof pl !== 'object') continue
      const placements: Record<string, string> = {}
      Object.entries(pl as Record<string, unknown>).forEach(([dk, tid]) => {
        if (typeof dk === 'string' && typeof tid === 'string' && tid.trim()) placements[dk] = tid.trim()
      })
      out.push({ weekStartDateKey: ws, placements })
    }
    return out.length ? { weeks: out } : null
  } catch {
    return null
  }
}

/** Validate AI weekly placements; returns per-week dateKey->taskId maps or null. */
export function validateAiWeeklyPlacements(
  model: AiScheduleModelResult,
  tasks: DailyTaskDef[],
  payloadWeeks: DailyTaskScheduleAiPayload['weeks']
): Record<string, Record<string, string>> | null {
  const enabled = tasks.filter(isDailyTaskSchedulable)
  const weeklyIdSet = new Set(
    enabled.filter((t) => t.frequency?.type === 'weekly').map((t) => t.id)
  )
  const byWeekStart: Record<string, Record<string, string>> = {}

  for (const payloadWeek of payloadWeeks) {
    const hasNeed = payloadWeek.weeklyTasksNeedingPlacements.some((t) => t.quotaStillNeeded > 0)
    if (!hasNeed) {
      byWeekStart[payloadWeek.weekStartDateKey] = {}
      continue
    }

    const modelWeek = model.weeks.find((w) => w.weekStartDateKey === payloadWeek.weekStartDateKey)
    if (!modelWeek) return null

    const freeSet = new Set(payloadWeek.freeDateKeys)
    const needByTask: Record<string, number> = {}
    payloadWeek.weeklyTasksNeedingPlacements.forEach((w) => {
      needByTask[w.taskId] = w.quotaStillNeeded
    })
    const usedByTask: Record<string, number> = {}
    const perDay: Record<string, string> = {}

    for (const [dk, tid] of Object.entries(modelWeek.placements)) {
      if (!freeSet.has(dk)) return null
      if (!weeklyIdSet.has(tid)) return null
      if (perDay[dk]) return null
      if (!(needByTask[tid] > 0)) return null
      perDay[dk] = tid
      usedByTask[tid] = (usedByTask[tid] || 0) + 1
      if (usedByTask[tid] > needByTask[tid]) return null
    }

    for (const w of payloadWeek.weeklyTasksNeedingPlacements) {
      if ((usedByTask[w.taskId] || 0) !== w.quotaStillNeeded) return null
    }

    byWeekStart[payloadWeek.weekStartDateKey] = perDay
  }

  return byWeekStart
}

export function requestDailyTaskScheduleAi(
  payload: DailyTaskScheduleAiPayload,
  systemPrompt?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    let unsub: (() => void) | null = null

    const cleanup = () => {
      if (unsub) {
        unsub()
        unsub = null
      }
    }

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(null)
      }
    }, TIMEOUT_MS)

    const resolvedPrompt = resolveDailyTaskScheduleSystemPrompt(systemPrompt)
    const requestDoc: Record<string, unknown> = {
      status: 'pending',
      payload,
      requestedAt: serverTimestamp(),
    }
    if (resolvedPrompt !== DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT) {
      requestDoc.systemPrompt = resolvedPrompt
    }

    addDoc(collection(db, COLLECTION), requestDoc)
      .then((docRef) => {
        unsub = onSnapshot(docRef, (snap) => {
          const data = snap.data() as Record<string, unknown> | undefined
          if (!data || data.status === 'pending') return

          cleanup()
          clearTimeout(timer)

          if (data.status === 'complete' && typeof data.resultJson === 'string') {
            if (!resolved) {
              resolved = true
              resolve(data.resultJson)
            }
            return
          }
          if (!resolved) {
            resolved = true
            resolve(null)
          }
        })
      })
      .catch((err: unknown) => {
        console.warn('[dailyTaskScheduleAi] Firestore write failed:', err)
        clearTimeout(timer)
        if (!resolved) {
          resolved = true
          resolve(null)
        }
      })
  })
}

export type FetchAiWeeklyScheduleResult = {
  /** Validated weekly slot picks per week start (empty inner object when nothing to place). */
  byWeek: Record<string, Record<string, string>>
  /** True only when an OpenAI request ran and validation succeeded (may still be empty if model had nothing to fix). */
  usedAi: boolean
}

export async function fetchValidatedWeeklyPlacements(args: {
  tasks: DailyTaskDef[]
  recentRunsForHistory: DailyTaskRun[]
  weeks: DailyTaskScheduleAiWeekInput[]
  systemPrompt?: string
}): Promise<FetchAiWeeklyScheduleResult> {
  const payload = buildDailyTaskSchedulePayload(args)
  if (!payload.weeks.some((w) => w.weeklyTasksNeedingPlacements.some((t) => t.quotaStillNeeded > 0))) {
    return { byWeek: {}, usedAi: false }
  }
  const raw = await requestDailyTaskScheduleAi(payload, args.systemPrompt)
  if (!raw) return { byWeek: {}, usedAi: false }
  const model = parseModelJson(raw)
  if (!model) return { byWeek: {}, usedAi: false }
  const validated = validateAiWeeklyPlacements(model, args.tasks, payload.weeks)
  if (!validated) return { byWeek: {}, usedAi: false }
  return { byWeek: validated, usedAi: true }
}
