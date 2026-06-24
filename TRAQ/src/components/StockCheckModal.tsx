import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockReport, StockReportKind } from '../services/firestore'
import { StockBubblesScrollArea } from './StockBubblesScrollArea'
import { StockItemBubble } from './StockItemBubble'
import { StockPendingReportList } from './StockPendingReportList'

export type StockCheckModalProps = {
  stockReports: StockReport[]

  beginTap: (e: React.TouchEvent) => void
  moveTap: (e: React.TouchEvent) => void
  endTap: (fn: () => void, e: React.TouchEvent) => void
  shouldIgnoreClick: () => boolean

  isBusy?: boolean
  error?: string | null

  assignees: string[]
  splitMode: boolean
  hasCompletion?: boolean
  onTapComplete: () => void
  onEnableSplitAndSelect: () => void

  onCreateItem: (args: { kind: StockReportKind; item: string }) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
}

export function StockCheckModal(props: StockCheckModalProps) {
  const {
    stockReports,
    beginTap,
    moveTap,
    endTap,
    shouldIgnoreClick,
    isBusy,
    error,
    assignees,
    splitMode,
    hasCompletion,
    onTapComplete,
    onEnableSplitAndSelect,
    onCreateItem,
    onDeleteItem,
  } = props

  const pending = useMemo(() => {
    return (stockReports || []).filter((r) => r.status === 'pending')
  }, [stockReports])

  const [addOpen, setAddOpen] = useState(false)
  const [addKind, setAddKind] = useState<StockReportKind>('out')
  const [addItem, setAddItem] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [savingAdd, setSavingAdd] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const addSheetEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addOpen) return
    const scrollAncestor = (node: HTMLElement | null): HTMLElement | null => {
      let p = node?.parentElement ?? null
      while (p) {
        const { overflowY } = getComputedStyle(p)
        if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
          return p
        }
        p = p.parentElement
      }
      return null
    }
    const run = () => {
      const el = addSheetEndRef.current
      if (!el) return
      const scroller = scrollAncestor(el)
      if (scroller) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ block: 'end', behavior: 'smooth' })
      }
    }
    const t0 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run)
    })
    return () => window.cancelAnimationFrame(t0)
  }, [addOpen])

  const submitAdd = async () => {
    const item = String(addItem || '').trim()
    if (!item) {
      setAddError('Type an item name.')
      return
    }
    setSavingAdd(true)
    setAddError(null)
    try {
      await onCreateItem({ kind: addKind, item })
      setAddItem('')
      setAddOpen(false)
    } catch (e) {
      console.error('Failed to create stock report:', e)
      setAddError('Could not add item. Try again.')
    } finally {
      setSavingAdd(false)
    }
  }

  const addTile = (
    <button
      className="stock-check-add-tile"
      type="button"
      disabled={!!isBusy}
      onTouchStart={beginTap}
      onTouchMove={moveTap}
      onTouchEnd={(e) => endTap(() => setAddOpen(true), e)}
      onClick={() => {
        if (shouldIgnoreClick()) return
        setAddOpen(true)
      }}
      aria-label="Add stock item"
      title="Add item"
    >
      +
    </button>
  )

  return (
    <div className={`stock-check-modal${addOpen ? ' stock-check-modal--add-open' : ''}`}>
      <div className="stock-check-subcopy">
        Management will be notified automatically when stock changes.
      </div>

      {error ? <div className="stock-check-error">{error}</div> : null}

      <StockBubblesScrollArea itemCount={pending.length}>
        <StockPendingReportList
          reports={pending}
          emptyMessage="No out/low items reported."
          leadingCard={addTile}
          renderCard={(r) => (
            <StockItemBubble
              key={r.id}
              report={r}
              beginTap={beginTap}
              moveTap={moveTap}
              endTap={endTap}
              shouldIgnoreClick={shouldIgnoreClick}
              showFinishButton={false}
              outChipLabel="Out"
              deleteDisabled={!!isBusy}
              deleting={deletingId === r.id}
              onDelete={() => {
                if (!confirm('Delete this item?')) return
                setDeletingId(r.id)
                void onDeleteItem(r.id).finally(() => setDeletingId(null))
              }}
            />
          )}
        />
      </StockBubblesScrollArea>

      {addOpen ? (
        <div className="stock-check-add-sheet" aria-label="Add stock item">
          <div className="stock-check-add-title">Add item</div>
          {addError ? <div className="stock-check-error">{addError}</div> : null}
          <div className="stock-kind-view stock-check-kind-view">
            <button
              type="button"
              className={`stock-kind-btn stock-kind-low${addKind === 'low' ? ' stock-kind-btn--selected' : ' stock-kind-btn--unselected'}`}
              disabled={savingAdd}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => setAddKind('low'), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                setAddKind('low')
              }}
            >
              Low Stock
            </button>
            <button
              type="button"
              className={`stock-kind-btn stock-kind-out${addKind === 'out' ? ' stock-kind-btn--selected' : ' stock-kind-btn--unselected'}`}
              disabled={savingAdd}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => setAddKind('out'), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                setAddKind('out')
              }}
            >
              Out of Stock
            </button>
          </div>

          <label className="stock-check-input-label">
            Item
            <input
              className="stock-check-input"
              type="text"
              value={addItem}
              onChange={(e) => setAddItem(e.target.value)}
              placeholder="Type item name…"
              autoFocus
              inputMode="text"
            />
          </label>

          <div ref={addSheetEndRef} className="stock-check-add-actions">
            <button
              type="button"
              className="stock-check-cancel"
              disabled={savingAdd}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => { setAddOpen(false); setAddError(null) }, e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                setAddOpen(false)
                setAddError(null)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="stock-check-save"
              disabled={savingAdd}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => void submitAdd(), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                void submitAdd()
              }}
            >
              {savingAdd ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      ) : null}

      {!addOpen ? (
        <div className="stock-check-actions" aria-label="Complete stock check">
          <div className="completed-by-label">Completed by:</div>
          <div className="selection-buttons">
            <button
              type="button"
              className="select-employee-btn"
              disabled={!!isBusy}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(onTapComplete, e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                onTapComplete()
              }}
            >
              {assignees.length > 0 ? (
                <>
                  {assignees.join(' · ')} {hasCompletion ? <span className="edit-hint">✏️</span> : null}
                </>
              ) : (
                'Tap to select employee'
              )}
            </button>

            <button
              type="button"
              className={`split-button ${splitMode ? 'active' : ''}`}
              disabled={!!isBusy}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(onEnableSplitAndSelect, e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                onEnableSplitAndSelect()
              }}
              aria-label="Split credit"
              title="Split credit"
            >
              Split
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

