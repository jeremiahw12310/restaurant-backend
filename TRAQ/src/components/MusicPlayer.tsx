import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import { storage } from '../firebase'
import {
  appendMusicControlLog,
  clearSessionCommand,
  getDeviceInfo,
  getOrCreateSessionId,
  subscribeToMusicPlaylist,
  subscribeToMusicTracks,
  subscribeToSessionCommands,
  updateMusicSession,
  type MusicTrack,
} from '../services/music'
import { listMusicSessionCommandsREST, patchMusicSessionCommandREST } from '../services/firestore-rest'
import { reportMusicScreensaverUi } from '../musicScreensaverBridge.ts'

const LS_PLAYER_STATE_KEY = 'traq-music-player-state-v1'
const LS_PLAYBACK_STATE_KEY = 'traq-music-playback-state-v1'
const MUSIC_PLAYBACK_STATE_EVENT = 'traq:music-playback-state'

type PlayerState = {
  trackId?: string
  isPlaying?: boolean
  positionSec?: number
}

type PlaybackState = {
  isActuallyPlaying: boolean
  ts: string
}

const readPlayerState = (): PlayerState => {
  try {
    const raw = localStorage.getItem(LS_PLAYER_STATE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PlayerState
  } catch {
    return {}
  }
}

const savePlayerState = (next: PlayerState) => {
  try {
    const prev = readPlayerState()
    // Never let `undefined` clobber a previously saved value.
    const cleanedNext: PlayerState = {}
    if (next.trackId !== undefined) cleanedNext.trackId = next.trackId
    if (next.isPlaying !== undefined) cleanedNext.isPlaying = next.isPlaying
    if (next.positionSec !== undefined) cleanedNext.positionSec = next.positionSec

    const merged: PlayerState = { ...prev, ...cleanedNext }
    // If the track changes and no explicit position is provided, reset to start.
    if (
      typeof cleanedNext.trackId === 'string' &&
      cleanedNext.trackId &&
      typeof prev.trackId === 'string' &&
      prev.trackId &&
      cleanedNext.trackId !== prev.trackId &&
      cleanedNext.positionSec === undefined
    ) {
      merged.positionSec = 0
    }
    localStorage.setItem(LS_PLAYER_STATE_KEY, JSON.stringify(merged))
  } catch {
    // ignore
  }
}

const savePlaybackState = (isActuallyPlaying: boolean) => {
  const next: PlaybackState = { isActuallyPlaying, ts: new Date().toISOString() }
  try {
    localStorage.setItem(LS_PLAYBACK_STATE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<{ isActuallyPlaying: boolean }>(MUSIC_PLAYBACK_STATE_EVENT, { detail: { isActuallyPlaying } })
      )
    }
  } catch {
    // ignore
  }
}

const formatTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${m}:${String(ss).padStart(2, '0')}`
}

// URL cache for preloading - stores trackId -> download URL
const urlCache = new Map<string, { url: string; fetchedAt: number }>()
const URL_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes (Firebase URLs are valid for ~1 hour)

const getCachedUrl = (trackId: string): string | null => {
  const entry = urlCache.get(trackId)
  if (!entry) return null
  // Check if still valid
  if (Date.now() - entry.fetchedAt > URL_CACHE_TTL_MS) {
    urlCache.delete(trackId)
    return null
  }
  return entry.url
}

const setCachedUrl = (trackId: string, url: string): void => {
  urlCache.set(trackId, { url, fetchedAt: Date.now() })
  // Limit cache size to prevent memory issues
  if (urlCache.size > 20) {
    const oldest = [...urlCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]
    if (oldest) urlCache.delete(oldest[0])
  }
}

export const MusicPlayer = memo(function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Hidden audio element for preloading next track
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastTouchTsRef = useRef<number>(0)
  // Session management for remote control
  const sessionIdRef = useRef<string>(getOrCreateSessionId())
  const deviceInfoRef = useRef<string>(getDeviceInfo())
  const lastCommandIssuedAtRef = useRef<string>('')
  // REST command queue: prevent duplicate execution while polling
  const lastHandledQueuedCommandIdRef = useRef<string>('')
  const queuedCommandInFlightRef = useRef<boolean>(false)
  const pendingSeekSecRef = useRef<number | null>(null)
  const lastPersistTsRef = useRef<number>(0)
  const lastPersistedSecRef = useRef<number>(-1)
  const prevQueueIdsRef = useRef<string[]>([])
  const lastTimeUpdateTsRef = useRef<number>(0)
  const lastTimeUpdatePosRef = useRef<number>(0)
  // Detect "flow" (currentTime advancing) even if some browsers don't fire 'playing' reliably.
  const flowTickIntervalRef = useRef<number | null>(null)
  // Track transition state: prevents watchdog false positives during source changes
  const isTransitioningRef = useRef<boolean>(false)
  const transitionStartTsRef = useRef<number>(0)
  // Track the last URL we set to detect source changes
  const lastSetUrlRef = useRef<string | null>(null)
  // Flag to defer play() until canplay fires after source change
  const pendingPlayOnReadyRef = useRef<boolean>(false)
  // Track when onPlay fired to give initial grace period for timeupdate
  const playStartTsRef = useRef<number>(0)
  // Track latest isPlaying value to avoid stale closures in event handlers
  // Initialize from localStorage to match isPlaying state (avoids race condition on mount)
  const isPlayingRef = useRef<boolean>(!!readPlayerState().isPlaying)
  // Track latest needsUserGesture value to avoid stale closures in timers
  const needsUserGestureRef = useRef<boolean>(false)
  // Track last time we received buffer data (progress event)
  const lastProgressTsRef = useRef<number>(0)
  // Retry counter for play() failures
  const playRetryCountRef = useRef<number>(0)
  const playRetryTimeoutRef = useRef<number | null>(null)
  // Track which track we last preloaded to avoid redundant fetches
  const lastPreloadedTrackIdRef = useRef<string | null>(null)
  // Error retry state for current track
  const errorRetryCountRef = useRef<number>(0)
  const errorRetryTimeoutRef = useRef<number | null>(null)
  // Buffer delay before playback (3 seconds)
  const bufferDelayTimeoutRef = useRef<number | null>(null)
  const isBufferDelayActiveRef = useRef<boolean>(false)
  // Refs for heartbeat to avoid recreating interval on every position update
  const positionSecRef = useRef<number>(0)
  const durationSecRef = useRef<number>(0)
  const bufferProgressRef = useRef<number>(0)
  const isBufferingRef = useRef<boolean>(false)
  const isActuallyPlayingRef = useRef<boolean>(false)
  const isAudioFlowingRef = useRef<boolean>(false)
  const currentTrackRef = useRef<MusicTrack | null>(null)
  // Stall recovery: if we're buffering indefinitely, try a conservative reload/URL refresh.
  const stallStartTsRef = useRef<number>(0)
  const stallRecoveryCountRef = useRef<number>(0)
  const lastStallRecoveryAttemptTsRef = useRef<number>(0)
  const stallRecoveryInFlightRef = useRef<boolean>(false)
  // Track network state to avoid aggressive retries while offline.
  const isOfflineRef = useRef<boolean>(false)
  // Throttle position UI updates to reduce re-renders (update ref always, state less often)
  const lastPositionUpdateTsRef = useRef<number>(0)

  const [expanded, setExpanded] = useState(false)
  // "Desired" play state (what the app/user wants), not necessarily what the browser is currently doing.
  const [isPlaying, setIsPlaying] = useState(() => !!readPlayerState().isPlaying)
  // "Actual" play state reported by the <audio> element.
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false)
  // If playback was blocked/stalled, prompt user to tap to resume.
  const [needsUserGesture, setNeedsUserGesture] = useState(false)
  // Buffering: audio element is waiting for data (more accurate than derived state)
  const [isBuffering, setIsBuffering] = useState(false)
  // Track if audio is actively producing output (from 'playing' event, not just 'play')
  const [isAudioFlowing, setIsAudioFlowing] = useState(false)
  // Buffer progress percentage (0-100)
  const [bufferProgress, setBufferProgress] = useState(0)

  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [order, setOrder] = useState<string[]>([])

  const [currentTrackId, setCurrentTrackId] = useState<string | null>(() => readPlayerState().trackId || null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)

  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)

  const titleOuterRef = useRef<HTMLSpanElement | null>(null)
  const titleInnerRef = useRef<HTMLSpanElement | null>(null)
  const prefersReducedMotionRef = useRef<boolean>(false)
  const [marquee, setMarquee] = useState<{ enabled: boolean; distancePx: number; durationSec: number }>({
    enabled: false,
    distancePx: 0,
    durationSec: 0,
  })

  const reportPlaybackIssue = useCallback(
    (kind: string, err?: unknown, extra?: Record<string, unknown>) => {
      const track = currentTrackRef.current
      const el = audioRef.current
      const errMsg =
        err instanceof Error
          ? `${err.name}${err.message ? `: ${err.message}` : ''}`
          : typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'message' in (err as Record<string, unknown>)
              ? String((err as Record<string, unknown>).message)
              : ''

      const detailObj: Record<string, unknown> = {
        kind,
        err: errMsg || undefined,
        trackId: track?.id,
        trackTitle: track?.title,
        readyState: el?.readyState,
        networkState: el?.networkState,
        visibility: typeof document !== 'undefined' ? document.visibilityState : undefined,
        online: typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : undefined,
        ...(extra || {}),
      }

      let detail = ''
      try {
        detail = JSON.stringify(detailObj)
      } catch {
        detail = errMsg || kind
      }
      if (detail.length > 700) detail = `${detail.slice(0, 700)}…`

      updateMusicSession(sessionIdRef.current, {
        lastPlaybackIssueAt: new Date().toISOString(),
        lastPlaybackIssueKind: kind,
        lastPlaybackIssueDetail: detail,
      }).catch(() => {})
    },
    []
  )

  const persistPosition = useCallback(
    (opts?: { force?: boolean }) => {
      const el = audioRef.current
      if (!el) return
      const trackId = currentTrackId
      if (!trackId) return
      const sec = el.currentTime
      if (!Number.isFinite(sec)) return

      const now = Date.now()
      const force = !!opts?.force
      const lastTs = lastPersistTsRef.current
      const lastSec = lastPersistedSecRef.current

      // Avoid hammering localStorage. We still force-save on pause/pagehide.
      if (!force) {
        if (now - lastTs < 2000) return
        if (Number.isFinite(lastSec) && Math.abs(sec - lastSec) < 0.9) return
      }

      lastPersistTsRef.current = now
      lastPersistedSecRef.current = sec
      savePlayerState({ trackId, isPlaying, positionSec: sec })
    },
    [currentTrackId, isPlaying]
  )

  const recordTouch = useCallback(() => {
    lastTouchTsRef.current = Date.now()
  }, [])

  const shouldIgnoreClick = useCallback(() => {
    return Date.now() - lastTouchTsRef.current < 700
  }, [])

  useEffect(() => {
    const unsubTracks = subscribeToMusicTracks(setTracks)
    const unsubPlaylist = subscribeToMusicPlaylist((p) => setOrder(p.order || []))
    return () => {
      unsubTracks()
      unsubPlaylist()
      // Cleanup retry timeouts
      if (playRetryTimeoutRef.current) {
        window.clearTimeout(playRetryTimeoutRef.current)
      }
      if (errorRetryTimeoutRef.current) {
        window.clearTimeout(errorRetryTimeoutRef.current)
      }
      if (bufferDelayTimeoutRef.current) {
        window.clearTimeout(bufferDelayTimeoutRef.current)
      }
    }
  }, [])

  const enabledTracks = useMemo(() => tracks.filter((t) => t.enabled), [tracks])

  const queue = useMemo(() => {
    const byId: Record<string, MusicTrack> = {}
    enabledTracks.forEach((t) => (byId[t.id] = t))

    const seen: Record<string, true> = {}
    const next: MusicTrack[] = []
    ;(order || []).forEach((id) => {
      const t = byId[id]
      if (!t) return
      if (seen[id]) return
      seen[id] = true
      next.push(t)
    })

    enabledTracks.forEach((t) => {
      if (seen[t.id]) return
      next.push(t)
    })

    return next
  }, [enabledTracks, order])

  const currentTrack = useMemo(() => {
    if (!queue.length) return null
    if (currentTrackId) {
      const t = queue.find((x) => x.id === currentTrackId)
      if (t) return t
    }
    return queue[0] || null
  }, [currentTrackId, queue])

  const currentIndex = useMemo(() => {
    if (!currentTrack) return -1
    return queue.findIndex((t) => t.id === currentTrack.id)
  }, [currentTrack, currentTrackId, queue])

  useEffect(() => {
    if (!queue.length) {
      // Queue may be temporarily empty while subscriptions load.
      // Don't clear `currentTrackId` (we need it to restore seek position after reload).
      setCurrentUrl(null)
      try {
        const el = audioRef.current
        if (el) {
          el.pause()
          // Ensure we don't keep playing a stale src if everything is removed.
          el.removeAttribute('src')
          el.load()
        }
      } catch {
        // ignore
      }
      return
    }

    // If currentTrackId is missing, snap to first track.
    if (!currentTrackId) {
      const first = queue[0]!.id
      savePlayerState({ trackId: first, positionSec: 0 })
      setCurrentTrackId(first)
      return
    }

    // If currentTrackId is missing/disabled, smoothly skip to the "next" valid track
    // (rather than restarting at the beginning).
    if (!currentTrack) {
      // Mark that we're transitioning - this prevents watchdog false positives
      // and allows smooth transition without stopping playback
      isTransitioningRef.current = true
      transitionStartTsRef.current = Date.now()
      setPositionSec(0)

      const nextQueueIds = queue.map((t) => t.id)
      const nextSet = new Set(nextQueueIds)
      const prevIds = prevQueueIdsRef.current || []
      const oldIdx = prevIds.indexOf(currentTrackId)

      let chosen = nextQueueIds[0] || null
      if (oldIdx >= 0 && prevIds.length > 1) {
        for (let offset = 1; offset <= prevIds.length; offset++) {
          const candidate = prevIds[(oldIdx + offset) % prevIds.length]
          if (candidate && nextSet.has(candidate)) {
            chosen = candidate
            break
          }
        }
        // Fallback: try the same index (track "slides up" into the removed slot).
        if (!chosen && nextQueueIds.length) {
          chosen = nextQueueIds[Math.min(oldIdx, nextQueueIds.length - 1)] || nextQueueIds[0] || null
        }
      }

      if (chosen) {
        savePlayerState({ trackId: chosen, positionSec: 0 })
        setCurrentTrackId(chosen)
      }
    }
  }, [currentTrack, queue])

  // Track the previous queue ids so if the current track disappears we can pick a sensible "next".
  useEffect(() => {
    prevQueueIdsRef.current = queue.map((t) => t.id)
  }, [queue])

  // Fetch current track URL (with caching)
  useEffect(() => {
    const t = currentTrack
    if (!t) {
      setCurrentUrl(null)
      return
    }

    // Check cache first
    const cachedUrl = getCachedUrl(t.id)
    if (cachedUrl) {
      setCurrentUrl(cachedUrl)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const url = await getDownloadURL(storageRef(storage, t.storagePath))
        if (cancelled) return
        setCachedUrl(t.id, url)
        setCurrentUrl(url)
      } catch {
        if (cancelled) return
        setCurrentUrl(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentTrack?.id, currentTrack?.storagePath])

  // Preload next track URL and audio data
  useEffect(() => {
    if (!queue.length || currentIndex < 0) return
    
    const nextIdx = (currentIndex + 1) % queue.length
    const nextTrackToPreload = queue[nextIdx]
    if (!nextTrackToPreload) return

    // Avoid preloading audio data if it risks starving the currently playing stream.
    // We only preload once we have a healthy buffer ahead OR we're near the end of the track.
    // (On constrained networks, concurrent audio downloads can cause audible stutter/“CD skipping”.)
    const currentEl = audioRef.current
    const shouldPreloadAudioData = (() => {
      if (!isActuallyPlayingRef.current) return true
      if (!currentEl) return false

      const cur = Number(currentEl.currentTime || 0)
      const dur = Number(currentEl.duration || 0)
      const nearEnd = Number.isFinite(dur) && dur > 0 && dur - cur <= 45

      // Compute seconds buffered ahead of the current playhead.
      let bufferedEnd = 0
      try {
        if (currentEl.buffered && currentEl.buffered.length > 0) {
          for (let i = 0; i < currentEl.buffered.length; i++) {
            const start = currentEl.buffered.start(i)
            const end = currentEl.buffered.end(i)
            if (start <= cur && end >= cur) {
              bufferedEnd = end
              break
            }
            if (i === 0) bufferedEnd = end
          }
        }
      } catch {
        bufferedEnd = 0
      }
      const bufferedAheadSec = Math.max(0, bufferedEnd - cur)
      const healthyBuffer = bufferedAheadSec >= 30

      return nearEnd || healthyBuffer
    })()
    
    // Don't re-preload the same track
    if (lastPreloadedTrackIdRef.current === nextTrackToPreload.id) return
    
    // Check if already cached
    if (getCachedUrl(nextTrackToPreload.id)) {
      lastPreloadedTrackIdRef.current = nextTrackToPreload.id
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const url = await getDownloadURL(storageRef(storage, nextTrackToPreload.storagePath))
        if (cancelled) return
        setCachedUrl(nextTrackToPreload.id, url)
        lastPreloadedTrackIdRef.current = nextTrackToPreload.id
        
        // Also preload the audio data using a hidden audio element
        if (shouldPreloadAudioData && preloadAudioRef.current) {
          preloadAudioRef.current.src = url
          preloadAudioRef.current.load()
        }
      } catch {
        // Preload failure is non-critical, ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentIndex, queue])

  // Keep <audio> in sync with src and playback state
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const isSourceChange = currentUrl && lastSetUrlRef.current !== currentUrl
    if (isSourceChange) {
      // Mark that we're transitioning to a new source
      isTransitioningRef.current = true
      transitionStartTsRef.current = Date.now()
      // Reset watchdog timestamps to prevent false stall detection
      lastTimeUpdateTsRef.current = 0
      lastTimeUpdatePosRef.current = 0
      playStartTsRef.current = 0
      lastProgressTsRef.current = Date.now() // Start tracking progress from now
      playRetryCountRef.current = 0 // Reset retry counter
      errorRetryCountRef.current = 0 // Reset error retry counter for new track
      isBufferDelayActiveRef.current = false // Reset buffer delay state for new track
      if (playRetryTimeoutRef.current) {
        window.clearTimeout(playRetryTimeoutRef.current)
        playRetryTimeoutRef.current = null
      }
      if (errorRetryTimeoutRef.current) {
        window.clearTimeout(errorRetryTimeoutRef.current)
        errorRetryTimeoutRef.current = null
      }
      if (bufferDelayTimeoutRef.current) {
        window.clearTimeout(bufferDelayTimeoutRef.current)
        bufferDelayTimeoutRef.current = null
      }
      lastSetUrlRef.current = currentUrl
      // Audio is not flowing during source change - triggers buffering UI
      setIsAudioFlowing(false)
      setBufferProgress(0)

      el.src = currentUrl
      // reset time UI until metadata arrives
      setPositionSec(0)
      setDurationSec(0)

      // If we want to play, defer until canplay fires (source is ready)
      if (isPlaying) {
        pendingPlayOnReadyRef.current = true
      }
    } else if (isPlaying) {
      // Play regardless of pendingPlayOnReadyRef - if canplay already fired, we should play
      pendingPlayOnReadyRef.current = false
      el.play().catch((err) => {
        reportPlaybackIssue('play_rejected_sync', err)
        setNeedsUserGesture(true)
        setIsPlaying(false)
      })
    } else if (!isPlaying) {
      pendingPlayOnReadyRef.current = false
      el.pause()
    }
  }, [currentUrl, isPlaying, reportPlaybackIssue])

  // If we have a saved position for the current track, queue it up to apply
  // once metadata loads (duration known).
  useEffect(() => {
    const state = readPlayerState()
    if (state.trackId && currentTrackId && state.trackId === currentTrackId && Number.isFinite(state.positionSec || NaN)) {
      const v = Number(state.positionSec)
      pendingSeekSecRef.current = v > 0 ? v : null
      // keep UI roughly in sync even before metadata arrives
      if (v > 0) setPositionSec(v)
      return
    }
    pendingSeekSecRef.current = null
  }, [currentTrackId])

  // Save position when the page is going away (refresh, close, background).
  useEffect(() => {
    const saveNow = () => persistPosition({ force: true })
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return
      saveNow()
    }
    window.addEventListener('pagehide', saveNow)
    window.addEventListener('beforeunload', saveNow)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', saveNow)
      window.removeEventListener('beforeunload', saveNow)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [persistPosition])

  // If the browser/OS pauses audio (lock screen, route to background, interruption),
  // try to resume when we come back *if the user still wants music playing*.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    let lastAttemptTs = 0
    const tryResume = () => {
      if (!audioRef.current) return
      if (!isPlaying) return
      if (isActuallyPlaying) return
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastAttemptTs < 1500) return
      lastAttemptTs = now
      audioRef.current
        .play()
        .catch((err) => {
          reportPlaybackIssue('play_rejected_resume', err)
          // iOS Safari frequently blocks programmatic resume until a user gesture.
          // Fall back to an explicit prompt state instead of showing "playing" intent.
          setNeedsUserGesture(true)
          setIsPlaying(false)
        })
    }

    document.addEventListener('visibilitychange', tryResume)
    window.addEventListener('focus', tryResume)
    window.addEventListener('pageshow', tryResume)
    return () => {
      document.removeEventListener('visibilitychange', tryResume)
      window.removeEventListener('focus', tryResume)
      window.removeEventListener('pageshow', tryResume)
    }
  }, [isActuallyPlaying, isPlaying, reportPlaybackIssue])

  // Keep isPlayingRef in sync to avoid stale closures in event handlers
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])
  useEffect(() => {
    needsUserGestureRef.current = needsUserGesture
  }, [needsUserGesture])

  // "Please play music" reminder button: resume playback from a direct user gesture.
  useEffect(() => {
    const onReminderPlay = () => {
      const el = audioRef.current
      const track = currentTrackRef.current
      appendMusicControlLog({
        action: 'play',
        trackId: track?.id,
        trackTitle: track?.title,
      }).catch(() => {})
      setNeedsUserGesture(false)
      setIsPlaying(true)
      if (el) {
        el.play().catch((err) => {
          reportPlaybackIssue('play_rejected_reminder_button', err)
          setNeedsUserGesture(true)
          setIsPlaying(false)
        })
      }
    }
    window.addEventListener('traq:music-reminder-play', onReminderPlay as EventListener)
    return () => window.removeEventListener('traq:music-reminder-play', onReminderPlay as EventListener)
  }, [reportPlaybackIssue])

  // Keep refs in sync for heartbeat (to avoid recreating interval on every update)
  useEffect(() => {
    positionSecRef.current = positionSec
  }, [positionSec])
  useEffect(() => {
    durationSecRef.current = durationSec
  }, [durationSec])
  useEffect(() => {
    bufferProgressRef.current = bufferProgress
  }, [bufferProgress])
  useEffect(() => {
    isBufferingRef.current = isBuffering
  }, [isBuffering])
  useEffect(() => {
    isActuallyPlayingRef.current = isActuallyPlaying
  }, [isActuallyPlaying])
  useEffect(() => {
    isAudioFlowingRef.current = isAudioFlowing
  }, [isAudioFlowing])
  useEffect(() => {
    currentTrackRef.current = currentTrack
  }, [currentTrack])

  // Persist minimal state
  useEffect(() => {
    savePlayerState({ ...(currentTrackId ? { trackId: currentTrackId } : {}), isPlaying })
  }, [currentTrackId, isPlaying])

  const nextTrack = useCallback(() => {
    if (!queue.length) return
    // Mark transition to prevent watchdog false positives
    isTransitioningRef.current = true
    transitionStartTsRef.current = Date.now()
    const idx = currentIndex >= 0 ? currentIndex : 0
    const next = queue[(idx + 1) % queue.length]!
    savePlayerState({ trackId: next.id, positionSec: 0 })
    setCurrentTrackId(next.id)
    setIsPlaying(true)
  }, [currentIndex, queue])

  const prevTrack = useCallback(() => {
    if (!queue.length) return
    // Mark transition to prevent watchdog false positives
    isTransitioningRef.current = true
    transitionStartTsRef.current = Date.now()
    const idx = currentIndex >= 0 ? currentIndex : 0
    const next = queue[(idx - 1 + queue.length) % queue.length]!
    savePlayerState({ trackId: next.id, positionSec: 0 })
    setCurrentTrackId(next.id)
    setIsPlaying(true)
  }, [currentIndex, queue])

  // Stall recovery: if the audio gets stuck buffering (no timeupdate for a while),
  // do a limited number of gentle recovery attempts.
  useEffect(() => {
    const TICK_MS = 2500
    const STALL_RECOVERY_AFTER_MS = 15_000
    const MIN_BETWEEN_ATTEMPTS_MS = 15_000
    const MAX_RECOVERY_ATTEMPTS = 3
    const MAX_TRANSITION_MS = 25_000

    const id = window.setInterval(() => {
      const el = audioRef.current
      if (!el) return
      if (!isPlayingRef.current) return
      if (needsUserGestureRef.current) return
      if (document.visibilityState !== 'visible') return
      if (isTransitioningRef.current) {
        const start = transitionStartTsRef.current || 0
        const now = Date.now()
        // If we get "stuck" during a source change (canplay never fires), don't block recovery forever.
        if (start && now - start > MAX_TRANSITION_MS) {
          console.log('[MusicPlayer] Transition appears stuck; clearing transition state to allow recovery')
          isTransitioningRef.current = false
          // Treat this as a stall start so the recovery window starts counting from now.
          if (!stallStartTsRef.current) stallStartTsRef.current = now
        } else {
          return
        }
      }
      if (stallRecoveryInFlightRef.current) return
      if (isOfflineRef.current) return
      try {
        if (typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false) return
      } catch {
        // ignore
      }

      // Only attempt recovery if we are not flowing and we've been in a stall for long enough.
      if (isAudioFlowingRef.current) {
        // Reset stall state once audio is flowing again.
        stallStartTsRef.current = 0
        stallRecoveryCountRef.current = 0
        return
      }

      const stallStart = stallStartTsRef.current
      if (!stallStart) return

      const now = Date.now()
      if (now - stallStart < STALL_RECOVERY_AFTER_MS) return
      if (lastStallRecoveryAttemptTsRef.current && now - lastStallRecoveryAttemptTsRef.current < MIN_BETWEEN_ATTEMPTS_MS) return

      const attempt = stallRecoveryCountRef.current + 1
      if (attempt > MAX_RECOVERY_ATTEMPTS) {
        // Too many attempts: skip to next track rather than buffering forever.
        reportPlaybackIssue('stall_recovery_exhausted_skip', undefined, { attempt, max: MAX_RECOVERY_ATTEMPTS })
        console.log('[MusicPlayer] Stall recovery exhausted, skipping track')
        stallStartTsRef.current = 0
        stallRecoveryCountRef.current = 0
        isTransitioningRef.current = true
        transitionStartTsRef.current = Date.now()
        nextTrack()
        return
      }

      stallRecoveryInFlightRef.current = true
      lastStallRecoveryAttemptTsRef.current = now
      stallRecoveryCountRef.current = attempt

      const pos = Number(el.currentTime || 0)
      const safePos = Number.isFinite(pos) && pos > 0 ? pos : 0
      const track = currentTrackRef.current

      console.log(`[MusicPlayer] Stall detected, attempting recovery ${attempt}/${MAX_RECOVERY_ATTEMPTS}`, {
        trackId: track?.id,
        readyState: el.readyState,
        networkState: el.networkState,
        currentTime: safePos,
      })

      const finish = () => {
        stallRecoveryInFlightRef.current = false
      }

      // Attempt 1: reload the existing src (cheapest, least disruptive).
      if (attempt === 1) {
        try {
          el.load()
          if (safePos > 0) {
            try {
              el.currentTime = safePos
            } catch {
              // ignore
            }
          }
          el.play().catch((err) => {
            reportPlaybackIssue('play_rejected_stall_recovery_reload', err, { attempt })
            // If programmatic play is blocked, UI will prompt.
            setNeedsUserGesture(true)
            setIsPlaying(false)
          })
        } finally {
          finish()
        }
        return
      }

      // Attempt 2/3: fetch a fresh download URL and swap source (helps when connections/tokens go bad).
      ;(async () => {
        try {
          if (!track?.storagePath) {
            // Fallback: no track info, just reload.
            el.load()
            if (safePos > 0) {
              try {
                el.currentTime = safePos
              } catch {
                // ignore
              }
            }
            await el.play()
            return
          }

          const freshUrl = await getDownloadURL(storageRef(storage, track.storagePath))
          setCachedUrl(track.id, freshUrl)

          const prevSrc = el.src
          el.src = freshUrl
          el.load()
          if (safePos > 0) {
            try {
              el.currentTime = safePos
            } catch {
              // ignore
            }
          }
          try {
            await el.play()
          } catch (err) {
            reportPlaybackIssue('play_rejected_stall_recovery_source_swap', err, { attempt })
            // If playback was blocked, keep the user prompt behavior consistent.
            setNeedsUserGesture(true)
            setIsPlaying(false)
          }

          console.log('[MusicPlayer] Stall recovery source swap complete', {
            prevSrc,
            nextSrc: freshUrl,
            currentTime: safePos,
          })
        } catch (err) {
          console.log('[MusicPlayer] Stall recovery failed', err)
        } finally {
          finish()
        }
      })()
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [nextTrack, reportPlaybackIssue])

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (isActuallyPlaying) {
      appendMusicControlLog({
        action: 'pause',
        trackId: currentTrack?.id,
        trackTitle: currentTrack?.title,
      }).catch(() => {})
      setNeedsUserGesture(false)
      setIsPlaying(false)
      if (el) el.pause()
      return
    }
    appendMusicControlLog({
      action: 'play',
      trackId: currentTrack?.id,
      trackTitle: currentTrack?.title,
    }).catch(() => {})
    setNeedsUserGesture(false)
    setIsPlaying(true)
    if (el) {
      el.play().catch((err) => {
        reportPlaybackIssue('play_rejected_user_toggle', err)
        setNeedsUserGesture(true)
        setIsPlaying(false)
      })
    }
  }, [currentTrack?.id, currentTrack?.title, isActuallyPlaying, reportPlaybackIssue])

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  const pillPrompt = needsUserGesture ? 'Tap to resume music' : 'Tap to play music'
  const isIdle = !isPlaying && queue.length > 0
  const bufferText = bufferProgress > 0 && bufferProgress < 100 
    ? `Buffering ${bufferProgress}%` 
    : 'Buffering…'
  const title = isIdle
    ? pillPrompt
    : isBuffering
      ? bufferText
      : currentTrack?.title || (queue.length ? 'Loading…' : 'No music uploaded')

  useEffect(() => {
    const primaryLine = currentTrack?.title || (queue.length ? 'Loading…' : 'No music uploaded')
    let statusLine: string | null = null
    if (isBuffering) {
      statusLine = bufferText
    } else if (isIdle) {
      statusLine = pillPrompt
    }
    reportMusicScreensaverUi({ primaryLine, statusLine })
  }, [
    bufferText,
    currentTrack?.title,
    isBuffering,
    isIdle,
    pillPrompt,
    queue.length,
  ])

  const playbackPct = useMemo(() => {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
    const pct = (Math.max(0, positionSec) / durationSec) * 100
    return Math.max(0, Math.min(100, pct))
  }, [durationSec, positionSec])

  const measureMarquee = useCallback(() => {
    const outer = titleOuterRef.current
    const inner = titleInnerRef.current
    if (!outer || !inner) return
    if (prefersReducedMotionRef.current) {
      setMarquee((prev) => (prev.enabled ? { enabled: false, distancePx: 0, durationSec: 0 } : prev))
      return
    }

    const dist = Math.max(0, Math.round(inner.scrollWidth - outer.clientWidth))
    if (dist <= 8) {
      setMarquee((prev) => (prev.enabled ? { enabled: false, distancePx: 0, durationSec: 0 } : prev))
      return
    }
    const duration = Math.min(18, Math.max(7, dist / 35))
    setMarquee({ enabled: true, distancePx: dist, durationSec: duration })
  }, [])

  useEffect(() => {
    const outer = titleOuterRef.current
    if (!outer) return

    const rafMeasure = () => window.requestAnimationFrame(() => measureMarquee())

    // prefers-reduced-motion
    let mq: MediaQueryList | null = null
    const onMq = () => {
      prefersReducedMotionRef.current = !!mq?.matches
      rafMeasure()
    }
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      prefersReducedMotionRef.current = !!mq.matches
      if ('addEventListener' in mq) mq.addEventListener('change', onMq)
      else (mq as any).addListener(onMq)
    } catch {
      // ignore
    }

    // Resize observation (container size changes on iPad rotation/layout changes)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => rafMeasure())
      ro.observe(outer)
    } else {
      window.addEventListener('resize', rafMeasure)
    }

    rafMeasure()
    return () => {
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', rafMeasure)
      if (mq) {
        try {
          if ('removeEventListener' in mq) mq.removeEventListener('change', onMq)
          else (mq as any).removeListener(onMq)
        } catch {
          // ignore
        }
      }
    }
  }, [measureMarquee])

  useEffect(() => {
    // Re-measure when the rendered title string changes.
    window.requestAnimationFrame(() => measureMarquee())
  }, [measureMarquee, title])

  const tryPlayFromGesture = useCallback(() => {
    const el = audioRef.current
    appendMusicControlLog({
      action: 'play',
      trackId: currentTrack?.id,
      trackTitle: currentTrack?.title,
    }).catch(() => {})
    setNeedsUserGesture(false)
    setIsPlaying(true)
    if (el) {
      el.play().catch((err) => {
        reportPlaybackIssue('play_rejected_user_gesture', err)
        setNeedsUserGesture(true)
        setIsPlaying(false)
      })
    }
  }, [currentTrack?.id, currentTrack?.title, reportPlaybackIssue])

  const nextTrackUser = useCallback(() => {
    if (!queue.length) return
    const idx = currentIndex >= 0 ? currentIndex : 0
    const target = queue[(idx + 1) % queue.length]!
    appendMusicControlLog({
      action: 'next',
      trackId: target.id,
      trackTitle: target.title,
    }).catch(() => {})
    nextTrack()
  }, [currentIndex, nextTrack, queue])

  const prevTrackUser = useCallback(() => {
    if (!queue.length) return
    const idx = currentIndex >= 0 ? currentIndex : 0
    const target = queue[(idx - 1 + queue.length) % queue.length]!
    appendMusicControlLog({
      action: 'prev',
      trackId: target.id,
      trackTitle: target.title,
    }).catch(() => {})
    prevTrack()
  }, [currentIndex, prevTrack, queue])

  // Only show the expanded UI while actively playing.
  useEffect(() => {
    if (!isActuallyPlaying && expanded) setExpanded(false)
  }, [expanded, isActuallyPlaying])

  // Track buffering state: user wants to play, but audio isn't flowing yet
  // OR audio element explicitly reported 'waiting' (buffering mid-stream)
  // Note: We also manually set isBuffering during the 3-second buffer delay in onCanPlay
  useEffect(() => {
    // Don't override buffering state if we're in the deliberate buffer delay phase
    if (isBufferDelayActiveRef.current) return
    // Buffering is specifically "user wants play, but time isn't flowing".
    const buffering = isPlaying && !needsUserGesture && !isAudioFlowing
    setIsBuffering(buffering)
  }, [isPlaying, isActuallyPlaying, isAudioFlowing, needsUserGesture])

  // Flow detector: if we haven't seen a timeupdate in a while while "playing",
  // consider audio not flowing (stalled/buffering) even if 'play' fired.
  useEffect(() => {
    // Clear any prior interval
    if (flowTickIntervalRef.current) {
      window.clearInterval(flowTickIntervalRef.current)
      flowTickIntervalRef.current = null
    }

    const TICK_MS = 1000
    const FLOW_TIMEOUT_MS = 3500

    flowTickIntervalRef.current = window.setInterval(() => {
      const el = audioRef.current
      if (!el) return
      if (!isPlayingRef.current) return
      if (document.visibilityState !== 'visible') return
      if (isBufferDelayActiveRef.current) return

      const now = Date.now()
      const lastTs = lastTimeUpdateTsRef.current

      // If time updates are recent, we're flowing.
      if (lastTs && now - lastTs <= FLOW_TIMEOUT_MS) {
        if (!isAudioFlowingRef.current) {
          setIsAudioFlowing(true)
        }
        // If flow is confirmed, treat as actually playing.
        if (!isActuallyPlayingRef.current) {
          setIsActuallyPlaying(true)
          savePlaybackState(true)
        }
        // Clear any stall markers once flow returns.
        if (stallStartTsRef.current) stallStartTsRef.current = 0
        return
      }

      // No timeupdate recently: not flowing.
      if (isAudioFlowingRef.current) setIsAudioFlowing(false)
      // If we are not flowing, we should not claim "actually playing".
      if (isActuallyPlayingRef.current) {
        setIsActuallyPlaying(false)
        savePlaybackState(false)
      }
      // Some browsers don't fire 'waiting'/'stalled' reliably. If we've lost flow while
      // "playing", treat this as a stall start so the recovery loop can kick in.
      if (!stallStartTsRef.current) {
        stallStartTsRef.current = now
      }
    }, TICK_MS)

    return () => {
      if (flowTickIntervalRef.current) {
        window.clearInterval(flowTickIntervalRef.current)
        flowTickIntervalRef.current = null
      }
    }
  }, [])

  // Network handling: avoid thrashing recovery while offline; attempt resume on reconnect.
  useEffect(() => {
    const onOnline = () => {
      isOfflineRef.current = false
      if (!isPlayingRef.current) return
      if (document.visibilityState !== 'visible') return
      // Mark a stall start so the recovery loop can help if the media pipeline doesn't recover automatically.
      if (!stallStartTsRef.current) stallStartTsRef.current = Date.now()
      const el = audioRef.current
      if (!el) return
      el.play().catch((err) => {
        reportPlaybackIssue('play_rejected_online', err)
        // If play is blocked, UI will prompt.
        setNeedsUserGesture(true)
        setIsPlaying(false)
      })
    }
    const onOffline = () => {
      isOfflineRef.current = true
      // Treat as non-flowing to reflect buffering state.
      setIsAudioFlowing(false)
      if (!stallStartTsRef.current) stallStartTsRef.current = Date.now()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    // Initialize
    try {
      isOfflineRef.current = typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine === false : false
    } catch {
      isOfflineRef.current = false
    }
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [reportPlaybackIssue])

  // Watchdog: if the <audio> reports "playing" but time doesn't advance for a LONG while,
  // prompt user to tap to resume. We don't do automatic recovery anymore as it can cause skipping.
  useEffect(() => {
    if (!isPlaying) return
    // Only trigger after a very long stall (5 minutes) - this is just a safety net
    const STALL_MS = 300_000 // 5 minutes
    // Initial grace period after onPlay fires
    const INITIAL_GRACE_MS = 300_000 // 5 minutes

    const id = window.setInterval(() => {
      if (!isPlayingRef.current) return
      if (!isActuallyPlayingRef.current) return
      if (document.visibilityState !== 'visible') return
      const el = audioRef.current
      if (!el) return

      const now = Date.now()

      // If we're transitioning between tracks, skip check entirely
      if (isTransitioningRef.current) return

      const lastTs = lastTimeUpdateTsRef.current
      const lastPos = lastTimeUpdatePosRef.current
      const playStartTs = playStartTsRef.current

      // If currentTime is advancing, everything is fine
      if (Number.isFinite(el.currentTime) && Number.isFinite(lastPos) && el.currentTime > lastPos + 0.5) {
        lastTimeUpdatePosRef.current = el.currentTime
        lastTimeUpdateTsRef.current = now
        return
      }

      // Check if truly stalled for a long time
      if (!lastTs || lastTs === playStartTs) {
        // Still waiting for first timeupdate
        if (playStartTs && now - playStartTs < INITIAL_GRACE_MS) return
      } else {
        // Had timeupdates before - check if stalled for very long
        if (now - lastTs < STALL_MS) return
      }

      // Truly stalled for 5+ minutes - just prompt user, don't try to recover automatically
      console.log(`[MusicPlayer] Playback appears stalled for 5+ minutes, prompting user`)
      reportPlaybackIssue('watchdog_stall_prompted_stop')
      setNeedsUserGesture(true)
      setIsActuallyPlaying(false)
      savePlaybackState(false)
      setIsPlaying(false)
      persistPosition({ force: true })
    }, 30_000) // Check every 30 seconds (much less aggressive)
    return () => window.clearInterval(id)
  }, [isPlaying, persistPosition, reportPlaybackIssue])

  // Session heartbeat: report state to Firestore every 5 seconds for remote control
  // Uses refs for frequently-changing values to avoid recreating the interval constantly
  useEffect(() => {
    const HEARTBEAT_INTERVAL_MS = 5000
    const sendHeartbeat = () => {
      const track = currentTrackRef.current
      const recoverySinceAt =
        stallStartTsRef.current && stallRecoveryCountRef.current > 0
          ? new Date(stallStartTsRef.current).toISOString()
          : undefined
      const isRecovering = !!(stallRecoveryCountRef.current > 0 && !isAudioFlowingRef.current && isPlayingRef.current)
      updateMusicSession(sessionIdRef.current, {
        deviceInfo: deviceInfoRef.current,
        lastSeenAt: new Date().toISOString(),
        isPlaying: isPlayingRef.current,
        isActuallyPlaying: isActuallyPlayingRef.current,
        isAudioFlowing: isAudioFlowingRef.current,
        isBuffering: isBufferingRef.current,
        currentTrackId: track?.id || null,
        currentTrackTitle: track?.title || null,
        positionSec: positionSecRef.current,
        durationSec: durationSecRef.current,
        bufferProgress: bufferProgressRef.current,
        isRecovering,
        recoveryAttempt: stallRecoveryCountRef.current,
        recoverySinceAt,
      }).catch(() => {})
    }
    // Send initial heartbeat
    sendHeartbeat()
    // Then send every 5 seconds
    const id = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, []) // No dependencies - uses refs to always get current values

  // Listen for remote commands from admin
  useEffect(() => {
    const unsubscribe = subscribeToSessionCommands(sessionIdRef.current, (command) => {
      if (!command) return
      // Prevent executing the same command twice
      if (command.issuedAt === lastCommandIssuedAtRef.current) return
      lastCommandIssuedAtRef.current = command.issuedAt

      console.log(`[MusicPlayer] Remote command received: ${command.action}`, command.payload || '')

      const el = audioRef.current

      switch (command.action) {
        case 'play':
          setNeedsUserGesture(false)
          setIsPlaying(true)
          if (el) {
            el.play().catch((err) => {
              console.log(`[MusicPlayer] Remote play failed:`, err.message || err)
              reportPlaybackIssue('play_rejected_remote', err)
              setNeedsUserGesture(true)
              setIsPlaying(false)
              // Report failure to session state so admin can see
              updateMusicSession(sessionIdRef.current, {
                lastCommandResult: 'needs_gesture',
                lastCommandAction: 'play',
              }).catch(() => {})
            })
          }
          break
        case 'pause':
          setNeedsUserGesture(false)
          setIsPlaying(false)
          if (el) el.pause()
          console.log(`[MusicPlayer] Remote pause executed`)
          break
        case 'next':
          if (queue.length > 0) {
            isTransitioningRef.current = true
            transitionStartTsRef.current = Date.now()
            const idx = currentIndex >= 0 ? currentIndex : 0
            const next = queue[(idx + 1) % queue.length]!
            savePlayerState({ trackId: next.id, positionSec: 0 })
            setCurrentTrackId(next.id)
            setIsPlaying(true)
            console.log(`[MusicPlayer] Remote next executed: ${next.title}`)
          }
          break
        case 'prev':
          if (queue.length > 0) {
            isTransitioningRef.current = true
            transitionStartTsRef.current = Date.now()
            const idx = currentIndex >= 0 ? currentIndex : 0
            const prev = queue[(idx - 1 + queue.length) % queue.length]!
            savePlayerState({ trackId: prev.id, positionSec: 0 })
            setCurrentTrackId(prev.id)
            setIsPlaying(true)
            console.log(`[MusicPlayer] Remote prev executed: ${prev.title}`)
          }
          break
        case 'seek':
          if (el && command.payload?.positionSec !== undefined) {
            const seekTo = command.payload.positionSec
            el.currentTime = seekTo
            setPositionSec(seekTo)
            persistPosition({ force: true })
            console.log(`[MusicPlayer] Remote seek executed: ${seekTo}s`)
          }
          break
      }
      // Clear the command after execution
      clearSessionCommand(sessionIdRef.current).catch(() => {})
    })
    return () => unsubscribe()
  }, [currentIndex, queue, persistPosition, reportPlaybackIssue])

  // REST-backed command queue (admin remote control that does not rely on Firestore SDK listeners).
  // This is intentionally additive; it does not change playback behavior, only how commands arrive.
  useEffect(() => {
    const sessionId = sessionIdRef.current
    const TICK_MS = 2000
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      if (queuedCommandInFlightRef.current) return
      // Avoid background thrash; admin control is primarily for active sessions.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

      queuedCommandInFlightRef.current = true
      try {
        const cmds = await listMusicSessionCommandsREST(sessionId, 25)
        const pending = cmds
          .filter((c) => c.status === 'pending')
          .sort((a, b) => (a.issuedAtMs || 0) - (b.issuedAtMs || 0))
        const next = pending[0]
        if (!next || !next.id) return
        if (next.id === lastHandledQueuedCommandIdRef.current) return
        lastHandledQueuedCommandIdRef.current = next.id

        const handledAtMs = Date.now()
        const handledAt = new Date(handledAtMs).toISOString()

        const el = audioRef.current
        let status: 'done' | 'failed' | 'needs_gesture' = 'done'
        let resultDetail = ''

        const finish = async () => {
          await patchMusicSessionCommandREST(sessionId, next.id, {
            status,
            handledAtMs,
            handledAt,
            resultDetail: resultDetail || undefined,
          })
        }

        try {
          switch (next.action) {
            case 'play': {
              setNeedsUserGesture(false)
              setIsPlaying(true)
              if (el) {
                try {
                  await el.play()
                } catch (err) {
                  reportPlaybackIssue('play_rejected_queued_command', err)
                  status = 'needs_gesture'
                  resultDetail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
                  setNeedsUserGesture(true)
                  setIsPlaying(false)
                }
              }
              break
            }
            case 'pause': {
              setNeedsUserGesture(false)
              setIsPlaying(false)
              if (el) el.pause()
              break
            }
            case 'next': {
              // Mirror existing remote behavior (transition guard + keep playing intent)
              if (queue.length > 0) {
                isTransitioningRef.current = true
                transitionStartTsRef.current = Date.now()
                const idx = currentIndex >= 0 ? currentIndex : 0
                const nxt = queue[(idx + 1) % queue.length]!
                savePlayerState({ trackId: nxt.id, positionSec: 0 })
                setCurrentTrackId(nxt.id)
                setIsPlaying(true)
              }
              break
            }
            case 'prev': {
              if (queue.length > 0) {
                isTransitioningRef.current = true
                transitionStartTsRef.current = Date.now()
                const idx = currentIndex >= 0 ? currentIndex : 0
                const prv = queue[(idx - 1 + queue.length) % queue.length]!
                savePlayerState({ trackId: prv.id, positionSec: 0 })
                setCurrentTrackId(prv.id)
                setIsPlaying(true)
              }
              break
            }
            case 'seek': {
              if (el && next.payload?.positionSec !== undefined) {
                const seekTo = Number(next.payload.positionSec)
                if (Number.isFinite(seekTo)) {
                  el.currentTime = seekTo
                  setPositionSec(seekTo)
                  persistPosition({ force: true })
                }
              }
              break
            }
          }
        } catch (err) {
          status = 'failed'
          resultDetail = err instanceof Error ? err.message : String(err)
        } finally {
          await finish()
        }
      } finally {
        queuedCommandInFlightRef.current = false
      }
    }

    // Kick once immediately so admin control feels responsive.
    tick().catch(() => {})
    const id = window.setInterval(() => tick().catch(() => {}), TICK_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [currentIndex, persistPosition, queue, reportPlaybackIssue])

  return (
    <>
      <div
        className={`header-player ${expanded ? 'expanded' : ''}`}
        onTouchStart={(e) => {
          recordTouch()
          e.stopPropagation()
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {expanded && isActuallyPlaying && (
          <div
            className="player-backdrop"
            aria-hidden
            onTouchStart={(e) => {
              recordTouch()
              // Don't stop propagation; this is the outside click target.
              e.preventDefault()
            }}
            onTouchEnd={(e) => {
              recordTouch()
              e.preventDefault()
              setExpanded(false)
            }}
            onClick={() => {
              if (shouldIgnoreClick()) return
              setExpanded(false)
            }}
          />
        )}
        <button
          className={`player-pill ${isIdle ? 'player-idle-pulse' : ''} ${isBuffering ? 'player-buffering' : ''}`}
          aria-label="Music player"
          aria-expanded={expanded}
          style={
            {
              ['--playback-pct' as any]: `${playbackPct}%`,
            } as CSSProperties
          }
          onTouchStart={(e) => {
            recordTouch()
            e.stopPropagation()
          }}
          onTouchEnd={(e) => {
            recordTouch()
            e.stopPropagation()
            if (isIdle) {
              tryPlayFromGesture()
              return
            }
            toggleExpanded()
          }}
          onClick={() => {
            if (shouldIgnoreClick()) return
            if (isIdle) {
              tryPlayFromGesture()
              return
            }
            toggleExpanded()
          }}
        >
          <span
            className={`player-pill-title ${marquee.enabled ? 'marquee' : ''}`}
            aria-label="Track title"
            ref={titleOuterRef}
            style={
              marquee.enabled
                ? ({
                    ['--marquee-distance' as any]: `${marquee.distancePx}px`,
                    ['--marquee-duration' as any]: `${marquee.durationSec}s`,
                  } as CSSProperties)
                : undefined
            }
          >
            <span className="player-pill-title-inner" ref={titleInnerRef}>
              {title}
            </span>
          </span>
          <span className="player-pill-controls" aria-hidden>
            <span className={`player-pill-icon ${isBuffering ? 'player-icon-buffering' : ''}`}>
              {isBuffering ? '◌' : isAudioFlowing ? '🔊' : '▶'}
            </span>
          </span>
        </button>

        {expanded && isActuallyPlaying && (
          <div
            className="player-expanded-card"
            onTouchStart={(e) => {
              recordTouch()
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="player-expanded-top">
              <div className="player-expanded-title">{currentTrack?.title || title}</div>
              <button
                className="player-collapse"
                aria-label="Collapse player"
                onTouchStart={(e) => {
                  recordTouch()
                  e.stopPropagation()
                }}
                onTouchEnd={(e) => {
                  recordTouch()
                  e.stopPropagation()
                  setExpanded(false)
                }}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setExpanded(false)
                }}
              >
                ✕
              </button>
            </div>

            <div className="player-expanded-controls">
              <button
                className="player-ctl"
                aria-label="Previous track"
                onTouchStart={(e) => {
                  recordTouch()
                  e.stopPropagation()
                }}
                onTouchEnd={(e) => {
                  recordTouch()
                  e.stopPropagation()
                  prevTrackUser()
                }}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  prevTrackUser()
                }}
              >
                ⏮
              </button>
              <button
                className="player-ctl player-ctl-primary"
                aria-label={isAudioFlowing ? 'Pause' : 'Play'}
                onTouchStart={(e) => {
                  recordTouch()
                  e.stopPropagation()
                }}
                onTouchEnd={(e) => {
                  recordTouch()
                  e.stopPropagation()
                  togglePlay()
                }}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  togglePlay()
                }}
              >
                {isAudioFlowing ? '⏸' : '▶'}
              </button>
              <button
                className="player-ctl"
                aria-label="Next track"
                onTouchStart={(e) => {
                  recordTouch()
                  e.stopPropagation()
                }}
                onTouchEnd={(e) => {
                  recordTouch()
                  e.stopPropagation()
                  nextTrackUser()
                }}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  nextTrackUser()
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
                  const el = audioRef.current
                  if (el) el.currentTime = v
                  persistPosition({ force: true })
                }}
              />
              <div className="player-scrub-meta" aria-hidden>
                <span>{formatTime(positionSec)}</span>
                <span>{formatTime(durationSec)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Hidden audio element for preloading next track */}
        <audio
          ref={preloadAudioRef}
          preload="auto"
          muted
          style={{ display: 'none' }}
          aria-hidden="true"
        />
        <audio
          ref={audioRef}
          preload="auto"
          onTimeUpdate={(e) => {
            const el = e.currentTarget
            if (!Number.isFinite(el.currentTime)) return
            const now = Date.now()
            // Clear stall state if time is advancing (strong signal that buffering is over).
            stallStartTsRef.current = 0
            stallRecoveryCountRef.current = 0
            // Always update refs (for heartbeat and watchdog)
            lastTimeUpdateTsRef.current = now
            lastTimeUpdatePosRef.current = el.currentTime
            positionSecRef.current = el.currentTime
            // Seeing time advance is the strongest signal that audio is truly flowing.
            if (!isAudioFlowingRef.current) setIsAudioFlowing(true)
            // Throttle state updates to reduce re-renders (every 250ms is enough for smooth UI)
            if (now - lastPositionUpdateTsRef.current >= 250) {
              lastPositionUpdateTsRef.current = now
              setPositionSec(el.currentTime)
              // Best-effort periodic persistence while playing.
              if (isActuallyPlayingRef.current) persistPosition()
            }
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            if (!Number.isFinite(el.duration)) return
            setDurationSec(el.duration)
            const desired = pendingSeekSecRef.current
            if (desired === null) return
            if (!Number.isFinite(desired)) return
            const d = el.duration
            // Clamp to avoid seeking beyond end (can instantly end the track).
            const clamped = Math.max(0, Math.min(desired, Math.max(0, d - 0.25)))
            try {
              el.currentTime = clamped
            } catch {
              // ignore (some browsers may throw if not seekable yet)
            }
            setPositionSec(clamped)
            pendingSeekSecRef.current = null
          }}
          onCanPlay={() => {
            // Source is ready to play - clear transition state
            isTransitioningRef.current = false
            // If we were waiting to play, buffer for 3 seconds first then play
            if (pendingPlayOnReadyRef.current && isPlayingRef.current) {
              pendingPlayOnReadyRef.current = false
              const el = audioRef.current
              if (el) {
                const BUFFER_DELAY_MS = 3000 // 3 second buffer delay
                const MAX_RETRIES = 5
                const RETRY_DELAY_MS = 2000
                
                // Clear any existing buffer delay
                if (bufferDelayTimeoutRef.current) {
                  window.clearTimeout(bufferDelayTimeoutRef.current)
                }
                
                // Mark that we're in buffer delay phase
                isBufferDelayActiveRef.current = true
                setIsBuffering(true) // Show buffering UI during delay
                console.log('[MusicPlayer] Buffering for 3 seconds before playback...')
                
                const attemptPlay = () => {
                  if (!isPlayingRef.current) {
                    isBufferDelayActiveRef.current = false
                    return // User paused while we were buffering/retrying
                  }
                  el.play().catch((err) => {
                    playRetryCountRef.current++
                    if (playRetryCountRef.current < MAX_RETRIES) {
                      // Retry after a delay
                      playRetryTimeoutRef.current = window.setTimeout(attemptPlay, RETRY_DELAY_MS)
                    } else {
                      // Max retries reached, give up
                      reportPlaybackIssue('play_rejected_buffer_delay_max_retries', err, { maxRetries: MAX_RETRIES })
                      isBufferDelayActiveRef.current = false
                      setNeedsUserGesture(true)
                      setIsPlaying(false)
                      playRetryCountRef.current = 0
                    }
                  })
                }
                
                // Wait 3 seconds to buffer, then start playback
                bufferDelayTimeoutRef.current = window.setTimeout(() => {
                  isBufferDelayActiveRef.current = false
                  if (!isPlayingRef.current) return // User paused during buffer delay
                  console.log('[MusicPlayer] Buffer delay complete, starting playback')
                  attemptPlay()
                }, BUFFER_DELAY_MS)
              }
            }
          }}
          onProgress={() => {
            // Track when we last received buffer data
            lastProgressTsRef.current = Date.now()
            // Calculate buffer progress percentage
            const el = audioRef.current
            if (el && el.buffered.length > 0 && el.duration > 0) {
              // Get the buffered range that includes current position
              const currentTime = el.currentTime || 0
              let bufferedEnd = 0
              for (let i = 0; i < el.buffered.length; i++) {
                if (el.buffered.start(i) <= currentTime && el.buffered.end(i) >= currentTime) {
                  bufferedEnd = el.buffered.end(i)
                  break
                }
                // If we haven't started playing yet, use the first buffered range
                if (i === 0) {
                  bufferedEnd = el.buffered.end(i)
                }
              }
              // Calculate percentage of duration that's buffered from current position
              const pct = Math.min(100, Math.round((bufferedEnd / el.duration) * 100))
              setBufferProgress(pct)
            }
          }}
          onWaiting={() => {
            // Audio element is buffering (waiting for data)
            setIsAudioFlowing(false)
            if (!stallStartTsRef.current) stallStartTsRef.current = Date.now()
          }}
          onStalled={() => {
            // Network stall. Avoid "nudge seeking" (setting currentTime) because it can cause
            // audible micro-jumps / “CD skipping” on some browsers. Just mark progress time and
            // let the browser’s media pipeline recover naturally.
            const el = audioRef.current
            if (!el || !isPlayingRef.current) return
            console.log('[MusicPlayer] Network stall detected')
            // Update progress timestamp to prevent immediate watchdog trigger
            lastProgressTsRef.current = Date.now()
            setIsAudioFlowing(false)
            if (!stallStartTsRef.current) stallStartTsRef.current = Date.now()
          }}
          onPlaying={() => {
            // Audio is actually producing output now (not just 'play' intent)
            setIsAudioFlowing(true)
            // Reset stall recovery when playback resumes.
            stallStartTsRef.current = 0
            stallRecoveryCountRef.current = 0
            playRetryCountRef.current = 0 // Reset retry counter on successful playback
            // Clear any prior "needs gesture" result once playback actually flows again.
            updateMusicSession(sessionIdRef.current, {
              lastCommandResult: 'success',
              lastCommandAction: 'play',
            }).catch(() => {})
          }}
          onPlay={() => {
            // 'play' can fire before time actually advances; don't claim "actually playing" here.
            setNeedsUserGesture(false)
            // Clear transition state on successful play
            isTransitioningRef.current = false
            pendingPlayOnReadyRef.current = false
            playRetryCountRef.current = 0 // Reset retry counter
            // Seed watchdog timers on play - track when play started for initial grace
            const now = Date.now()
            playStartTsRef.current = now
            lastTimeUpdateTsRef.current = now
            lastTimeUpdatePosRef.current = audioRef.current?.currentTime || 0
          }}
          onPause={() => {
            setIsActuallyPlaying(false)
            setIsAudioFlowing(false)
            savePlaybackState(false)
            persistPosition({ force: true })
            // Clear any stall/recovery state while paused.
            stallStartTsRef.current = 0
            stallRecoveryCountRef.current = 0
            // Clear buffer delay if user paused during it
            if (bufferDelayTimeoutRef.current) {
              window.clearTimeout(bufferDelayTimeoutRef.current)
              bufferDelayTimeoutRef.current = null
            }
            isBufferDelayActiveRef.current = false
          }}
          onEnded={() => {
            // Reset error counter on successful track completion
            errorRetryCountRef.current = 0
            nextTrack()
          }}
          onError={(e) => {
            const el = e.currentTarget
            const MAX_ERROR_RETRIES = 3
            const ERROR_RETRY_DELAY_MS = 3000
            
            console.log(`[MusicPlayer] Audio error, attempt ${errorRetryCountRef.current + 1}/${MAX_ERROR_RETRIES}`)
            try {
              const mediaErr = el.error
              reportPlaybackIssue('audio_error', undefined, {
                attempt: errorRetryCountRef.current + 1,
                max: MAX_ERROR_RETRIES,
                mediaErrorCode: mediaErr ? mediaErr.code : undefined,
              })
            } catch {
              // ignore
            }
            
            // Clear any pending retry
            if (errorRetryTimeoutRef.current) {
              window.clearTimeout(errorRetryTimeoutRef.current)
              errorRetryTimeoutRef.current = null
            }
            
            if (errorRetryCountRef.current < MAX_ERROR_RETRIES) {
              errorRetryCountRef.current++
              
              // Try to recover by reloading the source
              errorRetryTimeoutRef.current = window.setTimeout(() => {
                if (!isPlayingRef.current) return // User paused
                
                const currentPos = el.currentTime || 0
                const currentSrc = el.src
                const track = currentTrackRef.current
                
                // Clear cache for this track to force fresh URL fetch
                if (track?.id) {
                  urlCache.delete(track.id)
                }
                
                // Try to get a fresh URL
                if (track?.storagePath) {
                  getDownloadURL(storageRef(storage, track.storagePath))
                    .then((freshUrl) => {
                      if (!isPlayingRef.current) return
                      if (track?.id) setCachedUrl(track.id, freshUrl)
                      el.src = freshUrl
                      el.load()
                      if (Number.isFinite(currentPos) && currentPos > 0) {
                        el.currentTime = currentPos
                      }
                      el.play().catch(() => {
                        // Play failed after reload, will trigger another error if needed
                      })
                    })
                    .catch(() => {
                      // URL fetch failed, try with existing src
                      if (currentSrc) {
                        el.load()
                        if (Number.isFinite(currentPos) && currentPos > 0) {
                          el.currentTime = currentPos
                        }
                        el.play().catch(() => {})
                      }
                    })
                } else if (currentSrc) {
                  // No storage path, just try reloading
                  el.load()
                  if (Number.isFinite(currentPos) && currentPos > 0) {
                    el.currentTime = currentPos
                  }
                  el.play().catch(() => {})
                }
              }, ERROR_RETRY_DELAY_MS)
            } else {
              // Max retries exhausted, skip to next track
              reportPlaybackIssue('audio_error_max_retries_skip', undefined, { max: MAX_ERROR_RETRIES })
              console.log(`[MusicPlayer] Max error retries exhausted, skipping track`)
              errorRetryCountRef.current = 0
              isTransitioningRef.current = true
              transitionStartTsRef.current = Date.now()
              nextTrack()
            }
          }}
        />
      </div>
    </>
  )
})


