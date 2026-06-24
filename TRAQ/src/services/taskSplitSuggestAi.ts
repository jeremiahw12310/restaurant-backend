import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import type { TaskCompletion, TaskState, TaskOverrides, WindowKey, FairSplitContractDoc, FairSplitContractWindowKey } from './firestore'
import type { Task } from '../types/task'
import type { TaskLike, WindowMsFns } from '../utils/taskScoring'
import {
  findBestFairSplit,
  enumerateNearOptimalSplitMasks,
  fairSplitFromEncodedMask,
  fairSplitResultToVariant,
  buildSplitRulesInfo,
  buildRegenerateSplitVariants,
  variantsAreEqual,
  type IceCompletionMode,
  type TaskSplitVariantPayload,
} from '../utils/taskSplitPartition'
import {
  buildRotationPreferenceMap,
  computeAntiRotationCost,
  type RotationPreferenceMap,
} from '../utils/lastTogetherHistory'

/**
 * Plain-data shape of split rules the CF prompt should know about.
 * Mirrors `SplitRulesInfo` from taskSplitPartition (sans the runtime class union).
 */
export type TaskSplitRulesPayload = {
  alwaysSharedTaskIds: string[]
  splittableTaskIds: string[]
  mopCoupling: {
    mopTaskIds: string[]
    forceMopperTaskIds: string[]
    forcePartnerTaskIds: string[]
  } | null
  rulesText: string
}

export type TaskSplitSuggestWindowKey = '17' | '21'

export type TaskSplitRequestPayload = {
  payloadVersion: 1
  dateKey: string
  windowKey: TaskSplitSuggestWindowKey
  employeeA: string
  employeeB: string
  deploymentChannel: 'main' | 'beta'
  soloModeActive: boolean
  historySummary: string
  /** Per-task last completer on shared shifts (same window) for fair rotation. */
  lastTogetherSummary?: string
  candidateTaskIds: string[]
  deterministicBest: TaskSplitVariantPayload
  variants: TaskSplitVariantPayload[]
  /** When set, the algorithm only considers this ice mode (user picked in the dice setup modal). */
  forceIceMode?: IceCompletionMode
  /**
   * Structured split rules info for the AI prompt. The CF reads `rulesText` directly and
   * uses the id lists to enforce / explain shared-task and mop-coupling constraints.
   */
  splitRules?: TaskSplitRulesPayload
  /** Present when user tapped Regenerate — the split they just saw and want changed. */
  previousSuggestion?: TaskSplitVariantPayload
  regenerateRequest?: true
}

export type TaskSplitSuggestResult = {
  finalAssignment: Record<string, string>
  finalIceMode?: 'whole' | 'split'
  finalIceSplitAssignment?: Record<string, { left: string; right: string }>
  /** Non-ice/non-towel tasks the panel should render on BOTH sides (split-points on completion). */
  finalSharedTaskIds: string[]
  rationale: string
  source: string
  projectedScoreFloatA: number
  projectedScoreFloatB: number
  scoreDiff: number
  employeeA: string
  employeeB: string
}

export function buildFairSplitTaskIdsFromResult(result: TaskSplitSuggestResult): string[] {
  const ids = new Set<string>()
  Object.keys(result.finalAssignment || {}).forEach((id) => ids.add(id))
  for (const id of result.finalSharedTaskIds || []) ids.add(id)
  if (result.finalIceSplitAssignment) {
    Object.keys(result.finalIceSplitAssignment).forEach((id) => ids.add(id))
  }
  return Array.from(ids)
}

export function buildFairSplitContractDocument(args: {
  result: TaskSplitSuggestResult
  dateKey: string
  windowKey: FairSplitContractWindowKey
  baselinePointsFloatA: number
  baselinePointsFloatB: number
}): FairSplitContractDoc {
  const { result, dateKey, windowKey, baselinePointsFloatA, baselinePointsFloatB } = args
  const suggested: Record<string, string> = {}
  Object.entries(result.finalAssignment || {}).forEach(([k, v]) => {
    suggested[k] = String(v || '').trim()
  })
  return {
    dateKey,
    windowKey,
    employeeA: String(result.employeeA || '').trim(),
    employeeB: String(result.employeeB || '').trim(),
    taskIds: buildFairSplitTaskIdsFromResult(result),
    suggestedAssignment: suggested,
    finalSharedTaskIds: [...(result.finalSharedTaskIds || [])],
    finalIceMode: result.finalIceMode === 'split' ? 'split' : 'whole',
    finalIceSplitAssignment: result.finalIceSplitAssignment
      ? Object.fromEntries(
          Object.entries(result.finalIceSplitAssignment).map(([k, v]) => [
            k,
            { left: String(v.left || '').trim(), right: String(v.right || '').trim() },
          ]),
        )
      : undefined,
    baselinePointsFloatA,
    baselinePointsFloatB,
    version: 1,
  }
}

export type TaskSplitPanelRestoreDecision =
  | { action: 'hide' }
  | { action: 'skip' }
  | { action: 'restore'; contract: FairSplitContractDoc }

/** Decide whether the split panel should show for the current date + window view. */
export function resolveTaskSplitPanelRestore(args: {
  selectedDateKey: string
  selectedWindow: string
  contract17: FairSplitContractDoc | null
  contract21: FairSplitContractDoc | null
  phase: 'loading' | 'active' | null
  undoneViewKey: string | null
  /** View whose split auto-finished (celebration shown); keep the panel hidden without deleting the contract. */
  completedViewKey?: string | null
}): TaskSplitPanelRestoreDecision {
  const { selectedDateKey, selectedWindow, contract17, contract21, phase, undoneViewKey, completedViewKey } = args
  if (selectedWindow !== '17' && selectedWindow !== '21') return { action: 'hide' }
  if (phase === 'loading') return { action: 'skip' }

  const viewKey = `${selectedDateKey}:${selectedWindow}`
  if (undoneViewKey === viewKey) return { action: 'hide' }
  if (completedViewKey === viewKey) return { action: 'hide' }

  const contract = selectedWindow === '17' ? contract17 : contract21
  if (contract?.dateKey === selectedDateKey && contract.windowKey === selectedWindow) {
    return { action: 'restore', contract }
  }
  return { action: 'hide' }
}

/** Rehydrate the split panel from a persisted fair-split contract (refresh / window return). */
export function fairSplitContractToSuggestResult(contract: FairSplitContractDoc): TaskSplitSuggestResult {
  const projectedScoreFloatA = contract.baselinePointsFloatA
  const projectedScoreFloatB = contract.baselinePointsFloatB
  return {
    finalAssignment: { ...contract.suggestedAssignment },
    finalIceMode: contract.finalIceMode,
    finalIceSplitAssignment: contract.finalIceSplitAssignment
      ? Object.fromEntries(
          Object.entries(contract.finalIceSplitAssignment).map(([k, v]) => [
            k,
            { left: v.left, right: v.right },
          ]),
        )
      : undefined,
    finalSharedTaskIds: [...contract.finalSharedTaskIds],
    rationale: '',
    source: 'restored',
    projectedScoreFloatA,
    projectedScoreFloatB,
    scoreDiff: Math.abs(projectedScoreFloatA - projectedScoreFloatB),
    employeeA: contract.employeeA,
    employeeB: contract.employeeB,
  }
}

function collectAssignees(taskId: string, c: TaskCompletion): string[] {
  if (!c || c.status !== 'done') return []
  if (
    (taskId === 'ice-5pm' || taskId === 'ice-close') &&
    c.iceSides &&
    typeof c.iceSides.left === 'string' &&
    typeof c.iceSides.right === 'string'
  ) {
    const a = String(c.iceSides.left || '').trim()
    const b = String(c.iceSides.right || '').trim()
    return [a, b].filter(Boolean)
  }
  if (
    (taskId === 'towels' || taskId === 'towels-5pm' || taskId === 'towels-close') &&
    c.towelSides &&
    typeof c.towelSides.diningBar === 'string' &&
    typeof c.towelSides.bowlStation === 'string'
  ) {
    const a = String(c.towelSides.diningBar || '').trim()
    const b = String(c.towelSides.bowlStation || '').trim()
    return [a, b].filter(Boolean)
  }
  return (c.assignees || []).map((x) => String(x || '').trim()).filter(Boolean)
}

const PRIOR_RESULT_MASK = -2

export function suggestResultToVariant(result: TaskSplitSuggestResult): TaskSplitVariantPayload {
  const v: TaskSplitVariantPayload = {
    mask: PRIOR_RESULT_MASK,
    assignment: { ...result.finalAssignment },
    projectedScoreFloatA: result.projectedScoreFloatA,
    projectedScoreFloatB: result.projectedScoreFloatB,
    scoreDiff: result.scoreDiff,
    iceMode: result.finalIceMode === 'split' ? 'split' : 'whole',
  }
  if (result.finalIceSplitAssignment && Object.keys(result.finalIceSplitAssignment).length) {
    v.iceSplitAssignment = { ...result.finalIceSplitAssignment }
  }
  if (result.finalSharedTaskIds?.length) {
    v.sharedTaskIds = [...result.finalSharedTaskIds]
  }
  return v
}

function pickFallbackVariant(payload: TaskSplitRequestPayload): TaskSplitVariantPayload {
  if (payload.regenerateRequest && payload.variants.length > 0) {
    return payload.variants[0]!
  }
  if (payload.previousSuggestion && payload.regenerateRequest) {
    const alt = payload.variants.find((v) => !variantsAreEqual(v, payload.previousSuggestion!))
    if (alt) return alt
  }
  return payload.deterministicBest
}

function attachRegenerateFields(
  base: TaskSplitRequestPayload,
  previousSuggestion?: TaskSplitVariantPayload,
  isRegenerate?: boolean,
): TaskSplitRequestPayload {
  if (!isRegenerate || !previousSuggestion) return base
  return {
    ...base,
    previousSuggestion,
    regenerateRequest: true,
  }
}

export function buildWorkHistorySummary(args: {
  taskState: TaskState
  dateKey: string
  employeeA: string
  employeeB: string
  allTasks: Task[]
}): string {
  const focus = new Set([args.employeeA, args.employeeB])
  const taskName = (id: string) => args.allTasks.find((t) => t.id === id)?.name || id
  const lines: string[] = []
  for (const w of ['11', '17', '21'] as WindowKey[]) {
    const map = args.taskState[args.dateKey]?.[w] || {}
    for (const [taskId, c] of Object.entries(map)) {
      const people = collectAssignees(taskId, c)
      if (!people.some((n) => focus.has(n))) continue
      const wlab = w === '11' ? '11AM' : w === '17' ? '5PM' : '9PM'
      lines.push(`${wlab}: ${taskName(taskId)} (${people.join(', ')})`)
    }
  }
  const body = lines.join('\n')
  return body.length ? body.slice(0, 6000) : 'No completed tasks yet today for these two.'
}

export function buildTaskSplitRequestPayload(args: {
  taskState: TaskState
  dateKey: string
  windowKey: TaskSplitSuggestWindowKey
  employeeA: string
  employeeB: string
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
  soloModeActive: boolean
  deploymentChannel: 'main' | 'beta'
  candidateTaskIds: string[]
  historySummary: string
  lastTogetherSummary?: string
  /** Forced ice mode from the dice setup modal (user choice). Optional. */
  forceIceMode?: IceCompletionMode
  /** Prior displayed split when user tapped Regenerate. */
  previousSuggestion?: TaskSplitVariantPayload
  isRegenerate?: boolean
}): TaskSplitRequestPayload {
  const sorted = [...args.candidateTaskIds].sort()
  const rulesInfo = buildSplitRulesInfo({
    candidateTaskIds: sorted,
    allTasks: args.allTasks,
    windowKey: args.windowKey,
  })
  const splitRules: TaskSplitRulesPayload = {
    alwaysSharedTaskIds: rulesInfo.alwaysSharedTaskIds,
    splittableTaskIds: rulesInfo.splittableTaskIds,
    mopCoupling: rulesInfo.mopCoupling
      ? {
          mopTaskIds: rulesInfo.mopCoupling.mopTaskIds,
          forceMopperTaskIds: rulesInfo.mopCoupling.forceMopperTaskIds,
          forcePartnerTaskIds: rulesInfo.mopCoupling.forcePartnerTaskIds,
        }
      : null,
    rulesText: rulesInfo.rulesText,
  }

  const rotationMap: RotationPreferenceMap = buildRotationPreferenceMap({
    taskState: args.taskState,
    dateKey: args.dateKey,
    windowKey: args.windowKey,
    employeeA: args.employeeA,
    employeeB: args.employeeB,
    candidateTaskIds: sorted,
  })
  const variantAntiRotationCost = (v: TaskSplitVariantPayload): number =>
    computeAntiRotationCost(v.assignment, v.sharedTaskIds || [], rotationMap)

  const makePayload = (variants: TaskSplitVariantPayload[]): TaskSplitRequestPayload => ({
    payloadVersion: 1,
    dateKey: args.dateKey,
    windowKey: args.windowKey,
    employeeA: args.employeeA,
    employeeB: args.employeeB,
    deploymentChannel: args.deploymentChannel,
    soloModeActive: args.soloModeActive,
    historySummary: args.historySummary,
    lastTogetherSummary: args.lastTogetherSummary,
    candidateTaskIds: sorted,
    deterministicBest: variants[0]!,
    variants,
    forceIceMode: args.forceIceMode,
    splitRules,
  })

  if (args.isRegenerate && args.previousSuggestion) {
    let variants = buildRegenerateSplitVariants({
      taskState: args.taskState,
      dateKey: args.dateKey,
      windowKey: args.windowKey,
      employeeA: args.employeeA,
      employeeB: args.employeeB,
      candidateTaskIds: sorted,
      allTasks: args.allTasks,
      taskOverrides: args.taskOverrides,
      windowMs: args.windowMs,
      soloModeActive: args.soloModeActive,
      forceIceMode: args.forceIceMode,
      previousSuggestion: args.previousSuggestion,
      maxVariants: 8,
    })
    if (variants.length === 0) {
      const best = findBestFairSplit({
        taskState: args.taskState,
        dateKey: args.dateKey,
        windowKey: args.windowKey,
        employeeA: args.employeeA,
        employeeB: args.employeeB,
        candidateTaskIds: sorted,
        allTasks: args.allTasks,
        taskOverrides: args.taskOverrides,
        windowMs: args.windowMs,
        soloModeActive: args.soloModeActive,
        forceIceMode: args.forceIceMode,
      })
      variants = [fairSplitResultToVariant(best, 0)]
    }
    if (variants.length > 1) {
      const prevAssign = args.previousSuggestion.assignment
      const diffCount = (v: TaskSplitVariantPayload): number => {
        const keys = new Set([...Object.keys(prevAssign), ...Object.keys(v.assignment)])
        let d = 0
        for (const k of keys) {
          if ((prevAssign[k] || '').trim() !== (v.assignment[k] || '').trim()) d++
        }
        return d
      }
      variants = [...variants].sort((x, y) => {
        const dx = diffCount(x)
        const dy = diffCount(y)
        if (dx !== dy) return dy - dx
        const cx = variantAntiRotationCost(x)
        const cy = variantAntiRotationCost(y)
        if (cx !== cy) return cx - cy
        if (x.scoreDiff !== y.scoreDiff) return x.scoreDiff - y.scoreDiff
        return x.mask - y.mask
      })
    }
    return attachRegenerateFields(makePayload(variants), args.previousSuggestion, true)
  }

  if (sorted.length > 18) {
    const best = findBestFairSplit({
      taskState: args.taskState,
      dateKey: args.dateKey,
      windowKey: args.windowKey,
      employeeA: args.employeeA,
      employeeB: args.employeeB,
      candidateTaskIds: sorted,
      allTasks: args.allTasks,
      taskOverrides: args.taskOverrides,
      windowMs: args.windowMs,
      soloModeActive: args.soloModeActive,
      forceIceMode: args.forceIceMode,
    })
    const v = fairSplitResultToVariant(best, -1)
    return makePayload([v])
  }

  let maxStreak = 0
  for (const pref of Object.values(rotationMap)) maxStreak = Math.max(maxStreak, pref.streak)
  const BASE_TOL = 0.45
  const ROT_MAX_EXTRA = 1.0
  const extra = ROT_MAX_EXTRA * Math.min(1, Math.max(0, (maxStreak - 1) / 2))
  const tolerance = BASE_TOL + extra

  const masks = enumerateNearOptimalSplitMasks({
    taskState: args.taskState,
    dateKey: args.dateKey,
    windowKey: args.windowKey,
    employeeA: args.employeeA,
    employeeB: args.employeeB,
    candidateTaskIds: sorted,
    allTasks: args.allTasks,
    taskOverrides: args.taskOverrides,
    windowMs: args.windowMs,
    soloModeActive: args.soloModeActive,
    tolerance,
    maxVariants: 16,
    forceIceMode: args.forceIceMode,
  })

  const variants: TaskSplitVariantPayload[] = masks.map((encodedMask) => {
    const r = fairSplitFromEncodedMask(
      encodedMask,
      sorted,
      args.employeeA,
      args.employeeB,
      args.taskState,
      args.dateKey,
      args.windowKey,
      args.allTasks,
      args.taskOverrides,
      args.windowMs,
      args.soloModeActive,
    )
    return fairSplitResultToVariant(r, encodedMask)
  })

  variants.sort((x, y) => {
    const cx = variantAntiRotationCost(x)
    const cy = variantAntiRotationCost(y)
    if (cx !== cy) return cx - cy
    if (x.scoreDiff !== y.scoreDiff) return x.scoreDiff - y.scoreDiff
    return x.mask - y.mask
  })

  if (variants.length === 0) {
    const best = findBestFairSplit({
      taskState: args.taskState,
      dateKey: args.dateKey,
      windowKey: args.windowKey,
      employeeA: args.employeeA,
      employeeB: args.employeeB,
      candidateTaskIds: sorted,
      allTasks: args.allTasks,
      taskOverrides: args.taskOverrides,
      windowMs: args.windowMs,
      soloModeActive: args.soloModeActive,
      forceIceMode: args.forceIceMode,
    })
    const v = fairSplitResultToVariant(best, 0)
    return makePayload([v])
  }

  return makePayload(variants)
}

const TIMEOUT_MS = 45_000

function parseIceSplitFromDoc(raw: unknown): Record<string, { left: string; right: string }> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const out: Record<string, { left: string; right: string }> = {}
  for (const [k, v] of Object.entries(o)) {
    if (typeof k !== 'string' || k.length < 1 || k.length > 120) continue
    if (!v || typeof v !== 'object') continue
    const p = v as Record<string, unknown>
    if (typeof p.left !== 'string' || typeof p.right !== 'string') continue
    out[k] = { left: p.left, right: p.right }
  }
  return Object.keys(out).length ? out : undefined
}

function parseSharedTaskIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (!t || t.length > 120) continue
    out.push(t)
  }
  return out.length ? out : []
}

function normalizeComplete(
  data: Record<string, unknown>,
  fallback: TaskSplitRequestPayload,
): TaskSplitSuggestResult {
  const fa = data.finalAssignment
  const assignment =
    fa && typeof fa === 'object'
      ? (fa as Record<string, string>)
      : fallback.deterministicBest.assignment
  const iceMode =
    data.finalIceMode === 'split' || data.finalIceMode === 'whole'
      ? data.finalIceMode
      : fallback.deterministicBest.iceMode
  const iceSplit =
    parseIceSplitFromDoc(data.finalIceSplitAssignment) ?? fallback.deterministicBest.iceSplitAssignment
  const sharedTaskIds =
    parseSharedTaskIds(data.finalSharedTaskIds) ?? fallback.deterministicBest.sharedTaskIds ?? []
  return {
    finalAssignment: assignment,
    finalIceMode: iceMode,
    finalIceSplitAssignment: iceSplit,
    finalSharedTaskIds: sharedTaskIds,
    rationale: typeof data.rationale === 'string' ? data.rationale.trim() : '',
    source: typeof data.source === 'string' ? data.source : 'ai',
    projectedScoreFloatA:
      typeof data.projectedScoreFloatA === 'number' ? data.projectedScoreFloatA : fallback.deterministicBest.projectedScoreFloatA,
    projectedScoreFloatB:
      typeof data.projectedScoreFloatB === 'number' ? data.projectedScoreFloatB : fallback.deterministicBest.projectedScoreFloatB,
    scoreDiff: typeof data.scoreDiff === 'number' ? data.scoreDiff : fallback.deterministicBest.scoreDiff,
    employeeA: fallback.employeeA,
    employeeB: fallback.employeeB,
  }
}

export async function submitTaskSplitRequest(payload: TaskSplitRequestPayload): Promise<TaskSplitSuggestResult> {
  return new Promise((resolve) => {
    let resolved = false
    let unsub: (() => void) | null = null
    const cleanup = () => {
      if (unsub) {
        unsub()
        unsub = null
      }
    }

    const finish = (data: Record<string, unknown>) => {
      if (resolved) return
      resolved = true
      cleanup()
      clearTimeout(timer)
      resolve(normalizeComplete(data, payload))
    }

    const timer = setTimeout(() => {
      const fb = pickFallbackVariant(payload)
      finish({
        status: 'complete',
        finalAssignment: fb.assignment,
        finalIceMode: fb.iceMode,
        finalIceSplitAssignment: fb.iceSplitAssignment,
        finalSharedTaskIds: fb.sharedTaskIds || [],
        rationale: '',
        source: 'fallback',
        projectedScoreFloatA: fb.projectedScoreFloatA,
        projectedScoreFloatB: fb.projectedScoreFloatB,
        scoreDiff: fb.scoreDiff,
      })
    }, TIMEOUT_MS)

    addDoc(collection(db, 'aiTaskSplitRequests'), {
      status: 'pending',
      payload,
      requestedAt: serverTimestamp(),
    })
      .then((docRef) => {
        unsub = onSnapshot(docRef, (snap) => {
          const data = snap.data() as Record<string, unknown> | undefined
          if (!data || data.status === 'pending') return
          if (data.status === 'error') {
            const fb = pickFallbackVariant(payload)
            finish({
              status: 'complete',
              finalAssignment: fb.assignment,
              finalIceMode: fb.iceMode,
              finalIceSplitAssignment: fb.iceSplitAssignment,
              finalSharedTaskIds: fb.sharedTaskIds || [],
              rationale: typeof data.error === 'string' ? data.error : 'Request failed',
              source: 'fallback',
              projectedScoreFloatA: fb.projectedScoreFloatA,
              projectedScoreFloatB: fb.projectedScoreFloatB,
              scoreDiff: fb.scoreDiff,
            })
            return
          }
          if (data.status === 'complete') {
            finish(data)
          }
        })
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[taskSplitSuggestAi] Firestore write failed:', msg)
        const fb = pickFallbackVariant(payload)
        finish({
          status: 'complete',
          finalAssignment: fb.assignment,
          finalIceMode: fb.iceMode,
          finalIceSplitAssignment: fb.iceSplitAssignment,
          finalSharedTaskIds: fb.sharedTaskIds || [],
          rationale: msg,
          source: 'fallback',
          projectedScoreFloatA: fb.projectedScoreFloatA,
          projectedScoreFloatB: fb.projectedScoreFloatB,
          scoreDiff: fb.scoreDiff,
        })
      })
  })
}
