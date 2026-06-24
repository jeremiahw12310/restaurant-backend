import { describe, it, expect } from 'vitest'
import type { DailyTaskDef, DailyTaskWeek } from '../services/firestore'
import { createAutoDayEntry, preserveApprovedAutoDay } from './dailyTaskApproval'
import { generateDailyTaskWeek } from './dailyTaskWeekGenerator'

const hasUndefinedField = (value: unknown): boolean => {
  if (value === undefined) return true
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(hasUndefinedField)
  return Object.values(value as Record<string, unknown>).some(hasUndefinedField)
}

const sampleTasks: DailyTaskDef[] = [
  {
    id: 't1',
    name: 'Task One',
    frequency: { type: 'normal' },
    materials: { imagePath: '', description: '' },
    whatToDo: { imagePath: '', description: '' },
    createdAtMs: 1,
    updatedAtMs: 1,
  },
  {
    id: 't2',
    name: 'Task Two',
    frequency: { type: 'normal' },
    materials: { imagePath: '', description: '' },
    whatToDo: { imagePath: '', description: '' },
    createdAtMs: 1,
    updatedAtMs: 1,
  },
]

describe('preserveApprovedAutoDay', () => {
  it('preserves approved status without writing undefined approvalAtMs for legacy entries', () => {
    const previous = { taskId: 't1', source: 'auto' as const, approvalStatus: 'approved' as const }
    const generated = createAutoDayEntry('t1')

    const result = preserveApprovedAutoDay(previous, generated)

    expect(result.approvalStatus).toBe('approved')
    expect(result.taskId).toBe('t1')
    expect(result).not.toHaveProperty('approvalAtMs', undefined)
    expect('approvalAtMs' in result).toBe(false)
  })

  it('copies approvalAtMs and approvalBy when present on previous entry', () => {
    const previous = {
      taskId: 't1',
      source: 'auto' as const,
      approvalStatus: 'approved' as const,
      approvalAtMs: 1_700_000_000_000,
      approvalBy: 'admin',
    }
    const generated = createAutoDayEntry('t1')

    const result = preserveApprovedAutoDay(previous, generated)

    expect(result.approvalStatus).toBe('approved')
    expect(result.approvalAtMs).toBe(1_700_000_000_000)
    expect(result.approvalBy).toBe('admin')
  })

  it('does not preserve approval when task id changes', () => {
    const previous = { taskId: 't1', source: 'auto' as const, approvalStatus: 'approved' as const }
    const generated = createAutoDayEntry('t2')

    const result = preserveApprovedAutoDay(previous, generated)

    expect(result.approvalStatus).toBe('pending')
  })

  it('generateDailyTaskWeek output is Firestore-safe for legacy approved Sunday 2026-06-07', () => {
    const existingWeek: DailyTaskWeek = {
      weekStartDateKey: '2026-06-07',
      generatedAtMs: 1,
      generatorVersion: 'v1',
      days: {
        '2026-06-07': { taskId: 't1', source: 'auto', approvalStatus: 'approved' },
        '2026-06-08': { taskId: 't2', source: 'auto', approvalStatus: 'approved' },
      },
    }

    const { week } = generateDailyTaskWeek({
      weekStartDateKey: '2026-06-07',
      tasks: sampleTasks,
      recentRuns: [],
      existingWeek,
      todayDateKey: '2026-06-10',
    })

    expect(week).not.toBeNull()
    expect(hasUndefinedField(week)).toBe(false)
    expect(week!.days['2026-06-07']?.approvalStatus).toBe('approved')
    expect('approvalAtMs' in (week!.days['2026-06-07'] || {})).toBe(false)
  })
})
