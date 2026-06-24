import * as admin from 'firebase-admin'
import type { SpotifyAuthDoc, SpotifyStatusDoc } from './types'

// We talk directly to https://accounts.spotify.com and https://api.spotify.com
// from the function (no SDK dependency).

export const SPOTIFY_AUTH_DOC_PATH = 'config/spotifyAuth'
export const SPOTIFY_STATUS_DOC_PATH = 'config/spotifyStatus'

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
].join(' ')

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000

type TokenResponse = {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  refresh_token?: string
}

type SpotifyUser = {
  id?: string
  display_name?: string
  email?: string
}

const requireEnv = (name: string): string => {
  const v = process.env[name] || ''
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

const buildBasicAuthHeader = (): string => {
  const id = requireEnv('SPOTIFY_CLIENT_ID')
  const secret = requireEnv('SPOTIFY_CLIENT_SECRET')
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}

export async function exchangeAuthCode(params: {
  code: string
  redirectUri: string
}): Promise<TokenResponse> {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', params.code)
  body.set('redirect_uri', params.redirectUri)

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify token exchange failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', refreshToken)

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify token refresh failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as TokenResponse
}

export async function getCurrentUser(accessToken: string): Promise<SpotifyUser> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify /me failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as SpotifyUser
}

export async function loadAuthDoc(): Promise<SpotifyAuthDoc | null> {
  const snap = await admin.firestore().doc(SPOTIFY_AUTH_DOC_PATH).get()
  if (!snap.exists) return null
  const data = snap.data() as Partial<SpotifyAuthDoc>
  if (!data || typeof data.refreshToken !== 'string' || !data.refreshToken) return null
  return {
    refreshToken: data.refreshToken,
    accessToken: typeof data.accessToken === 'string' ? data.accessToken : '',
    accessTokenExpiresAtMs:
      typeof data.accessTokenExpiresAtMs === 'number' ? data.accessTokenExpiresAtMs : 0,
    scope: typeof data.scope === 'string' ? data.scope : '',
    connectedUserId: typeof data.connectedUserId === 'string' ? data.connectedUserId : undefined,
    connectedUserName:
      typeof data.connectedUserName === 'string' ? data.connectedUserName : undefined,
    connectedAt: typeof data.connectedAt === 'string' ? data.connectedAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  }
}

export async function saveAuthDoc(next: SpotifyAuthDoc): Promise<void> {
  await admin
    .firestore()
    .doc(SPOTIFY_AUTH_DOC_PATH)
    .set({ ...next, updatedAt: new Date().toISOString() }, { merge: true })
}

export async function clearAuthDoc(): Promise<void> {
  await admin.firestore().doc(SPOTIFY_AUTH_DOC_PATH).delete()
}

export async function writeStatusDoc(status: SpotifyStatusDoc): Promise<void> {
  await admin
    .firestore()
    .doc(SPOTIFY_STATUS_DOC_PATH)
    .set({ ...status, updatedAt: new Date().toISOString() }, { merge: true })
}

/**
 * Returns a non-expired access token, refreshing via the refresh_token if needed.
 * Persists the refreshed token back to `config/spotifyAuth`.
 */
export async function ensureFreshAccessToken(): Promise<{
  accessToken: string
  expiresAtMs: number
}> {
  const auth = await loadAuthDoc()
  if (!auth) throw new Error('Spotify is not connected')

  const now = Date.now()
  if (
    auth.accessToken &&
    auth.accessTokenExpiresAtMs &&
    auth.accessTokenExpiresAtMs - ACCESS_TOKEN_REFRESH_BUFFER_MS > now
  ) {
    return { accessToken: auth.accessToken, expiresAtMs: auth.accessTokenExpiresAtMs }
  }

  const refreshed = await refreshAccessToken(auth.refreshToken)
  const expiresAtMs = Date.now() + Math.max(0, refreshed.expires_in - 30) * 1000
  const next: SpotifyAuthDoc = {
    ...auth,
    // Spotify may rotate the refresh token; honor a new one if returned.
    refreshToken: refreshed.refresh_token || auth.refreshToken,
    accessToken: refreshed.access_token,
    accessTokenExpiresAtMs: expiresAtMs,
    scope: refreshed.scope || auth.scope,
  }
  await saveAuthDoc(next)
  return { accessToken: refreshed.access_token, expiresAtMs }
}

export async function spotifyApiRequest(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`
  const headers = new Headers(init?.headers || {})
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}
