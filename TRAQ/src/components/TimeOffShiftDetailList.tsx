import './TimeOffShiftDetailList.css'
import type { RequestedShift } from '../services/firestore'
import {
  displayDateShort,
  formatShiftTypeLabel,
  groupRequestedShiftsByDateSorted,
  parseDateKey,
} from '../utils/timeOffDisplay'

type Props = {
  requestedShifts: RequestedShift[]
  className?: string
}

export function TimeOffShiftDetailList({ requestedShifts, className }: Props) {
  if (!requestedShifts.length) return null
  const rows = groupRequestedShiftsByDateSorted(requestedShifts)
  return (
    <ul className={`timeoff-shift-detail-list${className ? ` ${className}` : ''}`}>
      {rows.map(({ dateKey, shifts }) => (
        <li key={dateKey} className="timeoff-shift-detail-row">
          <span className="timeoff-shift-detail-date">{displayDateShort(parseDateKey(dateKey))}</span>
          <span className="timeoff-shift-detail-shifts">{shifts.map(formatShiftTypeLabel).join(', ')}</span>
        </li>
      ))}
    </ul>
  )
}
