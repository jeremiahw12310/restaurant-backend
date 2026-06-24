import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCachedEmployeeRoster,
  setEmployeeArchived,
  subscribeToEmployeeRoster,
  type EmployeeRoster,
} from '../services/firestore'
import {
  getActiveEmployees,
  getArchivedEmployees,
  type EmployeeArchiveMap,
} from '../utils/employeeRoster'

export function useEmployeeRoster() {
  const [list, setList] = useState<string[]>(() => getCachedEmployeeRoster().list)
  const [archivedAtMs, setArchivedAtMs] = useState<EmployeeArchiveMap>(
    () => getCachedEmployeeRoster().archivedAtMs
  )

  const applyRoster = useCallback((roster: EmployeeRoster) => {
    setList(roster.list)
    setArchivedAtMs(roster.archivedAtMs)
  }, [])

  useEffect(() => {
    const unsub = subscribeToEmployeeRoster((roster: EmployeeRoster) => {
      applyRoster(roster)
    })
    return () => unsub?.()
  }, [applyRoster])

  const activeEmployees = useMemo(
    () => getActiveEmployees(list, archivedAtMs),
    [list, archivedAtMs]
  )

  const archivedEmployees = useMemo(
    () => getArchivedEmployees(list, archivedAtMs),
    [list, archivedAtMs]
  )

  const archiveEmployee = useCallback(async (name: string) => {
    const next = await setEmployeeArchived(name, true)
    applyRoster(next)
  }, [applyRoster])

  const restoreEmployee = useCallback(async (name: string) => {
    const next = await setEmployeeArchived(name, false)
    applyRoster(next)
  }, [applyRoster])

  return {
    list,
    archivedAtMs,
    activeEmployees,
    archivedEmployees,
    archiveEmployee,
    restoreEmployee,
  }
}
