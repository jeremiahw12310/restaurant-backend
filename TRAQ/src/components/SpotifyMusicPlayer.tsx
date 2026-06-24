import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  enqueueSpotifyTrack,
  fetchSpotifyAccessToken,
  removeQueueItem,
  searchSpotifyTracks,
  subscribeToSpotifyConfig,
  subscribeToSpotifyQueue,
  subscribeToSpotifyStatus,
  updateQueueItemStatus,
  updateSpotifyConfig,
  type SpotifyConfig,
  type SpotifyQueueItem,
  type SpotifyStatus,
  type SpotifyTrackResult,
} from '../services/spotify'
import { reportMusicScreensaverUi } from '../musicScreensaverBridge'
import { appendMusicControlLog } from '../services/music'

// We share the legacy player's localStorage key + custom event so all the
// existing "is music playing?" reminder logic in `App.tsx` continues to work
// without any changes when the user is on the Spotify provider.
const LS_PLAYBACK_STATE_KEY = 'traq-music-playback-state-v1'
const MUSIC_PLAYBACK_STATE_EVENT = 'traq:music-playback-state'

type PlaybackState = { isActuallyPlaying: boolean; ts: string }

const savePlaybackState = (isActuallyPlaying: boolean): void => {
  const next: PlaybackState = { isActuallyPlaying, ts: new Date().toISOString() }
  try {
    localStorage.setItem(LS_PLAYBACK_STATE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<{ isActuallyPlaying: boolean }>(MUSIC_PLAYBACK_STATE_EVENT, {
          detail: { isActuallyPlaying },
        })
      )
    }
  } catch {
    // ignore
  }
}

const formatTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}

// ─── Web Playback SDK typings (we keep them local; no runtime dependency) ───

type SpotifyTrackInfo = {
  uri: string
  name?: string
  duration_ms?: number
  artists?: { name?: string }[]
  album?: { images?: { url?: string }[] }
}

type SpotifyPlayerState = {
  paused: boolean
  position: number
  duration: number
  context?: { uri?: string | null }
  track_window?: {
    current_track?: SpotifyTrackInfo
  }
}

type SpotifyPlayer = {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: string, cb: (...args: unknown[]) => void): boolean
  removeListener(event: string, cb?: (...args: unknown[]) => void): boolean
  getCurrentState(): Promise<SpotifyPlayerState | null>
  setVolume(v: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  togglePlay(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  seek(positionMs: number): Promise<void>
}

type SpotifySdkConstructor = new (options: {
  name: string
  getOAuthToken: (cb: (token: string) => void) => void
  volume?: number
}) => SpotifyPlayer

declare global {
  interface Window {
    Spotify?: { Player: SpotifySdkConstructor }
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

const SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js'
const SDK_SCRIPT_ID = 'spotify-web-playback-sdk-script'

const loadSpotifySdk = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('No window'))
      return
    }
    if (window.Spotify?.Player) {
      resolve()
      return
    }
    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      // Wait for the global to appear (script may still be loading).
      const startedAt = Date.now()
      const tick = () => {
        if (window.Spotify?.Player) return resolve()
        if (Date.now() - startedAt > 15_000) return reject(new Error('Spotify SDK load timeout'))
        window.setTimeout(tick, 100)
      }
      tick()
      return
    }

    let resolved = false
    window.onSpotifyWebPlaybackSDKReady = () => {
      resolved = true
      resolve()
    }
    const script = document.createElement('script')
    script.id = SDK_SCRIPT_ID
    script.src = SDK_SCRIPT_URL
    script.async = true
    script.onerror = () => {
      if (!resolved) reject(new Error('Failed to load Spotify SDK script'))
    }
    document.body.appendChild(script)
  })

// ─────────────────────────────────────────────────────────────────────────────

export const SpotifyMusicPlayer = memo(function SpotifyMusicPlayer() {
  // Player + sdk
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const sdkLoadedRef = useRef(false)

  // Status + config from Firestore
  const [status, setStatus] = useState<SpotifyStatus>({ connected: false })
  const [config, setConfig] = useState<SpotifyConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const configRef = useRef<SpotifyConfig | null>(null)
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Local playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [needsUserGesture, setNeedsUserGesture] = useState(false)
  const [isStartingPlayback, setIsStartingPlayback] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrackInfo | null>(null)
  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [requestOverlayOpen, setRequestOverlayOpen] = useState(false)

  // Refs for closures + watchdogs
  const isPlayingRef = useRef(false)
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])
  const currentTrackUriRef = useRef<string | null>(null)
  useEffect(() => {
    currentTrackUriRef.current = currentTrack?.uri ?? null
  }, [currentTrack])
  const lastStateChangeAtRef = useRef<number>(Date.now())
  const initErrorRef = useRef<string | null>(null)
  const reinitTimeoutRef = useRef<number | null>(null)
  const lastPlayedQueueUriRef = useRef<string | null>(null)
  // True when the user tapped the pill before the SDK reported `ready`. The
  // ready listener consumes this to auto-transfer with `play: true` so the tap
  // intent is preserved across SDK init.
  const pendingPlayRef = useRef<boolean>(false)
  // Rate-limit the diagnostic log we emit when a tap is ignored because no
  // playlists are configured yet — we don't want to spam the console.
  const warnedEmptyPlaylistRef = useRef<boolean>(false)
  // Late-bound reference to startContextPlayback so the SDK init `useEffect`
  // (defined before that callback) can invoke it from the `ready` handler.
  const startContextPlaybackRef = useRef<
    | ((params?: { contextUri?: string; positionMs?: number }) => Promise<boolean>)
    | null
  >(null)
  // If token fetch or Spotify HTTP hangs, `tryPlayFromGesture`/`ready` never
  // reaches `finally` — this timer forces the pill out of "Starting playback…".
  const playbackStartResetTimerRef = useRef<number | null>(null)

  const clearPlaybackStartResetTimer = useCallback(() => {
    if (playbackStartResetTimerRef.current !== null) {
      window.clearTimeout(playbackStartResetTimerRef.current)
      playbackStartResetTimerRef.current = null
    }
  }, [])

  const armPlaybackStartResetTimer = useCallback(() => {
    clearPlaybackStartResetTimer()
    playbackStartResetTimerRef.current = window.setTimeout(() => {
      playbackStartResetTimerRef.current = null
      setIsStartingPlayback(false)
    }, 25_000)
  }, [clearPlaybackStartResetTimer])

  // Queue subscription
  const [queue, setQueue] = useState<SpotifyQueueItem[]>([])
  useEffect(() => {
    const unsub = subscribeToSpotifyQueue(setQueue)
    return () => unsub()
  }, [])

  // Status subscription
  useEffect(() => {
    const unsub = subscribeToSpotifyStatus(setStatus)
    return () => unsub()
  }, [])

  // Config subscription. We additionally flip `configLoaded` the first time
  // we hear back from Firestore so the pill doesn't briefly say "Spotify
  // error" before the snapshot lands.
  useEffect(() => {
    const unsub = subscribeToSpotifyConfig((next) => {
      setConfig(next)
      setConfigLoaded(true)
    })
    return () => unsub()
  }, [])

  const ensureFreshAccessToken = useCallback(
    async (cb: (token: string) => void): Promise<void> => {
      try {
        const { accessToken } = await fetchSpotifyAccessToken()
        cb(accessToken)
      } catch (err) {
        console.error('[SpotifyMusicPlayer] failed to fetch access token:', err)
        // SDK retries this callback rapidly when it gets an empty/invalid token,
        // so giving back an empty string is safer than throwing.
        cb('')
      }
    },
    []
  )

  // Hit Web API directly when we need fine-grained control the SDK doesn't expose
  // (transfer playback, start a context, queue tracks).
  const callSpotifyApi = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const { accessToken } = await fetchSpotifyAccessToken()
      const url = path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`
      const headers = new Headers(init.headers || {})
      headers.set('Authorization', `Bearer ${accessToken}`)
      if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json')
      }
      return fetch(url, { ...init, headers })
    },
    []
  )

  // Initialize the SDK (runs once after we know we're connected).
  useEffect(() => {
    if (!status.connected) return
    if (sdkLoadedRef.current) return
    sdkLoadedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        await loadSpotifySdk()
        if (cancelled || !window.Spotify) return

        const volume = configRef.current?.defaultDeviceVolume ?? 0.6
        const player = new window.Spotify.Player({
          name: 'TRAQ Bonfire iPad',
          getOAuthToken: ensureFreshAccessToken,
          volume,
        })
        playerRef.current = player

        player.addListener('ready', ((data: { device_id: string }) => {
          deviceIdRef.current = data.device_id
          console.log('[SpotifyMusicPlayer] ready', data.device_id)
          // If the user already tapped the pill while we were still loading
          // the SDK, honor that intent now: transfer with `play: true` and
          // immediately start the configured context. Otherwise just claim
          // the Connect device without auto-playing (iOS requires a gesture).
          const hadPendingPlay = pendingPlayRef.current
          pendingPlayRef.current = false
          callSpotifyApi('/me/player', {
            method: 'PUT',
            body: JSON.stringify({ device_ids: [data.device_id], play: hadPendingPlay }),
          })
            .catch((err) => console.warn('transfer failed', err))
            .finally(() => {
              if (!hadPendingPlay) return
              const run = startContextPlaybackRef.current
              if (!run) {
                clearPlaybackStartResetTimer()
                setIsStartingPlayback(false)
                return
              }
              void run()
                .catch(() => {})
                .finally(() => {
                  clearPlaybackStartResetTimer()
                  setIsStartingPlayback(false)
                })
            })
        }) as (...args: unknown[]) => void)

        player.addListener('not_ready', ((data: { device_id: string }) => {
          console.log('[SpotifyMusicPlayer] not_ready', data.device_id)
          // Try a soft reconnect; if that fails, schedule a full re-init.
          player.connect().catch(() => {
            if (reinitTimeoutRef.current) window.clearTimeout(reinitTimeoutRef.current)
            reinitTimeoutRef.current = window.setTimeout(() => {
              sdkLoadedRef.current = false
              player.disconnect()
            }, 10_000)
          })
        }) as (...args: unknown[]) => void)

        const errorHandler = (kind: string) => ((err: { message?: string }) => {
          const msg = err?.message || ''
          console.warn(`[SpotifyMusicPlayer] ${kind}:`, msg)
          initErrorRef.current = `${kind}: ${msg}`
          if (kind === 'authentication_error' || kind === 'account_error') {
            setNeedsUserGesture(true)
          }
        }) as (...args: unknown[]) => void
        player.addListener('initialization_error', errorHandler('initialization_error'))
        player.addListener('authentication_error', errorHandler('authentication_error'))
        player.addListener('account_error', errorHandler('account_error'))
        player.addListener('playback_error', errorHandler('playback_error'))

        player.addListener('player_state_changed', ((state: SpotifyPlayerState | null) => {
          lastStateChangeAtRef.current = Date.now()
          if (!state) {
            setIsPlaying(false)
            savePlaybackState(false)
            return
          }
          const playing = !state.paused
          setIsPlaying(playing)
          savePlaybackState(playing)
          if (playing) {
            clearPlaybackStartResetTimer()
            setIsStartingPlayback(false)
          }
          const dur = (state.duration || 0) / 1000
          const pos = (state.position || 0) / 1000
          setPositionSec(pos)
          setDurationSec(dur)
          const track = state.track_window?.current_track || null
          setCurrentTrack(track)

          // Reconcile queue items based on the currently playing track.
          if (track?.uri) {
            const trackUri = track.uri
            const matching = queueRef.current.find(
              (q) => q.trackUri === trackUri && (q.status === 'queued' || q.status === 'pending')
            )
            if (matching && lastPlayedQueueUriRef.current !== trackUri) {
              lastPlayedQueueUriRef.current = trackUri
              updateQueueItemStatus(matching.id, 'playing').catch(() => {})
            }
            // Mark previous queued items that are no longer current as played.
            queueRef.current.forEach((q) => {
              if (q.status === 'playing' && q.trackUri !== trackUri) {
                updateQueueItemStatus(q.id, 'played').catch(() => {})
              }
            })
          }
        }) as (...args: unknown[]) => void)

        await player.connect()
      } catch (err) {
        console.error('[SpotifyMusicPlayer] init failed:', err)
        initErrorRef.current = err instanceof Error ? err.message : String(err)
        sdkLoadedRef.current = false
        pendingPlayRef.current = false
        clearPlaybackStartResetTimer()
        setIsStartingPlayback(false)
      }
    })()

    return () => {
      cancelled = true
      pendingPlayRef.current = false
      clearPlaybackStartResetTimer()
      setIsStartingPlayback(false)
      if (reinitTimeoutRef.current) window.clearTimeout(reinitTimeoutRef.current)
      const player = playerRef.current
      if (player) {
        try {
          player.disconnect()
        } catch {
          // ignore
        }
      }
      playerRef.current = null
      deviceIdRef.current = null
      sdkLoadedRef.current = false
    }
  }, [
    status.connected,
    callSpotifyApi,
    ensureFreshAccessToken,
    clearPlaybackStartResetTimer,
  ])

  // Mirror queue into a ref for closures (state_changed listener etc.)
  const queueRef = useRef<SpotifyQueueItem[]>([])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // ─── Start playback (from a user gesture) ─────────────────────────────────
  const startContextPlayback = useCallback(
    async (params?: { contextUri?: string; positionMs?: number }) => {
      const cfg = configRef.current
      const deviceId = deviceIdRef.current
      if (!deviceId) return false
      const playlistUris = cfg?.playlistUris || []
      const idx = Math.min(cfg?.currentPlaylistIndex || 0, Math.max(0, playlistUris.length - 1))
      const contextUri = params?.contextUri || playlistUris[idx]
      if (!contextUri) {
        // Nothing configured yet.
        return false
      }
      try {
        const body: Record<string, unknown> = { context_uri: contextUri }
        if (typeof params?.positionMs === 'number') body.position_ms = params.positionMs
        const res = await callSpotifyApi(
          `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
          { method: 'PUT', body: JSON.stringify(body) }
        )
        if (!res.ok && res.status !== 204) {
          const text = await res.text()
          console.warn('[SpotifyMusicPlayer] play context failed', res.status, text.slice(0, 200))
          if (res.status === 401 || res.status === 403) setNeedsUserGesture(true)
          return false
        }
        // Set shuffle if the config wants it (best-effort).
        if (cfg?.shuffle) {
          callSpotifyApi(
            `/me/player/shuffle?state=true&device_id=${encodeURIComponent(deviceId)}`,
            { method: 'PUT' }
          ).catch(() => {})
        }
        return true
      } catch (err) {
        console.warn('[SpotifyMusicPlayer] play context error', err)
        return false
      }
    },
    [callSpotifyApi]
  )

  useEffect(() => {
    startContextPlaybackRef.current = startContextPlayback
  }, [startContextPlayback])

  const tryPlayFromGesture = useCallback(async () => {
    setNeedsUserGesture(false)
    setIsStartingPlayback(true)
    armPlaybackStartResetTimer()
    appendMusicControlLog({
      action: 'play',
      trackId: currentTrackUriRef.current || undefined,
      trackTitle: currentTrack?.name,
    }).catch(() => {})
    const player = playerRef.current
    if (player) {
      try {
        // Gentle resume first (works once playback exists).
        await player.resume()
      } catch {
        // ignore
      }
    }
    try {
      // We intentionally do NOT optimistically flip `isPlaying = true` on
      // failure: that previously left the pill stuck on "Loading…" forever
      // when the SDK wasn't actually playing. The real `player_state_changed`
      // event is the source of truth for `isPlaying`.
      await startContextPlayback()
    } finally {
      clearPlaybackStartResetTimer()
      setIsStartingPlayback(false)
    }
  }, [
    armPlaybackStartResetTimer,
    clearPlaybackStartResetTimer,
    currentTrack?.name,
    startContextPlayback,
  ])

  const togglePlay = useCallback(async () => {
    const player = playerRef.current
    if (!player) return
    try {
      if (isPlaying) {
        appendMusicControlLog({
          action: 'pause',
          trackId: currentTrackUriRef.current || undefined,
          trackTitle: currentTrack?.name,
        }).catch(() => {})
        await player.pause()
      } else {
        appendMusicControlLog({
          action: 'play',
          trackId: currentTrackUriRef.current || undefined,
          trackTitle: currentTrack?.name,
        }).catch(() => {})
        await player.resume()
      }
    } catch (err) {
      console.warn('[SpotifyMusicPlayer] togglePlay failed', err)
      setNeedsUserGesture(true)
    }
  }, [currentTrack?.name, isPlaying])

  const nextTrack = useCallback(async () => {
    const player = playerRef.current
    if (!player) return
    appendMusicControlLog({
      action: 'next',
      trackId: currentTrackUriRef.current || undefined,
      trackTitle: currentTrack?.name,
    }).catch(() => {})
    try {
      await player.nextTrack()
    } catch (err) {
      console.warn('[SpotifyMusicPlayer] nextTrack failed', err)
    }
  }, [currentTrack?.name])

  const prevTrack = useCallback(async () => {
    const player = playerRef.current
    if (!player) return
    appendMusicControlLog({
      action: 'prev',
      trackId: currentTrackUriRef.current || undefined,
      trackTitle: currentTrack?.name,
    }).catch(() => {})
    try {
      await player.previousTrack()
    } catch (err) {
      console.warn('[SpotifyMusicPlayer] prevTrack failed', err)
    }
  }, [currentTrack?.name])

  // ─── Position polling (fills gaps between state_changed events) ───────────
  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(async () => {
      const player = playerRef.current
      if (!player) return
      try {
        const state = await player.getCurrentState()
        if (!state) return
        setPositionSec((state.position || 0) / 1000)
        setDurationSec((state.duration || 0) / 1000)
      } catch {
        // ignore
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [isPlaying])

  // ─── All-day reliability watchdog ─────────────────────────────────────────
  // Every 30s, if we believe we should be playing but aren't, try to nudge
  // playback back. Mirrors the legacy player's stall recovery.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        if (!status.connected) return
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        if (!isPlayingRef.current) return
        const deviceId = deviceIdRef.current
        if (!deviceId) return
        const res = await callSpotifyApi(`/me/player`, { method: 'GET' })
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as
          | { is_playing?: boolean; device?: { id?: string } }
          | null
        const remoteDeviceId = data?.device?.id
        const remotePlaying = !!data?.is_playing
        if (remotePlaying && remoteDeviceId === deviceId) return
        // Re-transfer if a different device became active, then resume.
        await callSpotifyApi('/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [deviceId], play: true }),
        }).catch(() => {})
      } catch (err) {
        console.warn('[SpotifyMusicPlayer] watchdog failed', err)
      }
    }, 30_000)
    return () => window.clearInterval(id)
  }, [status.connected, callSpotifyApi])

  // ─── Reconnect on online events ────────────────────────────────────────────
  useEffect(() => {
    const onOnline = async () => {
      if (!status.connected) return
      const player = playerRef.current
      if (!player) return
      try {
        await player.connect()
        const deviceId = deviceIdRef.current
        if (deviceId && isPlayingRef.current) {
          await callSpotifyApi('/me/player', {
            method: 'PUT',
            body: JSON.stringify({ device_ids: [deviceId], play: true }),
          })
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [status.connected, callSpotifyApi])

  // ─── Listen for the legacy reminder play event so the "tap to play music"
  //     reminder still works the same way it does for the legacy player. ────
  useEffect(() => {
    const handler = () => {
      tryPlayFromGesture().catch(() => {})
    }
    window.addEventListener('traq:music-reminder-play', handler)
    return () => window.removeEventListener('traq:music-reminder-play', handler)
  }, [tryPlayFromGesture])

  // ─── Process pending queue items: POST /me/player/queue with the URI ─────
  useEffect(() => {
    const deviceId = deviceIdRef.current
    if (!deviceId) return
    const pending = queue.filter((q) => q.status === 'pending')
    if (pending.length === 0) return

    let cancelled = false
    ;(async () => {
      for (const item of pending) {
        if (cancelled) return
        try {
          const res = await callSpotifyApi(
            `/me/player/queue?uri=${encodeURIComponent(item.trackUri)}&device_id=${encodeURIComponent(deviceId)}`,
            { method: 'POST' }
          )
          if (res.ok || res.status === 204) {
            await updateQueueItemStatus(item.id, 'queued')
          } else if (res.status === 404) {
            // No active device — most likely we just started up. Try once
            // to transfer playback and retry; if still failing, leave the
            // item pending so the next render attempts it again.
            await callSpotifyApi('/me/player', {
              method: 'PUT',
              body: JSON.stringify({ device_ids: [deviceId], play: false }),
            }).catch(() => {})
          } else {
            const text = await res.text().catch(() => '')
            console.warn('[SpotifyMusicPlayer] queue add failed', res.status, text.slice(0, 200))
          }
        } catch (err) {
          console.warn('[SpotifyMusicPlayer] queue add error', err)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [queue, callSpotifyApi])

  // ─── Playlist rotation: when the context becomes empty, advance index ────
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const cfg = configRef.current
    if (!cfg) return
    if (!cfg.playlistUris.length) return
    // Heuristic: if state shows 0 duration AND we believed we were playing for
    // more than 5 seconds without a state change, rotate. Spotify's SDK fires
    // a state_changed when a playlist context ends with an empty track_window.
    if (!isPlaying && currentTrack === null && durationSec === 0 && positionSec === 0) {
      // Rotate to next playlist.
      const nextIdx = (cfg.currentPlaylistIndex + 1) % cfg.playlistUris.length
      if (nextIdx !== cfg.currentPlaylistIndex) {
        updateSpotifyConfig({ currentPlaylistIndex: nextIdx })
          .then(() => startContextPlayback({ contextUri: cfg.playlistUris[nextIdx] }))
          .catch(() => {})
      }
    }
  }, [isPlaying, currentTrack, durationSec, positionSec, startContextPlayback])

  // ─── Mirror UI to the screensaver (same surface as the legacy player) ────
  // We render based on the React `config` STATE (not configRef.current),
  // because refs are mutated in a useEffect that fires *after* commit, so the
  // first render with playlists in Firestore would otherwise still see an
  // empty ref and flash the empty-playlists copy.
  const playlistCount = config?.playlistUris.length ?? 0
  const hasPlaylists = playlistCount > 0
  const isIdle = !isPlaying && hasPlaylists
  const pillPrompt = needsUserGesture
    ? 'Tap to resume music'
    : isIdle
      ? 'Tap to play music'
      : ''
  // Title fallback ladder, in priority order. Notably we never surface
  // "No Spotify playlists configured" — per product, an unconfigured-but-
  // connected state is shown as a generic "Spotify error" so guests don't see
  // setup-state copy.
  const titleText = !status.connected
    ? 'Spotify not connected'
    : !configLoaded
      ? 'Connecting to Spotify…'
      : !hasPlaylists
        ? 'Spotify error — try again'
        : isStartingPlayback
          ? 'Starting playback…'
          : currentTrack?.name || pillPrompt || ''
  const artistText = (currentTrack?.artists || [])
    .map((a) => a?.name || '')
    .filter(Boolean)
    .join(', ')
  useEffect(() => {
    reportMusicScreensaverUi({
      primaryLine: titleText,
      statusLine: artistText || pillPrompt || null,
    })
  }, [artistText, pillPrompt, titleText])

  const playbackPct = useMemo(() => {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
    return Math.max(0, Math.min(100, (positionSec / durationSec) * 100))
  }, [durationSec, positionSec])

  // Auto-collapse when not actually playing
  useEffect(() => {
    if (!isPlaying && expanded) setExpanded(false)
  }, [expanded, isPlaying])

  return (
    <>
      <div
        className={`header-player ${expanded ? 'expanded' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {expanded && isPlaying && (
          <div
            className="player-backdrop"
            aria-hidden
            onClick={() => setExpanded(false)}
          />
        )}
        <button
          className={`player-pill ${isIdle ? 'player-idle-pulse' : ''}`}
          aria-label="Spotify music player"
          aria-expanded={expanded}
          style={
            {
              ['--playback-pct' as any]: `${playbackPct}%`,
            } as CSSProperties
          }
          onClick={() => {
            // Block taps in unrecoverable states so we don't show "Loading…"
            // for the user.
            if (!status.connected) return
            if (configLoaded && !hasPlaylists) {
              if (!warnedEmptyPlaylistRef.current) {
                warnedEmptyPlaylistRef.current = true
                console.warn(
                  '[SpotifyMusicPlayer] Tap ignored: no playlists configured in config/spotifyConfig.'
                )
              }
              return
            }
            if (isIdle || needsUserGesture) {
              // If the SDK hasn't fired `ready` yet we record the play intent
              // so the ready listener can auto-transfer with `play: true`
              // and start the context the moment the device id is known.
              if (!deviceIdRef.current) {
                pendingPlayRef.current = true
                setIsStartingPlayback(true)
                armPlaybackStartResetTimer()
                return
              }
              tryPlayFromGesture().catch(() => {})
              return
            }
            setExpanded((v) => !v)
          }}
        >
          <span className="player-pill-title" aria-label="Track title">
            <span className="player-pill-title-inner">
              {titleText}
              {artistText && currentTrack?.name ? ` — ${artistText}` : ''}
            </span>
          </span>
          <span className="player-pill-controls" aria-hidden>
            <span className="player-pill-icon">{isPlaying ? '🔊' : '▶'}</span>
          </span>
        </button>

        {expanded && isPlaying && (
          <div className="player-expanded-card" onClick={(e) => e.stopPropagation()}>
            <div className="player-expanded-top">
              <div className="player-expanded-title">
                {currentTrack?.name || titleText}
                {artistText && (
                  <div style={{ fontSize: '0.85em', opacity: 0.75, marginTop: 4 }}>
                    {artistText}
                  </div>
                )}
              </div>
              <button
                className="player-collapse"
                aria-label="Collapse player"
                onClick={() => setExpanded(false)}
              >
                ✕
              </button>
            </div>

            <div className="player-expanded-controls">
              <button
                className="player-ctl"
                aria-label="Previous track"
                onClick={() => {
                  prevTrack().catch(() => {})
                }}
              >
                ⏮
              </button>
              <button
                className="player-ctl player-ctl-primary"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={() => {
                  togglePlay().catch(() => {})
                }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className="player-ctl"
                aria-label="Next track"
                onClick={() => {
                  nextTrack().catch(() => {})
                }}
              >
                ⏭
              </button>
            </div>

            <div className="player-expanded-scrub" aria-label="Scrub track">
              <input
                className="player-scrub"
                type="range"
                min={0}
                max={durationSec || 0}
                value={Math.min(positionSec, durationSec || positionSec)}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setPositionSec(v)
                  const player = playerRef.current
                  if (player) player.seek(Math.floor(v * 1000)).catch(() => {})
                }}
              />
              <div className="player-scrub-meta" aria-hidden>
                <span>{formatTime(positionSec)}</span>
                <span>{formatTime(durationSec)}</span>
              </div>
            </div>

            <button
              className="player-ctl"
              style={{ marginTop: 12, width: '100%' }}
              aria-label="Request a song"
              onClick={() => setRequestOverlayOpen(true)}
            >
              Request a song
            </button>
          </div>
        )}
      </div>

      {requestOverlayOpen && (
        <SpotifyRequestOverlay
          onClose={() => setRequestOverlayOpen(false)}
          onSubmitted={(track) => {
            // Briefly nudge the queue subscriber by leaving overlay open with a toast handled inside.
            void track
          }}
        />
      )}
    </>
  )
})

// ─── Request overlay ─────────────────────────────────────────────────────────

const SpotifyRequestOverlay = memo(function SpotifyRequestOverlay(props: {
  onClose: () => void
  onSubmitted: (track: SpotifyTrackResult) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrackResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setError(null)
      return
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        const tracks = await searchSpotifyTracks(query.trim())
        setResults(tracks)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  const submit = async (track: SpotifyTrackResult) => {
    try {
      await enqueueSpotifyTrack({
        trackUri: track.uri,
        trackName: track.name,
        artistName: track.artists,
        durationMs: track.durationMs,
        albumImageUrl: track.albumImageUrl,
      })
      setToast(`Queued "${track.name}"`)
      props.onSubmitted(track)
      window.setTimeout(() => setToast(null), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue track')
    }
  }

  return (
    <div
      className="player-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '80vh',
          background: '#111',
          color: '#fff',
          borderRadius: 16,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Request a song</div>
          <button
            onClick={props.onClose}
            style={{
              background: 'transparent',
              color: '#fff',
              border: 0,
              fontSize: 22,
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spotify…"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #333',
            background: '#1c1c1c',
            color: '#fff',
            fontSize: 16,
            outline: 'none',
          }}
        />
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {searching && <div style={{ opacity: 0.7 }}>Searching…</div>}
          {error && <div style={{ color: '#ff6f6f' }}>{error}</div>}
          {!searching && !error && query.trim() && results.length === 0 && (
            <div style={{ opacity: 0.7 }}>No results.</div>
          )}
          {results.map((r) => (
            <button
              key={r.uri}
              onClick={() => submit(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#1c1c1c',
                border: '1px solid #2a2a2a',
                color: '#fff',
                padding: 10,
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {r.albumImageUrl && (
                <img
                  src={r.albumImageUrl}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }}
                />
              )}
              <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </span>
                <span
                  style={{
                    opacity: 0.7,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.artists}
                </span>
              </span>
            </button>
          ))}
        </div>
        {toast && (
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              background: '#0f5132',
              color: '#d1f4dd',
              textAlign: 'center',
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  )
})

// Re-export types we want consumers (admin page) to import alongside the player.
export type { SpotifyQueueItem, SpotifyTrackResult }
export { removeQueueItem }
