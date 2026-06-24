import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  subscribeToAppUiSettings,
  type ProductionShell,
} from '../services/appSettings.ts'

const TraqAppV2Lazy = lazy(() => import('./v2/TraqAppV2.tsx'))
const TraqAppV3Lazy = lazy(() => import('./v3/TraqAppV3.tsx'))

const LS_OVERRIDE_KEY = 'traq-shell-override'

function readDevLocalOverride(): ProductionShell | null {
  if (!import.meta.env.DEV) return null
  try {
    const raw = localStorage.getItem(LS_OVERRIDE_KEY)
    if (raw === 'v2' || raw === 'v3') return raw
  } catch {
    /* ignore */
  }
  return null
}

function parseShellParam(value: string | null): ProductionShell | null {
  if (value === 'v2' || value === 'v3') return value
  return null
}

function ShellFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a1a',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Loading TRAQ…
    </div>
  )
}

/**
 * Chooses v2 vs v3 for `/` on the main Hosting site from Firestore (`config/appUi`), with optional overrides.
 */
export function TraqShellRouter() {
  const [searchParams] = useSearchParams()
  const shellParam = searchParams.get('shell')

  const [serverShell, setServerShell] = useState<ProductionShell | null>(null)

  useEffect(() => {
    return subscribeToAppUiSettings((s) => {
      setServerShell(s.productionShell)
    })
  }, [])

  const effectiveShell = useMemo((): ProductionShell => {
    const fromQuery = parseShellParam(shellParam)
    if (fromQuery) return fromQuery
    const fromLs = readDevLocalOverride()
    if (fromLs) return fromLs
    return serverShell ?? 'v2'
  }, [shellParam, serverShell])

  const waitingForRemote =
    serverShell === null &&
    parseShellParam(shellParam) === null &&
    readDevLocalOverride() === null

  if (waitingForRemote) {
    return <ShellFallback />
  }

  return (
    <Suspense fallback={<ShellFallback />}>
      {effectiveShell === 'v3' ? <TraqAppV3Lazy /> : <TraqAppV2Lazy />}
    </Suspense>
  )
}
