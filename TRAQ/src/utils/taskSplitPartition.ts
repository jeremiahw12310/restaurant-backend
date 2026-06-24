import type { TaskCompletion, TaskState, TaskOverrides, WindowKey } from '../services/firestore'
import type { TaskLike } from './taskScoring'
import {
  getEffectiveTasksByWindowForDateKey,
  getWeightsForDateKey,
  type WindowMsFns,
} from './taskScoring'

export const SPLIT_SHIFT_WINDOWS: Record<'day' | 'night', WindowKey[]> = {
  day: ['11', '17'],
  night: ['21'],
}

export const ICE_COMBINED_TASK_IDS = ['ice-5pm', 'ice-close'] as const
export const SWEEP_CLOSE_ID = 'sweep-close'
export const MOP_CLOSE_ID = 'mop-close'

export type IceCompletionMode = 'whole' | 'split'

// ============ Semantic task classifier (admin-rename-safe) ============
//
// All "split rules" (always-shared, splittable, mop coupling) are detected from task NAMES
// first, falling back to legacy IDs. This way the rules keep working even if an admin
// renames the underlying built-in task or creates a new one with the right name.

export type TaskRuleClass =
  | 'mop'
  | 'sweep'
  | 'sweep-mats'
  | 'empty-dust-pan'
  | 'drawer'
  | 'tips'
  | 'trash'
  | 'dining-check'
  | 'ice'
  | 'yum-yum'
  | 'bowl-refill'

const LEGACY_CLASS_BY_ID: Record<string, TaskRuleClass> = {
  'mop-close': 'mop',
  'sweep-close': 'sweep',
  'empty-dust-pan': 'empty-dust-pan',
  'count-drawer': 'drawer',
  'night-count-drawer': 'drawer',
  'split-tips': 'tips',
  'split-tips-close': 'tips',
  'take-out-trash': 'trash',
  'dining-area': 'dining-check',
  'dining-area-5pm': 'dining-check',
  'ice-5pm': 'ice',
  'ice-close': 'ice',
  'left-ice-5pm': 'ice',
  'right-ice-5pm': 'ice',
  'left-ice-close': 'ice',
  'right-ice-close': 'ice',
  'yum-yum-close': 'yum-yum',
  'bowl-refill': 'bowl-refill',
  'bowl-refill-close': 'bowl-refill',
}

/** Minimal task shape we read for classification. `name` is optional because TaskLike
 * (used by deterministic partitioning) doesn't carry it; full `Task` objects do. */
export type ClassifiableTask = { id: string; name?: string | null; requiresSplit?: boolean }

export function classifyTaskByName(task: ClassifiableTask | undefined | null): TaskRuleClass | null {
  if (!task) return null
  const name = String((task as { name?: string | null }).name || '')
    .toLowerCase()
    .trim()
  const idHit = LEGACY_CLASS_BY_ID[task.id] ?? null
  if (!name) return idHit
  const has = (rx: RegExp) => rx.test(name)
  // Most specific first.
  if (has(/\bmop\b/) && !has(/\bsweep\b/)) return 'mop'
  if (has(/\bsweep\b/) && has(/\bmats?\b/)) return 'sweep-mats'
  if (has(/\bsweep\b/)) return 'sweep'
  if (has(/\bdust\s?pan\b/)) return 'empty-dust-pan'
  if (has(/\bdrawer\b/)) return 'drawer'
  if (has(/\btips?\b/)) return 'tips'
  if (has(/\b(trash|garbage)\b/)) return 'trash'
  if (has(/\bdining\b/)) return 'dining-check'
  if (has(/\bice\b/)) return 'ice'
  if (has(/\byum\s?yum\b/)) return 'yum-yum'
  if (has(/\bbowl\b/) && has(/\brefill\b/)) return 'bowl-refill'
  return idHit
}

const SPLITTABLE_CLASSES: ReadonlySet<TaskRuleClass> = new Set([
  'ice',
  'yum-yum',
  'bowl-refill',
  'trash',
  'dining-check',
])

const ALWAYS_SHARED_CLASSES: ReadonlySet<TaskRuleClass> = new Set(['trash', 'dining-check'])

/** Build a classification lookup limited to the current split candidates. */
function classifyCandidates(
  candidateIds: string[],
  allTasks: TaskLike[],
): { byId: Map<string, TaskRuleClass | null>; idsByClass: Partial<Record<TaskRuleClass, string[]>> } {
  const taskById = new Map<string, TaskLike>(allTasks.map((t) => [t.id, t]))
  const byId = new Map<string, TaskRuleClass | null>()
  const idsByClass: Partial<Record<TaskRuleClass, string[]>> = {}
  for (const tid of candidateIds) {
    const klass = classifyTaskByName(taskById.get(tid))
    byId.set(tid, klass)
    if (klass) {
      if (!idsByClass[klass]) idsByClass[klass] = []
      idsByClass[klass]!.push(tid)
    }
  }
  return { byId, idsByClass }
}

/**
 * True when a task is "always shared / required" — trash + dining check by name,
 * or an admin `requiresSplit` task. (Balance-heuristic shares return false.)
 */
export function isAlwaysSharedShareTask(task: ClassifiableTask | undefined | null): boolean {
  const klass = classifyTaskByName(task)
  if (klass && ALWAYS_SHARED_CLASSES.has(klass)) return true
  return !!task?.requiresSplit
}

/** Always-shared candidate task ids (trash + dining check by name, plus admin requiresSplit). */
function getAlwaysSharedCandidateIds(candidateIds: string[], allTasks: TaskLike[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const taskById = new Map(allTasks.map((t) => [t.id, t]))
  for (const tid of candidateIds) {
    const task = taskById.get(tid)
    const klass = classifyTaskByName(task)
    if (klass && ALWAYS_SHARED_CLASSES.has(klass)) {
      if (!seen.has(tid)) {
        seen.add(tid)
        out.push(tid)
      }
      continue
    }
    if (task?.requiresSplit) {
      if (!seen.has(tid)) {
        seen.add(tid)
        out.push(tid)
      }
    }
  }
  return out
}

/** Tasks the AI may consider sharing (panel will render on both sides). */
function getSplittableCandidateIds(candidateIds: string[], allTasks: TaskLike[]): string[] {
  const out: string[] = []
  const taskById = new Map(allTasks.map((t) => [t.id, t]))
  for (const tid of candidateIds) {
    const klass = classifyTaskByName(taskById.get(tid))
    if (klass && SPLITTABLE_CLASSES.has(klass)) out.push(tid)
  }
  return out
}

export type MopCoupling = {
  /** Every mop-classified task in the window — must share one assignee (single mopper). */
  mopTaskIds: string[]
  /** Tasks that must be on the SAME person as the mopper (e.g. sweep mats). */
  forceMopperTaskIds: string[]
  /** Tasks that must be on the OPPOSITE person from the mopper (sweep, dust pan, drawer, tips). */
  forcePartnerTaskIds: string[]
}

const MOP_MOPPER_CLASSES: ReadonlySet<TaskRuleClass> = new Set(['sweep-mats'])

const MOP_OPPOSITE_CLASSES: ReadonlySet<TaskRuleClass> = new Set([
  'sweep',
  'empty-dust-pan',
  'drawer',
  'tips',
])

function getMopCoupling(candidateIds: string[], allTasks: TaskLike[]): MopCoupling | null {
  const { byId } = classifyCandidates(candidateIds, allTasks)
  const mopTaskIds = candidateIds.filter((tid) => byId.get(tid) === 'mop').sort()
  if (mopTaskIds.length === 0) return null
  const mopSet = new Set(mopTaskIds)
  const forceMopperTaskIds: string[] = []
  const forcePartnerTaskIds: string[] = []
  for (const tid of candidateIds) {
    if (mopSet.has(tid)) continue
    const klass = byId.get(tid)
    if (klass && MOP_MOPPER_CLASSES.has(klass)) forceMopperTaskIds.push(tid)
    else if (klass && MOP_OPPOSITE_CLASSES.has(klass)) forcePartnerTaskIds.push(tid)
  }
  return { mopTaskIds, forceMopperTaskIds, forcePartnerTaskIds }
}

function violatesMopCoupling(assignment: Record<string, string>, coupling: MopCoupling | null): boolean {
  if (!coupling || coupling.mopTaskIds.length === 0) return false
  const owners: string[] = []
  for (const tid of coupling.mopTaskIds) {
    const who = assignment[tid]
    if (who) owners.push(who)
  }
  if (owners.length >= 2) {
    const first = owners[0]
    if (first && owners.some((w) => w !== first)) return true
  }
  const mopper = owners[0]
  if (!mopper) return false
  if (coupling.forceMopperTaskIds.some((tid) => assignment[tid] && assignment[tid] !== mopper)) return true
  return coupling.forcePartnerTaskIds.some((tid) => assignment[tid] === mopper)
}

function repairMopCoupling(
  assignment: Record<string, string>,
  coupling: MopCoupling | null,
  employeeA: string,
  employeeB: string,
): Record<string, string> {
  if (!coupling || coupling.mopTaskIds.length === 0) return assignment
  const sortedMops = [...coupling.mopTaskIds].sort()
  const canonical = sortedMops[0]!
  const mopper = assignment[canonical] ?? employeeA
  const partner = mopper === employeeA ? employeeB : employeeA
  const next = { ...assignment }
  for (const tid of sortedMops) {
    next[tid] = mopper
  }
  for (const tid of coupling.forceMopperTaskIds) {
    next[tid] = mopper
  }
  for (const tid of coupling.forcePartnerTaskIds) {
    if (next[tid] === mopper) next[tid] = partner
  }
  return next
}

export type SplitRulesInfo = {
  alwaysSharedTaskIds: string[]
  splittableTaskIds: string[]
  mopCoupling: MopCoupling | null
  /**
   * Plain-English summary the AI can quote in its rationale.
   * Always emitted (even when no constraints apply) so the model has consistent context.
   */
  rulesText: string
}

/** Build the structured rules info that gets passed to the AI (and reused for forced-shared). */
export function buildSplitRulesInfo(args: {
  candidateTaskIds: string[]
  allTasks: TaskLike[]
  windowKey: '17' | '21'
}): SplitRulesInfo {
  const alwaysSharedTaskIds = getAlwaysSharedCandidateIds(args.candidateTaskIds, args.allTasks)
  const splittableTaskIds = getSplittableCandidateIds(args.candidateTaskIds, args.allTasks)
  const mopCoupling = getMopCoupling(args.candidateTaskIds, args.allTasks)
  const nameById = new Map<string, string>(
    args.allTasks.map((t) => [t.id, String((t as { name?: string | null }).name || t.id)]),
  )
  const nameOf = (tid: string) => nameById.get(tid) || tid
  const lines: string[] = []
  lines.push(
    `These tasks can be split between two people (assignees=[A,B], half points each): ice, yum yum sauce, bowl refill, trash, dining area check.`,
  )
  if (alwaysSharedTaskIds.length) {
    lines.push(`These present tasks MUST be split between both employees, no excuses: ${alwaysSharedTaskIds.map(nameOf).join(', ')}.`)
  }
  if (mopCoupling) {
    const mopNames = mopCoupling.mopTaskIds.map(nameOf)
    const withMopper = mopCoupling.forceMopperTaskIds.map(nameOf)
    const opp = mopCoupling.forcePartnerTaskIds.map(nameOf)
    const mopPhrase =
      mopNames.length === 1
        ? `If one employee does "${mopNames[0]}" (the only mop task)`
        : `Exactly ONE employee does ALL mop tasks (${mopNames.join('; ')}) — never split mops across two people`
    if (withMopper.length) {
      lines.push(
        `The mopper also does: ${withMopper.join(', ')}.`,
      )
    }
    lines.push(
      `${mopPhrase}, the OTHER employee must do all of these instead (they cannot share with the mopper): ${
        opp.length ? opp.join(', ') : '(none present in this window)'
      }.`,
    )
    lines.push(
      `The mopper does NOT count the drawer or tips for this shift. Drawer and tips, if present, go to the non-mopper.`,
    )
  }
  lines.push(
    `Balance objective: equalize the total weighted points each employee earns in this single window. Do NOT compensate for past windows (e.g. 11AM imbalance). The goal is fair WORKLOAD this window.`,
  )
  return {
    alwaysSharedTaskIds,
    splittableTaskIds,
    mopCoupling,
    rulesText: lines.join(' '),
  }
}

/** Same shape as TaskCard / App: "done" for split eligibility (excludes partial ice/towel). */
export function isTaskDoneForSplit(taskId: string, completion: TaskCompletion | undefined): boolean {
  if (!completion || completion.status !== 'done') return false
  const isPartialIce =
    (taskId === 'ice-5pm' || taskId === 'ice-close') &&
    completion.iceSides &&
    (!String(completion.iceSides.left || '').trim() || !String(completion.iceSides.right || '').trim())
  const isPartialTowel =
    (taskId === 'towels' || taskId === 'towels-5pm' || taskId === 'towels-close') &&
    completion.towelSides &&
    (!String(completion.towelSides.diningBar || '').trim() || !String(completion.towelSides.bowlStation || '').trim())
  if (!isPartialIce && !isPartialTowel) return true
  return false
}

/** Tasks deferred to close do not earn 5PM day credit — exclude from 5PM split suggestions. */
export function isDeferredFivePmTask(completion: TaskCompletion | undefined): boolean {
  return !!completion?.deferredToClose
}

export function buildHypotheticalCompletion(
  taskId: string,
  assignee: string,
  partner: string,
  iceMode: IceCompletionMode = 'whole',
): TaskCompletion {
  const iso = new Date().toISOString()
  if (taskId === 'ice-5pm' || taskId === 'ice-close') {
    if (iceMode === 'split') {
      const left = assignee.trim()
      const right = partner.trim()
      return {
        status: 'done',
        assignees: [left, right],
        completedAt: iso,
        iceSides: { left, right },
      }
    }
    return {
      status: 'done',
      assignees: [assignee],
      completedAt: iso,
      iceSides: { left: assignee, right: assignee },
    }
  }
  if (taskId === 'towels' || taskId === 'towels-5pm' || taskId === 'towels-close') {
    return {
      status: 'done',
      assignees: [assignee],
      completedAt: iso,
      towelSides: { diningBar: assignee, bowlStation: assignee },
    }
  }
  if (taskId === 'order-report-5pm' || taskId === 'order-report-close') {
    const a = assignee.trim()
    const b = partner.trim()
    return {
      status: 'done',
      assignees: [a, b],
      completedAt: iso,
      orderReportCounts: { [a]: 1000, [b]: 0 },
    }
  }
  return { status: 'done', assignees: [assignee], completedAt: iso }
}

/**
 * Pure window-only weighted-points objective.
 *
 * IMPORTANT: this intentionally ignores any history from other windows (e.g. 11AM
 * completion imbalance). We want a FAIR WORKLOAD for the current window — not to
 * compensate for who showed up early. The leaderboard math (taskScoring.ts) keeps
 * the 80/20 day-shift weighting; only the split partitioning uses this objective.
 *
 * Shared tasks (in `sharedTaskIds`) and split-ice count half-weight on each side.
 */
function projectedWindowPoints(args: {
  windowKey: '17' | '21'
  assignment: Record<string, string>
  sharedTaskIds: ReadonlySet<string>
  iceMode: IceCompletionMode
  employeeA: string
  employeeB: string
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
  dateKey: string
}): { scoreA: number; scoreB: number; scoreFloatA: number; scoreFloatB: number } {
  const { taskWeightByIdByWindow } = getWeightsForDateKey({
    dateKey: args.dateKey,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
  const wmap = taskWeightByIdByWindow[args.windowKey] || {}
  let pA = 0
  let pB = 0
  for (const [tid, who] of Object.entries(args.assignment)) {
    const wRaw = wmap[tid]
    const w = Number.isFinite(wRaw) && (wRaw as number) > 0 ? (wRaw as number) : 1
    const isIceSplit = args.iceMode === 'split' && (tid === 'ice-5pm' || tid === 'ice-close')
    if (isIceSplit || args.sharedTaskIds.has(tid)) {
      pA += w / 2
      pB += w / 2
      continue
    }
    if (who === args.employeeA) pA += w
    else if (who === args.employeeB) pB += w
  }
  return {
    scoreA: Math.round(pA),
    scoreB: Math.round(pB),
    scoreFloatA: pA,
    scoreFloatB: pB,
  }
}

/**
 * Task ids in the current window that participate in fair-split weighting (positive weight,
 * effective for the date, 5PM deferred exclusions). Superset used by {@link getIncompleteSplitCandidateTaskIds}
 * (this list includes tasks already marked done) — e.g. for showing pre-split completions in the suggest panel.
 */
export function getSplitWindowEffectiveTaskIds(args: {
  dateKey: string
  windowKey: '17' | '21'
  taskState: TaskState
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
}): string[] {
  const effective = getEffectiveTasksByWindowForDateKey({
    dateKey: args.dateKey,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
  const { taskWeightByIdByWindow } = getWeightsForDateKey({
    dateKey: args.dateKey,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
  const windowMap = args.taskState[args.dateKey]?.[args.windowKey] || {}
  const ids: string[] = []
  for (const t of effective[args.windowKey] || []) {
    const w = taskWeightByIdByWindow[args.windowKey]?.[t.id] ?? t.weight ?? 1
    if (!Number.isFinite(w) || w <= 0) continue
    const c = windowMap[t.id]
    if (args.windowKey === '17' && isDeferredFivePmTask(c)) continue
    ids.push(t.id)
  }
  return ids
}

export function getIncompleteSplitCandidateTaskIds(args: {
  dateKey: string
  windowKey: '17' | '21'
  taskState: TaskState
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
}): string[] {
  const windowMap = args.taskState[args.dateKey]?.[args.windowKey] || {}
  return getSplitWindowEffectiveTaskIds(args).filter((id) => !isTaskDoneForSplit(id, windowMap[id]))
}

export type FairSplitResult = {
  assignment: Record<string, string>
  /** employeeA -> task ids */
  tasksForA: string[]
  tasksForB: string[]
  projectedScoreFloatA: number
  projectedScoreFloatB: number
  projectedScoreA: number
  projectedScoreB: number
  scoreDiff: number
  iceMode: IceCompletionMode
  /** Present when iceMode is split — keyed by ice-5pm / ice-close */
  iceSplitAssignment?: Record<string, { left: string; right: string }>
  /**
   * Non-ice/non-towel task ids that are SHARED between A and B (assignees=[A,B] on completion,
   * split-points). Empty when the heuristic doesn't improve balance.
   */
  sharedTaskIds: string[]
}

/** Payload shape for Firestore / Cloud Function (keep in sync with functions/src/ai/taskSplitTypes.ts). */
export type TaskSplitVariantPayload = {
  mask: number
  assignment: Record<string, string>
  projectedScoreFloatA: number
  projectedScoreFloatB: number
  scoreDiff: number
  iceMode?: IceCompletionMode
  iceSplitAssignment?: Record<string, { left: string; right: string }>
  /** Non-ice/non-towel task ids the panel should render on BOTH sides. */
  sharedTaskIds?: string[]
}

export function fairSplitResultToVariant(r: FairSplitResult, mask: number): TaskSplitVariantPayload {
  const v: TaskSplitVariantPayload = {
    mask,
    assignment: r.assignment,
    projectedScoreFloatA: r.projectedScoreFloatA,
    projectedScoreFloatB: r.projectedScoreFloatB,
    scoreDiff: r.scoreDiff,
    iceMode: r.iceMode,
  }
  if (r.iceSplitAssignment && Object.keys(r.iceSplitAssignment).length) {
    v.iceSplitAssignment = r.iceSplitAssignment
  }
  if (r.sharedTaskIds && r.sharedTaskIds.length) {
    v.sharedTaskIds = r.sharedTaskIds
  }
  return v
}

function sortedSharedIds(v: TaskSplitVariantPayload): string[] {
  return [...(v.sharedTaskIds || [])].sort()
}

function iceSplitEqual(
  a?: Record<string, { left: string; right: string }>,
  b?: Record<string, { left: string; right: string }>,
): boolean {
  const keysA = Object.keys(a || {}).sort()
  const keysB = Object.keys(b || {}).sort()
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]!
    const sa = a![k]
    const sb = b![k]
    if (!sa || !sb || sa.left !== sb.left || sa.right !== sb.right) return false
  }
  return true
}

/** True when assignment, shared tasks, and ice layout all match. */
export function variantsAreEqual(a: TaskSplitVariantPayload, b: TaskSplitVariantPayload): boolean {
  const allKeys = new Set([...Object.keys(a.assignment), ...Object.keys(b.assignment)])
  for (const k of allKeys) {
    if ((a.assignment[k] || '') !== (b.assignment[k] || '')) return false
  }
  if (sortedSharedIds(a).join(',') !== sortedSharedIds(b).join(',')) return false
  if ((a.iceMode || 'whole') !== (b.iceMode || 'whole')) return false
  if (!iceSplitEqual(a.iceSplitAssignment, b.iceSplitAssignment)) return false
  return true
}

/** Higher = more different from previous (used to rank regenerate alternatives). */
export type RegenerateSplitContext = {
  weightByTaskId: Record<string, number>
  alwaysSharedIds: ReadonlySet<string>
  mopCoupling: MopCoupling | null
}

function getMopOwnerFromAssignment(
  assignment: Record<string, string>,
  mopCoupling: MopCoupling | null,
): string | null {
  if (!mopCoupling?.mopTaskIds.length) return null
  const canonical = [...mopCoupling.mopTaskIds].sort()[0]!
  return assignment[canonical] ?? null
}

/** Sole-assign tasks whose owner changed (excludes always-shared). */
export function countSoleAssignSwaps(
  previous: TaskSplitVariantPayload,
  candidate: TaskSplitVariantPayload,
  alwaysSharedIds: ReadonlySet<string>,
): number {
  const allKeys = new Set([...Object.keys(previous.assignment), ...Object.keys(candidate.assignment)])
  let count = 0
  for (const k of allKeys) {
    if (alwaysSharedIds.has(k)) continue
    if ((previous.assignment[k] || '') !== (candidate.assignment[k] || '')) count++
  }
  return count
}

export function variantDifferenceScore(
  previous: TaskSplitVariantPayload,
  candidate: TaskSplitVariantPayload,
  ctx?: RegenerateSplitContext,
): number {
  const allKeys = new Set([...Object.keys(previous.assignment), ...Object.keys(candidate.assignment)])
  let diff = 0
  if (ctx) {
    for (const k of allKeys) {
      if (ctx.alwaysSharedIds.has(k)) continue
      if ((previous.assignment[k] || '') !== (candidate.assignment[k] || '')) {
        diff += ctx.weightByTaskId[k] ?? 1
      }
    }
    const prevMop = getMopOwnerFromAssignment(previous.assignment, ctx.mopCoupling)
    const candMop = getMopOwnerFromAssignment(candidate.assignment, ctx.mopCoupling)
    if (prevMop && candMop && prevMop !== candMop) diff += 15
  } else {
    for (const k of allKeys) {
      if ((previous.assignment[k] || '') !== (candidate.assignment[k] || '')) diff++
    }
  }
  if (sortedSharedIds(previous).join(',') !== sortedSharedIds(candidate).join(',')) diff += 5
  if ((previous.iceMode || 'whole') !== (candidate.iceMode || 'whole')) diff += 10
  if (!iceSplitEqual(previous.iceSplitAssignment, candidate.iceSplitAssignment)) diff += 10
  return diff
}

/** Reorder/filter variants for regenerate: drop identical to previous, sort by swap distance. */
export function prepareVariantsForRegenerate(
  variants: TaskSplitVariantPayload[],
  previousSuggestion: TaskSplitVariantPayload,
): TaskSplitVariantPayload[] {
  const filtered = variants.filter((v) => !variantsAreEqual(v, previousSuggestion))
  const pool = filtered.length > 0 ? filtered : [...variants]
  return [...pool].sort(
    (a, b) =>
      variantDifferenceScore(previousSuggestion, b, undefined) -
      variantDifferenceScore(previousSuggestion, a, undefined),
  )
}

function maskFromAssignment(
  candidateIds: string[],
  assignment: Record<string, string>,
  _employeeA: string,
  employeeB: string,
): number {
  let mask = 0
  for (let i = 0; i < candidateIds.length; i++) {
    if (assignment[candidateIds[i]!] === employeeB) mask |= 1 << i
  }
  return mask
}

function fairSplitFromAssignment(
  assignment: Record<string, string>,
  candidateIds: string[],
  employeeA: string,
  employeeB: string,
  dateKey: string,
  windowKey: '17' | '21',
  allTasks: TaskLike[],
  taskOverrides: TaskOverrides | null | undefined,
  windowMs: WindowMsFns,
  iceMode: IceCompletionMode = 'whole',
): FairSplitResult {
  const ids = [...candidateIds].sort()
  const mopCoupling = getMopCoupling(ids, allTasks)
  const forcedSharedIds = getAlwaysSharedCandidateIds(ids, allTasks)
  const forcedSharedSet: ReadonlySet<string> = new Set(forcedSharedIds)
  const fixed = repairMopCoupling(assignment, mopCoupling, employeeA, employeeB)
  const brute: BruteArgs = {
    dateKey,
    windowKey,
    employeeA,
    employeeB,
    candidateTaskIds: ids,
    allTasks,
    taskOverrides,
    windowMs,
    iceMode,
    mopCoupling,
    forcedSharedSet,
  }
  const finalScores = objective(brute, fixed)
  const base = finalizeFairSplitResult(employeeA, employeeB, fixed, finalScores, iceMode)
  base.sharedTaskIds = Array.from(new Set([...forcedSharedIds, ...base.sharedTaskIds]))
  return applySharedTaskHeuristic(base, {
    dateKey,
    windowKey,
    employeeA,
    employeeB,
    allTasks,
    taskOverrides,
    windowMs,
  })
}

function buildMopBlockFlipAssignment(
  previous: TaskSplitVariantPayload,
  employeeA: string,
  employeeB: string,
  mopCoupling: MopCoupling | null,
): Record<string, string> | null {
  if (!mopCoupling?.mopTaskIds.length) return null
  const assignment = { ...previous.assignment }
  const canonical = [...mopCoupling.mopTaskIds].sort()[0]!
  const currentMopper = assignment[canonical] ?? employeeA
  const newMopper = currentMopper === employeeA ? employeeB : employeeA
  assignment[canonical] = newMopper
  return repairMopCoupling(assignment, mopCoupling, employeeA, employeeB)
}

function complementRawMask(
  prevMask: number,
  n: number,
  skipIndices: ReadonlySet<number>,
): number {
  let mask = prevMask
  for (let i = 0; i < n; i++) {
    if (skipIndices.has(i)) continue
    mask ^= 1 << i
  }
  return mask
}

function dedupeVariants(variants: TaskSplitVariantPayload[]): TaskSplitVariantPayload[] {
  const out: TaskSplitVariantPayload[] = []
  for (const v of variants) {
    if (out.some((x) => variantsAreEqual(x, v))) continue
    out.push(v)
  }
  return out
}

function sortRegenerateVariants(
  variants: TaskSplitVariantPayload[],
  previous: TaskSplitVariantPayload,
  ctx: RegenerateSplitContext,
): TaskSplitVariantPayload[] {
  return [...variants].sort((a, b) => {
    const swapDiff = variantDifferenceScore(previous, b, ctx) - variantDifferenceScore(previous, a, ctx)
    if (swapDiff !== 0) return swapDiff
    return a.scoreDiff - b.scoreDiff
  })
}

function filterRegeneratePool(
  variants: TaskSplitVariantPayload[],
  previous: TaskSplitVariantPayload,
  ctx: RegenerateSplitContext,
  minSoleSwaps: number,
): TaskSplitVariantPayload[] {
  return variants.filter((v) => {
    if (variantsAreEqual(v, previous)) return false
    return countSoleAssignSwaps(previous, v, ctx.alwaysSharedIds) >= minSoleSwaps
  })
}

const REGEN_MASK_EVAL_CAP = 32
const REGEN_SCORE_SLACK = 2.0
const REGEN_COLLECTED_MAX = 64

function popcount(x: number): number {
  let bits = 0
  let v = x
  while (v) {
    bits += v & 1
    v >>>= 1
  }
  return bits
}

/** Cheap rank: prefer masks far from previous (Hamming), then lower score diff. */
function rankedMaskCandidatesForRegenerate(
  diffs: number[],
  total: number,
  maxScoreDiff: number,
  prevMask: number,
  cap: number,
): number[] {
  const candidates: { mask: number; hamming: number; diff: number }[] = []
  for (let mask = 0; mask < total; mask++) {
    const diff = diffs[mask]!
    if (!Number.isFinite(diff) || diff > maxScoreDiff) continue
    candidates.push({ mask, hamming: popcount(mask ^ prevMask), diff })
  }
  candidates.sort((a, b) => b.hamming - a.hamming || a.diff - b.diff || a.mask - b.mask)
  return candidates.slice(0, cap).map((c) => c.mask)
}

function finalizeRegeneratePool(
  collected: TaskSplitVariantPayload[],
  previous: TaskSplitVariantPayload,
  ctx: RegenerateSplitContext,
  maxVariants: number,
): TaskSplitVariantPayload[] {
  let pool = collected
  if (pool.length > REGEN_COLLECTED_MAX) {
    console.warn(
      `[taskSplitPartition] regenerate pool truncated from ${pool.length} to ${REGEN_COLLECTED_MAX}`,
    )
    pool = pool.slice(0, REGEN_COLLECTED_MAX)
  }
  pool = dedupeVariants(pool)
  for (const minSwaps of [2, 1, 0] as const) {
    const filtered = filterRegeneratePool(pool, previous, ctx, minSwaps)
    if (filtered.length > 0) {
      pool = filtered
      break
    }
  }
  return sortRegenerateVariants(pool, previous, ctx).slice(0, maxVariants)
}

/** Swap-heavy fair variants for Regenerate (wider score band, min flip distance from previous). */
export function buildRegenerateSplitVariants(args: {
  taskState?: TaskState
  dateKey: string
  windowKey: '17' | '21'
  employeeA: string
  employeeB: string
  candidateTaskIds: string[]
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
  soloModeActive?: boolean
  forceIceMode?: IceCompletionMode
  previousSuggestion: TaskSplitVariantPayload
  maxVariants?: number
}): TaskSplitVariantPayload[] {
  const ids = [...args.candidateTaskIds].sort()
  const n = ids.length
  const maxVariants = args.maxVariants ?? 8
  const alwaysSharedIds = new Set(getAlwaysSharedCandidateIds(ids, args.allTasks))
  const mopCoupling = getMopCoupling(ids, args.allTasks)
  const { taskWeightByIdByWindow } = getWeightsForDateKey({
    dateKey: args.dateKey,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
  const wmap = taskWeightByIdByWindow[args.windowKey] || {}
  const ctx: RegenerateSplitContext = { weightByTaskId: wmap, alwaysSharedIds, mopCoupling }
  const previous = args.previousSuggestion
  const forcedSharedSet: ReadonlySet<string> = alwaysSharedIds
  const tryIceModes: IceCompletionMode[] = args.forceIceMode
    ? [args.forceIceMode]
    : hasCombinedIceCandidate(ids)
      ? ['whole', 'split']
      : ['whole']
  const prevIceMode = previous.iceMode === 'split' ? 'split' : 'whole'

  const pushVariant = (
    acc: TaskSplitVariantPayload[],
    result: FairSplitResult,
    maskTag: number,
  ) => {
    acc.push(fairSplitResultToVariant(result, maskTag))
  }

  const tryInjectSpecialVariants = (
    acc: TaskSplitVariantPayload[],
    iceMode: IceCompletionMode,
    maxScoreDiff: number,
  ) => {
    const mopFlip = buildMopBlockFlipAssignment(previous, args.employeeA, args.employeeB, mopCoupling)
    if (mopFlip) {
      const r = fairSplitFromAssignment(
        mopFlip,
        ids,
        args.employeeA,
        args.employeeB,
        args.dateKey,
        args.windowKey,
        args.allTasks,
        args.taskOverrides,
        args.windowMs,
        iceMode,
      )
      if (r.scoreDiff <= maxScoreDiff) pushVariant(acc, r, -3)
    }

    const prevMask = maskFromAssignment(ids, previous.assignment, args.employeeA, args.employeeB)
    const skipIndices = new Set<number>()
    for (let i = 0; i < ids.length; i++) {
      if (alwaysSharedIds.has(ids[i]!)) skipIndices.add(i)
    }
    const compMask = complementRawMask(prevMask, n, skipIndices)
    const compAssignment = repairMopCoupling(
      assignmentFromMask(ids, compMask, args.employeeA, args.employeeB),
      mopCoupling,
      args.employeeA,
      args.employeeB,
    )
    const compResult = fairSplitFromAssignment(
      compAssignment,
      ids,
      args.employeeA,
      args.employeeB,
      args.dateKey,
      args.windowKey,
      args.allTasks,
      args.taskOverrides,
      args.windowMs,
      iceMode,
    )
    if (compResult.scoreDiff <= maxScoreDiff) pushVariant(acc, compResult, -4)
  }

  if (n === 0) return []

  if (n > SPLIT_BRUTE_MAX) {
    const acc: TaskSplitVariantPayload[] = []
    const best = findBestFairSplit({
      taskState: args.taskState,
      dateKey: args.dateKey,
      windowKey: args.windowKey,
      employeeA: args.employeeA,
      employeeB: args.employeeB,
      candidateTaskIds: ids,
      allTasks: args.allTasks,
      taskOverrides: args.taskOverrides,
      windowMs: args.windowMs,
      soloModeActive: args.soloModeActive,
      forceIceMode: args.forceIceMode,
    })
    const bestDiff = best.scoreDiff
    const maxScoreDiff = Math.max(bestDiff + REGEN_SCORE_SLACK, REGEN_SCORE_SLACK)
    tryInjectSpecialVariants(acc, prevIceMode, maxScoreDiff)

    const flippable = ids
      .filter((id) => !alwaysSharedIds.has(id))
      .sort((a, b) => (wmap[b] ?? 1) - (wmap[a] ?? 1))
    let working = { ...previous.assignment }
    for (const tid of flippable) {
      const who = working[tid]
      if (!who) continue
      const partner = who === args.employeeA ? args.employeeB : args.employeeA
      working = repairMopCoupling({ ...working, [tid]: partner }, mopCoupling, args.employeeA, args.employeeB)
      const r = fairSplitFromAssignment(
        working,
        ids,
        args.employeeA,
        args.employeeB,
        args.dateKey,
        args.windowKey,
        args.allTasks,
        args.taskOverrides,
        args.windowMs,
        prevIceMode,
      )
      if (r.scoreDiff <= maxScoreDiff) pushVariant(acc, r, -5 - acc.length)
      if (acc.length >= maxVariants + 4) break
    }

    return finalizeRegeneratePool(acc, previous, ctx, maxVariants)
  }

  const prevMask = maskFromAssignment(ids, previous.assignment, args.employeeA, args.employeeB)
  const collected: TaskSplitVariantPayload[] = []

  for (const iceMode of tryIceModes) {
    const brute: BruteArgs = {
      dateKey: args.dateKey,
      windowKey: args.windowKey,
      employeeA: args.employeeA,
      employeeB: args.employeeB,
      candidateTaskIds: ids,
      allTasks: args.allTasks,
      taskOverrides: args.taskOverrides,
      windowMs: args.windowMs,
      iceMode,
      mopCoupling,
      forcedSharedSet,
    }
    let bestDiff = Number.POSITIVE_INFINITY
    const diffs: number[] = []
    const total = 1 << n
    for (let mask = 0; mask < total; mask++) {
      const assignment = assignmentFromMask(ids, mask, args.employeeA, args.employeeB)
      if (violatesMopCoupling(assignment, mopCoupling)) {
        diffs[mask] = Number.POSITIVE_INFINITY
        continue
      }
      const { scoreFloatA, scoreFloatB } = objective(brute, assignment)
      const diff = Math.abs(scoreFloatA - scoreFloatB)
      diffs[mask] = diff
      if (diff < bestDiff) bestDiff = diff
    }
    const maxScoreDiff = Math.max(bestDiff + REGEN_SCORE_SLACK, REGEN_SCORE_SLACK)
    tryInjectSpecialVariants(collected, iceMode, maxScoreDiff)

    const topMasks = rankedMaskCandidatesForRegenerate(
      diffs,
      total,
      maxScoreDiff,
      prevMask,
      REGEN_MASK_EVAL_CAP,
    )
    for (const mask of topMasks) {
      const r = fairSplitFromMask(
        ids,
        mask,
        args.employeeA,
        args.employeeB,
        args.taskState,
        args.dateKey,
        args.windowKey,
        args.allTasks,
        args.taskOverrides,
        args.windowMs,
        args.soloModeActive,
        iceMode,
      )
      const encoded = iceMode === 'split' ? mask + ICE_MASK_TAG_SPLIT : mask
      pushVariant(collected, r, encoded)
    }
  }

  return finalizeRegeneratePool(collected, previous, ctx, maxVariants)
}

function assignmentFromMask(
  candidateIds: string[],
  mask: number,
  employeeA: string,
  employeeB: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < candidateIds.length; i++) {
    const bit = (mask >> i) & 1
    out[candidateIds[i]] = bit ? employeeB : employeeA
  }
  return out
}

function buildIceSplitMap(
  assignment: Record<string, string>,
  employeeA: string,
  employeeB: string,
): Record<string, { left: string; right: string }> {
  const out: Record<string, { left: string; right: string }> = {}
  for (const tid of ICE_COMBINED_TASK_IDS) {
    const owner = assignment[tid]
    if (!owner) continue
    const partner = owner === employeeA ? employeeB : employeeA
    out[tid] = { left: owner, right: partner }
  }
  return out
}

function finalizeFairSplitResult(
  employeeA: string,
  employeeB: string,
  assignment: Record<string, string>,
  scores: { scoreFloatA: number; scoreFloatB: number; scoreA: number; scoreB: number },
  iceMode: IceCompletionMode,
): FairSplitResult {
  const tasksForA: string[] = []
  const tasksForB: string[] = []
  for (const [tid, who] of Object.entries(assignment)) {
    if (who === employeeB) tasksForB.push(tid)
    else if (who === employeeA) tasksForA.push(tid)
  }
  tasksForA.sort()
  tasksForB.sort()
  const iceSplitAssignment = iceMode === 'split' ? buildIceSplitMap(assignment, employeeA, employeeB) : undefined
  return {
    assignment,
    tasksForA,
    tasksForB,
    projectedScoreFloatA: scores.scoreFloatA,
    projectedScoreFloatB: scores.scoreFloatB,
    projectedScoreA: scores.scoreA,
    projectedScoreB: scores.scoreB,
    scoreDiff: Math.abs(scores.scoreFloatA - scores.scoreFloatB),
    iceMode,
    iceSplitAssignment,
    sharedTaskIds: [],
  }
}

const NON_HEURISTIC_SHARE_CLASSES: ReadonlySet<TaskRuleClass> = new Set([
  // Already handled specially or shouldn't be heuristically shared:
  'ice',
  'mop',
  'sweep',
  'sweep-mats',
  'empty-dust-pan',
  'drawer',
  'tips',
])

/**
 * Single-task share heuristic: if the resulting score diff is still meaningful, find the
 * heaviest shareable task on the heavier side and mark it shared if that tightens balance.
 * Pure window-only objective, consistent with `projectedWindowPoints`.
 */
function applySharedTaskHeuristic(
  result: FairSplitResult,
  args: {
    dateKey: string
    windowKey: '17' | '21'
    employeeA: string
    employeeB: string
    allTasks: TaskLike[]
    taskOverrides: TaskOverrides | null | undefined
    windowMs: WindowMsFns
  },
): FairSplitResult {
  if (result.scoreDiff <= 0.5) return result

  const { taskWeightByIdByWindow } = getWeightsForDateKey({
    dateKey: args.dateKey,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
  const wmap = taskWeightByIdByWindow[args.windowKey] || {}

  const alreadyShared = new Set(result.sharedTaskIds || [])
  const taskById = new Map(args.allTasks.map((t) => [t.id, t]))

  const heavierIsA = result.projectedScoreFloatA > result.projectedScoreFloatB
  const heavySide = heavierIsA ? args.employeeA : args.employeeB
  const candidateIds = Object.entries(result.assignment)
    .filter(([tid, who]) => {
      if (who !== heavySide) return false
      if (alreadyShared.has(tid)) return false
      const klass = classifyTaskByName(taskById.get(tid))
      if (klass && NON_HEURISTIC_SHARE_CLASSES.has(klass)) return false
      return true
    })
    .map(([tid]) => tid)
    .sort((a, b) => (wmap[b] ?? 1) - (wmap[a] ?? 1))

  if (!candidateIds.length) return result

  const heaviestId = candidateIds[0]!
  const heaviestWeight = wmap[heaviestId] ?? 1
  if (heaviestWeight <= 0) return result

  // Shared = half weight each side. The current scoreFloats charged the full weight to
  // the heavy side, so removing half from heavy + adding half to light tightens the diff.
  const half = heaviestWeight / 2
  const newFloatA = heavierIsA ? result.projectedScoreFloatA - half : result.projectedScoreFloatA + half
  const newFloatB = heavierIsA ? result.projectedScoreFloatB + half : result.projectedScoreFloatB - half
  const newDiff = Math.abs(newFloatA - newFloatB)
  if (newDiff >= result.scoreDiff) return result

  return {
    ...result,
    sharedTaskIds: [...result.sharedTaskIds, heaviestId],
    projectedScoreFloatA: newFloatA,
    projectedScoreFloatB: newFloatB,
    projectedScoreA: Math.round(newFloatA),
    projectedScoreB: Math.round(newFloatB),
    scoreDiff: newDiff,
  }
}

type BruteArgs = {
  dateKey: string
  windowKey: '17' | '21'
  employeeA: string
  employeeB: string
  candidateTaskIds: string[]
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
  iceMode: IceCompletionMode
  mopCoupling: MopCoupling | null
  forcedSharedSet: ReadonlySet<string>
}

type ObjScores = { scoreA: number; scoreB: number; scoreFloatA: number; scoreFloatB: number }

function objective(args: BruteArgs, assignment: Record<string, string>): ObjScores {
  return projectedWindowPoints({
    windowKey: args.windowKey,
    assignment,
    sharedTaskIds: args.forcedSharedSet,
    iceMode: args.iceMode,
    employeeA: args.employeeA,
    employeeB: args.employeeB,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
    dateKey: args.dateKey,
  })
}

function bruteBestMask(args: BruteArgs): { mask: number; diff: number; assignment: Record<string, string>; scores: ObjScores } {
  const ids = [...args.candidateTaskIds].sort()
  const n = ids.length
  let bestDiff = Number.POSITIVE_INFINITY
  let bestMask = -1

  const total = 1 << n
  for (let mask = 0; mask < total; mask++) {
    const assignment = assignmentFromMask(ids, mask, args.employeeA, args.employeeB)
    if (violatesMopCoupling(assignment, args.mopCoupling)) continue
    const { scoreFloatA, scoreFloatB } = objective(args, assignment)
    const diff = Math.abs(scoreFloatA - scoreFloatB)
    if (diff < bestDiff || (diff === bestDiff && (bestMask < 0 || mask < bestMask))) {
      bestDiff = diff
      bestMask = mask
    }
  }

  let useMask = bestMask
  if (useMask < 0) useMask = 0
  let assignment = assignmentFromMask(ids, useMask, args.employeeA, args.employeeB)
  assignment = repairMopCoupling(assignment, args.mopCoupling, args.employeeA, args.employeeB)
  const scores = objective(args, assignment)
  return { mask: bestMask, diff: bestDiff, assignment, scores }
}

function greedyAssignment(args: BruteArgs): FairSplitResult {
  const ids = [...args.candidateTaskIds].sort()
  const { taskWeightByIdByWindow } = getWeightsForDateKey({
    dateKey: args.dateKey,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
  const wmap = taskWeightByIdByWindow[args.windowKey] || {}
  const weights = ids.map((id) => ({ id, w: wmap[id] ?? 1 }))
  weights.sort((a, b) => b.w - a.w)
  const assignment: Record<string, string> = {}
  for (const { id } of weights) {
    const sA = objective(args, { ...assignment, [id]: args.employeeA })
    const sB = objective(args, { ...assignment, [id]: args.employeeB })
    const diffIfA = Math.abs(sA.scoreFloatA - sA.scoreFloatB)
    const diffIfB = Math.abs(sB.scoreFloatA - sB.scoreFloatB)
    assignment[id] = diffIfA <= diffIfB ? args.employeeA : args.employeeB
  }
  const fixed = repairMopCoupling(assignment, args.mopCoupling, args.employeeA, args.employeeB)
  const finalScores = objective(args, fixed)
  return finalizeFairSplitResult(args.employeeA, args.employeeB, fixed, finalScores, args.iceMode)
}

const SPLIT_BRUTE_MAX = 18
const ICE_MASK_TAG_SPLIT = 1_000_000

function hasCombinedIceCandidate(ids: string[]): boolean {
  return ids.some((id) => id === 'ice-5pm' || id === 'ice-close')
}

/**
 * Enumerates assignments minimizing |projected score A − projected score B| using a PURE
 * window-only weighted-points objective (shared & split-ice tasks count half each side).
 * Tries whole-ice vs split-ice when combined ice is in the candidate set. Always-shared
 * tasks (trash, dining check, admin requiresSplit) are forced into `sharedTaskIds`. Mop coupling
 * forces sweep mats with the mopper; sweep, empty-dust-pan, drawer, and tips onto the OPPOSITE employee.
 *
 * `taskState` and `soloModeActive` are kept in the signature for backwards compat with
 * the call sites but are no longer used (the objective is purely weight-based on the
 * current window's candidates — no cross-window history is consulted).
 */
export function findBestFairSplit(args: {
  taskState?: TaskState
  dateKey: string
  windowKey: '17' | '21'
  employeeA: string
  employeeB: string
  candidateTaskIds: string[]
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
  soloModeActive?: boolean
  /** If set, only this ice mode is considered (used by the dice-setup modal choice). */
  forceIceMode?: IceCompletionMode
}): FairSplitResult {
  const ids = [...args.candidateTaskIds].sort()
  const n = ids.length
  const mopCoupling = getMopCoupling(ids, args.allTasks)
  const forcedSharedIds = getAlwaysSharedCandidateIds(ids, args.allTasks)
  const forcedSharedSet: ReadonlySet<string> = new Set(forcedSharedIds)
  const baseBrute: Omit<BruteArgs, 'iceMode'> = {
    dateKey: args.dateKey,
    windowKey: args.windowKey,
    employeeA: args.employeeA,
    employeeB: args.employeeB,
    candidateTaskIds: ids,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
    mopCoupling,
    forcedSharedSet,
  }

  if (n === 0) {
    return {
      assignment: {},
      tasksForA: [],
      tasksForB: [],
      projectedScoreFloatA: 0,
      projectedScoreFloatB: 0,
      projectedScoreA: 0,
      projectedScoreB: 0,
      scoreDiff: 0,
      iceMode: 'whole',
      sharedTaskIds: [],
    }
  }

  const tryIceModes: IceCompletionMode[] = args.forceIceMode
    ? [args.forceIceMode]
    : hasCombinedIceCandidate(ids)
      ? ['whole', 'split']
      : ['whole']

  let bestOverall: FairSplitResult | null = null

  for (const iceMode of tryIceModes) {
    let candidate: FairSplitResult
    if (n <= SPLIT_BRUTE_MAX) {
      const { assignment, scores } = bruteBestMask({ ...baseBrute, iceMode })
      candidate = finalizeFairSplitResult(args.employeeA, args.employeeB, assignment, scores, iceMode)
    } else {
      candidate = greedyAssignment({ ...baseBrute, iceMode })
    }
    candidate.sharedTaskIds = Array.from(new Set([...forcedSharedIds, ...candidate.sharedTaskIds]))
    if (
      !bestOverall ||
      candidate.scoreDiff < bestOverall.scoreDiff ||
      (candidate.scoreDiff === bestOverall.scoreDiff && iceMode === 'split' && bestOverall.iceMode === 'whole')
    ) {
      bestOverall = candidate
    }
  }

  return applySharedTaskHeuristic(bestOverall!, {
    dateKey: args.dateKey,
    windowKey: args.windowKey,
    employeeA: args.employeeA,
    employeeB: args.employeeB,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
  })
}

/** All masks within `tolerance` of `bestDiff` (for AI tie-break), capped. Whole and split ice variants use distinct mask tags. */
export function enumerateNearOptimalSplitMasks(args: {
  taskState?: TaskState
  dateKey: string
  windowKey: '17' | '21'
  employeeA: string
  employeeB: string
  candidateTaskIds: string[]
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
  soloModeActive?: boolean
  tolerance: number
  maxVariants: number
  /** If set, only this ice mode contributes variants. */
  forceIceMode?: IceCompletionMode
}): number[] {
  const ids = [...args.candidateTaskIds].sort()
  const n = ids.length
  if (n === 0) return [0]
  if (n > 18) return [0]

  const mopCoupling = getMopCoupling(ids, args.allTasks)
  const forcedSharedSet: ReadonlySet<string> = new Set(getAlwaysSharedCandidateIds(ids, args.allTasks))
  const tryIceModes: IceCompletionMode[] = args.forceIceMode
    ? [args.forceIceMode]
    : hasCombinedIceCandidate(ids)
      ? ['whole', 'split']
      : ['whole']
  type Tagged = { mask: number; diff: number }
  const tagged: Tagged[] = []

  for (const iceMode of tryIceModes) {
    const brute: BruteArgs = {
      dateKey: args.dateKey,
      windowKey: args.windowKey,
      employeeA: args.employeeA,
      employeeB: args.employeeB,
      candidateTaskIds: ids,
      allTasks: args.allTasks,
      taskOverrides: args.taskOverrides,
      windowMs: args.windowMs,
      iceMode,
      mopCoupling,
      forcedSharedSet,
    }
    let bestDiff = Number.POSITIVE_INFINITY
    const diffs: number[] = []
    const total = 1 << n
    for (let mask = 0; mask < total; mask++) {
      const assignment = assignmentFromMask(ids, mask, args.employeeA, args.employeeB)
      if (violatesMopCoupling(assignment, mopCoupling)) {
        diffs[mask] = Number.POSITIVE_INFINITY
        continue
      }
      const { scoreFloatA, scoreFloatB } = objective(brute, assignment)
      const diff = Math.abs(scoreFloatA - scoreFloatB)
      diffs[mask] = diff
      if (diff < bestDiff) bestDiff = diff
    }
    for (let mask = 0; mask < total; mask++) {
      if (diffs[mask]! <= bestDiff + args.tolerance) {
        const encoded = iceMode === 'split' ? mask + ICE_MASK_TAG_SPLIT : mask
        tagged.push({ mask: encoded, diff: diffs[mask]! })
      }
    }
  }

  tagged.sort((a, b) => a.diff - b.diff || a.mask - b.mask)
  return tagged.slice(0, args.maxVariants).map((t) => t.mask)
}

export function decodeSplitMask(encoded: number): { rawMask: number; iceMode: IceCompletionMode } {
  if (encoded >= ICE_MASK_TAG_SPLIT) {
    return { rawMask: encoded - ICE_MASK_TAG_SPLIT, iceMode: 'split' }
  }
  return { rawMask: encoded, iceMode: 'whole' }
}

export function fairSplitFromEncodedMask(
  encodedMask: number,
  candidateIds: string[],
  employeeA: string,
  employeeB: string,
  _taskState: TaskState | undefined,
  dateKey: string,
  windowKey: '17' | '21',
  allTasks: TaskLike[],
  taskOverrides: TaskOverrides | null | undefined,
  windowMs: WindowMsFns,
  _soloModeActive?: boolean,
): FairSplitResult {
  const { rawMask, iceMode } = decodeSplitMask(encodedMask)
  return fairSplitFromMask(
    candidateIds,
    rawMask,
    employeeA,
    employeeB,
    _taskState,
    dateKey,
    windowKey,
    allTasks,
    taskOverrides,
    windowMs,
    _soloModeActive,
    iceMode,
  )
}

export function fairSplitFromMask(
  candidateIds: string[],
  mask: number,
  employeeA: string,
  employeeB: string,
  _taskState: TaskState | undefined,
  dateKey: string,
  windowKey: '17' | '21',
  allTasks: TaskLike[],
  taskOverrides: TaskOverrides | null | undefined,
  windowMs: WindowMsFns,
  _soloModeActive?: boolean,
  iceMode: IceCompletionMode = 'whole',
): FairSplitResult {
  const ids = [...candidateIds].sort()
  const mopCoupling = getMopCoupling(ids, allTasks)
  const forcedSharedIds = getAlwaysSharedCandidateIds(ids, allTasks)
  const forcedSharedSet: ReadonlySet<string> = new Set(forcedSharedIds)
  const rawAssignment = assignmentFromMask(ids, mask, employeeA, employeeB)
  const assignment = repairMopCoupling(rawAssignment, mopCoupling, employeeA, employeeB)
  const brute: BruteArgs = {
    dateKey,
    windowKey,
    employeeA,
    employeeB,
    candidateTaskIds: ids,
    allTasks,
    taskOverrides,
    windowMs,
    iceMode,
    mopCoupling,
    forcedSharedSet,
  }
  const finalScores = objective(brute, assignment)
  const base = finalizeFairSplitResult(employeeA, employeeB, assignment, finalScores, iceMode)
  base.sharedTaskIds = Array.from(new Set([...forcedSharedIds, ...base.sharedTaskIds]))
  return applySharedTaskHeuristic(base, {
    dateKey,
    windowKey,
    employeeA,
    employeeB,
    allTasks,
    taskOverrides,
    windowMs,
  })
}
