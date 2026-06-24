import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { TraqShellRouter } from './shell/TraqShellRouter.tsx'
import { POSPage } from './pages/POSPage.tsx'
import { AdminPortalRedirect } from './pages/AdminPortalRedirect.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { logReloadOnBoot } from './utils/reloadForensics.ts'

logReloadOnBoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TraqShellRouter />} />
          <Route path="/pos" element={<POSPage />} />
          <Route path="/admin" element={<AdminPortalRedirect />} />
          <Route path="/admin/*" element={<AdminPortalRedirect />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)
