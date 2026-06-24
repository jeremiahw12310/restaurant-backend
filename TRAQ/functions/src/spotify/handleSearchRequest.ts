import * as functions from 'firebase-functions/v1'
import { ensureFreshAccessToken, spotifyApiRequest } from './spotifyClient'
import type { SpotifySearchRequest, SpotifyTrackResult } from './types'

type SpotifyArtist = { name?: string }
type SpotifyImage = { url?: string; width?: number; height?: number }
type SpotifyAlbum = { images?: SpotifyImage[] }
type SpotifyTrack = {
  uri?: string
  name?: string
  duration_ms?: number
  artists?: SpotifyArtist[]
  album?: SpotifyAlbum
  is_playable?: boolean
}
type SearchResponse = { tracks?: { items?: SpotifyTrack[] } }

const MAX_QUERY_LEN = 200
const RESULT_LIMIT = 10

const pickAlbumImage = (track: SpotifyTrack): string | undefined => {
  const images = track.album?.images || []
  if (images.length === 0) return undefined
  // Prefer the smallest image >= 64px to keep payload light.
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0))
  const small = sorted.find((img) => (img.width || 0) >= 64) || sorted[sorted.length - 1]
  return small?.url
}

/**
 * Firestore trigger: client writes `spotifySearchRequests/{id}` with
 * `{ status: 'pending', query }`. We hit Spotify's search endpoint with a
 * fresh server-side access token and write back a slim result list.
 */
export const processSpotifySearchRequest = functions
  .runWith({ secrets: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'], maxInstances: 10 })
  .region('us-central1')
  .firestore.document('spotifySearchRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Partial<SpotifySearchRequest> | undefined
    if (!raw || raw.status !== 'pending') return
    const query = typeof raw.query === 'string' ? raw.query.trim().slice(0, MAX_QUERY_LEN) : ''
    if (!query) {
      await snap.ref.update({ status: 'error', error: 'Empty query' })
      return
    }

    try {
      const { accessToken } = await ensureFreshAccessToken()
      const params = new URLSearchParams({
        q: query,
        type: 'track',
        limit: String(RESULT_LIMIT),
      })
      const res = await spotifyApiRequest(accessToken, `/search?${params.toString()}`, {
        method: 'GET',
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Spotify search failed (${res.status}): ${text.slice(0, 200)}`)
      }

      const json = (await res.json()) as SearchResponse
      const items = json.tracks?.items || []
      const results: SpotifyTrackResult[] = items
        .filter((t) => typeof t.uri === 'string' && t.is_playable !== false)
        .slice(0, RESULT_LIMIT)
        .map((t) => ({
          uri: String(t.uri),
          name: typeof t.name === 'string' ? t.name : 'Unknown',
          artists: (t.artists || []).map((a) => a.name || '').filter(Boolean).join(', '),
          durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : 0,
          albumImageUrl: pickAlbumImage(t),
        }))

      await snap.ref.update({
        status: 'success',
        results,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('processSpotifySearchRequest failed:', msg)
      await snap.ref.update({ status: 'error', error: msg.slice(0, 500) })
    }
  })
