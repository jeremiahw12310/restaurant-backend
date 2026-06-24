import * as functions from 'firebase-functions/v1'
import { ensureFreshAccessToken } from './spotifyClient'
import type { SpotifyTokenRequest } from './types'

/**
 * Firestore trigger: client writes `spotifyTokenRequests/{id}` with
 * `{ status: 'pending' }`. We return a fresh (non-expired) access token by
 * filling in `accessToken` + `expiresAtMs` on the same doc.
 *
 * Used by the Web Playback SDK's `getOAuthToken` callback so the iPad can
 * keep streaming all day without storing long-lived credentials client-side.
 */
export const processSpotifyTokenRequest = functions
  .runWith({ secrets: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'], maxInstances: 10 })
  .region('us-central1')
  .firestore.document('spotifyTokenRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Partial<SpotifyTokenRequest> | undefined
    if (!raw || raw.status !== 'pending') return

    try {
      const { accessToken, expiresAtMs } = await ensureFreshAccessToken()
      await snap.ref.update({
        status: 'success',
        accessToken,
        expiresAtMs,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processSpotifyTokenRequest failed:', msg)
      await snap.ref.update({ status: 'error', error: msg.slice(0, 500) })
    }
  })
