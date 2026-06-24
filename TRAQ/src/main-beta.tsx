import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { POSPage } from './pages/POSPage.tsx'
import { AdminPortalRedirect } from './pages/AdminPortalRedirect.tsx'

const TraqAppV3Lazy = lazy(() => import('./shell/v3/TraqAppV3.tsx'))

function BetaShellFallback() {
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
      Loading TRAQ Beta…
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<BetaShellFallback />}>
        <Routes>
          <Route path="/" element={<TraqAppV3Lazy deploymentChannel="beta" />} />
          <Route path="/pos" element={<POSPage />} />
          <Route path="/admin" element={<AdminPortalRedirect />} />
          <Route path="/admin/*" element={<AdminPortalRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
