import { useState, useEffect, useCallback, useMemo } from 'react'
import './ReportsPage.css'
import {
  subscribeToManagementReports,
  setManagementReportStatus,
  deleteManagementReport,
  type ManagementReport,
  type ManagementReportStatus,
} from '../../services/firestore'

const KIND_LABELS: Record<string, string> = {
  leak: 'Leak',
  broken: 'Broken',
  insect: 'Insect',
  custom: 'Custom',
}

export function ReportsPage() {
  const [reports, setReports] = useState<ManagementReport[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | ManagementReportStatus>('all')

  // Subscribe to reports
  useEffect(() => {
    const unsub = subscribeToManagementReports((list) => {
      setReports(list)
    })
    return () => unsub?.()
  }, [])

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    return reports
      .filter((r) => {
        if (filterStatus === 'all') return true
        return r.status === filterStatus
      })
      .sort((a, b) => {
        // New first, then by date
        if (a.status === 'new' && b.status !== 'new') return -1
        if (a.status !== 'new' && b.status === 'new') return 1
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
  }, [reports, filterStatus])

  // Counts for filter badges
  const counts = useMemo(() => {
    return {
      all: reports.length,
      new: reports.filter((r) => r.status === 'new').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
    }
  }, [reports])

  // Toggle status
  const handleToggleStatus = useCallback(async (report: ManagementReport) => {
    setProcessing(report.id)
    try {
      const newStatus: ManagementReportStatus = report.status === 'new' ? 'resolved' : 'new'
      await setManagementReportStatus(report.id, newStatus)
    } catch (err) {
      console.error('Failed to update report:', err)
      alert('Failed to update report. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  // Delete report
  const handleDelete = useCallback(async (report: ManagementReport) => {
    if (!confirm('Delete this report?')) return
    setProcessing(report.id)
    try {
      await deleteManagementReport(report.id)
    } catch (err) {
      console.error('Failed to delete report:', err)
      alert('Failed to delete report. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  return (
    <div className="reports-page">
      <header className="admin-page-header">
        <h1>Management Reports</h1>
        <p>Incoming staff reports from "Notify Management" submissions.</p>
      </header>

      {/* Filters */}
      <div className="reports-filters">
        <div className="reports-filter-btns">
          <button
            className={`reports-filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All
            {counts.all > 0 && <span className="reports-filter-count">{counts.all}</span>}
          </button>
          <button
            className={`reports-filter-btn ${filterStatus === 'new' ? 'active' : ''}`}
            onClick={() => setFilterStatus('new')}
          >
            New
            {counts.new > 0 && (
              <span className="reports-filter-count reports-filter-count-warning">{counts.new}</span>
            )}
          </button>
          <button
            className={`reports-filter-btn ${filterStatus === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilterStatus('resolved')}
          >
            Resolved
            {counts.resolved > 0 && (
              <span className="reports-filter-count reports-filter-count-success">{counts.resolved}</span>
            )}
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="admin-card reports-list-card">
        {reports.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📝</span>
            <h3>No reports yet</h3>
            <p>Staff reports will appear here when submitted</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔍</span>
            <h3>No matching reports</h3>
            <p>Try adjusting your filter</p>
          </div>
        ) : (
          <div className="reports-list">
            {filteredReports.map((report) => {
              const kindLabel = KIND_LABELS[report.kind] || report.kind
              const isNew = report.status === 'new'
              const isBusy = processing === report.id
              const customTitle =
                report.kind === 'custom' && report.customTitle?.trim()
                  ? report.customTitle.trim()
                  : null

              return (
                <div
                  key={report.id}
                  className={`report-card report-card-${report.status}`}
                >
                  <div className="report-card-header">
                    <span className="report-created-by">
                      👤 {report.createdBy || 'Staff'}
                    </span>
                    <span className={`admin-badge ${isNew ? 'admin-badge-warning' : 'admin-badge-success'}`}>
                      {isNew ? '⚠️ New' : '✓ Resolved'}
                    </span>
                  </div>

                  <div className="report-kind-row">
                    <span className="report-kind-chip">{kindLabel}</span>
                    {customTitle && <span className="report-custom-title">• {customTitle}</span>}
                  </div>

                  <div className={`report-details ${!report.details ? 'report-details-empty' : ''}`}>
                    {report.details || '(no additional info)'}
                  </div>

                  <div className="report-meta">
                    {report.createdAt
                      ? new Date(report.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : ''}
                  </div>

                  <div className="report-actions">
                    <button
                      className={`admin-btn ${isNew ? 'report-btn-resolve' : 'report-btn-reopen'}`}
                      disabled={isBusy}
                      onClick={() => handleToggleStatus(report)}
                    >
                      {isBusy ? '...' : isNew ? '✓ Resolve' : '↩ Reopen'}
                    </button>
                    <button
                      className="admin-btn report-btn-delete"
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

export default ReportsPage
