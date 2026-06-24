import { chatCompletion } from './openaiClient'
import type { TaskSplitRequestPayload, TaskSplitVariantPayload } from './taskSplitTypes'

const SYSTEM_BASE = `You choose among mathematically equivalent (or nearly equivalent) restaurant task splits for two employees.
Output MUST be a single JSON object with exactly two keys:
- "choiceIndex": integer, 0-based index into the provided variants list.
- "rationale": short string (max 28 words), no emojis, no markdown.

Rules:
- Pick the variant that best fits the brief work history (balance workload types, not just points).
- The split balance objective is the CURRENT WINDOW ONLY. Do not try to "make up" for an earlier window like 11AM — a person who already did more 11AM tasks should still split this window fairly.
- Trash and dining-area check are always shared between both employees (assignees include both names). They will appear in variant.sharedTaskIds.
- Splittable tasks (ice, yum yum sauce, trash, bowl refill, dining-area check) may appear on both sides. Mention this when relevant.
- If someone mops, they also do sweep mats. The other person handles sweep, empty dustpan, drawer, and tips — the mopper does NOT count drawer or tips.
- If there are multiple mop-type tasks in the window, ONE employee must do ALL of them (never assign mops to both people).
- Last-together rotation is a STRONG preference, not just a tie-break. When a line shows "Name ×N → prefer Other", that task should move to Other, and the strength grows steeply with N (the more times in a row the same person did it, the more important it is to rotate). A task done by the same person many shifts in a row should almost always move to the other person.
- The variants list is PRE-SORTED so that lower index = better rotation among the near-even options (index 0 rotates the longest streaks best). Prefer the lowest index unless work-type balance from the work history clearly argues for another near-equal variant. Never break score fairness, always-shared tasks, mop coupling, or ice rules to chase rotation.
- When you use rotation, say so in rationale (e.g. "Alex mopped 3x in a row, so mop goes to Jordan."). Entries marked "both split together" or always-shared tasks: no rotation. Mop rotation moves the whole mop bundle (mop + forced partner tasks).
- If unsure, use choiceIndex 0.
- Never invent task ids or names not in the payload.`

const SYSTEM_REGENERATE = `${SYSTEM_BASE}

Regenerate request (swap-heavy pool):
- Variants are pre-filtered alternatives that already differ from the rejected split.
- The user wants a clearly different fair split — mention what moved (e.g. mop block, heavy tasks).
- Prefer variants that swap heavy tasks or the mop bundle between A and B while keeping scoreDiff low.
- Index 0 is usually the biggest swap; pick another index only if it clearly improves task-type balance from work history.
- Do NOT repeat the previous assignment, shared-task set, or ice layout.
- Still honor last-together rotation when the swap pool allows; mention rotation in rationale when used.
- If unsure, use choiceIndex 0.`

export type TaskSplitChoiceResult = {
  choiceIndex: number
  rationale: string
  source: 'ai' | 'fallback'
}

function sortedSharedIds(v: TaskSplitVariantPayload): string[] {
  return [...(v.sharedTaskIds || [])].sort()
}

function iceSplitEqual(
  a?: Record<string, { left: string; right: string }>,
  b?: Record<string, { left: string; right: string }>,
): boolean {
  const keysA = Object.keys(a || {}).sort()
  const keysB = Object.keys(b || {}).sort()
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]!
    const sa = a![k]
    const sb = b![k]
    if (!sa || !sb || sa.left !== sb.left || sa.right !== sb.right) return false
  }
  return true
}

function variantsAreEqual(a: TaskSplitVariantPayload, b: TaskSplitVariantPayload): boolean {
  const allKeys = new Set([...Object.keys(a.assignment), ...Object.keys(b.assignment)])
  for (const k of allKeys) {
    if ((a.assignment[k] || '') !== (b.assignment[k] || '')) return false
  }
  if (sortedSharedIds(a).join(',') !== sortedSharedIds(b).join(',')) return false
  if ((a.iceMode || 'whole') !== (b.iceMode || 'whole')) return false
  if (!iceSplitEqual(a.iceSplitAssignment, b.iceSplitAssignment)) return false
  return true
}

function variantDifferenceScore(
  previous: TaskSplitVariantPayload,
  candidate: TaskSplitVariantPayload,
): number {
  const allKeys = new Set([...Object.keys(previous.assignment), ...Object.keys(candidate.assignment)])
  let diff = 0
  for (const k of allKeys) {
    if ((previous.assignment[k] || '') !== (candidate.assignment[k] || '')) diff++
  }
  if (sortedSharedIds(previous).join(',') !== sortedSharedIds(candidate).join(',')) diff += 5
  if ((previous.iceMode || 'whole') !== (candidate.iceMode || 'whole')) diff += 10
  if (!iceSplitEqual(previous.iceSplitAssignment, candidate.iceSplitAssignment)) diff += 10
  return diff
}

function pickMostDifferentVariant(
  variants: TaskSplitVariantPayload[],
  previous: TaskSplitVariantPayload,
): TaskSplitVariantPayload | null {
  let best: TaskSplitVariantPayload | null = null
  let bestScore = -1
  for (const v of variants) {
    if (variantsAreEqual(v, previous)) continue
    const score = variantDifferenceScore(previous, v)
    if (score > bestScore) {
      bestScore = score
      best = v
    }
  }
  return best
}

function clampRationale(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 220)
  const words = t.split(/\s+/).filter(Boolean).slice(0, 28)
  return words.join(' ') || 'Split keeps projected shift scores even.'
}

function parseChoiceJson(raw: string): { choiceIndex: number; rationale: string } | null {
  const trimmed = raw.replace(/^[\s`]+|[\s`]+$/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (typeof o.choiceIndex !== 'number' || !Number.isInteger(o.choiceIndex)) return null
  if (typeof o.rationale !== 'string') return null
  return { choiceIndex: o.choiceIndex, rationale: o.rationale }
}

export async function generateTaskSplitChoice(
  payload: TaskSplitRequestPayload,
  apiKey: string,
): Promise<TaskSplitChoiceResult> {
  const isRegenerate = !!(payload.regenerateRequest && payload.previousSuggestion)
  const lines: string[] = [
    `Window: ${payload.windowKey === '17' ? '5PM' : '9PM'}. Employees: ${payload.employeeA} (column A) and ${payload.employeeB} (column B).`,
    `Deployment: ${payload.deploymentChannel}.`,
  ]
  if (isRegenerate && payload.previousSuggestion) {
    lines.push('')
    lines.push('Previous suggestion (rejected by user — avoid repeating):')
    lines.push(JSON.stringify(payload.previousSuggestion))
    lines.push('')
    lines.push('The user tapped Regenerate. All variants below already differ from the rejected split; pick the best swap-heavy fair option.')
  }
  if (payload.splitRules) {
    lines.push('')
    lines.push('Split rules (informational — variants already obey them; use to ground your rationale):')
    if (payload.splitRules.rulesText) lines.push(payload.splitRules.rulesText)
    if (payload.splitRules.alwaysSharedTaskIds.length) {
      lines.push(`Always-shared candidate ids: ${payload.splitRules.alwaysSharedTaskIds.join(', ')}`)
    }
    if (payload.splitRules.splittableTaskIds.length) {
      lines.push(`Splittable candidate ids: ${payload.splitRules.splittableTaskIds.join(', ')}`)
    }
    if (payload.splitRules.mopCoupling) {
      lines.push(
        `Mop coupling: mopTaskIds=[${payload.splitRules.mopCoupling.mopTaskIds.join(', ')}] (same employee for every mop); withMopper=${payload.splitRules.mopCoupling.forceMopperTaskIds.join(', ') || '(none)'}; forcedOpposite=${payload.splitRules.mopCoupling.forcePartnerTaskIds.join(', ') || '(none)'}.`,
      )
    }
  }
  lines.push(
    '',
    'Work history (for tone only; splits balance THIS window only — past 11AM history must NOT bias your choice):',
    payload.historySummary.slice(0, 6000),
  )
  if (payload.lastTogetherSummary) {
    lines.push(
      '',
      'Last time this pair worked together (same window — use for fair rotation of splittable tasks):',
      payload.lastTogetherSummary.slice(0, 6000),
    )
  }
  lines.push(
    '',
    isRegenerate
      ? 'Variants (swap-heavy regenerate pool — sorted most-different first, rotation as a tiebreak; each has mask, scoreDiff, projectedScoreFloatA/B, assignment, optional sharedTaskIds and iceSplitAssignment):'
      : 'Variants (near-even options PRE-SORTED so lower index = better last-together rotation; index 0 rotates the longest streaks best; each has mask, scoreDiff, projectedScoreFloatA/B, assignment, optional sharedTaskIds and iceSplitAssignment):',
  )
  payload.variants.forEach((v, i) => {
    lines.push(`${i}: ${JSON.stringify(v)}`)
  })
  lines.push('', 'Return JSON: {"choiceIndex": <int>, "rationale": "<string>"}')

  const system = isRegenerate ? SYSTEM_REGENERATE : SYSTEM_BASE

  try {
    const raw = await chatCompletion(apiKey, system, lines.join('\n'), { maxTokens: 180, temperature: 0.65 })
    const parsed = parseChoiceJson(raw)
    if (!parsed) {
      return { choiceIndex: 0, rationale: clampRationale(''), source: 'fallback' }
    }
    const idx = Math.max(0, Math.min(payload.variants.length - 1, parsed.choiceIndex))
    return {
      choiceIndex: idx,
      rationale: clampRationale(parsed.rationale),
      source: 'ai',
    }
  } catch (e) {
    console.error('generateTaskSplitChoice failed:', e)
    return { choiceIndex: 0, rationale: clampRationale(''), source: 'fallback' }
  }
}

export function pickFinalVariant(payload: TaskSplitRequestPayload, choice: TaskSplitChoiceResult): TaskSplitVariantPayload {
  const chosen = payload.variants[choice.choiceIndex] ?? payload.variants[0] ?? payload.deterministicBest
  if (payload.regenerateRequest && payload.previousSuggestion) {
    if (variantsAreEqual(chosen, payload.previousSuggestion)) {
      const alt = pickMostDifferentVariant(payload.variants, payload.previousSuggestion)
      if (alt) return alt
    }
  }
  return chosen
}
