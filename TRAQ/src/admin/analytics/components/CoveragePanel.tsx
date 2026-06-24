import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TaskAnalytics } from '../buildTaskAnalytics'
import { CHART_COLORS } from '../chartConstants'

type CoveragePanelProps = {
  analytics: TaskAnalytics
  taskNameLookup: Record<string, string>
}

export function CoveragePanel({ analytics, taskNameLookup }: CoveragePanelProps) {
  const [matrixTopN, setMatrixTopN] = useState(12)
  const [matrixSearch, setMatrixSearch] = useState('')
  const [matrixMinTotal, setMatrixMinTotal] = useState(0)

  const filteredTasks = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase()
    return analytics.taskRanking
      .filter((t) => t.count >= matrixMinTotal)
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
      .slice(0, matrixTopN)
  }, [analytics.taskRanking, matrixMinTotal, matrixSearch, matrixTopN])

  const topSkippedTasks = useMemo(() => {
    return analytics.skipRates
      .filter((s) => s.available > 0 && s.skipRate > 0)
      .slice(0, 10)
      .map((s) => ({
        label: s.taskName.length > 26 ? `${s.taskName.slice(0, 26)}…` : s.taskName,
        fullName: s.taskName,
        skipRate: Math.round(s.skipRate),
        completed: s.completed,
        available: s.available,
      }))
  }, [analytics.skipRates])

  const topPartnerWorkTasks = useMemo(() => {
    return analytics.partnerWorkTasks.slice(0, 10).map((t) => ({
      label: t.taskName.length > 26 ? `${t.taskName.slice(0, 26)}…` : t.taskName,
      fullName: t.taskName,
      splitPercentage: Math.round(t.splitPercentage),
      splitCount: t.splitCount,
      singleCount: t.singleCount,
    }))
  }, [analytics.partnerWorkTasks])

  return (
    <div className="analytics-tab-panel">
      <div className="admin-card analytics-matrix-card">
        <h3 className="admin-card-title">Employee × task matrix</h3>
        <p className="analytics-card-subtitle">
          Filter columns by name, minimum total completions, and how many top tasks to show
        </p>
        <div className="analytics-matrix-filters">
          <label className="analytics-filter-field">
            <span>Search task</span>
            <input
              type="search"
              className="analytics-filter-input"
              value={matrixSearch}
              onChange={(e) => setMatrixSearch(e.target.value)}
              placeholder="Name contains…"
            />
          </label>
          <label className="analytics-filter-field">
            <span>Top tasks (max)</span>
            <select
              className="analytics-select"
              value={matrixTopN}
              onChange={(e) => setMatrixTopN(Number(e.target.value))}
            >
              {[8, 12, 16, 20, 25].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="analytics-filter-field">
            <span>Min completions (task total)</span>
            <select
              className="analytics-select"
              value={matrixMinTotal}
              onChange={(e) => setMatrixMinTotal(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {analytics.employeeRanking.length === 0 || filteredTasks.length === 0 ? (
          <div className="analytics-empty">No matrix data for these filters</div>
        ) : (
          <div className="analytics-matrix-wrapper">
            <table className="analytics-matrix">
              <thead>
                <tr>
                  <th className="analytics-matrix-sticky">Employee</th>
                  {filteredTasks.map(({ id, name }) => (
                    <th key={id} title={name}>
                      {name.length > 14 ? `${name.slice(0, 14)}…` : name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.employeeRanking.map(({ name: emp }) => {
                  const maxCount = Math.max(
                    ...filteredTasks.map(({ id }) => analytics.employeeTaskMatrix[emp]?.[id] || 0),
                    1
                  )
                  return (
                    <tr key={emp}>
                      <td className="analytics-matrix-sticky">{emp}</td>
                      {filteredTasks.map(({ id }) => {
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

      <div className="analytics-charts-row">
        <div className="admin-card analytics-chart-card analytics-chart-card-compact">
          <h3 className="admin-card-title">Frequently skipped</h3>
          <p className="analytics-card-subtitle">Scheduled appearances minus completions</p>
          {topSkippedTasks.length === 0 ? (
            <div className="analytics-empty">No skipped tasks detected</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.min(340, 40 + topSkippedTasks.length * 28)}>
                <BarChart data={topSkippedTasks} layout="vertical" margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Skip rate']}
                    labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                  />
                  <Bar dataKey="skipRate" fill="#ef4444" name="Skip %" radius={[0, 4, 4, 0]} />
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

        <div className="admin-card analytics-chart-card analytics-chart-card-compact">
          <h3 className="admin-card-title">Partner dependency</h3>
          <p className="analytics-card-subtitle">Multi-assignee share by task slot</p>
          {topPartnerWorkTasks.length === 0 ? (
            <div className="analytics-empty">No partner work patterns</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.min(340, 40 + topPartnerWorkTasks.length * 28)}>
                <BarChart data={topPartnerWorkTasks} layout="vertical" margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Split %']}
                    labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                  />
                  <Bar dataKey="splitPercentage" fill={CHART_COLORS[1]} name="Split %" radius={[0, 4, 4, 0]} />
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

      <div className="admin-card">
        <h3 className="admin-card-title">Tasks employees never did</h3>
        <p className="analytics-card-subtitle">When a task was on the schedule in range but this person has no completion</p>
        {Object.keys(analytics.employeeNeverDoes).length === 0 ? (
          <div className="analytics-empty">No gaps — everyone touched every scheduled slot</div>
        ) : (
          <div className="analytics-never-does-list">
            {Object.entries(analytics.employeeNeverDoes)
              .sort((a, b) => b[1].length - a[1].length)
              .slice(0, 12)
              .map(([emp, tasks]) => (
                <div key={emp} className="analytics-never-does-item">
                  <div className="analytics-never-does-header">
                    <strong>{emp}</strong>
                    <span className="analytics-never-does-count">{tasks.length} never done</span>
                  </div>
                  <div className="analytics-never-does-tasks">
                    {tasks.slice(0, 12).map((task, idx) => (
                      <span key={idx} className="analytics-never-chip">
                        {task}
                      </span>
                    ))}
                    {tasks.length > 12 && (
                      <span className="analytics-never-chip">+{tasks.length - 12} more</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
