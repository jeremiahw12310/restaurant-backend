import type { WindowKey, TaskCompletion, TaskState, TaskOverrides } from '../services/firestore'

export type ShiftKey = 'day' | 'night'

export type LeaderRow = {
  name: string
  score: number
  shiftsPlayed: number // 0 or 1 for computeShiftLeadersForState; can be >1 when aggregating
}

/**
 * Minimal task shape needed for effective-task computation + weighting.
 * Works with both:
 * - App tasks (`src/types/task.ts`)
 * - Admin task catalog tasks (`src/services/firestore.ts` TaskDef)
 */
export type TaskLike = {
  id: string
  windows: WindowKey[]
  weight?: number
  createdAtMs?: number
  disabledAtMs?: number
}

export type WindowMsFns = {
  windowStartMsForDateKey: (dateKey: string, windowKey: WindowKey) => number
  windowCloseMsForDateKey: (dateKey: string, windowKey: WindowKey) => number
}

// v2.1: Balanced shift scoring - day shift split into 20% 11AM + 80% 5PM
export const BALANCED_SHIFT_SCORING_EFFECTIVE_MS = new Date(2026, 0, 19, 0, 0, 0, 0).getTime()
// v2.1: Daily task points - 5 points bonus for completing daily tasks
export const DAILY_TASK_POINTS_EFFECTIVE_MS = new Date(2026, 0, 19, 0, 0, 0, 0).getTime()
// v2.1: Retroactive fix range - apply new scoring logic to Jan 1-18, 2026
export const RETROACTIVE_FIX_START_MS = new Date(2026, 0, 1, 0, 0, 0, 0).getTime()
export const RETROACTIVE_FIX_END_MS = new Date(2026, 0, 18, 23, 59, 59, 999).getTime()

/**
 * Determine which tasks should be considered "effective" for a given dateKey + window.
 * Mirrors the logic in `App.tsx` (created/disabled timestamps + override effectiveAtMs gating by window close time).
 */
export const getEffectiveTasksByWindowForDateKey = (args: {
  dateKey: string
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
}): Record<WindowKey, TaskLike[]> => {
  const { dateKey, allTasks, taskOverrides, windowMs } = args
  const byWindow: Record<WindowKey, TaskLike[]> = { '11': [], '17': [], '21': [] }

  ;(['11', '17', '21'] as WindowKey[]).forEach((wKey) => {
    const startMs = windowMs.windowStartMsForDateKey(dateKey, wKey)
    const closeMs = windowMs.windowCloseMsForDateKey(dateKey, wKey)

    byWindow[wKey] = (allTasks || []).filter((t) => {
      // Allow admin overrides to move tasks between windows without affecting history.
      // Overrides only apply to windows whose close time is >= the override effective timestamp.
      const o = taskOverrides?.overrides?.[t.id]
      const overrideWindows = o?.windows
      const overrideAt = o?.windowsEffectiveAtMs
      const windows =
        Array.isArray(overrideWindows) && (typeof overrideAt !== 'number' || overrideAt <= closeMs)
          ? overrideWindows
          : t.windows
      if (!windows?.includes(wKey)) return false

      const createdAtMs = t.createdAtMs ?? 0
      const disabledAtMs = t.disabledAtMs
      // A task should apply to this window if it was created strictly before the window closes.
      // This allows mid-window adds without retroactively affecting earlier windows the same day.
      if (createdAtMs >= closeMs) return false
      if (typeof disabledAtMs === 'number' && disabledAtMs <= startMs) return false
      return true
    })
  })

  return byWindow
}

export const getWeightsForDateKey = (args: {
  dateKey: string
  allTasks: TaskLike[]
  taskOverrides: TaskOverrides | null | undefined
  windowMs: WindowMsFns
}): {
  windowTaskWeights: Record<WindowKey, number>
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
  taskIdsByWindow: Record<WindowKey, string[]>
} => {
  const { dateKey, allTasks, taskOverrides, windowMs } = args
  const effective = getEffectiveTasksByWindowForDateKey({ dateKey, allTasks, taskOverrides, windowMs })
  const windowTaskWeights: Record<WindowKey, number> = { '11': 0, '17': 0, '21': 0 }
  const taskWeightByIdByWindow: Record<WindowKey, Record<string, number>> = { '11': {}, '17': {}, '21': {} }
  const taskIdsByWindow: Record<WindowKey, string[]> = { '11': [], '17': [], '21': [] }

  ;(['11', '17', '21'] as WindowKey[]).forEach((wKey) => {
    const tasks = effective[wKey] || []
    const closeMs = windowMs.windowCloseMsForDateKey(dateKey, wKey)
    taskIdsByWindow[wKey] = tasks.map((t) => t.id)
    tasks.forEach((t) => {
      let wt = t.weight ?? 1
      const o = taskOverrides?.overrides?.[t.id]
      if (o && typeof o.weight === 'number') {
        const effAt = o.weightEffectiveAtMs
        if (typeof effAt !== 'number' || effAt <= closeMs) wt = o.weight
      }
      if (!Number.isFinite(wt)) wt = 1
      if (wt < 0) wt = 0
      taskWeightByIdByWindow[wKey][t.id] = wt
      windowTaskWeights[wKey] = (windowTaskWeights[wKey] ?? 0) + wt
    })
  })

  return { taskWeightByIdByWindow, windowTaskWeights, taskIdsByWindow }
}

/**
 * Canonical shift scoring (ported from `App.tsx`).
 *
 * Returns a row for anyone who earned credit (including autoAssigned credit), and marks
 * `shiftsPlayed` only when the person had non-autoAssigned participation (with the
 * yum-yum-only night shift exception).
 */
export const computeShiftLeadersForState = (
  state: TaskState,
  dateKey: string,
  shift: ShiftKey,
  SHIFT_WINDOWS: Record<ShiftKey, WindowKey[]>,
  windowTaskWeights: Record<WindowKey, number>,
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
): LeaderRow[] => {
  const dateMap = state[dateKey]
  if (!dateMap) return []

  // v2.1: Check if this date uses balanced scoring (calculate once, reuse)
  const dateMs = new Date(`${dateKey}T00:00:00`).getTime()
  const isInRetroactiveRange = dateMs >= RETROACTIVE_FIX_START_MS && dateMs <= RETROACTIVE_FIX_END_MS
  const useBalancedScoring = dateMs >= BALANCED_SHIFT_SCORING_EFFECTIVE_MS || isInRetroactiveRange
  const useDailyTaskPoints = dateMs >= DAILY_TASK_POINTS_EFFECTIVE_MS || isInRetroactiveRange

  // Deferred-to-close support:
  // Some 5PM ('17') tasks are auto-completed but should be scored at close (9/10PM).
  // We implement this purely in scoring so historical task sets remain stable.
  const deferredFrom17: Array<{ taskId: string; completion: TaskCompletion; weight: number }> = []
  let deferredWeightTotal17 = 0
  try {
    const w17 = dateMap['17'] || {}
    Object.keys(w17).forEach((taskId) => {
      const c = w17[taskId]
      if (!c?.deferredToClose) return
      const wt17 = taskWeightByIdByWindow['17']?.[taskId] ?? 0
      if (wt17 <= 0) return
      deferredFrom17.push({ taskId, completion: c, weight: wt17 })
      deferredWeightTotal17 += wt17
    })
  } catch {
    // ignore
  }

  // Keep raw per-window points as floats (0..100) and only round at the final displayed score.
  // This avoids double-rounding (e.g. rounding 11AM/5PM separately and then combining).
  const pointsByWindow: Record<WindowKey, Record<string, number>> = { '11': {}, '17': {}, '21': {} }
  const creditsByWindow: Record<WindowKey, Record<string, number>> = { '11': {}, '17': {}, '21': {} }
  // Participation should exclude autoAssigned completions (yum-yum credit), so we don't
  // count "ghost shifts" that only exist due to auto-assigned points.
  const participationCreditsByWindow: Record<WindowKey, Record<string, number>> = { '11': {}, '17': {}, '21': {} }
  // Track which tasks each person completed per window (used for yum-yum-only night shift exclusion)
  const tasksByPersonByWindow: Record<WindowKey, Record<string, Set<string>>> = { '11': {}, '17': {}, '21': {} }

  SHIFT_WINDOWS[shift].forEach((wKey) => {
    // Adjust denominator when deferred tasks shift between 5PM and close-time scoring.
    let totalWeight = windowTaskWeights[wKey] || 0
    if (shift === 'day' && wKey === '17') totalWeight = Math.max(0, totalWeight - deferredWeightTotal17)
    if (shift === 'night' && wKey === '21') totalWeight = totalWeight + deferredWeightTotal17
    
    // v2.1 (Jan 19, 2026+): Exclude autoAssigned optional tasks from totalWeight
    // so remaining tasks can still reach 100 points when optional tasks aren't needed.
    // Note: If manually assigned, these tasks count normally (autoAssigned === false/undefined).
    if (useBalancedScoring) {
      const windowMap = dateMap[wKey] || {}
      
      // Check for autoAssigned yum-yum-close (can appear in 5PM or 9PM windows)
      const yumYumCompletion = windowMap['yum-yum-close']
      if (yumYumCompletion?.autoAssigned === true) {
        const yumYumWeight = taskWeightByIdByWindow[wKey]?.['yum-yum-close'] ?? 0
        totalWeight = Math.max(0, totalWeight - yumYumWeight)
      }
      
      // Check for autoAssigned peanuts-noodles-close (only in 9PM window)
      if (wKey === '21') {
        const peanutsCompletion = windowMap['peanuts-noodles-close']
        if (peanutsCompletion?.autoAssigned === true) {
          const peanutsWeight = taskWeightByIdByWindow[wKey]?.['peanuts-noodles-close'] ?? 0
          totalWeight = Math.max(0, totalWeight - peanutsWeight)
        }
      }
    }
    
    if (!totalWeight) return

    const windowMap = dateMap[wKey] || {}
    const creditsAll: Record<string, number> = {}
    const creditsParticipation: Record<string, number> = {}

    // Track which tasks each person completed (for yum-yum-only night shift logic)
    const tasksByPerson: Record<string, Set<string>> = {}

    const applyCredits = (taskId: string, completion: TaskCompletion | undefined, taskWeight: number) => {
      if (!completion) return
      // Leaderboard: late completions do NOT count for points
      if (completion.completedLate && !completion.lateForgiven) return
      const assignees = completion.assignees || []
      if (!assignees.length) return
      if (taskWeight <= 0) return

      // Combined Ice (Left + Right): credit each side as half the total weight.
      // This preserves legacy behavior where Left and Right were separate tasks (1.2 + 1.2).
      // Note: Ice tasks do NOT count toward shift participation (same as yum-yum, peanuts-noodles)
      // to prevent accidental leaderboard impact from "I didn't need to fill" misclicks.
      if (
        (taskId === 'ice-5pm' || taskId === 'ice-close') &&
        completion.iceSides &&
        typeof completion.iceSides.left === 'string' &&
        typeof completion.iceSides.right === 'string'
      ) {
        const a = String(completion.iceSides.left || '').trim()
        const b = String(completion.iceSides.right || '').trim()
        if (!a || !b) return
        const perSide = taskWeight / 2
        ;[a, b].forEach((name) => {
          if (!name) return
          creditsAll[name] = (creditsAll[name] || 0) + perSide
          // Ice tasks excluded from shift participation (prevents accidental leaderboard impact)
        })
        return
      }

      // Split Towels (Dining/Bar + Bowl Station): credit each side as half the total weight.
      // Towels count for shift participation (unlike ice).
      if (
        (taskId === 'towels-5pm' || taskId === 'towels-close') &&
        completion.towelSides &&
        typeof completion.towelSides.diningBar === 'string' &&
        typeof completion.towelSides.bowlStation === 'string'
      ) {
        const a = String(completion.towelSides.diningBar || '').trim()
        const b = String(completion.towelSides.bowlStation || '').trim()
        if (!a || !b) return
        const perSide = taskWeight / 2
        ;[a, b].forEach((name) => {
          if (!name) return
          creditsAll[name] = (creditsAll[name] || 0) + perSide
          if (!completion.autoAssigned) {
            creditsParticipation[name] = (creditsParticipation[name] || 0) + perSide
            if (!tasksByPerson[name]) tasksByPerson[name] = new Set()
            tasksByPerson[name].add(taskId)
          }
        })
        return
      }

      // Order Report: split proportional to entered order counts (2-person task).
      if (
        (taskId === 'order-report-5pm' || taskId === 'order-report-close') &&
        assignees.length === 2 &&
        completion.orderReportCounts
      ) {
        const a = (assignees[0] || '').trim()
        const b = (assignees[1] || '').trim()
        let ca = typeof completion.orderReportCounts[a] === 'number' ? Math.max(0, completion.orderReportCounts[a] as number) : 0
        let cb = typeof completion.orderReportCounts[b] === 'number' ? Math.max(0, completion.orderReportCounts[b] as number) : 0

        // If someone appears on both 5PM and Close Order Reports, we want Close to represent
        // "orders since 5PM" so the night-only employee isn't penalized by an all-day total.
        // We implement this in scoring so staff can simply enter the full-day totals at Close.
        if (taskId === 'order-report-close') {
          const fivePm = dateMap?.['17']?.['order-report-5pm']
          const fiveCounts = fivePm?.orderReportCounts
          if (fiveCounts && typeof fiveCounts === 'object') {
            const fiveA = typeof (fiveCounts as Record<string, unknown>)[a] === 'number' ? (fiveCounts as Record<string, number>)[a] : null
            const fiveB = typeof (fiveCounts as Record<string, unknown>)[b] === 'number' ? (fiveCounts as Record<string, number>)[b] : null
            if (typeof fiveA === 'number' && Number.isFinite(fiveA)) ca = Math.max(0, ca - Math.max(0, fiveA))
            if (typeof fiveB === 'number' && Number.isFinite(fiveB)) cb = Math.max(0, cb - Math.max(0, fiveB))
          }
        }
        const sum = ca + cb
        const shareA = sum > 0 ? ca / sum : 0.5
        const shareB = sum > 0 ? cb / sum : 0.5

        ;[
          [a, shareA],
          [b, shareB],
        ].forEach(([name, share]) => {
          if (!name) return
          const sh = typeof share === 'number' ? share : 0
          creditsAll[name as string] = (creditsAll[name as string] || 0) + taskWeight * sh
          if (!completion.autoAssigned) {
            creditsParticipation[name as string] = (creditsParticipation[name as string] || 0) + taskWeight * sh
            if (!tasksByPerson[name as string]) tasksByPerson[name as string] = new Set()
            tasksByPerson[name as string].add(taskId)
          }
        })
        return
      }

      // Default: equal split across assignees
      const share = 1 / assignees.length
      // Tasks with "I didn't need to fill" buttons should never count toward shift participation
      // (prevents accidental leaderboard impact when users click employee name instead of auto-assign button)
      const noShiftParticipationTasks = ['yum-yum-close', 'ice-5pm', 'ice-close', 'peanuts-noodles-close']
      assignees.forEach((name) => {
        creditsAll[name] = (creditsAll[name] || 0) + taskWeight * share
        if (!completion.autoAssigned && !noShiftParticipationTasks.includes(taskId)) {
          creditsParticipation[name] = (creditsParticipation[name] || 0) + taskWeight * share
          if (!tasksByPerson[name]) tasksByPerson[name] = new Set()
          tasksByPerson[name].add(taskId)
        }
      })
    }

    Object.keys(windowMap).forEach((taskId) => {
      const completion = windowMap[taskId]

      // Day scoring should not count tasks deferred to close (and denominator already adjusted).
      if (shift === 'day' && wKey === '17' && completion?.deferredToClose) return

      // v2.1 (Jan 19, 2026+): Skip autoAssigned optional tasks from credit calculation
      // since we already excluded their weights from totalWeight (they represent "didn't need to fill")
      if (useBalancedScoring && completion?.autoAssigned === true) {
        if (taskId === 'yum-yum-close' || taskId === 'peanuts-noodles-close') {
          return
        }
      }

      // Daily tasks are handled separately as bonus points, skip from regular credit calculation
      if (taskId === 'daily-task') return

      // Only score tasks that are part of the effective task set for this date/window.
      // This prevents newly added tasks from affecting historical dates/windows.
      const taskWeight = taskWeightByIdByWindow[wKey]?.[taskId] ?? 0
      applyCredits(taskId, completion, taskWeight)
    })

    // Night scoring: also include 5PM tasks deferred to close, using their 5PM weights.
    if (shift === 'night' && wKey === '21' && deferredFrom17.length) {
      deferredFrom17.forEach(({ taskId, completion, weight }) => {
        applyCredits(taskId, completion, weight)
      })
    }

    // Save raw credits and window points (0–100) for anyone who earned non-zero credit.
    Object.keys(creditsAll).forEach((name) => {
      const credit = creditsAll[name] || 0
      if (credit <= 0) return
      creditsByWindow[wKey][name] = credit
      const points = (credit / totalWeight) * 100
      pointsByWindow[wKey][name] = Math.max(0, Math.min(100, points))
    })

    // Daily task bonus: Add as flat 5 points (split evenly) AFTER window points calculation
    // Also count toward shift participation
    if (useDailyTaskPoints && (wKey === '17' || wKey === '21')) {
      const dailyTaskCompletion = windowMap['daily-task']
      if (dailyTaskCompletion) {
        const assignees = dailyTaskCompletion.assignees || []
        if (assignees.length > 0) {
          const perPerson = 5.0 / assignees.length
          assignees.forEach((name) => {
            if (name) {
              const currentPoints = pointsByWindow[wKey][name] || 0
              // Add bonus points and cap at 100
              pointsByWindow[wKey][name] = Math.max(0, Math.min(100, currentPoints + perPerson))
              
              // Also add to participation credits so daily tasks count toward shift participation
              if (!participationCreditsByWindow[wKey][name]) {
                participationCreditsByWindow[wKey][name] = 0
              }
              participationCreditsByWindow[wKey][name] += perPerson
              if (!tasksByPersonByWindow[wKey][name]) {
                tasksByPersonByWindow[wKey][name] = new Set()
              }
              tasksByPersonByWindow[wKey][name].add('daily-task')
            }
          })
        }
      }
    }

    // Save participation credits (non-autoAssigned only).
    Object.keys(creditsParticipation).forEach((name) => {
      const credit = creditsParticipation[name] || 0
      if (credit <= 0) return
      participationCreditsByWindow[wKey][name] = credit
    })

    // Save which tasks each person completed in this window
    tasksByPersonByWindow[wKey] = tasksByPerson
  })

  // Fairness notes for your staffing model:
  // v2.1 (Jan 19, 2026+): Day shift is split 20% 11AM + 80% 5PM = 100 max
  // Legacy: 11AM was a bonus (up to +16 points) on top of 5PM score
  // - Day shift includes 11AM + 5PM windows, but 11AM tasks are minor and done by the same person
  //   who also works 5PM. We treat 11AM as a small bonus so it can't dominate day-shift ranking.
  // - Night shift is 9PM only.
  const AM_BONUS_WEIGHT = 0.16 // legacy: 11AM adds up to +16 bonus points
  const AM_SPLIT_WEIGHT = 0.20 // v2.1: 11AM is 20% of day shift
  const PM_SPLIT_WEIGHT = 0.80 // v2.1: 5PM is 80% of day shift

  // Anyone with points should appear in the scoring rows (including autoAssigned bonus points).
  const names: Record<string, true> = {}
  SHIFT_WINDOWS[shift].forEach((w) => {
    Object.keys(creditsByWindow[w]).forEach((n) => {
      names[n] = true
    })
  })

  // A person "played" the shift only if they earned any non-autoAssigned credit
  // in at least one window in that shift.
  // EXCEPTION: For night shift, if someone ONLY completed yum-yum-close, they shouldn't be
  // counted as having played the shift (they just helped with yum yum sauce via split selection).
  const played: Record<string, true> = {}
  SHIFT_WINDOWS[shift].forEach((w) => {
    Object.keys(participationCreditsByWindow[w]).forEach((n) => {
      // For night shift, check if this person only did yum-yum-close
      if (shift === 'night' && w === '21') {
        const tasksCompleted = tasksByPersonByWindow['21'][n]
        // If they only completed yum-yum-close, don't count as playing the shift
        if (tasksCompleted && tasksCompleted.size === 1 && tasksCompleted.has('yum-yum-close')) {
          return // Skip - don't mark as played
        }
      }
      played[n] = true
    })
  })

  const rows: LeaderRow[] = []
  Object.keys(names).forEach((name) => {
    const playedThisShift = !!played[name]
    if (shift === 'night') {
      const points21 = pointsByWindow['21'][name] ?? 0
      rows.push({ name, score: Math.max(0, Math.min(100, Math.round(points21))), shiftsPlayed: playedThisShift ? 1 : 0 })
      return
    }

    // day shift
    const points17 = pointsByWindow['17'][name] ?? 0
    const points11 = pointsByWindow['11'][name] ?? 0
    const totalFloat = useBalancedScoring
      ? (points17 * PM_SPLIT_WEIGHT) + (points11 * AM_SPLIT_WEIGHT)
      : points17 + AM_BONUS_WEIGHT * points11
    const total = Math.max(0, Math.min(100, Math.round(totalFloat)))
    rows.push({ name, score: total, shiftsPlayed: playedThisShift ? 1 : 0 })
  })

  // Deterministic ordering for ties (important for the Shift HUD top-2 selection).
  return rows.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name))
}

// Compute full day leaders (combines day and night shifts, averaging scores)
export const computeFullDayLeadersForState = (
  state: TaskState,
  dateKey: string,
  SHIFT_WINDOWS: Record<ShiftKey, WindowKey[]>,
  windowTaskWeights: Record<WindowKey, number>,
  taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
): LeaderRow[] => {
  // Get scores for both shifts
  const dayLeaders = computeShiftLeadersForState(state, dateKey, 'day', SHIFT_WINDOWS, windowTaskWeights, taskWeightByIdByWindow)
  const nightLeaders = computeShiftLeadersForState(state, dateKey, 'night', SHIFT_WINDOWS, windowTaskWeights, taskWeightByIdByWindow)

  // Build map by person name
  const byName: Record<string, { dayScore?: number; nightScore?: number; shifts: number }> = {}

  dayLeaders.forEach((row) => {
    // Only count "real" participation as working a shift.
    if (!row.shiftsPlayed) return
    if (!byName[row.name]) byName[row.name] = { shifts: 0 }
    byName[row.name].dayScore = row.score
    byName[row.name].shifts += row.shiftsPlayed
  })

  nightLeaders.forEach((row) => {
    // Only count "real" participation as working a shift.
    if (!row.shiftsPlayed) return
    if (!byName[row.name]) byName[row.name] = { shifts: 0 }
    byName[row.name].nightScore = row.score
    byName[row.name].shifts += row.shiftsPlayed
  })

  // Calculate final scores (average if worked both shifts, otherwise use single shift)
  const rows: LeaderRow[] = Object.keys(byName).map((name) => {
    const data = byName[name]
    const scores = [data.dayScore, data.nightScore].filter((s) => s !== undefined) as number[]
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length
    return {
      name,
      score: Math.round(avgScore),
      shiftsPlayed: data.shifts,
    }
  })

  return rows.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name))
}

