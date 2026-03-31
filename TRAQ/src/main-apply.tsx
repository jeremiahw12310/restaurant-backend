import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { BonfireApply } from './pages/BonfireApply.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BonfireApply />} />
        <Route path="/bonfire" element={<BonfireApply />} />
        <Route path="*" element={<BonfireApply />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
