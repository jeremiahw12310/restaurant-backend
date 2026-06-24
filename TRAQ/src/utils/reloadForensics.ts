import { logAppReload, type AppReloadLogInput } from '../services/firestore'

const INTENTIONAL_RELOAD_KEY = 'traq:intentional-reload'
const LAST_ACTION_KEY = 'traq:last-user-action'
const LOCAL_RELOAD_LOG_KEY = 'traq-reload-log'
const LOCAL_RELOAD_LOG_MAX = 20

export type LastUserAction = {
  action: string
  tsMs: number
}

export function recordLastUserAction(action: string): void {
  try {
    sessionStorage.setItem(LAST_ACTION_KEY, JSON.stringify({ action, tsMs: Date.now() } satisfies LastUserAction))
  } catch {
    // ignore
  }
}

export function markIntentionalReload(reason: string): void {
  try {
    sessionStorage.setItem(INTENTIONAL_RELOAD_KEY, reason)
  } catch {
    // ignore
  }
}

function readLastAction(): LastUserAction | null {
  try {
    const raw = sessionStorage.getItem(LAST_ACTION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastUserAction>
    if (typeof parsed.action === 'string' && typeof parsed.tsMs === 'number') {
      return { action: parsed.action, tsMs: parsed.tsMs }
    }
  } catch {
    // ignore
  }
  return null
}

function isReloadNavigation(): boolean {
  try {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    return entries[0]?.type === 'reload'
  } catch {
    return false
  }
}

function appendLocalReloadLog(record: AppReloadLogInput): void {
  try {
    const raw = localStorage.getItem(LOCAL_RELOAD_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed) ? parsed : []
    list.unshift(record)
    list.length = Math.min(list.length, LOCAL_RELOAD_LOG_MAX)
    localStorage.setItem(LOCAL_RELOAD_LOG_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

export function logReloadOnBoot(): void {
  if (!isReloadNavigation()) return

  let intentionalReason: string | null = null
  try {
    intentionalReason = sessionStorage.getItem(INTENTIONAL_RELOAD_KEY)
    sessionStorage.removeItem(INTENTIONAL_RELOAD_KEY)
  } catch {
    // ignore
  }

  const lastAction = readLastAction()
  const nowMs = Date.now()
  const record: AppReloadLogInput = {
    kind: intentionalReason ?? 'unexpected',
    ts: new Date(nowMs).toISOString(),
    tsMs: nowMs,
    lastAction: lastAction?.action,
    lastActionSecAgo:
      lastAction && Number.isFinite(lastAction.tsMs)
        ? Math.max(0, Math.round((nowMs - lastAction.tsMs) / 1000))
        : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  }

  appendLocalReloadLog(record)
  void logAppReload(record)
}
