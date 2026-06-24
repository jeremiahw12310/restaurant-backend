import { createHash } from 'crypto'
import { WindowCompleteMessageContext } from './windowCompleteTypes'

const SYSTEM = `You are writing ONE very short celebration line for a restaurant task-tracking touchscreen (Tasks app).
Output MUST be a single JSON object with exactly one string key: "message". No markdown, no extra keys.

"message" rules:
- At most 2 short sentences OR one sentence only — whichever fits first.
- HARD LIMIT: 30 words maximum. Prefer 18–26 words.
- Name every player listed (solo: one name; pair: both names). Mention concrete tasks from context (short task names).
- NEVER invent or guess people or work: use ONLY the exact player names and ONLY the task strings listed under "Players" in the user message. Do not add coworkers, roles, nicknames, or tasks not in that list. If a player's task list is "(no task names listed)" or empty, celebrate the shift without fabricating task titles for them.
- No filler ("incredible", "great care", "smoothly today", "leadership", "ensured everything"). No emojis, hashtags, or quotes inside the string.
- Refer to this time block as a **shift** (e.g. "this shift", "the lunch rush", the clock time). Do **not** say "window" anywhere in "message". If the shift label below is long, shorten with "this shift" or the time, not "this window".

PAIR LAYOUT — avoid repetitive "formula" copy:
- Do NOT use two parallel clauses with the same grammar for each person (bad: "Alex crushed A and B. Jordan handled C and D." with mirrored structure).
- Do NOT pair verbs like "excelled with … and completed …" for one person and "contributed with … and …" for the other (that pattern is banned).
- Vary openings, rhythm, and which task gets a short nod vs a fuller nod. One sentence that weaves both names is often best.

Follow the STRUCTURAL MODE line in the user message exactly for shape/tone (still obey all rules above).

Return only valid JSON.`

function structuralModeLine(ctx: WindowCompleteMessageContext): string {
  const taskBlob = ctx.players
    .map((p) => p.tasks.map((t) => t.taskName).join('\u0002'))
    .join('\u0001')
  const seed = `${ctx.windowKey}|${ctx.windowLabel}|${ctx.layout}|${ctx.players.map((p) => p.name).join('|')}|${taskBlob}`
  const byte = createHash('sha256').update(seed).digest()[0] ?? 0
  if (ctx.layout === 'solo') {
    const modes = [
      'STRUCTURAL MODE (solo): Warm close-out; name the person and at least one concrete task; avoid generic praise strings.',
      'STRUCTURAL MODE (solo): Lead with the win or the shift, then name + task in the same breath.',
      'STRUCTURAL MODE (solo): Short and punchy; name + task; no "crushed it" / "killed it" clichés.',
    ]
    return modes[byte % modes.length]!
  }
  const modes = [
    'STRUCTURAL MODE (pair): Prefer ONE flowing sentence that names both people and weaves tasks in — not two same-shaped halves.',
    'STRUCTURAL MODE (pair): Start with the shift or the team beat, then both names + tasks in different clause lengths (asymmetric, not mirrored).',
    'STRUCTURAL MODE (pair): Lead with a concrete scene beat, then names/tasks; avoid parallel "Person A verb… Person B verb…" structure.',
    'STRUCTURAL MODE (pair): Use a dash, comma chain, or colon rhythm — not two independent full sentences with matching grammar.',
    'STRUCTURAL MODE (pair): Slightly more ink on the higher score if scores differ; still name both and a task each; no winner/loser clichés.',
    'STRUCTURAL MODE (pair): Kitchen-forward phrasing allowed if still factual (names + real task names); keep it fresh, not a template.',
  ]
  return modes[byte % modes.length]!
}

export function buildWindowCompletePrompt(ctx: WindowCompleteMessageContext): { system: string; user: string } {
  const lines: string[] = [
    structuralModeLine(ctx),
    '',
    `Shift label (internal clock label; speak to the team as "this shift" / the time, never "window"): ${ctx.windowLabel}`,
    `Layout: ${ctx.layout}`,
    `Time of day (for tone only): ${ctx.timeOfDay}`,
    `Deployment: ${ctx.deploymentChannel}`,
    '',
    'Players (scores are weighted task points; isWinner marks higher score or tie with points):',
  ]
  for (const p of ctx.players) {
    const taskList = p.tasks.length ? p.tasks.map((t) => t.taskName).join('; ') : '(no task names listed)'
    lines.push(
      `- ${p.name}: score ${p.score}, winner flag ${p.isWinner}. Tasks they completed: ${taskList}`,
    )
  }
  lines.push(
    '',
    'Use only the names and task strings above. Do not mention tasks, people, or roles that are not listed.',
    'Write the JSON object now.',
  )
  return { system: SYSTEM, user: lines.join('\n') }
}
