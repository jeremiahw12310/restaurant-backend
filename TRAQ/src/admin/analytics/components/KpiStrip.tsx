import type { TaskAnalytics } from '../buildTaskAnalytics'

type KpiStripProps = {
  analytics: TaskAnalytics
  daysInRange: number
}

export function KpiStrip({ analytics, daysInRange }: KpiStripProps) {
  const perDay =
    daysInRange > 0 ? Math.round((analytics.totalCompletions / daysInRange) * 10) / 10 : 0
  const topSkip = analytics.skipRates.find((s) => s.available > 0 && s.skipRate > 0)

  return (
    <div className="analytics-kpi-strip" role="region" aria-label="Summary metrics">
      <div className="analytics-kpi-card">
        <span className="analytics-kpi-label">Total completions</span>
        <span className="analytics-kpi-value">{analytics.totalCompletions}</span>
      </div>
      <div className="analytics-kpi-card">
        <span className="analytics-kpi-label">Avg per day</span>
        <span className="analytics-kpi-value">{perDay}</span>
      </div>
      <div className="analytics-kpi-card">
        <span className="analytics-kpi-label">Split completions</span>
        <span className="analytics-kpi-value">{Math.round(analytics.splitTaskRate)}%</span>
      </div>
      <div className="analytics-kpi-card analytics-kpi-card-wide">
        <span className="analytics-kpi-label">Highest skip rate</span>
        <span className="analytics-kpi-value analytics-kpi-value-muted">
          {topSkip
            ? `${topSkip.taskName} (${Math.round(topSkip.skipRate)}%)`
            : '—'}
        </span>
      </div>
    </div>
  )
}
