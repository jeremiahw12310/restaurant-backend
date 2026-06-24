#!/usr/bin/env bash
# Upload Spotify credentials to Firebase Functions secrets (Google Secret Manager).
#
# Prerequisites:
#   1. firebase login --reauth   (once, if the CLI says credentials are invalid)
#   2. From the Spotify Developer Dashboard → your app → Settings:
#        copy the "Client secret" (shown once when created, or reset to get a new one)
#
# Usage (from repo root):
#   export SPOTIFY_CLIENT_SECRET='your_client_secret_here'
#   ./scripts/set-spotify-firebase-secrets.sh
#
# Optional: override client id (defaults to the TRAQ app id in src/services/spotify.ts)
#   export SPOTIFY_CLIENT_ID='fd12de6d74ff43539a682cfe77a6920f'
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLIENT_ID="${SPOTIFY_CLIENT_ID:-fd12de6d74ff43539a682cfe77a6920f}"

if [[ -z "${SPOTIFY_CLIENT_SECRET:-}" ]]; then
  echo "Error: SPOTIFY_CLIENT_SECRET is not set." >&2
  echo "  export SPOTIFY_CLIENT_SECRET='(from Spotify Dashboard → your app → Client secret)'" >&2
  echo "  ./scripts/set-spotify-firebase-secrets.sh" >&2
  exit 1
fi

echo "Setting SPOTIFY_CLIENT_ID…"
printf '%s' "$CLIENT_ID" | firebase functions:secrets:set SPOTIFY_CLIENT_ID --data-file=- --force

echo "Setting SPOTIFY_CLIENT_SECRET…"
printf '%s' "$SPOTIFY_CLIENT_SECRET" | firebase functions:secrets:set SPOTIFY_CLIENT_SECRET --data-file=- --force

echo "Done. Redeploy functions so new values are picked up:"
echo "  firebase deploy --only functions"
