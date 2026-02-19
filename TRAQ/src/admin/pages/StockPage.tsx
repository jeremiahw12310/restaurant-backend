import { useState, useEffect, useCallback, useMemo } from 'react'
import './StockPage.css'
import {
  subscribeToStockReports,
  createStockReport,
  setStockReportStatus,
  deleteStockReport,
  subscribeToEmployees,
  type StockReport,
  type StockReportKind,
  type StockReportStatus,
} from '../../services/firestore'

export function StockPage() {
  const [reports, setReports] = useState<StockReport[]>([])
  const [employees, setEmployees] = useState<string[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | StockReportStatus>('all')
  const [filterKind, setFilterKind] = useState<'all' | StockReportKind>('all')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formItem, setFormItem] = useState('')
  const [formKind, setFormKind] = useState<StockReportKind>('low')
  const [formReporter, setFormReporter] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Subscribe to stock reports
  useEffect(() => {
    const unsub = subscribeToStockReports((list) => {
      setReports(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to employees for reporter dropdown
  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployees(list)
    })
    return () => unsub?.()
  }, [])

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    return reports
      .filter((r) => {
        if (filterStatus !== 'all' && r.status !== filterStatus) return false
        if (filterKind !== 'all' && r.kind !== filterKind) return false
        return true
      })
      .sort((a, b) => {
        // Pending first, then by date
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (a.status !== 'pending' && b.status === 'pending') return 1
        return (b.createdAtMs || 0) - (a.createdAtMs || 0)
      })
  }, [reports, filterStatus, filterKind])

  // Counts for stats
  const counts = useMemo(() => {
    return {
      all: reports.length,
      pending: reports.filter((r) => r.status === 'pending').length,
      finished: reports.filter((r) => r.status === 'finished').length,
      low: reports.filter((r) => r.kind === 'low').length,
      out: reports.filter((r) => r.kind === 'out').length,
      outPending: reports.filter((r) => r.kind === 'out' && r.status === 'pending').length,
    }
  }, [reports])

  // Mark as finished
  const handleFinish = useCallback(async (report: StockReport) => {
    setProcessing(report.id)
    try {
      await setStockReportStatus(report.id, 'finished')
    } catch (err) {
      console.error('Failed to update stock report:', err)
      alert('Failed to update report. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  // Reopen (mark as pending)
  const handleReopen = useCallback(async (report: StockReport) => {
    setProcessing(report.id)
    try {
      await setStockReportStatus(report.id, 'pending')
    } catch (err) {
      console.error('Failed to reopen stock report:', err)
      alert('Failed to reopen report. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  // Delete report
  const handleDelete = useCallback(async (report: StockReport) => {
    if (!confirm('Delete this stock report?')) return
    setProcessing(report.id)
    try {
      await deleteStockReport(report.id)
    } catch (err) {
      console.error('Failed to delete stock report:', err)
      alert('Failed to delete report. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  // Submit new report
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const item = formItem.trim()
    if (!item) {
      setFormError('Please enter the item name.')
      return
    }

    setFormSubmitting(true)
    setFormError(null)
    try {
      await createStockReport({
        kind: formKind,
        item,
        createdBy: formReporter || undefined,
      })
      // Reset form
      setFormItem('')
      setFormKind('low')
      setFormReporter('')
      setShowForm(false)
    } catch (err) {
      console.error('Failed to create stock report:', err)
      setFormError('Failed to submit report. Try again.')
    } finally {
      setFormSubmitting(false)
    }
  }, [formItem, formKind, formReporter])

  // Reset form
  const handleCancelForm = useCallback(() => {
    setFormItem('')
    setFormKind('low')
    setFormReporter('')
    setFormError(null)
    setShowForm(false)
  }, [])

  return (
    <div className="stock-page">
      <header className="admin-page-header">
        <h1>Stock Reports</h1>
        <p>Track out-of-stock and low-stock inventory items reported by staff.</p>
      </header>

      {/* Stats Cards */}
      <div className="stock-stats">
        <div className="stock-stat-card">
          <div className="stock-stat-value">{counts.pending}</div>
          <div className="stock-stat-label">Pending</div>
        </div>
        <div className="stock-stat-card stock-stat-warning">
          <div className="stock-stat-value">{counts.outPending}</div>
          <div className="stock-stat-label">Out of Stock</div>
        </div>
        <div className="stock-stat-card stock-stat-info">
          <div className="stock-stat-value">{counts.low}</div>
          <div className="stock-stat-label">Low Stock</div>
        </div>
        <div className="stock-stat-card stock-stat-success">
          <div className="stock-stat-value">{counts.finished}</div>
          <div className="stock-stat-label">Resolved</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="stock-action-bar">
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => setShowForm(true)}
          disabled={showForm}
        >
          + Report Item
        </button>

        {/* Filters */}
        <div className="stock-filters">
          <div className="stock-filter-group">
            <label className="stock-filter-label">Status:</label>
            <select
              className="stock-filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | StockReportStatus)}
            >
              <option value="all">All ({counts.all})</option>
              <option value="pending">Pending ({counts.pending})</option>
              <option value="finished">Finished ({counts.finished})</option>
            </select>
          </div>
          <div className="stock-filter-group">
            <label className="stock-filter-label">Type:</label>
            <select
              className="stock-filter-select"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as 'all' | StockReportKind)}
            >
              <option value="all">All</option>
              <option value="out">Out of Stock ({counts.out})</option>
              <option value="low">Low Stock ({counts.low})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="admin-card stock-form-card">
          <div className="stock-form-header">
            <h3>Report Stock Issue</h3>
            <button
              className="stock-form-close"
              onClick={handleCancelForm}
              aria-label="Close form"
            >
              &times;
            </button>
          </div>
          <form className="stock-form" onSubmit={handleSubmit}>
            {formError && <div className="stock-form-error">{formError}</div>}
            
            <div className="stock-form-row">
              <div className="stock-form-field stock-form-field-grow">
                <label className="stock-form-label">Item Name *</label>
                <input
                  type="text"
                  className="stock-form-input"
                  placeholder="e.g. Soy Sauce Packets"
                  value={formItem}
                  onChange={(e) => setFormItem(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="stock-form-row">
              <div className="stock-form-field">
                <label className="stock-form-label">Type</label>
                <div className="stock-kind-toggle">
                  <button
                    type="button"
                    className={`stock-kind-btn stock-kind-low ${formKind === 'low' ? 'active' : ''}`}
                    onClick={() => setFormKind('low')}
                  >
                    Low Stock
                  </button>
                  <button
                    type="button"
                    className={`stock-kind-btn stock-kind-out ${formKind === 'out' ? 'active' : ''}`}
                    onClick={() => setFormKind('out')}
                  >
                    Out of Stock
                  </button>
                </div>
              </div>

              <div className="stock-form-field">
                <label className="stock-form-label">Reported By</label>
                <select
                  className="stock-form-select"
                  value={formReporter}
                  onChange={(e) => setFormReporter(e.target.value)}
                >
                  <option value="">(Optional)</option>
                  {employees.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="stock-form-actions">
              <button
                type="button"
                className="admin-btn stock-form-cancel"
                onClick={handleCancelForm}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={formSubmitting}
              >
                {formSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reports List */}
      <div className="admin-card stock-list-card">
        {reports.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📦</span>
            <h3>No stock reports</h3>
            <p>Staff can report low or out-of-stock items from the main app.</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔍</span>
            <h3>No matching reports</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          <div className="stock-list">
            {filteredReports.map((report) => {
              const isPending = report.status === 'pending'
              const isOut = report.kind === 'out'
              const isBusy = processing === report.id

              // Format time
              const createdLabel = report.createdAtMs
                ? new Date(report.createdAtMs).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : report.createdAt
                  ? new Date(report.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : ''

              return (
                <div
                  key={report.id}
                  className={`stock-card stock-card-${report.status} ${isOut ? 'stock-card-out' : 'stock-card-low'}`}
                >
                  <div className="stock-card-header">
                    <div className="stock-card-item">{report.item}</div>
                    <div className="stock-card-badges">
                      <span className={`stock-kind-chip stock-kind-chip-${report.kind}`}>
                        {isOut ? 'Out of Stock' : 'Low Stock'}
                      </span>
                      <span className={`stock-status-chip stock-status-chip-${report.status}`}>
                        {isPending ? 'Pending' : 'Finished'}
                      </span>
                    </div>
                  </div>

                  <div className="stock-card-meta">
                    {report.createdBy && (
                      <span className="stock-card-reporter">
                        Reported by {report.createdBy}
                      </span>
                    )}
                    {createdLabel && (
                      <span className="stock-card-time">{createdLabel}</span>
                    )}
                  </div>

                  <div className="stock-card-actions">
                    {isPending ? (
                      <button
                        className="admin-btn stock-btn-finish"
                        disabled={isBusy}
                        onClick={() => handleFinish(report)}
                      >
                        {isBusy ? '...' : '✓ Mark Finished'}
                      </button>
                    ) : (
                      <button
                        className="admin-btn stock-btn-reopen"
                        disabled={isBusy}
                        onClick={() => handleReopen(report)}
                      >
                        {isBusy ? '...' : '↩ Reopen'}
                      </button>
                    )}
                    <button
                      className="admin-btn stock-btn-delete"
                      disabled={isBusy}
                      onClick={() => handleDelete(report)}
                    >
                      {isBusy ? '...' : '🗑 Delete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default StockPage
