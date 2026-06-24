import { db, waitForFirebase } from '../firebase'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────────────────────
// Types — kept in sync with `functions/src/spotify/types.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type SpotifyStatus = {
  connected: boolean
  connectedUserId?: string
  connectedUserName?: string
  connectedAt?: string
  updatedAt?: string
}

export type SpotifyConfig = {
  /**
   * Ordered list of Spotify context URIs (e.g. `spotify:playlist:37i9dQZF1DXcBWIGoYBM5M`)
   * the player rotates through. The first URI starts at app load.
   */
  playlistUris: string[]
  /** Current playlist index the player is on (advances when a context ends). */
  currentPlaylistIndex: number
  shuffle: boolean
  /** 0..1 default volume applied on SDK init. */
  defaultDeviceVolume: number
  updatedAt?: string
}

export const DEFAULT_SPOTIFY_CONFIG: SpotifyConfig = {
  playlistUris: [],
  currentPlaylistIndex: 0,
  shuffle: true,
  defaultDeviceVolume: 0.6,
}

export type SpotifyTrackResult = {
  uri: string
  name: string
  artists: string
  durationMs: number
  albumImageUrl?: string
}

export type SpotifyQueueItemStatus = 'pending' | 'queued' | 'playing' | 'played' | 'skipped'

export type SpotifyQueueItem = {
  id: string
  trackUri: string
  trackName: string
  artistName: string
  durationMs?: number
  albumImageUrl?: string
  requestedBy?: string
  status: SpotifyQueueItemStatus
  addedAt: string
  addedAtMs: number
  // Filled in by player after Spotify accepts the queue request.
  queuedAt?: string
  playedAt?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const isFirestoreSDKAvailable = (): boolean => db !== null

const assertFirestoreReady = async (): Promise<void> => {
  await waitForFirebase()
  if (!isFirestoreSDKAvailable()) throw new Error('Firestore SDK not available')
}

const REQUEST_TIMEOUT_MS = 15_000

/**
 * Generic helper: write a request doc, wait for the trigger to fill in a
 * `status` of `success` or `error`, then resolve. Cleans up the doc when done.
 */
const runRequest = async <T extends { status: 'pending' | 'success' | 'error' }>(
  collectionPath: string,
  payload: Omit<T, 'status' | 'createdAt' | 'createdAtMs'>,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> => {
  await assertFirestoreReady()
  const colRef = collection(db, collectionPath)
  const now = Date.now()
  const docRef = await addDoc(colRef, {
    ...payload,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    createdAtMs: now,
  })

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
      // Best-effort cleanup; ignore failures.
      deleteDoc(docRef).catch(() => {})
    }

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Spotify request timed out')))
    }, timeoutMs)

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) return
        const data = snap.data() as T & { status: string }
        if (data.status === 'success') {
          window.clearTimeout(timeoutId)
          unsubscribe()
          finish(() => resolve(data))
        } else if (data.status === 'error') {
          const err =
            (data as unknown as { error?: string }).error || 'Spotify request failed'
          window.clearTimeout(timeoutId)
          unsubscribe()
          finish(() => reject(new Error(err)))
        }
      },
      (err) => {
        window.clearTimeout(timeoutId)
        unsubscribe()
        finish(() => reject(err))
      }
    )
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth (initial connect)
// ─────────────────────────────────────────────────────────────────────────────

export const SPOTIFY_CLIENT_ID = 'fd12de6d74ff43539a682cfe77a6920f'

export const SPOTIFY_AUTH_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
].join(' ')

const LS_OAUTH_STATE_KEY = 'traq-spotify-oauth-state-v1'

const randomState = (): string => {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Build the Spotify authorize URL. The admin clicks "Connect Spotify" → we
 * remember a random `state`, redirect to Spotify, and Spotify redirects back to
 * `redirectUri` with `?code=…&state=…`. The admin Music page then writes that
 * code into `spotifyOAuthRequests` for the trigger to exchange.
 */
export const buildSpotifyAuthorizeUrl = (redirectUri: string): string => {
  const state = randomState()
  try {
    sessionStorage.setItem(LS_OAUTH_STATE_KEY, state)
  } catch {
    // ignore
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_AUTH_SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'true',
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export const consumeStoredOAuthState = (): string | null => {
  try {
    const v = sessionStorage.getItem(LS_OAUTH_STATE_KEY)
    sessionStorage.removeItem(LS_OAUTH_STATE_KEY)
    return v
  } catch {
    return null
  }
}

/** Exchange `code` for tokens via the Firestore-trigger function. */
export const submitSpotifyOAuthCode = async (params: {
  code: string
  redirectUri: string
}): Promise<{ connectedUserId?: string; connectedUserName?: string }> => {
  type Resp = {
    status: 'pending' | 'success' | 'error'
    connectedUserId?: string
    connectedUserName?: string
  }
  const res = await runRequest<Resp>(
    'spotifyOAuthRequests',
    { code: params.code, redirectUri: params.redirectUri } as unknown as Omit<
      Resp,
      'status' | 'createdAt' | 'createdAtMs'
    >,
    20_000
  )
  return {
    connectedUserId: res.connectedUserId,
    connectedUserName: res.connectedUserName,
  }
}

export const requestSpotifyDisconnect = async (): Promise<void> => {
  type Resp = { status: 'pending' | 'success' | 'error' }
  await runRequest<Resp>(
    'spotifyDisconnectRequests',
    {} as Omit<Resp, 'status' | 'createdAt' | 'createdAtMs'>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Access token (used by Web Playback SDK's `getOAuthToken`)
// ─────────────────────────────────────────────────────────────────────────────

export const fetchSpotifyAccessToken = async (): Promise<{
  accessToken: string
  expiresAtMs: number
}> => {
  type Resp = {
    status: 'pending' | 'success' | 'error'
    accessToken?: string
    expiresAtMs?: number
  }
  const res = await runRequest<Resp>(
    'spotifyTokenRequests',
    {} as Omit<Resp, 'status' | 'createdAt' | 'createdAtMs'>
  )
  if (!res.accessToken || !res.expiresAtMs) {
    throw new Error('Spotify access token response was empty')
  }
  return { accessToken: res.accessToken, expiresAtMs: res.expiresAtMs }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

export const searchSpotifyTracks = async (queryStr: string): Promise<SpotifyTrackResult[]> => {
  const trimmed = queryStr.trim()
  if (!trimmed) return []
  type Resp = {
    status: 'pending' | 'success' | 'error'
    results?: SpotifyTrackResult[]
  }
  const res = await runRequest<Resp>(
    'spotifySearchRequests',
    { query: trimmed } as unknown as Omit<Resp, 'status' | 'createdAt' | 'createdAtMs'>
  )
  return Array.isArray(res.results) ? res.results : []
}

// ─────────────────────────────────────────────────────────────────────────────
// Playback commands (admin remote actions)
// ─────────────────────────────────────────────────────────────────────────────

export const sendSpotifyPlaybackCommand = async (params: {
  kind: 'next' | 'previous' | 'pause' | 'resume'
  deviceId?: string
}): Promise<void> => {
  type Resp = { status: 'pending' | 'success' | 'error' }
  const payload: Record<string, unknown> = { kind: params.kind }
  if (params.deviceId) payload.deviceId = params.deviceId
  await runRequest<Resp>(
    'spotifyPlaybackCommands',
    payload as Omit<Resp, 'status' | 'createdAt' | 'createdAtMs'>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Status / config subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export const subscribeToSpotifyStatus = (
  callback: (status: SpotifyStatus) => void
): (() => void) => {
  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    await waitForFirebase()
    if (cancelled || !isFirestoreSDKAvailable()) {
      callback({ connected: false })
      return
    }
    const ref = doc(db, 'config', 'spotifyStatus')
    unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          callback({ connected: false })
          return
        }
        const data = snap.data() as Partial<SpotifyStatus>
        callback({
          connected: !!data.connected,
          connectedUserId:
            typeof data.connectedUserId === 'string' ? data.connectedUserId : undefined,
          connectedUserName:
            typeof data.connectedUserName === 'string' ? data.connectedUserName : undefined,
          connectedAt: typeof data.connectedAt === 'string' ? data.connectedAt : undefined,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        })
      },
      () => callback({ connected: false })
    )
  }
  setup()
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export const subscribeToSpotifyConfig = (
  callback: (config: SpotifyConfig) => void
): (() => void) => {
  let cancelled = false
  let unsubscribe: (() => void) | null = null
  const setup = async () => {
    await waitForFirebase()
    if (cancelled || !isFirestoreSDKAvailable()) {
      callback(DEFAULT_SPOTIFY_CONFIG)
      return
    }
    const ref = doc(db, 'config', 'spotifyConfig')
    unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          callback(DEFAULT_SPOTIFY_CONFIG)
          return
        }
        const data = snap.data() as Partial<SpotifyConfig>
        callback({
          playlistUris: Array.isArray(data.playlistUris)
            ? (data.playlistUris as unknown[])
                .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            : [],
          currentPlaylistIndex:
            typeof data.currentPlaylistIndex === 'number' && data.currentPlaylistIndex >= 0
              ? data.currentPlaylistIndex
              : 0,
          shuffle: typeof data.shuffle === 'boolean' ? data.shuffle : true,
          defaultDeviceVolume:
            typeof data.defaultDeviceVolume === 'number' &&
            data.defaultDeviceVolume >= 0 &&
            data.defaultDeviceVolume <= 1
              ? data.defaultDeviceVolume
              : DEFAULT_SPOTIFY_CONFIG.defaultDeviceVolume,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        })
      },
      () => callback(DEFAULT_SPOTIFY_CONFIG)
    )
  }
  setup()
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export const updateSpotifyConfig = async (
  patch: Partial<SpotifyConfig>
): Promise<void> => {
  await assertFirestoreReady()
  const ref = doc(db, 'config', 'spotifyConfig')
  const next: Record<string, unknown> = {}
  if (patch.playlistUris !== undefined) {
    next.playlistUris = patch.playlistUris.filter((x) => typeof x === 'string' && x.trim())
  }
  if (patch.currentPlaylistIndex !== undefined) {
    next.currentPlaylistIndex = Math.max(0, Math.floor(patch.currentPlaylistIndex))
  }
  if (patch.shuffle !== undefined) {
    next.shuffle = !!patch.shuffle
  }
  if (patch.defaultDeviceVolume !== undefined) {
    next.defaultDeviceVolume = Math.max(0, Math.min(1, Number(patch.defaultDeviceVolume)))
  }
  next.updatedAt = serverTimestamp()
  await setDoc(ref, next, { merge: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public song-request queue
// ─────────────────────────────────────────────────────────────────────────────

export const subscribeToSpotifyQueue = (
  callback: (items: SpotifyQueueItem[]) => void
): (() => void) => {
  let cancelled = false
  let unsubscribe: (() => void) | null = null
  const setup = async () => {
    await waitForFirebase()
    if (cancelled || !isFirestoreSDKAvailable()) {
      callback([])
      return
    }
    const ref = collection(db, 'spotifyQueue')
    const q = query(ref, orderBy('addedAtMs', 'asc'))
    unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items: SpotifyQueueItem[] = []
        snap.forEach((d) => {
          const data = d.data() as Partial<SpotifyQueueItem>
          items.push({
            id: d.id,
            trackUri: typeof data.trackUri === 'string' ? data.trackUri : '',
            trackName: typeof data.trackName === 'string' ? data.trackName : 'Unknown',
            artistName: typeof data.artistName === 'string' ? data.artistName : '',
            durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
            albumImageUrl:
              typeof data.albumImageUrl === 'string' ? data.albumImageUrl : undefined,
            requestedBy:
              typeof data.requestedBy === 'string' ? data.requestedBy : undefined,
            status: ((): SpotifyQueueItemStatus => {
              const s = data.status
              if (s === 'pending' || s === 'queued' || s === 'playing' || s === 'played' || s === 'skipped') return s
              return 'pending'
            })(),
            addedAt: typeof data.addedAt === 'string' ? data.addedAt : '',
            addedAtMs: typeof data.addedAtMs === 'number' ? data.addedAtMs : 0,
            queuedAt: typeof data.queuedAt === 'string' ? data.queuedAt : undefined,
            playedAt: typeof data.playedAt === 'string' ? data.playedAt : undefined,
          })
        })
        callback(items)
      },
      () => callback([])
    )
  }
  setup()
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export const enqueueSpotifyTrack = async (params: {
  trackUri: string
  trackName: string
  artistName?: string
  durationMs?: number
  albumImageUrl?: string
  requestedBy?: string
}): Promise<void> => {
  await assertFirestoreReady()
  const colRef = collection(db, 'spotifyQueue')
  const now = Date.now()
  const payload: Record<string, unknown> = {
    trackUri: params.trackUri,
    trackName: params.trackName,
    artistName: params.artistName || '',
    status: 'pending',
    addedAt: new Date(now).toISOString(),
    addedAtMs: now,
  }
  if (typeof params.durationMs === 'number') payload.durationMs = params.durationMs
  if (params.albumImageUrl) payload.albumImageUrl = params.albumImageUrl
  if (params.requestedBy) payload.requestedBy = params.requestedBy
  await addDoc(colRef, payload)
}

export const updateQueueItemStatus = async (
  itemId: string,
  status: SpotifyQueueItemStatus,
  extra?: { queuedAt?: string; playedAt?: string }
): Promise<void> => {
  await assertFirestoreReady()
  const ref = doc(db, 'spotifyQueue', itemId)
  const patch: Record<string, unknown> = { status }
  if (extra?.queuedAt) patch.queuedAt = extra.queuedAt
  else if (status === 'queued') patch.queuedAt = new Date().toISOString()
  if (extra?.playedAt) patch.playedAt = extra.playedAt
  else if (status === 'played' || status === 'skipped') patch.playedAt = new Date().toISOString()
  await setDoc(ref, patch, { merge: true })
}

export const removeQueueItem = async (itemId: string): Promise<void> => {
  await assertFirestoreReady()
  await deleteDoc(doc(db, 'spotifyQueue', itemId))
}

/** Helper exposed for the rare case we want to clear an unset field. */
export const clearQueueField = deleteField
