import { useState, useEffect, useCallback, useMemo } from 'react'
import './TimeOffPage.css'
import {
  subscribeToTimeOffRequests,
  setTimeOffRequestStatus,
  deleteTimeOffRequest,
  createNotification,
  type TimeOffRequest,
  type TimeOffRequestStatus,
} from '../../services/firestore'
import { TimeOffShiftDetailList } from '../../components/TimeOffShiftDetailList'
import { formatTimeOffNotificationBody, formatTimeOffSummaryLine } from '../../utils/timeOffDisplay'

export function TimeOffPage() {
  const [requests, setRequests] = useState<TimeOffRequest[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | TimeOffRequestStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Subscribe to time off requests
  useEffect(() => {
    const unsub = subscribeToTimeOffRequests((reqs) => {
      setRequests(reqs)
    })
    return () => unsub?.()
  }, [])

  // Filter and sort requests
  const filteredRequests = useMemo(() => {
    return requests
      .filter((req) => {
        // Status filter
        if (filterStatus !== 'all' && req.status !== filterStatus) return false
        // Search filter
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          if (!req.employee.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        // Pending first
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (a.status !== 'pending' && b.status === 'pending') return 1
        // Then by date (newest first)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
  }, [requests, filterStatus, searchQuery])

  // Counts for filter badges
  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      denied: requests.filter((r) => r.status === 'denied').length,
    }
  }, [requests])

  // Approve request
  const handleApprove = useCallback(async (req: TimeOffRequest) => {
    setProcessing(req.id)
    try {
      await setTimeOffRequestStatus(req.id, 'approved')
      // Send notification to employee
      const dateInfo = formatTimeOffNotificationBody(req)
      await createNotification(
        req.employee,
        `✅ Your time off request has been APPROVED!\n\n${dateInfo}`
      )
    } catch (err) {
      console.error('Failed to approve:', err)
    } finally {
      setProcessing(null)
    }
  }, [])

  // Deny request
  const handleDeny = useCallback(async (req: TimeOffRequest) => {
    setProcessing(req.id)
    try {
      await setTimeOffRequestStatus(req.id, 'denied')
      // Send notification to employee
      const dateInfo = formatTimeOffNotificationBody(req)
      await createNotification(
        req.employee,
        `❌ Your time off request has been DENIED.\n\n${dateInfo}`
      )
    } catch (err) {
      console.error('Failed to deny:', err)
    } finally {
      setProcessing(null)
    }
  }, [])

  // Delete request
  const handleDelete = useCallback(async (req: TimeOffRequest) => {
    if (!confirm('Delete this request? This cannot be undone.')) return
    setProcessing(req.id)
    try {
      await deleteTimeOffRequest(req.id)
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setProcessing(null)
    }
  }, [])

  // Get status badge info
  const getStatusBadge = (status: TimeOffRequestStatus) => {
    switch (status) {
      case 'pending':
        return { label: '⏳ Pending', className: 'admin-badge-warning' }
      case 'approved':
        return { label: '✓ Approved', className: 'admin-badge-success' }
      case 'denied':
        return { label: '✗ Denied', className: 'admin-badge-accent' }
      default:
        return { label: status, className: '' }
    }
  }

  return (
    <div className="timeoff-page">
      <header className="admin-page-header">
        <h1>Time Off Requests</h1>
        <p>Review and approve/deny employee time off requests.</p>
      </header>

      {/* Filters */}
      <div className="timeoff-filters">
        <div className="timeoff-filter-btns">
          <button
            className={`timeoff-filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All
            {counts.all > 0 && <span className="timeoff-filter-count">{counts.all}</span>}
          </button>
          <button
            className={`timeoff-filter-btn ${filterStatus === 'pending' ? 'active' : ''}`}
            onClick={() => setFilterStatus('pending')}
          >
            Pending
            {counts.pending > 0 && (
              <span className="timeoff-filter-count timeoff-filter-count-warning">{counts.pending}</span>
            )}
          </button>
          <button
            className={`timeoff-filter-btn ${filterStatus === 'approved' ? 'active' : ''}`}
            onClick={() => setFilterStatus('approved')}
          >
            Approved
            {counts.approved > 0 && (
              <span className="timeoff-filter-count timeoff-filter-count-success">{counts.approved}</span>
            )}
          </button>
          <button
            className={`timeoff-filter-btn ${filterStatus === 'denied' ? 'active' : ''}`}
            onClick={() => setFilterStatus('denied')}
          >
            Denied
            {counts.denied > 0 && (
              <span className="timeoff-filter-count timeoff-filter-count-danger">{counts.denied}</span>
            )}
          </button>
        </div>

        <input
          type="text"
          className="admin-input timeoff-search"
          placeholder="Search by employee name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Request List */}
      <div className="admin-card timeoff-list-card">
        {requests.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🏖️</span>
            <h3>No time off requests</h3>
            <p>Requests will appear here when employees submit them</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔍</span>
            <h3>No matching requests</h3>
            <p>Try adjusting your filters or search</p>
          </div>
        ) : (
          <div className="timeoff-list">
            {filteredRequests.map((req) => {
              const badge = getStatusBadge(req.status)
              const isPending = req.status === 'pending'
              const isProcessing = processing === req.id

              return (
                <div
                  key={req.id}
                  className={`timeoff-card timeoff-card-${req.status}`}
                >
                  <div className="timeoff-card-header">
                    <span className="timeoff-employee">{req.employee}</span>
                    <span className={`admin-badge ${badge.className}`}>{badge.label}</span>
                  </div>

                  <div className="timeoff-card-body">
                    <div className="timeoff-dates">
                      <strong>Days:</strong> {formatTimeOffSummaryLine(req)}
                    </div>
                    {req.requestKind === 'shift_blocks' && req.requestedShifts.length > 0 && (
                      <TimeOffShiftDetailList requestedShifts={req.requestedShifts} />
                    )}

                    {req.reason && (
                      <div className="timeoff-reason">
                        <strong>Reason:</strong> {req.reason}
                      </div>
                    )}

                    <div className="timeoff-meta">
                      <span>
                        Requested: {new Date(req.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {req.decision && (
                        <span>
                          {' · '}
                          {req.status} on{' '}
                          {new Date(req.decision.at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="timeoff-card-actions">
                    {isPending && (
                      <>
                        <button
                          className="admin-btn timeoff-btn-approve"
                          onClick={() => handleApprove(req)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? '...' : '✓ Approve'}
                        </button>
                        <button
                          className="admin-btn timeoff-btn-deny"
                          onClick={() => handleDeny(req)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? '...' : '✗ Deny'}
                        </button>
                      </>
                    )}
                    <button
                      className="admin-btn timeoff-btn-delete"
                      onClick={() => handleDelete(req)}
                      disabled={isProcessing}
                    >
                      🗑️ Delete
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

export default TimeOffPage
