import { resolveDailyTaskScheduleSystemPrompt } from './dailyTaskSchedulePrompt'
import { chatCompletion } from './openaiClient'

export async function generateDailyTaskSchedule(
  apiKey: string,
  payload: unknown,
  systemPrompt?: string
): Promise<string> {
  const system = resolveDailyTaskScheduleSystemPrompt(systemPrompt)
  const user = JSON.stringify(
    {
      instruction:
        'Respond with JSON only: {"weeks":[{"weekStartDateKey":"...","placements":{"dateKey":"weeklyTaskId"}}]}',
      input: payload,
    },
    null,
    2
  )
  return chatCompletion(apiKey, system, user, { temperature: 0.25, maxTokens: 2048 })
}
