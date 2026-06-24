import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase'

/** Anonymous funnel events for the Bonfire apply site. No PII, no form values. */
export type ApplyEventType =
  | 'page_opened'
  | 'apply_clicked'
  | 'form_started'
  /** Fired the first time (per session) a user interacts with a given question. Lets the admin
   *  reconstruct the farthest field reached even if `abandoned` never flushes on exit. */
  | 'field_engaged'
  /** Tab was backgrounded (visibilitychange -> hidden). Distinct from `abandoned`; users often
   *  return after switching tabs (e.g. to copy an email). */
  | 'apply_tab_hidden'
  /** True exit: pagehide/beforeunload. Best-effort (Firestore JS SDK is not `keepalive`). */
  | 'abandoned'
  | 'submitted'

/** Key identifying which form question the user last touched (for abandonment grouping). */
export type ApplyQuestionKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'address'
  | 'availability'
  | 'employmentHistory'
  | 'felonyConviction'

export type ApplyClickSource = 'hero_button' | 'role_card_button'

export type ApplyExitReason = 'visibility' | 'pagehide' | 'beforeunload'

export type ApplyEventMeta = {
  source?: ApplyClickSource
  lastQuestion?: ApplyQuestionKey
  applicationId?: string
  reason?: ApplyExitReason
}

export type ApplyEvent = {
  id: string
  type: ApplyEventType
  sessionId: string
  ts: string
  tsMs: number
  meta?: ApplyEventMeta
}

const SESSION_STORAGE_KEY = 'traq-apply-session'
const COLLECTION = 'applyEvents'

/** Stable anonymous id for this tab/session. Returns '' if sessionStorage is unavailable. */
export function getOrCreateApplySessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(SESSION_STORAGE_KEY, fresh)
    return fresh
  } catch {
    return ''
  }
}

/**
 * Fire-and-forget event write. Errors are swallowed so the apply UI never blocks on analytics.
 *
 * NOTE: On `pagehide`/`visibilitychange=hidden`, the in-flight write may be cancelled by the
 * browser. The Firestore JS SDK does not support `fetch(..., { keepalive: true })` semantics,
 * so the abandonment event is best-effort.
 */
export function logApplyEvent(type: ApplyEventType, meta?: ApplyEventMeta): void {
  const now = new Date()
  const sessionId = getOrCreateApplySessionId()
  const doc: Record<string, unknown> = {
    type,
    sessionId,
    ts: now.toISOString(),
    tsMs: now.getTime(),
  }
  if (meta && Object.keys(meta).length > 0) {
    doc.meta = meta
  }
  addDoc(collection(db, COLLECTION), doc).catch((err) => {
    if (typeof console !== 'undefined') {
      console.warn('[applyEvents] write failed', err)
    }
  })
}

/** Subscribe to events newer than `sinceMs`. Pass 0 to subscribe to everything. */
export function subscribeToApplyEvents(
  sinceMs: number,
  callback: (events: ApplyEvent[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  const q =
    sinceMs > 0
      ? query(
          collection(db, COLLECTION),
          where('tsMs', '>=', sinceMs),
          orderBy('tsMs', 'desc')
        )
      : query(collection(db, COLLECTION), orderBy('tsMs', 'desc'))

  return onSnapshot(
    q,
    (snapshot) => {
      const events: ApplyEvent[] = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as ApplyEvent
      )
      callback(events)
    },
    (err) => {
      const msg =
        err?.message ||
        'Could not load apply events. Deploy Firestore rules if you have not, or create the index suggested in the browser console.'
      onError?.(msg)
      if (typeof console !== 'undefined') {
        console.warn('[applyEvents] snapshot error', err)
      }
    }
  )
}

export const APPLY_QUESTION_LABELS: Record<ApplyQuestionKey, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  birthDate: 'Birth date',
  address: 'Home address',
  availability: 'Availability',
  employmentHistory: 'Work history',
  felonyConviction: 'Felony question',
}

/** Order matches the form top-to-bottom; useful for "farthest field reached" comparisons. */
export const APPLY_QUESTION_ORDER: ApplyQuestionKey[] = [
  'name',
  'email',
  'phone',
  'birthDate',
  'address',
  'availability',
  'employmentHistory',
  'felonyConviction',
]

export const APPLY_CLICK_SOURCE_LABELS: Record<ApplyClickSource, string> = {
  hero_button: 'Hero "Apply now"',
  role_card_button: 'Role card "Quick apply"',
}

// === Session-level dedup helpers (module-scope; survive component remounts) ===
//
// These keep the analytics state machine consistent across React StrictMode double-mounts
// and across SPA route changes that remount BonfireApply, so the funnel measures real-user
// behavior rather than React lifecycle quirks.

let pageOpenedFiredOnce = false
const formStartedSessions = new Set<string>()
const engagedFieldsBySession = new Map<string, Set<ApplyQuestionKey>>()

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (e) => {
    // bfcache restore -> treat as a fresh open so the funnel counts the new view.
    const persisted = (e as PageTransitionEvent).persisted
    if (persisted) pageOpenedFiredOnce = false
  })
}

/** Fires `page_opened` at most once per real page load; rearmed on bfcache restore. */
export function logPageOpenedOnce(): boolean {
  if (pageOpenedFiredOnce) return false
  pageOpenedFiredOnce = true
  logApplyEvent('page_opened')
  return true
}

/** Fires `form_started` at most once per anonymous session id (survives component remounts). */
export function logFormStartedOnce(): boolean {
  const sessionId = getOrCreateApplySessionId()
  if (formStartedSessions.has(sessionId)) return false
  formStartedSessions.add(sessionId)
  logApplyEvent('form_started')
  return true
}

export function hasFormStartedThisSession(): boolean {
  const sessionId = getOrCreateApplySessionId()
  return formStartedSessions.has(sessionId)
}

/** Fires `field_engaged` at most once per (session, question). */
export function logFieldEngagedOnce(question: ApplyQuestionKey): boolean {
  const sessionId = getOrCreateApplySessionId()
  let set = engagedFieldsBySession.get(sessionId)
  if (!set) {
    set = new Set()
    engagedFieldsBySession.set(sessionId, set)
  }
  if (set.has(question)) return false
  set.add(question)
  logApplyEvent('field_engaged', { lastQuestion: question })
  return true
}
