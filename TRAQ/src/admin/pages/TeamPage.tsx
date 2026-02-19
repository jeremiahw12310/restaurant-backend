import { useState, useEffect, useCallback } from 'react'
import './TeamPage.css'
import {
  subscribeToEmployees,
  saveEmployees,
  subscribeToEmployeeColors,
  saveEmployeeColor,
  removeEmployeeColor,
  type EmployeeColors,
} from '../../services/firestore'

// Preset colors for quick assignment
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
]

export function TeamPage() {
  const [employees, setEmployees] = useState<string[]>([])
  const [employeeColors, setEmployeeColors] = useState<EmployeeColors>({})
  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Subscribe to employees and colors
  useEffect(() => {
    const unsubEmployees = subscribeToEmployees((list) => {
      setEmployees(list)
    })

    const unsubColors = subscribeToEmployeeColors((colors) => {
      setEmployeeColors(colors)
    })

    return () => {
      unsubEmployees?.()
      unsubColors?.()
    }
  }, [])

  // Filter employees by search
  const filteredEmployees = employees.filter((emp) =>
    emp.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleDeleteEmployee = useCallback(async (name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return

    setSaving(true)
    try {
      const updated = employees.filter((e) => e !== name)
      await saveEmployees(updated)
      // Also remove their color if set
      if (employeeColors[name]) {
        await removeEmployeeColor(name)
      }
    } catch (err) {
      console.error('Failed to delete employee:', err)
      alert('Failed to delete employee')
    } finally {
      setSaving(false)
    }
  }, [employees, employeeColors])

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

      // Transfer color if exists
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

  return (
    <div className="team-page">
      <header className="admin-page-header">
        <h1>Team Management</h1>
        <p>Manage your team members and their display colors.</p>
      </header>

      {/* Add Employee Form */}
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
            onKeyDown={(e) => e.key === 'Enter' && handleAddEmployee()}
            disabled={saving}
          />
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleAddEmployee}
            disabled={saving || !newEmployeeName.trim()}
          >
            Add Employee
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="team-search-bar">
        <input
          type="text"
          className="admin-input"
          placeholder="Search team members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span className="team-count">{filteredEmployees.length} members</span>
      </div>

      {/* Employee List */}
      <div className="admin-card team-list-card">
        {filteredEmployees.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">👥</span>
            <h3>{searchQuery ? 'No matches found' : 'No team members yet'}</h3>
            <p>{searchQuery ? 'Try a different search term' : 'Add your first team member above'}</p>
          </div>
        ) : (
          <div className="team-list">
            {filteredEmployees.map((emp) => {
              const color = employeeColors[emp]
              const isEditing = editingEmployee === emp
              const showColorPicker = colorPickerFor === emp

              return (
                <div key={emp} className="team-member-card">
                  <div className="team-member-info">
                    <button
                      className="team-color-btn"
                      style={{ backgroundColor: color || '#e5e7eb' }}
                      onClick={() => setColorPickerFor(showColorPicker ? null : emp)}
                      title={color ? 'Change color' : 'Set color'}
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
                          if (e.key === 'Enter') handleRenameEmployee()
                          if (e.key === 'Escape') setEditingEmployee(null)
                        }}
                        onBlur={handleRenameEmployee}
                        autoFocus
                      />
                    ) : (
                      <span className="team-member-name">{emp}</span>
                    )}
                  </div>

                  <div className="team-member-actions">
                    {!isEditing && (
                      <>
                        <button
                          className="team-action-btn"
                          onClick={() => startEditing(emp)}
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          className="team-action-btn team-action-delete"
                          onClick={() => handleDeleteEmployee(emp)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>

                  {/* Color Picker Dropdown */}
                  {showColorPicker && (
                    <div className="team-color-picker">
                      <div className="team-color-picker-grid">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            className={`team-color-option ${color === c ? 'selected' : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() => handleSetColor(emp, c)}
                          />
                        ))}
                      </div>
                      {color && (
                        <button
                          className="team-color-remove"
                          onClick={() => handleRemoveColor(emp)}
                        >
                          Remove color
                        </button>
                      )}
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

export default TeamPage
