import { ShiftQuoteContext } from './quoteTypes'

function stableHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const SYSTEM_TEAM = `You are a motivational assistant for a restaurant team task-tracking app called Tasks.
Output MUST be a single JSON object with exactly two string keys: "greeting" and "quote". No markdown, no extra keys.

"greeting": One short line (≤ 8 words) like a time-of-day hello to the team (e.g. "Good afternoon, team!"). Warm, inclusive. No emojis, no quotation marks inside the strings.

"quote": Exactly ONE sentence (≤ 26 words) for a large touchscreen. Energetic and specific to the shift context. Do not use the word "window" (the product uses "shift" for time blocks). You MAY mention one team member by first name only if that exact first name appears in "Team on shift" in the context below; if there is no team list or no good fit, do not use individual names. Never invent employee names. Do not invent or name specific task titles—you only have completion counts, not task names. Do not force a name in. No second sentence. No emojis, no hashtags, no quotation marks inside the string.

When task completion is not 100%, you may suggest clear forward actions (what to tackle next, reset, hand off, one clean pass) — practical and upbeat. Do NOT sound as if the team was failing, slacking, or had already gone off course: avoid any "back on track", "off track", "catch up", "make up ground", "fallen behind", "dig out", "turn it around", or similar recovery framing. Stay neutral-positive: next good move, not redemption from being behind.

BANNED in the quote (and close paraphrases): "momentum", "finish strong", "keep pushing", "dig deep", "crush it", "knock it out of the park", "you've got this", "keep rolling", "power through", "lock in", "stay locked in", "rise to the occasion", "leave it all on the line", "empty the tank", "give it 110%", "back on track", "get back on track", "off track", "catch up", "catching up", "fallen behind", "falling behind", "make up ground", "turn it around", "dig out".
Vary openings: do not default to "Let's …" every time; mix questions, observations, short imperatives, and direct address.

Return only valid JSON.`

const SYSTEM_ATTRIBUTED = `You are selecting a well-known direct quotation for a restaurant team kiosk (Tasks app).
Output MUST be a single JSON object with exactly two string keys: "speakerName" and "quote". No markdown, no extra keys.

"speakerName": The commonly credited author or speaker (e.g. Maya Angelou, Fred Rogers). Real public figure only; no fictional characters. No titles like Dr. unless universally used with the name. No quotation marks inside the string.

"quote": Exactly ONE sentence — the spoken words only, as a direct quote (≤ 26 words). Must read as something that person could have said. No emojis, no hashtags, no quotation marks inside the string.

Return only valid JSON.`

function buildUserContext(ctx: ShiftQuoteContext): string {
  const parts: string[] = []
  parts.push(`Time of day: ${ctx.timeOfDay}`)
  parts.push(
    `Current shift (time block): ${ctx.windowKey === '11' ? '11 AM' : ctx.windowKey === '17' ? '5 PM' : '9 PM'} — in your greeting and quote say "shift" (or the time), not "window".`,
  )
  if (ctx.employeesOnShift.length > 0) {
    parts.push(`Team on shift: ${ctx.employeesOnShift.join(', ')}`)
  }
  parts.push(`Tasks completed: ${ctx.progress.resolved} / ${ctx.progress.total} (${ctx.progress.percent}%)`)
  if (ctx.stateTag) {
    const labels: Record<string, string> = {
      all_done: 'The team has finished all tasks — celebrate them specifically; avoid generic praise. You may name someone.',
      on_pace:
        'Solid progress mid-shift — sound human and specific; do not lean on sports-pep clichés or the word "momentum". Do not imply they were barely holding on or need to "get back on track". You may name someone.',
      behind:
        'Task counts show there is still work left before the shift ends — be kind and practical. Suggest one or two concrete forward moves if you like; do not guilt-trip and do not imply anyone was slacking or already "off track" or needs to "catch up" or "get back on track".',
      starting: 'The shift just started — set a fresh, specific tone (not a generic rally cry).',
    }
    parts.push(labels[ctx.stateTag] ?? '')
  }
  return parts.filter(Boolean).join('\n')
}

function teamVarietyLine(ctx: ShiftQuoteContext): string {
  const slot = Math.floor(Date.now() / (5 * 60 * 1000))
  const h = stableHash(`${ctx.windowKey}|${ctx.stateTag ?? ''}|${ctx.progress.resolved}|${ctx.progress.total}|${slot}`)
  const lines = [
    'STRUCTURE: Lead with one concrete detail you could only say if you saw the numbers (no slogan first).',
    'STRUCTURE: Ask one short question, then imply the answer in the same sentence.',
    'STRUCTURE: Use one unexpected but apt verb; avoid "crush", "dominate", "rock", "kill".',
    'STRUCTURE: Compliment a habit or choice, not "energy" or "effort" alone.',
    'STRUCTURE: Tie the line to the time-of-day or this shift block (11 / 5 / 9) without naming the product; never say "window".',
    'STRUCTURE: Second person plural once; no "champions", "legends", "warriors".',
    'STRUCTURE: If you mention a name, make the sentence about what they did, not a generic cheer.',
    'STRUCTURE: End on a forward-looking image (food, floor, guests, hands) not on "tonight" clichés.',
  ]
  return lines[h % lines.length]!
}

export function buildTeamPrompt(ctx: ShiftQuoteContext): { system: string; user: string } {
  return {
    system: SYSTEM_TEAM,
    user: [teamVarietyLine(ctx), '', buildUserContext(ctx)].join('\n'),
  }
}

export function buildAttributedPrompt(ctx: ShiftQuoteContext): { system: string; user: string } {
  return {
    system: SYSTEM_ATTRIBUTED,
    user: [
      'Pick a quotation that fits the mood of the shift context below (not about restaurants unless natural).',
      '',
      buildUserContext(ctx),
    ].join('\n'),
  }
}
