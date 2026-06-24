import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AP } from '../adminPaths'
import type { TimeOffRequest, AvailabilityState } from '../../services/firestore'
import {
  addDaysToDateKey,
} from '../../utils/dailyTaskWeekGenerator'
import {
  buildWeekPreviewModel,
  getWeekStartDateKeyMonday,
  type ShiftRoster,
} from '../../utils/availabilityWeekPreview'
import { formatDateKey } from '../../utils/dayOfWeek'

type Props = {
  weekStartDateKey: string
  onWeekStartChange: (weekStartDateKey: string) => void
  availabilityState: AvailabilityState
  timeOffRequests: TimeOffRequest[]
  employees: string[]
  searchQuery: string
}

function NameList({ names, emptyLabel }: { names: string[]; emptyLabel: string }) {
  if (names.length === 0) {
    return <span className="availability-week-empty">{emptyLabel}</span>
  }
  return (
    <ul className="availability-week-names">
      {names.map((name) => (
        <li key={name} className="availability-week-chip">
          {name}
        </li>
      ))}
    </ul>
  )
}

function ShiftBlock({
  title,
  roster,
}: {
  title: string
  roster: ShiftRoster
}) {
  return (
    <div className="availability-week-shift">
      <div className="availability-week-shift-title">{title}</div>
      <div className="availability-week-section">
        <span className="availability-week-section-label availability-week-section-label--available">
          Available
        </span>
        <NameList names={roster.available} emptyLabel="None" />
      </div>
      {roster.off.length > 0 ? (
        <div className="availability-week-section">
          <span className="availability-week-section-label availability-week-section-label--off">
            Time off
          </span>
          <NameList names={roster.off} emptyLabel="" />
        </div>
      ) : null}
      {roster.pending.length > 0 ? (
        <div className="availability-week-section">
          <span className="availability-week-section-label availability-week-section-label--pending">
            Pending
          </span>
          <NameList names={roster.pending} emptyLabel="" />
        </div>
      ) : null}
    </div>
  )
}

export function AvailabilityWeekPreview({
  weekStartDateKey,
  onWeekStartChange,
  availabilityState,
  timeOffRequests,
  employees,
  searchQuery,
}: Props) {
  const todayDateKey = formatDateKey(new Date())

  const model = useMemo(
    () =>
      buildWeekPreviewModel({
        weekStartDateKey,
        todayDateKey,
        employees,
        availabilityState,
        timeOffRequests,
        searchQuery,
      }),
    [weekStartDateKey, todayDateKey, employees, availabilityState, timeOffRequests, searchQuery]
  )

  const goPrevWeek = () => onWeekStartChange(addDaysToDateKey(weekStartDateKey, -7))
  const goNextWeek = () => onWeekStartChange(addDaysToDateKey(weekStartDateKey, 7))
  const handleToday = () => onWeekStartChange(getWeekStartDateKeyMonday(todayDateKey))

  return (
    <div className="admin-card availability-week-card">
      <div className="availability-week-nav">
        <button type="button" className="admin-btn admin-btn-secondary" onClick={goPrevWeek}>
          ← Prev week
        </button>
        <div className="availability-week-nav-center">
          <strong className="availability-week-label">{model.weekLabel}</strong>
          <button type="button" className="admin-btn admin-btn-secondary availability-week-today-btn" onClick={handleToday}>
            Today
          </button>
        </div>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={goNextWeek}>
          Next week →
        </button>
      </div>

      <div className="availability-week-grid-scroll">
        <div className="availability-week-grid">
          {model.days.map((day) => (
            <div
              key={day.dateKey}
              className={`availability-week-day ${day.isToday ? 'availability-week-day--today' : ''}`}
            >
              <div className="availability-week-day-header">{day.label}</div>
              <ShiftBlock title="Lunch" roster={day.lunch} />
              <ShiftBlock title="Dinner" roster={day.dinner} />
            </div>
          ))}
        </div>
      </div>

      <div className="availability-week-footer">
        <div className="availability-week-legend">
          <span className="availability-week-legend-item availability-week-legend-item--available">Available</span>
          <span className="availability-week-legend-item availability-week-legend-item--off">Approved time off</span>
          <span className="availability-week-legend-item availability-week-legend-item--pending">
            Pending request (still shown as available)
          </span>
          <span className="availability-week-legend-item">
            Pattern changes apply from today forward
          </span>
        </div>
        {model.pendingRequestCount > 0 ? (
          <Link to={AP.timeOff} className="availability-week-pto-link">
            {model.pendingRequestCount} pending request{model.pendingRequestCount !== 1 ? 's' : ''} → Time Off
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export default AvailabilityWeekPreview
