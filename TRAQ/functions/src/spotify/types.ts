// Shared types for the Spotify Functions module.
//
// We follow the same Firestore-trigger request/response pattern used by the AI
// quote / window-complete functions: the client writes a "request" doc, a
// Firestore trigger fills in fields on the same doc with the result, and the
// client reads back via onSnapshot.

export type SpotifyAuthDoc = {
  refreshToken: string
  accessToken: string
  accessTokenExpiresAtMs: number
  scope: string
  connectedUserId?: string
  connectedUserName?: string
  connectedAt?: string
  updatedAt?: string
}

export type SpotifyStatusDoc = {
  connected: boolean
  connectedUserId?: string
  connectedUserName?: string
  connectedAt?: string
  updatedAt?: string
}

// Client → Function: code exchange (initial connect).
export type SpotifyOAuthRequest = {
  status: 'pending' | 'success' | 'error'
  code: string
  redirectUri: string
  createdAt: string
  createdAtMs: number
  // Filled in by trigger on success.
  connectedUserId?: string
  connectedUserName?: string
  // Filled in by trigger on error.
  error?: string
}

// Client → Function: get a fresh access_token. Trigger refreshes if needed.
export type SpotifyTokenRequest = {
  status: 'pending' | 'success' | 'error'
  createdAt: string
  createdAtMs: number
  accessToken?: string
  expiresAtMs?: number
  error?: string
}

// Client → Function: search the Spotify catalog.
export type SpotifyTrackResult = {
  uri: string
  name: string
  artists: string
  durationMs: number
  albumImageUrl?: string
}

export type SpotifySearchRequest = {
  status: 'pending' | 'success' | 'error'
  query: string
  createdAt: string
  createdAtMs: number
  results?: SpotifyTrackResult[]
  error?: string
}

// Client → Function: imperative playback commands that need a server-side
// access token (e.g. "skip current"). The Spotify SDK handles most playback,
// but admin remote actions are easier through the Web API.
export type SpotifyPlaybackCommandKind = 'next' | 'previous' | 'pause' | 'resume'

export type SpotifyPlaybackCommandRequest = {
  status: 'pending' | 'success' | 'error'
  kind: SpotifyPlaybackCommandKind
  deviceId?: string
  createdAt: string
  createdAtMs: number
  error?: string
}

export type SpotifyDisconnectRequest = {
  status: 'pending' | 'success' | 'error'
  createdAt: string
  createdAtMs: number
  error?: string
}
