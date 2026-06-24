import { buildWindowCompletePrompt } from './windowCompletePrompt'
import { chatCompletion } from './openaiClient'
import { getCachedWindowCompleteMessage, setCachedWindowCompleteMessage } from './windowCompleteCache'
import { clampWindowCompleteMessage } from './windowCompleteMessageClamp'
import { WindowCompleteMessageContext, WindowCompleteMessageResponse } from './windowCompleteTypes'

function finalizeMessage(raw: string, ctx: WindowCompleteMessageContext): string {
  return clampWindowCompleteMessage(raw, ctx.layout)
}

function pickFallback(ctx: WindowCompleteMessageContext): WindowCompleteMessageResponse {
  if (ctx.layout === 'solo' && ctx.players[0]) {
    const n = ctx.players[0].name
    return {
      message: finalizeMessage(`All done, ${n} — you cleared this window.`, ctx),
      source: 'fallback',
      expiresAtMs: Date.now() + 60_000,
    }
  }
  const [a, b] = ctx.players
  if (a && b) {
    return {
      message: finalizeMessage(`${a.name} and ${b.name} — every task in this window is done. Nice work.`, ctx),
      source: 'fallback',
      expiresAtMs: Date.now() + 60_000,
    }
  }
  return {
    message: finalizeMessage(`All ${ctx.windowLabel} tasks are complete.`, ctx),
    source: 'fallback',
    expiresAtMs: Date.now() + 60_000,
  }
}

function parseMessage(raw: string): string | null {
  const trimmed = raw.replace(/^[\s`]+|[\s`]+$/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (typeof o.message !== 'string') return null
  const message = o.message.replace(/^["']|["']$/g, '').trim()
  if (message.length < 8 || message.length > 800) return null
  return message
}

export async function generateWindowCompleteMessage(
  ctx: WindowCompleteMessageContext,
  apiKey: string,
): Promise<WindowCompleteMessageResponse> {
  try {
    const cached = await getCachedWindowCompleteMessage(ctx)
    if (cached) {
      return { ...cached, message: finalizeMessage(cached.message, ctx) }
    }
  } catch {
    // non-fatal
  }

  try {
    const { system, user } = buildWindowCompletePrompt(ctx)
    const raw = await chatCompletion(apiKey, system, user, { maxTokens: 100, temperature: 0.9 })
    const parsed = parseMessage(raw)
    if (!parsed) return pickFallback(ctx)
    const message = finalizeMessage(parsed, ctx)
    if (message.length < 10) return pickFallback(ctx)
    return await setCachedWindowCompleteMessage(ctx, message)
  } catch (err) {
    console.error('Window complete AI failed:', err)
    return pickFallback(ctx)
  }
}
