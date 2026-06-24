/** Kiosk-friendly length limits for window-complete copy. */
const SOLO_MAX_WORDS = 22
const PAIR_MAX_WORDS = 30
const MAX_CHARS = 175

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter((w) => w.length > 0).length
}

function takeFirstWords(text: string, maxWords: number, maxChars: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    if (out.length >= maxWords) break
    const trial = out.length ? `${out.join(' ')} ${w}` : w
    if (trial.length > maxChars) break
    out.push(w)
  }
  return out.join(' ')
}

/**
 * Prefer first 1–2 sentences under word/char caps; otherwise hard-truncate by words.
 * Ensures old cache entries and occasional model drift still fit the UI.
 */
export function clampWindowCompleteMessage(msg: string, layout: 'pair' | 'solo'): string {
  const maxWords = layout === 'solo' ? SOLO_MAX_WORDS : PAIR_MAX_WORDS
  let s = msg.replace(/\s+/g, ' ').trim()
  if (wordCount(s) <= maxWords && s.length <= MAX_CHARS) return s

  const sentenceParts = s.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean)
  let built = ''
  for (let i = 0; i < Math.min(2, sentenceParts.length); i++) {
    const next = built ? `${built} ${sentenceParts[i]}` : sentenceParts[i]!
    if (wordCount(next) <= maxWords && next.length <= MAX_CHARS) {
      built = next
      continue
    }
    if (!built) {
      built = takeFirstWords(sentenceParts[i]!, maxWords, MAX_CHARS)
    }
    break
  }

  s = built || takeFirstWords(s, maxWords, MAX_CHARS)
  if (s.length > MAX_CHARS) {
    s = s.slice(0, MAX_CHARS).replace(/[,;:\s\u2014-]+$/, '').trim()
  }
  if (s.length >= 12 && !/[.!?]$/.test(s)) s += '.'
  return s
}
