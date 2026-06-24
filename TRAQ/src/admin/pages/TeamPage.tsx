import { useState, useEffect, useCallback, useMemo } from 'react'
import './TeamPage.css'
import {
  saveEmployees,
  subscribeToEmployeeColors,
  saveEmployeeColor,
  removeEmployeeColor,
  renameEmployeeArchive,
  clearEmployeeArchive,
  type EmployeeColors,
} from '../../services/firestore'
import { useEmployeeRoster } from '../../hooks/useEmployeeRoster'

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
]

export function TeamPage() {
  const {
    list: employees,
    activeEmployees,
    archivedEmployees,
    archiveEmployee,
    restoreEmployee,
  } = useEmployeeRoster()

  const [employeeColors, setEmployeeColors] = useState<EmployeeColors>({})
  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showArchivedSection, setShowArchivedSection] = useState(false)

  useEffect(() => {
    const unsubColors = subscribeToEmployeeColors((colors) => {
      setEmployeeColors(colors)
    })
    return () => unsubColors?.()
  }, [])

  const q = searchQuery.trim().toLowerCase()
  const filteredActive = useMemo(
    () =>
      activeEmployees.filter((emp) => !q || emp.toLowerCase().includes(q)),
    [activeEmployees, q]
  )
  const filteredArchived = useMemo(
    () =>
      archivedEmployees.filter((emp) => !q || emp.toLowerCase().includes(q)),
    [archivedEmployees, q]
  )

  const handleAddEmployee = useCallback(async () => {
    const name = newEmployeeName.trim()
    if (!name) return
    if (employees.includes(name)) {
      alert('Employee already exists')
      return
    }

    setSaving(true)
    try {
      const updated = [...employees, name]
      await saveEmployees(updated)
      setNewEmployeeName('')
    } catch (err) {
      console.error('Failed to add employee:', err)
      alert('Failed to add employee')
    } finally {
      setSaving(false)
    }
  }, [employees, newEmployeeName])

  const handleDeleteEmployee = useCallback(
    async (name: string) => {
      if (!confirm(`Delete ${name}? This cannot be undone.`)) return

      setSaving(true)
      try {
        const updated = employees.filter((e) => e !== name)
        await saveEmployees(updated)
        await clearEmployeeArchive(name)
        if (employeeColors[name]) {
          await removeEmployeeColor(name)
        }
      } catch (err) {
        console.error('Failed to delete employee:', err)
        alert('Failed to delete employee')
      } finally {
        setSaving(false)
      }
    },
    [employees, employeeColors]
  )

  const handleArchiveEmployee = useCallback(
    async (name: string) => {
      if (
        !confirm(
          `Archive ${name}?\n\nThey will be hidden from task and time-off pickers and from the current month's leaderboard. Past completed tasks and history are unchanged.`
        )
      ) {
        return
      }
      setSaving(true)
      try {
        await archiveEmployee(name)
        setShowArchivedSection(true)
      } catch (err) {
        console.error('Failed to archive employee:', err)
        alert('Failed to archive employee')
      } finally {
        setSaving(false)
      }
    },
    [archiveEmployee]
  )

  const handleRestoreEmployee = useCallback(
    async (name: string) => {
      setSaving(true)
      try {
        await restoreEmployee(name)
      } catch (err) {
        console.error('Failed to restore employee:', err)
        alert('Failed to restore employee')
      } finally {
        setSaving(false)
      }
    },
    [restoreEmployee]
  )

  const handleRenameEmployee = useCallback(async () => {
    if (!editingEmployee) return
    const newName = editingName.trim()
    if (!newName) return
    if (newName === editingEmployee) {
      setEditingEmployee(null)
      return
    }
    if (employees.includes(newName)) {
      alert('An employee with this name already exists')
      return
    }

    setSaving(true)
    try {
      const updated = employees.map((e) => (e === editingEmployee ? newName : e))
      await saveEmployees(updated)
      await renameEmployeeArchive(editingEmployee, newName)

      const oldColor = employeeColors[editingEmployee]
      if (oldColor) {
        await removeEmployeeColor(editingEmployee)
        await saveEmployeeColor(newName, oldColor)
      }

      setEditingEmployee(null)
      setEditingName('')
    } catch (err) {
      console.error('Failed to rename employee:', err)
      alert('Failed to rename employee')
    } finally {
      setSaving(false)
    }
  }, [editingEmployee, editingName, employees, employeeColors])

  const handleSetColor = useCallback(async (name: string, color: string) => {
    try {
      await saveEmployeeColor(name, color)
      setColorPickerFor(null)
    } catch (err) {
      console.error('Failed to set color:', err)
    }
  }, [])

  const handleRemoveColor = useCallback(async (name: string) => {
    try {
      await removeEmployeeColor(name)
      setColorPickerFor(null)
    } catch (err) {
      console.error('Failed to remove color:', err)
    }
  }, [])

  const startEditing = (name: string) => {
    setEditingEmployee(name)
    setEditingName(name)
  }

  const renderMemberRow = (emp: string, archived: boolean) => {
    const color = employeeColors[emp]
    const isEditing = editingEmployee === emp
    const showColorPicker = colorPickerFor === emp

    return (
      <div key={emp} className={`team-member-card ${archived ? 'team-member-card--archived' : ''}`}>
        <div className="team-member-info">
          <button
            className="team-color-btn"
            style={{ backgroundColor: color || '#e5e7eb' }}
            onClick={() => setColorPickerFor(showColorPicker ? null : emp)}
            title={color ? 'Change color' : 'Set color'}
            type="button"
          >
            {!color && <span className="team-color-empty">+</span>}
          </button>

          {isEditing ? (
            <input
              type="text"
              className="team-edit-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameEmployee()
                if (e.key === 'Escape') setEditingEmployee(null)
              }}
              onBlur={() => void handleRenameEmployee()}
              autoFocus
            />
          ) : (
            <span className="team-member-name">
              {emp}
              {archived ? <span className="team-archived-badge">Archived</span> : null}
            </span>
          )}
        </div>

        <div className="team-member-actions">
          {!isEditing && (
            <>
              <button
                type="button"
                className="team-action-btn"
                onClick={() => startEditing(emp)}
                title="Rename"
              >
                ✏️
              </button>
              {archived ? (
                <button
                  type="button"
                  className="team-action-btn team-action-restore"
                  onClick={() => void handleRestoreEmployee(emp)}
                  title="Restore"
                  disabled={saving}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="team-action-btn team-action-archive"
                  onClick={() => void handleArchiveEmployee(emp)}
                  title="Archive"
                  disabled={saving}
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                className="team-action-btn team-action-delete"
                onClick={() => void handleDeleteEmployee(emp)}
                title="Delete"
                disabled={saving}
              >
                🗑️
              </button>
            </>
          )}
        </div>

        {showColorPicker && (
          <div className="team-color-picker">
            <div className="team-color-picker-grid">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`team-color-option ${color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => void handleSetColor(emp, c)}
                />
              ))}
            </div>
            {color && (
              <button type="button" className="team-color-remove" onClick={() => void handleRemoveColor(emp)}>
                Remove color
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="team-page">
      <header className="admin-page-header">
        <h1>Team Management</h1>
        <p>Manage team members, colors, and archive status. Archived members stay in history but are hidden from pickers.</p>
      </header>

      <div className="admin-card team-add-card">
        <h3 className="admin-card-title">
          <span>➕</span> Add Team Member
        </h3>
        <div className="team-add-form">
          <input
            type="text"
            className="admin-input"
            placeholder="Enter employee name..."
            value={newEmployeeName}
            onChange={(e) => setNewEmployeeName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAddEmployee()}
            disabled={saving}
          />
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => void handleAddEmployee()}
            disabled={saving || !newEmployeeName.trim()}
          >
            Add Employee
          </button>
        </div>
      </div>

      <div className="team-search-bar">
        <input
          type="text"
          className="admin-input"
          placeholder="Search team members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span className="team-count">
          {filteredActive.length} active
          {archivedEmployees.length > 0 ? ` · ${archivedEmployees.length} archived` : ''}
        </span>
      </div>

      <div className="admin-card team-list-card">
        {filteredActive.length === 0 && !q ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">👥</span>
            <h3>{activeEmployees.length === 0 && employees.length > 0 ? 'No active members' : 'No team members yet'}</h3>
            <p>
              {activeEmployees.length === 0 && employees.length > 0
                ? 'Expand archived below or restore someone.'
                : 'Add your first team member above'}
            </p>
          </div>
        ) : filteredActive.length === 0 && q ? (
          <div className="admin-empty">
            <h3>No active matches</h3>
            <p>Try a different search or check archived members.</p>
          </div>
        ) : (
          <div className="team-list">{filteredActive.map((emp) => renderMemberRow(emp, false))}</div>
        )}
      </div>

      {archivedEmployees.length > 0 && (
        <div className="admin-card team-list-card team-archived-card">
          <button
            type="button"
            className="team-archived-header"
            onClick={() => setShowArchivedSection((v) => !v)}
            aria-expanded={showArchivedSection}
          >
            <h3 className="admin-card-title">
              <span>📦</span> Archived ({archivedEmployees.length})
            </h3>
            <span className="team-archived-toggle">{showArchivedSection ? 'Collapse' : 'Expand'}</span>
          </button>
          {showArchivedSection && (
            <div className="team-list">
              {filteredArchived.length === 0 ? (
                <div className="admin-empty admin-empty--compact">
                  <p>No archived matches for this search.</p>
                </div>
              ) : (
                filteredArchived.map((emp) => renderMemberRow(emp, true))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TeamPage
