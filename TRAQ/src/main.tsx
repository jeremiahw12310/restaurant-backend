import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { BonfireApply } from './pages/BonfireApply.tsx'
import { POSPage } from './pages/POSPage.tsx'

// Admin Suite
import { AdminLayout } from './admin/AdminLayout.tsx'
import { DashboardPage } from './admin/pages/DashboardPage.tsx'
import { TeamPage } from './admin/pages/TeamPage.tsx'
import { TasksPage } from './admin/pages/TasksPage.tsx'
import { DailyTasksPage } from './admin/pages/DailyTasksPage.tsx'
import { AvailabilityPage } from './admin/pages/AvailabilityPage.tsx'
import { TimeOffPage } from './admin/pages/TimeOffPage.tsx'
// Chunk 3 - Reports & Utilities
import { ReportsPage } from './admin/pages/ReportsPage.tsx'
import { NotificationsPage } from './admin/pages/NotificationsPage.tsx'
import { LogsPage } from './admin/pages/LogsPage.tsx'
import { MusicPage } from './admin/pages/MusicPage.tsx'
import { HiringPage } from './admin/pages/HiringPage.tsx'
import { StockPage } from './admin/pages/StockPage.tsx'
// Analytics
import { AnalyticsPage } from './admin/pages/AnalyticsPage.tsx'
import { LeaderboardPage } from './admin/pages/LeaderboardPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Main App */}
        <Route path="/" element={<App />} />
        <Route path="/bonfire" element={<BonfireApply />} />
        <Route path="/pos" element={<POSPage />} />
        
        {/* Admin Suite */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="tasks" element={<TasksPage />} />
          {/* Chunk 2 - Scheduling */}
          <Route path="daily-tasks" element={<DailyTasksPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="time-off" element={<TimeOffPage />} />
          {/* Chunk 3 - Reports & Utilities */}
          <Route path="reports" element={<ReportsPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="music" element={<MusicPage />} />
          <Route path="notify" element={<NotificationsPage />} />
          <Route path="hiring" element={<HiringPage />} />
          {/* Analytics */}
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
