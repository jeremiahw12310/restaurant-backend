import * as functions from 'firebase-functions/v1'
import { ensureFreshAccessToken, spotifyApiRequest } from './spotifyClient'
import type { SpotifyPlaybackCommandRequest } from './types'

/**
 * Firestore trigger: admin writes `spotifyPlaybackCommands/{id}` with
 * `{ status: 'pending', kind: 'next' | 'previous' | 'pause' | 'resume', deviceId? }`.
 * We hit the Spotify Web API with the house account's access token.
 *
 * Note: most playback is driven by the SDK directly on the iPad. This is for
 * admin "skip current request" and similar one-shot remote actions where we
 * need a server-side token (e.g. when the admin browser isn't a Spotify
 * Connect device itself).
 */
export const processSpotifyPlaybackCommand = functions
  .runWith({ secrets: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'], maxInstances: 5 })
  .region('us-central1')
  .firestore.document('spotifyPlaybackCommands/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Partial<SpotifyPlaybackCommandRequest> | undefined
    if (!raw || raw.status !== 'pending') return
    const kind = raw.kind
    if (kind !== 'next' && kind !== 'previous' && kind !== 'pause' && kind !== 'resume') {
      await snap.ref.update({ status: 'error', error: 'Invalid kind' })
      return
    }

    try {
      const { accessToken } = await ensureFreshAccessToken()
      const deviceQuery = raw.deviceId ? `?device_id=${encodeURIComponent(raw.deviceId)}` : ''

      let path: string
      let method: string
      switch (kind) {
        case 'next':
          path = `/me/player/next${deviceQuery}`
          method = 'POST'
          break
        case 'previous':
          path = `/me/player/previous${deviceQuery}`
          method = 'POST'
          break
        case 'pause':
          path = `/me/player/pause${deviceQuery}`
          method = 'PUT'
          break
        case 'resume':
          path = `/me/player/play${deviceQuery}`
          method = 'PUT'
          break
      }

      const res = await spotifyApiRequest(accessToken, path, { method })
      // Spotify returns 204 for these endpoints. 404 means "no active device";
      // 403 sometimes means the action isn't valid right now (e.g. previous on
      // a single-track context). Treat both as soft success so we don't churn.
      if (!res.ok && res.status !== 204 && res.status !== 404 && res.status !== 403) {
        const text = await res.text()
        throw new Error(`Spotify ${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`)
      }

      await snap.ref.update({ status: 'success' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processSpotifyPlaybackCommand failed:', msg)
      await snap.ref.update({ status: 'error', error: msg.slice(0, 500) })
    }
  })
