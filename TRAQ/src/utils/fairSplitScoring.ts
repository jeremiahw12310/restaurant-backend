import type { FairSplitContractDoc } from '../services/firestore'
import type { TaskCompletion, TaskState, WindowKey } from '../services/firestore'

type ShiftKey = 'day' | 'night'

/** Same gates as taskScoring `isBalancedOptionalTaskWithNoCredits` (keep in sync). */
function isBalancedOptionalTaskWithNoCredits(taskId: string, completion: TaskCompletion | undefined): boolean {
  if (!completion) return false
  if (taskId === 'yum-yum-close' || taskId === 'peanuts-noodles-close') {
    return completion.autoAssigned === true || completion.didNotNeedToComplete === true
  }
  if (taskId === 'ice-5pm' || taskId === 'ice-close') {
    return completion.didNotNeedToComplete === true
  }
  return false
}

export function normEmp(s: string): string {
  return String(s || '').trim()
}

function findPointsKey(pointsMap: Record<string, number>, emp: string): string | null {
  const t = normEmp(emp)
  if (!t) return null
  if (Object.prototype.hasOwnProperty.call(pointsMap, emp) && normEmp(emp) === t) return emp
  for (const k of Object.keys(pointsMap)) {
    if (normEmp(k) === t) return k
  }
  return t
}

export function readWindowPointForEmployee(pointsMap: Record<string, number> | undefined, emp: string): number {
  const m = pointsMap || {}
  const k = findPointsKey(m, emp) ?? normEmp(emp)
  return m[k] ?? 0
}

export function getCompletionForFairSplitWindow(
  state: TaskState,
  dateKey: string,
  windowKey: WindowKey,
  taskId: string,
  shift: ShiftKey
): TaskCompletion | undefined {
  const dateMap = state[dateKey]
  if (!dateMap) return undefined
  if (windowKey === '21' && shift === 'night') {
    const c21 = dateMap['21']?.[taskId]
    if (c21) return c21
    const c17 = dateMap['17']?.[taskId]
    if (c17?.deferredToClose) return c17
    return undefined
  }
  return dateMap[windowKey]?.[taskId]
}

function completionCountsForPoints(
  taskId: string,
  completion: TaskCompletion | undefined,
  taskWeight: number,
  useBalancedScoring: boolean,
  shift: ShiftKey,
  wKey: WindowKey
): boolean {
  if (!completion) return false
  if (completion.completedLate && !completion.lateForgiven) return false
  const assignees = completion.assignees || []
  if (!assignees.length) return false
  if (taskWeight <= 0) return false
  if (shift === 'day' && wKey === '17' && completion.deferredToClose) return false
  if (useBalancedScoring && isBalancedOptionalTaskWithNoCredits(taskId, completion)) return false
  if (taskId === 'daily-task') return false
  return true
}

function taskWeightForFairSplit(
  state: TaskState,
  dateKey: string,
  shift: ShiftKey,
  wKey: WindowKey,
  taskId: string,
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
): number {
  if (shift === 'night' && wKey === '21' && state[dateKey]?.['17']?.[taskId]?.deferredToClose) {
    return taskWeightByIdByWindow['17']?.[taskId] ?? 0
  }
  return taskWeightByIdByWindow[wKey]?.[taskId] ?? 0
}

// Duplicate denominator helper (keep in sync with taskScoring).
function applyBalancedOptionalTaskDenominatorAdjustments(
  totalWeight: number,
  wKey: WindowKey,
  windowMap: Record<string, TaskCompletion>,
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
): number {
  let t = totalWeight
  const yumYumCompletion = windowMap['yum-yum-close']
  if (yumYumCompletion?.autoAssigned === true || yumYumCompletion?.didNotNeedToComplete === true) {
    const w = taskWeightByIdByWindow[wKey]?.['yum-yum-close'] ?? 0
    t = Math.max(0, t - w)
  }
  if (wKey === '21') {
    const peanutsCompletion = windowMap['peanuts-noodles-close']
    if (peanutsCompletion?.autoAssigned === true || peanutsCompletion?.didNotNeedToComplete === true) {
      const w = taskWeightByIdByWindow[wKey]?.['peanuts-noodles-close'] ?? 0
      t = Math.max(0, t - w)
    }
  }
  const ice5Completion = windowMap['ice-5pm']
  if (ice5Completion?.didNotNeedToComplete === true) {
    const w = taskWeightByIdByWindow[wKey]?.['ice-5pm'] ?? 0
    t = Math.max(0, t - w)
  }
  const iceCloseCompletion = windowMap['ice-close']
  if (iceCloseCompletion?.didNotNeedToComplete === true) {
    const w = taskWeightByIdByWindow[wKey]?.['ice-close'] ?? 0
    t = Math.max(0, t - w)
  }
  return t
}

function computeWindowTotalWeightLocal(args: {
  shift: ShiftKey
  wKey: WindowKey
  windowTaskWeights: Record<WindowKey, number>
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  dateMap: NonNullable<TaskState[string]>
  deferredWeightTotal17: number
  useBalancedScoring: boolean
}): number {
  let totalWeight = args.windowTaskWeights[args.wKey] || 0
  if (args.shift === 'day' && args.wKey === '17') totalWeight = Math.max(0, totalWeight - args.deferredWeightTotal17)
  if (args.shift === 'night' && args.wKey === '21') totalWeight = totalWeight + args.deferredWeightTotal17
  if (args.useBalancedScoring) {
    const windowMap = (args.dateMap[args.wKey] || {}) as Record<string, TaskCompletion>
    totalWeight = applyBalancedOptionalTaskDenominatorAdjustments(
      totalWeight,
      args.wKey,
      windowMap,
      args.taskWeightByIdByWindow
    )
  }
  return totalWeight
}

function suggestedTowelSides(contract: FairSplitContractDoc, taskId: string, empA: string, empB: string): { diningBar: string; bowlStation: string } | null {
  const owner = normEmp(contract.suggestedAssignment[taskId] || '')
  if (!owner) return null
  if (contract.finalSharedTaskIds.includes(taskId)) {
    return { diningBar: empA, bowlStation: empB }
  }
  return { diningBar: owner, bowlStation: owner }
}

function completionMatchesSuggestion(args: {
  contract: FairSplitContractDoc
  taskId: string
  completion: TaskCompletion
  empA: string
  empB: string
}): boolean {
  const { contract, taskId, completion, empA, empB } = args
  const a = normEmp(empA)
  const b = normEmp(empB)
  const shared = contract.finalSharedTaskIds.includes(taskId)

  if (taskId === 'ice-5pm' || taskId === 'ice-close') {
    if (!completion.iceSides) return false
    const left = normEmp(completion.iceSides.left)
    const right = normEmp(completion.iceSides.right)
    if (!left || !right) return false
    if (contract.finalIceMode === 'split' && contract.finalIceSplitAssignment?.[taskId]) {
      const exp = contract.finalIceSplitAssignment[taskId]
      return normEmp(exp.left) === left && normEmp(exp.right) === right
    }
    const suggested = normEmp(contract.suggestedAssignment[taskId] || '')
    return suggested ? left === suggested && right === suggested : false
  }

  if (taskId === 'towels' || taskId === 'towels-5pm' || taskId === 'towels-close') {
    if (!completion.towelSides) return false
    const db = normEmp(completion.towelSides.diningBar)
    const bs = normEmp(completion.towelSides.bowlStation)
    if (!db || !bs) return false
    const exp = suggestedTowelSides(contract, taskId, a, b)
    if (!exp) return false
    const setC = new Set([db, bs])
    const setE = new Set([normEmp(exp.diningBar), normEmp(exp.bowlStation)])
    return setC.size === setE.size && [...setC].every((x) => setE.has(x))
  }

  if (taskId === 'order-report-5pm' || taskId === 'order-report-close') {
    const asg = (completion.assignees || []).map(normEmp).filter(Boolean)
    if (asg.length !== 2) return false
    const setC = new Set(asg)
    return setC.has(a) && setC.has(b) && !!completion.orderReportCounts
  }

  const assignees = (completion.assignees || []).map(normEmp).filter(Boolean)
  if (!assignees.length) return false
  if (shared) {
    return assignees.includes(a) && assignees.includes(b)
  }
  const suggested = normEmp(contract.suggestedAssignment[taskId] || '')
  if (!suggested) return false
  if (assignees.length === 1) return assignees[0] === suggested
  const setC = new Set(assignees)
  return setC.size === 1 && setC.has(suggested)
}

export function fairSplitFollowCompliant(args: {
  state: TaskState
  dateKey: string
  shift: ShiftKey
  contract: FairSplitContractDoc
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }>
  useBalancedScoring: boolean
}): boolean {
  const wKey = args.contract.windowKey
  if ((args.shift === 'day' && wKey !== '17') || (args.shift === 'night' && wKey !== '21')) return false
  const empA = normEmp(args.contract.employeeA)
  const empB = normEmp(args.contract.employeeB)
  const S = new Set(args.contract.taskIds)
  for (const taskId of S) {
    const c = getCompletionForFairSplitWindow(args.state, args.dateKey, wKey, taskId, args.shift)
    const tw = taskWeightForFairSplit(args.state, args.dateKey, args.shift, wKey, taskId, args.taskWeightByIdByWindow)
    // Tasks that legitimately don't need completion in this window are neutral: they
    // also drop out of the scoring denominator, so treating them as satisfied keeps the
    // followed-split result at exactly 50/50 instead of stalling below it.
    if (tw <= 0) continue
    if (taskId === 'daily-task') continue
    if (args.shift === 'day' && wKey === '17' && c?.deferredToClose) continue
    if (args.useBalancedScoring && isBalancedOptionalTaskWithNoCredits(taskId, c)) continue
    // Genuinely required: must be completed correctly to count as compliant.
    if (!completionCountsForPoints(taskId, c, tw, args.useBalancedScoring, args.shift, wKey)) return false
    if (!c || !completionMatchesSuggestion({ contract: args.contract, taskId, completion: c, empA, empB })) return false
  }
  return true
}

export function fairSplitHasDivergence(args: {
  state: TaskState
  dateKey: string
  shift: ShiftKey
  contract: FairSplitContractDoc
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }>
  useBalancedScoring: boolean
}): boolean {
  const wKey = args.contract.windowKey
  if ((args.shift === 'day' && wKey !== '17') || (args.shift === 'night' && wKey !== '21')) return false
  const empA = normEmp(args.contract.employeeA)
  const empB = normEmp(args.contract.employeeB)
  const S = new Set(args.contract.taskIds)
  for (const taskId of S) {
    const c = getCompletionForFairSplitWindow(args.state, args.dateKey, wKey, taskId, args.shift)
    const tw = taskWeightForFairSplit(args.state, args.dateKey, args.shift, wKey, taskId, args.taskWeightByIdByWindow)
    if (!c || !completionCountsForPoints(taskId, c, tw, args.useBalancedScoring, args.shift, wKey)) continue
    if (!completionMatchesSuggestion({ contract: args.contract, taskId, completion: c, empA, empB })) return true
  }
  return false
}

function assignedWeightInS(
  contract: FairSplitContractDoc,
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>,
  wKey: WindowKey,
  state: TaskState,
  dateKey: string,
  shift: ShiftKey,
  who: 'A' | 'B'
): number {
  const empA = normEmp(contract.employeeA)
  const empB = normEmp(contract.employeeB)
  const shared = new Set(contract.finalSharedTaskIds)
  let sum = 0
  const target = who === 'A' ? empA : empB
  for (const tid of contract.taskIds) {
    const w = taskWeightForFairSplit(state, dateKey, shift, wKey, tid, taskWeightByIdByWindow)
    if (w <= 0) continue
    const isIceSplit = contract.finalIceMode === 'split' && (tid === 'ice-5pm' || tid === 'ice-close')
    if (isIceSplit || shared.has(tid)) {
      sum += w / 2
      continue
    }
    const whoS = normEmp(contract.suggestedAssignment[tid] || '')
    if (whoS === target) sum += w
  }
  return sum
}

function completedCorrectWeightInS(args: {
  contract: FairSplitContractDoc
  state: TaskState
  dateKey: string
  shift: ShiftKey
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }>
  useBalancedScoring: boolean
  who: 'A' | 'B'
}): number {
  const wKey = args.contract.windowKey
  const empA = normEmp(args.contract.employeeA)
  const empB = normEmp(args.contract.employeeB)
  const shared = new Set(args.contract.finalSharedTaskIds)
  const target = args.who === 'A' ? empA : empB
  let sum = 0
  for (const tid of args.contract.taskIds) {
    const c = getCompletionForFairSplitWindow(args.state, args.dateKey, wKey, tid, args.shift)
    const tw = taskWeightForFairSplit(args.state, args.dateKey, args.shift, wKey, tid, args.taskWeightByIdByWindow)
    if (!c || !completionCountsForPoints(tid, c, tw, args.useBalancedScoring, args.shift, wKey)) continue
    if (!completionMatchesSuggestion({ contract: args.contract, taskId: tid, completion: c, empA, empB })) continue
    const w = taskWeightForFairSplit(args.state, args.dateKey, args.shift, wKey, tid, args.taskWeightByIdByWindow)
    if (w <= 0) continue
    const isIceSplit = args.contract.finalIceMode === 'split' && (tid === 'ice-5pm' || tid === 'ice-close')
    if (isIceSplit || shared.has(tid)) {
      sum += w / 2
      continue
    }
    const whoS = normEmp(args.contract.suggestedAssignment[tid] || '')
    if (whoS === target) sum += w
  }
  return sum
}

export function fairSplitProgressAB(args: {
  contract: FairSplitContractDoc
  state: TaskState
  dateKey: string
  shift: ShiftKey
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }>
  useBalancedScoring: boolean
}): { progressA: number; progressB: number } {
  const wKey = args.contract.windowKey
  const aw = assignedWeightInS(args.contract, args.taskWeightByIdByWindow, wKey, args.state, args.dateKey, args.shift, 'A')
  const bw = assignedWeightInS(args.contract, args.taskWeightByIdByWindow, wKey, args.state, args.dateKey, args.shift, 'B')
  const cwA = completedCorrectWeightInS({ ...args, who: 'A' })
  const cwB = completedCorrectWeightInS({ ...args, who: 'B' })
  const progressA = aw > 0 ? Math.min(1, Math.max(0, cwA / aw)) : 1
  const progressB = bw > 0 ? Math.min(1, Math.max(0, cwB / bw)) : 1
  return { progressA, progressB }
}

/**
 * Assignee-agnostic completion fraction for the split: completed split-task weight over
 * total split-task weight. Counts a task as done once it counts for points regardless of
 * who completed it, so the fraction reaches 1 when all the split's work is physically done.
 */
function fairSplitWindowCompletionFraction(args: {
  state: TaskState
  dateKey: string
  shift: ShiftKey
  contract: FairSplitContractDoc
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  useBalancedScoring: boolean
}): number {
  const wKey = args.contract.windowKey
  let total = 0
  let done = 0
  for (const taskId of new Set(args.contract.taskIds)) {
    const w = taskWeightForFairSplit(args.state, args.dateKey, args.shift, wKey, taskId, args.taskWeightByIdByWindow)
    if (w <= 0) continue
    total += w
    const c = getCompletionForFairSplitWindow(args.state, args.dateKey, wKey, taskId, args.shift)
    if (c && completionCountsForPoints(taskId, c, w, args.useBalancedScoring, args.shift, wKey)) done += w
  }
  return total > 0 ? Math.min(1, Math.max(0, done / total)) : 1
}

/** Preview / HUD: fair-split window points for A and B (others unchanged). */
export function fairSplitPreviewWindowPoints(args: {
  state: TaskState
  dateKey: string
  shift: ShiftKey
  contract: FairSplitContractDoc
  windowTaskWeights: Record<WindowKey, number>
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }>
  deferredWeightTotal17: number
  useBalancedScoring: boolean
  useDailyTaskPoints: boolean
  /** Canonical pre-fair-split floats for the contract window (from scoring snapshot). */
  canonicalPointsByWindow: Record<WindowKey, Record<string, number>>
}): { pointsA: number; pointsB: number } {
  const wKey = args.contract.windowKey
  const tw = computeWindowTotalWeightLocal({
    shift: args.shift,
    wKey,
    windowTaskWeights: args.windowTaskWeights,
    taskWeightByIdByWindow: args.taskWeightByIdByWindow,
    dateMap: args.state[args.dateKey]!,
    deferredWeightTotal17: args.deferredWeightTotal17,
    useBalancedScoring: args.useBalancedScoring,
  })
  if (!tw || !args.state[args.dateKey]) {
    return {
      pointsA: args.canonicalPointsByWindow[wKey]?.[args.contract.employeeA] ?? 0,
      pointsB: args.canonicalPointsByWindow[wKey]?.[args.contract.employeeB] ?? 0,
    }
  }

  const baselineA = args.contract.baselinePointsFloatA
  const baselineB = args.contract.baselinePointsFloatB
  const gapA = Math.max(0, 50 - baselineA)
  const gapB = Math.max(0, 50 - baselineB)

  // When the split was followed exactly, the window is even by construction, so it
  // must read exactly 50/50 regardless of baseline (pre-split completions, 11AM
  // carryover), a completed daily task, or any other point source.
  if (fairSplitFollowCompliant({ ...args, contract: args.contract })) {
    return { pointsA: 50, pointsB: 50 }
  }

  // In-progress: both sides climb toward 50 by how much of the split's total work is done,
  // anchored to each player's baseline and hard-capped at 50 so neither overshoots above 50
  // (which previously happened on the raw divergence path) before reconciling to exactly 50/50.
  const frac = fairSplitWindowCompletionFraction({
    state: args.state,
    dateKey: args.dateKey,
    shift: args.shift,
    contract: args.contract,
    taskWeightByIdByWindow: args.taskWeightByIdByWindow,
    useBalancedScoring: args.useBalancedScoring,
  })
  return {
    pointsA: Math.min(50, baselineA + gapA * frac),
    pointsB: Math.min(50, baselineB + gapB * frac),
  }
}

export function applyFairSplitToPointsByWindow(args: {
  pointsByWindow: Record<WindowKey, Record<string, number>>
  state: TaskState
  dateKey: string
  shift: ShiftKey
  contract: FairSplitContractDoc
  windowTaskWeights: Record<WindowKey, number>
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }>
  deferredWeightTotal17: number
  useBalancedScoring: boolean
  useDailyTaskPoints: boolean
}): void {
  const wKey = args.contract.windowKey
  if (args.contract.dateKey !== args.dateKey) return
  if ((args.shift === 'day' && wKey !== '17') || (args.shift === 'night' && wKey !== '21')) return

  const preview = fairSplitPreviewWindowPoints({
    state: args.state,
    dateKey: args.dateKey,
    shift: args.shift,
    contract: args.contract,
    windowTaskWeights: args.windowTaskWeights,
    taskWeightByIdByWindow: args.taskWeightByIdByWindow,
    deferredFrom17: args.deferredFrom17,
    deferredWeightTotal17: args.deferredWeightTotal17,
    useBalancedScoring: args.useBalancedScoring,
    useDailyTaskPoints: args.useDailyTaskPoints,
    canonicalPointsByWindow: args.pointsByWindow,
  })

  const keyA = findPointsKey(args.pointsByWindow[wKey] || {}, args.contract.employeeA) ?? normEmp(args.contract.employeeA)
  const keyB = findPointsKey(args.pointsByWindow[wKey] || {}, args.contract.employeeB) ?? normEmp(args.contract.employeeB)
  if (!keyA || !keyB) return
  args.pointsByWindow[wKey][keyA] = preview.pointsA
  args.pointsByWindow[wKey][keyB] = preview.pointsB
}
