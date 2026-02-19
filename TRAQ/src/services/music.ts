import { db, waitForFirebase } from '../firebase'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore'
import { enqueueMusicSessionCommandREST, listMusicSessionsREST, upsertMusicSessionREST } from './firestore-rest'

// Session ID management
const LS_SESSION_ID_KEY = 'traq-music-session-id-v1'

export type MusicSessionCommand = {
  action: 'play' | 'pause' | 'next' | 'prev' | 'seek'
  trackId?: string
  issuedAt: string
  payload?: {
    positionSec?: number
  }
}

export type MusicSession = {
  sessionId: string
  deviceInfo: string
  isPlaying: boolean
  isActuallyPlaying?: boolean
  // "Flowing" means currentTime is advancing recently (stronger than isActuallyPlaying).
  isAudioFlowing?: boolean
  isBuffering?: boolean
  bufferProgress?: number
  // Stall recovery feedback (so admin can tell the player is actively self-healing).
  isRecovering?: boolean
  recoveryAttempt?: number
  recoverySinceAt?: string
  // Diagnostics: last notable playback issue observed by the client (best-effort).
  // This is intentionally loose (stringly-typed) so we can iterate without schema churn.
  lastPlaybackIssueAt?: string
  lastPlaybackIssueKind?: string
  lastPlaybackIssueDetail?: string
  currentTrackId?: string | null
  currentTrackTitle?: string | null
  positionSec?: number
  durationSec?: number
  lastSeenAt?: string
  // Derived client-side field (not stored): indicates the session hasn't heartbeated recently.
  isStale?: boolean
  updatedAt: string
  command?: MusicSessionCommand
  // Feedback about last command execution
  lastCommandResult?: 'success' | 'failed' | 'needs_gesture'
  lastCommandAction?: MusicSessionCommand['action']
}

export const getOrCreateSessionId = (): string => {
  try {
    const existing = localStorage.getItem(LS_SESSION_ID_KEY)
    if (existing) return existing
    const newId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(LS_SESSION_ID_KEY, newId)
    return newId
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

export const updateMusicSession = async (sessionId: string, data: Partial<Omit<MusicSession, 'sessionId'>>): Promise<void> => {
  try {
    await assertFirestoreReady()
    const ref = doc(db, 'musicSessions', sessionId)
    await setDoc(ref, { ...data, sessionId, updatedAt: new Date().toISOString() }, { merge: true })
  } catch (err) {
    // Fallback to REST (SDK can fail on some browsers due to IndexedDB/storage restrictions).
    try {
      await upsertMusicSessionREST(sessionId, { ...data, updatedAt: new Date().toISOString() })
    } catch {
      // ignore
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[updateMusicSession] SDK write failed; attempted REST fallback:', err)
    }
  }
}

const coerceSessionFromRest = (raw: Record<string, unknown>): MusicSession | null => {
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : ''
  if (!sessionId) return null
  const session: MusicSession = {
    sessionId,
    deviceInfo: typeof raw.deviceInfo === 'string' ? (raw.deviceInfo as string) : 'Unknown',
    isPlaying: typeof raw.isPlaying === 'boolean' ? (raw.isPlaying as boolean) : false,
    isActuallyPlaying: typeof raw.isActuallyPlaying === 'boolean' ? (raw.isActuallyPlaying as boolean) : false,
    isAudioFlowing: typeof raw.isAudioFlowing === 'boolean' ? (raw.isAudioFlowing as boolean) : false,
    isBuffering: typeof raw.isBuffering === 'boolean' ? (raw.isBuffering as boolean) : false,
    bufferProgress: typeof raw.bufferProgress === 'number' ? (raw.bufferProgress as number) : 0,
    isRecovering: typeof raw.isRecovering === 'boolean' ? (raw.isRecovering as boolean) : false,
    recoveryAttempt: typeof raw.recoveryAttempt === 'number' ? (raw.recoveryAttempt as number) : 0,
    recoverySinceAt: typeof raw.recoverySinceAt === 'string' ? (raw.recoverySinceAt as string) : undefined,
    lastPlaybackIssueAt: typeof raw.lastPlaybackIssueAt === 'string' ? (raw.lastPlaybackIssueAt as string) : undefined,
    lastPlaybackIssueKind: typeof raw.lastPlaybackIssueKind === 'string' ? (raw.lastPlaybackIssueKind as string) : undefined,
    lastPlaybackIssueDetail: typeof raw.lastPlaybackIssueDetail === 'string' ? (raw.lastPlaybackIssueDetail as string) : undefined,
    currentTrackId: typeof raw.currentTrackId === 'string' ? (raw.currentTrackId as string) : undefined,
    currentTrackTitle: typeof raw.currentTrackTitle === 'string' ? (raw.currentTrackTitle as string) : undefined,
    positionSec: typeof raw.positionSec === 'number' ? (raw.positionSec as number) : 0,
    durationSec: typeof raw.durationSec === 'number' ? (raw.durationSec as number) : 0,
    lastSeenAt: typeof raw.lastSeenAt === 'string' ? (raw.lastSeenAt as string) : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? (raw.updatedAt as string) : new Date().toISOString(),
    lastCommandResult: typeof raw.lastCommandResult === 'string' ? (raw.lastCommandResult as any) : undefined,
    lastCommandAction: typeof raw.lastCommandAction === 'string' ? (raw.lastCommandAction as any) : undefined,
  }
  return session
}

export const fetchLatestMusicSessionsREST = async (max: number): Promise<MusicSession[]> => {
  const now = Date.now()
  const toMs = (v?: string): number => {
    if (!v) return NaN
    const ms = new Date(v).getTime()
    return Number.isFinite(ms) ? ms : NaN
  }
  const raw = await listMusicSessionsREST(max)
  const sessions = raw
    .map((r) => coerceSessionFromRest(r))
    .filter((x): x is MusicSession => !!x)
    .map((s) => {
      const seenMs = Number.isFinite(toMs(s.lastSeenAt)) ? toMs(s.lastSeenAt) : toMs(s.updatedAt)
      s.isStale = !Number.isFinite(seenMs) ? true : now - (seenMs as number) >= STALE_SESSION_THRESHOLD_MS
      return s
    })
  sessions.sort((a, b) => {
    const aStale = !!a.isStale
    const bStale = !!b.isStale
    if (aStale !== bStale) return aStale ? 1 : -1
    const aMs = toMs(a.lastSeenAt) || toMs(a.updatedAt) || 0
    const bMs = toMs(b.lastSeenAt) || toMs(b.updatedAt) || 0
    return bMs - aMs
  })
  if (sessions.length > Math.max(1, max)) sessions.length = Math.max(1, max)
  return sessions
}

export const sendSessionCommandQueuedREST = async (
  sessionId: string,
  action: MusicSessionCommand['action'],
  payload?: MusicSessionCommand['payload']
): Promise<{ success: boolean; error?: string }> => {
  const res = await enqueueMusicSessionCommandREST(sessionId, action, payload)
  return res.success ? { success: true } : { success: false, error: res.error || 'enqueue-failed' }
}

export const sendSessionCommand = async (
  sessionId: string,
  action: MusicSessionCommand['action'],
  payload?: MusicSessionCommand['payload']
): Promise<{ success: boolean; error?: string }> => {
  // Validate inputs
  if (!sessionId || typeof sessionId !== 'string') {
    console.error('[sendSessionCommand] Invalid sessionId:', sessionId)
    return { success: false, error: 'Invalid session ID' }
  }
  if (!action) {
    console.error('[sendSessionCommand] Invalid action:', action)
    return { success: false, error: 'Invalid action' }
  }

  try {
    await assertFirestoreReady()
    const ref = doc(db, 'musicSessions', sessionId)
    // Firestore does not allow `undefined` field values, so only include payload when present.
    const base: Pick<MusicSessionCommand, 'action' | 'issuedAt'> = {
      action,
      issuedAt: new Date().toISOString(),
    }
    const command: MusicSessionCommand =
      payload === undefined ? (base as MusicSessionCommand) : ({ ...base, payload } as MusicSessionCommand)
    console.log('[sendSessionCommand] Sending:', { sessionId, action, payload })
    // Use setDoc with merge so this works even if the session doc was deleted/recreated.
    // Include sessionId so rule-sets that validate required fields on create won't reject.
    await setDoc(ref, { sessionId, command, updatedAt: new Date().toISOString() }, { merge: true })
    console.log('[sendSessionCommand] Success')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sendSessionCommand] Failed:', message, err)
    return { success: false, error: message }
  }
}

export const clearSessionCommand = async (sessionId: string): Promise<void> => {
  try {
    await assertFirestoreReady()
    const ref = doc(db, 'musicSessions', sessionId)
    // Use setDoc(merge) so we don't fail if the doc is missing.
    await setDoc(ref, { command: deleteField(), updatedAt: new Date().toISOString() }, { merge: true })
  } catch {
    // ignore
  }
}

export const subscribeToSessionCommands = (
  sessionId: string,
  callback: (command: MusicSession['command'] | undefined) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const ref = doc(db, 'musicSessions', sessionId)
      unsubscribe = onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
          callback(undefined)
          return
        }
        const data = snap.data() as Partial<MusicSession>
        callback(data.command)
      })
    } catch {
      // ignore
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// Sessions not seen recently are considered stale.
// NOTE: browsers can throttle timers heavily in background/lock-screen (especially iOS),
// so "stale" should be a soft warning, not a hard filter.
const STALE_SESSION_THRESHOLD_MS = 30 * 60_000

export const subscribeToAllMusicSessions = (
  callback: (sessions: MusicSession[]) => void
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
      const ref = collection(db, 'musicSessions')
      unsubscribe = onSnapshot(ref, (snap) => {
        const now = Date.now()
        const sessions: MusicSession[] = []
        snap.forEach((d) => {
          const data = d.data() as Partial<MusicSession>
          const session: MusicSession = {
            sessionId: d.id,
            deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : 'Unknown',
            isPlaying: typeof data.isPlaying === 'boolean' ? data.isPlaying : false,
            isActuallyPlaying: typeof data.isActuallyPlaying === 'boolean' ? data.isActuallyPlaying : false,
            isAudioFlowing: typeof data.isAudioFlowing === 'boolean' ? data.isAudioFlowing : false,
            isBuffering: typeof data.isBuffering === 'boolean' ? data.isBuffering : false,
            bufferProgress: typeof data.bufferProgress === 'number' ? data.bufferProgress : 0,
            isRecovering: typeof data.isRecovering === 'boolean' ? data.isRecovering : false,
            recoveryAttempt: typeof data.recoveryAttempt === 'number' ? data.recoveryAttempt : 0,
            recoverySinceAt: typeof data.recoverySinceAt === 'string' ? data.recoverySinceAt : undefined,
            lastPlaybackIssueAt: typeof data.lastPlaybackIssueAt === 'string' ? data.lastPlaybackIssueAt : undefined,
            lastPlaybackIssueKind: typeof data.lastPlaybackIssueKind === 'string' ? data.lastPlaybackIssueKind : undefined,
            lastPlaybackIssueDetail: typeof data.lastPlaybackIssueDetail === 'string' ? data.lastPlaybackIssueDetail : undefined,
            currentTrackId: typeof data.currentTrackId === 'string' ? data.currentTrackId : undefined,
            currentTrackTitle: typeof data.currentTrackTitle === 'string' ? data.currentTrackTitle : undefined,
            positionSec: typeof data.positionSec === 'number' ? data.positionSec : 0,
            durationSec: typeof data.durationSec === 'number' ? data.durationSec : 0,
            lastSeenAt: typeof data.lastSeenAt === 'string' ? data.lastSeenAt : undefined,
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
            command: data.command,
            lastCommandResult: typeof data.lastCommandResult === 'string' ? data.lastCommandResult : undefined,
            lastCommandAction: typeof data.lastCommandAction === 'string' ? data.lastCommandAction : undefined,
          }
          // If we have never seen a heartbeat, don't show it.
          if (!session.lastSeenAt) return
          const lastSeen = new Date(session.lastSeenAt).getTime()
          session.isStale = Number.isFinite(lastSeen) ? now - lastSeen >= STALE_SESSION_THRESHOLD_MS : true
          sessions.push(session)
        })
        // Sort by:
        // 1) non-stale first
        // 2) most recently seen
        sessions.sort((a, b) => {
          const aStale = !!a.isStale
          const bStale = !!b.isStale
          if (aStale !== bStale) return aStale ? 1 : -1
          const aSeen = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
          const bSeen = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
          return bSeen - aSeen
        })
        callback(sessions)
      })
    } catch {
      callback([])
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Subscribe to the latest sessions by heartbeat (lastSeenAt), limited for admin UI.
 * This avoids loading every session doc and avoids UI-side "stabilization" logic that can get stuck.
 */
export const subscribeToLatestMusicSessions = (
  max: number,
  callback: (sessions: MusicSession[]) => void
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
      const ref = collection(db, 'musicSessions')
      // NOTE: We intentionally do NOT rely on Firestore ordering here.
      // `lastSeenAt` is stored as a string, and historical docs may have mixed formats/types
      // (or missing fields), which can cause Firestore lexicographic ordering to hide active sessions.
      // Instead, we subscribe to the collection and sort client-side using best-effort timestamps.
      unsubscribe = onSnapshot(ref, (snap) => {
        const now = Date.now()
        const sessions: MusicSession[] = []

        const toMs = (v: unknown): number => {
          if (typeof v !== 'string' || !v) return NaN
          const ms = new Date(v).getTime()
          return Number.isFinite(ms) ? ms : NaN
        }

        snap.forEach((d) => {
          const data = d.data() as Partial<MusicSession>
          const session: MusicSession = {
            sessionId: d.id,
            deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : 'Unknown',
            isPlaying: typeof data.isPlaying === 'boolean' ? data.isPlaying : false,
            isActuallyPlaying: typeof data.isActuallyPlaying === 'boolean' ? data.isActuallyPlaying : false,
            isAudioFlowing: typeof data.isAudioFlowing === 'boolean' ? data.isAudioFlowing : false,
            isBuffering: typeof data.isBuffering === 'boolean' ? data.isBuffering : false,
            bufferProgress: typeof data.bufferProgress === 'number' ? data.bufferProgress : 0,
            isRecovering: typeof data.isRecovering === 'boolean' ? data.isRecovering : false,
            recoveryAttempt: typeof data.recoveryAttempt === 'number' ? data.recoveryAttempt : 0,
            recoverySinceAt: typeof data.recoverySinceAt === 'string' ? data.recoverySinceAt : undefined,
            lastPlaybackIssueAt: typeof data.lastPlaybackIssueAt === 'string' ? data.lastPlaybackIssueAt : undefined,
            lastPlaybackIssueKind: typeof data.lastPlaybackIssueKind === 'string' ? data.lastPlaybackIssueKind : undefined,
            lastPlaybackIssueDetail: typeof data.lastPlaybackIssueDetail === 'string' ? data.lastPlaybackIssueDetail : undefined,
            currentTrackId: typeof data.currentTrackId === 'string' ? data.currentTrackId : undefined,
            currentTrackTitle: typeof data.currentTrackTitle === 'string' ? data.currentTrackTitle : undefined,
            positionSec: typeof data.positionSec === 'number' ? data.positionSec : 0,
            durationSec: typeof data.durationSec === 'number' ? data.durationSec : 0,
            lastSeenAt: typeof data.lastSeenAt === 'string' ? data.lastSeenAt : undefined,
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
            command: data.command,
            lastCommandResult: typeof data.lastCommandResult === 'string' ? data.lastCommandResult : undefined,
            lastCommandAction: typeof data.lastCommandAction === 'string' ? data.lastCommandAction : undefined,
          }

          // Best-effort "seen" time: prefer heartbeat; fall back to updatedAt.
          const seenMs = (() => {
            const a = toMs(session.lastSeenAt)
            if (Number.isFinite(a)) return a
            const b = toMs(session.updatedAt)
            if (Number.isFinite(b)) return b
            return 0
          })()

          // Guard against wildly invalid/future clocks skewing "latest" selection.
          const clampedSeenMs = seenMs > now + 24 * 60 * 60_000 ? now : seenMs
          session.isStale = clampedSeenMs ? now - clampedSeenMs >= STALE_SESSION_THRESHOLD_MS : true

          sessions.push(session)
        })

        // Sort by:
        // 1) non-stale first
        // 2) most recently seen (heartbeat preferred; updatedAt fallback)
        sessions.sort((a, b) => {
          const aStale = !!a.isStale
          const bStale = !!b.isStale
          if (aStale !== bStale) return aStale ? 1 : -1
          const aMs = toMs(a.lastSeenAt) || toMs(a.updatedAt) || 0
          const bMs = toMs(b.lastSeenAt) || toMs(b.updatedAt) || 0
          return bMs - aMs
        })

        callback(sessions.slice(0, Math.max(1, max)))
      })
    } catch {
      callback([])
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export type MusicTrack = {
  id: string
  title: string
  storagePath: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
  originalFileName?: string
  contentType?: string
  bytes?: number
}

export type MusicPlaylist = {
  order: string[]
  updatedAt?: string
}

export type MusicControlAction = 'play' | 'pause' | 'next' | 'prev'

export type MusicControlLogEntry = {
  ts: string
  action: MusicControlAction
  trackId?: string
  trackTitle?: string
}

// Browser event name emitted when a music control log is appended locally.
// This allows UI to update immediately even if Firestore is unavailable/blocked.
export const MUSIC_CONTROL_LOG_EVENT = 'traq:music-control-log'

const LS_MUSIC_TRACKS_KEY = 'traq-music-tracks-v1'
const LS_MUSIC_PLAYLIST_KEY = 'traq-music-playlist-v1'
const LS_MUSIC_CONTROL_LOGS_KEY = 'traq-music-control-logs-v1'
const CONFIG_MUSIC_CONTROL_LOGS_DOC = 'musicControlLogs'

const isFirestoreSDKAvailable = (): boolean => {
  return db !== null
}

const assertFirestoreReady = async () => {
  await waitForFirebase()
  if (!isFirestoreSDKAvailable()) throw new Error('Firestore SDK not available')
}

const getFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore
  }
  return defaultValue
}

const saveToLocalStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export const getMusicPlaylist = async (): Promise<MusicPlaylist> => {
  const fallback = getFromLocalStorage<MusicPlaylist>(LS_MUSIC_PLAYLIST_KEY, { order: [] })
  try {
    await assertFirestoreReady()
    const snap = await getDoc(doc(db, 'config', 'musicPlaylist'))
    if (!snap.exists()) return fallback
    const data = snap.data() as Partial<MusicPlaylist>
    const playlist: MusicPlaylist = {
      order: Array.isArray(data.order) ? (data.order as string[]) : [],
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    }
    saveToLocalStorage(LS_MUSIC_PLAYLIST_KEY, playlist)
    return playlist
  } catch {
    return fallback
  }
}

export const saveMusicPlaylist = async (order: string[]): Promise<void> => {
  const playlist: MusicPlaylist = { order, updatedAt: new Date().toISOString() }
  saveToLocalStorage(LS_MUSIC_PLAYLIST_KEY, playlist)
  try {
    await assertFirestoreReady()
    await setDoc(doc(db, 'config', 'musicPlaylist'), playlist, { merge: true })
  } catch {
    // ignore
  }
}

export const subscribeToMusicPlaylist = (callback: (playlist: MusicPlaylist) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback(getFromLocalStorage<MusicPlaylist>(LS_MUSIC_PLAYLIST_KEY, { order: [] }))
      return
    }

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const ref = doc(db, 'config', 'musicPlaylist')
      unsubscribe = onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
          const next = { order: [] }
          saveToLocalStorage(LS_MUSIC_PLAYLIST_KEY, next)
          callback(next)
          return
        }
        const data = snap.data() as Partial<MusicPlaylist>
        const next: MusicPlaylist = {
          order: Array.isArray(data.order) ? (data.order as string[]) : [],
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        }
        saveToLocalStorage(LS_MUSIC_PLAYLIST_KEY, next)
        callback(next)
      })
    } catch {
      callback(getFromLocalStorage<MusicPlaylist>(LS_MUSIC_PLAYLIST_KEY, { order: [] }))
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export const subscribeToMusicTracks = (callback: (tracks: MusicTrack[]) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback(getFromLocalStorage<MusicTrack[]>(LS_MUSIC_TRACKS_KEY, []))
      return
    }

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const ref = collection(db, 'musicTracks')
      unsubscribe = onSnapshot(ref, (snap) => {
        const next: MusicTrack[] = []
        snap.forEach((d) => {
          const data = d.data() as Partial<MusicTrack>
          next.push({
            id: d.id,
            title: typeof data.title === 'string' ? data.title : 'Untitled',
            storagePath: typeof data.storagePath === 'string' ? data.storagePath : `music/${d.id}.mp3`,
            enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
            originalFileName: typeof data.originalFileName === 'string' ? data.originalFileName : undefined,
            contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
            bytes: typeof data.bytes === 'number' ? data.bytes : undefined,
          })
        })
        // Stable ordering (admin UI can still order via playlist doc)
        next.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        saveToLocalStorage(LS_MUSIC_TRACKS_KEY, next)
        callback(next)
      })
    } catch {
      callback(getFromLocalStorage<MusicTrack[]>(LS_MUSIC_TRACKS_KEY, []))
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export const upsertMusicTrack = async (track: MusicTrack): Promise<void> => {
  const next: MusicTrack = {
    ...track,
    createdAt: track.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // Best-effort local cache update
  const cached = getFromLocalStorage<MusicTrack[]>(LS_MUSIC_TRACKS_KEY, [])
  const idx = cached.findIndex((t) => t.id === track.id)
  const updated = [...cached]
  if (idx >= 0) updated[idx] = next
  else updated.push(next)
  saveToLocalStorage(LS_MUSIC_TRACKS_KEY, updated)

  await assertFirestoreReady()
  await setDoc(doc(db, 'musicTracks', track.id), next, { merge: true })
}

export const deleteMusicTrack = async (trackId: string): Promise<void> => {
  // Best-effort local cache update
  const cached = getFromLocalStorage<MusicTrack[]>(LS_MUSIC_TRACKS_KEY, [])
  saveToLocalStorage(
    LS_MUSIC_TRACKS_KEY,
    cached.filter((t) => t.id !== trackId)
  )

  await assertFirestoreReady()
  await deleteDoc(doc(db, 'musicTracks', trackId))
}

export const appendMusicControlLog = async (
  entry: Omit<MusicControlLogEntry, 'ts'> & { ts?: string }
): Promise<void> => {
  const next: MusicControlLogEntry = {
    ts: entry.ts || new Date().toISOString(),
    action: entry.action,
    trackId: entry.trackId,
    trackTitle: entry.trackTitle,
  }

  // local cache (cap to keep storage small)
  const cached = getFromLocalStorage<MusicControlLogEntry[]>(LS_MUSIC_CONTROL_LOGS_KEY, [])
  const updated: MusicControlLogEntry[] = [next, ...cached]
  if (updated.length > 500) updated.length = 500
  saveToLocalStorage(LS_MUSIC_CONTROL_LOGS_KEY, updated)

  // Notify any in-app listeners (best-effort)
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent<MusicControlLogEntry>(MUSIC_CONTROL_LOG_EVENT, { detail: next }))
    }
  } catch {
    // ignore
  }

  try {
    await assertFirestoreReady()
    // Best-effort: write to the append-only collection (preferred for scale)
    try {
      await addDoc(collection(db, 'musicLogs'), next)
    } catch {
      // ignore
    }

    // Best-effort: also write to a single config doc (fallback path if collection writes are blocked).
    // Subscription merges + de-dupes sources, and the doc is capped to keep size bounded.
    try {
      const ref = doc(db, 'config', CONFIG_MUSIC_CONTROL_LOGS_DOC)
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const raw = snap.exists() ? (snap.data() as Record<string, unknown>).logs : undefined
        const prev = Array.isArray(raw) ? (raw as unknown[]) : []
        const normalized: MusicControlLogEntry[] = []
        prev.forEach((v) => {
          const x = v as Partial<MusicControlLogEntry>
          if (!x || typeof x.ts !== 'string' || !x.ts) return
          const action = (x.action as MusicControlAction) || 'play'
          normalized.push({
            ts: x.ts,
            action,
            trackId: typeof x.trackId === 'string' ? x.trackId : undefined,
            trackTitle: typeof x.trackTitle === 'string' ? x.trackTitle : undefined,
          })
        })
        const merged = [next, ...normalized]
        if (merged.length > 500) merged.length = 500
        tx.set(ref, { logs: merged, updatedAt: new Date().toISOString() }, { merge: true })
      })
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

export const subscribeToMusicControlLogs = (
  callback: (logs: MusicControlLogEntry[]) => void,
  max: number = 200
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let unsubscribeConfigDoc: (() => void) | null = null
  let cancelled = false

  let lastFromCollection: MusicControlLogEntry[] = []
  let lastFromConfigDoc: MusicControlLogEntry[] = []

  const emitMerged = () => {
    const keyOf = (x: MusicControlLogEntry) => `${x.ts}|${x.action}|${x.trackId || ''}`
    const byKey: Record<string, MusicControlLogEntry> = {}
    ;[...lastFromCollection, ...lastFromConfigDoc].forEach((x) => {
      if (!x.ts) return
      byKey[keyOf(x)] = x
    })
    const merged = Object.values(byKey).sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0))
    if (merged.length > Math.max(1, max)) merged.length = Math.max(1, max)
    callback(merged)
  }

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback(getFromLocalStorage<MusicControlLogEntry[]>(LS_MUSIC_CONTROL_LOGS_KEY, []))
      return
    }

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const q = query(collection(db, 'musicLogs'), orderBy('ts', 'desc'), limit(Math.max(1, max)))
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const next: MusicControlLogEntry[] = []
          snap.forEach((d) => {
            const data = d.data() as Partial<MusicControlLogEntry>
            const ts = typeof data.ts === 'string' ? data.ts : ''
            const action = (data.action as MusicControlAction) || 'play'
            next.push({
              ts,
              action,
              trackId: typeof data.trackId === 'string' ? data.trackId : undefined,
              trackTitle: typeof data.trackTitle === 'string' ? data.trackTitle : undefined,
            })
          })
          // also mirror to local cache
          saveToLocalStorage(LS_MUSIC_CONTROL_LOGS_KEY, next)
          lastFromCollection = next
          emitMerged()
        },
        () => {
          // If reads are blocked (rules) or the network is down, fall back to local cache.
          lastFromCollection = []
          // We still might have logs in the config-doc fallback.
          const local = getFromLocalStorage<MusicControlLogEntry[]>(LS_MUSIC_CONTROL_LOGS_KEY, [])
          // Keep behavior: if both Firestore sources are empty, local cache drives UI.
          if (!lastFromConfigDoc.length) callback(local)
          else emitMerged()
        }
      )

      // Secondary source: a config doc fallback used when collection writes are blocked.
      const ref = doc(db, 'config', CONFIG_MUSIC_CONTROL_LOGS_DOC)
      unsubscribeConfigDoc = onSnapshot(
        ref,
        (snap) => {
          const raw = snap.exists() ? (snap.data() as Record<string, unknown>).logs : undefined
          const arr = Array.isArray(raw) ? (raw as unknown[]) : []
          const next: MusicControlLogEntry[] = []
          arr.forEach((v) => {
            const data = v as Partial<MusicControlLogEntry>
            const ts = typeof data.ts === 'string' ? data.ts : ''
            if (!ts) return
            const action = (data.action as MusicControlAction) || 'play'
            next.push({
              ts,
              action,
              trackId: typeof data.trackId === 'string' ? data.trackId : undefined,
              trackTitle: typeof data.trackTitle === 'string' ? data.trackTitle : undefined,
            })
          })
          lastFromConfigDoc = next
          emitMerged()
        },
        () => {
          lastFromConfigDoc = []
          emitMerged()
        }
      )
    } catch {
      callback(getFromLocalStorage<MusicControlLogEntry[]>(LS_MUSIC_CONTROL_LOGS_KEY, []))
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
    if (unsubscribeConfigDoc) unsubscribeConfigDoc()
  }
}


