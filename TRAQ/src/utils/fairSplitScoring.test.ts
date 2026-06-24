import { describe, it, expect } from 'vitest'
import type { FairSplitContractDoc, TaskState } from '../services/firestore'
import {
  fairSplitFollowCompliant,
  fairSplitPreviewWindowPoints,
  fairSplitHasDivergence,
} from './fairSplitScoring'

const emptyState = (dk: string): TaskState => ({
  [dk]: { '11': {}, '17': {}, '21': {} },
})

function baseContract(over: Partial<FairSplitContractDoc> = {}): FairSplitContractDoc {
  return {
    dateKey: '2026-05-13',
    windowKey: '21',
    employeeA: 'Alice',
    employeeB: 'Bob',
    taskIds: [],
    suggestedAssignment: {},
    finalSharedTaskIds: [],
    finalIceMode: 'whole',
    baselinePointsFloatA: 15,
    baselinePointsFloatB: 0,
    version: 1,
    ...over,
  }
}

describe('fairSplitFollowCompliant', () => {
  it('is true when S is empty (vacuous)', () => {
    const ok = fairSplitFollowCompliant({
      state: emptyState('2026-05-13'),
      dateKey: '2026-05-13',
      shift: 'night',
      contract: baseContract(),
      taskWeightByIdByWindow: { '11': {}, '17': {}, '21': {} },
      deferredFrom17: [],
      useBalancedScoring: false,
    })
    expect(ok).toBe(true)
  })

  it('treats a balanced-optional ice task marked didNotNeedToComplete as satisfied', () => {
    const dk = '2026-05-13'
    const state: TaskState = {
      [dk]: {
        '11': {},
        '17': {},
        '21': {
          'ice-close': {
            status: 'done',
            assignees: [],
            completedAt: '2026-05-13T22:00:00.000Z',
            didNotNeedToComplete: true,
          },
          'mop-close': {
            status: 'done',
            assignees: ['Alice'],
            completedAt: '2026-05-13T22:05:00.000Z',
          },
        },
      },
    }
    const ok = fairSplitFollowCompliant({
      state,
      dateKey: dk,
      shift: 'night',
      contract: baseContract({
        taskIds: ['ice-close', 'mop-close'],
        suggestedAssignment: { 'mop-close': 'Alice' },
      }),
      taskWeightByIdByWindow: { '11': {}, '17': {}, '21': { 'ice-close': 5, 'mop-close': 5 } },
      deferredFrom17: [],
      useBalancedScoring: true,
    })
    expect(ok).toBe(true)
  })

  it('is false when a genuinely-required task is not completed', () => {
    const ok = fairSplitFollowCompliant({
      state: emptyState('2026-05-13'),
      dateKey: '2026-05-13',
      shift: 'night',
      contract: baseContract({
        taskIds: ['mop-close'],
        suggestedAssignment: { 'mop-close': 'Alice' },
      }),
      taskWeightByIdByWindow: { '11': {}, '17': {}, '21': { 'mop-close': 5 } },
      deferredFrom17: [],
      useBalancedScoring: false,
    })
    expect(ok).toBe(false)
  })
})

describe('fairSplitPreviewWindowPoints', () => {
  const previewArgsBase = {
    state: emptyState('2026-05-13'),
    dateKey: '2026-05-13',
    shift: 'night' as const,
    contract: baseContract({
      baselinePointsFloatA: 15,
      baselinePointsFloatB: 0,
    }),
    windowTaskWeights: { '11': 0, '17': 0, '21': 10 },
    taskWeightByIdByWindow: { '11': {}, '17': {}, '21': {} },
    deferredFrom17: [] as Array<{ taskId: string; completion: import('../services/firestore').TaskCompletion; weight: number }>,
    deferredWeightTotal17: 0,
    useBalancedScoring: false,
    useDailyTaskPoints: false,
    canonicalPointsByWindow: {
      '11': {},
      '17': {},
      '21': { Alice: 15, Bob: 3, Carol: 22 },
    },
  }

  it('snaps A/B to 50 at follow compliance when baselines are 15 and 0', () => {
    const p = fairSplitPreviewWindowPoints(previewArgsBase)
    expect(p.pointsA).toBe(50)
    expect(p.pointsB).toBe(50)
  })

  it('forces exactly 50/50 at follow compliance even when a baseline is > 50', () => {
    const p = fairSplitPreviewWindowPoints({
      ...previewArgsBase,
      contract: baseContract({
        baselinePointsFloatA: 60,
        baselinePointsFloatB: 55,
      }),
      canonicalPointsByWindow: {
        '11': {},
        '17': {},
        '21': { Alice: 60, Bob: 55 },
      },
    })
    expect(p.pointsA).toBe(50)
    expect(p.pointsB).toBe(50)
  })

  it('forces exactly 50/50 at follow compliance with asymmetric baselines', () => {
    const p = fairSplitPreviewWindowPoints({
      ...previewArgsBase,
      contract: baseContract({
        baselinePointsFloatA: 5,
        baselinePointsFloatB: 48,
      }),
      canonicalPointsByWindow: {
        '11': {},
        '17': {},
        '21': { Alice: 5, Bob: 48 },
      },
    })
    expect(p.pointsA).toBe(50)
    expect(p.pointsB).toBe(50)
  })

  it('stays exactly 50/50 at follow compliance even with a completed daily task and daily points on', () => {
    const dk = '2026-05-13'
    const state: TaskState = {
      [dk]: {
        '11': {},
        '17': {},
        '21': {
          'daily-task': {
            status: 'done',
            assignees: ['Alice'],
            completedAt: '2026-05-13T22:30:00.000Z',
          },
        },
      },
    }
    const p = fairSplitPreviewWindowPoints({
      ...previewArgsBase,
      state,
      useDailyTaskPoints: true,
      contract: baseContract({ baselinePointsFloatA: 15, baselinePointsFloatB: 0 }),
    })
    expect(p.pointsA).toBe(50)
    expect(p.pointsB).toBe(50)
  })

  it('leaves Carol unchanged in canonical map (only A/B returned from preview)', () => {
    const p = fairSplitPreviewWindowPoints(previewArgsBase)
    expect(p.pointsA).toBe(50)
    expect(p.pointsB).toBe(50)
    expect(previewArgsBase.canonicalPointsByWindow['21'].Carol).toBe(22)
  })
})

describe('fairSplitPreviewWindowPoints capped climb', () => {
  const dk = '2026-05-13'
  const climbBase = {
    dateKey: dk,
    shift: 'night' as const,
    windowTaskWeights: { '11': 0, '17': 0, '21': 10 },
    taskWeightByIdByWindow: { '11': {}, '17': {}, '21': { 'mop-close': 5, 'trash-close': 5 } },
    deferredFrom17: [] as Array<{ taskId: string; completion: import('../services/firestore').TaskCompletion; weight: number }>,
    deferredWeightTotal17: 0,
    useBalancedScoring: false,
    useDailyTaskPoints: false,
    canonicalPointsByWindow: { '11': {}, '17': {}, '21': { Alice: 15, Bob: 0 } },
  }
  const climbContract = baseContract({
    taskIds: ['mop-close', 'trash-close'],
    suggestedAssignment: { 'mop-close': 'Alice', 'trash-close': 'Bob' },
    baselinePointsFloatA: 15,
    baselinePointsFloatB: 0,
  })

  it('partial, no deviation: both <= 50, above baseline, and close together (not 50/0)', () => {
    const state: TaskState = {
      [dk]: {
        '11': {},
        '17': {},
        '21': {
          'mop-close': { status: 'done', assignees: ['Alice'], completedAt: '2026-05-13T22:00:00.000Z' },
        },
      },
    }
    const p = fairSplitPreviewWindowPoints({ ...climbBase, state, contract: climbContract })
    // half the split weight done -> frac 0.5: A = 15 + 35*0.5 = 32.5, B = 0 + 50*0.5 = 25
    expect(p.pointsA).toBeLessThanOrEqual(50)
    expect(p.pointsB).toBeLessThanOrEqual(50)
    expect(p.pointsA).toBeGreaterThan(15)
    expect(p.pointsB).toBeGreaterThan(0)
    // Far closer than the old per-player math (which gave 50 vs 0).
    expect(Math.abs(p.pointsA - p.pointsB)).toBeLessThan(20)
  })

  it('partial WITH deviation never reads above 50 (regression guard against ~59 overshoot)', () => {
    const state: TaskState = {
      [dk]: {
        '11': {},
        '17': {},
        '21': {
          // Bob completed the task suggested for Alice.
          'mop-close': { status: 'done', assignees: ['Bob'], completedAt: '2026-05-13T22:00:00.000Z' },
        },
      },
    }
    const p = fairSplitPreviewWindowPoints({ ...climbBase, state, contract: climbContract })
    expect(p.pointsA).toBeLessThanOrEqual(50)
    expect(p.pointsB).toBeLessThanOrEqual(50)
  })

  it('full completion (split followed) reads exactly 50/50', () => {
    const state: TaskState = {
      [dk]: {
        '11': {},
        '17': {},
        '21': {
          'mop-close': { status: 'done', assignees: ['Alice'], completedAt: '2026-05-13T22:00:00.000Z' },
          'trash-close': { status: 'done', assignees: ['Bob'], completedAt: '2026-05-13T22:05:00.000Z' },
        },
      },
    }
    const p = fairSplitPreviewWindowPoints({ ...climbBase, state, contract: climbContract })
    expect(p.pointsA).toBe(50)
    expect(p.pointsB).toBe(50)
  })
})

describe('fairSplitHasDivergence', () => {
  it('detects wrong assignee on a completed S task', () => {
    const contract = baseContract({
      taskIds: ['mop-close'],
      suggestedAssignment: { 'mop-close': 'Alice' },
    })
    const state: TaskState = {
      '2026-05-13': {
        '11': {},
        '17': {},
        '21': {
          'mop-close': {
            status: 'done',
            assignees: ['Bob'],
            completedAt: '2026-05-13T22:00:00.000Z',
          },
        },
      },
    }
    const div = fairSplitHasDivergence({
      state,
      dateKey: '2026-05-13',
      shift: 'night',
      contract,
      taskWeightByIdByWindow: { '11': {}, '17': {}, '21': { 'mop-close': 5 } },
      deferredFrom17: [],
      useBalancedScoring: false,
    })
    expect(div).toBe(true)
  })
})
