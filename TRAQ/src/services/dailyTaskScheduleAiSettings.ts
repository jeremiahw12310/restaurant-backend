import { db, waitForFirebase } from '../firebase'
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import {
  DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT,
  DAILY_TASK_SCHEDULE_SYSTEM_PROMPT_MAX_LENGTH,
  resolveDailyTaskScheduleSystemPrompt,
} from '../constants/dailyTaskScheduleSystemPrompt'

const CONFIG_COLLECTION = 'config'
const DOC_ID = 'dailyTaskScheduleAi'

export type DailyTaskScheduleAiSettings = {
  systemPrompt?: string
  updatedAt?: unknown
  updatedBy?: string
}

let cachedTeamSystemPromptOverride: string | undefined

export function syncDailyTaskScheduleAiSettingsCache(settings: DailyTaskScheduleAiSettings): void {
  cachedTeamSystemPromptOverride = settings.systemPrompt
}

/** Team-wide saved prompt from Firestore (used when no explicit draft override is passed). */
export function getCachedDailyTaskScheduleSystemPrompt(): string {
  return resolveDailyTaskScheduleSystemPrompt(cachedTeamSystemPromptOverride)
}

export { DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT, resolveDailyTaskScheduleSystemPrompt }

const isFirestoreSDKAvailable = (): boolean => db !== null

const assertFirestoreReady = async () => {
  await waitForFirebase()
  if (!isFirestoreSDKAvailable()) {
    throw new Error('Firestore SDK not available')
  }
}

function parseSettings(data: Record<string, unknown> | undefined): DailyTaskScheduleAiSettings {
  if (!data) return {}
  const systemPrompt =
    typeof data.systemPrompt === 'string' && data.systemPrompt.trim()
      ? data.systemPrompt.trim()
      : undefined
  return {
    ...(systemPrompt ? { systemPrompt } : {}),
    updatedAt: data.updatedAt,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
  }
}

export const subscribeToDailyTaskScheduleAiSettings = (
  callback: (settings: DailyTaskScheduleAiSettings) => void
): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    callback({})
    return () => {}
  }

  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback({})
      return
    }
    try {
      await assertFirestoreReady()
    } catch {
      callback({})
      return
    }
    if (cancelled) return

    const docRef = doc(db, CONFIG_COLLECTION, DOC_ID)
    unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        const settings = parseSettings(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined)
        syncDailyTaskScheduleAiSettingsCache(settings)
        callback(settings)
      },
      (err) => {
        console.error('Daily task schedule AI settings subscription error:', err)
        callback({})
      }
    )
  }

  void setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export const saveDailyTaskScheduleAiSettings = async (args: {
  systemPrompt: string
  updatedBy?: string
}): Promise<void> => {
  const trimmed = (args.systemPrompt || '').trim()
  if (trimmed.length > DAILY_TASK_SCHEDULE_SYSTEM_PROMPT_MAX_LENGTH) {
    throw new Error('daily-task-schedule-prompt-too-long')
  }
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, DOC_ID)
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  }
  if (trimmed.length === 0 || trimmed === DEFAULT_DAILY_TASK_SCHEDULE_SYSTEM_PROMPT) {
    patch.systemPrompt = deleteField()
  } else {
    patch.systemPrompt = trimmed
  }
  if (args.updatedBy) patch.updatedBy = args.updatedBy
  await setDoc(docRef, patch, { merge: true })
}

export const clearDailyTaskScheduleAiSystemPrompt = async (options?: {
  updatedBy?: string
}): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, DOC_ID)
  await setDoc(
    docRef,
    {
      systemPrompt: deleteField(),
      updatedAt: serverTimestamp(),
      ...(options?.updatedBy ? { updatedBy: options.updatedBy } : {}),
    },
    { merge: true }
  )
}
