import { memo, useEffect, useState } from 'react'
import { MusicPlayer } from './MusicPlayer'
import { SpotifyMusicPlayer } from './SpotifyMusicPlayer'
import { subscribeToAppUiSettings, type MusicProvider } from '../services/appSettings'

/**
 * Mounts whichever music player the admin has selected via
 * `config/appUi.musicProvider`. The legacy `MusicPlayer` (Firebase Storage
 * <audio>) is the default and stays available as a one-click fallback.
 */
export const MusicPlayerSwitcher = memo(function MusicPlayerSwitcher() {
  const [provider, setProvider] = useState<MusicProvider>('legacy')

  useEffect(() => {
    const unsub = subscribeToAppUiSettings((settings) => {
      setProvider(settings.musicProvider)
    })
    return () => unsub()
  }, [])

  if (provider === 'spotify') {
    return <SpotifyMusicPlayer />
  }
  return <MusicPlayer />
})
