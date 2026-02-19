import { useState, useEffect, useMemo } from 'react'
import './AnalyticsPage.css'
import {
  subscribeToRecentTaskCompletions,
  subscribeToTaskCatalog,
  subscribeToTaskOverrides,
  subscribeToEmployees,
  type TaskState,
  type TaskCatalog,
  type WindowKey,
  type TaskOverrides,
} from '../../services/firestore'
import {
  getWeightsForDateKey,
  type TaskLike,
  type WindowMsFns,
} from '../../utils/taskScoring'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

type TimeRange = 'today' | 'week' | 'month'

const WINDOW_LABELS: Record<WindowKey, string> = {
  '11': '11am',
  '17': '5pm',
  '21': '9pm',
}

// Helper to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper to get date range based on selection
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

// Helper to format date for display
function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Color palette for charts
const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#06b6d4', '#f97316', '#84cc16', '#a855f7',
  '#14b8a6', '#f43f5e', '#6366f1', '#22c55e', '#eab308',
]

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week')
  const [taskState, setTaskState] = useState<TaskState>({})
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalog>({ tasks: [] })
  const [taskOverrides, setTaskOverrides] = useState<TaskOverrides | null>(null)
  const [employees, setEmployees] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Subscribe to employees
  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployees(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to task catalog
  useEffect(() => {
    const unsub = subscribeToTaskCatalog((catalog) => {
      setTaskCatalog(catalog)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to task overrides
  useEffect(() => {
    const unsub = subscribeToTaskOverrides((value) => {
      setTaskOverrides(value)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to completions based on time range
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

  // Build task name lookup
  const taskNameLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    taskCatalog.tasks.forEach((t) => {
      lookup[t.id] = t.name
    })
    return lookup
  }, [taskCatalog])

  // Window timing helpers
  const windowMs: WindowMsFns = useMemo(() => {
    const windowStartMsForDateKey = (dateKey: string, windowKey: WindowKey): number => {
      const baseDate = new Date(`${dateKey}T00:00:00`)
      const start = windowKey === '11' ? '11:00' : windowKey === '17' ? '17:00' : '21:00'
      const [hh, mm] = start.split(':').map((x) => Number(x))
      const d = new Date(baseDate)
      d.setHours(hh || 0, mm || 0, 0, 0)
      return d.getTime()
    }
    const windowCloseMsForDateKey = (dateKey: string, windowKey: WindowKey): number => {
      const baseDate = new Date(`${dateKey}T00:00:00`)
      const nextWindowKey: WindowKey | null = windowKey === '11' ? '17' : windowKey === '17' ? '21' : null
      if (nextWindowKey) {
        const nextStart = nextWindowKey === '17' ? '17:00' : '21:00'
        const [hh, mm] = nextStart.split(':').map((x) => Number(x))
        const d = new Date(baseDate)
        d.setHours(hh || 0, mm || 0, 0, 0)
        return d.getTime()
      }
      const nextDay = new Date(baseDate)
      nextDay.setDate(nextDay.getDate() + 1)
      nextDay.setHours(0, 0, 0, 0)
      return nextDay.getTime()
    }
    return { windowStartMsForDateKey, windowCloseMsForDateKey }
  }, [])

  // Get date range for calculations
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange])

  // Calculate all analytics
  const analytics = useMemo(() => {
    const { from, to } = dateRange
    
    // Build date list
    const dateKeys: string[] = []
    const current = new Date(from)
    const end = new Date(to)
    while (current <= end) {
      dateKeys.push(formatDateKey(current))
      current.setDate(current.getDate() + 1)
    }

    // Count completions
    const byEmployee: Record<string, number> = {}
    const byTask: Record<string, number> = {}
    const byTaskKey: Record<string, number> = {} // taskId::windowKey
    const byWindow: Record<WindowKey, number> = { '11': 0, '17': 0, '21': 0 }
    const byDate: Record<string, number> = {}
    const employeeTaskMatrix: Record<string, Record<string, number>> = {}
    const employeeTaskKeyMatrix: Record<string, Record<string, number>> = {}
    const taskWindowMatrix: Record<string, Record<WindowKey, number>> = {}
    const splitCompletions: Record<string, number> = {} // taskKey -> count of multi-assignee completions
    const singleAssigneeCompletions: Record<string, number> = {} // taskKey -> count of single-assignee completions
    const employeeDailyActivity: Record<string, Record<string, number>> = {} // employee -> dateKey -> count

    let totalCompletions = 0
    let totalSplitCompletions = 0

    Object.entries(taskState).forEach(([dateKey, windows]) => {
      Object.entries(windows).forEach(([windowKey, tasks]) => {
        const wk = windowKey as WindowKey
        
        Object.entries(tasks).forEach(([taskId, completion]) => {
          const taskKey = `${taskId}::${wk}`
          const isSplit = completion.assignees.length > 1
          
          if (isSplit) {
            totalSplitCompletions++
            splitCompletions[taskKey] = (splitCompletions[taskKey] || 0) + 1
          } else {
            singleAssigneeCompletions[taskKey] = (singleAssigneeCompletions[taskKey] || 0) + 1
          }

          totalCompletions++
          byTask[taskId] = (byTask[taskId] || 0) + 1
          byTaskKey[taskKey] = (byTaskKey[taskKey] || 0) + 1
          byDate[dateKey] = (byDate[dateKey] || 0) + 1
          byWindow[wk]++

          if (!taskWindowMatrix[taskId]) {
            taskWindowMatrix[taskId] = { '11': 0, '17': 0, '21': 0 }
          }
          taskWindowMatrix[taskId][wk]++

          completion.assignees.forEach((emp) => {
            byEmployee[emp] = (byEmployee[emp] || 0) + 1
            
            if (!employeeTaskMatrix[emp]) employeeTaskMatrix[emp] = {}
            employeeTaskMatrix[emp][taskId] = (employeeTaskMatrix[emp][taskId] || 0) + 1

            if (!employeeTaskKeyMatrix[emp]) employeeTaskKeyMatrix[emp] = {}
            employeeTaskKeyMatrix[emp][taskKey] = (employeeTaskKeyMatrix[emp][taskKey] || 0) + 1

            if (!employeeDailyActivity[emp]) employeeDailyActivity[emp] = {}
            employeeDailyActivity[emp][dateKey] = (employeeDailyActivity[emp][dateKey] || 0) + 1
          })
        })
      })
    })

    // Calculate available tasks (effective task keys)
    const availableTaskKeys: Record<string, number> = {} // taskKey -> count of times available
    const allTasks = (taskCatalog.tasks || []) as unknown as TaskLike[]

    dateKeys.forEach((dateKey) => {
      const { taskIdsByWindow } = getWeightsForDateKey({
        dateKey,
        allTasks,
        taskOverrides,
        windowMs,
      })
      
      ;(['11', '17', '21'] as WindowKey[]).forEach((wk) => {
        taskIdsByWindow[wk].forEach((taskId) => {
          const taskKey = `${taskId}::${wk}`
          availableTaskKeys[taskKey] = (availableTaskKeys[taskKey] || 0) + 1
        })
      })
    })

    // Calculate skip rates
    const skipRates: Array<{ taskKey: string; taskName: string; available: number; completed: number; skipRate: number }> = []
    Object.entries(availableTaskKeys).forEach(([taskKey, available]) => {
      const completed = byTaskKey[taskKey] || 0
      const skipRate = available > 0 ? ((available - completed) / available) * 100 : 0
      const [taskId] = taskKey.split('::')
      const taskName = taskNameLookup[taskId] || taskId
      skipRates.push({ taskKey, taskName, available, completed, skipRate })
    })
    skipRates.sort((a, b) => b.skipRate - a.skipRate)

    // Calculate partner work patterns
    const partnerWorkTasks: Array<{ taskKey: string; taskName: string; splitCount: number; singleCount: number; splitPercentage: number }> = []
    Object.keys(availableTaskKeys).forEach((taskKey) => {
      const splitCount = splitCompletions[taskKey] || 0
      const singleCount = singleAssigneeCompletions[taskKey] || 0
      const total = splitCount + singleCount
      const splitPercentage = total > 0 ? (splitCount / total) * 100 : 0
      const [taskId] = taskKey.split('::')
      const taskName = taskNameLookup[taskId] || taskId
      if (total > 0) {
        partnerWorkTasks.push({ taskKey, taskName, splitCount, singleCount, splitPercentage })
      }
    })
    partnerWorkTasks.sort((a, b) => b.splitPercentage - a.splitPercentage)

    // Calculate employee never-does tasks
    const employeeNeverDoes: Record<string, string[]> = {}
    employees.forEach((emp) => {
      const done = employeeTaskKeyMatrix[emp] || {}
      const neverDoes: string[] = []
      Object.keys(availableTaskKeys).forEach((taskKey) => {
        if (!done[taskKey]) {
          const [taskId, wk] = taskKey.split('::')
          const taskName = taskNameLookup[taskId] || taskId
          neverDoes.push(`${taskName} (${WINDOW_LABELS[wk as WindowKey]})`)
        }
      })
      if (neverDoes.length > 0) {
        employeeNeverDoes[emp] = neverDoes
      }
    })

    // Employee rankings
    const employeeRanking = Object.entries(byEmployee)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))

    // Task rankings
    const taskRanking = Object.entries(byTask)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, name: taskNameLookup[id] || id, count }))

    // Task key rankings (with window)
    const taskKeyRanking = Object.entries(byTaskKey)
      .sort((a, b) => b[1] - a[1])
      .map(([taskKey, count]) => {
        const [taskId, wk] = taskKey.split('::')
        return {
          taskKey,
          taskId,
          windowKey: wk as WindowKey,
          name: `${taskNameLookup[taskId] || taskId} (${WINDOW_LABELS[wk as WindowKey]})`,
          count,
        }
      })

    // Daily trends data
    const dailyTrends = dateKeys.map((dateKey) => ({
      date: formatDisplayDate(dateKey),
      dateKey,
      completions: byDate[dateKey] || 0,
    }))

    // Employee activity trends
    const employeeTrends: Array<{ date: string; dateKey: string; [employee: string]: string | number }> = dateKeys.map((dateKey) => {
      const entry: any = {
        date: formatDisplayDate(dateKey),
        dateKey,
      }
      employees.forEach((emp) => {
        entry[emp] = employeeDailyActivity[emp]?.[dateKey] || 0
      })
      return entry
    })

    // Calculate insights
    const redFlags: string[] = []
    const recommendations: string[] = []

    // Red flags
    Object.entries(employeeNeverDoes).forEach(([emp, tasks]) => {
      if (tasks.length > 5) {
        redFlags.push(`${emp} never does ${tasks.length} different tasks`)
      }
    })

    partnerWorkTasks.forEach(({ taskName, splitPercentage }) => {
      if (splitPercentage > 80) {
        redFlags.push(`${taskName} is almost always done by multiple people (${Math.round(splitPercentage)}%)`)
      }
    })

    skipRates.forEach(({ taskName, skipRate }) => {
      if (skipRate > 50) {
        redFlags.push(`${taskName} is skipped ${Math.round(skipRate)}% of the time`)
      }
    })

    // Recommendations
    const topEmployees = employeeRanking.slice(0, 3).map((e) => e.name)
    const bottomEmployees = employeeRanking.slice(-3).map((e) => e.name)
    if (bottomEmployees.length > 0) {
      recommendations.push(`Consider redistributing tasks from ${topEmployees.join(', ')} to ${bottomEmployees.join(', ')}`)
    }

    const alwaysSplitTasks = partnerWorkTasks.filter((t) => t.splitPercentage > 90).map((t) => t.taskName)
    if (alwaysSplitTasks.length > 0) {
      recommendations.push(`These tasks are always split: ${alwaysSplitTasks.slice(0, 3).join(', ')} - consider if workload is too high`)
    }

    return {
      totalCompletions,
      totalSplitCompletions,
      splitTaskRate: totalCompletions > 0 ? (totalSplitCompletions / totalCompletions) * 100 : 0,
      byEmployee,
      byTask,
      byTaskKey,
      byWindow,
      byDate,
      employeeRanking,
      taskRanking,
      taskKeyRanking,
      employeeTaskMatrix,
      employeeTaskKeyMatrix,
      taskWindowMatrix,
      availableTaskKeys,
      skipRates,
      partnerWorkTasks,
      employeeNeverDoes,
      dailyTrends,
      employeeTrends,
      redFlags,
      recommendations,
      dateKeys,
    }
  }, [taskState, taskCatalog, taskOverrides, employees, taskNameLookup, windowMs, dateRange])

  // Prepare pie chart data
  const taskDistributionData = useMemo(() => {
    return analytics.taskRanking.slice(0, 10).map((t) => ({
      name: t.name.length > 20 ? t.name.substring(0, 20) + '...' : t.name,
      value: t.count,
      fullName: t.name,
    }))
  }, [analytics.taskRanking])

  const employeeActivityData = useMemo(() => {
    return analytics.employeeRanking.map((e) => ({
      name: e.name,
      value: e.count,
    }))
  }, [analytics.employeeRanking])

  const shiftDistributionData = useMemo(() => {
    return (['11', '17', '21'] as WindowKey[]).map((wk) => ({
      name: WINDOW_LABELS[wk],
      value: analytics.byWindow[wk],
    }))
  }, [analytics.byWindow])

  // Top skipped tasks
  const topSkippedTasks = useMemo(() => {
    return analytics.skipRates
      .filter((s) => s.available > 0 && s.skipRate > 0)
      .slice(0, 10)
      .map((s) => ({
        name: s.taskName.length > 25 ? s.taskName.substring(0, 25) + '...' : s.taskName,
        skipRate: Math.round(s.skipRate),
        completed: s.completed,
        available: s.available,
        fullName: s.taskName,
      }))
  }, [analytics.skipRates])

  // Top partner work tasks
  const topPartnerWorkTasks = useMemo(() => {
    return analytics.partnerWorkTasks.slice(0, 10).map((t) => ({
      name: t.taskName.length > 25 ? t.taskName.substring(0, 25) + '...' : t.taskName,
      splitPercentage: Math.round(t.splitPercentage),
      splitCount: t.splitCount,
      singleCount: t.singleCount,
      fullName: t.taskName,
    }))
  }, [analytics.partnerWorkTasks])

  // Employee task breakdown (top tasks per employee)
  const employeeTaskBreakdown = useMemo(() => {
    const breakdown: Array<{ employee: string; task: string; count: number }> = []
    Object.entries(analytics.employeeTaskMatrix).forEach(([emp, tasks]) => {
      Object.entries(tasks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([taskId, count]) => {
          breakdown.push({
            employee: emp,
            task: taskNameLookup[taskId] || taskId,
            count,
          })
        })
    })
    return breakdown.sort((a, b) => b.count - a.count).slice(0, 20)
  }, [analytics.employeeTaskMatrix, taskNameLookup])

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
          <h1>Analytics Dashboard</h1>
          <p>Insights into task distribution, employee activity, and work patterns.</p>
        </div>
        <div className="analytics-time-range">
          <button
            className={`analytics-range-btn ${timeRange === 'today' ? 'active' : ''}`}
            onClick={() => setTimeRange('today')}
          >
            Today
          </button>
          <button
            className={`analytics-range-btn ${timeRange === 'week' ? 'active' : ''}`}
            onClick={() => setTimeRange('week')}
          >
            Last 7 Days
          </button>
          <button
            className={`analytics-range-btn ${timeRange === 'month' ? 'active' : ''}`}
            onClick={() => setTimeRange('month')}
          >
            Last 30 Days
          </button>
        </div>
      </header>

      {/* Overview Dashboard - Pie Charts */}
      <div className="analytics-overview-dashboard">
        <div className="admin-card analytics-chart-card">
          <h3 className="admin-card-title">Task Distribution</h3>
          <p className="analytics-card-subtitle">Top 10 most completed tasks</p>
          {taskDistributionData.length === 0 ? (
            <div className="analytics-empty">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={taskDistributionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {taskDistributionData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'Completions']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="admin-card analytics-chart-card">
          <h3 className="admin-card-title">Employee Activity</h3>
          <p className="analytics-card-subtitle">Task completions by employee</p>
          {employeeActivityData.length === 0 ? (
            <div className="analytics-empty">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={employeeActivityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {employeeActivityData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'Tasks']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="admin-card analytics-chart-card">
          <h3 className="admin-card-title">Shift Distribution</h3>
          <p className="analytics-card-subtitle">Tasks by time window</p>
          {shiftDistributionData.every((d) => d.value === 0) ? (
            <div className="analytics-empty">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={shiftDistributionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {shiftDistributionData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'Tasks']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="admin-card analytics-chart-card">
          <h3 className="admin-card-title">Partner Work Rate</h3>
          <p className="analytics-card-subtitle">
            {analytics.totalCompletions > 0
              ? `${Math.round(analytics.splitTaskRate)}% of tasks completed by multiple people`
              : 'No completions'}
          </p>
          <div className="analytics-split-rate-display">
            <div className="analytics-split-rate-value">{Math.round(analytics.splitTaskRate)}%</div>
            <div className="analytics-split-rate-bar">
              <div
                className="analytics-split-rate-fill"
                style={{ width: `${analytics.splitTaskRate}%` }}
              />
            </div>
            <div className="analytics-split-rate-details">
              <span>{analytics.totalSplitCompletions} split</span>
              <span>{analytics.totalCompletions - analytics.totalSplitCompletions} solo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Who's Doing What */}
      <div className="analytics-section">
        <h2 className="analytics-section-title">Who's Doing What</h2>
        
        <div className="analytics-charts-row">
          <div className="admin-card analytics-chart-card">
            <h3 className="admin-card-title">Employee Task Breakdown</h3>
            <p className="analytics-card-subtitle">Top task assignments by employee</p>
            {employeeTaskBreakdown.length === 0 ? (
              <div className="analytics-empty">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={employeeTaskBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="task" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#3b82f6" name="Completions" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="admin-card analytics-chart-card">
            <h3 className="admin-card-title">Activity Trends</h3>
            <p className="analytics-card-subtitle">Daily task completions over time</p>
            {analytics.dailyTrends.length === 0 ? (
              <div className="analytics-empty">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={analytics.dailyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="completions" stroke="#3b82f6" name="Total Completions" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Employee-Task Heatmap */}
        <div className="admin-card analytics-matrix-card">
          <h3 className="admin-card-title">Employee x Task Matrix</h3>
          <p className="analytics-card-subtitle">Heatmap showing task frequency by employee</p>
          {analytics.employeeRanking.length === 0 || analytics.taskRanking.length === 0 ? (
            <div className="analytics-empty">No matrix data yet</div>
          ) : (
            <div className="analytics-matrix-wrapper">
              <table className="analytics-matrix">
                <thead>
                  <tr>
                    <th className="analytics-matrix-sticky">Employee</th>
                    {analytics.taskRanking.slice(0, 15).map(({ id, name }) => (
                      <th key={id} title={name}>
                        {name.length > 15 ? name.substring(0, 15) + '...' : name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.employeeRanking.map(({ name: emp }) => {
                    const maxCount = Math.max(
                      ...analytics.taskRanking.slice(0, 15).map(
                        ({ id }) => analytics.employeeTaskMatrix[emp]?.[id] || 0
                      ),
                      1
                    )
                    return (
                      <tr key={emp}>
                        <td className="analytics-matrix-sticky">{emp}</td>
                        {analytics.taskRanking.slice(0, 15).map(({ id }) => {
                          const count = analytics.employeeTaskMatrix[emp]?.[id] || 0
                          const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0
                          return (
                            <td key={id}>
                              <div
                                className="analytics-matrix-cell"
                                style={{
                                  backgroundColor: count > 0 ? `rgba(59, 130, 246, ${intensity})` : undefined,
                                }}
                                title={`${emp} • ${taskNameLookup[id] || id}: ${count}`}
                              >
                                {count > 0 ? count : ''}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Skipped Tasks & Partner Work */}
      <div className="analytics-section">
        <h2 className="analytics-section-title">Skipped Tasks & Partner Work</h2>
        
        <div className="analytics-charts-row">
          <div className="admin-card analytics-chart-card">
            <h3 className="admin-card-title">Frequently Skipped Tasks</h3>
            <p className="analytics-card-subtitle">Tasks that should be done but aren't</p>
            {topSkippedTasks.length === 0 ? (
              <div className="analytics-empty">No skipped tasks detected</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topSkippedTasks} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Skip Rate']} />
                    <Bar dataKey="skipRate" fill="#ef4444" name="Skip Rate %" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="analytics-skipped-list">
                  {topSkippedTasks.slice(0, 5).map((task, idx) => (
                    <div key={idx} className="analytics-skipped-item">
                      <span className="analytics-skipped-name">{task.fullName}</span>
                      <span className="analytics-skipped-stats">
                        {task.completed}/{task.available} ({task.skipRate}% skipped)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="admin-card analytics-chart-card">
            <h3 className="admin-card-title">Partner Dependency</h3>
            <p className="analytics-card-subtitle">Tasks frequently done by multiple people</p>
            {topPartnerWorkTasks.length === 0 ? (
              <div className="analytics-empty">No partner work patterns detected</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topPartnerWorkTasks} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Split %']} />
                    <Bar dataKey="splitPercentage" fill="#8b5cf6" name="Split %" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="analytics-partner-list">
                  {topPartnerWorkTasks.slice(0, 5).map((task, idx) => (
                    <div key={idx} className="analytics-partner-item">
                      <span className="analytics-partner-name">{task.fullName}</span>
                      <span className="analytics-partner-stats">
                        {task.splitCount} split, {task.singleCount} solo ({task.splitPercentage}% split)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Employees Who Never Do Certain Tasks */}
        <div className="admin-card">
          <h3 className="admin-card-title">Tasks Employees Avoid</h3>
          <p className="analytics-card-subtitle">Employees who never do specific tasks (even when available)</p>
          {Object.keys(analytics.employeeNeverDoes).length === 0 ? (
            <div className="analytics-empty">All employees are doing all available tasks</div>
          ) : (
            <div className="analytics-never-does-list">
              {Object.entries(analytics.employeeNeverDoes)
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 10)
                .map(([emp, tasks]) => (
                  <div key={emp} className="analytics-never-does-item">
                    <div className="analytics-never-does-header">
                      <strong>{emp}</strong>
                      <span className="analytics-never-does-count">{tasks.length} tasks never done</span>
                    </div>
                    <div className="analytics-never-does-tasks">
                      {tasks.slice(0, 10).map((task, idx) => (
                        <span key={idx} className="analytics-never-chip">{task}</span>
                      ))}
                      {tasks.length > 10 && <span className="analytics-never-chip">+{tasks.length - 10} more</span>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Trends Over Time */}
      <div className="analytics-section">
        <h2 className="analytics-section-title">Trends Over Time</h2>
        
        <div className="admin-card analytics-chart-card">
          <h3 className="admin-card-title">Employee Activity Trends</h3>
          <p className="analytics-card-subtitle">Daily task completions by employee</p>
          {analytics.employeeTrends.length === 0 ? (
            <div className="analytics-empty">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={analytics.employeeTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {analytics.employeeRanking.slice(0, 8).map(({ name }, idx) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    name={name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Insights & Alerts */}
      <div className="analytics-section">
        <h2 className="analytics-section-title">Insights & Alerts</h2>
        
        <div className="analytics-charts-row">
          <div className="admin-card">
            <h3 className="admin-card-title">⚠️ Red Flags</h3>
            {analytics.redFlags.length === 0 ? (
              <div className="analytics-empty">No red flags detected</div>
            ) : (
              <ul className="analytics-alerts-list">
                {analytics.redFlags.map((flag, idx) => (
                  <li key={idx} className="analytics-alert-item analytics-alert-red">
                    {flag}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-card">
            <h3 className="admin-card-title">💡 Recommendations</h3>
            {analytics.recommendations.length === 0 ? (
              <div className="analytics-empty">No recommendations at this time</div>
            ) : (
              <ul className="analytics-alerts-list">
                {analytics.recommendations.map((rec, idx) => (
                  <li key={idx} className="analytics-alert-item analytics-alert-blue">
                    {rec}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsPage
