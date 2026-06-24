/** Read-only mirror of music UI for the idle screensaver (no audio APIs). */

export type MusicScreensaverUi = {
  /** Track title, or loading / empty-library placeholder. */
  primaryLine: string
  /** Buffering text, tap-to-resume when idle, or null when neither applies. */
  statusLine: string | null
}

type Listener = (s: MusicScreensaverUi) => void

let snapshot: MusicScreensaverUi = {
  primaryLine: '',
  statusLine: null,
}

const listeners = new Set<Listener>()

export function reportMusicScreensaverUi(next: Partial<MusicScreensaverUi>): void {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((l) => {
    l(snapshot)
  })
}

export function getMusicScreensaverUi(): MusicScreensaverUi {
  return snapshot
}

export function subscribeMusicScreensaverUi(listener: Listener): () => void {
  listeners.add(listener)
  listener(snapshot)
  return () => {
    listeners.delete(listener)
  }
}
