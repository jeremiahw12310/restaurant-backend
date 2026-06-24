import type { DailyTaskDef } from '../services/firestore'
import { isDailyTaskEnabled } from './dailyTaskWeekGenerator'

export function isDailyTaskArchived(t: DailyTaskDef): boolean {
  return typeof t.archivedAtMs === 'number' && Number.isFinite(t.archivedAtMs)
}

/** Eligible for auto-schedule and admin override pickers (not disabled, not archived). */
export function isDailyTaskSchedulable(t: DailyTaskDef): boolean {
  return isDailyTaskEnabled(t) && !isDailyTaskArchived(t)
}

export function getSchedulableDailyTasks(tasks: DailyTaskDef[] | undefined): DailyTaskDef[] {
  return (tasks || []).filter(isDailyTaskSchedulable)
}

export function getActiveDailyTasks(tasks: DailyTaskDef[] | undefined): DailyTaskDef[] {
  return (tasks || []).filter((t) => isDailyTaskEnabled(t) && !isDailyTaskArchived(t))
}

export function getArchivedDailyTasks(tasks: DailyTaskDef[] | undefined): DailyTaskDef[] {
  return (tasks || []).filter((t) => isDailyTaskEnabled(t) && isDailyTaskArchived(t))
}

export function archiveDailyTaskInCatalog(
  catalog: DailyTaskDef[],
  taskId: string
): DailyTaskDef[] {
  const id = taskId.trim()
  if (!id) return catalog
  return catalog.map((t) =>
    t.id === id ? { ...t, archivedAtMs: Date.now(), updatedAtMs: Date.now() } : t
  )
}

export function restoreDailyTaskInCatalog(
  catalog: DailyTaskDef[],
  taskId: string
): DailyTaskDef[] {
  const id = taskId.trim()
  if (!id) return catalog
  return catalog.map((t) => {
    if (t.id !== id) return t
    const next = { ...t, updatedAtMs: Date.now() }
    delete next.archivedAtMs
    return next
  })
}
