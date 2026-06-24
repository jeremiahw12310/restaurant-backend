import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export type WindowKey = '11' | '17' | '21'

export type WindowCompletePlayerPayload = {
  name: string
  score: number
  isWinner: boolean
  tasks: Array<{ taskName: string }>
}

export type WindowCompleteMessageContext = {
  deploymentChannel: 'main' | 'beta'
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  windowKey: WindowKey
  windowLabel: string
  layout: 'pair' | 'solo'
  players: WindowCompletePlayerPayload[]
}

export type WindowCompleteMessageResponse = {
  message: string
  source: 'ai' | 'cache' | 'fallback'
  expiresAtMs: number
}

export type CelebrationSnapshotForAi = {
  windowLabel: string
  layout?: 'pair' | 'solo'
  players: Array<{
    name: string
    score: number
    isWinner: boolean
    tiles: Array<{ taskId: string; taskName?: string }>
  }>
}

export function buildWindowCompleteMessageContext(args: {
  celebration: CelebrationSnapshotForAi
  windowKey: WindowKey
  timeOfDay: WindowCompleteMessageContext['timeOfDay']
  deploymentChannel: 'main' | 'beta'
}): WindowCompleteMessageContext {
  const layout = args.celebration.layout ?? 'pair'
  const players: WindowCompletePlayerPayload[] = args.celebration.players.map((p) => ({
    name: p.name,
    score: p.score,
    isWinner: p.isWinner,
    tasks: (p.tiles || []).map((t) => ({
      taskName: (t.taskName && t.taskName.trim()) || t.taskId,
    })),
  }))
  return {
    deploymentChannel: args.deploymentChannel,
    timeOfDay: args.timeOfDay,
    windowKey: args.windowKey,
    windowLabel: args.celebration.windowLabel,
    layout,
    players,
  }
}

/** Mirrors backend limits so older cached responses still fit the kiosk UI. */
function clampClientMessage(msg: string, layout: 'pair' | 'solo'): string {
  const maxWords = layout === 'solo' ? 22 : 30
  const maxChars = 175
  const words = msg.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords && msg.length <= maxChars) return msg.trim()
  const cut = words.slice(0, maxWords).join(' ')
  let s = cut.length > maxChars ? cut.slice(0, maxChars).replace(/[,;:\s-]+$/, '').trim() : cut
  if (s.length >= 10 && !/[.!?]$/.test(s)) s += '.'
  return s
}

function normalizeDoc(data: Record<string, unknown>, ctx: WindowCompleteMessageContext): WindowCompleteMessageResponse {
  if (data.status === 'complete' && typeof data.message === 'string' && data.message.trim().length >= 10) {
    const src = data.source
    const source: WindowCompleteMessageResponse['source'] =
      src === 'ai' || src === 'cache' || src === 'fallback'
        ? src
        : src === undefined
          ? 'ai'
          : 'fallback'
    return {
      message: clampClientMessage(data.message.trim(), ctx.layout),
      source,
      expiresAtMs: typeof data.expiresAtMs === 'number' ? data.expiresAtMs : Date.now() + 5 * 60_000,
    }
  }
  return pickFallback(ctx)
}

function pickFallback(ctx: WindowCompleteMessageContext): WindowCompleteMessageResponse {
  if (ctx.layout === 'solo' && ctx.players[0]) {
    const n = ctx.players[0].name
    return {
      message: clampClientMessage(`All done, ${n} — you cleared this window.`, ctx.layout),
      source: 'fallback',
      expiresAtMs: Date.now() + 60_000,
    }
  }
  const [a, b] = ctx.players
  if (a && b) {
    return {
      message: clampClientMessage(`${a.name} and ${b.name} — every task in this window is done. Nice work.`, ctx.layout),
      source: 'fallback',
      expiresAtMs: Date.now() + 60_000,
    }
  }
  return {
    message: clampClientMessage(`All ${ctx.windowLabel} tasks are complete.`, ctx.layout),
    source: 'fallback',
    expiresAtMs: Date.now() + 60_000,
  }
}

const TIMEOUT_MS = 45_000

let lateWindowCompleteMessageCb: ((res: WindowCompleteMessageResponse) => void) | null = null

export function onLateWindowCompleteMessage(cb: (res: WindowCompleteMessageResponse) => void) {
  lateWindowCompleteMessageCb = cb
}

export async function fetchWindowCompleteMessage(ctx: WindowCompleteMessageContext): Promise<WindowCompleteMessageResponse> {
  return new Promise<WindowCompleteMessageResponse>((resolve) => {
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
        resolve(pickFallback(ctx))
      }
    }, TIMEOUT_MS)

    addDoc(collection(db, 'aiWindowCompleteRequests'), {
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

          const out = normalizeDoc(data, ctx)
          if (resolved) {
            lateWindowCompleteMessageCb?.(out)
          } else {
            resolved = true
            resolve(out)
          }
        })
      })
      .catch((err: unknown) => {
        clearTimeout(timer)
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[windowCompleteAi] Firestore write failed:', msg)
        if (!resolved) {
          resolved = true
          resolve(pickFallback(ctx))
        }
      })
  })
}
