import { db, waitForFirebase } from '../firebase'
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'

/** Which TRAQ UI shell production devices load from the main Hosting site. */
export type ProductionShell = 'v2' | 'v3'

/** Feature release within the v3 shell (`productionShell === 'v3'`). New work gates on `3.1`. */
export type V3Release = '3.0' | '3.1'

/**
 * Which in-app music player implementation devices mount.
 *
 * - `legacy`: original Firebase Storage <audio> player ([src/components/MusicPlayer.tsx](src/components/MusicPlayer.tsx)).
 * - `spotify`: Spotify Web Playback SDK player streaming from a shared house account.
 *
 * Default `legacy`. Admin can flip back any time from the admin Music page.
 */
export type MusicProvider = 'legacy' | 'spotify'

const CONFIG_COLLECTION = 'config'
const APP_UI_DOC_ID = 'appUi'

export type AppUiSettings = {
  productionShell: ProductionShell
  /**
   * 3.x minor release for the **main** Hosting site when `productionShell` is v3 (`config/appUi.v3Release`).
   * Default `3.0` when missing.
   */
  v3Release: V3Release
  /**
   * Optional override for the **beta** Hosting entry only. When `null` (field absent), beta uses `v3Release`.
   * Lets beta preview 3.1 while main stays on 3.0 (`config/appUi.v3ReleaseBeta`).
   */
  v3ReleaseBeta: V3Release | null
  /** When false, the v3 Home menu hides Cash Only POS (v2 More menu unchanged). Default true. */
  v3AdminPosEnabled: boolean
  /** Which music player implementation devices render. Default `legacy`. */
  musicProvider: MusicProvider
  updatedAt?: unknown
  updatedBy?: string
}

const isFirestoreSDKAvailable = (): boolean => db !== null

const assertFirestoreReady = async () => {
  await waitForFirebase()
  if (!isFirestoreSDKAvailable()) {
    throw new Error('Firestore SDK not available')
  }
}

function parseProductionShell(raw: unknown): ProductionShell | null {
  if (raw === 'v2' || raw === 'v3') return raw
  return null
}

function parseV3AdminPosEnabled(raw: unknown): boolean {
  if (raw === false) return false
  return true
}

function parseV3Release(raw: unknown): V3Release {
  if (raw === '3.1') return '3.1'
  return '3.0'
}

function parseV3ReleaseBeta(raw: unknown): V3Release | null {
  if (raw === undefined) return null
  return parseV3Release(raw)
}

function parseMusicProvider(raw: unknown): MusicProvider {
  if (raw === 'spotify') return 'spotify'
  return 'legacy'
}

const DEFAULT_SHELL: ProductionShell = 'v2'
const DEFAULT_V3_RELEASE: V3Release = '3.0'
const DEFAULT_MUSIC_PROVIDER: MusicProvider = 'legacy'

/**
 * Subscribe to app UI settings (`config/appUi`). If the doc is missing or invalid, `productionShell` defaults to `v2`.
 */
export const subscribeToAppUiSettings = (
  callback: (settings: AppUiSettings) => void
): (() => void) => {
  const fallback = (): AppUiSettings => ({
    productionShell: DEFAULT_SHELL,
    v3Release: DEFAULT_V3_RELEASE,
    v3ReleaseBeta: null,
    v3AdminPosEnabled: true,
    musicProvider: DEFAULT_MUSIC_PROVIDER,
  })

  if (!isFirestoreSDKAvailable()) {
    callback(fallback())
    return () => {}
  }

  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback(fallback())
      return
    }
    try {
      await assertFirestoreReady()
    } catch {
      callback(fallback())
      return
    }
    if (cancelled) return

    const docRef = doc(db, CONFIG_COLLECTION, APP_UI_DOC_ID)
    unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          callback(fallback())
          return
        }
        const data = snap.data() as Record<string, unknown>
        const shell = parseProductionShell(data.productionShell) ?? DEFAULT_SHELL
        callback({
          productionShell: shell,
          v3Release: parseV3Release(data.v3Release),
          v3ReleaseBeta: parseV3ReleaseBeta(data.v3ReleaseBeta),
          v3AdminPosEnabled: parseV3AdminPosEnabled(data.v3AdminPosEnabled),
          musicProvider: parseMusicProvider(data.musicProvider),
          updatedAt: data.updatedAt,
          updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
        })
      },
      (err) => {
        console.error('App UI settings subscription error:', err)
        callback(fallback())
      }
    )
  }

  void setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Set which shell the main TRAQ app serves. Admin-only usage (same trust model as other open config writes).
 */
export const setProductionShell = async (
  productionShell: ProductionShell,
  options?: { updatedBy?: string }
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, APP_UI_DOC_ID)
  await setDoc(
    docRef,
    {
      productionShell,
      updatedAt: serverTimestamp(),
      ...(options?.updatedBy ? { updatedBy: options.updatedBy } : {}),
    },
    { merge: true }
  )
}

/**
 * Show or hide Cash Only POS on the v3 Home menu (Firestore `config/appUi`). Admin-only usage.
 */
export const setV3AdminPosEnabled = async (
  enabled: boolean,
  options?: { updatedBy?: string }
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, APP_UI_DOC_ID)
  await setDoc(
    docRef,
    {
      v3AdminPosEnabled: enabled,
      updatedAt: serverTimestamp(),
      ...(options?.updatedBy ? { updatedBy: options.updatedBy } : {}),
    },
    { merge: true }
  )
}

/**
 * Set 3.x feature release for the **main** Hosting site (`v3Release`). Footer and `isV31` on main follow this
 * when the production shell is v3. Admin-only usage.
 */
export const setV3Release = async (v3Release: V3Release, options?: { updatedBy?: string }): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, APP_UI_DOC_ID)
  await setDoc(
    docRef,
    {
      v3Release,
      updatedAt: serverTimestamp(),
      ...(options?.updatedBy ? { updatedBy: options.updatedBy } : {}),
    },
    { merge: true }
  )
}

/**
 * Override 3.x release for **beta** Hosting only. Pass `null` to remove the field so beta matches `v3Release`.
 */
export const setV3ReleaseBeta = async (
  v3ReleaseBeta: V3Release | null,
  options?: { updatedBy?: string }
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, APP_UI_DOC_ID)
  const base = {
    updatedAt: serverTimestamp(),
    ...(options?.updatedBy ? { updatedBy: options.updatedBy } : {}),
  }
  if (v3ReleaseBeta === null) {
    await setDoc(docRef, { ...base, v3ReleaseBeta: deleteField() }, { merge: true })
  } else {
    await setDoc(docRef, { ...base, v3ReleaseBeta }, { merge: true })
  }
}

/**
 * Switch which music player implementation devices mount (`config/appUi.musicProvider`).
 * Default is `legacy`. Setting `spotify` swaps the in-app pill to the Web Playback SDK player;
 * the legacy uploaded-MP3 player remains a one-click fallback.
 */
export const setMusicProvider = async (
  musicProvider: MusicProvider,
  options?: { updatedBy?: string }
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, CONFIG_COLLECTION, APP_UI_DOC_ID)
  await setDoc(
    docRef,
    {
      musicProvider,
      updatedAt: serverTimestamp(),
      ...(options?.updatedBy ? { updatedBy: options.updatedBy } : {}),
    },
    { merge: true }
  )
}

/** Effective 3.x minor release for the given Hosting entry (main uses `v3Release`; beta uses override or live). */
export function effectiveV3ReleaseForChannel(
  deploymentChannel: 'main' | 'beta',
  settings: Pick<AppUiSettings, 'v3Release' | 'v3ReleaseBeta'>
): V3Release {
  if (deploymentChannel === 'beta') {
    return settings.v3ReleaseBeta ?? settings.v3Release
  }
  return settings.v3Release
}
