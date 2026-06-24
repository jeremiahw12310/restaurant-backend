import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT,
  resolveDailyTaskScheduleSystemPrompt,
} from './dailyTaskScheduleSystemPrompt'

describe('resolveDailyTaskScheduleSystemPrompt', () => {
  it('returns the default when override is empty or whitespace', () => {
    expect(resolveDailyTaskScheduleSystemPrompt('')).toBe(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT)
    expect(resolveDailyTaskScheduleSystemPrompt('   ')).toBe(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT)
    expect(resolveDailyTaskScheduleSystemPrompt(null)).toBe(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT)
    expect(resolveDailyTaskScheduleSystemPrompt(undefined)).toBe(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT)
  })

  it('returns trimmed custom override when provided', () => {
    expect(resolveDailyTaskScheduleSystemPrompt(' custom prompt ')).toBe('custom prompt')
  })

  it('default prompt matches the expected scheduling assistant prefix', () => {
    expect(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT.startsWith('You are a scheduling assistant')).toBe(true)
    expect(DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT).toContain('weekly-quota tasks')
  })
})
