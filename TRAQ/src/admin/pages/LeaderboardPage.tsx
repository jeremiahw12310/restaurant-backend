import { useState, useEffect, useMemo, useCallback } from 'react'
import './LeaderboardPage.css'
import {
  subscribeToRecentTaskCompletions,
  subscribeToTaskCatalog,
  subscribeToEmployees,
  subscribeToTaskOverrides,
  type TaskState,
  type TaskCatalog,
  type TaskOverrides,
  type TaskDef,
  type TaskOverride,
  type WindowKey,
} from '../../services/firestore'
import {
  computeShiftLeadersForState,
  getWeightsForDateKey,
  type LeaderRow,
} from '../../utils/taskScoring'
import { TASKS } from '../../constants/tasks'
import type { Task } from '../../types/task'

// Shift windows config (matches App.tsx)
const SHIFT_WINDOWS: Record<'day' | 'night', WindowKey[]> = {
  day: ['11', '17'],
  night: ['21'],
}

// Window config (matches App.tsx)
const WINDOWS = [
  { key: '11' as WindowKey, label: '11AM', start: '11:00', lateAfter: '12:00' },
  { key: '17' as WindowKey, label: '5PM', start: '17:00', lateAfter: '17:30', unlocksAt: '16:00' },
  { key: '21' as WindowKey, label: '9PM', start: '21:00', lateAfter: '21:00', unlocksAt: '18:00' },
]

// Helper to combine date and time string
function combineDateTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date(date)
  next.setHours(hours, minutes, 0, 0)
  return next
}

// Types for shift history breakdown
type ShiftEntry = {
  dateKey: string
  displayDate: string
  shift: 'day' | 'night'
  score: number
}

type EmployeeShiftHistory = {
  shifts: ShiftEntry[]
  totalScore: number
  shiftCount: number
  averageScore: number
}

// Helper to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Format date for display (e.g., "Wed, Jan 15")
function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Get month date range
function getMonthRange(month: Date): { from: string; to: string } {
  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDay = new Date(year, m, 1)
  const lastDay = new Date(year, m + 1, 0)
  
  // Cap to today if viewing current month
  const today = new Date()
  const endDate = lastDay > today ? today : lastDay
  
  return { from: formatDateKey(firstDay), to: formatDateKey(endDate) }
}

// Format month for display
function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Check if two dates are in the same month
function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

// Add months to a date
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

// Get start of month
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function LeaderboardPage() {
  // State
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [taskState, setTaskState] = useState<TaskState>({})
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalog>({ tasks: [] })
  const [taskOverrides, setTaskOverrides] = useState<TaskOverrides | null>(null)
  const [employees, setEmployees] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)

  const now = new Date()
  const monthRange = useMemo(() => getMonthRange(selectedMonth), [selectedMonth])
  const monthTitle = useMemo(() => formatMonthTitle(selectedMonth), [selectedMonth])
  const isCurrentMonth = useMemo(() => isSameMonth(selectedMonth, now), [selectedMonth, now])
  const todayKey = useMemo(() => formatDateKey(now), [now])

  // Subscribe to employees
  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployees(list)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to task catalog
  useEffect(() => {
    const unsub = subscribeToTaskCatalog((catalog) => {
      setTaskCatalog(catalog)
    })
    return () => unsub?.()
  }, [])

  // Subscribe to task overrides
  useEffect(() => {
    const unsub = subscribeToTaskOverrides((overrides) => {
      setTaskOverrides(overrides)
    })
    return () => unsub?.()
  }, [])

  // Merge builtin TASKS with taskCatalog and apply overrides (matches App.tsx logic)
  const allTasks = useMemo((): Task[] => {
    const byId: Record<string, Task> = {}
    TASKS.forEach((t) => {
      byId[t.id] = { ...t, source: 'builtin', createdAtMs: t.createdAtMs ?? 0 }
    })
    ;(taskCatalog?.tasks || []).forEach((t: TaskDef) => {
      if (byId[t.id]) return
      byId[t.id] = { ...t, source: 'admin' }
    })

    const overrides = taskOverrides?.overrides || {}
    Object.keys(overrides).forEach((taskId) => {
      const ov = overrides[taskId] as TaskOverride | undefined
      const base = byId[taskId]
      if (!ov || !base) return
      const next: Task = { ...base }
      if (typeof ov.name === 'string' && ov.name.trim()) {
        next.name = ov.name.trim()
      }
      if (Array.isArray(ov.requirements) && ov.requirements.length > 0) {
        next.requirements = ov.requirements
        next.requirementsUpdatedAtMs = typeof ov.updatedAtMs === 'number' ? ov.updatedAtMs : undefined
        next.requirementsOverridden = true
      }
      byId[taskId] = next
    })

    return Object.values(byId)
  }, [taskCatalog, taskOverrides])

  // Subscribe to completions for selected month
  useEffect(() => {
    setLoading(true)
    const { from, to } = monthRange
    
    const unsub = subscribeToRecentTaskCompletions(
      from,
      to,
      (state) => {
        setTaskState(state)
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
      { saveToLocalStorage: false }
    )
    
    return () => unsub?.()
  }, [monthRange])

  // Window timing functions (matches App.tsx)
  const windowStartMsForDateKey = useCallback((dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const w = WINDOWS.find((x) => x.key === windowKey)
    const start = w?.start || '00:00'
    return combineDateTime(baseDate, start).getTime()
  }, [])

  const windowCloseMsForDateKey = useCallback((dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const nextWindowKey: WindowKey | null = windowKey === '11' ? '17' : windowKey === '17' ? '21' : null
    if (nextWindowKey) {
      const nextW = WINDOWS.find((x) => x.key === nextWindowKey)
      const nextStart = nextW?.start || '24:00'
      return combineDateTime(baseDate, nextStart).getTime()
    }
    const nextDay = new Date(baseDate)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    return nextDay.getTime()
  }, [])

  // Get weights for a date key (matches App.tsx logic)
  const getWeightsForDateKeyFn = useCallback((dateKey: string) => {
    return getWeightsForDateKey({
      dateKey,
      allTasks,
      taskOverrides,
      windowMs: { windowStartMsForDateKey, windowCloseMsForDateKey },
    })
  }, [allTasks, taskOverrides, windowStartMsForDateKey, windowCloseMsForDateKey])

  // Compute shift history for all employees (matches main leaderboard logic exactly)
  const shiftHistoryByEmployee = useMemo(() => {
    const result: Record<string, EmployeeShiftHistory> = {}
    const { from: fromKey, to: toKey } = monthRange

    // Process each date in the month (same as main leaderboard)
    // Sort dates to ensure consistent processing
    const dateKeys = Object.keys(taskState).filter((dateKey) => {
      return dateKey >= fromKey && dateKey <= toKey
    }).sort()

    dateKeys.forEach((dateKey) => {
      const { taskIdsByWindow, windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKeyFn(dateKey)

      ;(['day', 'night'] as const).forEach((shift) => {
        // Reduce confusion: don't let today's in-progress shift influence the month leaderboard.
        // Count a shift only once all tasks in that shift's windows are completed.
        if (dateKey === todayKey && toKey === todayKey) {
          const windows = SHIFT_WINDOWS[shift]
          let complete = true
          for (let wi = 0; wi < windows.length; wi++) {
            const wKey = windows[wi]
            const ids = taskIdsByWindow[wKey] || []
            for (let ti = 0; ti < ids.length; ti++) {
              const taskId = ids[ti]
              if (!taskState[dateKey]?.[wKey]?.[taskId]) {
                complete = false
                break
              }
            }
            if (!complete) break
          }
          if (!complete) return
        }

        // Compute shift leaders for this date+shift (exact same as main leaderboard)
        const shiftRows = computeShiftLeadersForState(
          taskState,
          dateKey,
          shift,
          SHIFT_WINDOWS,
          windowTaskWeights,
          taskWeightByIdByWindow
        )

        // Track each shift (same logic as main leaderboard)
        // Note: computeShiftLeadersForState returns rows for everyone with credit,
        // but shiftsPlayed is 0 or 1. We only track shifts where shiftsPlayed === 1
        shiftRows.forEach((row) => {
          const name = row.name
          
          // Only track shifts where the person actually played (shiftsPlayed === 1)
          // This excludes auto-assigned completions
          // Note: row.score can be 0-100, and we track all shifts where they participated
          if (row.shiftsPlayed === 1) {
            if (!result[name]) {
              result[name] = { shifts: [], totalScore: 0, shiftCount: 0, averageScore: 0 }
            }
            
            result[name].shifts.push({
              dateKey,
              displayDate: formatDisplayDate(dateKey),
              shift,
              score: row.score,
            })
            result[name].totalScore += row.score
            result[name].shiftCount += 1
          }
        })
      })
    })

    // Calculate averages (same as main leaderboard: Math.round(sum / shifts))
    Object.values(result).forEach((history) => {
      history.averageScore = history.shiftCount > 0 
        ? Math.round(history.totalScore / history.shiftCount) 
        : 0
    })

    // Sort shifts by date (most recent first)
    Object.values(result).forEach((history) => {
      history.shifts.sort((a, b) => {
        if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey)
        // If same date, show day before night
        return a.shift === 'day' ? -1 : 1
      })
    })

    return result
  }, [taskState, monthRange, getWeightsForDateKeyFn, todayKey])

  // Compute leaderboard rankings
  const leaderboardRows = useMemo((): LeaderRow[] => {
    const byName: Record<string, LeaderRow> = {}
    
    Object.entries(shiftHistoryByEmployee).forEach(([name, history]) => {
      byName[name] = {
        name,
        score: history.averageScore,
        shiftsPlayed: history.shiftCount,
      }
    })

    // Include all employees, even those with no shifts
    const rows: LeaderRow[] = employees.map((name) => ({
      name,
      score: byName[name]?.score ?? 0,
      shiftsPlayed: byName[name]?.shiftsPlayed ?? 0,
    }))

    // Sort by score descending, then by shifts, then alphabetically
    rows.sort((a, b) => 
      (b.score - a.score) || 
      (b.shiftsPlayed - a.shiftsPlayed) || 
      a.name.localeCompare(b.name)
    )

    return rows
  }, [employees, shiftHistoryByEmployee])

  // Compute ranks with tie handling
  // Players with the same score share the same rank
  // Next rank after a tie = previous rank + 1
  const ranks = useMemo(() => {
    if (leaderboardRows.length === 0) return []
    
    const computedRanks: number[] = []
    let currentRank = 1
    let i = 0
    
    while (i < leaderboardRows.length) {
      // Find all consecutive rows with the same score
      const currentScore = leaderboardRows[i].score
      let groupSize = 0
      
      while (i + groupSize < leaderboardRows.length && 
             leaderboardRows[i + groupSize].score === currentScore) {
        groupSize++
      }
      
      // Assign the same rank to all rows in this group
      for (let j = 0; j < groupSize; j++) {
        computedRanks[i + j] = currentRank
      }
      
      // Move to next group and update rank
      i += groupSize
      currentRank += 1
    }
    
    return computedRanks
  }, [leaderboardRows])

  // Count how many players share each rank (for tied detection)
  const rankCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    ranks.forEach(rank => {
      counts[rank] = (counts[rank] || 0) + 1
    })
    return counts
  }, [ranks])

  // Get selected employee's history
  const selectedHistory = useMemo((): EmployeeShiftHistory | null => {
    if (!selectedEmployee) return null
    return shiftHistoryByEmployee[selectedEmployee] || { shifts: [], totalScore: 0, shiftCount: 0, averageScore: 0 }
  }, [selectedEmployee, shiftHistoryByEmployee])

  // Navigation handlers
  const goToPrevMonth = useCallback(() => {
    setSelectedMonth((prev) => startOfMonth(addMonths(prev, -1)))
  }, [])

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((prev) => startOfMonth(addMonths(prev, 1)))
  }, [])

  // Get medal for rank
  const getMedal = (rank: number): string => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `${rank}.`
  }

  return (
    <div className="leaderboard-page">
      <header className="admin-page-header leaderboard-header">
        <div>
          <h1>🏆 Leaderboard</h1>
          <p>Employee rankings and shift score breakdowns</p>
        </div>
        <div className="leaderboard-month-nav">
          <button 
            className="leaderboard-nav-btn" 
            onClick={goToPrevMonth}
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="leaderboard-month-title">{monthTitle}</span>
          <button 
            className="leaderboard-nav-btn" 
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </header>

      {loading ? (
        <div className="leaderboard-loading">
          <span className="leaderboard-spinner">⏳</span>
          <p>Loading leaderboard...</p>
        </div>
      ) : (
        <div className="leaderboard-content">
          {/* Rankings Panel */}
          <div className="leaderboard-rankings admin-card">
            <h3 className="admin-card-title">
              <span>📊</span> Rankings
            </h3>
            <p className="leaderboard-subtitle">Click an employee to see their shift breakdown</p>
            
            {leaderboardRows.length === 0 ? (
              <div className="leaderboard-empty">No data for this month</div>
            ) : (
              <div className="leaderboard-list">
                {leaderboardRows.map((row, idx) => {
                  const rank = ranks[idx] ?? idx + 1
                  const isSelected = selectedEmployee === row.name
                  const hasData = row.shiftsPlayed > 0
                  const isTied = rankCounts[rank] > 1
                  
                  return (
                    <div
                      key={row.name}
                      className={`leaderboard-row ${isSelected ? 'selected' : ''} ${!hasData ? 'no-data' : ''} ${rank <= 3 ? 'podium' : ''}`}
                      onClick={() => setSelectedEmployee(row.name)}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={`leaderboard-rank ${rank <= 3 ? `rank-${rank}` : ''}`}>
                        {getMedal(rank)}
                        {isTied && <span className="leaderboard-tied-badge" title="Tied">=</span>}
                      </span>
                      <span className="leaderboard-name">{row.name}</span>
                      <span className="leaderboard-score">
                        {hasData ? `${row.score} pts` : '—'}
                      </span>
                      <span className="leaderboard-shifts">
                        {hasData ? `${row.shiftsPlayed} shifts` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Breakdown Panel */}
          <div className="leaderboard-breakdown admin-card">
            {!selectedEmployee ? (
              <div className="leaderboard-breakdown-empty">
                <span className="leaderboard-breakdown-icon">👈</span>
                <p>Select an employee to see their shift breakdown</p>
              </div>
            ) : (
              <>
                <h3 className="admin-card-title">
                  <span>📋</span> {selectedEmployee}'s Shifts
                </h3>

                {selectedHistory && selectedHistory.shiftCount > 0 ? (
                  <>
                    {/* Summary Stats */}
                    <div className="leaderboard-summary">
                      <div className="leaderboard-summary-stat">
                        <span className="leaderboard-summary-value">{selectedHistory.averageScore}</span>
                        <span className="leaderboard-summary-label">Avg Score</span>
                      </div>
                      <div className="leaderboard-summary-stat">
                        <span className="leaderboard-summary-value">{selectedHistory.shiftCount}</span>
                        <span className="leaderboard-summary-label">Shifts</span>
                      </div>
                      <div className="leaderboard-summary-stat">
                        <span className="leaderboard-summary-value">{selectedHistory.totalScore}</span>
                        <span className="leaderboard-summary-label">Total Pts</span>
                      </div>
                    </div>

                    {/* Shift List */}
                    <div className="leaderboard-shift-list">
                      {selectedHistory.shifts.map((entry, idx) => (
                        <div key={`${entry.dateKey}-${entry.shift}-${idx}`} className="leaderboard-shift-entry">
                          <div className="leaderboard-shift-date">{entry.displayDate}</div>
                          <div className={`leaderboard-shift-type ${entry.shift}`}>
                            {entry.shift === 'day' ? '☀️ Day' : '🌙 Night'}
                          </div>
                          <div className="leaderboard-shift-score-container">
                            <div 
                              className={`leaderboard-shift-bar ${entry.score >= 80 ? 'high' : entry.score >= 60 ? 'medium' : 'low'}`}
                              style={{ width: `${entry.score}%` }}
                            />
                            <span className="leaderboard-shift-score">{entry.score} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Calculation */}
                    <div className="leaderboard-calc">
                      {selectedHistory.totalScore} pts ÷ {selectedHistory.shiftCount} shifts = <strong>{selectedHistory.averageScore} avg</strong>
                    </div>
                  </>
                ) : (
                  <div className="leaderboard-breakdown-empty">
                    <span className="leaderboard-breakdown-icon">📭</span>
                    <p>{selectedEmployee} has no shifts recorded this month</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaderboardPage
