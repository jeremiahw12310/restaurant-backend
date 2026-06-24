import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TaskAnalytics } from '../buildTaskAnalytics'
import { WINDOW_LABELS } from '../buildTaskAnalytics'
import type { WindowKey } from '../../../services/firestore'
import { CHART_COLORS } from '../chartConstants'

type OverviewPanelProps = {
  analytics: TaskAnalytics
}

function HBar({
  title,
  subtitle,
  data,
  valueLabel,
  emptyMessage,
  barColor,
}: {
  title: string
  subtitle: string
  data: Array<{ label: string; fullName: string; value: number }>
  valueLabel: string
  emptyMessage: string
  barColor: string
}) {
  if (data.length === 0) {
    return (
      <div className="admin-card analytics-chart-card analytics-chart-card-compact">
        <h3 className="admin-card-title">{title}</h3>
        <p className="analytics-card-subtitle">{subtitle}</p>
        <div className="analytics-empty">{emptyMessage}</div>
      </div>
    )
  }
  const height = Math.min(420, 40 + data.length * 28)
  return (
    <div className="admin-card analytics-chart-card analytics-chart-card-compact">
      <h3 className="admin-card-title">{title}</h3>
      <p className="analytics-card-subtitle">{subtitle}</p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number | undefined) => [value ?? 0, valueLabel]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { fullName?: string } | undefined
              return row?.fullName ?? ''
            }}
          />
          <Bar dataKey="value" fill={barColor} name={valueLabel} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function OverviewPanel({ analytics }: OverviewPanelProps) {
  const taskBars = analytics.taskRanking.slice(0, 10).map((t) => ({
    label: t.name.length > 22 ? `${t.name.slice(0, 22)}…` : t.name,
    fullName: t.name,
    value: t.count,
  }))

  const employeeBars = analytics.employeeRanking.slice(0, 12).map((e) => ({
    label: e.name.length > 18 ? `${e.name.slice(0, 18)}…` : e.name,
    fullName: e.name,
    value: e.count,
  }))

  const windowBars = (['11', '17', '21'] as WindowKey[]).map((wk) => ({
    label: WINDOW_LABELS[wk],
    fullName: `${WINDOW_LABELS[wk]} window`,
    value: analytics.byWindow[wk],
  }))

  const alertCount = analytics.redFlags.length + analytics.recommendations.length

  return (
    <div className="analytics-tab-panel">
      <div className="analytics-overview-dashboard">
        <HBar
          title="Tasks completed"
          subtitle="Top 10 tasks by completion count"
          data={taskBars}
          valueLabel="Completions"
          emptyMessage="No data for this period"
          barColor={CHART_COLORS[0]}
        />
        <HBar
          title="By employee"
          subtitle="Completions credited per person"
          data={employeeBars}
          valueLabel="Completions"
          emptyMessage="No data for this period"
          barColor={CHART_COLORS[1]}
        />
        <HBar
          title="By window"
          subtitle="11am, 5pm, and 9pm buckets"
          data={windowBars.every((d) => d.value === 0) ? [] : windowBars}
          valueLabel="Tasks"
          emptyMessage="No data for this period"
          barColor={CHART_COLORS[4]}
        />

        <div className="admin-card analytics-chart-card analytics-chart-card-compact">
          <h3 className="admin-card-title">Partner work rate</h3>
          <p className="analytics-card-subtitle">
            {analytics.totalCompletions > 0
              ? `${Math.round(analytics.splitTaskRate)}% of completions had multiple assignees`
              : 'No completions in range'}
          </p>
          <div className="analytics-split-rate-display">
            <div className="analytics-split-rate-value">{Math.round(analytics.splitTaskRate)}%</div>
            <div className="analytics-split-rate-bar">
              <div
                className="analytics-split-rate-fill"
                style={{ width: `${Math.min(100, analytics.splitTaskRate)}%` }}
              />
            </div>
            <div className="analytics-split-rate-details">
              <span>{analytics.totalSplitCompletions} split</span>
              <span>{analytics.totalCompletions - analytics.totalSplitCompletions} solo</span>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card analytics-chart-card">
        <h3 className="admin-card-title">Daily completions</h3>
        <p className="analytics-card-subtitle">Total task completions per day</p>
        {analytics.dailyTrends.length === 0 ? (
          <div className="analytics-empty">No data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={analytics.dailyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="completions" stroke={CHART_COLORS[0]} name="Total" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <details className="admin-card analytics-alerts-details">
        <summary className="analytics-alerts-summary">
          Alerts and suggestions
          {alertCount > 0 ? (
            <span className="analytics-alerts-badge">{alertCount}</span>
          ) : null}
        </summary>
        <div className="analytics-charts-row analytics-alerts-inner">
          <div>
            <h4 className="analytics-subheading">Red flags</h4>
            {analytics.redFlags.length === 0 ? (
              <p className="analytics-muted">None detected (thresholds: high skip rate, uneven coverage, heavy partner work).</p>
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
          <div>
            <h4 className="analytics-subheading">Suggestions</h4>
            {analytics.recommendations.length === 0 ? (
              <p className="analytics-muted">No automated suggestions for this range.</p>
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
      </details>
    </div>
  )
}
