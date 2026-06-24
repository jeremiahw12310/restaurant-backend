import { describe, expect, it } from 'vitest'
import type { TaskCompletion, TaskState } from '../services/firestore'
import type { Task } from '../types/task'
import {
  buildLastTogetherSummaryForSplit,
  buildRotationPreferenceMap,
  computeAntiRotationCost,
  isManualLastTimeCompletion,
  rotationStreakWeight,
} from './lastTogetherHistory'

const done = (assignees: string[], extra?: Partial<TaskCompletion>): TaskCompletion => ({
  status: 'done',
  assignees,
  completedAt: '2026-06-01T22:00:00.000Z',
  ...extra,
})

const tasks: Task[] = [
  { id: 'mop-close', name: 'Mop Close' } as Task,
  { id: 'trash', name: 'Trash', requiresSplit: true } as Task,
]

describe('isManualLastTimeCompletion', () => {
  it('accepts normal manual completion', () => {
    expect(isManualLastTimeCompletion(done(['Alice']))).toBe(true)
  })

  it('rejects autoAssigned', () => {
    expect(isManualLastTimeCompletion(done(['Alice'], { autoAssigned: true }))).toBe(false)
  })

  it('rejects deferredToClose', () => {
    expect(isManualLastTimeCompletion(done(['Alice'], { deferredToClose: '9' }))).toBe(false)
  })

  it('rejects didNotNeedToComplete', () => {
    expect(isManualLastTimeCompletion(done(['Alice'], { didNotNeedToComplete: true }))).toBe(false)
  })
})

describe('buildLastTogetherSummaryForSplit', () => {
  const employeeA = 'Alice'
  const employeeB = 'Bob'
  const dateKey = '2026-06-10'

  it('returns fallback when no shared shift dates', () => {
    const taskState = {
      '2026-06-08': {
        '21': {
          mop: done(['Alice']),
        },
      },
    } as unknown as TaskState
    const summary = buildLastTogetherSummaryForSplit({
      taskState,
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds: ['mop-close'],
      allTasks: tasks,
    })
    expect(summary).toBe('No prior shared-shift completions for this pair in this window.')
  })

  it('shows solo streak and prefer-other rotation hint', () => {
    const taskState = {
      '2026-06-09': {
        '21': {
          'mop-close': done([employeeA]),
          other: done([employeeA, employeeB]),
        },
      },
      '2026-06-08': {
        '21': {
          'mop-close': done([employeeA]),
          other: done([employeeA, employeeB]),
        },
      },
    } as unknown as TaskState
    const summary = buildLastTogetherSummaryForSplit({
      taskState,
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds: ['mop-close'],
      allTasks: tasks,
    })
    expect(summary).toContain('Mop Close')
    expect(summary).toContain(`${employeeA} ×2`)
    expect(summary).toContain(`→ prefer ${employeeB}`)
    expect(summary).toContain('2026-06-09')
  })

  it('shows no rotation for split completions', () => {
    const taskState = {
      '2026-06-09': {
        '21': {
          trash: done([employeeA, employeeB]),
          anchor: done([employeeA, employeeB]),
        },
      },
    } as unknown as TaskState
    const summary = buildLastTogetherSummaryForSplit({
      taskState,
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds: ['trash'],
      allTasks: tasks,
    })
    expect(summary).toContain('both split together')
    expect(summary).toContain('no rotation')
  })
})

describe('rotationStreakWeight', () => {
  it('is zero for non-positive streaks', () => {
    expect(rotationStreakWeight(0)).toBe(0)
    expect(rotationStreakWeight(-3)).toBe(0)
  })

  it('is steep (quadratic) and strictly monotonic', () => {
    expect(rotationStreakWeight(1)).toBe(1)
    expect(rotationStreakWeight(2)).toBe(4)
    expect(rotationStreakWeight(3)).toBe(9)
    expect(rotationStreakWeight(4)).toBe(16)
    expect(rotationStreakWeight(4) - rotationStreakWeight(3)).toBeGreaterThan(
      rotationStreakWeight(2) - rotationStreakWeight(1),
    )
  })
})

describe('buildRotationPreferenceMap', () => {
  const employeeA = 'Alice'
  const employeeB = 'Bob'
  const dateKey = '2026-06-10'

  it('returns solo last completer + streak, skipping split / no-history tasks', () => {
    const taskState = {
      '2026-06-09': {
        '21': {
          'mop-close': done([employeeA]),
          trash: done([employeeA, employeeB]),
          anchor: done([employeeA, employeeB]),
        },
      },
      '2026-06-08': {
        '21': {
          'mop-close': done([employeeA]),
          trash: done([employeeA, employeeB]),
          anchor: done([employeeA, employeeB]),
        },
      },
    } as unknown as TaskState
    const rot = buildRotationPreferenceMap({
      taskState,
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds: ['mop-close', 'trash', 'never-done'],
    })
    expect(rot['mop-close']).toEqual({ lastCompleter: employeeA, streak: 2 })
    expect(rot['trash']).toBeUndefined()
    expect(rot['never-done']).toBeUndefined()
  })

  it('returns empty map when the pair never shared a shift', () => {
    const taskState = {
      '2026-06-08': { '21': { 'mop-close': done([employeeA]) } },
    } as unknown as TaskState
    const rot = buildRotationPreferenceMap({
      taskState,
      dateKey,
      windowKey: '21',
      employeeA,
      employeeB,
      candidateTaskIds: ['mop-close'],
    })
    expect(Object.keys(rot)).toHaveLength(0)
  })
})

describe('computeAntiRotationCost', () => {
  const rot = {
    'mop-close': { lastCompleter: 'Alice', streak: 3 },
    sweep: { lastCompleter: 'Bob', streak: 1 },
  }

  it('penalizes keeping a streaked task with the last completer, scaled by streak', () => {
    const cost = computeAntiRotationCost({ 'mop-close': 'Alice', sweep: 'Bob' }, [], rot)
    expect(cost).toBe(rotationStreakWeight(3) + rotationStreakWeight(1))
  })

  it('is higher for longer streaks', () => {
    const longStreak = computeAntiRotationCost({ 'mop-close': 'Alice' }, [], rot)
    const shortStreak = computeAntiRotationCost({ sweep: 'Bob' }, [], rot)
    expect(longStreak).toBeGreaterThan(shortStreak)
  })

  it('is zero when the streaked task is rotated to the other person', () => {
    const cost = computeAntiRotationCost({ 'mop-close': 'Bob', sweep: 'Alice' }, [], rot)
    expect(cost).toBe(0)
  })

  it('is zero when the streaked task is now shared (split across both)', () => {
    const cost = computeAntiRotationCost({ 'mop-close': 'Alice', sweep: 'Bob' }, ['mop-close', 'sweep'], rot)
    expect(cost).toBe(0)
  })
})
