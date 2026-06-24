import { describe, expect, it } from 'vitest'
import {
  buildRegenerateSplitVariants,
  countSoleAssignSwaps,
  prepareVariantsForRegenerate,
  variantDifferenceScore,
  variantsAreEqual,
  type RegenerateSplitContext,
  type TaskSplitVariantPayload,
} from './taskSplitPartition'
import type { TaskLike } from './taskScoring'

const baseVariant = (
  assignment: Record<string, string>,
  extra?: Partial<TaskSplitVariantPayload>,
): TaskSplitVariantPayload => ({
  mask: 0,
  assignment,
  projectedScoreFloatA: 10,
  projectedScoreFloatB: 10,
  scoreDiff: 0,
  ...extra,
})

describe('variantsAreEqual', () => {
  it('detects identical assignments', () => {
    const a = baseVariant({ mop: 'Alice', sweep: 'Bob' })
    const b = baseVariant({ mop: 'Alice', sweep: 'Bob' })
    expect(variantsAreEqual(a, b)).toBe(true)
  })

  it('detects swapped assignee', () => {
    const a = baseVariant({ mop: 'Alice', sweep: 'Bob' })
    const b = baseVariant({ mop: 'Bob', sweep: 'Alice' })
    expect(variantsAreEqual(a, b)).toBe(false)
  })

  it('detects shared task set changes', () => {
    const a = baseVariant({ trash: 'Alice' }, { sharedTaskIds: ['trash'] })
    const b = baseVariant({ trash: 'Alice' }, { sharedTaskIds: [] })
    expect(variantsAreEqual(a, b)).toBe(false)
  })
})

describe('countSoleAssignSwaps', () => {
  it('ignores always-shared ids', () => {
    const shared = new Set(['trash'])
    const prev = baseVariant({ trash: 'Alice', mop: 'Alice', sweep: 'Bob' })
    const next = baseVariant({ trash: 'Bob', mop: 'Bob', sweep: 'Alice' })
    expect(countSoleAssignSwaps(prev, next, shared)).toBe(2)
  })
})

describe('variantDifferenceScore weighted', () => {
  it('weights flips by task weight and mop owner change', () => {
    const ctx: RegenerateSplitContext = {
      weightByTaskId: { light: 1, 'mop-close': 8 },
      alwaysSharedIds: new Set(['trash']),
      mopCoupling: { mopTaskIds: ['mop-close'], forceMopperTaskIds: [], forcePartnerTaskIds: ['sweep-close'] },
    }
    const prev = baseVariant({ 'mop-close': 'Alice', 'sweep-close': 'Bob', light: 'Alice' })
    const cand = baseVariant({ 'mop-close': 'Bob', 'sweep-close': 'Alice', light: 'Bob' })
    const unweighted = variantDifferenceScore(prev, cand)
    const weighted = variantDifferenceScore(prev, cand, ctx)
    expect(weighted).toBeGreaterThan(unweighted)
  })
})

describe('prepareVariantsForRegenerate', () => {
  it('filters identical variant and sorts by difference', () => {
    const previous = baseVariant({ a: 'Alice', b: 'Bob', c: 'Alice' })
    const same = baseVariant({ a: 'Alice', b: 'Bob', c: 'Alice' }, { mask: 1 })
    const oneSwap = baseVariant({ a: 'Bob', b: 'Bob', c: 'Alice' }, { mask: 2 })
    const twoSwap = baseVariant({ a: 'Bob', b: 'Alice', c: 'Alice' }, { mask: 3 })
    const out = prepareVariantsForRegenerate([same, oneSwap, twoSwap], previous)
    expect(out).toHaveLength(2)
    expect(variantsAreEqual(out[0]!, twoSwap)).toBe(true)
    expect(variantDifferenceScore(previous, out[0]!)).toBeGreaterThan(
      variantDifferenceScore(previous, out[1]!),
    )
  })
})

describe('buildRegenerateSplitVariants', () => {
  const employeeA = 'Alice'
  const employeeB = 'Bob'
  const allTasks: TaskLike[] = [
    { id: 'mop-close', weight: 5, windows: ['21'] },
    { id: 'sweep-close', weight: 3, windows: ['21'] },
    { id: 'count-drawer', weight: 2, windows: ['21'] },
    { id: 'split-tips-close', weight: 2, windows: ['21'] },
    { id: 'take-out-trash', weight: 1, windows: ['21'] },
    { id: 'dining-area', weight: 1, windows: ['21'] },
  ]
  const candidateTaskIds = allTasks.map((t) => t.id)
  const windowMs = {
    windowStartMsForDateKey: () => 0,
    windowCloseMsForDateKey: () => 86400000,
  }
  const dateKey = '2026-06-10'

  it('returns variants that differ from previous with at least one sole-assign swap', () => {
    const previous = baseVariant({
      'mop-close': employeeA,
      'sweep-close': employeeB,
      'count-drawer': employeeB,
      'split-tips-close': employeeB,
      'take-out-trash': employeeA,
      'dining-area': employeeA,
    })
    const variants = buildRegenerateSplitVariants({
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds,
      allTasks,
      taskOverrides: null,
      windowMs,
      previousSuggestion: previous,
      maxVariants: 8,
    })
    expect(variants.length).toBeGreaterThan(0)
    for (const v of variants) {
      expect(variantsAreEqual(v, previous)).toBe(false)
    }
    const top = variants[0]!
    expect(countSoleAssignSwaps(previous, top, new Set(['take-out-trash', 'dining-area']))).toBeGreaterThan(0)
  })

  it('completes n=18 brute regenerate within 500ms', () => {
    const n = 18
    const ids = Array.from({ length: n }, (_, i) => `regen-task-${i}`)
    const tasks: TaskLike[] = ids.map((id, i) => ({
      id,
      weight: (i % 5) + 1,
      windows: ['21'] as const,
    }))
    const assignment: Record<string, string> = {}
    ids.forEach((id, i) => {
      assignment[id] = i % 2 === 0 ? employeeA : employeeB
    })
    const previous = baseVariant(assignment)
    const t0 = performance.now()
    const variants = buildRegenerateSplitVariants({
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds: ids,
      allTasks: tasks,
      taskOverrides: null,
      windowMs,
      previousSuggestion: previous,
      maxVariants: 8,
    })
    expect(performance.now() - t0).toBeLessThan(500)
    expect(variants.length).toBeGreaterThan(0)
    expect(variants.length).toBeLessThanOrEqual(8)
    for (const v of variants) {
      expect(variantsAreEqual(v, previous)).toBe(false)
    }
  })
})
