export type TaskSplitWindowKey = '17' | '21'

export type TaskSplitVariantPayload = {
  mask: number
  assignment: Record<string, string>
  projectedScoreFloatA: number
  projectedScoreFloatB: number
  scoreDiff: number
  iceMode?: 'whole' | 'split'
  iceSplitAssignment?: Record<string, { left: string; right: string }>
  /** Non-ice/non-towel task ids the panel should render on BOTH sides (split-points). */
  sharedTaskIds?: string[]
}

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

export type TaskSplitRequestPayload = {
  payloadVersion: 1
  dateKey: string
  windowKey: TaskSplitWindowKey
  employeeA: string
  employeeB: string
  deploymentChannel: 'main' | 'beta'
  soloModeActive: boolean
  historySummary: string
  lastTogetherSummary?: string
  candidateTaskIds: string[]
  deterministicBest: TaskSplitVariantPayload
  variants: TaskSplitVariantPayload[]
  /** When set, only this ice mode is considered (user choice from the dice setup modal). */
  forceIceMode?: 'whole' | 'split'
  /** Structured split-rules guidance the AI prompt should include. */
  splitRules?: TaskSplitRulesPayload
  /** Present when user tapped Regenerate — the split they just saw and want changed. */
  previousSuggestion?: TaskSplitVariantPayload
  regenerateRequest?: true
}

export function validateTaskSplitRequestPayload(data: unknown): TaskSplitRequestPayload | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.payloadVersion !== 1) return null
  if (typeof d.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.dateKey)) return null
  if (d.windowKey !== '17' && d.windowKey !== '21') return null
  if (typeof d.employeeA !== 'string' || d.employeeA.length < 1 || d.employeeA.length > 80) return null
  if (typeof d.employeeB !== 'string' || d.employeeB.length < 1 || d.employeeB.length > 80) return null
  if (d.employeeA === d.employeeB) return null
  if (d.deploymentChannel !== 'main' && d.deploymentChannel !== 'beta') return null
  if (typeof d.soloModeActive !== 'boolean') return null
  if (typeof d.historySummary !== 'string' || d.historySummary.length > 8000) return null
  if (!Array.isArray(d.candidateTaskIds)) return null
  for (const id of d.candidateTaskIds) {
    if (typeof id !== 'string' || id.length < 1 || id.length > 120) return null
  }
  const candIds = (d.candidateTaskIds as string[]).slice().sort()
  const best = parseVariant(d.deterministicBest, d.employeeA, d.employeeB)
  if (!best) return null
  if (!assignmentKeysMatchCandidates(best.assignment, candIds)) return null
  if (!Array.isArray(d.variants) || d.variants.length < 1) return null
  const variants: TaskSplitVariantPayload[] = []
  for (const raw of d.variants.slice(0, 12)) {
    const v = parseVariant(raw, d.employeeA, d.employeeB)
    if (!v) return null
    if (!assignmentKeysMatchCandidates(v.assignment, candIds)) return null
    variants.push(v)
  }
  let forceIceMode: 'whole' | 'split' | undefined
  if (d.forceIceMode === 'whole' || d.forceIceMode === 'split') {
    forceIceMode = d.forceIceMode
  }
  const splitRules = parseSplitRules(d.splitRules)
  let previousSuggestion: TaskSplitVariantPayload | undefined
  if (d.previousSuggestion !== undefined && d.previousSuggestion !== null) {
    const prev = parseVariant(d.previousSuggestion, d.employeeA, d.employeeB)
    if (!prev) return null
    previousSuggestion = prev
  }
  const regenerateRequest = d.regenerateRequest === true ? true : undefined
  let lastTogetherSummary: string | undefined
  if (d.lastTogetherSummary !== undefined && d.lastTogetherSummary !== null) {
    if (typeof d.lastTogetherSummary !== 'string' || d.lastTogetherSummary.length > 6000) return null
    lastTogetherSummary = d.lastTogetherSummary
  }
  return {
    payloadVersion: 1,
    dateKey: d.dateKey,
    windowKey: d.windowKey as TaskSplitWindowKey,
    employeeA: d.employeeA,
    employeeB: d.employeeB,
    deploymentChannel: d.deploymentChannel as 'main' | 'beta',
    soloModeActive: d.soloModeActive,
    historySummary: d.historySummary,
    lastTogetherSummary,
    candidateTaskIds: d.candidateTaskIds as string[],
    deterministicBest: best,
    variants,
    forceIceMode,
    splitRules,
    previousSuggestion,
    regenerateRequest,
  }
}

function parseSplitRules(raw: unknown): TaskSplitRulesPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const sanitizeIds = (val: unknown): string[] => {
    if (!Array.isArray(val)) return []
    const out: string[] = []
    for (const v of val) {
      if (typeof v !== 'string') continue
      const t = v.trim()
      if (!t || t.length > 120) continue
      out.push(t)
    }
    return out
  }
  const alwaysSharedTaskIds = sanitizeIds(r.alwaysSharedTaskIds)
  const splittableTaskIds = sanitizeIds(r.splittableTaskIds)
  let mopCoupling: TaskSplitRulesPayload['mopCoupling'] = null
  if (r.mopCoupling && typeof r.mopCoupling === 'object') {
    const mc = r.mopCoupling as Record<string, unknown>
    let mopTaskIds = sanitizeIds(mc.mopTaskIds)
    if (mopTaskIds.length === 0 && typeof mc.mopTaskId === 'string' && mc.mopTaskId.trim()) {
      mopTaskIds = [mc.mopTaskId.trim()]
    }
    if (mopTaskIds.length) {
      mopCoupling = {
        mopTaskIds,
        forceMopperTaskIds: sanitizeIds(mc.forceMopperTaskIds),
        forcePartnerTaskIds: sanitizeIds(mc.forcePartnerTaskIds),
      }
    }
  }
  const rulesText =
    typeof r.rulesText === 'string' ? r.rulesText.slice(0, 4000) : ''
  return { alwaysSharedTaskIds, splittableTaskIds, mopCoupling, rulesText }
}

function assignmentKeysMatchCandidates(assignment: Record<string, string>, candIdsSorted: string[]): boolean {
  const keys = Object.keys(assignment).sort()
  if (keys.length !== candIdsSorted.length) return false
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== candIdsSorted[i]) return false
  }
  return true
}

function parseVariant(raw: unknown, employeeA: string, employeeB: string): TaskSplitVariantPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.mask !== 'number' || !Number.isFinite(v.mask)) return null
  if (typeof v.projectedScoreFloatA !== 'number' || !Number.isFinite(v.projectedScoreFloatA)) return null
  if (typeof v.projectedScoreFloatB !== 'number' || !Number.isFinite(v.projectedScoreFloatB)) return null
  if (typeof v.scoreDiff !== 'number' || !Number.isFinite(v.scoreDiff)) return null
  if (!v.assignment || typeof v.assignment !== 'object') return null
  const assignment: Record<string, string> = {}
  for (const [k, val] of Object.entries(v.assignment as Record<string, unknown>)) {
    if (typeof k !== 'string' || k.length < 1 || k.length > 120) return null
    if (val !== employeeA && val !== employeeB) return null
    assignment[k] = val as string
  }
  let iceMode: 'whole' | 'split' | undefined
  if (v.iceMode === 'whole' || v.iceMode === 'split') iceMode = v.iceMode

  let iceSplitAssignment: Record<string, { left: string; right: string }> | undefined
  if (v.iceSplitAssignment && typeof v.iceSplitAssignment === 'object') {
    const raw = v.iceSplitAssignment as Record<string, unknown>
    const out: Record<string, { left: string; right: string }> = {}
    for (const [tid, val] of Object.entries(raw)) {
      if (typeof tid !== 'string' || tid.length < 1 || tid.length > 120) return null
      if (!val || typeof val !== 'object') return null
      const s = val as Record<string, unknown>
      if (typeof s.left !== 'string' || typeof s.right !== 'string') return null
      if (s.left !== employeeA && s.left !== employeeB) return null
      if (s.right !== employeeA && s.right !== employeeB) return null
      out[tid] = { left: s.left, right: s.right }
    }
    if (Object.keys(out).length) iceSplitAssignment = out
  }

  let sharedTaskIds: string[] | undefined
  if (Array.isArray(v.sharedTaskIds)) {
    const out: string[] = []
    for (const tid of v.sharedTaskIds) {
      if (typeof tid !== 'string' || tid.length < 1 || tid.length > 120) return null
      out.push(tid)
    }
    sharedTaskIds = out
  }

  return {
    mask: v.mask,
    assignment,
    projectedScoreFloatA: v.projectedScoreFloatA,
    projectedScoreFloatB: v.projectedScoreFloatB,
    scoreDiff: v.scoreDiff,
    iceMode,
    iceSplitAssignment,
    sharedTaskIds,
  }
}
