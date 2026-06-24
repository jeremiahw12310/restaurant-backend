export type EmployeeArchiveMap = Record<string, number>

export type EmployeeRoster = {
  list: string[]
  archivedAtMs: EmployeeArchiveMap
}

export const EMPTY_EMPLOYEE_ROSTER: EmployeeRoster = {
  list: [],
  archivedAtMs: {},
}

export function parseEmployeeRoster(data: unknown): EmployeeRoster {
  if (!data || typeof data !== 'object') return { ...EMPTY_EMPLOYEE_ROSTER }
  const raw = data as { list?: unknown; archivedAtMs?: unknown }
  const list = Array.isArray(raw.list)
    ? raw.list.map((x) => String(x || '').trim()).filter(Boolean)
    : []
  const archivedAtMs: EmployeeArchiveMap = {}
  if (raw.archivedAtMs && typeof raw.archivedAtMs === 'object' && !Array.isArray(raw.archivedAtMs)) {
    Object.entries(raw.archivedAtMs as Record<string, unknown>).forEach(([name, ms]) => {
      const n = name.trim()
      if (!n) return
      let epochMs: number | null = null
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        epochMs = ms
      } else if (ms && typeof ms === 'object' && 'toMillis' in ms && typeof (ms as { toMillis: () => number }).toMillis === 'function') {
        const converted = (ms as { toMillis: () => number }).toMillis()
        if (Number.isFinite(converted)) epochMs = converted
      }
      if (epochMs !== null) archivedAtMs[n] = epochMs
    })
  }
  return { list, archivedAtMs }
}

export function isArchived(name: string, archivedAtMs: EmployeeArchiveMap): boolean {
  const n = name.trim()
  if (!n) return false
  const ms = archivedAtMs[n]
  return typeof ms === 'number' && Number.isFinite(ms)
}

export function getActiveEmployees(list: string[], archivedAtMs: EmployeeArchiveMap): string[] {
  return list.filter((name) => !isArchived(name, archivedAtMs))
}

export function getArchivedEmployees(list: string[], archivedAtMs: EmployeeArchiveMap): string[] {
  return list.filter((name) => isArchived(name, archivedAtMs))
}

const startOfMonth = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d
}

/** Show on leaderboard for this calendar month (hide archive month and later). */
export function isVisibleOnLeaderboard(
  name: string,
  archivedAtMs: EmployeeArchiveMap,
  monthStart: Date
): boolean {
  if (!isArchived(name, archivedAtMs)) return true
  const archivedMs = archivedAtMs[name.trim()]
  if (typeof archivedMs !== 'number' || !Number.isFinite(archivedMs)) return true
  const archiveMonthStart = startOfMonth(new Date(archivedMs))
  const viewMonthStart = startOfMonth(monthStart)
  return archiveMonthStart > viewMonthStart
}

export function filterEmployeesForLeaderboardMonth(
  list: string[],
  archivedAtMs: EmployeeArchiveMap,
  monthStart: Date
): string[] {
  return list.filter((name) => isVisibleOnLeaderboard(name, archivedAtMs, monthStart))
}

export function renameEmployeeArchiveKey(
  archivedAtMs: EmployeeArchiveMap,
  oldName: string,
  newName: string
): EmployeeArchiveMap {
  const o = oldName.trim()
  const n = newName.trim()
  if (!o || !n || o === n) return archivedAtMs
  if (!(o in archivedAtMs)) return archivedAtMs
  const next = { ...archivedAtMs }
  next[n] = next[o]
  delete next[o]
  return next
}

export function removeEmployeeArchiveKey(
  archivedAtMs: EmployeeArchiveMap,
  name: string
): EmployeeArchiveMap {
  const n = name.trim()
  if (!n || !(n in archivedAtMs)) return archivedAtMs
  const next = { ...archivedAtMs }
  delete next[n]
  return next
}
