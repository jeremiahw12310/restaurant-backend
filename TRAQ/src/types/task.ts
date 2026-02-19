import type { WindowKey } from '../services/firestore'

export type Task = {
  id: string
  name: string
  icon: string
  requirements: string[]
  windows: WindowKey[]
  requiresChecklist?: number // Number of requirements that need to be checked off
  weight?: number // Scoring weight (defaults to 1). Used for labor-heavy tasks.
  askNightShiftComplete?: boolean // Show "Was this completed by night shift?" prompt
  createdAtMs?: number // for admin-created tasks (used for NEW badge + activation)
  disabledAtMs?: number // optional future support
  source?: 'builtin' | 'admin'
  requirementsUpdatedAtMs?: number // when requirements override was last applied
  requirementsOverridden?: boolean
}

export type TaskCompletion = {
  status: 'done'
  assignees: string[]
  completedAt: string
  // Additive schema marker for future-safe evolutions. Missing/undefined implies legacy behavior.
  schemaVersion?: 1 | 2
  assignedByAdmin?: boolean
  completedLate?: boolean
  lateForgiven?: boolean
  completedEarly?: boolean
  autoAssigned?: boolean
  deferredToClose?: string // '9' or '10' - indicates task was auto-completed due to both employees taking 1hr breaks
  // Order Report: number of orders taken by each employee (keyed by employee name)
  orderReportCounts?: Record<string, number>
  // Combined ice tasks: explicit Left/Right assignees (supports same employee for both sides)
  iceSides?: { left: string; right: string }
}

export type EffectiveStatus = 'pending' | 'late' | 'missing' | 'done'



