import type { DailyTaskDef } from '../services/firestore'
import { isDailyTaskArchived, isDailyTaskSchedulable } from './dailyTaskArchive'
import { isDailyTaskEnabled } from './dailyTaskWeekGenerator'

const isDailyTaskDefEnabled = (t: DailyTaskDef): boolean =>
  isDailyTaskEnabled(t)

/** Stable unique id for newly created daily tasks (display `name` stays human-readable). */
export const createNewDailyTaskId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // ignore
  }
  return `daily-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Resolve a task by id. If legacy data has duplicate ids (e.g. soft-deleted + new row),
 * prefer the enabled definition so UI and runs match operator intent.
 */
export const resolveDailyTaskDefFromCatalog = (
  tasks: DailyTaskDef[] | undefined,
  taskId: string | undefined | null
): DailyTaskDef | null => {
  if (!taskId || !tasks?.length) return null
  const matches = tasks.filter((t) => t.id === taskId)
  if (!matches.length) return null
  return (
    matches.find((t) => isDailyTaskSchedulable(t)) ??
    matches.find((t) => isDailyTaskDefEnabled(t) && isDailyTaskArchived(t)) ??
    matches[0] ??
    null
  )
}
