import type { ReactNode } from 'react'
import type { StockReport } from '../services/firestore'
import { shouldSplitPendingSections, splitPendingByKind } from './stockReportHelpers'

export type StockPendingReportListProps = {
  reports: StockReport[]
  renderCard: (report: StockReport) => ReactNode
  emptyMessage: string
  leadingCard?: ReactNode
}

function StockSectionHeader({
  label,
  count,
  countVariant,
}: {
  label: string
  count: number
  countVariant: 'out' | 'low' | 'default'
}) {
  return (
    <div className="stock-section-header">
      <span className="stock-section-header-label">{label}</span>
      <span className={`stock-section-count stock-section-count--${countVariant}`}>{count}</span>
    </div>
  )
}

export function StockPendingReportList({
  reports,
  renderCard,
  emptyMessage,
  leadingCard,
}: StockPendingReportListProps) {
  if (reports.length === 0) {
    return (
      <>
        {leadingCard ? (
          <div className="stock-bubble-grid" role="list">
            {leadingCard}
          </div>
        ) : null}
        <div className="stock-check-empty">{emptyMessage}</div>
      </>
    )
  }

  const split = shouldSplitPendingSections(reports)
  const { out, low } = splitPendingByKind(reports)

  if (split) {
    return (
      <div className="stock-bubble-groups" role="list">
        <StockSectionHeader label="Out of Stock" count={out.length} countVariant="out" />
        <div className="stock-bubble-grid">
          {leadingCard}
          {out.map((r) => renderCard(r))}
        </div>
        <StockSectionHeader label="Low Stock" count={low.length} countVariant="low" />
        <div className="stock-bubble-grid">{low.map((r) => renderCard(r))}</div>
      </div>
    )
  }

  return (
    <div className="stock-bubble-grid" role="list">
      {leadingCard}
      {reports.map((r) => renderCard(r))}
    </div>
  )
}
