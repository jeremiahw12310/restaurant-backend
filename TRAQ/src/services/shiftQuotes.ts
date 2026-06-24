import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export type WindowKey = '11' | '17' | '21'

export type ShiftQuotePresentation = 'team' | 'attributed'

export type ShiftQuoteContext = {
  deploymentChannel: 'main' | 'beta'
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  windowKey: WindowKey
  employeesOnShift: string[]
  progress: { resolved: number; total: number; percent: number }
  stateTag?: 'all_done' | 'on_pace' | 'behind' | 'starting'
}

export type ShiftQuoteResponse = {
  greeting: string
  quote: string
  source: 'ai' | 'cache' | 'fallback'
  expiresAtMs: number
  presentation: ShiftQuotePresentation
  speakerName?: string
}

const FALLBACK_QUOTES: string[] = [
  'Great things happen when this team works together.',
  'Every task you finish makes the shift smoother for everyone.',
  'Stay sharp, stay kind, stay ahead.',
  'Small wins add up to a great shift.',
  'You set the standard — keep it high.',
  'Teamwork makes the dream work, and y\'all are proof.',
  'Knock out the next task and keep it rolling.',
  'Good energy is contagious — spread it around.',
]

function toOneSentence(text: string, maxWords = 28): string {
  let s = text.replace(/\s+/g, ' ').trim()
  if (!s) return s
  const m = s.match(/^([\s\S]+?[.!?])(\s+|$)/)
  if (m) {
    s = m[1].trim()
  }
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length > maxWords) {
    s = words.slice(0, maxWords).join(' ')
  } else {
    s = words.join(' ')
  }
  if (s && !/[.!?]$/.test(s)) s += '.'
  return s
}

function pickFallback(): ShiftQuoteResponse {
  const quote = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)]
  return {
    greeting: '',
    quote,
    presentation: 'team',
    source: 'fallback',
    expiresAtMs: Date.now() + 60_000,
  }
}

let cachedResponse: ShiftQuoteResponse | null = null
let cachedResponseFingerprint: string | null = null

const inflightByFingerprint = new Map<string, Promise<ShiftQuoteResponse>>()

/** Stable key so client cache invalidates when shift context changes (not only on expiry). */
export function shiftQuoteCtxFingerprint(ctx: ShiftQuoteContext): string {
  const emps = [...ctx.employeesOnShift].map(String).sort().join('|')
  const p = ctx.progress
  return [
    ctx.deploymentChannel,
    ctx.timeOfDay,
    ctx.windowKey,
    ctx.stateTag ?? '',
    emps,
    String(p.resolved),
    String(p.total),
    String(p.percent),
  ].join('\u0001')
}

/** Generous timeout to accommodate Firestore trigger cold starts. */
const TIMEOUT_MS = 45_000

let lateUpdateCallback: ((res: ShiftQuoteResponse) => void) | null = null

export function onLateQuoteUpdate(cb: (res: ShiftQuoteResponse) => void) {
  lateUpdateCallback = cb
}

function normalizeCompleteDoc(data: Record<string, unknown>): ShiftQuoteResponse | null {
  if (typeof data.quote !== 'string' || data.quote.length < 5) return null
  const quote = toOneSentence(data.quote.trim())
  const greeting = typeof data.greeting === 'string' ? data.greeting.trim() : ''
  const pres = data.presentation === 'attributed' ? 'attributed' : 'team'
  const speakerName = typeof data.speakerName === 'string' ? data.speakerName.trim() : ''
  const src = data.source
  const source: ShiftQuoteResponse['source'] =
    src === 'ai' || src === 'cache' || src === 'fallback'
      ? src
      : src === undefined
        ? 'ai'
        : 'fallback'
  const expiresAtMs = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : Date.now() + 5 * 60_000

  if (pres === 'attributed' && speakerName.length >= 2) {
    return { greeting: '', quote, source, expiresAtMs, presentation: 'attributed', speakerName }
  }
  return { greeting, quote, source, expiresAtMs, presentation: 'team' }
}

export async function fetchShiftQuote(ctx: ShiftQuoteContext): Promise<ShiftQuoteResponse> {
  const fp = shiftQuoteCtxFingerprint(ctx)
  if (
    cachedResponse &&
    cachedResponse.source !== 'fallback' &&
    Date.now() < cachedResponse.expiresAtMs &&
    fp === cachedResponseFingerprint
  ) {
    return cachedResponse
  }

  const existing = inflightByFingerprint.get(fp)
  if (existing) return existing

  const promise = new Promise<ShiftQuoteResponse>((resolve) => {
    let resolved = false
    let unsub: (() => void) | null = null

    const cleanup = () => {
      if (unsub) {
        unsub()
        unsub = null
      }
    }

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve(pickFallback())
      }
    }, TIMEOUT_MS)

    addDoc(collection(db, 'aiQuoteRequests'), {
      ...ctx,
      status: 'pending',
      requestedAt: serverTimestamp(),
    })
      .then((docRef) => {
        unsub = onSnapshot(docRef, (snap) => {
          const data = snap.data() as Record<string, unknown> | undefined
          if (!data || data.status === 'pending') return

          cleanup()
          clearTimeout(timer)

          if (data.status === 'complete') {
            const normalized = normalizeCompleteDoc(data)
            if (!normalized) {
              cachedResponse = null
              cachedResponseFingerprint = null
              if (!resolved) {
                resolved = true
                resolve(pickFallback())
              }
              return
            }
            cachedResponse = normalized
            cachedResponseFingerprint = fp
            if (resolved) {
              lateUpdateCallback?.(normalized)
            } else {
              resolved = true
              resolve(normalized)
            }
          } else {
            cachedResponse = null
            cachedResponseFingerprint = null
            if (!resolved) {
              resolved = true
              resolve(pickFallback())
            }
          }
        })
      })
      .catch((err: unknown) => {
        clearTimeout(timer)
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[shiftQuote] Firestore write failed:', msg)
        cachedResponse = null
        cachedResponseFingerprint = null
        if (!resolved) {
          resolved = true
          resolve(pickFallback())
        }
      })
  })

  promise.finally(() => {
    inflightByFingerprint.delete(fp)
  })

  inflightByFingerprint.set(fp, promise)
  return promise
}

export function getShiftQuoteFallback(): string {
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)]
}

export function isAiBackedShiftQuote(res: Pick<ShiftQuoteResponse, 'source'> | null | undefined): boolean {
  return res?.source === 'ai' || res?.source === 'cache'
}
