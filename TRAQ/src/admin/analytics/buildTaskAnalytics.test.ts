import { describe, it, expect } from 'vitest'
import { buildTaskAnalytics, createAnalyticsWindowMs } from './buildTaskAnalytics'
import type { TaskCatalog, TaskState } from '../../services/firestore'

describe('buildTaskAnalytics', () => {
  const windowMs = createAnalyticsWindowMs()

  const catalog: TaskCatalog = {
    tasks: [
      {
        id: 'mop',
        name: 'Mop',
        icon: '🧹',
        requirements: [],
        windows: ['11', '17', '21'],
        createdAtMs: 0,
      },
      {
        id: 'sweep',
        name: 'Sweep',
        icon: '🧹',
        requirements: [],
        windows: ['11'],
        createdAtMs: 0,
      },
    ],
  }

  it('counts split completions, per-employee credits, and skip rates from availability', () => {
    const taskState: TaskState = {
      '2026-05-01': {
        '11': {
          mop: {
            status: 'done',
            assignees: ['Alice', 'Bob'],
            completedAt: '2026-05-01T12:00:00.000Z',
          },
        },
        '17': {},
        '21': {},
      },
    }

    const result = buildTaskAnalytics({
      taskState,
      taskCatalog: catalog,
      taskOverrides: null,
      employees: ['Alice', 'Bob', 'Carl'],
      windowMs,
      dateRange: { from: '2026-05-01', to: '2026-05-01' },
    })

    expect(result.totalCompletions).toBe(1)
    expect(result.totalSplitCompletions).toBe(1)
    expect(result.splitTaskRate).toBe(100)
    expect(result.byEmployee.Alice).toBe(1)
    expect(result.byEmployee.Bob).toBe(1)
    expect(result.byWindow['11']).toBe(1)

    const sweepSkip = result.skipRates.find((s) => s.taskName === 'Sweep')
    expect(sweepSkip?.available).toBe(1)
    expect(sweepSkip?.completed).toBe(0)
    expect(sweepSkip?.skipRate).toBe(100)

    expect(result.employeeNeverDoes.Carl?.length).toBeGreaterThan(0)
    expect(result.employeeNeverDoes.Carl?.some((t) => t.includes('Sweep'))).toBe(true)
  })
})
