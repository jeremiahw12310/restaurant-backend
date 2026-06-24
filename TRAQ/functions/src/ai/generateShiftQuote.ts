import { ShiftQuoteContext, ShiftQuoteResponse } from './quoteTypes'
import { buildAttributedPrompt, buildTeamPrompt } from './quotePrompt'
import { chatCompletion } from './openaiClient'
import { getCachedQuote, setCachedQuote } from './quoteCache'
import { presentationForContext } from './quotePresentation'
import { toOneSentence } from './shiftQuoteOneSentence'

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

function parseGreetingQuote(raw: string): { greeting: string; quote: string } | null {
  const trimmed = raw.replace(/^[\s`]+|[\s`]+$/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (typeof o.greeting !== 'string' || typeof o.quote !== 'string') return null
  const greeting = o.greeting.replace(/^["']|["']$/g, '').trim()
  const quote = o.quote.replace(/^["']|["']$/g, '').trim()
  if (greeting.length < 2 || greeting.length > 120) return null
  if (quote.length < 5 || quote.length > 220) return null
  return { greeting, quote }
}

function parseAttributedQuote(raw: string): { speakerName: string; quote: string } | null {
  const trimmed = raw.replace(/^[\s`]+|[\s`]+$/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (typeof o.speakerName !== 'string' || typeof o.quote !== 'string') return null
  const speakerName = o.speakerName.replace(/^["']|["']$/g, '').trim()
  const quote = o.quote.replace(/^["']|["']$/g, '').trim()
  if (speakerName.length < 2 || speakerName.length > 80) return null
  if (quote.length < 8 || quote.length > 220) return null
  return { speakerName, quote }
}

export async function generateShiftQuote(ctx: ShiftQuoteContext, apiKey: string): Promise<ShiftQuoteResponse> {
  try {
    const cached = await getCachedQuote(ctx)
    if (cached) return cached
  } catch {
    // cache miss is non-fatal
  }

  const slot = Math.floor(Date.now() / (5 * 60 * 1000))
  const presentation = presentationForContext(ctx, slot)

  try {
    if (presentation === 'attributed') {
      const { system, user } = buildAttributedPrompt(ctx)
      const raw = await chatCompletion(apiKey, system, user, { maxTokens: 120, temperature: 0.75 })
      const parsed = parseAttributedQuote(raw)
      if (!parsed) return pickFallback()
      const quote = toOneSentence(parsed.quote)
      const speakerName = parsed.speakerName.trim()
      if (!speakerName || quote.length < 5) return pickFallback()
      return await setCachedQuote(ctx, {
        greeting: '',
        quote,
        presentation: 'attributed',
        speakerName,
      })
    }

    const { system, user } = buildTeamPrompt(ctx)
    const raw = await chatCompletion(apiKey, system, user, { maxTokens: 160, temperature: 0.92 })
    const parsed = parseGreetingQuote(raw)
    if (!parsed) return pickFallback()

    return await setCachedQuote(ctx, {
      greeting: parsed.greeting.trim(),
      quote: toOneSentence(parsed.quote),
      presentation: 'team',
    })
  } catch (err) {
    console.error('AI quote generation failed, using fallback:', err)
    return pickFallback()
  }
}
