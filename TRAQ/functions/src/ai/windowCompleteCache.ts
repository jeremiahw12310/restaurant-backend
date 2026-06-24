import { createHash } from 'crypto'
import * as admin from 'firebase-admin'
import { WindowCompleteMessageContext, WindowCompleteMessageResponse } from './windowCompleteTypes'

const COLLECTION = 'aiWindowCompleteCache'
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Stable per completion context; pair layouts add a slow-rotating bucket so the same
 * completion can get fresh wording over time without spamming identical lines.
 */
function cacheKey(ctx: WindowCompleteMessageContext): string {
  const pairPhraseSlot =
    ctx.layout === 'pair' ? Math.floor(Date.now() / (5 * 60 * 1000)) % 10 : 0
  const payload = JSON.stringify({
    w: ctx.windowKey,
    l: ctx.layout,
    label: ctx.windowLabel,
    ps: ctx.players.map((p) => ({
      n: p.name,
      s: p.score,
      w: p.isWinner,
      t: p.tasks.map((x) => x.taskName).sort(),
    })),
    phraseSlot: pairPhraseSlot,
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 40)
}

export async function getCachedWindowCompleteMessage(
  ctx: WindowCompleteMessageContext,
): Promise<WindowCompleteMessageResponse | null> {
  const db = admin.firestore()
  const key = cacheKey(ctx)
  const doc = await db.collection(COLLECTION).doc(key).get()
  if (!doc.exists) return null
  const data = doc.data() as { message: string; expiresAtMs: number } | undefined
  if (!data || typeof data.message !== 'string' || Date.now() > data.expiresAtMs) return null
  return { message: data.message, source: 'cache', expiresAtMs: data.expiresAtMs }
}

export async function setCachedWindowCompleteMessage(
  ctx: WindowCompleteMessageContext,
  message: string,
): Promise<WindowCompleteMessageResponse> {
  const db = admin.firestore()
  const key = cacheKey(ctx)
  const expiresAtMs = Date.now() + TTL_MS
  await db.collection(COLLECTION).doc(key).set({ message, expiresAtMs }, { merge: true })
  return { message, source: 'ai', expiresAtMs }
}
