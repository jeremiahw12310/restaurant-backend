import type { StockReport } from '../services/firestore'

export type StockItemBubbleProps = {
  report: StockReport
  beginTap: (e: React.TouchEvent) => void
  moveTap: (e: React.TouchEvent) => void
  endTap: (fn: () => void, e: React.TouchEvent) => void
  shouldIgnoreClick: () => boolean

  /** When true and report is pending, show finish button */
  showFinishButton?: boolean
  finishing?: boolean
  onFinish?: () => void

  deleteDisabled?: boolean
  deleting?: boolean
  onDelete: () => void

  /** Label for pending out-of-stock chip (default: "Out of Stock") */
  outChipLabel?: string
}

function kindChipLabel(report: StockReport, outChipLabel: string): string {
  if (report.status === 'finished') return 'Resolved'
  return report.kind === 'low' ? 'Low Stock' : outChipLabel
}

export function StockItemBubble(props: StockItemBubbleProps) {
  const {
    report,
    beginTap,
    moveTap,
    endTap,
    shouldIgnoreClick,
    showFinishButton,
    finishing,
    onFinish,
    deleteDisabled,
    deleting,
    onDelete,
    outChipLabel = 'Out of Stock',
  } = props

  return (
    <div
      className={`stock-item-bubble stock-status-${report.status} stock-kind-${report.kind}`}
      role="listitem"
    >
      <div className="stock-item-bubble-top">
        <div className="stock-item-bubble-name">{report.item}</div>
        <div className="stock-item-bubble-actions">
          {showFinishButton && report.status === 'pending' && onFinish ? (
            <button
              className="stock-item-bubble-finish"
              type="button"
              disabled={!!finishing}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(onFinish, e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                onFinish()
              }}
              aria-label={`Mark ${report.item} as resolved`}
            >
              {finishing ? '…' : '✓'}
            </button>
          ) : null}
          <button
            className="stock-item-bubble-trash"
            type="button"
            disabled={!!deleteDisabled || !!deleting}
            onTouchStart={beginTap}
            onTouchMove={moveTap}
            onTouchEnd={(e) => endTap(onDelete, e)}
            onClick={() => {
              if (shouldIgnoreClick()) return
              onDelete()
            }}
            aria-label={`Delete ${report.item}`}
          >
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      </div>
      <span className={`stock-item-bubble-chip stock-kind-${report.kind}`}>
        {kindChipLabel(report, outChipLabel)}
      </span>
    </div>
  )
}
