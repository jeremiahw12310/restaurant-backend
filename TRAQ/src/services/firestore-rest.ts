/**
 * Firebase Firestore REST API client
 * Works on iOS 9 and other old browsers that can't use the Firebase SDK
 * Uses XMLHttpRequest for maximum compatibility
 */

export type WindowKey = '11' | '17' | '21'

// Firebase config
const PROJECT_ID = 'traq-caab9'
const API_KEY = 'AIzaSyDOzTnrm_ym-kDal9ymk3dlDidih9nVdXM'
const BASE_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents'

// Helper to make REST requests using XMLHttpRequest (works on iOS 9)
const firestoreRequest = (
  path: string, 
  method: 'GET' | 'PATCH' | 'POST' = 'GET',
  body?: unknown,
  createIfMissing: boolean = false
): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    // For PATCH with createIfMissing, add updateMask to allow creating new docs
    let url = BASE_URL + '/' + path
    // If caller already provided query params (e.g. ?documentId=...), append key with '&'
    url += (url.includes('?') ? '&' : '?') + 'key=' + API_KEY
    if (method === 'PATCH' && createIfMissing && body) {
      // Add all field names to updateMask to enable upsert behavior
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields = (body as any).fields
      if (fields) {
        const fieldNames = Object.keys(fields)
        fieldNames.forEach(field => {
          url += '&updateMask.fieldPaths=' + field
        })
      }
    }
    
    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('JSON parse error'))
          }
        } else {
          console.error('XHR error response:', xhr.status, xhr.responseText)
          reject(new Error('XHR error: ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100)))
        }
      }
    }
    
    xhr.onerror = function() {
      reject(new Error('XHR network error'))
    }
    
    xhr.ontimeout = function() {
      console.error('XHR timeout after', xhr.timeout, 'ms')
      reject(new Error('XHR timeout'))
    }
    
    xhr.timeout = 7000 // 7 second timeout (iOS 9 compatible)
    
    if (body && (method === 'PATCH' || method === 'POST')) {
      xhr.send(JSON.stringify(body))
    } else {
      xhr.send()
    }
  })
}

// Convert Firestore REST format to plain value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseFirestoreValue = (value: any): any => {
  if (value.stringValue !== undefined) return value.stringValue
  if (value.integerValue !== undefined) return parseInt(value.integerValue, 10)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.booleanValue !== undefined) return value.booleanValue
  if (value.nullValue !== undefined) return null
  if (value.arrayValue) {
    return (value.arrayValue.values || []).map(parseFirestoreValue)
  }
  if (value.mapValue) {
    const result: Record<string, unknown> = {}
    const fields = value.mapValue.fields || {}
    for (const key in fields) {
      result[key] = parseFirestoreValue(fields[key])
    }
    return result
  }
  return value
}

// Convert plain value to Firestore REST format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFirestoreValue = (value: any): any => {
  if (value === null) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) }
    return { doubleValue: value }
  }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } }
  }
  if (typeof value === 'object') {
    const fields: Record<string, unknown> = {}
    for (const key in value) {
      fields[key] = toFirestoreValue(value[key])
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(value) }
}

// Parse Firestore REST document "fields" into a plain object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseFirestoreFields = (fields: any): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  if (!fields || typeof fields !== 'object') return result
  for (const key in fields) {
    result[key] = parseFirestoreValue(fields[key])
  }
  return result
}

// Extract the document id from a Firestore REST document name.
const docIdFromName = (name: string): string => {
  const parts = String(name || '').split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Get employees from Firestore via REST API
 */
export const getEmployeesREST = async (): Promise<string[]> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await firestoreRequest('config/employees') as any
    
    if (doc.fields && doc.fields.list) {
      return parseFirestoreValue(doc.fields.list) as string[]
    }
    return []
  } catch (error) {
    console.error('REST: Error getting employees:', error)
    return []
  }
}

/**
 * Save employees to Firestore via REST API
 */
export const saveEmployeesREST = async (employees: string[]): Promise<boolean> => {
  try {
    const body = {
      fields: {
        list: toFirestoreValue(employees)
      }
    }
    try {
      await firestoreRequest('config/employees', 'PATCH', body, true)
    } catch (err) {
      // If doc missing, create it
      if (String(err).includes('404')) {
        await firestoreRequest('config?documentId=employees', 'POST', body)
      } else {
        throw err
      }
    }
    return true
  } catch (error) {
    console.error('REST: Error saving employees:', error)
    return false
  }
}

/**
 * Get task order from Firestore via REST API
 */
export const getTaskOrderREST = async (): Promise<Record<WindowKey, string[]>> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await firestoreRequest('config/taskOrder') as any
    
    if (doc.fields && doc.fields.order) {
      return parseFirestoreValue(doc.fields.order) as Record<WindowKey, string[]>
    }
    return {} as Record<WindowKey, string[]>
  } catch (error) {
    console.error('REST: Error getting task order:', error)
    return {} as Record<WindowKey, string[]>
  }
}

/**
 * Save task order to Firestore via REST API
 */
export const saveTaskOrderREST = async (order: Record<WindowKey, string[]>): Promise<boolean> => {
  try {
    const body = {
      fields: {
        order: toFirestoreValue(order)
      }
    }
    try {
      await firestoreRequest('config/taskOrder', 'PATCH', body, true)
    } catch (err) {
      if (String(err).includes('404')) {
        await firestoreRequest('config?documentId=taskOrder', 'POST', body)
      } else {
        throw err
      }
    }
    return true
  } catch (error) {
    console.error('REST: Error saving task order:', error)
    return false
  }
}

/**
 * Test if REST API is working
 */
export const testRESTConnection = async (): Promise<boolean> => {
  try {
    await firestoreRequest('config/employees')
    return true
  } catch (error) {
    console.warn('REST connection test failed:', error)
    return false
  }
}

// Task completion types
type TaskCompletion = {
  status: 'done'
  assignees: string[]
  completedAt: string
  assignedByAdmin?: boolean
  completedLate?: boolean
  lateForgiven?: boolean
  completedEarly?: boolean
  autoAssigned?: boolean
}

type TaskState = Record<string, Record<WindowKey, Record<string, TaskCompletion>>>

/**
 * Get task state (completions) from Firestore via REST API
 */
export const getTaskStateREST = async (): Promise<TaskState> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await firestoreRequest('taskState/current') as any
    if (import.meta.env.DEV) console.log('REST getTaskState raw response:', JSON.stringify(doc).substring(0, 300))
    
    if (doc.fields && doc.fields.state) {
      const parsed = parseFirestoreValue(doc.fields.state) as TaskState
      if (import.meta.env.DEV) console.log('REST getTaskState parsed:', JSON.stringify(parsed).substring(0, 200))
      return parsed
    }
    return {}
  } catch (error) {
    // Document might not exist yet
    console.warn('REST: getTaskState error:', error)
    return {}
  }
}

/**
 * Save task state (completions) to Firestore via REST API
 */
export const saveTaskStateREST = async (state: TaskState): Promise<boolean> => {
  try {
    if (import.meta.env.DEV) console.log('REST saveTaskState called with:', JSON.stringify(state).substring(0, 200))
    const body = {
      fields: {
        state: toFirestoreValue(state),
        updatedAt: toFirestoreValue(new Date().toISOString())
      }
    }
    if (import.meta.env.DEV) console.log('REST saveTaskState body:', JSON.stringify(body).substring(0, 300))
    try {
      await firestoreRequest('taskState/current', 'PATCH', body, true)
    } catch (err) {
      if (String(err).includes('404')) {
        await firestoreRequest('taskState?documentId=current', 'POST', body)
      } else {
        throw err
      }
    }
    if (import.meta.env.DEV) console.log('REST saveTaskState SUCCESS')
    return true
  } catch (error) {
    console.error('REST: Error saving task state:', error)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Music Sessions + Remote Commands (REST-backed, SDK-independent)
// ─────────────────────────────────────────────────────────────────────────────

export type MusicSessionCommandREST = {
  id: string
  action: 'play' | 'pause' | 'next' | 'prev' | 'seek'
  issuedAtMs: number
  issuedAt: string
  payload?: { positionSec?: number }
  status?: 'pending' | 'done' | 'failed' | 'needs_gesture'
  handledAtMs?: number
  handledAt?: string
  resultDetail?: string
}

export const upsertMusicSessionREST = async (
  sessionId: string,
  data: Record<string, unknown>
): Promise<boolean> => {
  try {
    if (!sessionId) return false
    const body = { fields: toFirestoreValue({ ...data, sessionId }).mapValue.fields }
    await firestoreRequest(`musicSessions/${encodeURIComponent(sessionId)}`, 'PATCH', body, true)
    return true
  } catch (e) {
    console.warn('REST: upsertMusicSession failed:', e)
    return false
  }
}

export const listMusicSessionsREST = async (max: number): Promise<Record<string, unknown>[]> => {
  try {
    // pageSize limits the server response size.
    const pageSize = Math.max(1, Math.min(200, Math.floor(max) || 50))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await firestoreRequest(`musicSessions?pageSize=${pageSize}`, 'GET')) as any
    const docs = Array.isArray(res?.documents) ? res.documents : []
    return docs
      .map((d: any) => {
        const name = typeof d?.name === 'string' ? d.name : ''
        const id = docIdFromName(name)
        const fields = parseFirestoreFields(d?.fields)
        return { sessionId: id || (fields.sessionId as string) || '', ...fields }
      })
      .filter((x: any) => x && typeof x.sessionId === 'string' && x.sessionId)
  } catch (e) {
    console.warn('REST: listMusicSessions failed:', e)
    return []
  }
}

export const enqueueMusicSessionCommandREST = async (
  sessionId: string,
  action: MusicSessionCommandREST['action'],
  payload?: MusicSessionCommandREST['payload']
): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    if (!sessionId) return { success: false, error: 'missing-sessionId' }
    if (!action) return { success: false, error: 'missing-action' }
    const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const issuedAtMs = Date.now()
    const issuedAt = new Date(issuedAtMs).toISOString()
    const doc: Omit<MusicSessionCommandREST, 'id'> = {
      action,
      issuedAtMs,
      issuedAt,
      payload,
      status: 'pending',
    }
    const body = { fields: toFirestoreValue(doc).mapValue.fields }
    await firestoreRequest(`musicSessions/${encodeURIComponent(sessionId)}/commands?documentId=${encodeURIComponent(id)}`, 'POST', body)
    return { success: true, id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('REST: enqueueMusicSessionCommand failed:', e)
    return { success: false, error: msg }
  }
}

export const listMusicSessionCommandsREST = async (
  sessionId: string,
  max: number
): Promise<MusicSessionCommandREST[]> => {
  try {
    const pageSize = Math.max(1, Math.min(50, Math.floor(max) || 10))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await firestoreRequest(`musicSessions/${encodeURIComponent(sessionId)}/commands?pageSize=${pageSize}`, 'GET')) as any
    const docs = Array.isArray(res?.documents) ? res.documents : []
    return docs
      .map((d: any) => {
        const name = typeof d?.name === 'string' ? d.name : ''
        const id = docIdFromName(name)
        const fields = parseFirestoreFields(d?.fields)
        const cmd: MusicSessionCommandREST = {
          id,
          action: (fields.action as any) || 'play',
          issuedAtMs: typeof fields.issuedAtMs === 'number' ? (fields.issuedAtMs as number) : 0,
          issuedAt: typeof fields.issuedAt === 'string' ? (fields.issuedAt as string) : '',
          payload: typeof fields.payload === 'object' ? (fields.payload as any) : undefined,
          status: typeof fields.status === 'string' ? (fields.status as any) : undefined,
          handledAtMs: typeof fields.handledAtMs === 'number' ? (fields.handledAtMs as number) : undefined,
          handledAt: typeof fields.handledAt === 'string' ? (fields.handledAt as string) : undefined,
          resultDetail: typeof fields.resultDetail === 'string' ? (fields.resultDetail as string) : undefined,
        }
        return cmd
      })
      .filter((c: MusicSessionCommandREST) => !!c.id)
  } catch (e) {
    console.warn('REST: listMusicSessionCommands failed:', e)
    return []
  }
}

export const patchMusicSessionCommandREST = async (
  sessionId: string,
  commandId: string,
  data: Partial<Omit<MusicSessionCommandREST, 'id'>>
): Promise<boolean> => {
  try {
    if (!sessionId || !commandId) return false
    const body = { fields: toFirestoreValue(data).mapValue.fields }
    await firestoreRequest(
      `musicSessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(commandId)}`,
      'PATCH',
      body,
      true
    )
    return true
  } catch (e) {
    console.warn('REST: patchMusicSessionCommand failed:', e)
    return false
  }
}




