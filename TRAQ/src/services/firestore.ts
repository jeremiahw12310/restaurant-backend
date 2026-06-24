import { db, waitForFirebase } from '../firebase'
import {
  EMPTY_EMPLOYEE_ROSTER,
  parseEmployeeRoster,
  renameEmployeeArchiveKey,
  type EmployeeRoster,
} from '../utils/employeeRoster'
export type { EmployeeRoster } from '../utils/employeeRoster'
import {
  getDayApprovalStatus,
  parseWeekDayEntry,
  withApproval,
} from '../utils/dailyTaskApproval'
import { getWeekStartDateKeySunday } from '../utils/dailyTaskWeekGenerator'
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

export type WindowKey = '11' | '17' | '21'

// Collection names
const EMPLOYEES_COLLECTION = 'config'
const TASK_ORDER_COLLECTION = 'config'

// LocalStorage keys for offline bootstrap
const LS_EMPLOYEES_KEY = 'traq-employees-v1'
const LS_EMPLOYEE_ROSTER_KEY = 'traq-employee-roster-v1'
const LS_EMPLOYEE_COLORS_KEY = 'traq-employee-colors-v1'
const LS_TASK_ORDER_KEY = 'traq-task-order-v1'
const LS_TASK_ORDER_V3_KEY = 'traq-task-order-v3-v1'
const LS_TASK_STATE_KEY = 'traq-task-state-v1'
const LS_BREAK_SELECTION_PREFIX = 'traq-break-selection-v1:' // + YYYY-MM-DD
const LS_SOLO_MODE_PREFIX = 'traq-solo-mode-v1:' // + YYYY-MM-DD
const LS_TASK_CATALOG_KEY = 'traq-task-catalog-v1'
const LS_TASK_OVERRIDES_KEY = 'traq-task-overrides-v1'
const LS_DAILY_TASK_CATALOG_KEY = 'traq-daily-task-catalog-v1'
const LS_DAILY_TASK_WEEK_PREFIX = 'traq-daily-task-week-v1:' // + weekStartDateKey (YYYY-MM-DD)
const LS_TASK_STAGES_KEY = 'traq-task-stages-v1'

// Track data source for debugging
export type DataSource = 'firestore-sdk' | 'localStorage' | 'default'
let lastEmployeeSource: DataSource = 'default'
let lastTaskStateSource: DataSource = 'default'
let lastTaskCatalogSource: DataSource = 'default'
let lastTaskOverridesSource: DataSource = 'default'
let lastDailyTaskCatalogSource: DataSource = 'default'
export const getLastEmployeeSource = () => lastEmployeeSource
export const getLastTaskStateSource = () => lastTaskStateSource
export const getLastTaskCatalogSource = () => lastTaskCatalogSource
export const getLastTaskOverridesSource = () => lastTaskOverridesSource
export const getLastDailyTaskCatalogSource = () => lastDailyTaskCatalogSource

// Check if Firestore SDK is available
const isFirestoreSDKAvailable = (): boolean => {
  return db !== null
}

// LocalStorage helpers
const getFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      return JSON.parse(raw) as T
    }
  } catch (e) {
    console.warn('LocalStorage read failed:', e)
  }
  return defaultValue
}

const saveToLocalStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('LocalStorage write failed:', e)
  }
}

const assertFirestoreReady = async () => {
  await waitForFirebase()
  if (!isFirestoreSDKAvailable()) {
    throw new Error('Firestore SDK not available')
  }
}

const cacheEmployeeRoster = (roster: EmployeeRoster): void => {
  saveToLocalStorage(LS_EMPLOYEES_KEY, roster.list)
  saveToLocalStorage(LS_EMPLOYEE_ROSTER_KEY, roster)
}

const loadEmployeeRosterFromLocalStorage = (): EmployeeRoster => {
  const cached = getFromLocalStorage<EmployeeRoster | null>(LS_EMPLOYEE_ROSTER_KEY, null)
  if (cached && Array.isArray(cached.list)) {
    return parseEmployeeRoster(cached)
  }
  const list = getFromLocalStorage<string[]>(LS_EMPLOYEES_KEY, [])
  return { list, archivedAtMs: {} }
}

/**
 * Get full employee roster (list + archive map).
 */
export const getEmployeeRoster = async (): Promise<EmployeeRoster> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    const docSnap = await getDoc(docRef)

    lastEmployeeSource = 'firestore-sdk'
    if (!docSnap.exists()) return { ...EMPTY_EMPLOYEE_ROSTER }
    const roster = parseEmployeeRoster(docSnap.data())
    cacheEmployeeRoster(roster)
    return roster
  } catch (error) {
    console.warn('Employee roster load failed, using localStorage:', error)
  }

  lastEmployeeSource = 'localStorage'
  return loadEmployeeRosterFromLocalStorage()
}

/**
 * Get employees - Firestore SDK, fallback to localStorage
 */
export const getEmployees = async (): Promise<string[]> => {
  const roster = await getEmployeeRoster()
  return roster.list
}

/**
 * Save employees - Firestore SDK, always saves to localStorage
 * Uses merge: true to preserve the colors field in the same document.
 */
export const saveEmployees = async (employees: string[]): Promise<void> => {
  // Always save to localStorage as backup
  saveToLocalStorage(LS_EMPLOYEES_KEY, employees)

  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    await setDoc(docRef, { list: employees }, { merge: true })
  } catch (error) {
    console.warn('Employees save failed:', error)
  }
}

/**
 * Subscribe to full employee roster - SDK only
 */
export const subscribeToEmployeeRoster = (callback: (roster: EmployeeRoster) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
      unsubscribe = onSnapshot(docRef, (snap) => {
        const roster = snap.exists() ? parseEmployeeRoster(snap.data()) : { ...EMPTY_EMPLOYEE_ROSTER }
        cacheEmployeeRoster(roster)
        callback(roster)
      })
    } catch (error) {
      console.error('Error subscribing to employee roster:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Subscribe to employees list only (backward compatible).
 */
export const subscribeToEmployees = (callback: (employees: string[]) => void): (() => void) => {
  return subscribeToEmployeeRoster((roster) => callback(roster.list))
}

/**
 * Cached roster for optimistic UI (same source as archive writes).
 */
export const getCachedEmployeeRoster = (): EmployeeRoster => loadEmployeeRosterFromLocalStorage()

/**
 * Archive or restore an employee by name (merge write).
 * Uses read-modify-write on the full `archivedAtMs` map so names with dots/spaces
 * are stored correctly (dot-path field updates break on names like "St. John").
 */
export const setEmployeeArchived = async (employeeName: string, archived: boolean): Promise<EmployeeRoster> => {
  const name = employeeName.trim()
  if (!name) return loadEmployeeRosterFromLocalStorage()

  await assertFirestoreReady()
  const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
  const docSnap = await getDoc(docRef)
  const local = loadEmployeeRosterFromLocalStorage()
  const parsed = docSnap.exists() ? parseEmployeeRoster(docSnap.data()) : local
  const list = parsed.list.length > 0 ? parsed.list : local.list

  const nextArchived = { ...parsed.archivedAtMs }
  if (archived) {
    nextArchived[name] = Date.now()
  } else {
    delete nextArchived[name]
  }

  const nextRoster: EmployeeRoster = { list, archivedAtMs: nextArchived }
  cacheEmployeeRoster(nextRoster)

  try {
    if (docSnap.exists()) {
      await setDoc(docRef, { archivedAtMs: nextArchived }, { merge: true })
    } else {
      await setDoc(docRef, { list, archivedAtMs: nextArchived }, { merge: true })
    }
  } catch (error) {
    console.warn('Employee archive update failed:', error)
    throw error
  }

  return nextRoster
}

/**
 * Rename archive timestamp key when employee is renamed.
 */
export const renameEmployeeArchive = async (oldName: string, newName: string): Promise<void> => {
  const o = oldName.trim()
  const n = newName.trim()
  if (!o || !n || o === n) return

  const local = loadEmployeeRosterFromLocalStorage()
  if (!(o in local.archivedAtMs)) return
  const nextArchived = renameEmployeeArchiveKey(local.archivedAtMs, o, n)
  cacheEmployeeRoster({ list: local.list, archivedAtMs: nextArchived })

  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    await setDoc(docRef, { archivedAtMs: nextArchived }, { merge: true })
  } catch (error) {
    console.warn('Employee archive rename failed:', error)
  }
}

/**
 * Remove archive entry when employee is deleted from roster.
 */
export const clearEmployeeArchive = async (employeeName: string): Promise<void> => {
  const name = employeeName.trim()
  if (!name) return

  const local = loadEmployeeRosterFromLocalStorage()
  if (!(name in local.archivedAtMs)) return
  const nextArchived = { ...local.archivedAtMs }
  delete nextArchived[name]
  cacheEmployeeRoster({ list: local.list, archivedAtMs: nextArchived })

  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    await setDoc(docRef, { archivedAtMs: nextArchived }, { merge: true })
  } catch (error) {
    console.warn('Employee archive clear failed:', error)
  }
}

// ============ EMPLOYEE COLORS ============

export type EmployeeColors = Record<string, string> // employeeName -> hex color

/**
 * Get employee colors - Firestore SDK, fallback to localStorage
 */
export const getEmployeeColors = async (): Promise<EmployeeColors> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) return {}
    const colors = (docSnap.data().colors || {}) as EmployeeColors
    saveToLocalStorage(LS_EMPLOYEE_COLORS_KEY, colors)
    return colors
  } catch (error) {
    console.warn('Employee colors load failed, using localStorage:', error)
  }
  
  // Fallback to localStorage
  return getFromLocalStorage<EmployeeColors>(LS_EMPLOYEE_COLORS_KEY, {})
}

/**
 * Save a single employee's color - Firestore SDK, always saves to localStorage
 */
export const saveEmployeeColor = async (employeeName: string, color: string): Promise<void> => {
  // Update localStorage
  const currentColors = getFromLocalStorage<EmployeeColors>(LS_EMPLOYEE_COLORS_KEY, {})
  currentColors[employeeName] = color
  saveToLocalStorage(LS_EMPLOYEE_COLORS_KEY, currentColors)

  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    const docSnap = await getDoc(docRef)
    const existingColors = docSnap.exists() ? ((docSnap.data().colors || {}) as EmployeeColors) : {}
    existingColors[employeeName] = color
    await setDoc(docRef, { colors: existingColors }, { merge: true })
  } catch (error) {
    console.warn('Employee color save failed:', error)
  }
}

/**
 * Remove an employee's color - Firestore SDK, always updates localStorage
 */
export const removeEmployeeColor = async (employeeName: string): Promise<void> => {
  // Update localStorage
  const currentColors = getFromLocalStorage<EmployeeColors>(LS_EMPLOYEE_COLORS_KEY, {})
  delete currentColors[employeeName]
  saveToLocalStorage(LS_EMPLOYEE_COLORS_KEY, currentColors)

  try {
    await assertFirestoreReady()
    const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
    const docSnap = await getDoc(docRef)
    if (!docSnap.exists()) return
    // IMPORTANT: deleting a key from a map requires a field delete.
    // Writing `{ colors: { ...withoutKey } }` with merge:true can merge maps and leave the removed key behind.
    await updateDoc(docRef, { [`colors.${employeeName}`]: deleteField() })
  } catch (error) {
    console.warn('Employee color remove failed:', error)
  }
}

/**
 * Subscribe to employee colors changes - SDK only
 * When document doesn't exist, we fall back to localStorage to avoid wiping out
 * colors that were just saved (race condition between save and subscription).
 */
export const subscribeToEmployeeColors = (callback: (colors: EmployeeColors) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false
  
  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return
    
    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, EMPLOYEES_COLLECTION, 'employees')
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const colors = (snap.data().colors || {}) as EmployeeColors
          saveToLocalStorage(LS_EMPLOYEE_COLORS_KEY, colors)
          callback(colors)
        } else {
          // Document doesn't exist - fall back to localStorage instead of wiping colors.
          // This prevents a race condition where the subscription fires before our write completes.
          const localColors = getFromLocalStorage<EmployeeColors>(LS_EMPLOYEE_COLORS_KEY, {})
          callback(localColors)
        }
      })
    } catch (error) {
      console.error('Error subscribing to employee colors:', error)
    }
  }
  
  setup()
  
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Get task order - Firestore SDK, fallback to localStorage
 */
export const getTaskOrder = async (): Promise<Record<WindowKey, string[]>> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, TASK_ORDER_COLLECTION, 'taskOrder')
    const docSnap = await getDoc(docRef)
    if (!docSnap.exists()) return {} as Record<WindowKey, string[]>
    const order = docSnap.data().order || {}
    saveToLocalStorage(LS_TASK_ORDER_KEY, order)
    return order
  } catch (error) {
    console.warn('Task order load failed, using localStorage:', error)
  }
  
  // Fallback to localStorage
  return getFromLocalStorage<Record<WindowKey, string[]>>(LS_TASK_ORDER_KEY, {} as Record<WindowKey, string[]>)
}

/**
 * Save task order - Firestore SDK, always saves to localStorage
 */
export const saveTaskOrder = async (order: Record<WindowKey, string[]>): Promise<void> => {
  // Always save to localStorage as backup
  saveToLocalStorage(LS_TASK_ORDER_KEY, order)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, TASK_ORDER_COLLECTION, 'taskOrder')
    await setDoc(docRef, { order }, { merge: true })
  } catch (error) {
    console.warn('Task order save failed:', error)
  }
}

/**
 * v3-only task order (same shape as `order`). Stored alongside `order` under config/taskOrder.
 */
export const getTaskOrderV3 = async (): Promise<Record<WindowKey, string[]>> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, TASK_ORDER_COLLECTION, 'taskOrder')
    const docSnap = await getDoc(docRef)
    if (!docSnap.exists()) return {} as Record<WindowKey, string[]>
    const orderV3 = (docSnap.data().orderV3 || {}) as Record<WindowKey, string[]>
    saveToLocalStorage(LS_TASK_ORDER_V3_KEY, orderV3)
    return orderV3
  } catch (error) {
    console.warn('Task order v3 load failed, using localStorage:', error)
  }
  return getFromLocalStorage<Record<WindowKey, string[]>>(LS_TASK_ORDER_V3_KEY, {} as Record<WindowKey, string[]>)
}

export const saveTaskOrderV3 = async (orderV3: Record<WindowKey, string[]>): Promise<void> => {
  saveToLocalStorage(LS_TASK_ORDER_V3_KEY, orderV3)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, TASK_ORDER_COLLECTION, 'taskOrder')
    await setDoc(docRef, { orderV3 }, { merge: true })
  } catch (error) {
    console.warn('Task order v3 save failed:', error)
  }
}

export const subscribeToTaskOrderV3 = (
  callback: (orderV3: Record<WindowKey, string[]>) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, TASK_ORDER_COLLECTION, 'taskOrder')
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const orderV3 = (snap.data().orderV3 || {}) as Record<WindowKey, string[]>
          saveToLocalStorage(LS_TASK_ORDER_V3_KEY, orderV3)
          callback(orderV3)
        } else {
          callback({} as Record<WindowKey, string[]>)
        }
      })
    } catch (error) {
      console.error('Error subscribing to task order v3:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ============ BREAK SELECTION (per-day editable plan) ============

export type BreakShiftType = 'lunch' | 'double'

export type BreakSlot = {
  employee: string
  shiftType: BreakShiftType
  start: string // HH:MM (24h)
  durationMin: 30 | 60
}

export type BreakSelection = {
  slots: BreakSlot[] // expected length: 2
  updatedAt: string // ISO timestamp
}

const breakSelectionLocalKey = (dateKey: string) => `${LS_BREAK_SELECTION_PREFIX}${dateKey}`

const getBreakSelectionFromLocalStorage = (dateKey: string): BreakSelection | null => {
  return getFromLocalStorage<BreakSelection | null>(breakSelectionLocalKey(dateKey), null)
}

const saveBreakSelectionToLocalStorage = (dateKey: string, value: BreakSelection | null): void => {
  saveToLocalStorage(breakSelectionLocalKey(dateKey), value)
}

/**
 * Subscribe to the break selection plan for a given day.
 * Always emits localStorage value immediately, then live Firestore updates when available.
 */
export const subscribeToBreakSelection = (
  dateKey: string,
  callback: (selection: BreakSelection | null) => void,
  onError?: (error: unknown) => void
): (() => void) => {
  // Always emit local first (offline-friendly)
  callback(getBreakSelectionFromLocalStorage(dateKey))

  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      // Store per-day plan under days/{dateKey}/meta/breakSelection
      const docRef = doc(db, 'days', dateKey, 'meta', 'breakSelection')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            saveBreakSelectionToLocalStorage(dateKey, null)
            callback(null)
            return
          }
          const raw = snap.data() as Record<string, unknown>
          const parsed: BreakSelection = {
            slots: (raw.slots as BreakSlot[]) || [],
            updatedAt: (raw.updatedAt as string) || '',
          }
          saveBreakSelectionToLocalStorage(dateKey, parsed)
          callback(parsed)
        },
        (err) => onError?.(err)
      )
    } catch (e) {
      console.error('Error subscribing to break selection:', e)
      onError?.(e)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Save the break selection plan for a given day.
 * Always writes to localStorage; attempts Firestore when available.
 */
export const saveBreakSelection = async (dateKey: string, selection: BreakSelection | null): Promise<void> => {
  // Always save to localStorage as backup
  saveBreakSelectionToLocalStorage(dateKey, selection)

  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'days', dateKey, 'meta', 'breakSelection')
    if (!selection) {
      // Clear by writing an empty document marker (avoid delete to keep permissions simple)
      await setDoc(docRef, { slots: [], updatedAt: new Date().toISOString() }, { merge: true })
      return
    }
    await setDoc(docRef, selection, { merge: true })
  } catch (error) {
    console.warn('Break selection save failed:', error)
  }
}

// ============ SOLO MODE (per-day day-shift override) ============

export type SoloMode = {
  active: boolean
  activatedAt: string // ISO timestamp
  /** Night-only solo (9/10 PM window); independent of day-shift solo. */
  nightActive?: boolean
  nightActivatedAt?: string
  activatedBy?: string
}

const soloModeLocalKey = (dateKey: string) => `${LS_SOLO_MODE_PREFIX}${dateKey}`

const getSoloModeFromLocalStorage = (dateKey: string): SoloMode | null => {
  return getFromLocalStorage<SoloMode | null>(soloModeLocalKey(dateKey), null)
}

const saveSoloModeToLocalStorage = (dateKey: string, value: SoloMode | null): void => {
  saveToLocalStorage(soloModeLocalKey(dateKey), value)
}

/**
 * Subscribe to solo mode for a given day.
 * Always emits localStorage value immediately, then live Firestore updates when available.
 */
export const subscribeToSoloMode = (
  dateKey: string,
  callback: (soloMode: SoloMode | null) => void,
  onError?: (error: unknown) => void
): (() => void) => {
  callback(getSoloModeFromLocalStorage(dateKey))

  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'days', dateKey, 'meta', 'soloMode')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            saveSoloModeToLocalStorage(dateKey, null)
            callback(null)
            return
          }
          const raw = snap.data() as Record<string, unknown>
          const parsed: SoloMode = {
            active: !!raw.active,
            activatedAt: String(raw.activatedAt || ''),
            nightActive: !!raw.nightActive,
            nightActivatedAt:
              typeof raw.nightActivatedAt === 'string' && raw.nightActivatedAt.trim()
                ? raw.nightActivatedAt.trim()
                : undefined,
            activatedBy:
              typeof raw.activatedBy === 'string' && raw.activatedBy.trim()
                ? raw.activatedBy.trim()
                : undefined,
          }
          saveSoloModeToLocalStorage(dateKey, parsed)
          callback(parsed)
        },
        (err) => onError?.(err)
      )
    } catch (e) {
      console.error('Error subscribing to solo mode:', e)
      onError?.(e)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Save solo mode for a given day.
 * Always writes to localStorage; attempts Firestore when available.
 */
export const saveSoloMode = async (dateKey: string, soloMode: SoloMode | null): Promise<void> => {
  saveSoloModeToLocalStorage(dateKey, soloMode)

  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'days', dateKey, 'meta', 'soloMode')
    if (!soloMode || (!soloMode.active && !soloMode.nightActive)) {
      await setDoc(
        docRef,
        {
          active: false,
          activatedAt: new Date().toISOString(),
          nightActive: false,
          nightActivatedAt: '',
          activatedBy: '',
        },
        { merge: true }
      )
      return
    }
    await setDoc(docRef, soloMode, { merge: true })
  } catch (error) {
    console.warn('Solo mode save failed:', error)
  }
}

/**
 * Subscribe to task order changes - SDK only
 */
export const subscribeToTaskOrder = (callback: (order: Record<WindowKey, string[]>) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false
  
  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return
    
    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, TASK_ORDER_COLLECTION, 'taskOrder')
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) callback((snap.data().order || {}) as Record<WindowKey, string[]>)
      })
    } catch (error) {
      console.error('Error subscribing to task order:', error)
    }
  }
  
  setup()
  
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ============ TASK STAGES (v3 stage grouping) ============

export type TaskStageMap = Record<string, Partial<Record<WindowKey, 1 | 2>>>

export const getTaskStages = async (): Promise<TaskStageMap> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'taskStages')
    const docSnap = await getDoc(docRef)
    if (!docSnap.exists()) return {}
    const stages = (docSnap.data().stages || {}) as TaskStageMap
    saveToLocalStorage(LS_TASK_STAGES_KEY, stages)
    return stages
  } catch (error) {
    console.warn('Task stages load failed, using localStorage:', error)
  }
  return getFromLocalStorage<TaskStageMap>(LS_TASK_STAGES_KEY, {})
}

export const saveTaskStages = async (stages: TaskStageMap): Promise<void> => {
  saveToLocalStorage(LS_TASK_STAGES_KEY, stages)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'taskStages')
    await setDoc(docRef, { stages })
  } catch (error) {
    console.warn('Task stages save failed:', error)
  }
}

export const subscribeToTaskStages = (callback: (stages: TaskStageMap) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'taskStages')
      unsubscribe = onSnapshot(docRef, (snap) => {
        const stages = snap.exists() ? ((snap.data().stages || {}) as TaskStageMap) : {}
        saveToLocalStorage(LS_TASK_STAGES_KEY, stages)
        callback(stages)
      })
    } catch (error) {
      console.error('Error subscribing to task stages:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ============ TASK CATALOG (admin-managed tasks) ============

export type TaskDef = {
  id: string
  name: string
  icon: string
  requirements: string[]
  windows: WindowKey[]
  requiresChecklist?: number
  weight?: number
  askNightShiftComplete?: boolean
  createdAtMs: number
  disabledAtMs?: number
  imagePath?: string
}

export type TaskCatalog = {
  tasks: TaskDef[]
}

export type TaskOverride = {
  // Requirements override (optional)
  requirements?: string[]
  updatedAtMs?: number
  updatedBy?: string

  // Image override (optional) - does not trigger "updated requirements" badge
  imagePath?: string

  // Name override (optional)
  name?: string
  nameUpdatedAtMs?: number
  nameUpdatedBy?: string

  // Windows override (optional) - which timeframes this task appears in.
  // Applied only to windows whose close time is >= windowsEffectiveAtMs.
  windows?: WindowKey[]
  windowsEffectiveAtMs?: number
  windowsUpdatedBy?: string

  // Weight override (optional) - task scoring weight.
  // Applied only to windows whose close time is >= weightEffectiveAtMs.
  weight?: number
  weightEffectiveAtMs?: number
  weightUpdatedBy?: string

  // Always-split override (optional) - when true, the task must be completed by two employees.
  // Solo mode (per-date) bypasses this so a single operator can still complete it.
  requiresSplit?: boolean
  requiresSplitUpdatedBy?: string
}

export type TaskOverrides = {
  overrides: Record<string, TaskOverride>
  /** When set, towels (11AM), towels-5pm, and towels-close use split UI (Dining/Bar + Bowl Station) for windows closing at or after this timestamp. */
  towelsSplitEffectiveAtMs?: number
  /** Admin opt-in: show the 🎲 next to the greeting only when `true` (missing/false = hidden). Shown on 5PM & 9PM only, not on 11 AM. */
  diceEnabled?: boolean
  /** When true with `diceEnabled`, 🎲 shows on beta Hosting only (not main). */
  diceBetaOnly?: boolean
}

// ============ DAILY TASKS (admin-managed) ============

export type DailyTaskFrequency =
  | { type: 'normal' }
  | { type: 'weekly'; quotaPerWeek: 1 | 2 | 3 }
  | { type: 'monthly' } // Rare task: appears once per calendar month

export type DailyTaskSection = {
  imagePath: string // Firebase Storage path, e.g. dailyTasks/{taskId}/materials.jpg
  description: string
}

export type DailyTaskDef = {
  id: string
  name: string
  frequency: DailyTaskFrequency
  materials: DailyTaskSection
  whatToDo: DailyTaskSection
  createdAtMs: number
  updatedAtMs: number
  disabledAtMs?: number
  /** When set, task stays in catalog/history but is excluded from auto-schedule and override pickers. */
  archivedAtMs?: number
}

export type DailyTaskCatalog = {
  tasks: DailyTaskDef[]
}

export type DailyTaskRun = {
  dateKey: string // YYYY-MM-DD
  taskId: string
  selectedAtMs: number
  selectedBy?: string
  revealedAtMs?: number
  revealedBy?: string
  completedAtMs?: number
  // Backward-compatible:
  // - Old runs store a single string `completedBy`
  // - New runs can store up to 2 people in `completedByList` (equal credit)
  completedBy?: string
  completedByList?: string[]
  override?: { taskId: string; atMs: number; by: string }
  /** Admin-only: label shown in Recent Runs / history; does not change catalog or `taskId`. */
  historyDisplayName?: string
  /**
   * When `taskId` is `__none__` (or for crediting work done on a mis-labeled day), counts this catalog
   * task id toward recency, monthly completion, and weekly completion-from-runs logic.
   */
  schedulingCreditTaskId?: string
}

export type DailyTaskDayApprovalStatus = 'pending' | 'approved' | 'denied'

export type DailyTaskWeekDayEntry = {
  taskId: string
  source: 'auto' | 'override'
  approvalStatus?: DailyTaskDayApprovalStatus
  approvalAtMs?: number
  approvalBy?: string
}

export type DailyTaskWeek = {
  weekStartDateKey: string // Sunday dateKey (YYYY-MM-DD)
  days: Record<string, DailyTaskWeekDayEntry>
  generatedAtMs: number
  generatorVersion: string
}

const dailyTaskWeekLocalKey = (weekStartDateKey: string) => `${LS_DAILY_TASK_WEEK_PREFIX}${weekStartDateKey}`

/**
 * Get Daily Task catalog - Firestore SDK, fallback to localStorage
 */
export const getDailyTaskCatalog = async (): Promise<DailyTaskCatalog> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'dailyTaskCatalog')
    const docSnap = await getDoc(docRef)
    lastDailyTaskCatalogSource = 'firestore-sdk'
    if (!docSnap.exists()) {
      const empty: DailyTaskCatalog = { tasks: [] }
      saveToLocalStorage(LS_DAILY_TASK_CATALOG_KEY, empty)
      return empty
    }
    const raw = docSnap.data() as { tasks?: DailyTaskDef[] }
    const catalog: DailyTaskCatalog = { tasks: (raw.tasks as DailyTaskDef[]) || [] }
    saveToLocalStorage(LS_DAILY_TASK_CATALOG_KEY, catalog)
    return catalog
  } catch (error) {
    console.warn('Daily task catalog load failed, using localStorage:', error)
  }

  lastDailyTaskCatalogSource = 'localStorage'
  return getFromLocalStorage<DailyTaskCatalog>(LS_DAILY_TASK_CATALOG_KEY, { tasks: [] })
}

/**
 * Save Daily Task catalog - Firestore SDK, always saves to localStorage
 */
export const saveDailyTaskCatalog = async (catalog: DailyTaskCatalog): Promise<void> => {
  saveToLocalStorage(LS_DAILY_TASK_CATALOG_KEY, catalog)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'dailyTaskCatalog')
    await setDoc(docRef, catalog, { merge: true })
  } catch (error) {
    console.warn('Daily task catalog save failed:', error)
  }
}

/**
 * Subscribe to Daily Task catalog changes - SDK only
 */
export const subscribeToDailyTaskCatalog = (callback: (catalog: DailyTaskCatalog) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'dailyTaskCatalog')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          const catalog: DailyTaskCatalog = snap.exists()
            ? { tasks: ((snap.data() as { tasks?: DailyTaskDef[] }).tasks as DailyTaskDef[]) || [] }
            : { tasks: [] }
          lastDailyTaskCatalogSource = 'firestore-sdk'
          saveToLocalStorage(LS_DAILY_TASK_CATALOG_KEY, catalog)
          callback(catalog)
        },
        (err) => {
          console.error('Daily task catalog subscription error:', err)
          callback(getFromLocalStorage<DailyTaskCatalog>(LS_DAILY_TASK_CATALOG_KEY, { tasks: [] }))
        }
      )
    } catch (error) {
      console.error('Error subscribing to daily task catalog:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Get a Daily Task run (per day) - Firestore SDK only (no localStorage fallback)
 */
export const getDailyTaskRun = async (dateKey: string): Promise<DailyTaskRun | null> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskRuns', dateKey)
  const snap = await getDoc(docRef)
  if (!snap.exists()) return null
  return snap.data() as DailyTaskRun
}

/**
 * Subscribe to a Daily Task run for a day.
 */
export const subscribeToDailyTaskRun = (
  dateKey: string,
  callback: (run: DailyTaskRun | null) => void,
  onError?: (error: unknown) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'dailyTaskRuns', dateKey)
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            callback(null)
            return
          }
          callback(snap.data() as DailyTaskRun)
        },
        (err) => onError?.(err)
      )
    } catch (e) {
      console.error('Error subscribing to daily task run:', e)
      onError?.(e)
    }
  }

  setup()
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Upsert a Daily Task run for a day.
 */
export const upsertDailyTaskRun = async (dateKey: string, data: Partial<DailyTaskRun>): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskRuns', dateKey)
  await setDoc(
    docRef,
    {
      ...data,
      dateKey,
    },
    { merge: true }
  )
}

/**
 * Admin: reset a day's Daily Task run back to "unrevealed" (and not completed).
 * This preserves the selected taskId and selectedAtMs.
 *
 * Important: we only update if the doc exists, to avoid creating an invalid run doc
 * without required fields like taskId.
 */
export const adminRecloseDailyTaskRun = async (dateKey: string): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskRuns', dateKey)
  const snap = await getDoc(docRef)
  if (!snap.exists()) return
  await setDoc(
    docRef,
    {
      revealedAtMs: deleteField(),
      revealedBy: deleteField(),
      completedAtMs: deleteField(),
      completedBy: deleteField(),
      completedByList: deleteField(),
      historyDisplayName: deleteField(),
    },
    { merge: true }
  )
}

export type AdminPatchDailyTaskRunHistoryInput = {
  /** Shown in Recent Runs only; empty string removes override (falls back to catalog name). */
  historyDisplayName: string
  /** One or two completer names (trimmed). */
  completedBy1: string
  completedBy2?: string
  /**
   * For no-task days: optional catalog task id to credit toward scheduling (recency / monthly / weekly-from-runs).
   * Empty string clears. Ignored when not a no-task run.
   */
  schedulingCreditTaskId?: string
}

/**
 * Admin: fix display-only history on a daily task run (`dailyTaskRuns/{dateKey}`).
 * Does not change `taskId` or the catalog. Allowed when the run is **completed** (`completedAtMs`)
 * or when it is a **no-task** day (`taskId === '__none__'`), including runs that were never completed.
 */
export const adminPatchDailyTaskRunHistory = async (
  dateKey: string,
  input: AdminPatchDailyTaskRunHistoryInput
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskRuns', dateKey)
  const snap = await getDoc(docRef)
  if (!snap.exists()) {
    throw new Error('daily-task-run-missing')
  }
  const existing = snap.data() as DailyTaskRun
  const isNoTask = existing.taskId === '__none__'
  const isCompleted = typeof existing.completedAtMs === 'number' && Number.isFinite(existing.completedAtMs)
  if (!isCompleted && !isNoTask) {
    throw new Error('daily-task-run-not-completed')
  }

  const rawNames = [input.completedBy1, input.completedBy2]
    .map((s) => (s || '').trim())
    .filter(Boolean)
  const unique: string[] = []
  for (const n of rawNames) {
    if (!unique.includes(n)) unique.push(n)
  }
  if (unique.length === 0 && !isNoTask) {
    throw new Error('daily-task-run-completers-required')
  }

  const titleTrim = (input.historyDisplayName || '').trim()
  const patch: Record<string, unknown> = {}
  if (unique.length === 0) {
    patch.completedByList = deleteField()
    patch.completedBy = deleteField()
  } else {
    patch.completedByList = unique
    patch.completedBy = unique.join(' + ')
  }
  patch.historyDisplayName = titleTrim.length === 0 ? deleteField() : titleTrim

  if (isNoTask && input.schedulingCreditTaskId !== undefined) {
    const credit = (input.schedulingCreditTaskId || '').trim()
    patch.schedulingCreditTaskId = credit.length === 0 ? deleteField() : credit
  }

  await setDoc(docRef, patch, { merge: true })
}

/**
 * Get a Daily Task week schedule - Firestore SDK, fallback to localStorage
 */
export const getDailyTaskWeek = async (weekStartDateKey: string): Promise<DailyTaskWeek | null> => {
  const localKey = dailyTaskWeekLocalKey(weekStartDateKey)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'dailyTaskWeeks', weekStartDateKey)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return getFromLocalStorage<DailyTaskWeek | null>(localKey, null)
    const week = snap.data() as DailyTaskWeek
    saveToLocalStorage(localKey, week)
    return week
  } catch (e) {
    console.warn('Daily task week load failed, using localStorage:', e)
  }
  return getFromLocalStorage<DailyTaskWeek | null>(localKey, null)
}

/**
 * Subscribe to a Daily Task week schedule - SDK only (saves to localStorage)
 */
export const subscribeToDailyTaskWeek = (
  weekStartDateKey: string,
  callback: (week: DailyTaskWeek | null) => void,
  onError?: (error: unknown) => void
): (() => void) => {
  const localKey = dailyTaskWeekLocalKey(weekStartDateKey)
  // emit local first
  callback(getFromLocalStorage<DailyTaskWeek | null>(localKey, null))

  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'dailyTaskWeeks', weekStartDateKey)
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            saveToLocalStorage(localKey, null)
            callback(null)
            return
          }
          const week = snap.data() as DailyTaskWeek
          saveToLocalStorage(localKey, week)
          callback(week)
        },
        (err) => onError?.(err)
      )
    } catch (e) {
      console.error('Error subscribing to daily task week:', e)
      onError?.(e)
    }
  }

  setup()
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Upsert a Daily Task week schedule.
 */
export const upsertDailyTaskWeek = async (weekStartDateKey: string, data: Partial<DailyTaskWeek>): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskWeeks', weekStartDateKey)
  await setDoc(
    docRef,
    {
      ...data,
      weekStartDateKey,
    },
    { merge: true }
  )
}

/**
 * Update approval status for one day in a week schedule.
 */
export const setDailyTaskDayApproval = async (
  weekStartDateKey: string,
  dateKey: string,
  status: DailyTaskDayApprovalStatus
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskWeeks', weekStartDateKey)
  const snap = await getDoc(docRef)
  const week = snap.exists() ? (snap.data() as DailyTaskWeek) : null
  const days = { ...(week?.days || {}) }
  const entry = parseWeekDayEntry(days[dateKey])
  if (!entry) return
  days[dateKey] = withApproval(entry, status)
  await setDoc(
    docRef,
    {
      weekStartDateKey,
      days,
      generatedAtMs: week?.generatedAtMs ?? Date.now(),
      generatorVersion: week?.generatorVersion ?? 'v1',
    },
    { merge: true }
  )
  const localKey = dailyTaskWeekLocalKey(weekStartDateKey)
  saveToLocalStorage(localKey, {
    weekStartDateKey,
    days,
    generatedAtMs: week?.generatedAtMs ?? Date.now(),
    generatorVersion: week?.generatorVersion ?? 'v1',
  })
}

export const approveDailyTaskDays = async (
  weekStartDateKey: string,
  dateKeys: string[]
): Promise<void> => {
  for (const dk of dateKeys) {
    await setDailyTaskDayApproval(weekStartDateKey, dk, 'approved')
  }
}

export const denyDailyTaskDays = async (
  weekStartDateKey: string,
  dateKeys: string[]
): Promise<void> => {
  for (const dk of dateKeys) {
    await setDailyTaskDayApproval(weekStartDateKey, dk, 'denied')
  }
}

/** Approve every pending day in a week document. */
export const approveAllPendingInWeek = async (weekStartDateKey: string): Promise<number> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'dailyTaskWeeks', weekStartDateKey)
  const snap = await getDoc(docRef)
  if (!snap.exists()) return 0
  const week = snap.data() as DailyTaskWeek
  const days = { ...(week.days || {}) }
  let count = 0
  Object.keys(days).forEach((dk) => {
    const entry = parseWeekDayEntry(days[dk])
    if (!entry || getDayApprovalStatus(entry) !== 'pending') return
    days[dk] = withApproval(entry, 'approved')
    count += 1
  })
  if (count === 0) return 0
  await setDoc(docRef, { days }, { merge: true })
  const localKey = dailyTaskWeekLocalKey(weekStartDateKey)
  saveToLocalStorage(localKey, { ...week, days })
  return count
}

/** Approve pending days for specific dateKeys (may span multiple week docs). */
export const approvePendingDailyTaskDays = async (dateKeys: string[]): Promise<number> => {
  let count = 0
  for (const dateKey of dateKeys) {
    const weekStart = getWeekStartDateKeySunday(dateKey)
    const week = await getDailyTaskWeek(weekStart)
    const entry = parseWeekDayEntry(week?.days?.[dateKey])
    if (!entry || getDayApprovalStatus(entry) !== 'pending') continue
    await setDailyTaskDayApproval(weekStart, dateKey, 'approved')
    count += 1
  }
  return count
}

/**
 * List Daily Task runs in an inclusive dateKey range (YYYY-MM-DD).
 * Note: we avoid ordering/index requirements; sorting is client-side.
 */
export const listDailyTaskRunsInRange = async (fromDateKey: string, toDateKey: string): Promise<DailyTaskRun[]> => {
  await assertFirestoreReady()
  const colRef = collection(db, 'dailyTaskRuns')
  const q = query(colRef, where('dateKey', '>=', fromDateKey), where('dateKey', '<=', toDateKey))
  const snap = await getDocs(q)
  const runs: DailyTaskRun[] = snap.docs
    .map((d) => d.data() as DailyTaskRun)
    .filter((r) => !!r && typeof r.dateKey === 'string' && r.dateKey)
  runs.sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || ''))
  return runs
}

/**
 * Get task catalog - Firestore SDK, fallback to localStorage
 */
export const getTaskCatalog = async (): Promise<TaskCatalog> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'taskCatalog')
    const docSnap = await getDoc(docRef)
    lastTaskCatalogSource = 'firestore-sdk'
    if (!docSnap.exists()) {
      const empty: TaskCatalog = { tasks: [] }
      saveToLocalStorage(LS_TASK_CATALOG_KEY, empty)
      return empty
    }
    const raw = docSnap.data() as { tasks?: TaskDef[] }
    const catalog: TaskCatalog = { tasks: (raw.tasks as TaskDef[]) || [] }
    saveToLocalStorage(LS_TASK_CATALOG_KEY, catalog)
    return catalog
  } catch (error) {
    console.warn('Task catalog load failed, using localStorage:', error)
  }

  lastTaskCatalogSource = 'localStorage'
  return getFromLocalStorage<TaskCatalog>(LS_TASK_CATALOG_KEY, { tasks: [] })
}

/**
 * Save task catalog - Firestore SDK, always saves to localStorage
 */
export const saveTaskCatalog = async (catalog: TaskCatalog): Promise<void> => {
  saveToLocalStorage(LS_TASK_CATALOG_KEY, catalog)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'taskCatalog')
    await setDoc(docRef, catalog, { merge: true })
  } catch (error) {
    console.warn('Task catalog save failed:', error)
  }
}

/**
 * Subscribe to task catalog changes - SDK only
 */
export const subscribeToTaskCatalog = (callback: (catalog: TaskCatalog) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'taskCatalog')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          const catalog: TaskCatalog = snap.exists()
            ? { tasks: ((snap.data() as { tasks?: TaskDef[] }).tasks as TaskDef[]) || [] }
            : { tasks: [] }
          lastTaskCatalogSource = 'firestore-sdk'
          saveToLocalStorage(LS_TASK_CATALOG_KEY, catalog)
          callback(catalog)
        },
        (err) => {
          console.error('Task catalog subscription error:', err)
          callback(getFromLocalStorage<TaskCatalog>(LS_TASK_CATALOG_KEY, { tasks: [] }))
        }
      )
    } catch (error) {
      console.error('Error subscribing to task catalog:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ============ TASK OVERRIDES (admin overrides for requirements) ============

/**
 * Get task overrides - Firestore SDK, fallback to localStorage
 */
export const getTaskOverrides = async (): Promise<TaskOverrides> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'taskOverrides')
    const docSnap = await getDoc(docRef)
    lastTaskOverridesSource = 'firestore-sdk'
    if (!docSnap.exists()) {
      const empty: TaskOverrides = { overrides: {} }
      saveToLocalStorage(LS_TASK_OVERRIDES_KEY, empty)
      return empty
    }
    const raw = docSnap.data() as {
      overrides?: Record<string, TaskOverride>
      towelsSplitEffectiveAtMs?: number
      diceEnabled?: boolean
      diceBetaOnly?: boolean
    }
    const parsed: TaskOverrides = {
      overrides: raw.overrides || {},
      towelsSplitEffectiveAtMs: typeof raw.towelsSplitEffectiveAtMs === 'number' ? raw.towelsSplitEffectiveAtMs : undefined,
      diceEnabled: typeof raw.diceEnabled === 'boolean' ? raw.diceEnabled : undefined,
      diceBetaOnly: typeof raw.diceBetaOnly === 'boolean' ? raw.diceBetaOnly : undefined,
    }
    saveToLocalStorage(LS_TASK_OVERRIDES_KEY, parsed)
    return parsed
  } catch (error) {
    console.warn('Task overrides load failed, using localStorage:', error)
  }

  lastTaskOverridesSource = 'localStorage'
  return getFromLocalStorage<TaskOverrides>(LS_TASK_OVERRIDES_KEY, { overrides: {} })
}

/**
 * Save task overrides - Firestore SDK, always saves to localStorage
 */
export const saveTaskOverrides = async (value: TaskOverrides): Promise<void> => {
  saveToLocalStorage(LS_TASK_OVERRIDES_KEY, value)
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'taskOverrides')
    // IMPORTANT: Do NOT merge here. We need deletions (e.g. reset to default) to actually remove keys.
    await setDoc(docRef, value)
  } catch (error) {
    console.warn('Task overrides save failed:', error)
  }
}

/**
 * Subscribe to task overrides changes - SDK only
 */
export const subscribeToTaskOverrides = (callback: (value: TaskOverrides) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'taskOverrides')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          const data = snap.exists()
            ? (snap.data() as {
                overrides?: Record<string, TaskOverride>
                towelsSplitEffectiveAtMs?: number
                diceEnabled?: boolean
                diceBetaOnly?: boolean
              })
            : null
          const next: TaskOverrides = data
            ? {
                overrides: data.overrides || {},
                towelsSplitEffectiveAtMs: typeof data.towelsSplitEffectiveAtMs === 'number' ? data.towelsSplitEffectiveAtMs : undefined,
                diceEnabled: typeof data.diceEnabled === 'boolean' ? data.diceEnabled : undefined,
                diceBetaOnly: typeof data.diceBetaOnly === 'boolean' ? data.diceBetaOnly : undefined,
              }
            : { overrides: {} }
          lastTaskOverridesSource = 'firestore-sdk'
          saveToLocalStorage(LS_TASK_OVERRIDES_KEY, next)
          callback(next)
        },
        (err) => {
          console.error('Task overrides subscription error:', err)
          callback(getFromLocalStorage<TaskOverrides>(LS_TASK_OVERRIDES_KEY, { overrides: {} }))
        }
      )
    } catch (error) {
      console.error('Error subscribing to task overrides:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ============ TASK STATE (COMPLETIONS) v2 ============

export type TaskCompletion = {
  status: 'done'
  assignees: string[]
  completedAt: string
  assignedByAdmin?: boolean
  completedLate?: boolean
  lateForgiven?: boolean
  completedEarly?: boolean
  autoAssigned?: boolean
  didNotNeedToComplete?: boolean
  deferredToClose?: string // '9' or '10' - indicates task was auto-completed due to both employees taking 1hr breaks
  // Order Report: number of orders taken by each employee (keyed by employee name)
  orderReportCounts?: Record<string, number>
  // Combined ice tasks: explicit Left/Right assignees (supports same employee for both sides)
  iceSides?: { left: string; right: string }
  // Split towels: Dining/Bar vs Bowl Station assignees
  towelSides?: { diningBar: string; bowlStation: string }
}

export type TaskState = Record<string, Record<WindowKey, Record<string, TaskCompletion>>>

/**
 * Subscribe to a single date+window task completion map.
 * Callback receives `{ [taskId]: completion }` for that window.
 */
export const subscribeToTaskCompletionsForWindow = (
  dateKey: string,
  windowKey: WindowKey,
  callback: (windowMap: Record<string, TaskCompletion>) => void
  ,onError?: (error: unknown) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      const colRef = collection(db, 'days', dateKey, 'windows', windowKey, 'tasks')
      unsubscribe = onSnapshot(colRef, (snap) => {
        const map: Record<string, TaskCompletion> = {}
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>
          // Only accept "done" docs; ignore any other experimental states.
          if (raw.status !== 'done') return
          const rawIceSides = raw.iceSides && typeof raw.iceSides === 'object' ? (raw.iceSides as Record<string, unknown>) : null
          const rawTowelSides = raw.towelSides && typeof raw.towelSides === 'object' ? (raw.towelSides as Record<string, unknown>) : null
          map[d.id] = {
            status: 'done',
            assignees: (raw.assignees as string[]) || [],
            completedAt: (raw.completedAt as string) || '',
            assignedByAdmin: raw.assignedByAdmin as boolean | undefined,
            completedLate: raw.completedLate as boolean | undefined,
            lateForgiven: raw.lateForgiven as boolean | undefined,
            completedEarly: raw.completedEarly as boolean | undefined,
            autoAssigned: raw.autoAssigned as boolean | undefined,
            didNotNeedToComplete: raw.didNotNeedToComplete as boolean | undefined,
            deferredToClose: raw.deferredToClose as string | undefined,
            orderReportCounts: raw.orderReportCounts as Record<string, number> | undefined,
            iceSides: rawIceSides
              ? {
                  left: String(rawIceSides.left || ''),
                  right: String(rawIceSides.right || ''),
                }
              : undefined,
            towelSides: rawTowelSides
              ? {
                  diningBar: String(rawTowelSides.diningBar || ''),
                  bowlStation: String(rawTowelSides.bowlStation || ''),
                }
              : undefined,
          }
        })
        callback(map)
      }, (err) => {
        onError?.(err)
      })
    } catch (e) {
      console.error('Error subscribing to window task completions:', e)
      onError?.(e)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Subscribe to recent completions via collectionGroup("tasks") so leaderboards can stay live.
 * Returns a TaskState map, typically for the last N days.
 */
export const subscribeToRecentTaskCompletions = (
  fromDateKey: string,
  toDateKey: string,
  callback: (state: TaskState) => void
  ,onError?: (error: unknown) => void
  ,options?: { saveToLocalStorage?: boolean; localStorageKey?: string }
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      const q = query(
        collectionGroup(db, 'tasks'),
        where('dateKey', '>=', fromDateKey),
        where('dateKey', '<=', toDateKey)
      )

      unsubscribe = onSnapshot(q, (snap) => {
        const next: TaskState = {}
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>
          if (raw.status !== 'done') return
          const dateKey = String(raw.dateKey || '')
          const windowKey = raw.windowKey as WindowKey
          if (!dateKey || (windowKey !== '11' && windowKey !== '17' && windowKey !== '21')) return
          const taskId = String(raw.taskId || d.id)
          const rawIceSides = raw.iceSides && typeof raw.iceSides === 'object' ? (raw.iceSides as Record<string, unknown>) : null
          const rawTowelSides = raw.towelSides && typeof raw.towelSides === 'object' ? (raw.towelSides as Record<string, unknown>) : null

          if (!next[dateKey]) next[dateKey] = { '11': {}, '17': {}, '21': {} }
          if (!next[dateKey][windowKey]) next[dateKey][windowKey] = {}
          next[dateKey][windowKey][taskId] = {
            status: 'done',
            assignees: (raw.assignees as string[]) || [],
            completedAt: (raw.completedAt as string) || '',
            assignedByAdmin: raw.assignedByAdmin as boolean | undefined,
            completedLate: raw.completedLate as boolean | undefined,
            lateForgiven: raw.lateForgiven as boolean | undefined,
            completedEarly: raw.completedEarly as boolean | undefined,
            autoAssigned: raw.autoAssigned as boolean | undefined,
            didNotNeedToComplete: raw.didNotNeedToComplete as boolean | undefined,
            deferredToClose: raw.deferredToClose as string | undefined,
            orderReportCounts: raw.orderReportCounts as Record<string, number> | undefined,
            iceSides: rawIceSides
              ? {
                  left: String(rawIceSides.left || ''),
                  right: String(rawIceSides.right || ''),
                }
              : undefined,
            towelSides: rawTowelSides
              ? {
                  diningBar: String(rawTowelSides.diningBar || ''),
                  bowlStation: String(rawTowelSides.bowlStation || ''),
                }
              : undefined,
          }
        })
        lastTaskStateSource = 'firestore-sdk'
        const shouldSave = options?.saveToLocalStorage !== false
        const lsKey = options?.localStorageKey || LS_TASK_STATE_KEY
        if (shouldSave) saveToLocalStorage(lsKey, next)
        callback(next)
      }, (err) => {
        onError?.(err)
      })
    } catch (e) {
      console.error('Error subscribing to recent task completions:', e)
      onError?.(e)
    }
  }

  setup()
  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

export type CompleteTaskArgs = {
  dateKey: string
  windowKey: WindowKey
  taskId: string
  completion: Omit<TaskCompletion, 'status'>
}

/**
 * Complete a task if (and only if) it's not already completed. Enforced via transaction.
 * This is the "block second claim" guarantee.
 */
export const completeTaskIfAvailable = async (args: CompleteTaskArgs): Promise<void> => {
  const { dateKey, windowKey, taskId, completion } = args
  await assertFirestoreReady()
  const docRef = doc(db, 'days', dateKey, 'windows', windowKey, 'tasks', taskId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(docRef)
    if (snap.exists()) {
      throw new Error('already-completed')
    }
    tx.set(docRef, {
      status: 'done',
      assignees: completion.assignees,
      completedAt: completion.completedAt,
      assignedByAdmin: completion.assignedByAdmin ?? false,
      completedLate: completion.completedLate ?? false,
      lateForgiven: completion.lateForgiven ?? false,
      completedEarly: completion.completedEarly ?? false,
      autoAssigned: completion.autoAssigned ?? false,
      didNotNeedToComplete: completion.didNotNeedToComplete ?? false,
      deferredToClose: completion.deferredToClose ?? null,
      orderReportCounts: completion.orderReportCounts ?? null,
      iceSides: completion.iceSides ?? null,
      towelSides: completion.towelSides ?? null,
      dateKey,
      windowKey,
      taskId,
      updatedAt: serverTimestamp(),
    })
  })
}

export const adminSetTaskCompletion = async (args: CompleteTaskArgs): Promise<void> => {
  const { dateKey, windowKey, taskId, completion } = args
  await assertFirestoreReady()
  const docRef = doc(db, 'days', dateKey, 'windows', windowKey, 'tasks', taskId)
  await setDoc(
    docRef,
    {
      status: 'done',
      assignees: completion.assignees,
      completedAt: completion.completedAt,
      // Do not implicitly mark completions as "admin-assigned" just because an admin updated the doc
      // (e.g. forgiving late). Callers must opt-in by explicitly passing assignedByAdmin: true.
      assignedByAdmin: completion.assignedByAdmin ?? false,
      completedLate: completion.completedLate ?? false,
      lateForgiven: completion.lateForgiven ?? false,
      completedEarly: completion.completedEarly ?? false,
      autoAssigned: completion.autoAssigned ?? false,
      didNotNeedToComplete: completion.didNotNeedToComplete ?? false,
      deferredToClose: completion.deferredToClose ?? null,
      orderReportCounts: completion.orderReportCounts ?? null,
      iceSides: completion.iceSides ?? null,
      towelSides: completion.towelSides ?? null,
      dateKey,
      windowKey,
      taskId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export const adminClearTaskCompletion = async (dateKey: string, windowKey: WindowKey, taskId: string): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'days', dateKey, 'windows', windowKey, 'tasks', taskId)
  await deleteDoc(docRef)
}

/**
 * Retroactively create TaskCompletion entries for daily tasks completed
 * between Jan 1-18, 2026. Returns count of entries created.
 */
export const retroactivelyFixDailyTaskCompletions = async (
  fromDateKey: string,
  toDateKey: string
): Promise<number> => {
  await assertFirestoreReady()
  
  // Get all daily task runs in the range
  const dailyTaskRuns = await listDailyTaskRunsInRange(fromDateKey, toDateKey)
  
  let created = 0
  
  // Helper to extract dateKey from timestamp
  const formatDateKey = (timestamp: number): string => {
    const d = new Date(timestamp)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  
  // Process each completed daily task
  for (const run of dailyTaskRuns) {
    // Skip if not completed or no assignees
    if (!run.completedAtMs) continue
    
    // Support both old format (completedBy) and new format (completedByList)
    const assignees = run.completedByList && run.completedByList.length > 0
      ? run.completedByList
      : run.completedBy
        ? [run.completedBy]
        : []
    
    if (assignees.length === 0) continue
    
    // Determine which shift it was completed in based on completion time
    const completedDate = new Date(run.completedAtMs)
    const hour = completedDate.getHours()
    const shift: 'day' | 'night' = hour >= 21 ? 'night' : 'day'
    const targetWindow: WindowKey = shift === 'day' ? '17' : '21'
    
    // Get dateKey from run (should always be present)
    const dateKey = run.dateKey || formatDateKey(run.completedAtMs)
    
    // Check if TaskCompletion already exists
    const taskCompletionRef = doc(db, 'days', dateKey, 'windows', targetWindow, 'tasks', 'daily-task')
    const existingSnap = await getDoc(taskCompletionRef)
    
    if (!existingSnap.exists()) {
      // Create TaskCompletion entry
      const completion: Omit<TaskCompletion, 'status'> = {
        assignees,
        completedAt: new Date(run.completedAtMs).toISOString(),
      }
      
      await adminSetTaskCompletion({
        dateKey,
        windowKey: targetWindow,
        taskId: 'daily-task',
        completion,
      })
      
      created++
    }
  }
  
  return created
}

/**
 * One-time migration: legacy `taskState/current.state` blob -> `days/{dateKey}/windows/{windowKey}/tasks/{taskId}` docs.
 * Idempotent-ish: we skip running if we detect any v2 docs already.
 */
export const migrateLegacyTaskStateV1ToV2 = async (): Promise<void> => {
  await assertFirestoreReady()

  // If any v2 docs exist, assume migration already ran (or a new system is already in use).
  try {
    const sampleQ = query(collectionGroup(db, 'tasks'), limit(1))
    const sample = await getDocs(sampleQ)
    if (!sample.empty) return
  } catch {
    // ignore and proceed; if collectionGroup isn't available for some reason we'll still attempt migration
  }

  const legacyRef = doc(db, 'taskState', 'current')
  const legacySnap = await getDoc(legacyRef)
  if (!legacySnap.exists()) return
  const legacy = legacySnap.data() as Record<string, unknown>
  const legacyState = legacy.state as TaskState | undefined
  if (!legacyState || typeof legacyState !== 'object') return

  const dateKeys = Object.keys(legacyState).sort()
  let written = 0

  // Batch writes (<= 450 per commit to stay comfortably under Firestore limits)
  const COMMIT_SIZE = 450
  let batch = writeBatch(db)
  let batchCount = 0

  const flush = async () => {
    if (batchCount === 0) return
    await batch.commit()
    batch = writeBatch(db)
    batchCount = 0
  }

  for (let di = 0; di < dateKeys.length; di++) {
    const dateKey = dateKeys[di]
    const day = legacyState[dateKey]
    if (!day) continue
    const windows = Object.keys(day) as WindowKey[]
    for (let wi = 0; wi < windows.length; wi++) {
      const windowKey = windows[wi]
      const windowMap = day[windowKey]
      if (!windowMap) continue
      const taskIds = Object.keys(windowMap)
      for (let ti = 0; ti < taskIds.length; ti++) {
        const taskId = taskIds[ti]
        const completion = windowMap[taskId]
        if (!completion) continue
        const docRef = doc(db, 'days', dateKey, 'windows', windowKey, 'tasks', taskId)
        batch.set(docRef, {
          ...completion,
          dateKey,
          windowKey,
          taskId,
          updatedAt: serverTimestamp(),
        })
        written++
        batchCount++
        if (batchCount >= COMMIT_SIZE) {
          await flush()
        }
      }
    }
  }

  await flush()
  if (import.meta.env.DEV) console.log('Migration complete. Written docs:', written)
}

// ─────────────────────────────────────────────────────────────────────────────
// Force Refresh: Admin can trigger all connected clients to reload
// ─────────────────────────────────────────────────────────────────────────────

const FORCE_REFRESH_DOC = 'forceRefresh'

/**
 * Admin triggers this to force all connected clients to refresh.
 * Writes the current timestamp to config/forceRefresh.
 */
export const triggerForceRefresh = async (): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'config', FORCE_REFRESH_DOC)
  await setDoc(docRef, {
    timestamp: Date.now(),
    triggeredAt: serverTimestamp(),
  })
}

/**
 * Subscribe to force refresh events.
 * Callback receives the timestamp when a refresh was triggered.
 * Returns an unsubscribe function.
 */
export const subscribeToForceRefresh = (
  onRefreshTriggered: (timestamp: number) => void
): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    return () => {}
  }
  const docRef = doc(db, 'config', FORCE_REFRESH_DOC)
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { timestamp?: number }
        if (typeof data.timestamp === 'number') {
          onRefreshTriggered(data.timestamp)
        }
      }
    },
    (err) => {
      console.error('Force refresh subscription error:', err)
    }
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Night Shift Reports - tracks when night shift didn't complete their tasks
// ────────────────────────────────────────────────────────────────────────────

export type NightShiftReport = {
  id: string
  dateKey: string
  taskId: string
  taskName: string
  reportedBy: string[]
  reportedAt: string
  dismissed?: boolean
  dismissedAt?: string
}

/**
 * Save a night shift incomplete report.
 */
export const saveNightShiftReport = async (
  dateKey: string,
  taskId: string,
  taskName: string,
  reportedBy: string[]
): Promise<void> => {
  await assertFirestoreReady()
  const reportId = `${dateKey}_${taskId}`
  const docRef = doc(db, 'nightShiftReports', reportId)
  await setDoc(docRef, {
    dateKey,
    taskId,
    taskName,
    reportedBy,
    reportedAt: new Date().toISOString(),
    dismissed: false,
  })
}

/**
 * Dismiss a night shift report (admin action).
 */
export const dismissNightShiftReport = async (reportId: string): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'nightShiftReports', reportId)
  await setDoc(docRef, {
    dismissed: true,
    dismissedAt: new Date().toISOString(),
  }, { merge: true })
}

/**
 * Subscribe to active (non-dismissed) night shift reports.
 */
export const subscribeToNightShiftReports = (
  callback: (reports: NightShiftReport[]) => void
): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    callback([])
    return () => {}
  }
  const colRef = collection(db, 'nightShiftReports')
  // Simple query without composite index - filter and sort client-side
  return onSnapshot(
    colRef,
    (snap) => {
      const reports: NightShiftReport[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NightShiftReport, 'id'>),
        }))
        .filter((r) => !r.dismissed)
        .sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''))
      callback(reports)
    },
    (err) => {
      console.error('Night shift reports subscription error:', err)
      callback([])
    }
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Stock Reports - OUT / LOW STOCK (staff reports inventory issues)
// ────────────────────────────────────────────────────────────────────────────

export type StockReportKind = 'low' | 'out'
export type StockReportStatus = 'pending' | 'finished'

export type StockReport = {
  id: string
  kind: StockReportKind
  item: string
  status: StockReportStatus
  createdAt: string // ISO
  createdAtMs: number
  createdBy?: string
  finishedAt?: string // ISO
  finishedAtMs?: number
  updatedAt?: string // ISO
  updatedAtMs?: number
}

/** Append-only audit trail for stock report lifecycle (admin history). */
export type StockReportLogAction = 'created' | 'status_changed' | 'deleted'

export type StockReportLogEntry = {
  id: string
  ts: string
  tsMs: number
  action: StockReportLogAction
  reportId: string
  kind: StockReportKind
  item: string
  statusBefore?: StockReportStatus
  statusAfter?: StockReportStatus
  /** Who performed this action (browser-provided identity, e.g. "A & B"). */
  actor?: string
  createdBy?: string
}

async function appendStockReportLog(
  entry: Omit<StockReportLogEntry, 'id' | 'ts' | 'tsMs'>
): Promise<void> {
  try {
    await assertFirestoreReady()
    if (!isFirestoreSDKAvailable()) return
    const now = new Date()
    const id = `srl-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
    const colRef = collection(db, 'stockReportLogs')
    await setDoc(doc(colRef, id), {
      ...entry,
      ts: now.toISOString(),
      tsMs: now.getTime(),
    })
  } catch (e) {
    console.warn('Stock report log write failed:', e)
  }
}

/**
 * Subscribe to stock report history (newest first).
 */
export const subscribeToStockReportLogs = (
  callback: (logs: StockReportLogEntry[]) => void,
  max: number = 300
): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    callback([])
    return () => {}
  }
  const colRef = collection(db, 'stockReportLogs')
  const q = query(colRef, orderBy('tsMs', 'desc'), limit(Math.max(1, max)))
  return onSnapshot(
    q,
    (snap) => {
      const logs: StockReportLogEntry[] = snap.docs.map((d) => {
        const data = d.data()
        const action = data.action as string
        return {
          id: d.id,
          ts: typeof data.ts === 'string' ? data.ts : '',
          tsMs: typeof data.tsMs === 'number' ? data.tsMs : 0,
          action:
            action === 'status_changed' || action === 'deleted' || action === 'created'
              ? action
              : 'created',
          reportId: typeof data.reportId === 'string' ? data.reportId : '',
          kind: data.kind === 'out' ? 'out' : 'low',
          item: typeof data.item === 'string' ? data.item : '',
          statusBefore: data.statusBefore === 'finished' || data.statusBefore === 'pending' ? data.statusBefore : undefined,
          statusAfter: data.statusAfter === 'finished' || data.statusAfter === 'pending' ? data.statusAfter : undefined,
          actor: typeof data.actor === 'string' ? data.actor : undefined,
          createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
        }
      })
      logs.sort((a, b) => b.tsMs - a.tsMs)
      callback(logs)
    },
    (err) => {
      console.error('Stock report logs subscription error:', err)
      callback([])
    }
  )
}

/**
 * Subscribe to stock reports (newest first).
 * Sorting is client-side to avoid composite index requirements.
 */
export const subscribeToStockReports = (
  callback: (reports: StockReport[]) => void
): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    callback([])
    return () => {}
  }
  const colRef = collection(db, 'stockReports')
  return onSnapshot(
    colRef,
    (snap) => {
      const reports: StockReport[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StockReport, 'id'>),
        }))
        .sort((a, b) => {
          const aMs = typeof a.createdAtMs === 'number' ? a.createdAtMs : 0
          const bMs = typeof b.createdAtMs === 'number' ? b.createdAtMs : 0
          if (bMs !== aMs) return bMs - aMs
          return (b.createdAt || '').localeCompare(a.createdAt || '')
        })
      callback(reports)
    },
    (err) => {
      console.error('Stock reports subscription error:', err)
      callback([])
    }
  )
}

export const createStockReport = async (args: {
  kind: StockReportKind
  item: string
  createdBy?: string
}): Promise<string> => {
  await assertFirestoreReady()
  const kind = args.kind
  const item = String(args.item || '').trim()
  if (kind !== 'low' && kind !== 'out') throw new Error('invalid-kind')
  if (!item) throw new Error('missing-item')

  const id =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto?.randomUUID?.() ||
    `stock-${Date.now()}-${Math.random().toString(16).slice(2)}`

  const now = new Date()
  const docRef = doc(db, 'stockReports', id)
  const payload: Omit<StockReport, 'id'> = {
    kind,
    item,
    status: 'pending',
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime(),
    ...(typeof args.createdBy === 'string' && args.createdBy.trim()
      ? { createdBy: args.createdBy.trim() }
      : {}),
  }
  await setDoc(docRef, payload)
  void appendStockReportLog({
    action: 'created',
    reportId: id,
    kind,
    item,
    statusAfter: 'pending',
    ...(payload.createdBy ? { actor: payload.createdBy } : {}),
    ...(payload.createdBy ? { createdBy: payload.createdBy } : {}),
  })
  return id
}

export const setStockReportStatus = async (
  id: string,
  status: StockReportStatus
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'stockReports', id)
  const snap = await getDoc(docRef)
  const prev = snap.exists() ? (snap.data() as Omit<StockReport, 'id'>) : null
  const now = new Date()
  const updates: Partial<Omit<StockReport, 'id'>> = {
    status,
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime(),
  }
  if (status === 'finished') {
    updates.finishedAt = now.toISOString()
    updates.finishedAtMs = now.getTime()
  }
  await setDoc(docRef, updates, { merge: true })
  if (prev && prev.status !== status) {
    void appendStockReportLog({
      action: 'status_changed',
      reportId: id,
      kind: prev.kind,
      item: prev.item,
      statusBefore: prev.status,
      statusAfter: status,
      ...(prev.createdBy ? { createdBy: prev.createdBy } : {}),
    })
  }
}

export const deleteStockReport = async (id: string, options?: { actor?: string }): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'stockReports', id)
  const snap = await getDoc(docRef)
  const prev = snap.exists() ? (snap.data() as Omit<StockReport, 'id'>) : null
  await deleteDoc(docRef)
  if (prev) {
    const actor = typeof options?.actor === 'string' && options.actor.trim() ? options.actor.trim() : prev.createdBy
    void appendStockReportLog({
      action: 'deleted',
      reportId: id,
      kind: prev.kind,
      item: prev.item,
      statusBefore: prev.status,
      ...(actor ? { actor } : {}),
      ...(prev.createdBy ? { createdBy: prev.createdBy } : {}),
    })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Management Reports - Notify Management (staff reports issues to managers)
// ────────────────────────────────────────────────────────────────────────────

export type ManagementReportKind = 'leak' | 'broken' | 'insect' | 'custom'
export type ManagementReportStatus = 'new' | 'resolved'

export type ManagementReport = {
  id: string
  kind: ManagementReportKind
  customTitle?: string
  details: string
  status: ManagementReportStatus
  createdAt: string // ISO
  createdAtMs: number
  createdBy: string
  resolvedAt?: string // ISO
  resolvedAtMs?: number
}

/**
 * Subscribe to management reports (newest first).
 * Sorting is client-side to avoid composite index requirements.
 */
export const subscribeToManagementReports = (callback: (reports: ManagementReport[]) => void): (() => void) => {
  if (!isFirestoreSDKAvailable()) {
    callback([])
    return () => {}
  }
  const colRef = collection(db, 'managementReports')
  return onSnapshot(
    colRef,
    (snap) => {
      const reports: ManagementReport[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ManagementReport, 'id'>),
        }))
        .sort((a, b) => {
          const aMs = typeof a.createdAtMs === 'number' ? a.createdAtMs : 0
          const bMs = typeof b.createdAtMs === 'number' ? b.createdAtMs : 0
          if (bMs !== aMs) return bMs - aMs
          return (b.createdAt || '').localeCompare(a.createdAt || '')
        })
      callback(reports)
    },
    (err) => {
      console.error('Management reports subscription error:', err)
      callback([])
    }
  )
}

export const createManagementReport = async (args: {
  kind: ManagementReportKind
  details: string
  customTitle?: string
  createdBy: string
}): Promise<string> => {
  await assertFirestoreReady()
  const kind = args.kind
  const createdBy = String(args.createdBy || '').trim()
  const details = String(args.details || '').trim()
  const customTitle = typeof args.customTitle === 'string' ? args.customTitle.trim() : ''

  if (kind !== 'leak' && kind !== 'broken' && kind !== 'insect' && kind !== 'custom') throw new Error('invalid-kind')
  if (!createdBy) throw new Error('missing-createdBy')
  if (kind === 'custom' && !customTitle) throw new Error('missing-customTitle')

  const id =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto?.randomUUID?.() ||
    `mgmt-${Date.now()}-${Math.random().toString(16).slice(2)}`

  const now = new Date()
  const docRef = doc(db, 'managementReports', id)
  const payload: Omit<ManagementReport, 'id'> = {
    kind,
    details,
    status: 'new',
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    createdBy,
    ...(kind === 'custom' ? { customTitle } : {}),
  }
  await setDoc(docRef, payload)
  return id
}

export const setManagementReportStatus = async (id: string, status: ManagementReportStatus): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'managementReports', id)
  const now = new Date()
  const updates: Partial<Omit<ManagementReport, 'id'>> = {
    status,
    ...(status === 'resolved'
      ? { resolvedAt: now.toISOString(), resolvedAtMs: now.getTime() }
      : { resolvedAt: '', resolvedAtMs: 0 }),
  }
  await setDoc(docRef, updates, { merge: true })
}

export const deleteManagementReport = async (id: string): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'managementReports', id)
  await deleteDoc(docRef)
}

// ────────────────────────────────────────────────────────────────────────────
// Weekly Availability - admin sets each employee's usual Lunch/Dinner schedule
// ────────────────────────────────────────────────────────────────────────────

export type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export type DayAvailability = {
  lunch: boolean
  dinner: boolean
}

export type WeeklyAvailability = Record<DayOfWeek, DayAvailability>

export type AvailabilityMap = Record<string, WeeklyAvailability> // employeeName -> availability

export type { AvailabilityMeta, AvailabilityState } from '../utils/availabilityEffective'
import {
  EMPTY_AVAILABILITY_STATE,
  parseAvailabilityDoc,
  type AvailabilityState,
} from '../utils/availabilityEffective'

const LS_AVAILABILITY_KEY = 'traq-availability-v1'
const LS_AVAILABILITY_STATE_KEY = 'traq-availability-v2'

const defaultDayAvailability: DayAvailability = { lunch: false, dinner: false }

export const createDefaultWeeklyAvailability = (): WeeklyAvailability => ({
  sun: { ...defaultDayAvailability },
  mon: { ...defaultDayAvailability },
  tue: { ...defaultDayAvailability },
  wed: { ...defaultDayAvailability },
  thu: { ...defaultDayAvailability },
  fri: { ...defaultDayAvailability },
  sat: { ...defaultDayAvailability },
})

/**
 * Get availability map for all employees - Firestore SDK, fallback to localStorage
 */
export const getAvailabilityState = async (): Promise<AvailabilityState> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'availability')
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) return { ...EMPTY_AVAILABILITY_STATE }
    const state = parseAvailabilityDoc(docSnap.data() as Parameters<typeof parseAvailabilityDoc>[0])
    saveToLocalStorage(LS_AVAILABILITY_STATE_KEY, state)
    return state
  } catch (error) {
    console.warn('Availability load failed, using localStorage:', error)
  }

  const cached = getFromLocalStorage<AvailabilityState>(LS_AVAILABILITY_STATE_KEY, EMPTY_AVAILABILITY_STATE)
  if (cached.patterns && Object.keys(cached.patterns).length > 0) {
    return cached
  }
  const legacy = getFromLocalStorage<AvailabilityMap>(LS_AVAILABILITY_KEY, {})
  return { patterns: legacy, metaByEmployee: {} }
}

/** @deprecated Prefer getAvailabilityState */
export const getAvailability = async (): Promise<AvailabilityMap> => {
  const state = await getAvailabilityState()
  return state.patterns
}

export const saveAvailabilityState = async (state: AvailabilityState): Promise<void> => {
  saveToLocalStorage(LS_AVAILABILITY_STATE_KEY, state)
  saveToLocalStorage(LS_AVAILABILITY_KEY, state.patterns)

  try {
    await assertFirestoreReady()
    const docRef = doc(db, 'config', 'availability')
    await setDoc(docRef, {
      byEmployee: state.patterns,
      metaByEmployee: state.metaByEmployee,
    })
  } catch (error) {
    console.warn('Availability save failed:', error)
  }
}

/** @deprecated Prefer saveAvailabilityState after applyEmployeeAvailabilityUpdate */
export const saveAvailability = async (map: AvailabilityMap): Promise<void> => {
  await saveAvailabilityState({ patterns: map, metaByEmployee: {} })
}

/**
 * Subscribe to availability changes - SDK only
 */
export const subscribeToAvailability = (
  callback: (state: AvailabilityState) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'availability')
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const state = parseAvailabilityDoc(snap.data() as Parameters<typeof parseAvailabilityDoc>[0])
          saveToLocalStorage(LS_AVAILABILITY_STATE_KEY, state)
          saveToLocalStorage(LS_AVAILABILITY_KEY, state.patterns)
          callback(state)
        } else {
          callback({ ...EMPTY_AVAILABILITY_STATE })
        }
      })
    } catch (error) {
      console.error('Error subscribing to availability:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Time Off Requests - employees can request time off, admin approves/denies
// ────────────────────────────────────────────────────────────────────────────

export type ShiftType = 'lunch' | 'dinner'

export type RequestedShift = {
  dateKey: string // YYYY-MM-DD
  shift: ShiftType
}

export type TimeOffRequestStatus = 'pending' | 'approved' | 'denied'

export type TimeOffRequestKind = 'shift_blocks' | 'date_range'

export type TimeOffRequest = {
  id: string
  employee: string
  status: TimeOffRequestStatus
  reason: string
  createdAt: string // ISO
  updatedAt: string // ISO
  requestedShifts: RequestedShift[]
  requestKind: TimeOffRequestKind
  dateRange?: { startDateKey: string; endDateKey: string }
  decision?: { by: 'admin'; at: string; note?: string }
}

function isFirestoreTimestampLike(v: unknown): v is { toDate: () => Date } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'toDate' in v &&
    typeof (v as { toDate?: unknown }).toDate === 'function'
  )
}

/** Plain object from JSON/localStorage cache of Firestore Timestamp. */
function dateFromSecondsObject(value: unknown): Date | null {
  if (typeof value !== 'object' || value === null) return null
  const s = (value as { seconds?: unknown }).seconds
  if (typeof s === 'number' && Number.isFinite(s)) return new Date(s * 1000)
  return null
}

function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Read YYYY-MM-DD from Firestore strings, Timestamps, or odd legacy values. */
export function coerceDateKeyFromFirestore(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) {
      return formatLocalDateKey(d)
    }
    return null
  }
  const fromSec = dateFromSecondsObject(value)
  if (fromSec) return formatLocalDateKey(fromSec)
  if (value instanceof Timestamp || isFirestoreTimestampLike(value)) {
    const d = value instanceof Timestamp ? value.toDate() : value.toDate()
    return formatLocalDateKey(d)
  }
  return null
}

function coerceIsoFromFirestore(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value
  const fromSec = dateFromSecondsObject(value)
  if (fromSec) return fromSec.toISOString()
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (isFirestoreTimestampLike(value)) return value.toDate().toISOString()
  return ''
}

/**
 * Normalize raw Firestore time off docs so date fields are always strings (fixes Timestamps
 * and snake_case keys that otherwise break visibility and sorting).
 */
export function normalizeTimeOffRequestFromFirestore(
  id: string,
  data: Record<string, unknown>
): TimeOffRequest {
  const drRaw = data.dateRange as Record<string, unknown> | undefined
  let dateRange: TimeOffRequest['dateRange'] = undefined
  if (drRaw && typeof drRaw === 'object') {
    const start = coerceDateKeyFromFirestore(drRaw.startDateKey ?? drRaw.start_date_key)
    const end = coerceDateKeyFromFirestore(drRaw.endDateKey ?? drRaw.end_date_key)
    if (start || end) {
      dateRange = {
        startDateKey: start ?? end ?? '',
        endDateKey: end ?? start ?? '',
      }
    }
  }
  // Root-level range fields (legacy / imports)
  if (!dateRange) {
    const rs = coerceDateKeyFromFirestore(data.startDateKey ?? data.start_date_key)
    const re = coerceDateKeyFromFirestore(data.endDateKey ?? data.end_date_key)
    if (rs || re) {
      dateRange = {
        startDateKey: rs ?? re ?? '',
        endDateKey: re ?? rs ?? '',
      }
    }
  }

  const shiftsRaw = Array.isArray(data.requestedShifts)
    ? data.requestedShifts
    : Array.isArray(data.requested_shifts)
      ? data.requested_shifts
      : []
  const requestedShifts: RequestedShift[] = shiftsRaw.map((s) => {
    const sh = s as Record<string, unknown>
    const dk = coerceDateKeyFromFirestore(sh.dateKey ?? sh.date_key)
    return {
      dateKey: dk ?? '',
      shift: (sh.shift as RequestedShift['shift']) || 'lunch',
    }
  })

  const createdAt = coerceIsoFromFirestore(data.createdAt) || new Date(0).toISOString()
  const updatedAt = coerceIsoFromFirestore(data.updatedAt) || createdAt

  return {
    id,
    employee: typeof data.employee === 'string' ? data.employee : '',
    status: (data.status as TimeOffRequest['status']) || 'pending',
    reason: typeof data.reason === 'string' ? data.reason : '',
    createdAt,
    updatedAt,
    requestedShifts,
    requestKind: (data.requestKind as TimeOffRequest['requestKind']) || 'shift_blocks',
    dateRange,
    decision: data.decision as TimeOffRequest['decision'],
  }
}

function utcMsFromDateKey(key: string): number {
  const [y, m, d] = key.split('-').map((x) => parseInt(x, 10))
  if (!y || !m || !d) return NaN
  return Date.UTC(y, m - 1, d)
}

function maxDateKeyOf(candidates: string[]): string | null {
  const valid = candidates.filter((k) => Number.isFinite(utcMsFromDateKey(k)))
  if (valid.length === 0) return null
  return valid.reduce((a, b) => (utcMsFromDateKey(a) >= utcMsFromDateKey(b) ? a : b))
}

/** Chronologically earlier calendar day (YYYY-MM-DD). Invalid keys fall back to the other. */
function earlierDateKey(a: string, b: string): string {
  const ma = utcMsFromDateKey(a)
  const mb = utcMsFromDateKey(b)
  if (!Number.isFinite(ma)) return b
  if (!Number.isFinite(mb)) return a
  return ma <= mb ? a : b
}

/**
 * Last calendar day covered by the request (YYYY-MM-DD), or null if unknown.
 *
 * - **shift_blocks** (includes docs with missing `requestKind`, normalized to shift_blocks): if there are
 *   any `requestedShifts`, use **only** the latest shift date. The card summary is shift-based; ignoring
 *   a stale or far-future `dateRange` fixes rows that looked “a month ago” but stayed visible.
 * - **date_range**: use the earlier of range end and latest shift (expanded range should match end).
 * - If there are no shifts, fall back to `dateRange` end/start.
 */
export function getTimeOffLastDayDateKey(req: TimeOffRequest): string | null {
  const shiftKeys = (req.requestedShifts ?? []).map((s) => s.dateKey).filter(Boolean)
  const maxShift = maxDateKeyOf(shiftKeys)

  const fromRange = (): string | null => {
    if (!req.dateRange) return null
    const { endDateKey, startDateKey } = req.dateRange
    if (endDateKey) return endDateKey
    if (startDateKey) return startDateKey
    return null
  }

  if (req.requestKind === 'shift_blocks') {
    if (maxShift) return maxShift
    return fromRange()
  }

  const fr = fromRange()
  if (fr && maxShift) return earlierDateKey(fr, maxShift)
  if (fr) return fr
  return maxShift
}

/** Local calendar YYYY-MM-DD from an ISO timestamp (for visibility when no PTO dates exist). */
function dateKeyFromIsoLocal(iso: string): string | null {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return null
  }
}

const addCalendarDaysToDateKey = (dateKey: string, delta: number): string => {
  const [y, m, d] = dateKey.split('-').map((x) => parseInt(x, 10))
  if (!y || !m || !d) return dateKey
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Employee-facing Time Off list:
 * - Show **all upcoming** requests (today is on or before the last scheduled day off).
 * - After the last PTO day, keep showing for **two more calendar days**, then hide.
 * If no PTO dates exist on the doc, falls back to `createdAt` so undated rows still roll off.
 */
export function isTimeOffVisibleOnPublicList(req: TimeOffRequest, todayDateKey: string): boolean {
  let last = getTimeOffLastDayDateKey(req)
  if (!last && req.createdAt) {
    last = dateKeyFromIsoLocal(req.createdAt)
  }
  if (!last) return false

  const t = utcMsFromDateKey(todayDateKey)
  const lastMs = utcMsFromDateKey(last)
  if (!Number.isFinite(t) || !Number.isFinite(lastMs)) return false

  // Upcoming or still on the last day of the absence
  if (t <= lastMs) return true

  // PTO ended: grace window = last day + 2 calendar days (inclusive), then off the list
  const visibleThrough = addCalendarDaysToDateKey(last, 2)
  const v = utcMsFromDateKey(visibleThrough)
  return Number.isFinite(v) && t <= v
}

/** For support / debugging: why a request is on or off the public list. */
export function getTimeOffPublicListVisibilityDebug(
  req: TimeOffRequest,
  todayDateKey: string
): {
  ptoLastDay: string | null
  effectiveLastDay: string | null
  visibleThrough: string | null
  visible: boolean
  usedCreatedAtFallback: boolean
} {
  const ptoLastDay = getTimeOffLastDayDateKey(req)
  let effectiveLastDay = ptoLastDay
  let usedCreatedAtFallback = false
  if (!effectiveLastDay && req.createdAt) {
    effectiveLastDay = dateKeyFromIsoLocal(req.createdAt)
    usedCreatedAtFallback = !!effectiveLastDay
  }
  if (!effectiveLastDay) {
    return {
      ptoLastDay,
      effectiveLastDay: null,
      visibleThrough: null,
      visible: false,
      usedCreatedAtFallback,
    }
  }
  const t = utcMsFromDateKey(todayDateKey)
  const lastMs = utcMsFromDateKey(effectiveLastDay)
  const visibleThrough = addCalendarDaysToDateKey(effectiveLastDay, 2)
  const v = utcMsFromDateKey(visibleThrough)
  let visible = false
  if (Number.isFinite(t) && Number.isFinite(lastMs)) {
    if (t <= lastMs) visible = true
    else if (Number.isFinite(v)) visible = t <= v
  }
  return {
    ptoLastDay,
    effectiveLastDay,
    visibleThrough,
    visible,
    usedCreatedAtFallback,
  }
}

const LS_TIME_OFF_KEY = 'traq-timeoff-v2'

/**
 * List recent time off requests (all employees), sorted by createdAt desc
 */
export const listTimeOffRequests = async (limitN: number = 50): Promise<TimeOffRequest[]> => {
  try {
    await assertFirestoreReady()
    const colRef = collection(db, 'timeOffRequests')
    // Simple fetch all and sort client-side to avoid index requirements
    const snap = await getDocs(colRef)
    const requests: TimeOffRequest[] = snap.docs.map((d) =>
      normalizeTimeOffRequestFromFirestore(d.id, d.data() as Record<string, unknown>)
    )
    // Sort by createdAt desc, then limit
    requests.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const limited = requests.slice(0, limitN)
    saveToLocalStorage(LS_TIME_OFF_KEY, limited)
    return limited
  } catch (error) {
    console.warn('Time off requests load failed, using localStorage:', error)
  }

  // Fallback to localStorage
  return getFromLocalStorage<TimeOffRequest[]>(LS_TIME_OFF_KEY, [])
}

/**
 * Subscribe to time off requests (all employees)
 */
export const subscribeToTimeOffRequests = (
  callback: (requests: TimeOffRequest[]) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'timeOffRequests')
      unsubscribe = onSnapshot(
        colRef,
        (snap) => {
          const requests: TimeOffRequest[] = snap.docs.map((d) =>
            normalizeTimeOffRequestFromFirestore(d.id, d.data() as Record<string, unknown>)
          )
          // Sort by createdAt desc
          requests.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
          saveToLocalStorage(LS_TIME_OFF_KEY, requests)
          callback(requests)
        },
        (err) => {
          console.error('Time off requests subscription error:', err)
          callback([])
        }
      )
    } catch (error) {
      console.error('Error subscribing to time off requests:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Create a new time off request
 */
export const createTimeOffRequest = async (
  request: Omit<TimeOffRequest, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'decision'>
): Promise<string> => {
  await assertFirestoreReady()
  const colRef = collection(db, 'timeOffRequests')
  const id =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const now = new Date().toISOString()
  const docRef = doc(colRef, id)
  // Filter out undefined values - Firestore doesn't accept them
  const cleanedRequest = Object.fromEntries(
    Object.entries(request).filter(([, v]) => v !== undefined)
  )
  await setDoc(docRef, {
    ...cleanedRequest,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/**
 * Update an existing time off request (only allowed while pending)
 */
export const updateTimeOffRequest = async (
  id: string,
  updates: Partial<Pick<TimeOffRequest, 'reason' | 'requestedShifts' | 'requestKind' | 'dateRange'>>
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'timeOffRequests', id)
  // Filter out undefined values - Firestore doesn't accept them
  const cleanedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  )
  await setDoc(
    docRef,
    {
      ...cleanedUpdates,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

/**
 * Set the status of a time off request (admin action)
 */
export const setTimeOffRequestStatus = async (
  id: string,
  status: TimeOffRequestStatus,
  note?: string
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'timeOffRequests', id)
  // Firestore does not allow `undefined` field values.
  const decision: TimeOffRequest['decision'] = {
    by: 'admin',
    at: new Date().toISOString(),
    ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}),
  }
  await setDoc(
    docRef,
    {
      status,
      decision,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

/**
 * Delete a time off request
 */
export const deleteTimeOffRequest = async (id: string): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'timeOffRequests', id)
  await deleteDoc(docRef)
}

// ────────────────────────────────────────────────────────────────────────────
// Notifications - admin can send notifications to employees
// ────────────────────────────────────────────────────────────────────────────

export type NotificationDoc = {
  id: string
  to: 'all' | string // 'all' for everyone, or specific employee name
  message: string
  createdAt: string // ISO
  createdAtMs: number
  active: boolean
  dismissedBy: Record<string, string> // employeeName -> ISO timestamp (for 'all' notifications)
  dismissedAt?: string // ISO timestamp (for single-employee notifications when dismissed)
}

const LS_NOTIFICATIONS_KEY = 'traq-notifications-v1'

/**
 * Check if a notification is pending for a specific employee
 */
export const isNotificationPendingForEmployee = (
  notif: NotificationDoc,
  employeeName: string
): boolean => {
  if (!notif.active) return false
  if (notif.to === 'all') {
    return !notif.dismissedBy?.[employeeName]
  }
  return notif.to === employeeName && !notif.dismissedAt
}

/**
 * Get pending notifications for a specific employee
 */
export const getPendingNotificationsForEmployee = (
  notifications: NotificationDoc[],
  employeeName: string
): NotificationDoc[] => {
  return notifications
    .filter((n) => isNotificationPendingForEmployee(n, employeeName))
    .sort((a, b) => a.createdAtMs - b.createdAtMs) // oldest first
}

/**
 * Subscribe to all notifications
 */
export const subscribeToNotifications = (
  callback: (notifications: NotificationDoc[]) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'notifications')
      unsubscribe = onSnapshot(
        colRef,
        (snap) => {
          const notifications: NotificationDoc[] = snap.docs.map((d) => ({
            id: d.id,
            to: (d.data().to as string) || 'all',
            message: (d.data().message as string) || '',
            createdAt: (d.data().createdAt as string) || '',
            createdAtMs: (d.data().createdAtMs as number) || 0,
            active: d.data().active !== false,
            dismissedBy: (d.data().dismissedBy as Record<string, string>) || {},
            dismissedAt: d.data().dismissedAt as string | undefined,
          }))
          // Sort by createdAtMs descending (newest first for admin view)
          notifications.sort((a, b) => b.createdAtMs - a.createdAtMs)
          saveToLocalStorage(LS_NOTIFICATIONS_KEY, notifications)
          callback(notifications)
        },
        (err) => {
          console.error('Notifications subscription error:', err)
          callback([])
        }
      )
    } catch (error) {
      console.error('Error subscribing to notifications:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Create a new notification
 */
export const createNotification = async (
  to: 'all' | string,
  message: string
): Promise<string> => {
  await assertFirestoreReady()
  const colRef = collection(db, 'notifications')
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = new Date()
  const docRef = doc(colRef, id)
  await setDoc(docRef, {
    to,
    message,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    active: true,
    dismissedBy: {},
  })
  return id
}

/**
 * Dismiss a notification for a specific employee
 */
export const dismissNotificationForEmployee = async (
  notificationId: string,
  employeeName: string
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'notifications', notificationId)
  const docSnap = await getDoc(docRef)
  if (!docSnap.exists()) return

  const data = docSnap.data()
  const to = data.to as string

  if (to === 'all') {
    // For 'all' notifications, add to dismissedBy map
    const dismissedBy = (data.dismissedBy as Record<string, string>) || {}
    dismissedBy[employeeName] = new Date().toISOString()
    await setDoc(docRef, { dismissedBy }, { merge: true })
  } else if (to === employeeName) {
    // For single-employee notifications, set dismissedAt
    await setDoc(docRef, { dismissedAt: new Date().toISOString() }, { merge: true })
  }
}

/**
 * Set notification active status (admin action)
 */
export const setNotificationActive = async (
  notificationId: string,
  active: boolean
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'notifications', notificationId)
  await setDoc(docRef, { active }, { merge: true })
}

/**
 * Delete a notification (admin action)
 */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'notifications', notificationId)
  await deleteDoc(docRef)
}

// ────────────────────────────────────────────────────────────────────────────
// Print Request - admin sends document to iPad for printing
// ────────────────────────────────────────────────────────────────────────────

export type PrintRequestDoc = {
  fileUrl: string
  message: string
  createdAt: string
  status: 'pending' | 'dismissed'
  fileType: 'pdf' | 'docx' | 'doc'
}

/**
 * Subscribe to the active print request
 */
export const subscribeToPrintRequest = (
  callback: (request: PrintRequestDoc | null) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'printRequest')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists() || cancelled) {
            callback(null)
            return
          }
          const d = snap.data()
          const status = (d.status as string) || 'pending'
          if (status !== 'pending') {
            callback(null)
            return
          }
          callback({
            fileUrl: (d.fileUrl as string) || '',
            message: (d.message as string) || '',
            createdAt: (d.createdAt as string) || '',
            status: status as 'pending' | 'dismissed',
            fileType: ((d.fileType as string) || 'pdf') as 'pdf' | 'docx' | 'doc',
          })
        },
        (err) => {
          console.error('Print request subscription error:', err)
          callback(null)
        }
      )
    } catch (error) {
      console.error('Error subscribing to print request:', error)
      callback(null)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Create a print request (admin action)
 */
export const createPrintRequest = async (
  fileUrl: string,
  message: string,
  fileType: 'pdf' | 'docx' | 'doc'
): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'config', 'printRequest')
  const now = new Date()
  await setDoc(docRef, {
    fileUrl,
    message,
    createdAt: now.toISOString(),
    status: 'pending',
    fileType,
  })
}

/**
 * Dismiss the print request (iPad taps Done)
 */
export const dismissPrintRequest = async (): Promise<void> => {
  await assertFirestoreReady()
  const docRef = doc(db, 'config', 'printRequest')
  await updateDoc(docRef, { status: 'dismissed' })
}

/**
 * Cancel the print request (admin action - same effect as dismiss)
 */
export const cancelPrintRequest = async (): Promise<void> => {
  await dismissPrintRequest()
}

/**
 * Subscribe to the print request for admin view (returns doc regardless of status)
 */
export const subscribeToPrintRequestForAdmin = (
  callback: (request: PrintRequestDoc | null) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, 'config', 'printRequest')
      unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists() || cancelled) {
            callback(null)
            return
          }
          const d = snap.data()
          const status = (d.status as string) || 'pending'
          callback({
            fileUrl: (d.fileUrl as string) || '',
            message: (d.message as string) || '',
            createdAt: (d.createdAt as string) || '',
            status: status as 'pending' | 'dismissed',
            fileType: ((d.fileType as string) || 'pdf') as 'pdf' | 'docx' | 'doc',
          })
        },
        (err) => {
          console.error('Print request admin subscription error:', err)
          callback(null)
        }
      )
    } catch (error) {
      console.error('Error subscribing to print request for admin:', error)
      callback(null)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Admin Login Attempts - track login attempts to the admin panel
// ────────────────────────────────────────────────────────────────────────────

export type AdminLoginAttempt = {
  id: string
  success: boolean
  ts: string // ISO timestamp
  tsMs: number
  userAgent?: string
}

const LS_ADMIN_LOGIN_ATTEMPTS_KEY = 'traq-admin-login-attempts-v1'

/**
 * Log an admin login attempt
 */
export const logAdminLoginAttempt = async (success: boolean): Promise<void> => {
  try {
    await assertFirestoreReady()
    const colRef = collection(db, 'adminLoginAttempts')
    const id = `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const docRef = doc(colRef, id)
    await setDoc(docRef, {
      success,
      ts: now.toISOString(),
      tsMs: now.getTime(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    })
  } catch (error) {
    console.warn('Failed to log admin login attempt:', error)
  }
}

/**
 * Subscribe to admin login attempts (for admin panel)
 */
export const subscribeToAdminLoginAttempts = (
  callback: (attempts: AdminLoginAttempt[]) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'adminLoginAttempts')
      // Query last 100 attempts, sorted by timestamp descending
      const q = query(colRef, orderBy('tsMs', 'desc'), limit(100))
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const attempts: AdminLoginAttempt[] = snap.docs.map((d) => ({
            id: d.id,
            success: d.data().success === true,
            ts: (d.data().ts as string) || '',
            tsMs: (d.data().tsMs as number) || 0,
            userAgent: d.data().userAgent as string | undefined,
          }))
          // Sort by tsMs descending (newest first)
          attempts.sort((a, b) => b.tsMs - a.tsMs)
          saveToLocalStorage(LS_ADMIN_LOGIN_ATTEMPTS_KEY, attempts)
          callback(attempts)
        },
        (err) => {
          console.error('Admin login attempts subscription error:', err)
          // Fallback to localStorage
          callback(getFromLocalStorage<AdminLoginAttempt[]>(LS_ADMIN_LOGIN_ATTEMPTS_KEY, []))
        }
      )
    } catch (error) {
      console.error('Error subscribing to admin login attempts:', error)
      callback(getFromLocalStorage<AdminLoginAttempt[]>(LS_ADMIN_LOGIN_ATTEMPTS_KEY, []))
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// App reload logs - track intentional and unexpected page reloads on kiosks
// ────────────────────────────────────────────────────────────────────────────

export type AppReloadLogInput = {
  kind: string
  ts: string
  tsMs: number
  lastAction?: string
  lastActionSecAgo?: number
  userAgent?: string
}

export type AppReloadLogEntry = AppReloadLogInput & {
  id: string
}

const LS_RELOAD_LOGS_KEY = 'traq-reload-logs-v1'

export const logAppReload = async (entry: AppReloadLogInput): Promise<void> => {
  try {
    await assertFirestoreReady()
    const colRef = collection(db, 'reloadLogs')
    const id = `reload-${entry.tsMs}-${Math.random().toString(36).slice(2, 8)}`
    const docRef = doc(colRef, id)
    await setDoc(docRef, {
      kind: entry.kind,
      ts: entry.ts,
      tsMs: entry.tsMs,
      ...(entry.lastAction ? { lastAction: entry.lastAction } : {}),
      ...(typeof entry.lastActionSecAgo === 'number' ? { lastActionSecAgo: entry.lastActionSecAgo } : {}),
      ...(entry.userAgent ? { userAgent: entry.userAgent } : {}),
    })
  } catch (error) {
    console.warn('Failed to log app reload:', error)
  }
}

export const subscribeToReloadLogs = (
  callback: (logs: AppReloadLogEntry[]) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'reloadLogs')
      const q = query(colRef, orderBy('tsMs', 'desc'), limit(100))
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const logs: AppReloadLogEntry[] = snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              kind: (data.kind as string) || 'unknown',
              ts: (data.ts as string) || '',
              tsMs: (data.tsMs as number) || 0,
              lastAction: data.lastAction as string | undefined,
              lastActionSecAgo: data.lastActionSecAgo as number | undefined,
              userAgent: data.userAgent as string | undefined,
            }
          })
          logs.sort((a, b) => b.tsMs - a.tsMs)
          saveToLocalStorage(LS_RELOAD_LOGS_KEY, logs)
          callback(logs)
        },
        (err) => {
          console.error('Reload logs subscription error:', err)
          callback(getFromLocalStorage<AppReloadLogEntry[]>(LS_RELOAD_LOGS_KEY, []))
        }
      )
    } catch (error) {
      console.error('Error subscribing to reload logs:', error)
      callback(getFromLocalStorage<AppReloadLogEntry[]>(LS_RELOAD_LOGS_KEY, []))
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Selection Logs - track task selections and clearings across all devices
// ────────────────────────────────────────────────────────────────────────────

export type SelectionLogEntry = {
  ts: string // ISO timestamp
  tsMs: number
  action: 'selected' | 'cleared'
  taskId: string
  taskName: string
  selectedDate?: string
  selectedWindow?: string
  assignees?: string[]
  deviceInfo?: string
}

const LS_SELECTION_LOGS_KEY = 'traq-selection-logs-v1'

/**
 * Append a selection log entry (writes to Firestore + localStorage cache)
 */
export const appendSelectionLogEntry = async (
  entry: Omit<SelectionLogEntry, 'ts' | 'tsMs' | 'deviceInfo'>
): Promise<void> => {
  const now = new Date()
  const deviceInfo = (() => {
    try {
      const ua = navigator.userAgent
      if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
      if (/Android/.test(ua)) return 'Android'
      if (/Mac/.test(ua)) return 'Mac'
      if (/Windows/.test(ua)) return 'Windows'
      if (/Linux/.test(ua)) return 'Linux'
      return 'Unknown'
    } catch {
      return 'Unknown'
    }
  })()

  const fullEntry: SelectionLogEntry = {
    ts: now.toISOString(),
    tsMs: now.getTime(),
    action: entry.action,
    taskId: entry.taskId,
    taskName: entry.taskName,
    ...(entry.selectedDate ? { selectedDate: entry.selectedDate } : {}),
    ...(entry.selectedWindow ? { selectedWindow: entry.selectedWindow } : {}),
    ...(entry.assignees && entry.assignees.length > 0 ? { assignees: entry.assignees } : {}),
    deviceInfo,
  }

  // Update localStorage cache
  const cached = getFromLocalStorage<SelectionLogEntry[]>(LS_SELECTION_LOGS_KEY, [])
  const updated = [fullEntry, ...cached]
  if (updated.length > 500) updated.length = 500
  saveToLocalStorage(LS_SELECTION_LOGS_KEY, updated)

  // Write to Firestore
  try {
    await assertFirestoreReady()
    const colRef = collection(db, 'selectionLogs')
    const id = `sel-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
    const docRef = doc(colRef, id)
    await setDoc(docRef, fullEntry)
  } catch (error) {
    console.warn('Selection log write failed:', error)
  }
}

/**
 * Subscribe to selection logs (real-time updates from Firestore)
 */
export const subscribeToSelectionLogs = (
  callback: (logs: SelectionLogEntry[]) => void,
  max: number = 200
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) {
      callback(getFromLocalStorage<SelectionLogEntry[]>(LS_SELECTION_LOGS_KEY, []))
      return
    }

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const colRef = collection(db, 'selectionLogs')
      const q = query(colRef, orderBy('tsMs', 'desc'), limit(Math.max(1, max)))
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const logs: SelectionLogEntry[] = snap.docs.map((d) => {
            const data = d.data()
            return {
              ts: typeof data.ts === 'string' ? data.ts : '',
              tsMs: typeof data.tsMs === 'number' ? data.tsMs : 0,
              action: data.action === 'cleared' ? 'cleared' : 'selected',
              taskId: typeof data.taskId === 'string' ? data.taskId : '',
              taskName: typeof data.taskName === 'string' ? data.taskName : '',
              selectedDate: typeof data.selectedDate === 'string' ? data.selectedDate : undefined,
              selectedWindow: typeof data.selectedWindow === 'string' ? data.selectedWindow : undefined,
              assignees: Array.isArray(data.assignees) ? (data.assignees as string[]) : undefined,
              deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : undefined,
            }
          })
          // Already sorted by query, but ensure consistency
          logs.sort((a, b) => b.tsMs - a.tsMs)
          saveToLocalStorage(LS_SELECTION_LOGS_KEY, logs)
          callback(logs)
        },
        (err) => {
          console.error('Selection logs subscription error:', err)
          // Fallback to localStorage
          callback(getFromLocalStorage<SelectionLogEntry[]>(LS_SELECTION_LOGS_KEY, []))
        }
      )
    } catch (error) {
      console.error('Error subscribing to selection logs:', error)
      callback(getFromLocalStorage<SelectionLogEntry[]>(LS_SELECTION_LOGS_KEY, []))
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

// ============ POS SYSTEM ============

export interface POSModifierCategory {
  id: string
  name: string
  singleSelect: boolean // true = only one modifier selectable, false = multiple allowed
  displayOrder: number // for ordering categories
}

export interface POSItem {
  id: string
  name: string
  price: number // in cents
  allowedCategoryIds: string[] // which categories can be used with this item
  displayOrder: number // for drag-and-drop reordering
}

export interface POSModifier {
  id: string
  name: string
  priceAdjustment: number // in cents, can be 0 or positive
  categoryId: string // which category this modifier belongs to
  displayOrder: number // for ordering within category
}

export interface POSCartItem {
  id: string
  item: POSItem
  modifiers: POSModifier[]
  quantity: number
  // Modifiers array can contain multiple from multi-select categories
  // but only one from single-select categories
}

export interface POSOrder {
  id: string
  orderNumber: number
  items: POSCartItem[]
  orderType?: 'dineIn' | 'toGo' // Optional for backward compatibility with existing orders
  discountPercent?: number // e.g., 10 for 10%
  discountAmount?: number // calculated discount in cents
  subtotal: number // in cents (before discount)
  tax: number // 10% tax on discounted subtotal in cents
  total: number // (subtotal - discount) + tax in cents
  cashTendered: number // in cents
  changeDue: number // in cents
  createdAt: string // ISO timestamp
}

interface POSConfig {
  categories: POSModifierCategory[]
  items: POSItem[]
  modifiers: POSModifier[]
}

const POS_COLLECTION = 'pos'

/**
 * Get POS config (categories, items and modifiers)
 */
export const getPOSConfig = async (): Promise<POSConfig> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'config')
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { categories: [], items: [], modifiers: [] }
    }

    const data = docSnap.data()
    
    // Migration: if categories don't exist, create empty array
    let categories: POSModifierCategory[] = Array.isArray(data.categories) ? data.categories : []
    
    // Migration: if modifiers exist without categoryId, assign to "Uncategorized"
    let modifiers: POSModifier[] = Array.isArray(data.modifiers) ? data.modifiers : []
    const hasUncategorized = modifiers.some(m => !m.categoryId || m.categoryId === '')
    
    if (hasUncategorized) {
      // Find or create "Uncategorized" category
      let uncategorizedCategory = categories.find(c => c.name === 'Uncategorized')
      
      if (!uncategorizedCategory) {
        const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.displayOrder)) : -1
        uncategorizedCategory = {
          id: 'uncategorized-' + Date.now(),
          name: 'Uncategorized',
          singleSelect: false,
          displayOrder: maxOrder + 1,
        }
        categories = [...categories, uncategorizedCategory]
      }
      
      // Assign uncategorized modifiers to this category
      modifiers = modifiers.map(m => ({
        ...m,
        categoryId: (m.categoryId && m.categoryId !== '') ? m.categoryId : uncategorizedCategory!.id,
        displayOrder: m.displayOrder ?? 0,
      }))
      
      // Save migrated data if we created a new category
      if (!categories.find(c => c.id === uncategorizedCategory!.id && c.name === 'Uncategorized' && categories.length > 1)) {
        await setDoc(docRef, { categories, modifiers }, { merge: true })
      }
    } else {
      // Ensure all modifiers have categoryId and displayOrder (defensive)
      modifiers = modifiers.map(m => ({
        ...m,
        categoryId: m.categoryId || '',
        displayOrder: m.displayOrder ?? 0,
      }))
    }
    
    // Migration: ensure items have allowedCategoryIds and displayOrder
    let items: POSItem[] = Array.isArray(data.items) ? data.items : []
    items = items.map((item, index) => ({
      ...item,
      allowedCategoryIds: item.allowedCategoryIds || [],
      displayOrder: item.displayOrder ?? index,
    }))
    
    // Sort by displayOrder
    items.sort((a, b) => a.displayOrder - b.displayOrder)
    categories.sort((a, b) => a.displayOrder - b.displayOrder)
    modifiers.sort((a, b) => {
      if (a.categoryId !== b.categoryId) return a.categoryId.localeCompare(b.categoryId)
      return a.displayOrder - b.displayOrder
    })
    
    return {
      categories,
      items,
      modifiers,
    }
  } catch (error) {
    console.warn('POS config load failed:', error)
    return { categories: [], items: [], modifiers: [] }
  }
}

/**
 * Save POS items
 */
export const savePOSItems = async (items: POSItem[]): Promise<void> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'config')
    await setDoc(docRef, { items }, { merge: true })
  } catch (error) {
    console.error('POS items save failed:', error)
    throw error
  }
}

/**
 * Save POS categories
 */
export const savePOSCategories = async (categories: POSModifierCategory[]): Promise<void> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'config')
    await setDoc(docRef, { categories }, { merge: true })
  } catch (error) {
    console.error('POS categories save failed:', error)
    throw error
  }
}

/**
 * Save POS modifiers
 */
export const savePOSModifiers = async (modifiers: POSModifier[]): Promise<void> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'config')
    await setDoc(docRef, { modifiers }, { merge: true })
  } catch (error) {
    console.error('POS modifiers save failed:', error)
    throw error
  }
}

/**
 * Subscribe to POS config changes
 */
export const subscribeToPOSConfig = (callback: (config: POSConfig) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, POS_COLLECTION, 'config')
      unsubscribe = onSnapshot(docRef, async (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          
          // Migration: handle missing fields
          let categories: POSModifierCategory[] = Array.isArray(data.categories) ? data.categories : []
          let modifiers: POSModifier[] = Array.isArray(data.modifiers) ? data.modifiers : []
          let items: POSItem[] = Array.isArray(data.items) ? data.items : []
          
          // Ensure modifiers have categoryId and displayOrder
          modifiers = modifiers.map(m => ({
            ...m,
            categoryId: m.categoryId || '',
            displayOrder: m.displayOrder ?? 0,
          }))
          
          // Ensure items have allowedCategoryIds and displayOrder
          items = items.map((item, index) => ({
            ...item,
            allowedCategoryIds: item.allowedCategoryIds || [],
            displayOrder: item.displayOrder ?? index,
          }))
          
          // Sort by displayOrder
          items.sort((a, b) => a.displayOrder - b.displayOrder)
          categories.sort((a, b) => a.displayOrder - b.displayOrder)
          modifiers.sort((a, b) => {
            if (a.categoryId !== b.categoryId) return a.categoryId.localeCompare(b.categoryId)
            return a.displayOrder - b.displayOrder
          })
          
          callback({
            categories,
            items,
            modifiers,
          })
        } else {
          callback({ categories: [], items: [], modifiers: [] })
        }
      })
    } catch (error) {
      console.error('Error subscribing to POS config:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Get POS orders
 */
export const getPOSOrders = async (): Promise<{ orders: POSOrder[]; nextOrderNumber: number }> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'orders')
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { orders: [], nextOrderNumber: 1 }
    }

    const data = docSnap.data()
    return {
      orders: Array.isArray(data.orders) ? data.orders : [],
      nextOrderNumber: typeof data.nextOrderNumber === 'number' ? data.nextOrderNumber : 1,
    }
  } catch (error) {
    console.warn('POS orders load failed:', error)
    return { orders: [], nextOrderNumber: 1 }
  }
}

/**
 * Save a new POS order
 */
export const savePOSOrder = async (order: POSOrder): Promise<void> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'orders')
    const docSnap = await getDoc(docRef)

    let orders: POSOrder[] = []
    if (docSnap.exists()) {
      const data = docSnap.data()
      orders = Array.isArray(data.orders) ? data.orders : []
    }

    orders.push(order)
    await setDoc(docRef, { orders, nextOrderNumber: order.orderNumber + 1 })
  } catch (error) {
    console.error('POS order save failed:', error)
    throw error
  }
}

/**
 * Subscribe to POS orders changes
 */
export const subscribeToPOSOrders = (
  callback: (data: { orders: POSOrder[]; nextOrderNumber: number }) => void
): (() => void) => {
  let unsubscribe: (() => void) | null = null
  let cancelled = false

  const setup = async () => {
    await waitForFirebase()
    if (cancelled) return
    if (!isFirestoreSDKAvailable()) return

    try {
      await assertFirestoreReady()
      if (cancelled) return
      const docRef = doc(db, POS_COLLECTION, 'orders')
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          callback({
            orders: Array.isArray(data.orders) ? data.orders : [],
            nextOrderNumber: typeof data.nextOrderNumber === 'number' ? data.nextOrderNumber : 1,
          })
        } else {
          callback({ orders: [], nextOrderNumber: 1 })
        }
      })
    } catch (error) {
      console.error('Error subscribing to POS orders:', error)
    }
  }

  setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Delete a single POS order
 */
export const deletePOSOrder = async (orderId: string): Promise<void> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'orders')
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return
    }

    const data = docSnap.data()
    const orders = Array.isArray(data.orders) ? data.orders : []
    const filteredOrders = orders.filter((order: POSOrder) => order.id !== orderId)

    await setDoc(docRef, { orders: filteredOrders, nextOrderNumber: data.nextOrderNumber || 1 })
  } catch (error) {
    console.error('POS order delete failed:', error)
    throw error
  }
}

/**
 * Clear all POS orders
 */
export const clearPOSOrders = async (): Promise<void> => {
  try {
    await assertFirestoreReady()
    const docRef = doc(db, POS_COLLECTION, 'orders')
    await setDoc(docRef, { orders: [], nextOrderNumber: 1 })
  } catch (error) {
    console.error('POS orders clear failed:', error)
    throw error
  }
}

// --- Fair-split contracts (canonical 50/50 baseline + gap) ---

const FAIR_SPLIT_CONTRACTS_COLLECTION = 'fairSplitContracts'

export type FairSplitContractWindowKey = '17' | '21'

export type FairSplitContractDoc = {
  dateKey: string
  windowKey: FairSplitContractWindowKey
  employeeA: string
  employeeB: string
  /** Snapshot task ids in the suggestion at last Generate/Regenerate (union of assignment + shared + ice keys). */
  taskIds: string[]
  suggestedAssignment: Record<string, string>
  finalSharedTaskIds: string[]
  finalIceMode: 'whole' | 'split'
  finalIceSplitAssignment?: Record<string, { left: string; right: string }>
  baselinePointsFloatA: number
  baselinePointsFloatB: number
  version: number
  createdAt?: number
}

export function fairSplitContractDocId(dateKey: string, windowKey: FairSplitContractWindowKey): string {
  return `${dateKey}__${windowKey}`
}

function fairSplitContractLocalKey(dateKey: string, windowKey: FairSplitContractWindowKey): string {
  return `traq:fairSplitContract:${dateKey}:${windowKey}`
}

/** Synchronous read for split-panel restore before Firestore snapshot arrives. */
export function readFairSplitContractLocalCache(
  dateKey: string,
  windowKey: FairSplitContractWindowKey,
): FairSplitContractDoc | null {
  const raw = getFromLocalStorage<Record<string, unknown> | null>(
    fairSplitContractLocalKey(dateKey, windowKey),
    null,
  )
  return parseFairSplitContractDoc(raw ?? undefined)
}

export function clearFairSplitContractLocalCache(
  dateKey: string,
  windowKey: FairSplitContractWindowKey,
): void {
  clearFairSplitContractLocalCacheInternal(dateKey, windowKey)
}

function cacheFairSplitContractLocally(contract: FairSplitContractDoc): void {
  saveToLocalStorage(fairSplitContractLocalKey(contract.dateKey, contract.windowKey), contract)
}

function clearFairSplitContractLocalCacheInternal(dateKey: string, windowKey: FairSplitContractWindowKey): void {
  try {
    localStorage.removeItem(fairSplitContractLocalKey(dateKey, windowKey))
  } catch (e) {
    console.warn('Fair split contract local cache clear failed:', e)
  }
}

function parseFairSplitContractDoc(data: Record<string, unknown> | undefined): FairSplitContractDoc | null {
  if (!data) return null
  const dateKey = typeof data.dateKey === 'string' ? data.dateKey : ''
  const wk = data.windowKey === '17' || data.windowKey === '21' ? data.windowKey : null
  if (!dateKey || !wk) return null
  const employeeA = typeof data.employeeA === 'string' ? data.employeeA.trim() : ''
  const employeeB = typeof data.employeeB === 'string' ? data.employeeB.trim() : ''
  if (!employeeA || !employeeB) return null
  const taskIds = Array.isArray(data.taskIds) ? (data.taskIds as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const suggestedAssignment =
    data.suggestedAssignment && typeof data.suggestedAssignment === 'object'
      ? (data.suggestedAssignment as Record<string, string>)
      : {}
  const finalSharedTaskIds = Array.isArray(data.finalSharedTaskIds)
    ? (data.finalSharedTaskIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  const finalIceMode = data.finalIceMode === 'split' ? 'split' : 'whole'
  let finalIceSplitAssignment: FairSplitContractDoc['finalIceSplitAssignment'] = undefined
  if (data.finalIceSplitAssignment && typeof data.finalIceSplitAssignment === 'object') {
    const iceOut: NonNullable<FairSplitContractDoc['finalIceSplitAssignment']> = {}
    for (const [k, v] of Object.entries(data.finalIceSplitAssignment as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const left = typeof o.left === 'string' ? o.left.trim() : ''
      const right = typeof o.right === 'string' ? o.right.trim() : ''
      if (left && right) iceOut[k] = { left, right }
    }
    if (Object.keys(iceOut).length) finalIceSplitAssignment = iceOut
  }
  const baselinePointsFloatA = typeof data.baselinePointsFloatA === 'number' ? data.baselinePointsFloatA : Number(data.baselinePointsFloatA)
  const baselinePointsFloatB = typeof data.baselinePointsFloatB === 'number' ? data.baselinePointsFloatB : Number(data.baselinePointsFloatB)
  const version = typeof data.version === 'number' ? data.version : 1
  const createdAt = typeof data.createdAt === 'number' ? data.createdAt : undefined
  if (!Number.isFinite(baselinePointsFloatA) || !Number.isFinite(baselinePointsFloatB)) return null
  return {
    dateKey,
    windowKey: wk,
    employeeA,
    employeeB,
    taskIds,
    suggestedAssignment,
    finalSharedTaskIds,
    finalIceMode,
    finalIceSplitAssignment,
    baselinePointsFloatA,
    baselinePointsFloatB,
    version,
    createdAt,
  }
}

export const setFairSplitContract = async (contract: FairSplitContractDoc): Promise<void> => {
  await assertFirestoreReady()
  const id = fairSplitContractDocId(contract.dateKey, contract.windowKey)
  const ref = doc(db, FAIR_SPLIT_CONTRACTS_COLLECTION, id)
  const payload: Record<string, unknown> = {
    dateKey: contract.dateKey,
    windowKey: contract.windowKey,
    employeeA: contract.employeeA,
    employeeB: contract.employeeB,
    taskIds: contract.taskIds,
    suggestedAssignment: contract.suggestedAssignment,
    finalSharedTaskIds: contract.finalSharedTaskIds,
    finalIceMode: contract.finalIceMode,
    baselinePointsFloatA: contract.baselinePointsFloatA,
    baselinePointsFloatB: contract.baselinePointsFloatB,
    version: contract.version,
    createdAt: serverTimestamp(),
  }
  if (contract.finalIceSplitAssignment && Object.keys(contract.finalIceSplitAssignment).length) {
    payload.finalIceSplitAssignment = contract.finalIceSplitAssignment
  }
  await setDoc(ref, payload, { merge: true })
  cacheFairSplitContractLocally(contract)
}

export const deleteFairSplitContract = async (
  dateKey: string,
  windowKey: FairSplitContractWindowKey
): Promise<void> => {
  try {
    await assertFirestoreReady()
    const id = fairSplitContractDocId(dateKey, windowKey)
    await deleteDoc(doc(db, FAIR_SPLIT_CONTRACTS_COLLECTION, id))
    clearFairSplitContractLocalCacheInternal(dateKey, windowKey)
  } catch (e) {
    // Missing doc is fine
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code?: string }).code) : ''
    if (code !== 'not-found') console.warn('deleteFairSplitContract:', e)
  }
}

export const subscribeFairSplitContract = (
  dateKey: string,
  windowKey: FairSplitContractWindowKey,
  callback: (doc: FairSplitContractDoc | null) => void
): (() => void) => {
  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    if (!isFirestoreSDKAvailable()) return
    try {
      await assertFirestoreReady()
      if (cancelled) return
      const id = fairSplitContractDocId(dateKey, windowKey)
      const docRef = doc(db, FAIR_SPLIT_CONTRACTS_COLLECTION, id)
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (!snap.exists()) {
          callback(null)
          return
        }
        callback(parseFairSplitContractDoc(snap.data() as Record<string, unknown>))
      })
    } catch (error) {
      console.error('subscribeFairSplitContract:', error)
      callback(null)
    }
  }

  void setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/** One-shot reads for admin month history (parallel per date × window). */
export const fetchFairSplitContract = async (
  dateKey: string,
  windowKey: FairSplitContractWindowKey
): Promise<FairSplitContractDoc | null> => {
  try {
    await assertFirestoreReady()
    const id = fairSplitContractDocId(dateKey, windowKey)
    const snap = await getDoc(doc(db, FAIR_SPLIT_CONTRACTS_COLLECTION, id))
    if (!snap.exists()) return null
    return parseFairSplitContractDoc(snap.data() as Record<string, unknown>)
  } catch {
    return null
  }
}

// --- Training windows (secret training mode: every participant of the window scores 50) ---

const TRAINING_WINDOWS_COLLECTION = 'trainingWindows'

export type TrainingWindowDoc = {
  dateKey: string
  windowKey: WindowKey
  enabled: boolean
  createdAt?: number
}

export function trainingWindowDocId(dateKey: string, windowKey: WindowKey): string {
  return `${dateKey}__${windowKey}`
}

function parseTrainingWindowDoc(data: Record<string, unknown> | undefined): TrainingWindowDoc | null {
  if (!data) return null
  const dateKey = typeof data.dateKey === 'string' ? data.dateKey : ''
  const wk =
    data.windowKey === '11' || data.windowKey === '17' || data.windowKey === '21' ? data.windowKey : null
  if (!dateKey || !wk) return null
  const enabled = data.enabled === true
  if (!enabled) return null
  const createdAt = typeof data.createdAt === 'number' ? data.createdAt : undefined
  return { dateKey, windowKey: wk, enabled, createdAt }
}

export const setTrainingWindow = async (dateKey: string, windowKey: WindowKey): Promise<void> => {
  await assertFirestoreReady()
  const id = trainingWindowDocId(dateKey, windowKey)
  const ref = doc(db, TRAINING_WINDOWS_COLLECTION, id)
  await setDoc(ref, { dateKey, windowKey, enabled: true, createdAt: serverTimestamp() }, { merge: true })
}

export const deleteTrainingWindow = async (dateKey: string, windowKey: WindowKey): Promise<void> => {
  try {
    await assertFirestoreReady()
    const id = trainingWindowDocId(dateKey, windowKey)
    await deleteDoc(doc(db, TRAINING_WINDOWS_COLLECTION, id))
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code?: string }).code) : ''
    if (code !== 'not-found') console.warn('deleteTrainingWindow:', e)
  }
}

export const subscribeTrainingWindow = (
  dateKey: string,
  windowKey: WindowKey,
  callback: (doc: TrainingWindowDoc | null) => void
): (() => void) => {
  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    if (!isFirestoreSDKAvailable()) return
    try {
      await assertFirestoreReady()
      if (cancelled) return
      const id = trainingWindowDocId(dateKey, windowKey)
      const docRef = doc(db, TRAINING_WINDOWS_COLLECTION, id)
      unsubscribe = onSnapshot(docRef, (snap) => {
        if (!snap.exists()) {
          callback(null)
          return
        }
        callback(parseTrainingWindowDoc(snap.data() as Record<string, unknown>))
      })
    } catch (error) {
      console.error('subscribeTrainingWindow:', error)
      callback(null)
    }
  }

  void setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Range subscription for leaderboard aggregation. Emits a Set of `${dateKey}__${windowKey}`
 * for every enabled training window between the two date keys (inclusive).
 */
export const subscribeTrainingWindowsInRange = (
  fromDateKey: string,
  toDateKey: string,
  callback: (ids: Set<string>) => void
): (() => void) => {
  let cancelled = false
  let unsubscribe: (() => void) | null = null

  const setup = async () => {
    if (!isFirestoreSDKAvailable()) return
    try {
      await assertFirestoreReady()
      if (cancelled) return
      const q = query(
        collection(db, TRAINING_WINDOWS_COLLECTION),
        where('dateKey', '>=', fromDateKey),
        where('dateKey', '<=', toDateKey)
      )
      unsubscribe = onSnapshot(q, (snap) => {
        const ids = new Set<string>()
        snap.forEach((d) => {
          const parsed = parseTrainingWindowDoc(d.data() as Record<string, unknown>)
          if (parsed) ids.add(trainingWindowDocId(parsed.dateKey, parsed.windowKey))
        })
        callback(ids)
      })
    } catch (error) {
      console.error('subscribeTrainingWindowsInRange:', error)
      callback(new Set())
    }
  }

  void setup()

  return () => {
    cancelled = true
    if (unsubscribe) unsubscribe()
  }
}