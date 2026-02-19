import { useState, useEffect, useCallback, useMemo } from 'react'
import './HiringPage.css'
import {
  subscribeToApplications,
  updateApplicationStatus,
  updateApplicationNotes,
  deleteApplication,
  SHIFT_LABELS,
  type Application,
  type ApplicationStatus,
  type ShiftKey,
} from '../../services/applications'

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  contacted: 'Contacted',
  hired: 'Hired',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  new: 'hiring-status-new',
  reviewed: 'hiring-status-reviewed',
  contacted: 'hiring-status-contacted',
  hired: 'hiring-status-hired',
  rejected: 'hiring-status-rejected',
}

export function HiringPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | ApplicationStatus>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({})
  const [processing, setProcessing] = useState<string | null>(null)

  // Subscribe to applications
  useEffect(() => {
    const unsub = subscribeToApplications((list) => {
      setApplications(list)
      // Initialize note drafts for new applications
      setNoteDrafts((prev) => {
        const next = { ...prev }
        list.forEach((app) => {
          if (!(app.id in next)) {
            next[app.id] = app.notes || ''
          }
        })
        return next
      })
    })
    return () => unsub?.()
  }, [])

  // Counts for status stats
  const counts = useMemo(() => {
    return {
      all: applications.length,
      new: applications.filter((a) => a.status === 'new').length,
      reviewed: applications.filter((a) => a.status === 'reviewed').length,
      contacted: applications.filter((a) => a.status === 'contacted').length,
      hired: applications.filter((a) => a.status === 'hired').length,
      rejected: applications.filter((a) => a.status === 'rejected').length,
    }
  }, [applications])

  // Filtered and sorted applications
  const filteredApps = useMemo(() => {
    return applications
      .filter((a) => {
        if (filterStatus === 'all') return true
        return a.status === filterStatus
      })
      .sort((a, b) => {
        // New first, then by date
        if (a.status === 'new' && b.status !== 'new') return -1
        if (a.status !== 'new' && b.status === 'new') return 1
        return (b.createdAtMs || 0) - (a.createdAtMs || 0)
      })
  }, [applications, filterStatus])

  // Toggle expanded
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // Update notes draft
  const updateNoteDraft = useCallback((id: string, value: string) => {
    setNoteDrafts((prev) => ({ ...prev, [id]: value }))
  }, [])

  // Save notes
  const saveNotes = useCallback(async (app: Application) => {
    const draft = noteDrafts[app.id] || ''
    if (draft === (app.notes || '')) return

    setSavingNotes((prev) => ({ ...prev, [app.id]: true }))
    try {
      await updateApplicationNotes(app.id, draft)
    } catch (err) {
      console.error('Failed to save notes:', err)
      alert('Failed to save notes. Try again.')
    } finally {
      setSavingNotes((prev) => ({ ...prev, [app.id]: false }))
    }
  }, [noteDrafts])

  // Update status
  const handleStatusChange = useCallback(async (id: string, status: ApplicationStatus) => {
    setProcessing(id)
    try {
      await updateApplicationStatus(id, status)
    } catch (err) {
      console.error('Failed to update status:', err)
      alert('Failed to update status. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  // Delete application
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this application? This cannot be undone.')) return
    setProcessing(id)
    try {
      await deleteApplication(id)
    } catch (err) {
      console.error('Failed to delete application:', err)
      alert('Failed to delete application. Try again.')
    } finally {
      setProcessing(null)
    }
  }, [])

  return (
    <div className="hiring-page">
      <header className="admin-page-header">
        <h1>Hiring / Applications</h1>
        <p>Manage job applications from the Bonfire form.</p>
      </header>

      {/* Status Stats Bar */}
      <div className="hiring-stats-bar">
        <button
          className={`hiring-stat-btn ${filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          <span className="hiring-stat-count">{counts.all}</span>
          <span className="hiring-stat-label">All</span>
        </button>
        <button
          className={`hiring-stat-btn hiring-stat-new ${filterStatus === 'new' ? 'active' : ''}`}
          onClick={() => setFilterStatus('new')}
        >
          <span className="hiring-stat-count">{counts.new}</span>
          <span className="hiring-stat-label">New</span>
        </button>
        <button
          className={`hiring-stat-btn hiring-stat-reviewed ${filterStatus === 'reviewed' ? 'active' : ''}`}
          onClick={() => setFilterStatus('reviewed')}
        >
          <span className="hiring-stat-count">{counts.reviewed}</span>
          <span className="hiring-stat-label">Reviewed</span>
        </button>
        <button
          className={`hiring-stat-btn hiring-stat-contacted ${filterStatus === 'contacted' ? 'active' : ''}`}
          onClick={() => setFilterStatus('contacted')}
        >
          <span className="hiring-stat-count">{counts.contacted}</span>
          <span className="hiring-stat-label">Contacted</span>
        </button>
        <button
          className={`hiring-stat-btn hiring-stat-hired ${filterStatus === 'hired' ? 'active' : ''}`}
          onClick={() => setFilterStatus('hired')}
        >
          <span className="hiring-stat-count">{counts.hired}</span>
          <span className="hiring-stat-label">Hired</span>
        </button>
        <button
          className={`hiring-stat-btn hiring-stat-rejected ${filterStatus === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilterStatus('rejected')}
        >
          <span className="hiring-stat-count">{counts.rejected}</span>
          <span className="hiring-stat-label">Rejected</span>
        </button>
      </div>

      {/* Applications List */}
      <div className="admin-card hiring-list-card">
        {applications.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">📄</span>
            <h3>No applications yet</h3>
            <p>Applications from the Bonfire form will appear here</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔍</span>
            <h3>No matching applications</h3>
            <p>Try adjusting your filter</p>
          </div>
        ) : (
          <div className="hiring-list">
            {filteredApps.map((app) => {
              const isExpanded = expanded[app.id] || false
              const isBusy = processing === app.id
              const noteDraft = noteDrafts[app.id] || ''
              const hasUnsavedNotes = noteDraft !== (app.notes || '')
              const isSavingNote = savingNotes[app.id] || false

              return (
                <div
                  key={app.id}
                  className={`hiring-card ${isExpanded ? 'hiring-card-expanded' : ''}`}
                >
                  {/* Header Row */}
                  <div
                    className="hiring-card-header"
                    onClick={() => toggleExpanded(app.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleExpanded(app.id)
                      }
                    }}
                  >
                    <div className="hiring-card-header-left">
                      <span className="hiring-card-name">{app.name}</span>
                      <span className={`hiring-card-status ${STATUS_COLORS[app.status]}`}>
                        {STATUS_LABELS[app.status]}
                      </span>
                    </div>
                    <div className="hiring-card-header-right">
                      <span className="hiring-card-date">
                        {new Date(app.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span className={`hiring-card-chevron ${isExpanded ? 'expanded' : ''}`}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="hiring-card-details">
                      {/* Contact Info */}
                      <div className="hiring-detail-section">
                        <h4 className="hiring-detail-title">Contact Information</h4>
                        <div className="hiring-detail-grid">
                          <div className="hiring-detail-item">
                            <span className="hiring-detail-label">📧 Email</span>
                            <a href={`mailto:${app.email}`} className="hiring-detail-value hiring-detail-link">
                              {app.email}
                            </a>
                          </div>
                          <div className="hiring-detail-item">
                            <span className="hiring-detail-label">📱 Phone</span>
                            <a href={`tel:${app.phone}`} className="hiring-detail-value hiring-detail-link">
                              {app.phone}
                            </a>
                          </div>
                          {app.birthDate && (
                            <div className="hiring-detail-item">
                              <span className="hiring-detail-label">🎂 Birth Date</span>
                              <span className="hiring-detail-value">{app.birthDate}</span>
                            </div>
                          )}
                          {app.address && (
                            <div className="hiring-detail-item hiring-detail-item-full">
                              <span className="hiring-detail-label">📍 Address</span>
                              <span className="hiring-detail-value">{app.address}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Availability */}
                      {app.availability && app.availability.length > 0 && (
                        <div className="hiring-detail-section">
                          <h4 className="hiring-detail-title">Availability</h4>
                          <div className="hiring-availability-chips">
                            {app.availability.map((shiftKey) => (
                              <span key={shiftKey} className="hiring-availability-chip">
                                {SHIFT_LABELS[shiftKey as ShiftKey] || shiftKey}
                              </span>
                            ))}
                          </div>
                          {app.availabilityOther && (
                            <div className="hiring-availability-other">
                              <span className="hiring-detail-label">Other:</span> {app.availabilityOther}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Employment History */}
                      {app.employmentHistory && (
                        <div className="hiring-detail-section">
                          <h4 className="hiring-detail-title">Employment History</h4>
                          <div className="hiring-employment-history">
                            {app.employmentHistory}
                          </div>
                        </div>
                      )}

                      {/* Felony */}
                      <div className="hiring-detail-section">
                        <h4 className="hiring-detail-title">Background</h4>
                        <div className={`hiring-felony-indicator ${app.felonyConviction ? 'hiring-felony-yes' : 'hiring-felony-no'}`}>
                          {app.felonyConviction ? '⚠️ Has felony conviction' : '✓ No felony conviction'}
                        </div>
                      </div>

                      {/* Admin Notes */}
                      <div className="hiring-detail-section">
                        <h4 className="hiring-detail-title">Admin Notes</h4>
                        <textarea
                          className="admin-input hiring-notes-input"
                          placeholder="Add notes about this applicant..."
                          value={noteDraft}
                          onChange={(e) => updateNoteDraft(app.id, e.target.value)}
                          rows={3}
                        />
                        {hasUnsavedNotes && (
                          <button
                            className="admin-btn admin-btn-primary hiring-save-notes-btn"
                            onClick={() => saveNotes(app)}
                            disabled={isSavingNote}
                          >
                            {isSavingNote ? 'Saving...' : 'Save Notes'}
                          </button>
                        )}
                      </div>

                      {/* Status Actions */}
                      <div className="hiring-detail-section">
                        <h4 className="hiring-detail-title">Change Status</h4>
                        <div className="hiring-status-buttons">
                          {(['new', 'reviewed', 'contacted', 'hired', 'rejected'] as ApplicationStatus[]).map((status) => (
                            <button
                              key={status}
                              className={`admin-btn hiring-status-btn ${STATUS_COLORS[status]} ${app.status === status ? 'active' : ''}`}
                              onClick={() => handleStatusChange(app.id, status)}
                              disabled={isBusy || app.status === status}
                            >
                              {STATUS_LABELS[status]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Delete */}
                      <div className="hiring-delete-row">
                        <button
                          className="admin-btn hiring-delete-btn"
                          onClick={() => handleDelete(app.id)}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Deleting...' : '🗑️ Delete Application'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default HiringPage
