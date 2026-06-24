import type { AvailabilityMap, DayOfWeek, WeeklyAvailability } from '../services/firestore'

export type AvailabilityMeta = {
  effectiveFromDateKey: string
  priorPattern: WeeklyAvailability
}

export type AvailabilityState = {
  patterns: AvailabilityMap
  metaByEmployee: Record<string, AvailabilityMeta>
}

export const EMPTY_AVAILABILITY_STATE: AvailabilityState = {
  patterns: {},
  metaByEmployee: {},
}

const defaultDay = (): { lunch: boolean; dinner: boolean } => ({ lunch: false, dinner: false })

export function createDefaultWeeklyAvailability(): WeeklyAvailability {
  return {
    sun: defaultDay(),
    mon: defaultDay(),
    tue: defaultDay(),
    wed: defaultDay(),
    thu: defaultDay(),
    fri: defaultDay(),
    sat: defaultDay(),
  }
}

const DAY_KEYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function weeklyAvailabilityEquals(
  a: WeeklyAvailability | null | undefined,
  b: WeeklyAvailability | null | undefined
): boolean {
  for (const day of DAY_KEYS) {
    const al = a?.[day]?.lunch ?? false
    const ad = a?.[day]?.dinner ?? false
    const bl = b?.[day]?.lunch ?? false
    const bd = b?.[day]?.dinner ?? false
    if (al !== bl || ad !== bd) return false
  }
  return true
}

/** Pattern that applies on a specific calendar day (respects effective-from metadata). */
export function getPatternForDateKey(
  employee: string,
  dateKey: string,
  state: AvailabilityState
): WeeklyAvailability | null {
  const current = state.patterns[employee]
  const meta = state.metaByEmployee[employee]
  if (!meta?.effectiveFromDateKey) {
    return current ?? null
  }
  if (dateKey < meta.effectiveFromDateKey) {
    return meta.priorPattern ?? current ?? null
  }
  return current ?? null
}

export function isShiftAvailableOnDateKey(
  employee: string,
  dateKey: string,
  shift: 'lunch' | 'dinner',
  state: AvailabilityState
): boolean {
  const pattern = getPatternForDateKey(employee, dateKey, state)
  if (!pattern) return false
  const dow = dateKeyToDayOfWeek(dateKey)
  return pattern[dow]?.[shift] === true
}

function dateKeyToDayOfWeek(dateKey: string): DayOfWeek {
  const [y, m, d] = dateKey.split('-').map(Number)
  const keys: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return keys[new Date(y, m - 1, d).getDay()]
}

/** Merge an employee pattern update; snapshots prior pattern effective from `changeDateKey`. */
export function applyEmployeeAvailabilityUpdate(
  state: AvailabilityState,
  employee: string,
  newPattern: WeeklyAvailability,
  changeDateKey: string
): AvailabilityState {
  const previous = state.patterns[employee]
  if (weeklyAvailabilityEquals(previous, newPattern)) {
    return state
  }

  const priorPattern = previous
    ? cloneWeeklyAvailability(previous)
    : createDefaultWeeklyAvailability()

  return {
    patterns: { ...state.patterns, [employee]: cloneWeeklyAvailability(newPattern) },
    metaByEmployee: {
      ...state.metaByEmployee,
      [employee]: {
        effectiveFromDateKey: changeDateKey,
        priorPattern,
      },
    },
  }
}

function cloneWeeklyAvailability(w: WeeklyAvailability): WeeklyAvailability {
  const out = createDefaultWeeklyAvailability()
  for (const day of DAY_KEYS) {
    out[day] = { lunch: w[day]?.lunch ?? false, dinner: w[day]?.dinner ?? false }
  }
  return out
}

/** Legacy docs: patterns only, no meta. */
export function parseAvailabilityDoc(data: {
  byEmployee?: AvailabilityMap
  metaByEmployee?: Record<string, AvailabilityMeta>
}): AvailabilityState {
  return {
    patterns: data.byEmployee || {},
    metaByEmployee: data.metaByEmployee || {},
  }
}

/** Back-compat: read patterns map only. */
export function patternsFromState(state: AvailabilityState): AvailabilityMap {
  return state.patterns
}
