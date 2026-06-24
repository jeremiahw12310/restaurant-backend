import { useState, useEffect, useMemo } from 'react'
import './AnalyticsPage.css'
import {
  subscribeToRecentTaskCompletions,
  subscribeToTaskCatalog,
  subscribeToTaskOverrides,
  subscribeToEmployees,
  type TaskState,
  type TaskCatalog,
  type TaskOverrides,
} from '../../services/firestore'
import { buildTaskAnalytics, createAnalyticsWindowMs, formatDateKey } from '../analytics/buildTaskAnalytics'
import { KpiStrip } from '../analytics/components/KpiStrip'
import { OverviewPanel } from '../analytics/components/OverviewPanel'
import { TasksWindowsPanel } from '../analytics/components/TasksWindowsPanel'
import { PeoplePanel } from '../analytics/components/PeoplePanel'
import { CoveragePanel } from '../analytics/components/CoveragePanel'

type TimeRange = 'today' | 'week' | 'month'

type AnalyticsTab = 'overview' | 'tasks' | 'people' | 'coverage'

function getDateRange(range: TimeRange): { from: string; to: string } {
  const now = new Date()
  const today = formatDateKey(now)

  if (range === 'today') {
    return { from: today, to: today }
  }

  const daysAgo = range === 'week' ? 7 : 30
  const fromDate = new Date(now)
  fromDate.setDate(fromDate.getDate() - daysAgo + 1)

  return { from: formatDateKey(fromDate), to: today }
}

const TAB_LABELS: Record<AnalyticsTab, string> = {
  overview: 'Overview',
  tasks: 'Tasks & windows',
  people: 'People',
  coverage: 'Coverage & skips',
}

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week')
  const [tab, setTab] = useState<AnalyticsTab>('overview')
  const [taskState, setTaskState] = useState<TaskState>({})
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalog>({ tasks: [] })
  const [taskOverrides, setTaskOverrides] = useState<TaskOverrides | null>(null)
  const [employees, setEmployees] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployees(list)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeToTaskCatalog((catalog) => {
      setTaskCatalog(catalog)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const unsub = subscribeToTaskOverrides((value) => {
      setTaskOverrides(value)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    setLoading(true)
    const { from, to } = getDateRange(timeRange)

    const unsub = subscribeToRecentTaskCompletions(
      from,
      to,
      (state) => {
        setTaskState(state)
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
      { saveToLocalStorage: false }
    )

    return () => unsub?.()
  }, [timeRange])

  const windowMs = useMemo(() => createAnalyticsWindowMs(), [])
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange])

  const taskNameLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    taskCatalog.tasks.forEach((t) => {
      lookup[t.id] = t.name
    })
    return lookup
  }, [taskCatalog])

  const analytics = useMemo(
    () =>
      buildTaskAnalytics({
        taskState,
        taskCatalog,
        taskOverrides,
        employees,
        windowMs,
        dateRange,
      }),
    [taskState, taskCatalog, taskOverrides, employees, windowMs, dateRange]
  )

  const daysInRange = analytics.dateKeys.length

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <span className="analytics-spinner">⏳</span>
          <p>Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="analytics-page">
      <header className="admin-page-header analytics-header">
        <div>
          <h1>Analytics</h1>
          <p>Task distribution, coverage, and team activity — view only; does not change scoring.</p>
        </div>
        <div className="analytics-time-range">
          <button
            type="button"
            className={`analytics-range-btn ${timeRange === 'today' ? 'active' : ''}`}
            onClick={() => setTimeRange('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`analytics-range-btn ${timeRange === 'week' ? 'active' : ''}`}
            onClick={() => setTimeRange('week')}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            className={`analytics-range-btn ${timeRange === 'month' ? 'active' : ''}`}
            onClick={() => setTimeRange('month')}
          >
            Last 30 Days
          </button>
        </div>
      </header>

      <KpiStrip analytics={analytics} daysInRange={daysInRange} />

      <nav className="analytics-tabs" role="tablist" aria-label="Analytics sections">
        {(Object.keys(TAB_LABELS) as AnalyticsTab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`analytics-tab ${tab === id ? 'analytics-tab-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="analytics-tab-content" role="tabpanel">
        {tab === 'overview' && <OverviewPanel analytics={analytics} />}
        {tab === 'tasks' && <TasksWindowsPanel analytics={analytics} />}
        {tab === 'people' && <PeoplePanel analytics={analytics} />}
        {tab === 'coverage' && <CoveragePanel analytics={analytics} taskNameLookup={taskNameLookup} />}
      </div>
    </div>
  )
}

export default AnalyticsPage
