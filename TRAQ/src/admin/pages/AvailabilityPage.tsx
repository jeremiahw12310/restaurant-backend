import { useState, useEffect, useCallback } from 'react'
import './AvailabilityPage.css'
import {
  subscribeToEmployees,
  subscribeToAvailability,
  saveAvailability,
  createDefaultWeeklyAvailability,
  type DayOfWeek,
  type WeeklyAvailability,
  type AvailabilityMap,
} from '../../services/firestore'

const DAY_OF_WEEK_KEYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

export function AvailabilityPage() {
  const [employees, setEmployees] = useState<string[]>([])
  const [availabilityMap, setAvailabilityMap] = useState<AvailabilityMap>({})
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Subscribe to employees
  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployees(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to availability
  useEffect(() => {
    const unsub = subscribeToAvailability((map) => {
      setAvailabilityMap(map)
    })
    return () => unsub?.()
  }, [])

  // Filter employees by search
  const filteredEmployees = employees.filter((emp) =>
    emp.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Toggle editing for an employee
  const toggleEdit = useCallback(
    (emp: string) => {
      if (editingEmployee === emp) {
        setEditingEmployee(null)
      } else {
        setEditingEmployee(emp)
        // Initialize availability if not set
        if (!availabilityMap[emp]) {
          const newMap = { ...availabilityMap }
          newMap[emp] = createDefaultWeeklyAvailability()
          setAvailabilityMap(newMap)
        }
      }
    },
    [editingEmployee, availabilityMap]
  )

  // Toggle a specific shift
  const toggleShift = useCallback(
    async (emp: string, day: DayOfWeek, shift: 'lunch' | 'dinner') => {
      const currentAvail = availabilityMap[emp] || createDefaultWeeklyAvailability()
      const isAvailable = currentAvail[day]?.[shift] ?? false

      const newAvail: WeeklyAvailability = {
        ...currentAvail,
        [day]: {
          ...currentAvail[day],
          [shift]: !isAvailable,
        },
      }

      const newMap = { ...availabilityMap, [emp]: newAvail }
      setAvailabilityMap(newMap)

      try {
        await saveAvailability(newMap)
      } catch (err) {
        console.error('Failed to save availability:', err)
        // Revert on error
        setAvailabilityMap(availabilityMap)
      }
    },
    [availabilityMap]
  )

  // Get summary text for an employee's availability
  const getSummaryText = (avail: WeeklyAvailability | undefined): string[] => {
    if (!avail) return []

    const tags: string[] = []
    DAY_OF_WEEK_KEYS.forEach((day) => {
      const hasLunch = avail[day]?.lunch
      const hasDinner = avail[day]?.dinner
      if (hasLunch || hasDinner) {
        const label = DAY_OF_WEEK_LABELS[day]
        const shifts = hasLunch && hasDinner ? 'L+D' : hasLunch ? 'L' : 'D'
        tags.push(`${label} (${shifts})`)
      }
    })
    return tags
  }

  return (
    <div className="availability-page">
      <header className="admin-page-header">
        <h1>Weekly Availability</h1>
        <p>Set each employee's usual working shifts. This helps with time off requests.</p>
      </header>

      {/* Search */}
      <div className="availability-search">
        <input
          type="text"
          className="admin-input"
          placeholder="Search employees..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span className="availability-count">{filteredEmployees.length} employees</span>
      </div>

      {/* Employee List */}
      <div className="admin-card availability-list-card">
        {employees.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">👥</span>
            <h3>No employees yet</h3>
            <p>Add employees in the Team section first</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="admin-empty">
            <span className="admin-empty-icon">🔍</span>
            <h3>No matches found</h3>
            <p>Try a different search term</p>
          </div>
        ) : (
          <div className="availability-list">
            {filteredEmployees.map((emp) => {
              const avail = availabilityMap[emp] || null
              const isEditing = editingEmployee === emp
              const summaryTags = getSummaryText(avail)

              return (
                <div key={emp} className={`availability-card ${isEditing ? 'availability-card-editing' : ''}`}>
                  <div className="availability-card-header">
                    <span className="availability-name">{emp}</span>
                    <button
                      className={`admin-btn ${isEditing ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                      onClick={() => toggleEdit(emp)}
                    >
                      {isEditing ? 'Done' : 'Edit'}
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="availability-editor">
                      <div className="availability-grid">
                        {/* Header Row */}
                        <div className="availability-grid-header">
                          <div className="availability-grid-label"></div>
                          {DAY_OF_WEEK_KEYS.map((day) => (
                            <div key={day} className="availability-day-label">
                              {DAY_OF_WEEK_LABELS[day]}
                            </div>
                          ))}
                        </div>

                        {/* Lunch Row */}
                        <div className="availability-grid-row">
                          <div className="availability-shift-label">Lunch</div>
                          {DAY_OF_WEEK_KEYS.map((day) => {
                            const currentAvail = availabilityMap[emp] || createDefaultWeeklyAvailability()
                            const isAvailable = currentAvail[day]?.lunch ?? false
                            return (
                              <button
                                key={day}
                                type="button"
                                className={`availability-toggle ${isAvailable ? 'available' : ''}`}
                                onClick={() => toggleShift(emp, day, 'lunch')}
                                aria-label={`${DAY_OF_WEEK_LABELS[day]} Lunch ${isAvailable ? 'available' : 'not available'}`}
                              >
                                {isAvailable ? '✓' : ''}
                              </button>
                            )
                          })}
                        </div>

                        {/* Dinner Row */}
                        <div className="availability-grid-row">
                          <div className="availability-shift-label">Dinner</div>
                          {DAY_OF_WEEK_KEYS.map((day) => {
                            const currentAvail = availabilityMap[emp] || createDefaultWeeklyAvailability()
                            const isAvailable = currentAvail[day]?.dinner ?? false
                            return (
                              <button
                                key={day}
                                type="button"
                                className={`availability-toggle ${isAvailable ? 'available' : ''}`}
                                onClick={() => toggleShift(emp, day, 'dinner')}
                                aria-label={`${DAY_OF_WEEK_LABELS[day]} Dinner ${isAvailable ? 'available' : 'not available'}`}
                              >
                                {isAvailable ? '✓' : ''}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="availability-help">
                        Tap cells to toggle availability. Changes save automatically.
                      </div>
                    </div>
                  ) : (
                    <div className="availability-summary">
                      {summaryTags.length > 0 ? (
                        <div className="availability-tags">
                          {summaryTags.map((tag) => (
                            <span key={tag} className="availability-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="availability-none">Not configured</span>
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

export default AvailabilityPage
