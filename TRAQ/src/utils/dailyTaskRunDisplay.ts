import type { DailyTaskDef, DailyTaskRun } from '../services/firestore'
import { resolveDailyTaskDefFromCatalog } from './dailyTaskCatalog'

/** Canonical label for a scheduled "no task" day (matches admin schedule copy). */
export const NO_TASK_DAILY_RUN_LABEL = '— No task —'

/** Title shown in Recent Runs / admin history (catalog name unless overridden). */
export const getDailyTaskRunHistoryTitle = (
  run: DailyTaskRun,
  catalogTasks: DailyTaskDef[] | undefined
): string => {
  const override = (run.historyDisplayName || '').trim()
  if (override.length > 0) return override
  if (run.taskId === '__none__') return NO_TASK_DAILY_RUN_LABEL
  const def = resolveDailyTaskDefFromCatalog(catalogTasks, run.taskId)
  return def?.name || run.taskId
}

/** Joined completer line for display (matches main app completion UX). */
export const formatDailyTaskRunCompletedBy = (run: DailyTaskRun): string => {
  if (run.completedByList && run.completedByList.length) {
    return run.completedByList.map((s) => (s || '').trim()).filter(Boolean).join(' + ')
  }
  return (run.completedBy || '').trim()
}
