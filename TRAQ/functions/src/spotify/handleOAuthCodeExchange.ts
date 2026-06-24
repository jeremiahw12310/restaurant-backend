import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions/v1'
import {
  exchangeAuthCode,
  getCurrentUser,
  saveAuthDoc,
  writeStatusDoc,
} from './spotifyClient'
import type { SpotifyAuthDoc, SpotifyOAuthRequest } from './types'

/**
 * Firestore trigger: client writes `spotifyOAuthRequests/{id}` with
 * `{ status: 'pending', code, redirectUri }`. We exchange the code for tokens,
 * persist them to `config/spotifyAuth`, mirror public status to
 * `config/spotifyStatus`, and write back the result on the same request doc.
 */
export const processSpotifyOAuthRequest = functions
  .runWith({ secrets: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'], maxInstances: 5 })
  .region('us-central1')
  .firestore.document('spotifyOAuthRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Partial<SpotifyOAuthRequest> | undefined
    if (!raw || typeof raw.code !== 'string' || typeof raw.redirectUri !== 'string') {
      await snap.ref.update({ status: 'error', error: 'Invalid request' })
      return
    }
    if (raw.status !== 'pending') return

    try {
      const tokens = await exchangeAuthCode({
        code: raw.code,
        redirectUri: raw.redirectUri,
      })
      if (!tokens.refresh_token) {
        await snap.ref.update({
          status: 'error',
          error: 'Spotify did not return a refresh_token',
        })
        return
      }

      const expiresAtMs = Date.now() + Math.max(0, tokens.expires_in - 30) * 1000

      let userId: string | undefined
      let userName: string | undefined
      try {
        const user = await getCurrentUser(tokens.access_token)
        userId = typeof user.id === 'string' && user.id ? user.id : undefined
        const name =
          (typeof user.display_name === 'string' && user.display_name) ||
          (typeof user.email === 'string' && user.email) ||
          (typeof user.id === 'string' && user.id) ||
          ''
        userName = name || undefined
      } catch (err) {
        console.warn('Spotify /me lookup failed (non-fatal):', err)
      }

      const nextAuth: SpotifyAuthDoc = {
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiresAtMs: expiresAtMs,
        scope: tokens.scope || '',
        // Only include user fields if we actually have them — Firestore
        // rejects `undefined` values unless ignoreUndefinedProperties is on,
        // and even with that enabled we'd rather keep doc shape predictable.
        ...(userId ? { connectedUserId: userId } : {}),
        ...(userName ? { connectedUserName: userName } : {}),
        connectedAt: new Date().toISOString(),
      }
      await saveAuthDoc(nextAuth)
      await writeStatusDoc({
        connected: true,
        ...(userId ? { connectedUserId: userId } : {}),
        ...(userName ? { connectedUserName: userName } : {}),
        connectedAt: nextAuth.connectedAt,
      })

      await snap.ref.update({
        status: 'success',
        connectedUserId: userId ?? admin.firestore.FieldValue.delete(),
        connectedUserName: userName ?? admin.firestore.FieldValue.delete(),
        // Don't keep the auth code lying around in Firestore once consumed.
        code: admin.firestore.FieldValue.delete(),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processSpotifyOAuthRequest failed:', msg)
      await snap.ref.update({ status: 'error', error: msg.slice(0, 500) })
    }
  })
