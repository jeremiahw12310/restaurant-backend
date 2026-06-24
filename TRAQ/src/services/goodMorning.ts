import { db, waitForFirebase } from '../firebase'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore'

const LS_KEY = 'traq-good-morning-dismiss-v1'
const LS_SESSION_KEY = 'traq-good-morning-session-id-v1'

const isFirestoreSDKAvailable = (): boolean => db !== null

const assertFirestoreReady = async () => {
  await waitForFirebase()
  if (!isFirestoreSDKAvailable()) {
    throw new Error('Firestore SDK not available')
  }
}

export type GoodMorningLocalState = {
  dismissedDateKey: string
  lastCompletedEpoch: number
}

export function readGoodMorningLocal(): GoodMorningLocalState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return null
    const dismissedDateKey = (j as { dismissedDateKey?: unknown }).dismissedDateKey
    const lastCompletedEpoch = (j as { lastCompletedEpoch?: unknown }).lastCompletedEpoch
    if (typeof dismissedDateKey !== 'string' || typeof lastCompletedEpoch !== 'number') return null
    return { dismissedDateKey, lastCompletedEpoch }
  } catch {
    return null
  }
}

export function writeGoodMorningLocal(state: GoodMorningLocalState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function getOrCreateGoodMorningSessionId(): string {
  try {
    const existing = localStorage.getItem(LS_SESSION_KEY)
    if (existing) return existing
    const newId = `gm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(LS_SESSION_KEY, newId)
    return newId
  } catch {
    return `gm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export const getDeviceInfo = (): string => {
  try {
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
    if (/Android/.test(ua)) return 'Android'
    if (/Mac/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    if (/Linux/.test(ua)) return 'Linux'
    return 'Unknown'
  } catch {
    return 'Unknown'
  }
}

export type GoodMorningConfig = {
  forceEpoch: number
  updatedAt?: unknown
}

const DEFAULT_CONFIG: GoodMorningConfig = { forceEpoch: 0 }

export const subscribeToGoodMorningConfig = (
  callback: (settings: GoodMorningConfig) => void
): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    callback(DEFAULT_CONFIG)
    return () => {}
  }

  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback(DEFAULT_CONFIG)
      return
    }
    try {
      await assertFirestoreReady()
    } catch {
      callback(DEFAULT_CONFIG)
      return
    }
    if (cancelled) return
    const ref = doc(db, 'config', 'goodMorning')
    unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data()
        const forceEpoch = typeof d?.forceEpoch === 'number' && Number.isFinite(d.forceEpoch) ? d.forceEpoch : 0
        callback({ forceEpoch, updatedAt: d?.updatedAt })
      },
      () => {
        callback(DEFAULT_CONFIG)
      }
    )
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export async function incrementGoodMorningForceEpoch(): Promise<void> {
  await assertFirestoreReady()
  if (!isFirestoreSDKAvailable()) throw new Error('Firestore not available')
  const ref = doc(db, 'config', 'goodMorning')
  const snap = await getDoc(ref)
  const cur =
    snap.exists() && typeof snap.data()?.forceEpoch === 'number' ? (snap.data()!.forceEpoch as number) : 0
  await setDoc(
    ref,
    {
      forceEpoch: cur + 1,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

export type GoodMorningLogEntry = {
  id: string
  ts: string
  tsMs: number
  dateKey: string
  sessionId: string
  deviceInfo?: string
}

export async function appendGoodMorningLog(
  entry: Pick<GoodMorningLogEntry, 'dateKey' | 'sessionId'> & { deviceInfo?: string }
): Promise<void> {
  const now = new Date()
  const full: Omit<GoodMorningLogEntry, 'id'> = {
    ts: now.toISOString(),
    tsMs: now.getTime(),
    dateKey: entry.dateKey,
    sessionId: entry.sessionId,
    deviceInfo: entry.deviceInfo,
  }
  try {
    await assertFirestoreReady()
    const colRef = collection(db, 'goodMorningLogs')
    const id = `gm-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
    await setDoc(doc(colRef, id), full)
  } catch (error) {
    console.warn('Good morning log write failed:', error)
  }
}

export const subscribeToGoodMorningLogs = (
  callback: (logs: GoodMorningLogEntry[]) => void,
  max: number = 100
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback([])
      return
    }

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'goodMorningLogs')
      const q = query(colRef, orderBy('tsMs', 'desc'), limit(Math.max(1, max)))
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const logs: GoodMorningLogEntry[] = snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              ts: typeof data.ts === 'string' ? data.ts : '',
              tsMs: typeof data.tsMs === 'number' ? data.tsMs : 0,
              dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
              sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
              deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : undefined,
            }
          })
          logs.sort((a, b) => b.tsMs - a.tsMs)
          callback(logs)
        },
        (err) => {
          console.error('Good morning logs subscription error:', err)
          callback([])
        }
      )
    } catch (error) {
      console.error('Error subscribing to good morning logs:', error)
      callback([])
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export type GoodMorningSession = {
  sessionId: string
  lastSeenAtMs: number
  dateKey: string
  deviceInfo: string
  phase: 'good_morning'
  updatedAt: string
}

export async function upsertGoodMorningSession(
  sessionId: string,
  data: { lastSeenAtMs: number; dateKey: string; deviceInfo: string }
): Promise<void> {
  try {
    await assertFirestoreReady()
    const ref = doc(db, 'goodMorningSessions', sessionId)
    const now = new Date().toISOString()
    await setDoc(
      ref,
      {
        sessionId,
        lastSeenAtMs: data.lastSeenAtMs,
        dateKey: data.dateKey,
        deviceInfo: data.deviceInfo,
        phase: 'good_morning' as const,
        updatedAt: now,
      },
      { merge: true }
    )
  } catch (error) {
    console.warn('Good morning session write failed:', error)
  }
}

export async function clearGoodMorningSession(sessionId: string): Promise<void> {
  try {
    await assertFirestoreReady()
    await deleteDoc(doc(db, 'goodMorningSessions', sessionId))
  } catch (error) {
    console.warn('Good morning session delete failed:', error)
  }
}

export const subscribeToGoodMorningSessions = (
  callback: (sessions: GoodMorningSession[]) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback([])
      return
    }

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'goodMorningSessions')
      unsubscribe = onSnapshot(
        colRef,
        (snap) => {
          const sessions: GoodMorningSession[] = snap.docs.map((d) => {
            const data = d.data()
            return {
              sessionId: typeof data.sessionId === 'string' ? data.sessionId : d.id,
              lastSeenAtMs: typeof data.lastSeenAtMs === 'number' ? data.lastSeenAtMs : 0,
              dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
              deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : 'Unknown',
              phase: data.phase === 'good_morning' ? 'good_morning' : 'good_morning',
              updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
            }
          })
          callback(sessions)
        },
        (err) => {
          console.error('Good morning sessions subscription error:', err)
          callback([])
        }
      )
    } catch (error) {
      console.error('Error subscribing to good morning sessions:', error)
      callback([])
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export function isPastTenAmLocal(now: Date = new Date()): boolean {
  const ten = new Date(now)
  ten.setHours(10, 0, 0, 0)
  return now.getTime() >= ten.getTime()
}
