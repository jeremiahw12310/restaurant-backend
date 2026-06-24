import { useState, useEffect, useCallback } from 'react'
import './AvailabilityPage.css'
import {
  subscribeToAvailability,
  subscribeToTimeOffRequests,
  saveAvailabilityState,
  createDefaultWeeklyAvailability,
  type DayOfWeek,
  type WeeklyAvailability,
  type AvailabilityState,
  type TimeOffRequest,
} from '../../services/firestore'
import { AvailabilityWeekPreview } from '../components/AvailabilityWeekPreview'
import { useEmployeeRoster } from '../../hooks/useEmployeeRoster'
import { applyEmployeeAvailabilityUpdate } from '../../utils/availabilityEffective'
import { getWeekStartDateKeyMonday } from '../../utils/availabilityWeekPreview'
import { DAY_OF_WEEK_KEYS, DAY_OF_WEEK_LABELS, formatDateKey } from '../../utils/dayOfWeek'

export function AvailabilityPage() {
  const { activeEmployees } = useEmployeeRoster()
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>({
    patterns: {},
    metaByEmployee: {},
  })
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [weekStartDateKey, setWeekStartDateKey] = useState(() =>
    getWeekStartDateKeyMonday(formatDateKey(new Date()))
  )
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Subscribe to availability
  useEffect(() => {
    const unsub = subscribeToAvailability((state) => {
      setAvailabilityState(state)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to time off (week preview overlay)
  useEffect(() => {
    const unsub = subscribeToTimeOffRequests((reqs) => {
      setTimeOffRequests(reqs)
    })
    return () => unsub?.()
  }, [])

  // Filter employees by search
  const filteredEmployees = activeEmployees.filter((emp) =>
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
        if (!availabilityState.patterns[emp]) {
          const newMap = { ...availabilityState.patterns }
          newMap[emp] = createDefaultWeeklyAvailability()
          setAvailabilityState((prev) => ({ ...prev, patterns: newMap }))
        }
      }
    },
    [editingEmployee, availabilityState.patterns]
  )

  const todayDateKey = formatDateKey(new Date())

  // Toggle a specific shift
  const toggleShift = useCallback(
    async (emp: string, day: DayOfWeek, shift: 'lunch' | 'dinner') => {
      const currentAvail =
        availabilityState.patterns[emp] || createDefaultWeeklyAvailability()
      const isAvailable = currentAvail[day]?.[shift] ?? false

      const newAvail: WeeklyAvailability = {
        ...currentAvail,
        [day]: {
          ...currentAvail[day],
          [shift]: !isAvailable,
        },
      }

      const nextState = applyEmployeeAvailabilityUpdate(
        availabilityState,
        emp,
        newAvail,
        todayDateKey
      )
      setAvailabilityState(nextState)

      try {
        await saveAvailabilityState(nextState)
      } catch (err) {
        console.error('Failed to save availability:', err)
        setAvailabilityState(availabilityState)
      }
    },
    [availabilityState, todayDateKey]
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
        <p>
          Use the week preview to see who is available each day (Mon–Sun), including approved time off.
          Edit recurring patterns below.
        </p>
      </header>

      <AvailabilityWeekPreview
        weekStartDateKey={weekStartDateKey}
        onWeekStartChange={setWeekStartDateKey}
        availabilityState={availabilityState}
        timeOffRequests={timeOffRequests}
        employees={activeEmployees}
        searchQuery={searchQuery}
      />

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
        {activeEmployees.length === 0 ? (
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
              const avail = availabilityState.patterns[emp] || null
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
                            const currentAvail =
                              availabilityState.patterns[emp] || createDefaultWeeklyAvailability()
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
                            const currentAvail =
                              availabilityState.patterns[emp] || createDefaultWeeklyAvailability()
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
