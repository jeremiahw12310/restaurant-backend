import * as functions from 'firebase-functions/v1'
import { clearAuthDoc, writeStatusDoc } from './spotifyClient'
import type { SpotifyDisconnectRequest } from './types'

/**
 * Firestore trigger: admin writes `spotifyDisconnectRequests/{id}` with
 * `{ status: 'pending' }`. We clear `config/spotifyAuth` and flip
 * `config/spotifyStatus.connected` to false.
 */
export const processSpotifyDisconnect = functions
  .region('us-central1')
  .firestore.document('spotifyDisconnectRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Partial<SpotifyDisconnectRequest> | undefined
    if (!raw || raw.status !== 'pending') return

    try {
      await clearAuthDoc()
      await writeStatusDoc({ connected: false })
      await snap.ref.update({ status: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processSpotifyDisconnect failed:', msg)
      await snap.ref.update({ status: 'error', error: msg.slice(0, 500) })
    }
  })
