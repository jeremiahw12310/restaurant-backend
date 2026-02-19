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

  return (
    <div className="music-page">
      <header className="admin-page-header">
        <h1>Music Management</h1>
        <p>Upload tracks, manage playlist order, and control active sessions.</p>
      </header>

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
