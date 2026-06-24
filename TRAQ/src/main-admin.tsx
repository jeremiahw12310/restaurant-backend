import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { AdminLayout } from './admin/AdminLayout.tsx'
import { DashboardPage } from './admin/pages/DashboardPage.tsx'
import { TeamPage } from './admin/pages/TeamPage.tsx'
import { TasksPage } from './admin/pages/TasksPage.tsx'
import { DailyTasksPage } from './admin/pages/DailyTasksPage.tsx'
import { AvailabilityPage } from './admin/pages/AvailabilityPage.tsx'
import { TimeOffPage } from './admin/pages/TimeOffPage.tsx'
import { ReportsPage } from './admin/pages/ReportsPage.tsx'
import { NotificationsPage } from './admin/pages/NotificationsPage.tsx'
import { SendToPrintPage } from './admin/pages/SendToPrintPage.tsx'
import { LogsPage } from './admin/pages/LogsPage.tsx'
import { MusicPage } from './admin/pages/MusicPage.tsx'
import { HiringPage } from './admin/pages/HiringPage.tsx'
import { StockPage } from './admin/pages/StockPage.tsx'
import { AnalyticsPage } from './admin/pages/AnalyticsPage.tsx'
import { LeaderboardPage } from './admin/pages/LeaderboardPage.tsx'
import { ApplyAnalyticsPage } from './admin/pages/ApplyAnalyticsPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="daily-tasks" element={<DailyTasksPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="time-off" element={<TimeOffPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="music" element={<MusicPage />} />
          <Route path="notify" element={<NotificationsPage />} />
          <Route path="send-print" element={<SendToPrintPage />} />
          <Route path="hiring" element={<HiringPage />} />
          <Route path="apply-analytics" element={<ApplyAnalyticsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
