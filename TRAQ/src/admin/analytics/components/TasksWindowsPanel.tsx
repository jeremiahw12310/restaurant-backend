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
import { WINDOW_LABELS } from '../buildTaskAnalytics'
import type { WindowKey } from '../../../services/firestore'
import { CHART_COLORS } from '../chartConstants'

type SortDir = 'asc' | 'desc'

function useSortable<T extends Record<string, unknown>>(rows: T[], initialKey: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T>(initialKey)
  const [dir, setDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'desc' ? bv - av : av - bv
      }
      const as = String(av)
      const bs = String(bv)
      return dir === 'desc' ? bs.localeCompare(as) : as.localeCompare(bs)
    })
    return copy
  }, [rows, sortKey, dir])

  const toggle = (key: keyof T) => {
    if (sortKey === key) {
      setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setDir(key === 'name' || key === 'taskName' || key === 'label' ? 'asc' : 'desc')
    }
  }

  return { sorted, sortKey, dir, toggle }
}

type TasksWindowsPanelProps = {
  analytics: TaskAnalytics
}

export function TasksWindowsPanel({ analytics }: TasksWindowsPanelProps) {
  const taskRows = analytics.taskRanking.map((t) => ({
    name: t.name,
    count: t.count,
  }))
  const taskKeyRows = analytics.taskKeyRanking.map((t) => ({
    name: t.name,
    count: t.count,
  }))

  const windowRows = (['11', '17', '21'] as WindowKey[]).map((wk) => ({
    label: WINDOW_LABELS[wk],
    count: analytics.byWindow[wk],
  }))

  const partnerChart = analytics.partnerWorkTasks.slice(0, 12).map((t) => ({
    label: t.taskName.length > 24 ? `${t.taskName.slice(0, 24)}…` : t.taskName,
    fullName: t.taskName,
    splitPercentage: Math.round(t.splitPercentage),
  }))

  const taskSort = useSortable(taskRows, 'count')
  const taskKeySort = useSortable(taskKeyRows, 'count')
  const windowSort = useSortable(windowRows, 'count')

  return (
    <div className="analytics-tab-panel">
      <div className="analytics-charts-row">
        <div className="admin-card analytics-table-card">
          <h3 className="admin-card-title">Tasks (all windows)</h3>
          <p className="analytics-card-subtitle">Sorted by completions — click a column header</p>
          <div className="analytics-table-wrap">
            <table className="analytics-data-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="analytics-th-btn" onClick={() => taskSort.toggle('name')}>
                      Task {taskSort.sortKey === 'name' ? (taskSort.dir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="analytics-num">
                    <button type="button" className="analytics-th-btn" onClick={() => taskSort.toggle('count')}>
                      Completions {taskSort.sortKey === 'count' ? (taskSort.dir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {taskSort.sorted.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="analytics-num">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-card analytics-table-card">
          <h3 className="admin-card-title">Tasks by window</h3>
          <p className="analytics-card-subtitle">Same task in different windows counted separately</p>
          <div className="analytics-table-wrap">
            <table className="analytics-data-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="analytics-th-btn" onClick={() => taskKeySort.toggle('name')}>
                      Task {taskKeySort.sortKey === 'name' ? (taskKeySort.dir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="analytics-num">
                    <button type="button" className="analytics-th-btn" onClick={() => taskKeySort.toggle('count')}>
                      Completions {taskKeySort.sortKey === 'count' ? (taskKeySort.dir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {taskKeySort.sorted.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="analytics-num">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="analytics-charts-row">
        <div className="admin-card analytics-table-card">
          <h3 className="admin-card-title">Volume by window</h3>
          <p className="analytics-card-subtitle">Completions in each time bucket</p>
          <div className="analytics-table-wrap">
            <table className="analytics-data-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="analytics-th-btn" onClick={() => windowSort.toggle('label')}>
                      Window {windowSort.sortKey === 'label' ? (windowSort.dir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                  <th className="analytics-num">
                    <button type="button" className="analytics-th-btn" onClick={() => windowSort.toggle('count')}>
                      Tasks {windowSort.sortKey === 'count' ? (windowSort.dir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {windowSort.sorted.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="analytics-num">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-card analytics-chart-card analytics-chart-card-compact">
          <h3 className="admin-card-title">Partner-heavy tasks</h3>
          <p className="analytics-card-subtitle">Share of completions that were multi-assignee</p>
          {partnerChart.length === 0 ? (
            <div className="analytics-empty">No partner patterns in range</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.min(380, 48 + partnerChart.length * 26)}>
              <BarChart data={partnerChart} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="label" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Split %']}
                  labelFormatter={(_, p) => (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                />
                <Bar dataKey="splitPercentage" fill={CHART_COLORS[2]} name="Split %" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
