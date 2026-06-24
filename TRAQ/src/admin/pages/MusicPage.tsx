import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './MusicPage.css'
import { storage } from '../../firebase'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import {
  subscribeToMusicTracks,
  upsertMusicTrack,
  deleteMusicTrack,
  subscribeToMusicPlaylist,
  saveMusicPlaylist,
  subscribeToLatestMusicSessions,
  sendSessionCommand,
  type MusicTrack,
  type MusicPlaylist,
  type MusicSession,
} from '../../services/music'
import {
  subscribeToAppUiSettings,
  setMusicProvider,
  type MusicProvider,
} from '../../services/appSettings'
import {
  buildSpotifyAuthorizeUrl,
  removeQueueItem,
  requestSpotifyDisconnect,
  sendSpotifyPlaybackCommand,
  submitSpotifyOAuthCode,
  subscribeToSpotifyConfig,
  subscribeToSpotifyQueue,
  subscribeToSpotifyStatus,
  updateSpotifyConfig,
  type SpotifyConfig,
  type SpotifyQueueItem,
  type SpotifyStatus,
} from '../../services/spotify'

export function MusicPage() {
  // Tracks and playlist
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [playlist, setPlaylist] = useState<MusicPlaylist>({ order: [] })
  const [sessions, setSessions] = useState<MusicSession[]>([])

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadEnabled, setUploadEnabled] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Inline editing
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Drag and drop
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Processing
  const [processing, setProcessing] = useState<string | null>(null)
  const [sendingCommand, setSendingCommand] = useState<string | null>(null)

  // ─── Spotify integration state ─────────────────────────────────────────
  const [musicProvider, setMusicProviderState] = useState<MusicProvider>('legacy')
  const [providerSwitching, setProviderSwitching] = useState(false)
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus>({ connected: false })
  const [spotifyConfig, setSpotifyConfig] = useState<SpotifyConfig | null>(null)
  const [spotifyQueue, setSpotifyQueue] = useState<SpotifyQueueItem[]>([])
  const [spotifyConnecting, setSpotifyConnecting] = useState(false)
  const [spotifyDisconnecting, setSpotifyDisconnecting] = useState(false)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [newPlaylistUri, setNewPlaylistUri] = useState('')
  const [skippingQueue, setSkippingQueue] = useState(false)

  // Subscribe to tracks
  useEffect(() => {
    const unsub = subscribeToMusicTracks((list) => {
      setTracks(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to playlist
  useEffect(() => {
    const unsub = subscribeToMusicPlaylist((p) => {
      setPlaylist(p)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to sessions
  useEffect(() => {
    const unsub = subscribeToLatestMusicSessions(10, (list) => {
      setSessions(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to app UI settings (musicProvider toggle).
  useEffect(() => {
    const unsub = subscribeToAppUiSettings((settings) => {
      setMusicProviderState(settings.musicProvider)
    })
    return () => unsub()
  }, [])

  // Subscribe to Spotify status / config / queue.
  useEffect(() => {
    const unsubStatus = subscribeToSpotifyStatus(setSpotifyStatus)
    const unsubConfig = subscribeToSpotifyConfig(setSpotifyConfig)
    const unsubQueue = subscribeToSpotifyQueue(setSpotifyQueue)
    return () => {
      unsubStatus()
      unsubConfig()
      unsubQueue()
    }
  }, [])

  // Handle Spotify OAuth redirect: when admin returns to /admin/music with
  // ?code=…&state=…, exchange the code via the Firestore-trigger function and
  // strip the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const stateParam = url.searchParams.get('state')
    const errParam = url.searchParams.get('error')
    if (errParam) {
      setSpotifyError(`Spotify authorization failed: ${errParam}`)
      url.searchParams.delete('error')
      url.searchParams.delete('state')
      window.history.replaceState({}, '', url.toString())
      return
    }
    if (!code) return

    const redirectUri = `${url.origin}${url.pathname}`
    setSpotifyConnecting(true)
    setSpotifyError(null)

    submitSpotifyOAuthCode({ code, redirectUri })
      .then(() => {
        setSpotifyError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to connect Spotify'
        setSpotifyError(msg)
      })
      .finally(() => {
        setSpotifyConnecting(false)
        url.searchParams.delete('code')
        url.searchParams.delete('state')
        window.history.replaceState({}, '', url.toString())
      })
    void stateParam
  }, [])

  // Sorted tracks by playlist order
  const sortedTracks = useMemo(() => {
    const order = playlist.order
    const sorted = [...tracks].sort((a, b) => {
      const aIdx = order.indexOf(a.id)
      const bIdx = order.indexOf(b.id)
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })
    return sorted
  }, [tracks, playlist.order])

  // Handle file select
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      // Auto-fill title from filename (without extension)
      const name = file.name.replace(/\.[^/.]+$/, '')
      setUploadTitle(name)
    }
  }, [])

  // Upload track
  const handleUpload = useCallback(async () => {
    if (!uploadFile || !uploadTitle.trim()) return
    if (!storage) {
      setUploadError('Storage not available')
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadError(null)

    try {
      const trackId = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const storagePath = `music/${trackId}.mp3`
      const ref = storageRef(storage, storagePath)
      const task = uploadBytesResumable(ref, uploadFile, {
        contentType: uploadFile.type || 'audio/mpeg',
      })

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            setUploadProgress(pct)
          },
          (err) => {
            reject(err)
          },
          async () => {
            try {
              await getDownloadURL(ref)
              const newTrack: MusicTrack = {
                id: trackId,
                title: uploadTitle.trim(),
                storagePath,
                enabled: uploadEnabled,
                originalFileName: uploadFile.name,
                contentType: uploadFile.type,
                bytes: uploadFile.size,
              }
              await upsertMusicTrack(newTrack)
              // Add to playlist
              await saveMusicPlaylist([...playlist.order, trackId])
              resolve()
            } catch (err) {
              reject(err)
            }
          }
        )
      })

      // Reset form
      setUploadFile(null)
      setUploadTitle('')
      setUploadEnabled(true)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [uploadFile, uploadTitle, uploadEnabled, playlist.order])

  // Toggle track enabled
  const handleToggleEnabled = useCallback(async (track: MusicTrack) => {
    setProcessing(track.id)
    try {
      await upsertMusicTrack({ ...track, enabled: !track.enabled })
    } catch (err) {
      console.error('Failed to toggle track:', err)
    } finally {
      setProcessing(null)
    }
  }, [])

  // Start editing title
  const startEditTitle = useCallback((track: MusicTrack) => {
    setEditingTrackId(track.id)
    setEditingTitle(track.title)
  }, [])

  // Save edited title
  const saveEditTitle = useCallback(async () => {
    if (!editingTrackId || !editingTitle.trim()) {
      setEditingTrackId(null)
      return
    }
    const track = tracks.find((t) => t.id === editingTrackId)
    if (!track || track.title === editingTitle.trim()) {
      setEditingTrackId(null)
      return
    }
    setProcessing(editingTrackId)
    try {
      await upsertMusicTrack({ ...track, title: editingTitle.trim() })
    } catch (err) {
      console.error('Failed to update title:', err)
    } finally {
      setProcessing(null)
      setEditingTrackId(null)
    }
  }, [editingTrackId, editingTitle, tracks])

  // Delete track
  const handleDeleteTrack = useCallback(async (track: MusicTrack) => {
    if (!confirm(`Delete "${track.title}"?`)) return
    setProcessing(track.id)
    try {
      await deleteMusicTrack(track.id)
      // Remove from playlist
      await saveMusicPlaylist(playlist.order.filter((id) => id !== track.id))
    } catch (err) {
      console.error('Failed to delete track:', err)
    } finally {
      setProcessing(null)
    }
  }, [playlist.order])

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      handleDragEnd()
      return
    }

    const newOrder = [...playlist.order]
    // If tracks aren't in playlist, build from sortedTracks
    if (newOrder.length === 0) {
      sortedTracks.forEach((t) => newOrder.push(t.id))
    }

    // Reorder
    const [moved] = newOrder.splice(dragIndex, 1)
    newOrder.splice(dropIndex, 0, moved)

    try {
      await saveMusicPlaylist(newOrder)
    } catch (err) {
      console.error('Failed to reorder:', err)
    }

    handleDragEnd()
  }, [dragIndex, playlist.order, sortedTracks, handleDragEnd])

  // Move track up/down (mobile fallback)
  const moveTrack = useCallback(async (index: number, direction: 'up' | 'down') => {
    const newOrder = playlist.order.length > 0
      ? [...playlist.order]
      : sortedTracks.map((t) => t.id)

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOrder.length) return

    const [moved] = newOrder.splice(index, 1)
    newOrder.splice(targetIndex, 0, moved)

    try {
      await saveMusicPlaylist(newOrder)
    } catch (err) {
      console.error('Failed to reorder:', err)
    }
  }, [playlist.order, sortedTracks])

  // ─── Spotify handlers ─────────────────────────────────────────────────
  const handleSwitchProvider = useCallback(async (next: MusicProvider) => {
    setProviderSwitching(true)
    try {
      await setMusicProvider(next)
    } catch (err) {
      console.error('Failed to switch music provider:', err)
    } finally {
      setProviderSwitching(false)
    }
  }, [])

  const handleConnectSpotify = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const redirectUri = `${url.origin}${url.pathname}`
    window.location.href = buildSpotifyAuthorizeUrl(redirectUri)
  }, [])

  const handleDisconnectSpotify = useCallback(async () => {
    if (!confirm('Disconnect Spotify from TRAQ? The iPad will stop streaming via Spotify.')) return
    setSpotifyDisconnecting(true)
    setSpotifyError(null)
    try {
      await requestSpotifyDisconnect()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Disconnect failed'
      setSpotifyError(msg)
    } finally {
      setSpotifyDisconnecting(false)
    }
  }, [])

  const handleAddPlaylistUri = useCallback(async () => {
    const uri = newPlaylistUri.trim()
    if (!uri) return
    if (!uri.startsWith('spotify:playlist:') && !uri.startsWith('spotify:album:') && !uri.startsWith('https://open.spotify.com/')) {
      setSpotifyError('Enter a Spotify playlist or album URI / share link')
      return
    }
    // Normalize https://open.spotify.com/... links to spotify:... URIs.
    let normalized = uri
    if (uri.startsWith('https://open.spotify.com/')) {
      try {
        const u = new URL(uri)
        const segments = u.pathname.split('/').filter(Boolean)
        if (segments.length >= 2) {
          const kind = segments[0]
          const id = segments[1].split('?')[0]
          if ((kind === 'playlist' || kind === 'album') && id) {
            normalized = `spotify:${kind}:${id}`
          }
        }
      } catch {
        // ignore
      }
    }
    const next = [...(spotifyConfig?.playlistUris || []), normalized]
    try {
      await updateSpotifyConfig({ playlistUris: next })
      setNewPlaylistUri('')
      setSpotifyError(null)
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Failed to save playlist')
    }
  }, [newPlaylistUri, spotifyConfig?.playlistUris])

  const handleRemovePlaylistUri = useCallback(async (idx: number) => {
    if (!spotifyConfig) return
    const next = spotifyConfig.playlistUris.filter((_, i) => i !== idx)
    try {
      const newCurrent = Math.min(spotifyConfig.currentPlaylistIndex, Math.max(0, next.length - 1))
      await updateSpotifyConfig({ playlistUris: next, currentPlaylistIndex: newCurrent })
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Failed to update playlists')
    }
  }, [spotifyConfig])

  const handleMovePlaylistUri = useCallback(async (idx: number, dir: 'up' | 'down') => {
    if (!spotifyConfig) return
    const list = [...spotifyConfig.playlistUris]
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= list.length) return
    const tmp = list[idx]
    list[idx] = list[target]
    list[target] = tmp
    try {
      await updateSpotifyConfig({ playlistUris: list })
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Failed to reorder playlists')
    }
  }, [spotifyConfig])

  const handleSpotifySkip = useCallback(async () => {
    setSkippingQueue(true)
    try {
      await sendSpotifyPlaybackCommand({ kind: 'next' })
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Skip failed')
    } finally {
      setSkippingQueue(false)
    }
  }, [])

  const handleRemoveQueueItem = useCallback(async (item: SpotifyQueueItem) => {
    try {
      if (item.status === 'playing') {
        // Already playing — skip first, then remove the row.
        await sendSpotifyPlaybackCommand({ kind: 'next' }).catch(() => {})
      }
      await removeQueueItem(item.id)
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Remove failed')
    }
  }, [])

  // Session commands
  const handleSessionCommand = useCallback(async (
    sessionId: string,
    action: 'play' | 'pause' | 'next' | 'prev' | 'seek',
    payload?: { positionSec?: number }
  ) => {
    setSendingCommand(`${sessionId}-${action}`)
    try {
      await sendSessionCommand(sessionId, action, payload)
    } catch (err) {
      console.error('Failed to send command:', err)
    } finally {
      setSendingCommand(null)
    }
  }, [])

  // Active sessions (not stale)
  const activeSessions = useMemo(() => {
    return sessions.filter((s) => !s.isStale)
  }, [sessions])

  // Visible queue items (not played/skipped).
  const visibleSpotifyQueue = useMemo(
    () => spotifyQueue.filter((q) => q.status !== 'played' && q.status !== 'skipped'),
    [spotifyQueue]
  )

  return (
    <div className="music-page">
      <header className="admin-page-header">
        <h1>Music Management</h1>
        <p>Upload tracks, manage playlist order, and control active sessions.</p>
      </header>

      {/* Player Mode toggle */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🎚️</span> Player Mode
        </h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`admin-btn ${musicProvider === 'legacy' ? 'admin-btn-primary' : ''}`}
            onClick={() => handleSwitchProvider('legacy')}
            disabled={providerSwitching || musicProvider === 'legacy'}
          >
            Legacy Audio
          </button>
          <button
            className={`admin-btn ${musicProvider === 'spotify' ? 'admin-btn-primary' : ''}`}
            onClick={() => handleSwitchProvider('spotify')}
            disabled={providerSwitching || musicProvider === 'spotify'}
          >
            Spotify
          </button>
          <span style={{ opacity: 0.7, fontSize: 13 }}>
            {musicProvider === 'spotify'
              ? 'Devices stream from the connected Spotify account.'
              : 'Devices play uploaded MP3s from Firebase Storage.'}
          </span>
        </div>
      </div>

      {/* Spotify Connection */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🟢</span> Spotify Connection
        </h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {spotifyStatus.connected ? (
            <>
              <span
                style={{
                  background: '#0f5132',
                  color: '#d1f4dd',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                ✓ Connected{spotifyStatus.connectedUserName ? ` as ${spotifyStatus.connectedUserName}` : ''}
              </span>
              <button
                className="admin-btn"
                onClick={handleDisconnectSpotify}
                disabled={spotifyDisconnecting}
              >
                {spotifyDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <>
              <span
                style={{
                  background: '#444',
                  color: '#ddd',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                Not connected
              </span>
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleConnectSpotify}
                disabled={spotifyConnecting}
              >
                {spotifyConnecting ? 'Connecting…' : 'Connect Spotify'}
              </button>
            </>
          )}
        </div>
        {spotifyError && (
          <div style={{ marginTop: 12, color: '#ff6f6f', fontSize: 13 }}>{spotifyError}</div>
        )}
        <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
          Connect a Spotify Premium account once. The token auto-refreshes server-side so the iPad
          can keep streaming all day without re-authorization.
        </div>
      </div>

      {/* Spotify Playlists */}
      {spotifyStatus.connected && (
        <div className="admin-card">
          <h3 className="admin-card-title">
            <span>📃</span> Spotify Playlists
          </h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              className="admin-input"
              placeholder="spotify:playlist:… or https://open.spotify.com/playlist/…"
              value={newPlaylistUri}
              onChange={(e) => setNewPlaylistUri(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="admin-btn admin-btn-primary"
              onClick={handleAddPlaylistUri}
              disabled={!newPlaylistUri.trim()}
            >
              Add
            </button>
          </div>
          {(spotifyConfig?.playlistUris.length ?? 0) === 0 ? (
            <div className="admin-empty">
              <span className="admin-empty-icon">📃</span>
              <h3>No playlists yet</h3>
              <p>Add a Spotify playlist URI to start streaming on the iPad.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(spotifyConfig?.playlistUris || []).map((uri, idx) => {
                const isCurrent = idx === (spotifyConfig?.currentPlaylistIndex || 0)
                return (
                  <div
                    key={`${uri}-${idx}`}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: 10,
                      background: isCurrent ? '#1f3a2c' : '#1c1c1c',
                      border: '1px solid #2a2a2a',
                      borderRadius: 8,
                    }}
                  >
                    {isCurrent && (
                      <span style={{ fontSize: 12, color: '#9be0a8', fontWeight: 700 }}>NOW</span>
                    )}
                    <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {uri}
                    </code>
                    <button
                      className="admin-btn"
                      onClick={() => handleMovePlaylistUri(idx, 'up')}
                      disabled={idx === 0}
                    >
                      ↑
                    </button>
                    <button
                      className="admin-btn"
                      onClick={() => handleMovePlaylistUri(idx, 'down')}
                      disabled={idx === (spotifyConfig?.playlistUris.length ?? 0) - 1}
                    >
                      ↓
                    </button>
                    <button
                      className="admin-btn music-delete-btn"
                      onClick={() => handleRemovePlaylistUri(idx)}
                    >
                      🗑️
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Spotify Request Queue */}
      {spotifyStatus.connected && (
        <div className="admin-card">
          <h3 className="admin-card-title">
            <span>🎤</span> Song Requests
            {visibleSpotifyQueue.length > 0 && (
              <span className="music-count">{visibleSpotifyQueue.length}</span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              className="admin-btn"
              onClick={handleSpotifySkip}
              disabled={skippingQueue}
            >
              {skippingQueue ? 'Skipping…' : 'Skip current track'}
            </button>
          </div>
          {visibleSpotifyQueue.length === 0 ? (
            <div className="admin-empty">
              <span className="admin-empty-icon">🎤</span>
              <h3>No requests right now</h3>
              <p>Anyone on the iPad can search and queue a song.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleSpotifyQueue.map((q) => (
                <div
                  key={q.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    padding: 10,
                    background: q.status === 'playing' ? '#1f3a2c' : '#1c1c1c',
                    border: '1px solid #2a2a2a',
                    borderRadius: 8,
                  }}
                >
                  {q.albumImageUrl && (
                    <img
                      src={q.albumImageUrl}
                      alt=""
                      style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }}
                    />
                  )}
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {q.trackName}
                    </span>
                    <span
                      style={{
                        opacity: 0.7,
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {q.artistName}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{q.status}</span>
                  <button
                    className="admin-btn music-delete-btn"
                    onClick={() => handleRemoveQueueItem(q)}
                    title="Remove from queue"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Section */}
      <div className="admin-card music-upload-card">
        <h3 className="admin-card-title">
          <span>📤</span> Upload Track
        </h3>

        <div className="music-upload-form">
          <div className="music-upload-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="music-file-input"
            />
          </div>

          {uploadFile && (
            <>
              <div className="music-upload-row">
                <label className="admin-label">Title:</label>
                <input
                  type="text"
                  className="admin-input"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  disabled={uploading}
                  placeholder="Track title"
                />
              </div>

              <div className="music-upload-row music-upload-toggle-row">
                <label className="admin-label">Enabled:</label>
                <button
                  type="button"
                  className={`music-toggle-btn ${uploadEnabled ? 'active' : ''}`}
                  onClick={() => setUploadEnabled((v) => !v)}
                  disabled={uploading}
                >
                  {uploadEnabled ? '✓ Yes' : '✕ No'}
                </button>
              </div>

              {uploading && (
                <div className="music-upload-progress">
                  <div className="music-upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                  <span className="music-upload-progress-text">{uploadProgress}%</span>
                </div>
              )}

              {uploadError && <div className="music-upload-error">{uploadError}</div>}

              <button
                className="admin-btn admin-btn-primary"
                onClick={handleUpload}
                disabled={uploading || !uploadTitle.trim()}
              >
                {uploading ? 'Uploading...' : 'Upload Track'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Track List */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>🎵</span> Track List
          {tracks.length > 0 && <span className="music-count">{tracks.length}</span>}
        </h3>

        {tracks.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🎵</span>
            <h3>No tracks yet</h3>
            <p>Upload your first track above</p>
          </div>
        ) : (
          <div className="music-track-list">
            {sortedTracks.map((track, index) => {
              const isBusy = processing === track.id
              const isEditing = editingTrackId === track.id
              const isDragging = dragIndex === index
              const isDragOver = dragOverIndex === index

              return (
                <div
                  key={track.id}
                  className={`music-track-item ${!track.enabled ? 'music-track-disabled' : ''} ${isDragging ? 'music-track-dragging' : ''} ${isDragOver ? 'music-track-drag-over' : ''}`}
                  draggable={!isEditing}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <div className="music-track-drag-handle">⠿</div>

                  <div className="music-track-info">
                    {isEditing ? (
                      <input
                        type="text"
                        className="admin-input music-track-title-input"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={saveEditTitle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditTitle()
                          if (e.key === 'Escape') setEditingTrackId(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="music-track-title"
                        onClick={() => startEditTitle(track)}
                        title="Click to edit"
                      >
                        {track.title}
                      </span>
                    )}
                    <span className="music-track-meta">
                      {track.bytes ? `${Math.round(track.bytes / 1024 / 1024 * 10) / 10} MB` : ''}
                    </span>
                  </div>

                  <div className="music-track-actions">
                    {/* Move buttons (mobile) */}
                    <button
                      className="admin-btn music-move-btn"
                      onClick={() => moveTrack(index, 'up')}
                      disabled={index === 0 || isBusy}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="admin-btn music-move-btn"
                      onClick={() => moveTrack(index, 'down')}
                      disabled={index === sortedTracks.length - 1 || isBusy}
                      title="Move down"
                    >
                      ↓
                    </button>

                    {/* Toggle enabled */}
                    <button
                      className={`admin-btn music-toggle-enabled-btn ${track.enabled ? 'enabled' : 'disabled'}`}
                      onClick={() => handleToggleEnabled(track)}
                      disabled={isBusy}
                    >
                      {track.enabled ? '✓' : '✕'}
                    </button>

                    {/* Delete */}
                    <button
                      className="admin-btn music-delete-btn"
                      onClick={() => handleDeleteTrack(track)}
                      disabled={isBusy}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Now Playing Section */}
      <div className="admin-card">
        <h3 className="admin-card-title">
          <span>📻</span> Now Playing
          {activeSessions.length > 0 && (
            <span className="music-count music-count-active">{activeSessions.length}</span>
          )}
        </h3>

        {activeSessions.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📻</span>
            <h3>No active sessions</h3>
            <p>Sessions will appear when devices start playing music</p>
          </div>
        ) : (
          <div className="music-sessions-list">
            {activeSessions.map((session) => {
              const isPlaying = session.isActuallyPlaying || session.isPlaying
              const currentTrack = tracks.find((t) => t.id === session.currentTrackId)
              const isSending = sendingCommand?.startsWith(session.sessionId)

              return (
                <div key={session.sessionId} className="music-session-card">
                  <div className="music-session-header">
                    <span className="music-session-device">
                      📱 {session.deviceInfo}
                    </span>
                    <span className={`music-session-status ${isPlaying ? 'playing' : 'paused'}`}>
                      {isPlaying ? '▶ Playing' : '⏸ Paused'}
                    </span>
                  </div>

                  {currentTrack && (
                    <div className="music-session-track">
                      🎵 {currentTrack.title}
                    </div>
                  )}

                  {session.positionSec !== undefined && session.durationSec !== undefined && (
                    <div className="music-session-progress">
                      <div
                        className="music-session-progress-bar"
                        style={{ width: `${(session.positionSec / session.durationSec) * 100}%` }}
                      />
                      <span className="music-session-time">
                        {formatTime(session.positionSec)} / {formatTime(session.durationSec)}
                      </span>
                    </div>
                  )}

                  <div className="music-session-controls">
                    <button
                      className="admin-btn music-control-btn"
                      onClick={() => handleSessionCommand(session.sessionId, 'prev')}
                      disabled={isSending}
                    >
                      ⏮
                    </button>
                    <button
                      className="admin-btn music-control-btn music-control-play"
                      onClick={() => handleSessionCommand(session.sessionId, isPlaying ? 'pause' : 'play')}
                      disabled={isSending}
                    >
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button
                      className="admin-btn music-control-btn"
                      onClick={() => handleSessionCommand(session.sessionId, 'next')}
                      disabled={isSending}
                    >
                      ⏭
                    </button>
                  </div>

                  {session.lastCommandResult && (
                    <div className={`music-session-feedback ${session.lastCommandResult === 'success' ? 'success' : 'error'}`}>
                      {session.lastCommandResult === 'success' && '✓ Command executed'}
                      {session.lastCommandResult === 'failed' && '✕ Command failed'}
                      {session.lastCommandResult === 'needs_gesture' && '⚠️ Needs user interaction'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper to format seconds as mm:ss
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default MusicPage
