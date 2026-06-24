import { describe, expect, it } from 'vitest'
import { buildSplitRulesInfo, findBestFairSplit } from './taskSplitPartition'
import type { TaskLike } from './taskScoring'

const windowMs = {
  windowStartMsForDateKey: () => 0,
  windowCloseMsForDateKey: () => 86400000,
}

describe('requiresSplit in always-shared split rules', () => {
  const customShared: TaskLike = {
    id: 'custom-closeout',
    weight: 4,
    windows: ['21'],
    requiresSplit: true,
  }

  it('includes admin requiresSplit tasks in buildSplitRulesInfo', () => {
    const rules = buildSplitRulesInfo({
      candidateTaskIds: ['custom-closeout', 'take-out-trash'],
      allTasks: [
        customShared,
        { id: 'take-out-trash', weight: 1, windows: ['21'] },
      ],
      windowKey: '21',
    })
    expect(rules.alwaysSharedTaskIds).toContain('custom-closeout')
    expect(rules.alwaysSharedTaskIds).toContain('take-out-trash')
    expect(rules.rulesText).toContain('custom-closeout')
  })

  it('findBestFairSplit puts requiresSplit task in sharedTaskIds', () => {
    const allTasks: TaskLike[] = [
      customShared,
      { id: 'mop-close', weight: 5, windows: ['21'] },
      { id: 'sweep-close', weight: 3, windows: ['21'] },
    ]
    const result = findBestFairSplit({
      dateKey: '2026-06-10',
      windowKey: '21',
      employeeA: 'Alice',
      employeeB: 'Bob',
      candidateTaskIds: allTasks.map((t) => t.id),
      allTasks,
      taskOverrides: null,
      windowMs,
    })
    expect(result.sharedTaskIds).toContain('custom-closeout')
  })

  it('requiresSplit wins over mop coupling for sharedTaskIds', () => {
    const mopRequiresSplit: TaskLike = {
      id: 'mop-close',
      weight: 5,
      windows: ['21'],
      requiresSplit: true,
    }
    const result = findBestFairSplit({
      dateKey: '2026-06-10',
      windowKey: '21',
      employeeA: 'Alice',
      employeeB: 'Bob',
      candidateTaskIds: ['mop-close', 'sweep-close'],
      allTasks: [
        mopRequiresSplit,
        { id: 'sweep-close', weight: 3, windows: ['21'] },
      ],
      taskOverrides: null,
      windowMs,
    })
    expect(result.sharedTaskIds).toContain('mop-close')
  })

  it('assigns sweep mats to the same person as mop', () => {
    const result = findBestFairSplit({
      dateKey: '2026-06-10',
      windowKey: '21',
      employeeA: 'Alice',
      employeeB: 'Bob',
      candidateTaskIds: ['mop-close', 'sweep-close', 'sweep-mats-close'],
      allTasks: [
        { id: 'mop-close', weight: 5, windows: ['21'] },
        { id: 'sweep-close', weight: 3, windows: ['21'] },
        { id: 'sweep-mats-close', weight: 2, windows: ['21'], name: 'Sweep Mats' } as TaskLike & {
          name: string
        },
      ],
      taskOverrides: null,
      windowMs,
    })
    const mopper = result.assignment['mop-close']
    expect(mopper).toBeTruthy()
    expect(result.assignment['sweep-mats-close']).toBe(mopper)
    expect(result.assignment['sweep-close']).not.toBe(mopper)
  })
})
