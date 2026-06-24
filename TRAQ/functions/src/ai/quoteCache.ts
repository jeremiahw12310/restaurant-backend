import * as admin from 'firebase-admin'
import { ShiftQuoteContext, ShiftQuotePresentation, ShiftQuoteResponse } from './quoteTypes'
import { presentationForContext } from './quotePresentation'

const COLLECTION = 'aiQuoteCache'
const TTL_MS = 5 * 60 * 1000 // 5 minutes

function timeSlot(): number {
  return Math.floor(Date.now() / TTL_MS)
}

function cacheKey(ctx: ShiftQuoteContext): string {
  const slot = timeSlot()
  const pres = presentationForContext(ctx, slot)
  const p = ctx.progress
  return `${ctx.windowKey}_${ctx.stateTag ?? 'none'}_${p.resolved}_${p.total}_${p.percent}_${pres}_${slot}`
}

export async function getCachedQuote(ctx: ShiftQuoteContext): Promise<ShiftQuoteResponse | null> {
  const db = admin.firestore()
  const key = cacheKey(ctx)
  const doc = await db.collection(COLLECTION).doc(key).get()
  if (!doc.exists) return null

  const data = doc.data() as
    | {
        greeting?: string
        quote: string
        expiresAtMs: number
        presentation?: string
        speakerName?: string
      }
    | undefined
  if (!data || Date.now() > data.expiresAtMs) return null

  const greeting = typeof data.greeting === 'string' ? data.greeting : ''
  const presentation: ShiftQuotePresentation =
    data.presentation === 'attributed' ? 'attributed' : 'team'
  const speakerName = typeof data.speakerName === 'string' ? data.speakerName.trim() : ''

  return {
    greeting,
    quote: data.quote,
    source: 'cache',
    expiresAtMs: data.expiresAtMs,
    presentation,
    ...(presentation === 'attributed' && speakerName ? { speakerName } : {}),
  }
}

export async function setCachedQuote(
  ctx: ShiftQuoteContext,
  payload: {
    greeting: string
    quote: string
    presentation: ShiftQuotePresentation
    speakerName?: string
  },
): Promise<ShiftQuoteResponse> {
  const db = admin.firestore()
  const key = cacheKey(ctx)
  const expiresAtMs = Date.now() + TTL_MS

  await db
    .collection(COLLECTION)
    .doc(key)
    .set(
      {
        greeting: payload.greeting,
        quote: payload.quote,
        presentation: payload.presentation,
        speakerName: payload.speakerName ?? '',
        expiresAtMs,
      },
      { merge: true },
    )

  return {
    greeting: payload.greeting,
    quote: payload.quote,
    source: 'ai',
    expiresAtMs,
    presentation: payload.presentation,
    ...(payload.presentation === 'attributed' && payload.speakerName
      ? { speakerName: payload.speakerName }
      : {}),
  }
}
