import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TaskAnalytics } from '../buildTaskAnalytics'
import { CHART_COLORS } from '../chartConstants'

type PeoplePanelProps = {
  analytics: TaskAnalytics
}

const TOP_LINES = 6

export function PeoplePanel({ analytics }: PeoplePanelProps) {
  const [pickedEmployee, setPickedEmployee] = useState<string | null>(null)
  const topName = analytics.employeeRanking[0]?.name ?? ''
  const selectedEmployee =
    pickedEmployee && analytics.employeeRanking.some((e) => e.name === pickedEmployee)
      ? pickedEmployee
      : topName

  const idToName = useMemo(() => {
    const m: Record<string, string> = {}
    analytics.taskRanking.forEach((t) => {
      m[t.id] = t.name
    })
    return m
  }, [analytics.taskRanking])

  const employeeBars = useMemo(() => {
    if (!selectedEmployee) return []
    const tasks = analytics.employeeTaskMatrix[selectedEmployee] || {}
    return Object.entries(tasks)
      .map(([taskId, count]) => {
        const fullName = idToName[taskId] || taskId
        return {
          taskId,
          label: fullName.length > 24 ? `${fullName.slice(0, 24)}…` : fullName,
          fullName,
          count,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  }, [analytics.employeeTaskMatrix, idToName, selectedEmployee])

  const topNames = analytics.employeeRanking.slice(0, TOP_LINES).map((e) => e.name)

  if (analytics.employeeRanking.length === 0) {
    return (
      <div className="analytics-tab-panel">
        <div className="admin-card">
          <h3 className="admin-card-title">People</h3>
          <p className="analytics-empty">No employee completions in this range</p>
        </div>
      </div>
    )
  }

  return (
    <div className="analytics-tab-panel">
      <div className="admin-card analytics-table-card">
        <h3 className="admin-card-title">Team totals</h3>
        <p className="analytics-card-subtitle">Completions credited in this range</p>
        <div className="analytics-table-wrap">
          <table className="analytics-data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="analytics-num">Completions</th>
              </tr>
            </thead>
            <tbody>
              {analytics.employeeRanking.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td className="analytics-num">{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analytics-charts-row">
        <div className="admin-card analytics-chart-card analytics-chart-card-compact">
          <h3 className="admin-card-title">Top tasks for one person</h3>
          <p className="analytics-card-subtitle">Pick an employee — each row is unique (person + task)</p>
          <div className="analytics-employee-picker">
            <label htmlFor="analytics-emp-select" className="analytics-picker-label">
              Employee
            </label>
            <select
              id="analytics-emp-select"
              className="analytics-select"
              value={selectedEmployee}
              onChange={(e) => setPickedEmployee(e.target.value)}
            >
              {analytics.employeeRanking.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name} ({e.count})
                </option>
              ))}
            </select>
          </div>
          {employeeBars.length === 0 ? (
            <div className="analytics-empty">No task data for this person</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.min(400, 48 + employeeBars.length * 28)}>
              <BarChart data={employeeBars} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="label" type="category" width={150} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number | undefined) => [v ?? 0, 'Completions']}
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload as { fullName?: string; taskId?: string } | undefined
                    return row?.fullName ?? row?.taskId ?? ''
                  }}
                />
                <Bar dataKey="count" fill={CHART_COLORS[0]} name="Completions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="admin-card analytics-chart-card">
          <h3 className="admin-card-title">Daily activity</h3>
          <p className="analytics-card-subtitle">Up to {TOP_LINES} people (by total completions)</p>
          {analytics.employeeTrends.length === 0 ? (
            <div className="analytics-empty">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={analytics.employeeTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {topNames.map((name, idx) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    name={name}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
