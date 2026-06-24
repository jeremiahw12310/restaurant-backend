import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal, flushSync } from 'react-dom'
import './App.css'
import './AppV3.css'
import { DEFAULT_SOLAR_COORDS, getTimeOfDaySolar, type TimeOfDay } from './solarTimeOfDay'
import { markIntentionalReload, recordLastUserAction } from './utils/reloadForensics'
import traqLogoUrl from './assets/tasklogo.png'
import poweredByUrl from './assets/biglogo.png'
import { 
  getEmployeeRoster,
  saveEmployees, 
  subscribeToEmployeeRoster,
  subscribeToEmployeeColors,
  getEmployeeColors,
  saveEmployeeColor,
  removeEmployeeColor,
  getTaskOrder,
  getTaskOrderV3,
  saveTaskOrder,
  subscribeToTaskOrder,
  subscribeToTaskOrderV3,
  getTaskStages,
  saveTaskStages,
  subscribeToTaskStages,
  type TaskStageMap,
  getTaskCatalog,
  saveTaskCatalog,
  subscribeToTaskCatalog,
  getTaskOverrides,
  saveTaskOverrides,
  subscribeToTaskOverrides,
  getDailyTaskCatalog,
  saveDailyTaskCatalog,
  subscribeToDailyTaskCatalog,
  getDailyTaskRun,
  subscribeToDailyTaskRun,
  upsertDailyTaskRun,
  adminRecloseDailyTaskRun,
  adminPatchDailyTaskRunHistory,
  getDailyTaskWeek,
  upsertDailyTaskWeek,
  listDailyTaskRunsInRange,
  subscribeToDailyTaskWeek,
  subscribeToRecentTaskCompletions,
  subscribeToTaskCompletionsForWindow,
  completeTaskIfAvailable,
  adminSetTaskCompletion,
  adminClearTaskCompletion,
  migrateLegacyTaskStateV1ToV2,
  subscribeToBreakSelection,
  saveBreakSelection,
  subscribeToSoloMode,
  saveSoloMode,
  subscribeToForceRefresh,
  triggerForceRefresh,
  saveNightShiftReport,
  dismissNightShiftReport,
  subscribeToNightShiftReports,
  subscribeToAvailability,
  saveAvailabilityState,
  subscribeToTimeOffRequests,
  createTimeOffRequest,
  updateTimeOffRequest,
  setTimeOffRequestStatus,
  deleteTimeOffRequest,
  subscribeToStockReports,
  createStockReport,
  setStockReportStatus,
  deleteStockReport,
  createManagementReport,
  subscribeToManagementReports,
  setManagementReportStatus,
  deleteManagementReport,
  createDefaultWeeklyAvailability,
  subscribeToNotifications,
  createNotification,
  dismissNotificationForEmployee,
  subscribeToPrintRequest,
  dismissPrintRequest,
  setNotificationActive,
  deleteNotification,
  getPendingNotificationsForEmployee,
  subscribeToAdminLoginAttempts,
  appendSelectionLogEntry,
  type AdminLoginAttempt,
  type CompleteTaskArgs,
  type WindowKey,
  type TaskState,
  type BreakSelection,
  type BreakSlot,
  type BreakShiftType,
  type SoloMode,
  type NightShiftReport,
  type DayOfWeek,
  type WeeklyAvailability,
  type AvailabilityState,
  type TimeOffRequest,
  isTimeOffVisibleOnPublicList,
  getTimeOffPublicListVisibilityDebug,
  type RequestedShift,
  type ShiftType,
  type StockReport,
  type StockReportKind,
  type ManagementReport,
  type ManagementReportStatus,
  type NotificationDoc,
  type PrintRequestDoc,
  type TaskCatalog,
  type TaskDef,
  type TaskOverrides,
  type TaskOverride,
  type EmployeeColors,
  type DailyTaskCatalog,
  type DailyTaskDef,
  type DailyTaskRun,
  type DailyTaskWeek,
  subscribeFairSplitContract,
  setFairSplitContract,
  deleteFairSplitContract,
  readFairSplitContractLocalCache,
  clearFairSplitContractLocalCache,
  type FairSplitContractDoc,
  subscribeTrainingWindow,
  setTrainingWindow,
  deleteTrainingWindow,
  subscribeTrainingWindowsInRange,
} from './services/firestore'
import { sendStockReportEmailNotification } from './services/stockEmail'
import { TimeOffShiftDetailList } from './components/TimeOffShiftDetailList'
import { formatTimeOffNotificationBody, formatTimeOffSummaryLine } from './utils/timeOffDisplay'
import { createNewDailyTaskId, resolveDailyTaskDefFromCatalog } from './utils/dailyTaskCatalog'
import {
  formatDailyTaskRunCompletedBy,
  getDailyTaskRunHistoryTitle,
  NO_TASK_DAILY_RUN_LABEL,
} from './utils/dailyTaskRunDisplay'
import {
  addDaysToDateKey,
  buildMergedRecencyMap,
  DAILY_TASK_WEEK_GENERATOR_VERSION,
  DAILY_TASK_WEEK_GENERATOR_VERSION_AI,
  enumerateWeekStartDateKeysInclusive,
  generateDailyTaskWeek,
  getWeekStartDateKeySunday,
  type DailyWeekGenResult,
} from './utils/dailyTaskWeekGenerator'
import { isDailyTaskSchedulable } from './utils/dailyTaskArchive'
import { applyEmployeeAvailabilityUpdate } from './utils/availabilityEffective'
import { DAY_OF_WEEK_KEYS, DAY_OF_WEEK_LABELS, getDayOfWeekKey } from './utils/dayOfWeek'
import {
  approvalStatusLabel,
  createOverrideDayEntry,
  getDayApprovalStatus,
  isDayVisibleToPlayers,
  parseWeekDayEntry,
} from './utils/dailyTaskApproval'
import {
  filterEmployeesForLeaderboardMonth,
  getActiveEmployees,
  type EmployeeArchiveMap,
} from './utils/employeeRoster'
import { fetchValidatedWeeklyPlacements } from './services/dailyTaskScheduleAi'
import {
  getCachedDailyTaskScheduleSystemPrompt,
  subscribeToDailyTaskScheduleAiSettings,
} from './services/dailyTaskScheduleAiSettings'
import { getFirebaseStatus, storage } from './firebase'
import {
  deleteMusicTrack,
  MUSIC_CONTROL_LOG_EVENT,
  saveMusicPlaylist,
  subscribeToMusicControlLogs,
  sendSessionCommandQueuedREST,
  fetchLatestMusicSessionsREST,
  subscribeToMusicPlaylist,
  subscribeToMusicTracks,
  upsertMusicTrack,
  type MusicControlLogEntry,
  type MusicPlaylist,
  type MusicSession,
  type MusicTrack,
} from './services/music'
import {
  appendGoodMorningLog,
  clearGoodMorningSession,
  getDeviceInfo as getGoodMorningDeviceInfo,
  getOrCreateGoodMorningSessionId,
  isPastTenAmLocal,
  readGoodMorningLocal,
  subscribeToGoodMorningConfig,
  upsertGoodMorningSession,
  writeGoodMorningLocal,
  type GoodMorningLocalState,
} from './services/goodMorning'
import {
  subscribeToApplications,
  updateApplicationStatus,
  updateApplicationNotes,
  deleteApplication,
  SHIFT_LABELS,
  type Application,
  type ApplicationStatus,
  type ShiftKey,
} from './services/applications'
import {
  computeFullDayLeadersForState as computeFullDayLeadersForStateShared,
  computeShiftLeadersForState as computeShiftLeadersForStateShared,
  getEffectiveTasksByWindowForDateKey as getEffectiveTasksByWindowForDateKeyShared,
  getWeightsForDateKey as getWeightsForDateKeyShared,
  DAILY_TASK_POINTS_EFFECTIVE_MS,
  SEPARATE_DAY_AM_PM_LEADERBOARD_EFFECTIVE_MS,
  computeShiftScoringCore,
} from './utils/taskScoring'
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { MusicPlayerSwitcher } from './components/MusicPlayerSwitcher.tsx'

/** Lazy-loaded on first print — keeps pdfjs off the iPad cold-start parse path. */
const loadPdfJs = async () => {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  return pdfjsLib
}
import { HeaderClock } from './components/HeaderClock'
import { CalculatorOverlay } from './components/CalculatorOverlay.tsx'
import { Screensaver, type ScreensaverCountdown } from './components/Screensaver.tsx'
import { OrderReportOverlay } from './components/OrderReportOverlay.tsx'
import { TaskSplitSuggestPanel } from './components/TaskSplitSuggestPanel'
import {
  buildTaskSplitRequestPayload,
  buildWorkHistorySummary,
  submitTaskSplitRequest,
  suggestResultToVariant,
  type TaskSplitSuggestResult,
  type TaskSplitSuggestWindowKey,
  buildFairSplitContractDocument,
  fairSplitContractToSuggestResult,
  resolveTaskSplitPanelRestore,
} from './services/taskSplitSuggestAi'
import { getSplitWindowEffectiveTaskIds, isTaskDoneForSplit } from './utils/taskSplitPartition'
import {
  buildLastTogetherSummaryForSplit,
  computeSplitTogetherStreak,
  computeTogetherStreak,
  findLastTogetherCompleter,
  findSharedShiftDates,
} from './utils/lastTogetherHistory'
import { fairSplitPreviewWindowPoints, readWindowPointForEmployee } from './utils/fairSplitScoring'
import { isDiceEnabledForChannel } from './utils/diceVisibility'
import type { TaskLike } from './utils/taskScoring'

function shuffleInPlaceTaskSplitVariants<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

type TaskSplitInlinePhase = 'loading' | 'active'
import { DailyTaskTeaserCard } from './components/DailyTaskTeaserCard'
import { DailyTaskModal } from './components/DailyTaskModal'
import { TaskCard } from './components/TaskCard'
import { StockCheckModal } from './components/StockCheckModal'
import { StockItemBubble } from './components/StockItemBubble'
import { StockPendingReportList } from './components/StockPendingReportList'
import { countOutPending } from './components/stockReportHelpers'
import { fetchShiftQuote, isAiBackedShiftQuote, onLateQuoteUpdate, type ShiftQuoteContext, type ShiftQuoteResponse } from './services/shiftQuotes'
import {
  buildWindowCompleteMessageContext,
  fetchWindowCompleteMessage,
  onLateWindowCompleteMessage,
} from './services/windowCompleteAi'
import {
  WindowCompleteCelebration,
  type WindowCompleteCelebrationPhase,
  type WindowCompleteCelebrationViewModel,
} from './components/WindowCompleteCelebration'
import type { EffectiveStatus, Task, TaskCompletion } from './types/task'
import { TASKS, ICE_COMBINED_CREATED_AT_MS } from './constants/tasks'

type WindowConfig = {
  key: WindowKey
  label: string
  start: string
  lateAfter: string
  unlocksAt?: string
}

type SelectionLogEntry = {
  ts: string // ISO timestamp
  action: 'selected' | 'cleared'
  taskId: string
  taskName: string
  window: WindowKey
  dateKey: string
  assignees: string[]
  byAdmin: boolean
}

type LeaderRow = {
  name: string
  score: number
  /** Mirrors `taskScoring` — unrounded 0–100 for early small credits. */
  scoreFloat?: number
  shiftsPlayed: number
  /** v2.2 day-shift only (post-{@link SEPARATE_DAY_AM_PM_LEADERBOARD_EFFECTIVE_MS}): standalone 11AM 0–100 for the HUD. */
  dayAmScore?: number
  /** Pre-round counterpart to {@link dayAmScore}. */
  dayAmScoreFloat?: number
}

/** Display score: small positive credits (&lt; 1 pt) show one decimal so ice-first completions aren’t hidden. */
function shiftHudDisplayScore(r: { score: number; scoreFloat?: number }): number {
  const f = typeof r.scoreFloat === 'number' ? r.scoreFloat : r.score
  if (f > 0 && f < 1) return Math.round(f * 10) / 10
  return Math.round(Math.min(100, Math.max(0, f)))
}

/** Same rounding rule for the standalone 11AM number (day shift only, post-cutover). */
function shiftHudAmDisplayScore(r: { dayAmScore?: number; dayAmScoreFloat?: number }): number {
  const f = typeof r.dayAmScoreFloat === 'number' ? r.dayAmScoreFloat : (r.dayAmScore ?? 0)
  if (f > 0 && f < 1) return Math.round(f * 10) / 10
  return Math.round(Math.min(100, Math.max(0, f)))
}

/** Shift HUD cell text during count-up override: at most one decimal (avoids 2.0000000004-style float noise). */
function shiftHudPointsCell(
  override: number | null,
  row: { score: number; scoreFloat?: number } | undefined,
): string {
  if (override != null) {
    if (!Number.isFinite(override)) return '—'
    const s = override.toFixed(1)
    return s.endsWith('.0') ? s.slice(0, -2) : s
  }
  if (!row) return '—'
  return String(shiftHudDisplayScore(row))
}

function shiftHudScoreForCelebration(r: { score: number; scoreFloat?: number } | undefined): number {
  if (!r) return 0
  return typeof r.scoreFloat === 'number' ? r.scoreFloat : r.score
}

/** True if the row has any HUD-visible credit (5PM or, post-cutover, standalone 11AM). */
function shiftHudHasAnyPoints(
  r: { score: number; scoreFloat?: number; dayAmScore?: number; dayAmScoreFloat?: number } | undefined,
): boolean {
  if (!r) return false
  if (shiftHudScoreForCelebration(r) > 0) return true
  const am = typeof r.dayAmScoreFloat === 'number' ? r.dayAmScoreFloat : (r.dayAmScore ?? 0)
  return am > 0
}

/** Active split pair for HUD slot pinning (panel open on 5PM/9PM only). */
function resolveActiveSplitHudPair(args: {
  phase: 'loading' | 'active' | null
  windowKey: WindowKey
  empA: string
  empB: string
  contract: FairSplitContractDoc | null
}): [string, string] | null {
  if (args.phase === null) return null
  if (args.windowKey !== '17' && args.windowKey !== '21') return null
  const fromContractA = (args.contract?.employeeA || '').trim()
  const fromContractB = (args.contract?.employeeB || '').trim()
  const a = fromContractA || (args.empA || '').trim()
  const b = fromContractB || (args.empB || '').trim()
  if (!a || !b || a === b) return null
  return [a, b]
}

function shiftHudLeaderOrStub(allLeaders: LeaderRow[], name: string): LeaderRow | undefined {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  return allLeaders.find((r) => r.name === trimmed) ?? { name: trimmed, score: 0, shiftsPlayed: 0 }
}

/** Map split pair + leader rows -> fixed p1/p2 + extra count. */
function resolveShiftHudDisplaySlots(args: {
  played: LeaderRow[]
  allLeaders: LeaderRow[]
  splitPair: [string, string] | null
}): { p1: LeaderRow | undefined; p2: LeaderRow | undefined; extra: number } {
  if (!args.splitPair) {
    return {
      p1: args.played[0],
      p2: args.played[1],
      extra: Math.max(0, args.played.length - 2),
    }
  }
  const [empA, empB] = args.splitPair
  const p1 = shiftHudLeaderOrStub(args.allLeaders, empA)
  const p2 = shiftHudLeaderOrStub(args.allLeaders, empB)
  const extra = args.played.filter((r) => r.name !== empA && r.name !== empB).length
  return { p1, p2, extra }
}

/** Celebration slot lookup: split-pinned when panel open, else score-ranked. */
function shiftHudCelebrationSlotForName(
  name: string,
  afterRows: LeaderRow[],
  splitPair: [string, string] | null,
): 'p1' | 'p2' | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (splitPair) {
    if (trimmed === splitPair[0]) return 'p1'
    if (trimmed === splitPair[1]) return 'p2'
    return null
  }
  const afterPlayed = afterRows.filter((r) => shiftHudHasAnyPoints(r))
  if (afterPlayed[0]?.name === trimmed) return 'p1'
  if (afterPlayed[1]?.name === trimmed) return 'p2'
  return null
}

/** Derive p1/p2 leader rows for dual-sided celebrations (order report). */
function shiftHudCelebrationPairRows(
  afterRows: LeaderRow[],
  splitPair: [string, string] | null,
): { p1: LeaderRow | undefined; p2: LeaderRow | undefined } {
  if (splitPair) {
    return {
      p1: shiftHudLeaderOrStub(afterRows, splitPair[0]),
      p2: shiftHudLeaderOrStub(afterRows, splitPair[1]),
    }
  }
  return { p1: afterRows[0], p2: afterRows[1] }
}

const SPEAKER_QUOTES: ReadonlyArray<{ speaker: string; quote: string }> = [
  { speaker: 'Maya Angelou', quote: 'Nothing will work unless you do.' },
  { speaker: 'Vince Lombardi', quote: 'The only place success comes before work is in the dictionary.' },
  { speaker: 'Helen Keller', quote: 'Alone we can do so little; together we can do so much.' },
  { speaker: 'Walt Disney', quote: 'The way to get started is to quit talking and begin doing.' },
  { speaker: 'Winston Churchill', quote: 'Success is not final, failure is not fatal — it is the courage to continue that counts.' },
  { speaker: 'Nelson Mandela', quote: 'It always seems impossible until it is done.' },
  { speaker: 'Fred Rogers', quote: 'You rarely have time for everything you want in this life, so you need to make choices.' },
  { speaker: 'Harriet Tubman', quote: 'Every great dream begins with a dreamer.' },
  { speaker: 'Theodore Roosevelt', quote: 'Do what you can, with what you have, where you are.' },
  { speaker: 'Dolly Parton', quote: 'If you want the rainbow, you gotta put up with the rain.' },
  { speaker: 'Michael Jordan', quote: 'I have failed over and over again in my life — and that is why I succeed.' },
  { speaker: 'Oprah Winfrey', quote: 'The big secret in life is that there is no big secret — whatever your goal, you can get there.' },
]

const COMPLETE_HEADLINES = ['All Done', 'Shift Complete', 'Great Work Team', 'Everything Crushed', 'Window Cleared']

/** Shared celebration / dismiss timings (Phase 5). Same visuals, shorter pipeline on v3 iPad. */
const CELEBRATION_TIMING = {
  clickGuardMs: 350,
  starAnimationDurationMs: 1300,
  scoreCountUpMs: 650,
  scoreCountUpOrderReportMs: 750,
  starStaggerMs: 20,
  starDurMinMs: 750,
  starDurRangeMs: 250,
  v2StarDelayMs: 650,
  v2StarDelayReducedMs: 150,
  v3SlideDurationMs: 220,
  v3BackdropFadeMs: 180,
  v3CelebrationLeadInMs: 80,
  v3CelebrationLeadInReducedMs: 80,
  windowCompleteScrollDelayMs: 650,
  windowCompleteScrollDelayReducedMs: 140,
  cardJiggleDurationMs: 450,
  cardJiggleStaggerCapMs: 60,
  iceTowelStarDelayMs: 650,
} as const

const getCelebrationTiming = (prefersReducedMotion: boolean) => ({
  clickGuardMs: CELEBRATION_TIMING.clickGuardMs,
  starAnimationDurationMs: prefersReducedMotion ? 400 : CELEBRATION_TIMING.starAnimationDurationMs,
  scoreCountUpMs: prefersReducedMotion ? 0 : CELEBRATION_TIMING.scoreCountUpMs,
  scoreCountUpOrderReportMs: prefersReducedMotion ? 0 : CELEBRATION_TIMING.scoreCountUpOrderReportMs,
  starStaggerMs: prefersReducedMotion ? 8 : CELEBRATION_TIMING.starStaggerMs,
  starDurMinMs: prefersReducedMotion ? 400 : CELEBRATION_TIMING.starDurMinMs,
  starDurRangeMs: prefersReducedMotion ? 100 : CELEBRATION_TIMING.starDurRangeMs,
  v2StarDelayMs: prefersReducedMotion
    ? CELEBRATION_TIMING.v2StarDelayReducedMs
    : CELEBRATION_TIMING.v2StarDelayMs,
  v3SlideDurationMs: prefersReducedMotion ? 120 : CELEBRATION_TIMING.v3SlideDurationMs,
  v3BackdropFadeMs: prefersReducedMotion ? 80 : CELEBRATION_TIMING.v3BackdropFadeMs,
  v3CelebrationLeadInMs: prefersReducedMotion
    ? CELEBRATION_TIMING.v3CelebrationLeadInReducedMs
    : CELEBRATION_TIMING.v3CelebrationLeadInMs,
  windowCompleteScrollDelayMs: prefersReducedMotion
    ? CELEBRATION_TIMING.windowCompleteScrollDelayReducedMs
    : CELEBRATION_TIMING.windowCompleteScrollDelayMs,
  cardJiggleDurationMs: CELEBRATION_TIMING.cardJiggleDurationMs,
  cardJiggleStaggerCapMs: CELEBRATION_TIMING.cardJiggleStaggerCapMs,
  iceTowelStarDelayMs: CELEBRATION_TIMING.iceTowelStarDelayMs,
})

/** v3 full-completion slide + stars profile (ice/towel reference). */
const V3_TASK_COMPLETION_ANIM_OPTS = { bypassReducedMotion: true as const }

/** Solo mode auto-fills these as did-not-need (empty assignees); cleared when solo turns off or break undo. */
const SOLO_AUTO_ORDER_REPORT_TARGETS: ReadonlyArray<{ windowKey: WindowKey; taskId: string }> = [
  { windowKey: '17', taskId: 'order-report-5pm' },
  { windowKey: '21', taskId: 'order-report-close' },
]

function isSoloAutoDidNotNeedPlaceholder(c?: TaskCompletion): boolean {
  return (
    c?.status === 'done' &&
    !!c.didNotNeedToComplete &&
    !(c.assignees && c.assignees.length > 0)
  )
}

/** Solo-on waive: skip if a real order report (or any non–auto-placeholder done) already exists. */
function shouldApplySoloOrderReportWaive(existing?: TaskCompletion): boolean {
  return !existing || existing.status !== 'done'
}

function makeSoloAutoDidNotNeedCompletion(completedAt: string): TaskCompletion {
  return {
    status: 'done',
    assignees: [],
    completedAt,
    assignedByAdmin: false,
    completedLate: false,
    lateForgiven: false,
    completedEarly: false,
    autoAssigned: true,
    didNotNeedToComplete: true,
  }
}

function makeSoloAutoDidNotNeedCompletionBody(completedAt: string): Omit<TaskCompletion, 'status'> {
  const { status: _status, ...body } = makeSoloAutoDidNotNeedCompletion(completedAt)
  return body
}

function getSoloOrderReportTargetsToWaive(state: TaskState, dateKey: string) {
  return SOLO_AUTO_ORDER_REPORT_TARGETS.filter((t) =>
    shouldApplySoloOrderReportWaive(state[dateKey]?.[t.windowKey]?.[t.taskId])
  )
}

function getSoloOrderReportTargetsToClear(state: TaskState, dateKey: string) {
  return SOLO_AUTO_ORDER_REPORT_TARGETS.filter(({ windowKey, taskId }) =>
    isSoloAutoDidNotNeedPlaceholder(state[dateKey]?.[windowKey]?.[taskId])
  )
}

function applySoloOrderReportWaivesToTaskState(prev: TaskState, dateKey: string, completedAt: string): TaskState {
  let changed = false
  const next: TaskState = { ...prev }
  const dateMap: Record<WindowKey, Record<string, TaskCompletion>> = { ...(next[dateKey] ?? {}) }
  for (const t of SOLO_AUTO_ORDER_REPORT_TARGETS) {
    const ex = prev[dateKey]?.[t.windowKey]?.[t.taskId]
    if (!shouldApplySoloOrderReportWaive(ex)) continue
    changed = true
    const wm = { ...(dateMap[t.windowKey] ?? {}) }
    wm[t.taskId] = makeSoloAutoDidNotNeedCompletion(completedAt)
    dateMap[t.windowKey] = wm
  }
  if (!changed) return prev
  next[dateKey] = dateMap
  return next
}

function clearSoloOrderReportWaivesFromTaskState(prev: TaskState, dateKey: string): TaskState {
  const toClear = getSoloOrderReportTargetsToClear(prev, dateKey)
  if (toClear.length === 0) return prev

  const next: TaskState = { ...prev }
  const dateMap: Record<WindowKey, Record<string, TaskCompletion>> = { ...(next[dateKey] ?? {}) }
  for (const { windowKey, taskId } of toClear) {
    const wm = { ...(dateMap[windowKey] ?? {}) }
    delete wm[taskId]
    if (Object.keys(wm).length === 0) {
      delete (dateMap as Partial<Record<WindowKey, Record<string, TaskCompletion>>>)[windowKey]
    } else {
      dateMap[windowKey] = wm
    }
  }
  if (Object.keys(dateMap).length === 0) {
    const rest = { ...next }
    delete (rest as Record<string, unknown>)[dateKey]
    return rest as TaskState
  }
  next[dateKey] = dateMap
  return next
}

// Label categories for the two-label display system
type LabelCategory = 'achievement' | 'skill' | 'role' | 'status'

type EmployeeLabel = {
  id: string
  category: LabelCategory
  emoji: string
  name: string
  description: string
  priority: number // Higher wins within category
  source: 'computed' | 'manual' | 'system'
}

// Define achievement labels (computed from task history)
const ACHIEVEMENT_LABELS: Record<string, Omit<EmployeeLabel, 'source'>> = {
  iceQueen: { id: 'iceQueen', category: 'achievement', emoji: '❄️', name: 'Ice Expert', description: 'Master of ice tasks', priority: 70 },
  bathroomBoss: { id: 'bathroomBoss', category: 'achievement', emoji: '🚽', name: 'Bathroom Boss', description: 'Keeps it clean', priority: 65 },
  speedDemon: { id: 'speedDemon', category: 'achievement', emoji: '⚡', name: 'Speed Demon', description: 'Always early', priority: 85 },
  clutch: { id: 'clutch', category: 'achievement', emoji: '⏱️', name: 'Clutch', description: 'Finishes right before the buzzer', priority: 82 },
  soloHero: { id: 'soloHero', category: 'achievement', emoji: '🧍', name: 'Solo Hero', description: 'Gets it done solo', priority: 72 },
  tagTeam: { id: 'tagTeam', category: 'achievement', emoji: '🧩', name: 'Tag Team', description: 'Splits tasks like a pro', priority: 76 },
  nightOwl: { id: 'nightOwl', category: 'achievement', emoji: '🦉', name: 'Night Owl', description: 'Night shift hero', priority: 75 },
  morningStar: { id: 'morningStar', category: 'achievement', emoji: '⭐', name: 'Morning Star', description: 'Early bird champion', priority: 75 },
  perfectionist: { id: 'perfectionist', category: 'achievement', emoji: '✨', name: 'Perfectionist', description: 'Never late', priority: 90 },
  teamPlayer: { id: 'teamPlayer', category: 'achievement', emoji: '🤝', name: 'Team Player', description: 'Great collaborator', priority: 80 },
  cleanupCrew: { id: 'cleanupCrew', category: 'achievement', emoji: '🧹', name: 'Cleanup Crew', description: 'Cleaning specialist', priority: 60 },
  consistent: { id: 'consistent', category: 'achievement', emoji: '🎯', name: 'Consistent', description: 'Regular performer', priority: 50 },
  sauceBoss: { id: 'sauceBoss', category: 'achievement', emoji: '🥫', name: 'Sauce Boss', description: 'Yum yum expert', priority: 68 },
  stockStar: { id: 'stockStar', category: 'achievement', emoji: '📦', name: 'Stock Star', description: 'Stocking pro', priority: 63 },
  firstFinish: { id: 'firstFinish', category: 'achievement', emoji: '🏃', name: 'First Finish', description: 'First to complete tasks', priority: 78 },
}

// System status labels (shown until someone earns an achievement)
const STATUS_LABELS: Record<string, Omit<EmployeeLabel, 'source'>> = {
  newbie: { id: 'newbie', category: 'status', emoji: '🌱', name: 'Newbie', description: 'Earn an achievement to replace this label', priority: 10 },
}

// Define skill labels (scaffold for future manual/admin assignment)
export const SKILL_LABELS: Record<string, Omit<EmployeeLabel, 'source'>> = {
  trainer: { id: 'trainer', category: 'skill', emoji: '📚', name: 'Trainer', description: 'Trains new team members', priority: 80 },
  opener: { id: 'opener', category: 'skill', emoji: '🌅', name: 'Opener', description: 'Certified opener', priority: 70 },
  closer: { id: 'closer', category: 'skill', emoji: '🌙', name: 'Closer', description: 'Certified closer', priority: 70 },
  allStar: { id: 'allStar', category: 'skill', emoji: '🌟', name: 'All-Star', description: 'Can do everything', priority: 90 },
}

const achievementGroupId = (labelId: string): string => {
  // Used only to avoid redundant pairs when showing 2 achievements.
  if (labelId === 'iceQueen') return 'ice'
  if (labelId === 'bathroomBoss') return 'bathroom'
  if (labelId === 'cleanupCrew') return 'cleaning'
  if (labelId === 'sauceBoss') return 'sauce'
  if (labelId === 'stockStar') return 'stock'
  if (labelId === 'teamPlayer' || labelId === 'tagTeam') return 'team'
  if (labelId === 'speedDemon' || labelId === 'clutch') return 'speed'
  if (labelId === 'nightOwl' || labelId === 'morningStar') return 'shift'
  if (labelId === 'perfectionist') return 'perfect'
  if (labelId === 'firstFinish') return 'first'
  if (labelId === 'consistent') return 'volume'
  if (labelId === 'soloHero') return 'solo'
  return labelId
}

// Helper to pick up to 2 display labels from different categories
const pickDisplayLabels = (labels: EmployeeLabel[]): EmployeeLabel[] => {
  if (labels.length === 0) return []
  
  // Group by category
  const byCategory: Record<string, EmployeeLabel[]> = {}
  labels.forEach(label => {
    if (!byCategory[label.category]) byCategory[label.category] = []
    byCategory[label.category].push(label)
  })

  // Option A: if the person only has achievement labels available,
  // show their top 2 achievements (so they can display 2 accomplishments early).
  const categories = Object.keys(byCategory)
  if (categories.length === 1 && categories[0] === 'achievement') {
    const sorted = (byCategory.achievement ?? []).slice().sort((a, b) =>
      (b.priority - a.priority) || a.name.localeCompare(b.name)
    )
    if (sorted.length <= 2) return sorted
    const first = sorted[0]!
    const firstGroup = achievementGroupId(first.id)
    for (let i = 1; i < sorted.length; i++) {
      const candidate = sorted[i]!
      if (achievementGroupId(candidate.id) !== firstGroup) {
        return [first, candidate]
      }
    }
    return sorted.slice(0, 2)
  }
  
  // Pick best label per category (highest priority, stable tiebreak by name)
  const bestPerCategory: EmployeeLabel[] = []
  Object.keys(byCategory).forEach(cat => {
    const sorted = byCategory[cat].sort((a, b) => 
      (b.priority - a.priority) || a.name.localeCompare(b.name)
    )
    if (sorted[0]) bestPerCategory.push(sorted[0])
  })
  
  // Sort all best labels by priority and return up to 2
  bestPerCategory.sort((a, b) => (b.priority - a.priority) || a.name.localeCompare(b.name))
  return bestPerCategory.slice(0, 2)
}

// Shared canonical shift scoring (source of truth).
const computeShiftLeadersForState = computeShiftLeadersForStateShared

// Pure helper for Shift HUD: determine who actually "played" this shift.
// We intentionally exclude `autoAssigned` completions (used by yum-yum credit)
// so past assignees don't get surfaced as current shift players.
const computeShiftHudParticipantsForState = (
  state: TaskState,
  dateKey: string,
  shift: 'day' | 'night',
  SHIFT_WINDOWS: Record<'day' | 'night', WindowKey[]>
): Set<string> => {
  const dateMap = state[dateKey]
  const participants = new Set<string>()
  if (!dateMap) return participants

  // Tasks with "I didn't need to fill" buttons don't count toward shift participation in scoring
  // (prevents accidental leaderboard impact when users click employee name instead of auto-assign button),
  // but a genuine manual fill should still surface the player in the HUD immediately (second pass below).
  const noShiftParticipationTasks = ['yum-yum-close', 'ice-5pm', 'ice-close', 'peanuts-noodles-close']

  // First pass: regular tasks (excluding the optional no-participation tasks above)
  SHIFT_WINDOWS[shift].forEach((wKey) => {
    const windowMap = dateMap[wKey] || {}
    Object.keys(windowMap).forEach((taskId) => {
      const completion = windowMap[taskId]
      if (!completion) return
      // Late completions only count when forgiven (same rule as scoring).
      if (completion.completedLate && !completion.lateForgiven) return
      // Auto-assigned completions should not make someone appear as a shift participant in the HUD.
      if (completion.autoAssigned) return
      if (noShiftParticipationTasks.includes(taskId)) return

      const assignees = completion.assignees || []
      assignees.forEach((n) => {
        participants.add(n)
      })
    })
  })

  // Second pass: optional tasks (yum-yum, ice, peanuts). A real, manual fill earns points,
  // so the player should appear in the HUD even if it's the only task they've completed.
  // Auto-assigned and "didn't need to fill" completions still surface nobody.
  SHIFT_WINDOWS[shift].forEach((wKey) => {
    const windowMap = dateMap[wKey] || {}
    noShiftParticipationTasks.forEach((taskId) => {
      const completion = windowMap[taskId]
      if (!completion || completion.status !== 'done') return
      // Late completions only count when forgiven (same rule as scoring).
      if (completion.completedLate && !completion.lateForgiven) return
      if (completion.autoAssigned) return
      if (completion.didNotNeedToComplete) return

      creditedPeopleForShiftCompletion(taskId, completion).forEach((n) => {
        participants.add(n)
      })
    })
  })

  return participants
}

/** Names credited for a done completion in a shift window — one task credit each. */
const creditedPeopleForShiftCompletion = (taskId: string, completion: TaskCompletion): string[] => {
  if (taskId === 'ice-5pm' || taskId === 'ice-close') {
    const left = String(completion.iceSides?.left || '').trim()
    const right = String(completion.iceSides?.right || '').trim()
    if (left && right) return [...new Set([left, right])]
  }
  if (taskId === 'towels' || taskId === 'towels-5pm' || taskId === 'towels-close') {
    const diningBar = String(completion.towelSides?.diningBar || '').trim()
    const bowlStation = String(completion.towelSides?.bowlStation || '').trim()
    if (diningBar && bowlStation) return [...new Set([diningBar, bowlStation])]
  }
  return (completion.assignees || []).map((n) => n.trim()).filter(Boolean)
}

// Shared canonical full-day scoring (source of truth).
const computeFullDayLeadersForState = computeFullDayLeadersForStateShared

/**
 * Compute a smooth gradient for the progress bar based on employee colors and their point shares.
 * Colors flow from highest scorer to lowest with proportional positioning.
 * Returns null if no employees with colors have completed tasks.
 */
const computeProgressGradient = (
  leaders: LeaderRow[],
  employeeColors: EmployeeColors
): string | null => {
  // Filter to employees with scores > 0 and who have colors set, sorted by score descending
  const withScores = leaders
    .filter((r) => r.score > 0 && employeeColors[r.name])
    .sort((a, b) => b.score - a.score)
  
  if (withScores.length === 0) return null

  // Single employee = solid color
  if (withScores.length === 1) {
    return employeeColors[withScores[0].name]
  }

  // Calculate total score for proportions
  const totalScore = withScores.reduce((sum, r) => sum + r.score, 0)
  if (totalScore === 0) return null

  // Build smooth gradient with proportional stops
  // Each color gets a stop at the START of its territory, creating smooth blends
  const stops: string[] = []
  let currentPct = 0

  withScores.forEach((r, idx) => {
    const color = employeeColors[r.name]
    const share = (r.score / totalScore) * 100

    if (idx === 0) {
      // First color starts at 0%
      stops.push(`${color} 0%`)
    }
    
    // Place a stop at the midpoint of this color's territory for smooth blending
    const midpoint = currentPct + share / 2
    stops.push(`${color} ${midpoint.toFixed(1)}%`)
    
    currentPct += share
  })

  // Ensure last color reaches 100%
  const lastColor = employeeColors[withScores[withScores.length - 1].name]
  stops.push(`${lastColor} 100%`)

  return `linear-gradient(90deg, ${stops.join(', ')})`
}

// TaskState type is now imported from firestore service

const WINDOWS: WindowConfig[] = [
  { key: '11', label: '11AM', start: '11:00', lateAfter: '12:00' },
  { key: '17', label: '5PM', start: '17:00', lateAfter: '17:30', unlocksAt: '16:00' },
  { key: '21', label: '9PM', start: '21:00', lateAfter: '21:00', unlocksAt: '18:00' },
]

const NIGHT_SHIFT_SOLO_CHECK_TASK: Task = {
  id: 'night-shift-solo-check',
  name: 'Night Shift Solo?',
  icon: '🌙',
  requirements: ['Check with manager if the night shift will also be solo.'],
  windows: ['17'],
  weight: 0,
}

const USERS = [
  'Ashley',
  'Angel',
  'Al',
  'Brook',
  'Jules',
  'Casey',
  'Rae',
  'Zoe',
]

// Employee color palette - distinct, bright colors that are easy to tell apart
// When a color is taken, it's removed from the picker and a backup is used instead
const EMPLOYEE_COLOR_OPTIONS_PRIMARY = [
  '#FF3366', // Hot Pink
  '#FF6B2C', // Orange
  '#FFD93D', // Yellow
  '#00E676', // Neon Green
  '#00D9FF', // Electric Blue
  '#6C5CE7', // Purple
  '#D946EF', // Pinkish Purple
  '#FF85A2', // Soft Pink
  '#64FFDA', // Aqua/Mint
  '#FF9500', // Tangerine
  '#4ECDC4', // Teal
  '#E040FB', // Magenta
  '#FFEB3B', // Bright Yellow
]

const EMPLOYEE_COLOR_OPTIONS_BACKUP = [
  '#F44336', // Red
  '#2196F3', // Blue
  '#4CAF50', // Green
  '#9C27B0', // Deep Purple
  '#00BCD4', // Cyan
  '#FFCC02', // Gold
  '#FF5722', // Deep Orange
  '#03A9F4', // Light Blue
  '#8BC34A', // Lime
  '#FF4081', // Pink Accent
  '#7C4DFF', // Deep Violet
  '#1DE9B6', // Turquoise
]

// Demo Day: generate a valid random far-future YYYY-MM-DD dateKey.
// We use a far-future year to avoid collisions with real data and leaderboard ranges.
const generateRandomDemoDateKey = (avoidDateKey: string): string => {
  const year = 2099
  // Pick a random valid month/day by constructing a Date and formatting it back.
  // This guarantees month length + leap days are valid.
  for (let i = 0; i < 40; i++) {
    const monthIndex = Math.floor(Math.random() * 12) // 0..11
    const day = 1 + Math.floor(Math.random() * 28) // keep within 1..28 to stay safe across months
    const d = new Date(year, monthIndex, day, 0, 0, 0, 0)
    const key = formatDateKey(startOfDay(d))
    if (key && key !== avoidDateKey) return key
  }
  // Fallback (should be extremely unlikely)
  return `${year}-01-01`
}

const startOfDay = (date: Date) => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const startOfMonth = (date: Date) => {
  const next = startOfDay(date)
  next.setDate(1)
  return next
}

const addMonths = (date: Date, delta: number) => {
  const next = startOfDay(date)
  // Set to the 1st to avoid overflow (e.g. Jan 31 -> Mar 3)
  next.setDate(1)
  next.setMonth(next.getMonth() + delta)
  return next
}

const endOfMonth = (date: Date) => {
  // Last day of month (00:00 local) for dateKey comparisons
  const next = startOfDay(date)
  next.setMonth(next.getMonth() + 1, 0) // day 0 of next month = last day of current month
  return next
}

const isSameMonth = (a: Date, b: Date) => {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

const formatMonthTitle = (date: Date) => {
  // Avoid Intl/toLocaleString option quirks on older Safari
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const m = MONTHS[date.getMonth()] || 'Month'
  return `${m} ${date.getFullYear()}`
}

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const combineDateTime = (date: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date(date)
  next.setHours(hours, minutes, 0, 0)
  return next
}

const timeToMinutes = (time: string): number => {
  const [hh, mm] = time.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0
  return hh * 60 + mm
}

const minutesToTime = (mins: number): string => {
  const m = ((mins % 60) + 60) % 60
  const h = Math.floor(mins / 60)
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

const formatTimeLabel = (time: string): string => {
  // Keep this basic (no Intl options) for older Safari compatibility.
  const [hhRaw, mmRaw] = time.split(':')
  const hh = Number(hhRaw)
  const mm = Number(mmRaw)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time
  const suffix = hh >= 12 ? 'PM' : 'AM'
  const hour12 = ((hh + 11) % 12) + 1
  return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`
}

const breakDurationForShift = (shiftType: BreakShiftType): 30 | 60 => {
  return shiftType === 'double' ? 60 : 30
}

const isSameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime()

/**
 * Find the most recent person who completed a specific task.
 * Excludes the current date+window combination.
 * Returns the assignee(s) and completedAt timestamp if found, null otherwise.
 */
const findLastTaskCompletion = (
  taskState: Record<string, Record<string, Record<string, TaskCompletion>>>,
  taskId: string,
  excludeDateKey: string,
  excludeWindowKey: string
): TaskCompletion | null => {
  let mostRecent: TaskCompletion | null = null
  let mostRecentAt: string | null = null

  for (const dateKey of Object.keys(taskState)) {
    const dayData = taskState[dateKey]
    for (const windowKey of Object.keys(dayData)) {
      // Skip the current date+window we're trying to complete
      if (dateKey === excludeDateKey && windowKey === excludeWindowKey) continue

      const completion = dayData[windowKey]?.[taskId]
      if (completion && completion.assignees.length > 0 && completion.completedAt) {
        if (!mostRecentAt || completion.completedAt > mostRecentAt) {
          mostRecent = completion
          mostRecentAt = completion.completedAt
        }
      }
    }
  }

  return mostRecent
}

const findLastTaskCompleter = (
  taskState: Record<string, Record<string, Record<string, TaskCompletion>>>,
  taskId: string,
  excludeDateKey: string,
  excludeWindowKey: string
): { assignees: string[]; completedAt: string } | null => {
  const completion = findLastTaskCompletion(taskState, taskId, excludeDateKey, excludeWindowKey)
  if (!completion) return null
  return { assignees: completion.assignees, completedAt: completion.completedAt }
}

/** Window-aware pair for Last time: close uses night HUD only; 5PM uses break selection first. */
const resolveLastTimePair = (
  windowKey: WindowKey,
  breakSelection: BreakSelection | null,
  shiftHudLeaders: { name: string }[]
): [string, string] | null => {
  if (windowKey === '21') {
    if (shiftHudLeaders.length >= 2) {
      const e0 = (shiftHudLeaders[0]?.name || '').trim()
      const e1 = (shiftHudLeaders[1]?.name || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }
    return null
  }
  if (windowKey === '17') {
    const slots = breakSelection?.slots || []
    if (slots.length >= 2) {
      const e0 = (slots[0]?.employee || '').trim()
      const e1 = (slots[1]?.employee || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }
    if (shiftHudLeaders.length >= 2) {
      const e0 = (shiftHudLeaders[0]?.name || '').trim()
      const e1 = (shiftHudLeaders[1]?.name || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }
  }
  return null
}

// Task state is now loaded from and saved to Firestore (see useEffect hooks below)

const getWindowForDate = (now: Date): WindowKey => {
  const hour = now.getHours()
  // Before 2:00pm -> 11AM
  if (hour < 14) return '11'
  // 2:00pm–5:59pm -> 5PM
  if (hour < 18) return '17'
  // 6:00pm+ -> 9/10PM
  return '21'
}

const getCurrentWindow = (): WindowKey => getWindowForDate(new Date())

const addDays = (date: Date, delta: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + delta)
  return startOfDay(next)
}

const displayDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

// ─────────────────────────────────────────────────────────────────────────────
// Time Off helpers
// ─────────────────────────────────────────────────────────────────────────────

// EmailJS config for manager notifications
const EMAILJS_SERVICE_ID = 'service_lh2sttd'
const EMAILJS_TEMPLATE_ID = 'template_g96a7jq'
const EMAILJS_PUBLIC_KEY = '0zmN_x9c6Iy-FFHcR'

const sendTimeOffEmailNotification = async (params: {
  employee: string
  days: string
}) => {
  try {
    // Use form data format (more reliable with EmailJS)
    const formData = new FormData()
    formData.append('service_id', EMAILJS_SERVICE_ID)
    formData.append('template_id', EMAILJS_TEMPLATE_ID)
    formData.append('user_id', EMAILJS_PUBLIC_KEY)
    formData.append('template_params', JSON.stringify(params))
    
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send-form', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('EmailJS send failed:', response.status, errorText)
    } else {
      console.log('EmailJS email sent successfully!')
    }
  } catch (e) {
    // Don't block the request on email failure
    console.error('EmailJS send error:', e)
  }
}

// Restaurant shift times based on day of week
const getShiftTimes = (dayKey: DayOfWeek): { lunch: { start: string; end: string }; dinner: { start: string; end: string } } => {
  const isFriSat = dayKey === 'fri' || dayKey === 'sat'
  return {
    lunch: { start: '11:00', end: '17:00' }, // 11am - 5pm
    dinner: { start: '17:00', end: isFriSat ? '22:00' : '21:00' }, // 5pm - 9pm (or 10pm Fri/Sat)
  }
}

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

async function loadScheduleWeeksOverlappingDateRange(
  fromDateKey: string,
  toDateKey: string
): Promise<DailyTaskWeek[]> {
  const keys = enumerateWeekStartDateKeysInclusive(fromDateKey, toDateKey)
  const loaded = await Promise.all(keys.map((ws) => getDailyTaskWeek(ws)))
  return loaded.filter((w): w is DailyTaskWeek => !!w && !!(w as DailyTaskWeek).days)
}

const ensureDailyTaskWeekForDateKey = async (
  dateKey: string,
  tasks: DailyTaskDef[]
): Promise<DailyWeekGenResult> => {
  const weekStartDateKey = getWeekStartDateKeySunday(dateKey)
  const existing = await getDailyTaskWeek(weekStartDateKey)
  if (existing && existing.days && Object.keys(existing.days).length > 0) {
    return { week: existing, warnings: [] }
  }

  const today = formatDateKey(startOfDay(new Date()))
  const from = addDaysToDateKey(today, -120)
  let recentRuns: DailyTaskRun[] = []
  try {
    recentRuns = await listDailyTaskRunsInRange(from, today)
  } catch (e) {
    console.warn('Failed to load recent daily task runs for scheduling:', e)
    recentRuns = []
  }

  let scheduleWeeks: DailyTaskWeek[] = []
  try {
    scheduleWeeks = await loadScheduleWeeksOverlappingDateRange(from, today)
  } catch (e) {
    console.warn('Failed to load daily task weeks for recency merge:', e)
    scheduleWeeks = []
  }

  let weeklyPlacementOverrides: Record<string, string> | undefined
  let generatorVersion: string | undefined
  try {
    const { byWeek, usedAi } = await fetchValidatedWeeklyPlacements({
      tasks,
      recentRunsForHistory: recentRuns,
      weeks: [{ weekStartDateKey, existingWeek: existing, todayDateKey: undefined }],
      systemPrompt: getCachedDailyTaskScheduleSystemPrompt(),
    })
    const picked = byWeek[weekStartDateKey]
    if (usedAi && picked && Object.keys(picked).length > 0) {
      weeklyPlacementOverrides = picked
      generatorVersion = DAILY_TASK_WEEK_GENERATOR_VERSION_AI
    }
  } catch (e) {
    console.warn('AI daily schedule skipped:', e)
  }

  const generated = generateDailyTaskWeek({
    weekStartDateKey,
    tasks,
    recentRuns,
    scheduleWeeksForRecency: scheduleWeeks,
    existingWeek: existing,
    weeklyPlacementOverrides,
    generatorVersion,
  })
  if (generated.week && !generated.error) {
    try {
      await upsertDailyTaskWeek(weekStartDateKey, generated.week)
    } catch (e) {
      console.warn('Failed to upsert daily task week:', e)
    }
  }
  return generated
}

const ensureDailyTaskRunForDateKey = async (args: {
  dateKey: string
  tasks: DailyTaskDef[]
  selectedBy?: string
}): Promise<DailyTaskRun | null> => {
  const { dateKey, tasks, selectedBy } = args
  const existing = await getDailyTaskRun(dateKey)
  if (existing) return existing

  const wk = await ensureDailyTaskWeekForDateKey(dateKey, tasks)
  const scheduleEntry = parseWeekDayEntry(wk.week?.days?.[dateKey])
  if (!isDayVisibleToPlayers(scheduleEntry)) return null
  const taskId = scheduleEntry!.taskId

  const run: DailyTaskRun = {
    dateKey,
    taskId,
    selectedAtMs: Date.now(),
    ...(selectedBy ? { selectedBy } : {}),
  }
  await upsertDailyTaskRun(dateKey, run)
  return run
}

// Expand a date range to individual shift blocks - includes ALL days regardless of availability
const expandDateRangeToShifts = (
  startDateKey: string,
  endDateKey: string,
  _availability: WeeklyAvailability | null // No longer used - employees can call off any day
): RequestedShift[] => {
  const shifts: RequestedShift[] = []
  const startDate = parseDateKey(startDateKey)
  const endDate = parseDateKey(endDateKey)
  
  // Limit to max 90 days to prevent huge expansions
  const maxDays = 90
  let current = new Date(startDate)
  let count = 0
  
  while (current <= endDate && count < maxDays) {
    const dateKey = formatDateKey(current)
    
    // Always include both shifts for every day - employees can call off any day
    shifts.push({ dateKey, shift: 'lunch' })
    shifts.push({ dateKey, shift: 'dinner' })
    
    current = addDays(current, 1)
    count++
  }
  
  return shifts
}

// Check if a shift is in the past
const isShiftInPast = (dateKey: string, shift: ShiftType): boolean => {
  const date = parseDateKey(dateKey)
  const now = new Date()
  const today = startOfDay(now)
  const shiftDate = startOfDay(date)
  
  if (shiftDate < today) return true
  if (shiftDate > today) return false
  
  // Same day - check shift time
  const dayKey = getDayOfWeekKey(date)
  const times = getShiftTimes(dayKey)
  const endTime = shift === 'lunch' ? times.lunch.end : times.dinner.end
  const [hours, minutes] = endTime.split(':').map(Number)
  const shiftEnd = new Date(date)
  shiftEnd.setHours(hours, minutes, 0, 0)
  
  return now > shiftEnd
}

// Format date range for display
const formatDateRange = (startDateKey: string, endDateKey: string): string => {
  const start = parseDateKey(startDateKey)
  const end = parseDateKey(endDateKey)
  
  if (startDateKey === endDateKey) {
    return displayDate(start)
  }
  
  return `${displayDate(start)} – ${displayDate(end)}`
}

// Inclusive calendar day count between two YYYY-MM-DD keys (timezone/DST safe).
const countInclusiveCalendarDays = (startDateKey: string, endDateKey: string): number => {
  const toUtcDayMs = (dateKey: string): number => {
    const [yy, mm, dd] = String(dateKey || '').split('-').map((x) => parseInt(x, 10))
    if (!yy || !mm || !dd) return NaN
    return Date.UTC(yy, mm - 1, dd)
  }
  const startMs = toUtcDayMs(startDateKey)
  const endMs = toUtcDayMs(endDateKey)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
}

const hasBootstrapCache = (): boolean => {
  try {
    // Keep in sync with localStorage keys used in `src/services/firestore.ts`
    return (
      !!localStorage.getItem('traq-employees-v1') ||
      !!localStorage.getItem('traq-task-order-v1') ||
      !!localStorage.getItem('traq-task-state-v1') ||
      !!localStorage.getItem('traq-task-catalog-v1') ||
      !!localStorage.getItem('traq-task-overrides-v1')
    )
  } catch {
    return false
  }
}

const readCache = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const writeCache = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/** Split panel fly-out duration before the auto-finish celebration (keep in sync with CSS). */
const SPLIT_AUTO_FINISH_EVAC_MS = 900

const getWindowLabel = (date: Date, windowKey: WindowKey): string => {
  const window = WINDOWS.find((w) => w.key === windowKey)
  if (!window) return ''
  
  // Check if it's Friday (5) or Saturday (6)
  const dayOfWeek = date.getDay()
  if (windowKey === '21' && (dayOfWeek === 5 || dayOfWeek === 6)) {
    return '10PM'
  }
  
  return window.label
}

const getLateAfterForWindow = (_date: Date, windowKey: WindowKey): string => {
  const window = WINDOWS.find((w) => w.key === windowKey)
  if (!window) return '00:00'
  return window.lateAfter
}

const getLateCutoffForWindow = (date: Date, windowKey: WindowKey): Date => {
  // 9PM/10PM tasks can be completed until the end of the day (local) and should not be marked late before then.
  if (windowKey === '21') {
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    return end
  }
  return combineDateTime(date, getLateAfterForWindow(date, windowKey))
}

const effectiveStatus = (
  taskDate: Date,
  windowKey: WindowKey,
  completion: TaskCompletion | undefined,
  now: Date,
  taskId?: string,
  soloModeActive = false
): EffectiveStatus => {
  if (completion?.status === 'done') {
    // Ice/Towel split tasks: partial completion (one side filled) is not "done" - fall through for late/missing
    const isPartialIce =
      (taskId === 'ice-5pm' || taskId === 'ice-close') &&
      completion.iceSides &&
      (!String(completion.iceSides.left || '').trim() || !String(completion.iceSides.right || '').trim())
    const isPartialTowel =
      (taskId === 'towels' || taskId === 'towels-5pm' || taskId === 'towels-close') &&
      completion.towelSides &&
      (!String(completion.towelSides.diningBar || '').trim() || !String(completion.towelSides.bowlStation || '').trim())
    if (!isPartialIce && !isPartialTowel) return 'done'
  }
  const dayValue = startOfDay(taskDate).getTime()
  const todayValue = startOfDay(now).getTime()
  if (dayValue < todayValue) return 'missing'
  if (dayValue > todayValue) return 'pending'
  if (soloModeActive && (windowKey === '11' || windowKey === '17' || windowKey === '21')) return 'pending'

  const cutoff = getLateCutoffForWindow(taskDate, windowKey)
  return now >= cutoff ? 'late' : 'pending'
}

/** Fullscreen “please play music” reminder: local 11:00–20:29 only (off from 8:30pm onward). */
const isWithinMusicReminderHours = (d: Date): boolean => {
  const h = d.getHours()
  const m = d.getMinutes()
  if (h < 11) return false
  if (h > 20) return false
  if (h === 20 && m >= 30) return false
  return true
}

const getGreeting = (timeOfDay: TimeOfDay): string => {
  switch (timeOfDay) {
    case 'morning':
      return 'Good morning, team! ☀️'
    case 'afternoon':
      return 'Good afternoon, team! 🌤️'
    case 'evening':
      return 'Good evening, team! 🌆'
    case 'night':
      return 'Hey night crew! 🌙'
  }
}

// Calculate task urgency based on time remaining until deadline
// Returns: 'none' | 'low' | 'medium' | 'high' | 'critical'
const getTaskUrgency = (
  status: EffectiveStatus,
  taskDate: Date,
  windowKey: WindowKey,
  now: Date
): 'none' | 'low' | 'medium' | 'high' | 'critical' => {
  // No urgency for completed, late, or missing tasks
  if (status !== 'pending') return 'none'
  
  const cutoff = getLateCutoffForWindow(taskDate, windowKey)
  const msRemaining = cutoff.getTime() - now.getTime()
  const minutesRemaining = msRemaining / (60 * 1000)
  
  // Critical: < 5 minutes
  if (minutesRemaining < 5) return 'critical'
  // High: 5-15 minutes
  if (minutesRemaining < 15) return 'high'
  // Medium: 15-30 minutes
  if (minutesRemaining < 30) return 'medium'
  // Low: 30-60 minutes
  if (minutesRemaining < 60) return 'low'
  // None: > 60 minutes
  return 'none'
}

// Calculate earned achievement labels for each employee based on task history (calendar range)
const calculateEarnedLabels = (
  taskState: TaskState,
  employees: string[],
  range?: { fromDateKey: string; toDateKey: string }
): Record<string, EmployeeLabel[]> => {
  const labels: Record<string, EmployeeLabel[]> = {}
  
  // Initialize counters for each employee
  const stats: Record<string, {
    total: number
    solo: number
    clutch: number
    early: number
    late: number
    iceTask: number
    bathroomTask: number
    cleaningTask: number
    sauceTask: number
    stockTask: number
    nightShift: number
    morningShift: number
    teamWork: number
    firstFinishes: number
    consecutiveDays: number
  }> = {}
  
  employees.forEach(emp => {
    stats[emp] = {
      total: 0,
      solo: 0,
      clutch: 0,
      early: 0,
      late: 0,
      iceTask: 0,
      bathroomTask: 0,
      cleaningTask: 0,
      sauceTask: 0,
      stockTask: 0,
      nightShift: 0,
      morningShift: 0,
      teamWork: 0,
      firstFinishes: 0,
      consecutiveDays: 0,
    }
    labels[emp] = []
  })
  
  const fromKey = range?.fromDateKey || '0000-00-00'
  const toKey = range?.toDateKey || '9999-99-99'
  
  // First pass: find earliest completion per window to track "first finishes"
  const firstCompletionByWindow: Record<string, { assignees: string[]; completedAt: string }> = {}
  
  Object.keys(taskState).forEach(dateKey => {
    if (dateKey < fromKey || dateKey > toKey) return
    
    const dayData = taskState[dateKey]
    Object.keys(dayData).forEach((windowKey) => {
      const windowData = dayData[windowKey as WindowKey]
      const windowId = `${dateKey}-${windowKey}`
      
      Object.keys(windowData).forEach(taskId => {
        const completion = windowData[taskId]
        if (!completion || completion.status !== 'done' || !completion.completedAt) return
        
        const existing = firstCompletionByWindow[windowId]
        if (!existing || completion.completedAt < existing.completedAt) {
          firstCompletionByWindow[windowId] = {
            assignees: completion.assignees,
            completedAt: completion.completedAt
          }
        }
      })
    })
  })
  
  // Second pass: count all stats
  Object.keys(taskState).forEach(dateKey => {
    if (dateKey < fromKey || dateKey > toKey) return
    
    const dayData = taskState[dateKey]
    Object.keys(dayData).forEach((windowKey) => {
      const windowData = dayData[windowKey as WindowKey]
      const windowId = `${dateKey}-${windowKey}`
      const isNight = windowKey === '21'
      const isMorning = windowKey === '11'
      const taskDate = new Date(dateKey + 'T00:00:00')
      const cutoff = getLateCutoffForWindow(taskDate, windowKey as WindowKey)
      
      Object.keys(windowData).forEach(taskId => {
        const completion = windowData[taskId]
        if (!completion || completion.status !== 'done') return

        // Combined Ice (Left + Right) should behave like two separate solo tasks for achievements/stats.
        if (
          (taskId === 'ice-5pm' || taskId === 'ice-close') &&
          completion.iceSides &&
          typeof completion.iceSides.left === 'string' &&
          typeof completion.iceSides.right === 'string'
        ) {
          const left = String(completion.iceSides.left || '').trim()
          const right = String(completion.iceSides.right || '').trim()
          const sideAssignees = [left, right].filter((x): x is string => !!x)
          sideAssignees.forEach((assignee) => {
            if (!stats[assignee]) return

            stats[assignee].total++
            stats[assignee].solo++ // treat each side as its own solo task
            stats[assignee].iceTask++ // count each side toward Ice Expert

            // Track shift patterns
            if (isNight) stats[assignee].nightShift++
            if (isMorning) stats[assignee].morningShift++

            // Track early/late completions
            if (completion.completedEarly) stats[assignee].early++
            if (completion.completedLate && !completion.lateForgiven) stats[assignee].late++

            // Clutch: on-time completion within last 10 minutes before cutoff (exclude autoAssigned)
            if (completion.completedAt && !completion.autoAssigned) {
              const completedAtMs = Date.parse(completion.completedAt)
              const cutoffMs = cutoff.getTime()
              if (Number.isFinite(completedAtMs) && Number.isFinite(cutoffMs)) {
                const diffMs = cutoffMs - completedAtMs
                if (diffMs >= 0 && diffMs <= 10 * 60 * 1000 && !(completion.completedLate && !completion.lateForgiven)) {
                  stats[assignee].clutch++
                }
              }
            }

            const firstInWindow = firstCompletionByWindow[windowId]
            if (firstInWindow && completion.completedAt === firstInWindow.completedAt) {
              stats[assignee].firstFinishes++
            }
          })
          return
        }
        
        completion.assignees.forEach((assignee: string) => {
          if (!stats[assignee]) return
          
          stats[assignee].total++

          // Solo vs split
          if (completion.assignees.length === 1) stats[assignee].solo++
          
          // Track specific task types (exclude 11AM ice-check from Ice Expert)
          if (taskId.includes('ice') && taskId !== 'ice-check') stats[assignee].iceTask++
          if (taskId.includes('bathroom')) stats[assignee].bathroomTask++
          if (taskId.includes('clean') || taskId.includes('wipe') || taskId.includes('sweep')) {
            stats[assignee].cleaningTask++
          }
          if (taskId.includes('yum') || taskId.includes('sauce')) {
            stats[assignee].sauceTask++
          }
          if (taskId.includes('stock') || taskId.includes('refill') || taskId.includes('restock')) {
            stats[assignee].stockTask++
          }
          
          // Track shift patterns
          if (isNight) stats[assignee].nightShift++
          if (isMorning) stats[assignee].morningShift++
          
          // Track early completions
          if (completion.completedEarly) stats[assignee].early++
          
          // Track late completions
          if (completion.completedLate && !completion.lateForgiven) stats[assignee].late++
          
          // Track teamwork (split tasks)
          if (completion.assignees.length > 1) stats[assignee].teamWork++

          // Clutch: on-time completion within last 10 minutes before cutoff (exclude autoAssigned)
          if (completion.completedAt && !completion.autoAssigned) {
            const completedAtMs = Date.parse(completion.completedAt)
            const cutoffMs = cutoff.getTime()
            if (Number.isFinite(completedAtMs) && Number.isFinite(cutoffMs)) {
              const diffMs = cutoffMs - completedAtMs
              if (diffMs >= 0 && diffMs <= 10 * 60 * 1000 && !(completion.completedLate && !completion.lateForgiven)) {
                stats[assignee].clutch++
              }
            }
          }
          
          // Track first finishes (was this the first task completed in this window?)
          const firstInWindow = firstCompletionByWindow[windowId]
          if (firstInWindow && completion.completedAt === firstInWindow.completedAt) {
            stats[assignee].firstFinishes++
          }
        })
      })
    })
  })
  
  // Award achievement labels based on thresholds
  const addLabel = (emp: string, labelDef: Omit<EmployeeLabel, 'source'>) => {
    labels[emp].push({ ...labelDef, source: 'computed' })
  }
  
  employees.forEach(emp => {
    const s = stats[emp]
    if (!s || s.total < 5) return // Minimum 5 tasks to earn labels
    
    // Ice Expert: 5+ ice tasks
    if (s.iceTask >= 5) addLabel(emp, ACHIEVEMENT_LABELS.iceQueen)
    
    // Bathroom Boss: 5+ bathroom tasks
    if (s.bathroomTask >= 5) addLabel(emp, ACHIEVEMENT_LABELS.bathroomBoss)
    
    // Speed Demon: 50%+ early completions and at least 8 tasks
    if (s.early >= 8 && s.early / s.total >= 0.5) addLabel(emp, ACHIEVEMENT_LABELS.speedDemon)

    // Clutch: 5+ clutch finishes and at least 10 tasks (or 25%+ clutch rate)
    if (s.total >= 10 && s.clutch >= 5 && (s.clutch / s.total >= 0.25 || s.clutch >= 8)) {
      addLabel(emp, ACHIEVEMENT_LABELS.clutch)
    }

    // Solo Hero: 12+ tasks and 80%+ solo rate
    if (s.total >= 12 && s.solo / s.total >= 0.8) addLabel(emp, ACHIEVEMENT_LABELS.soloHero)
    
    // Night Owl: 70%+ night shift work and at least 10 tasks
    if (s.nightShift >= 10 && s.nightShift / s.total >= 0.7) {
      addLabel(emp, ACHIEVEMENT_LABELS.nightOwl)
    }
    
    // Morning Star: 70%+ morning shift work and at least 10 tasks
    if (s.morningShift >= 10 && s.morningShift / s.total >= 0.7) {
      addLabel(emp, ACHIEVEMENT_LABELS.morningStar)
    }
    
    // Perfectionist: 0 late tasks and at least 15 completed
    if (s.late === 0 && s.total >= 15) addLabel(emp, ACHIEVEMENT_LABELS.perfectionist)
    
    // Team Player: 60%+ collaborative tasks and at least 8 tasks
    if (s.teamWork >= 8 && s.teamWork / s.total >= 0.6) {
      addLabel(emp, ACHIEVEMENT_LABELS.teamPlayer)
    }

    // Tag Team: higher bar than Team Player (more likely to differentiate)
    if (s.total >= 12 && s.teamWork >= 10 && s.teamWork / s.total >= 0.7) {
      addLabel(emp, ACHIEVEMENT_LABELS.tagTeam)
    }
    
    // Cleanup Crew: 8+ cleaning tasks
    if (s.cleaningTask >= 8) addLabel(emp, ACHIEVEMENT_LABELS.cleanupCrew)
    
    // Consistent: 20+ total tasks
    if (s.total >= 20) addLabel(emp, ACHIEVEMENT_LABELS.consistent)
    
    // Sauce Boss: 5+ yum-yum/sauce tasks
    if (s.sauceTask >= 5) addLabel(emp, ACHIEVEMENT_LABELS.sauceBoss)
    
    // Stock Star: 8+ stocking/refill tasks
    if (s.stockTask >= 8) addLabel(emp, ACHIEVEMENT_LABELS.stockStar)
    
    // First Finish: First to complete a task in a window 10+ times
    if (s.firstFinishes >= 10) addLabel(emp, ACHIEVEMENT_LABELS.firstFinish)
  })
  
  return labels
}

/** v3 shift HUD: border + soft tint from employee color (replaces avatar circle). `accentEdge` mirrors for right column. */
function shiftPlayerSlotAccentStyle(
  hex: string | undefined,
  accentEdge: 'start' | 'end' = 'start'
): CSSProperties | undefined {
  if (!hex) return undefined
  const t = hex.trim()
  const full =
    t.length === 4 && t.startsWith('#')
      ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
      : t.startsWith('#')
        ? t
        : `#${t}`
  if (!/^#[0-9a-fA-F]{6}$/.test(full)) {
    return accentEdge === 'end'
      ? { borderRight: `4px solid ${hex}` }
      : { borderLeft: `4px solid ${hex}` }
  }
  if (accentEdge === 'end') {
    return {
      borderRight: `4px solid ${full}`,
      background: `linear-gradient(270deg, ${full}1a 0%, rgba(255, 255, 255, 0.92) 44%)`,
    }
  }
  return {
    borderLeft: `4px solid ${full}`,
    background: `linear-gradient(90deg, ${full}1a 0%, rgba(255, 255, 255, 0.92) 44%)`,
  }
}

/** Leaderboard v3: initials on white circle (first + last initial, or first two letters). */
function leaderboardDisplayInitials(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0][0] ?? ''
    const b = parts[parts.length - 1][0] ?? ''
    return (a + b).toUpperCase()
  }
  if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
  return parts[0][0].toUpperCase()
}

/** Labels hidden on Day/Night shift HUD chips (still shown elsewhere, e.g. leaderboard). */
function shiftHudSlotLabelsForDisplay(labels: EmployeeLabel[] | undefined): EmployeeLabel[] {
  if (!labels?.length) return []
  return labels.filter((l) => l.id !== 'perfectionist' && l.id !== 'firstFinish')
}

type RewardStarParticle = {
  id: string
  startX: number
  startY: number
  dx: number
  dy: number
  dxMid: number
  dyMid: number
  rx: number
  delayMs: number
  durMs: number
  sizePx: number
  rotDeg: number
}

const LOCAL_WINDOW_WRITE_GUARD_MS = 2000

const stringArraysEqual = (a: string[] | undefined | null, b: string[] | undefined | null): boolean => {
  const aArr = Array.isArray(a) ? a : []
  const bArr = Array.isArray(b) ? b : []
  return aArr.length === bArr.length && aArr.every((v, i) => v === bArr[i])
}

const numericRecordEqual = (a?: Record<string, number>, b?: Record<string, number>): boolean => {
  if (!a && !b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((k) => a[k] === b[k])
}

/** Shallow-deep compare for Firestore window echo suppression during local celebration. */
const taskCompletionsEqual = (a: TaskCompletion, b: TaskCompletion): boolean => {
  if (a.status !== b.status) return false
  if (a.completedAt !== b.completedAt) return false
  if (!stringArraysEqual(a.assignees, b.assignees)) return false
  if (!!a.assignedByAdmin !== !!b.assignedByAdmin) return false
  if (!!a.completedLate !== !!b.completedLate) return false
  if (!!a.lateForgiven !== !!b.lateForgiven) return false
  if (!!a.completedEarly !== !!b.completedEarly) return false
  if (!!a.autoAssigned !== !!b.autoAssigned) return false
  if (!!a.didNotNeedToComplete !== !!b.didNotNeedToComplete) return false
  if (a.deferredToClose !== b.deferredToClose) return false
  if (!numericRecordEqual(a.orderReportCounts, b.orderReportCounts)) return false
  const aIce = a.iceSides
  const bIce = b.iceSides
  if (!!aIce !== !!bIce) return false
  if (aIce && bIce && (aIce.left !== bIce.left || aIce.right !== bIce.right)) return false
  const aTowel = a.towelSides
  const bTowel = b.towelSides
  if (!!aTowel !== !!bTowel) return false
  if (aTowel && bTowel && (aTowel.diningBar !== bTowel.diningBar || aTowel.bowlStation !== bTowel.bowlStation)) {
    return false
  }
  return true
}

const windowTaskMapsEqual = (
  a: Record<string, TaskCompletion>,
  b: Record<string, TaskCompletion>,
): boolean => {
  // Any unexpected shape (e.g. a malformed Firestore completion) must NOT throw here:
  // this runs inside a setTaskState updater, so a throw becomes a render-phase crash.
  // Returning false simply means "not equal" → the normal setTaskState path runs.
  try {
    if (!a || !b) return false
    const aKeys = Object.keys(a)
    if (aKeys.length !== Object.keys(b).length) return false
    for (let i = 0; i < aKeys.length; i++) {
      const key = aKeys[i]
      const aCompletion = a[key]
      const bCompletion = b[key]
      if (!aCompletion || !bCompletion) return false
      if (!taskCompletionsEqual(aCompletion, bCompletion)) return false
    }
    return true
  } catch {
    return false
  }
}

/** Memoized score cell shared by main Shift HUD and v3 notify strip. */
const ShiftHudScoreDisplay = memo(function ShiftHudScoreDisplay({
  row,
  scoreOverride,
  showDayAmPmSplit,
}: {
  row: LeaderRow | undefined
  scoreOverride: number | null
  showDayAmPmSplit: boolean
}) {
  if (!row) return <>—</>
  if (!showDayAmPmSplit) return <>{shiftHudPointsCell(scoreOverride, row)}</>
  const pmText = shiftHudPointsCell(scoreOverride, row)
  const amText = String(shiftHudAmDisplayScore(row))
  return (
    <>
      <span className="slot-score-am" aria-label={`11AM ${amText}`}>
        <span className="slot-score-am-label">11A</span>
        <span className="slot-score-am-value">{amText}</span>
      </span>
      <span className="slot-score-pm" aria-label={`5PM ${pmText}`}>
        {pmText}
      </span>
    </>
  )
})

/**
 * Flying-stars overlay. Memoized so the 14-18 animated nodes only reconcile when
 * the star list itself changes, not on every unrelated App re-render (e.g. the
 * per-second clock ticks) while the animation is on screen. Visual output is
 * identical to the previous inline render.
 */
const RewardStarsOverlay = memo(({ stars }: { stars: RewardStarParticle[] }) => {
  if (stars.length === 0) return null
  return (
    <div className="reward-overlay" aria-hidden>
      {stars.map((s) => (
        <div
          key={s.id}
          className="reward-star"
          style={{
            left: `${s.startX}px`,
            top: `${s.startY}px`,
            ['--dx' as any]: `${s.dx}px`,
            ['--dy' as any]: `${s.dy}px`,
            ['--dxMid' as any]: `${s.dxMid}px`,
            ['--dyMid' as any]: `${s.dyMid}px`,
            // Pre-computed intermediate values for Safari compatibility (avoids calc() in keyframes)
            ['--dx15' as any]: `${s.dxMid * 0.2}px`,
            ['--dy15' as any]: `${s.dyMid * 0.2}px`,
            ['--rot15' as any]: `${s.rotDeg * 0.15}deg`,
            ['--rot55' as any]: `${s.rotDeg * 0.5}deg`,
            ['--delay' as any]: `${s.delayMs}ms`,
            ['--dur' as any]: `${s.durMs}ms`,
            ['--size' as any]: `${s.sizePx}px`,
            ['--rot' as any]: `${s.rotDeg}deg`,
          }}
        >
          ⭐
        </div>
      ))}
    </div>
  )
})
RewardStarsOverlay.displayName = 'RewardStarsOverlay'

function App({
  uiVariant = 'v2',
  v3AdminPosEnabled = true,
  v3Release = '3.0',
  deploymentChannel = 'main',
}: {
  uiVariant?: 'v2' | 'v3'
  /** Firestore `config/appUi.v3AdminPosEnabled` — v3 Home menu only; ignored for v2. */
  v3AdminPosEnabled?: boolean
  /** Firestore `config/appUi.v3Release` — only when `uiVariant === 'v3'`. Gate 3.1-only features with `isV31`. */
  v3Release?: '3.0' | '3.1'
  /** `beta` from `beta.html` entry — enables beta-only UI (ignored for v2). */
  deploymentChannel?: 'main' | 'beta'
}) {
  const isV3Ui = uiVariant === 'v3'
  /** New 3.1-only behavior: gate with `isV31` (v3 shell + Firestore `config/appUi.v3Release === '3.1'`). */
  const isV31 = isV3Ui && v3Release === '3.1'
  /** Main Hosting: screensaver when Firestore says 3.1. Beta Hosting: always (v3) so testers can use it without `v3ReleaseBeta`. */
  const screensaverEnabled = isV3Ui && (isV31 || deploymentChannel === 'beta')
  /** Beta Hosting (`deploymentChannel === 'beta'`) only — not gated on Firestore 3.1; local-only Demo Day affordance. */
  const showBetaDemoModeFooter = deploymentChannel === 'beta' && isV3Ui
  /** Beta-only: manual screensaver preview (same strip as Demo mode). */
  const showBetaScreensaverPreview = showBetaDemoModeFooter && screensaverEnabled
  /** Keep music reminder popup off on beta preview site. */
  const musicReminderEnabled = deploymentChannel !== 'beta'
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()))
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>(() => getCurrentWindow())
  // When true, the UI "follows" the current time window (11/17/21) while visible.
  // If the user manually selects a different window (e.g. 5PM/9PM while it's 11AM),
  // we disable this so their selection doesn't snap back to "now".
  const [followCurrentWindow, setFollowCurrentWindow] = useState<boolean>(true)
  // If a user is inactive for a while, we snap back to "today" + current window.
  // (This is intentionally interaction-based, not just "tab hidden".)
  const INACTIVITY_SNAP_MS = 5 * 60_000
  const SCREENSAVER_IDLE_MS = 120_000
  const SCREENSAVER_POLL_MS = 5000
  const lastInteractionTsRef = useRef<number>(Date.now())
  /** Idle screensaver opens before `handleWindowChange` exists — call via ref. */
  const snapBrowseContextToLiveNowRef = useRef<() => void>(() => {})
  const [screensaverOpen, setScreensaverOpen] = useState(false)
  /** Bumps when the screensaver opens so non-AI quote lines stay stable for that session. */
  const [screensaverSessionId, setScreensaverSessionId] = useState(0)
  /** Beta QA: force sample quote or fake break/shift countdown (ignores live break state). */
  const [screensaverBetaDemoOverride, setScreensaverBetaDemoOverride] = useState<
    | null
    | { kind: 'quote'; line: string }
    | { kind: 'countdown'; value: ScreensaverCountdown }
  >(null)
  /** Brief full-screen layer after user dismisses screensaver — absorbs delayed synthetic clicks on touch (ghost taps). */
  const [screensaverDismissShield, setScreensaverDismissShield] = useState(false)
  /** Browser `setTimeout` id (not `NodeJS.Timeout` from Node typings). */
  const screensaverDismissShieldTimeoutRef = useRef<number | null>(null)
  const [taskState, setTaskState] = useState<TaskState>(() => readCache<TaskState>('traq-task-state-v1', {}))
  /** Suppresses redundant Firestore echo setTaskState during local completion celebration. */
  const localWindowWriteGuardRef = useRef<{
    dateKey: string
    windowKey: WindowKey
    expiresAt: number
  } | null>(null)
  const [newBadgeTaskState, setNewBadgeTaskState] = useState<TaskState>({})
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const activeCardRectRef = useRef<DOMRect | null>(null)
  const modalSheetRef = useRef<HTMLDivElement>(null)
  const isClosingModalRef = useRef(false)
  /** v3 success dismiss: backdrop click-through while sheet slides away (Phase 5). */
  const [modalSuccessDismiss, setModalSuccessDismiss] = useState(false)
  const v3NotifyP1ScoreRef = useRef<HTMLDivElement | null>(null)
  const v3NotifyP2ScoreRef = useRef<HTMLDivElement | null>(null)
  const v3ShiftNotifyHeaderRef = useRef<HTMLDivElement | null>(null)
  const [v3ShiftNotifyOpen, setV3ShiftNotifyOpen] = useState(false)
  const [tick, setTick] = useState<number>(() => Date.now())
  const [assignees, setAssignees] = useState<string[]>([])
  const [splitMode, setSplitMode] = useState(false)
  const [showUnsplitOptions, setShowUnsplitOptions] = useState(false)
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false)
  const [showAllEmployeesInSelector, setShowAllEmployeesInSelector] = useState(false)
  // Combined Ice (Left+Right) selection state
  type IceSidesDraft = { left: string | null; right: string | null }
  // Draft should persist even if the modal is closed/reopened before both sides are selected.
  // Key by dateKey + window + taskId (ice-5pm vs ice-close) to avoid cross-contamination.
  const [iceSidesDraftByKey, setIceSidesDraftByKey] = useState<Record<string, IceSidesDraft>>({})
  const [iceSidesDraftDirtyByKey, setIceSidesDraftDirtyByKey] = useState<Record<string, boolean>>({})
  const [iceSidesDraft, setIceSidesDraft] = useState<IceSidesDraft>(() => ({
    left: null,
    right: null,
  }))
  const [pendingIceSide, setPendingIceSide] = useState<'left' | 'right' | null>(null)
  const iceLeftTileRef = useRef<HTMLButtonElement | null>(null)
  const iceRightTileRef = useRef<HTMLButtonElement | null>(null)
  const icePageEmojiLayerRef = useRef<HTMLDivElement | null>(null)
  const iceFillAnimCleanupRef = useRef<number | null>(null)
  // Towel split (Dining/Bar + Bowl Station) state
  type TowelSidesDraft = { diningBar: string | null; bowlStation: string | null }
  const [towelSidesDraftByKey, setTowelSidesDraftByKey] = useState<Record<string, TowelSidesDraft>>({})
  const [towelSidesDraftDirtyByKey, setTowelSidesDraftDirtyByKey] = useState<Record<string, boolean>>({})
  const [towelSidesDraft, setTowelSidesDraft] = useState<TowelSidesDraft>(() => ({ diningBar: null, bowlStation: null }))
  const [pendingTowelSide, setPendingTowelSide] = useState<'diningBar' | 'bowlStation' | null>(null)
  const towelDiningTileRef = useRef<HTMLButtonElement | null>(null)
  const towelBowlTileRef = useRef<HTMLButtonElement | null>(null)
  const towelPageEmojiLayerRef = useRef<HTMLDivElement | null>(null)
  const towelFillAnimCleanupRef = useRef<number | null>(null)
  // Separate ref for the task-init effect to detect task changes (without conflicting with break-selection effect's ref).
  const prevTaskIdForInitRef = useRef<string | null>(null)
  const [showChecklistModal, setShowChecklistModal] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  const [showNightShiftPrompt, setShowNightShiftPrompt] = useState(false)
  const [pendingNightShiftTask, setPendingNightShiftTask] = useState<{ taskId: string; taskName: string; assignees: string[] } | null>(null)
  const [nightShiftReports, setNightShiftReports] = useState<NightShiftReport[]>([])
  const [dismissingReport, setDismissingReport] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [adminView, setAdminView] = useState<
    'employees' | 'tasks' | 'dailyTasks' | 'logs' | 'music' | 'availability' | 'timeoff' | 'managementReports' | 'notifications' | 'applications' | 'demo'
  >('employees')
  // Demo mode: override countdown for testing
  const [demoCountdownEndMs, setDemoCountdownEndMs] = useState<number | null>(null)
  const [demoShiftChangeEndMs, setDemoShiftChangeEndMs] = useState<number | null>(null)
  // Demo Day: sandboxed day for testing task UX without writing to Firestore.
  const [demoDayKey, setDemoDayKey] = useState<string | null>(null)
  const [demoBreakSelectionByDateKey, setDemoBreakSelectionByDateKey] = useState<Record<string, BreakSelection | null>>({})
  const [demoSoloModeByDateKey, setDemoSoloModeByDateKey] = useState<Record<string, SoloMode | null>>({})
  // Demo Day: local-only Daily Task run(s), keyed by dateKey.
  const [demoDailyTaskRunByDateKey, setDemoDailyTaskRunByDateKey] = useState<Record<string, DailyTaskRun | null>>({})
  const demoPrevNavRef = useRef<{ date: Date; windowKey: WindowKey; follow: boolean } | null>(null)
  const [adminAvailabilityEditingEmployee, setAdminAvailabilityEditingEmployee] = useState<string | null>(null)
  const [adminTimeOffProcessing, setAdminTimeOffProcessing] = useState<string | null>(null)
  const [employees, setEmployees] = useState<string[]>(() => {
    const cached = readCache<string[]>('traq-employees-v1', [])
    return cached.length ? cached : USERS
  })
  const [archivedAtMs, setArchivedAtMs] = useState<EmployeeArchiveMap>(() => {
    const roster = readCache<{ archivedAtMs?: EmployeeArchiveMap }>('traq-employee-roster-v1', {})
    return roster?.archivedAtMs && typeof roster.archivedAtMs === 'object' ? roster.archivedAtMs : {}
  })
  const activeEmployees = useMemo(
    () => getActiveEmployees(employees, archivedAtMs),
    [employees, archivedAtMs]
  )
  const [employeeColors, setEmployeeColors] = useState<EmployeeColors>(() =>
    readCache<EmployeeColors>('traq-employee-colors-v1', {})
  )
  // `employeeColors` state updates are async; keep a ref so "pick color -> continue" doesn't race and re-open the picker.
  const employeeColorsRef = useRef<EmployeeColors>(employeeColors)
  useEffect(() => {
    employeeColorsRef.current = employeeColors
  }, [employeeColors])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pendingColorEmployee, setPendingColorEmployee] = useState<string | null>(null)
  const [pendingColorAction, setPendingColorAction] = useState<'task' | 'break' | 'ice' | 'towel' | 'noop' | null>(null)
  const [pendingBreakWizardIdx, setPendingBreakWizardIdx] = useState<0 | 1 | null>(null)
  const [taskOrder, setTaskOrder] = useState<Record<WindowKey, string[]>>(() =>
    readCache<Record<WindowKey, string[]>>('traq-task-order-v1', {} as Record<WindowKey, string[]>)
  )
  const [taskOrderV3, setTaskOrderV3] = useState<Record<WindowKey, string[]>>(() =>
    readCache<Record<WindowKey, string[]>>('traq-task-order-v3-v1', {} as Record<WindowKey, string[]>)
  )
  const [taskStages, setTaskStages] = useState<TaskStageMap>(() =>
    readCache<TaskStageMap>('traq-task-stages-v1', {})
  )
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalog>(() =>
    readCache<TaskCatalog>('traq-task-catalog-v1', { tasks: [] })
  )
  const [taskOverrides, setTaskOverrides] = useState<TaskOverrides>(() =>
    readCache<TaskOverrides>('traq-task-overrides-v1', { overrides: {} })
  )
  const [dailyTaskCatalog, setDailyTaskCatalogState] = useState<DailyTaskCatalog>(() =>
    readCache<DailyTaskCatalog>('traq-daily-task-catalog-v1', { tasks: [] })
  )
  const [todayDailyTaskRun, setTodayDailyTaskRun] = useState<DailyTaskRun | null>(null)
  const [todayDailyTaskWeek, setTodayDailyTaskWeek] = useState<DailyTaskWeek | null>(null)
  // -1 = unrevealed, 0 = name, 1 = materials, 2 = what-to-do, 3 = employee prompt, 4 = finished
  const [dailyTaskStep, setDailyTaskStep] = useState<number>(-1)
  // Up to 2 names for split credit (equal credit).
  const [dailyTaskEmployees, setDailyTaskEmployees] = useState<string[]>([])
  const [dailyTaskBusy, setDailyTaskBusy] = useState(false)
  const [dailyTaskError, setDailyTaskError] = useState<string | null>(null)
  const [dailyTaskImageUrlByPath, setDailyTaskImageUrlByPath] = useState<Record<string, string>>({})
  const [taskImageUrlByPath, setTaskImageUrlByPath] = useState<Record<string, string>>({})
  const [showDailyTaskModal, setShowDailyTaskModal] = useState(false)
  const [dailyTaskRevealing, setDailyTaskRevealing] = useState(false)
  const [showDailyTaskEmployeeSelector, setShowDailyTaskEmployeeSelector] = useState(false)
  const [adminTaskName, setAdminTaskName] = useState<string>('')
  const [adminTaskIcon, setAdminTaskIcon] = useState<string>('🧩')
  const [adminTaskWindows, setAdminTaskWindows] = useState<Record<WindowKey, boolean>>({ '11': false, '17': true, '21': false })
  const [adminTaskStages, setAdminTaskStages] = useState<Partial<Record<WindowKey, 1 | 2>>>({})
  const [adminTaskWeight, setAdminTaskWeight] = useState<string>('1')
  const [adminTaskRequirementsText, setAdminTaskRequirementsText] = useState<string>('')
  const [adminTaskError, setAdminTaskError] = useState<string | null>(null)
  const [adminEditingReqTaskId, setAdminEditingReqTaskId] = useState<string | null>(null)
  const [adminEditingReqText, setAdminEditingReqText] = useState<string>('')
  const [adminEditingReqError, setAdminEditingReqError] = useState<string | null>(null)
  const [adminEditingNameTaskId, setAdminEditingNameTaskId] = useState<string | null>(null)
  const [adminEditingNameText, setAdminEditingNameText] = useState<string>('')
  const [adminEditingNameError, setAdminEditingNameError] = useState<string | null>(null)
  const [adminEditingWindowsTaskId, setAdminEditingWindowsTaskId] = useState<string | null>(null)
  const [adminEditingWindows, setAdminEditingWindows] = useState<Record<WindowKey, boolean>>({ '11': false, '17': false, '21': false })
  const [adminEditingWindowsEffectiveDateKey, setAdminEditingWindowsEffectiveDateKey] = useState<string>('') // YYYY-MM-DD
  const [adminEditingWindowsError, setAdminEditingWindowsError] = useState<string | null>(null)
  const [adminEditingWeightTaskId, setAdminEditingWeightTaskId] = useState<string | null>(null)
  const [adminEditingWeight, setAdminEditingWeight] = useState<string>('1')
  const [adminEditingWeightEffectiveDateKey, setAdminEditingWeightEffectiveDateKey] = useState<string>('') // YYYY-MM-DD
  const [adminEditingWeightError, setAdminEditingWeightError] = useState<string | null>(null)
  const [adminTasksSearch, setAdminTasksSearch] = useState<string>('')
  const [adminTasksFilter, setAdminTasksFilter] = useState<'all' | 'overridden'>('all')
  const [adminApplyingIceCombine, setAdminApplyingIceCombine] = useState(false)

  // Admin: Daily Tasks editor
  const [adminDailyEditingId, setAdminDailyEditingId] = useState<string | null>(null)
  const [adminDailyName, setAdminDailyName] = useState<string>('')
  const [adminDailyFrequencyType, setAdminDailyFrequencyType] = useState<'normal' | 'weekly'>('normal')
  const [adminDailyQuota, setAdminDailyQuota] = useState<1 | 2 | 3>(1)
  const [adminDailyMaterialsDesc, setAdminDailyMaterialsDesc] = useState<string>('')
  const [adminDailyWhatToDoDesc, setAdminDailyWhatToDoDesc] = useState<string>('')
  const [adminDailyMaterialsFile, setAdminDailyMaterialsFile] = useState<File | null>(null)
  const [adminDailyWhatToDoFile, setAdminDailyWhatToDoFile] = useState<File | null>(null)
  const [adminDailySaving, setAdminDailySaving] = useState(false)
  const [adminDailySaveError, setAdminDailySaveError] = useState<string | null>(null)
  const [adminDailyUploadPct, setAdminDailyUploadPct] = useState<{ materials?: number; whatToDo?: number }>({})
  const [adminDailyWeeksByStart, setAdminDailyWeeksByStart] = useState<Record<string, DailyTaskWeek | null>>({})
  const [adminDailyRunsRecent, setAdminDailyRunsRecent] = useState<DailyTaskRun[]>([])
  const [adminDailyRunsLoading, setAdminDailyRunsLoading] = useState(false)
  const [adminDailyOverrideSaving, setAdminDailyOverrideSaving] = useState<string | null>(null) // dateKey while saving
  const [adminDailyRegenerating, setAdminDailyRegenerating] = useState(false)
  const [adminDailyOverridePickByDateKey, setAdminDailyOverridePickByDateKey] = useState<Record<string, string>>({})
  const [adminDailyDebugInfo, setAdminDailyDebugInfo] = useState<string[] | null>(null)
  const [adminDailyDebugInitAtMs] = useState<number>(() => Date.now())
  const [adminDailyReclosingToday, setAdminDailyReclosingToday] = useState(false)
  const [adminDailyRunHistoryEdit, setAdminDailyRunHistoryEdit] = useState<DailyTaskRun | null>(null)
  const [adminDailyRunHistoryTitle, setAdminDailyRunHistoryTitle] = useState('')
  const [adminDailyRunHistoryEmp1, setAdminDailyRunHistoryEmp1] = useState('')
  const [adminDailyRunHistoryEmp2, setAdminDailyRunHistoryEmp2] = useState('')
  const [adminDailyRunHistoryCreditTaskId, setAdminDailyRunHistoryCreditTaskId] = useState('')
  const [adminDailyRunHistorySaving, setAdminDailyRunHistorySaving] = useState(false)
  const [adminDailyRunHistoryError, setAdminDailyRunHistoryError] = useState<string | null>(null)

  const [selectionLogs, setSelectionLogs] = useState<SelectionLogEntry[]>(() =>
    readCache<SelectionLogEntry[]>('traq-logs-v1', [])
  )

  const renderRequirementText = useCallback((text: string) => {
    // UI-only formatting: support Markdown-style **bold** (no HTML parsing).
    // If markers are unmatched, render the raw text.
    const delimiterCount = text.split('**').length - 1
    if (delimiterCount % 2 === 1) return text

    const parts = text.split('**')
    return parts.map((part, idx) => {
      if (!part) return null
      return idx % 2 === 1 ? <strong key={idx}>{part}</strong> : <span key={idx}>{part}</span>
    })
  }, [])
  // Internal: holds the break selection along with the dateKey it belongs to.
  // Use the derived `breakSelection` (defined after `selectedDateKey`) instead of reading this directly,
  // so date-sensitive code can't accidentally act on a stale value captured during a date navigation re-render.
  const [breakSelectionState, setBreakSelectionState] = useState<{ dateKey: string; value: BreakSelection | null } | null>(null)
  const [soloMode, setSoloMode] = useState<SoloMode | null>(null)
  // Today's break selection for countdown (independent of selectedDate)
  const [todayBreakSelection, setTodayBreakSelection] = useState<BreakSelection | null>(null)
  // 1-second countdown clock (only active when countdown is visible)
  const [countdownNowMs, setCountdownNowMs] = useState<number>(() => Date.now())
  // 1-second clock for the window-unlock countdown (only active in the final ~30 min before unlock)
  const [unlockCountdownNowMs, setUnlockCountdownNowMs] = useState<number>(() => Date.now())
  // Break celebration overlay state
  const [breakCelebration, setBreakCelebration] = useState<{ show: boolean; employee: string } | null>(null)
  const breakCelebrationTimeoutRef = useRef<number | null>(null)
  type BreakDraftSlot = { employee: string; shiftType: '' | BreakShiftType; start: string }
  // Break Selection draft should persist even if the modal is closed/reopened without saving.
  // We key by dateKey so navigating days doesn't cross-contaminate drafts.
  const [breakDraftByDateKey, setBreakDraftByDateKey] = useState<Record<string, BreakDraftSlot[]>>({})
  // Only use/persist a cached draft if the user has actually modified it (otherwise reopen should reflect the latest saved plan).
  const [breakDraftDirtyByDateKey, setBreakDraftDirtyByDateKey] = useState<Record<string, boolean>>({})
  const [breakDraftSlots, setBreakDraftSlots] = useState<BreakDraftSlot[]>(() => [
    { employee: '', shiftType: '', start: '' },
    { employee: '', shiftType: '', start: '' },
  ])
  const [breakDraftError, setBreakDraftError] = useState<string | null>(null)
  type BreakWizardStep = 'employee' | 'shift' | 'time'
  const [breakWizardSlotIdx, setBreakWizardSlotIdx] = useState<0 | 1 | null>(null)
  const [breakWizardStep, setBreakWizardStep] = useState<BreakWizardStep | null>(null)
  const prevActiveTaskIdRef = useRef<string | null>(null)
  const [musicControlLogs, setMusicControlLogs] = useState<MusicControlLogEntry[]>(() =>
    readCache<MusicControlLogEntry[]>('traq-music-control-logs-v1', [])
  )
  const [showAllSelectionLogs, setShowAllSelectionLogs] = useState(false)
  const [showAllMusicControlLogs, setShowAllMusicControlLogs] = useState(false)
  const [adminLoginAttempts, setAdminLoginAttempts] = useState<AdminLoginAttempt[]>([])
  const [showAllAdminLoginAttempts, setShowAllAdminLoginAttempts] = useState(false)
  const FORCE_REFRESH_COUNTDOWN_SEC = 5
  const [showForceRefreshPrompt, setShowForceRefreshPrompt] = useState(false)
  const [forceRefreshSecondsLeft, setForceRefreshSecondsLeft] = useState<number>(FORCE_REFRESH_COUNTDOWN_SEC)
  const forceRefreshIntervalRef = useRef<number | null>(null)
  const appLoadTimeRef = useRef<number>(Date.now())
  const LS_MUSIC_PLAYBACK_STATE_KEY = 'traq-music-playback-state-v1'
  const [musicIsActuallyPlaying, setMusicIsActuallyPlaying] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(LS_MUSIC_PLAYBACK_STATE_KEY)
      if (!raw) return false
      const data = JSON.parse(raw) as { isActuallyPlaying?: boolean }
      return !!data.isActuallyPlaying
    } catch {
      return false
    }
  })
  // Music reminder: avoid flashing between-track / buffering blips by requiring music to be
  // continuously not-playing for a short grace window before showing the reminder.
  const MUSIC_REMINDER_IDLE_GRACE_MS = 30_000
  /** Poll often; long intervals + background throttling can leave the overlay up well past 8:30pm. */
  const MUSIC_REMINDER_EVAL_INTERVAL_MS = 20_000
  const [musicNotPlayingSinceMs, setMusicNotPlayingSinceMs] = useState<number | null>(() => {
    return musicIsActuallyPlaying ? null : Date.now()
  })
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboardView, setLeaderboardView] = useState<'month' | 'today'>('month')
  const [leaderboardMonth, setLeaderboardMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [lbMonthTaskState, setLbMonthTaskState] = useState<TaskState>({})
  const [lbMonthLoading, setLbMonthLoading] = useState(false)
  const [lbMonthLoadError, setLbMonthLoadError] = useState<string | null>(null)
  // Time-based atmosphere (sun-aligned to Hermitage, TN local solar times)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() =>
    getTimeOfDaySolar(new Date(), DEFAULT_SOLAR_COORDS)
  )
  const [aiShiftContent, setAiShiftContent] = useState<ShiftQuoteResponse | null>(null)
  const [taskCardsJiggle, setTaskCardsJiggle] = useState(false)
  const [taskGridEntered, setTaskGridEntered] = useState(false)
  const [manualWindowUnlockKeys, setManualWindowUnlockKeys] = useState<Set<string>>(() => new Set())
  const [windowUnlockToast, setWindowUnlockToast] = useState<string | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState<boolean>(() => !hasBootstrapCache())
  const [isInitialSyncing, setIsInitialSyncing] = useState<boolean>(() => hasBootstrapCache())
  const [showStartupCover, setShowStartupCover] = useState<boolean>(() => hasBootstrapCache())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isLoadingWindow, setIsLoadingWindow] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [taskSplitInlinePhase, setTaskSplitInlinePhase] = useState<TaskSplitInlinePhase | null>(null)
  const [taskSplitEmpA, setTaskSplitEmpA] = useState('')
  const [taskSplitEmpB, setTaskSplitEmpB] = useState('')
  const [taskSplitResult, setTaskSplitResult] = useState<TaskSplitSuggestResult | null>(null)
  const [taskSplitErrorBanner, setTaskSplitErrorBanner] = useState<string | null>(null)
  const [taskSplitIceSplitChoice, setTaskSplitIceSplitChoice] = useState(false)
  /** Dice flow is using the shared employee grid overlay to pick the split pair (not to complete a task). */
  const [splitSetupSelecting, setSplitSetupSelecting] = useState(false)
  /** Post-pick "Split Ice?" step shown before generating the dice split. */
  const [splitIcePromptOpen, setSplitIcePromptOpen] = useState(false)
  /** User chose team split in the current split-required modal session (resets when modal closes or task changes). */
  const [nightSplitChoseTeamSplit, setNightSplitChoseTeamSplit] = useState(false)
  /** Panel cards are flying out before the auto-finish celebration. */
  const [splitEvacuating, setSplitEvacuating] = useState(false)
  /** Allow the window-complete celebration to show after an auto-finished split even if non-split tasks remain. */
  const [splitAutoCelebration, setSplitAutoCelebration] = useState(false)
  const taskSplitSuggestGenRef = useRef(0)
  /** Blocks stale Firestore snapshots from re-opening a split until Undo delete is confirmed. */
  const taskSplitUndoneKeyRef = useRef<string | null>(null)
  /** View whose split auto-finished: keep the panel hidden (contract kept) without an Undo delete. */
  const taskSplitCompletedKeyRef = useRef<string | null>(null)
  /** Guards the one-shot auto-finish sequence + holds its pending evacuation timer. */
  const splitAutoFinishStartedRef = useRef(false)
  const splitAutoFinishTimerRef = useRef<number | null>(null)
  /** Ignore transient Firestore null snapshots while a contract write is in flight. */
  const fairSplitPendingWriteRef = useRef<'17' | '21' | null>(null)
  const taskSplitResultRef = useRef<TaskSplitSuggestResult | null>(null)
  const taskSplitOpenPrefillRef = useRef<{
    taskId: string
    assignees?: string[]
    iceSides?: { left: string; right: string }
    /** Open the combined-ice drawer pre-pointed at this side picker (split-ice virtual cards). */
    iceSide?: 'left' | 'right'
  } | null>(null)
  const [fairSplitContract17, setFairSplitContract17] = useState<FairSplitContractDoc | null>(null)
  const [fairSplitContract21, setFairSplitContract21] = useState<FairSplitContractDoc | null>(null)
  /** Secret training mode: windows of the selected date currently marked as training. */
  const [trainingWindowsForSelectedDate, setTrainingWindowsForSelectedDate] = useState<Set<WindowKey>>(
    () => new Set()
  )
  /** Training markers across the leaderboard month range, keyed `${dateKey}__${windowKey}`. */
  const [trainingDocsInRange, setTrainingDocsInRange] = useState<Set<string>>(() => new Set())
  /** Counts rapid taps on the locked Training tile; 5 within the window toggles training. */
  const trainingTapCountRef = useRef(0)
  const trainingTapResetTimerRef = useRef<number | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  /** v3 settings sheet (refresh app); opened from bottom-right Settings or logo when screensaver is off. */
  const [showAppSettingsMenu, setShowAppSettingsMenu] = useState(false)
  const [showPointsExplanation, setShowPointsExplanation] = useState(false)
  const [showCalculationModal, setShowCalculationModal] = useState(false)
  const [calculationEmployee, setCalculationEmployee] = useState<string | null>(null)

  // Time Off feature state
  const [showTimeOff, setShowTimeOff] = useState(false)
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [availabilityState, setAvailabilityState] = useState<AvailabilityState>({
    patterns: {},
    metaByEmployee: {},
  })
  
  // Job Applications (Bonfire portal) - admin only
  const [applications, setApplications] = useState<Application[]>([])
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null)
  const [applicationNotesDraft, setApplicationNotesDraft] = useState<Record<string, string>>({})
  
  // OUT / LOW STOCK feature state
  const [showStockReports, setShowStockReports] = useState(false)
  const [stockReports, setStockReports] = useState<StockReport[]>([])
  const [stockWizardStep, setStockWizardStep] = useState<'kind' | 'item' | null>(null)
  const [stockReporterName, setStockReporterName] = useState<string | null>(null)
  const [stockKind, setStockKind] = useState<StockReportKind | null>(null)
  const [stockItem, setStockItem] = useState('')
  const [stockSending, setStockSending] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const [stockSendFxVisible, setStockSendFxVisible] = useState(false)
  const [stockSendFxNonce, setStockSendFxNonce] = useState(0)
  const stockSendFxTimeoutRef = useRef<number | null>(null)
  const [stockFinishingId, setStockFinishingId] = useState<string | null>(null)
  const [stockDeletingId, setStockDeletingId] = useState<string | null>(null)

  const showStockCheckTaskModal = activeTaskId === 'stock-check'

  // Notify Management feature state
  type ManagementReportKind = 'leak' | 'broken' | 'insect' | 'custom'
  const [showNotifyManagement, setShowNotifyManagement] = useState(false)
  const [notifyWizardStep, setNotifyWizardStep] = useState<'kind' | 'details' | 'who' | null>(null)
  const [notifyKind, setNotifyKind] = useState<ManagementReportKind | null>(null)
  const [notifyCustomTitle, setNotifyCustomTitle] = useState('')
  const [notifyDetails, setNotifyDetails] = useState('')
  const [notifyReporterName, setNotifyReporterName] = useState<string | null>(null)
  const [notifySending, setNotifySending] = useState(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifySendFxVisible, setNotifySendFxVisible] = useState(false)
  const [notifySendFxNonce, setNotifySendFxNonce] = useState(0)
  const notifySendFxTimeoutRef = useRef<number | null>(null)
  // Wizard state: null = list view, otherwise wizard step
  const [timeOffWizardStep, setTimeOffWizardStep] = useState<'who' | 'availability' | 'select' | 'reason' | null>(null)
  const [timeOffSelectedEmployee, setTimeOffSelectedEmployee] = useState<string | null>(() => {
    try {
      return localStorage.getItem('traq-timeoff-employee-v1') || null
    } catch {
      return null
    }
  })
  const [timeOffRequestKind, setTimeOffRequestKind] = useState<'shift_blocks' | 'date_range'>('date_range')
  const [timeOffSelectedShifts, setTimeOffSelectedShifts] = useState<RequestedShift[]>([])
  const [timeOffDateRange, setTimeOffDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [timeOffReason, setTimeOffReason] = useState('')
  const [timeOffEditingId, setTimeOffEditingId] = useState<string | null>(null) // null = new request, string = editing
  const [timeOffCalendarMonth, setTimeOffCalendarMonth] = useState<Date>(() => startOfDay(new Date()))
  const [timeOffSaving, setTimeOffSaving] = useState(false)
  const [timeOffError, setTimeOffError] = useState<string | null>(null)
  const [timeOffDatePickerOpen, setTimeOffDatePickerOpen] = useState<'start' | 'end' | null>(null)
  const [timeOffDatePickerMonth, setTimeOffDatePickerMonth] = useState<Date>(() => startOfDay(new Date()))
  // LocalStorage key for remembering selected employee
  const LS_TIMEOFF_EMPLOYEE_KEY = 'traq-timeoff-employee-v1'

  // Notifications feature state (admin sends notifications to employees)
  const [notifications, setNotifications] = useState<NotificationDoc[]>([])
  const [notifTarget, setNotifTarget] = useState<'all' | string>('all') // 'all' or employee name
  const [notifMessage, setNotifMessage] = useState('')
  const [notifSending, setNotifSending] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)
  // Pending notifications overlay state (shows when employee is selected)
  const [pendingNotifEmployee, setPendingNotifEmployee] = useState<string | null>(null)
  const [pendingNotifQueue, setPendingNotifQueue] = useState<NotificationDoc[]>([])
  const [pendingNotifIndex, setPendingNotifIndex] = useState(0)

  // Print request overlay (admin sends document to iPad)
  const [printRequest, setPrintRequest] = useState<PrintRequestDoc | null>(null)
  const [printRequestPrinted, setPrintRequestPrinted] = useState(false)

  // Admin: Management Reports
  const [managementReports, setManagementReports] = useState<ManagementReport[]>([])
  const [mgmtReportProcessingId, setMgmtReportProcessingId] = useState<string | null>(null)

  // Task completion celebration: pulse the next incomplete task
  const [pulseTaskId, setPulseTaskId] = useState<string | null>(null)
  const pulseTimeoutRef = useRef<number | null>(null)

  // Merge built-in tasks with admin-created tasks from Firestore + apply requirements overrides.
  // NOTE: Built-in tasks are active by default (createdAtMs = 0), but may opt into delayed activation
  // by specifying a non-zero createdAtMs (e.g. to avoid retroactively affecting past leaderboard dates).
  const allTasks = useMemo((): Task[] => {
    const byId: Record<string, Task> = {}
    TASKS.forEach((t) => {
      byId[t.id] = { ...t, source: 'builtin', createdAtMs: t.createdAtMs ?? 0 }
    })
    ;(taskCatalog?.tasks || []).forEach((t: TaskDef) => {
      if (byId[t.id]) return
      byId[t.id] = { ...t, source: 'admin' }
    })

    const overrides = taskOverrides?.overrides || {}
    Object.keys(overrides).forEach((taskId) => {
      const ov = overrides[taskId] as TaskOverride | undefined
      const base = byId[taskId]
      if (!ov || !base) return
      const next: Task = { ...base }
      if (typeof ov.name === 'string' && ov.name.trim()) {
        next.name = ov.name.trim()
      }
      if (Array.isArray(ov.requirements) && ov.requirements.length > 0) {
        next.requirements = ov.requirements
        next.requirementsUpdatedAtMs = typeof ov.updatedAtMs === 'number' ? ov.updatedAtMs : undefined
        next.requirementsOverridden = true
      }
      if (ov.imagePath !== undefined) {
        next.imagePath = (ov.imagePath && ov.imagePath.trim()) || undefined
      }
      if (typeof ov.weight === 'number') {
        next.weight = ov.weight
      }
      if (typeof ov.requiresSplit === 'boolean') {
        next.requiresSplit = ov.requiresSplit
      }
      byId[taskId] = next
    })

    return Object.values(byId)
  }, [taskCatalog, taskOverrides])

  // Music missing reminder (local 11:00–20:29, off from 8:30pm): full-screen alert until snoozed/dismissed.
  // If music is still not playing, it can re-appear multiple times per day.
  const LS_MUSIC_MISSING_REMINDER_DISMISSED_UNTIL_KEY = 'traq-music-missing-reminder-dismissed-until-ms-v1'
  const [musicReminderDismissedUntilMs, setMusicReminderDismissedUntilMs] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LS_MUSIC_MISSING_REMINDER_DISMISSED_UNTIL_KEY)
      if (!raw) return 0
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    } catch {
      return 0
    }
  })
  const [musicReminderActive, setMusicReminderActive] = useState(false)
  const [musicReminderFlashOn, setMusicReminderFlashOn] = useState(true)
  const musicReminderFlashIntervalRef = useRef<number | null>(null)

  // Admin: music library + playlist management
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>(() => readCache<MusicTrack[]>('traq-music-tracks-v1', []))
  const [musicPlaylist, setMusicPlaylist] = useState<MusicPlaylist>(() =>
    readCache<MusicPlaylist>('traq-music-playlist-v1', { order: [] })
  )
  const [musicTitleDraftById, setMusicTitleDraftById] = useState<Record<string, string>>({})
  const [draggedMusicId, setDraggedMusicId] = useState<string | null>(null)
  const [dragOverMusicId, setDragOverMusicId] = useState<string | null>(null)
  const [musicUploadFile, setMusicUploadFile] = useState<File | null>(null)
  const [musicUploadTitle, setMusicUploadTitle] = useState('')
  const [musicUploadEnabled, setMusicUploadEnabled] = useState(true)
  const [musicUploadBusy, setMusicUploadBusy] = useState(false)
  const [musicUploadProgressPct, setMusicUploadProgressPct] = useState(0)
  const [musicUploadError, setMusicUploadError] = useState<string | null>(null)
  // Active music sessions (for remote playback control)
  const [musicSessions, setMusicSessions] = useState<MusicSession[]>([])
  // Admin UI clock (for accurate "active/stale" rendering without relying on heavy global tick)
  const [adminSessionsNowMs, setAdminSessionsNowMs] = useState<number>(() => Date.now())
  // Track command sending feedback per session (include error text to debug failures)
  const [commandFeedback, setCommandFeedback] = useState<
    Record<string, { status: 'sending' | 'sent' | 'error'; error?: string }>
  >({})

  // Good Morning (10:00 local) overlay + post-dismiss entrance
  const [goodMorningEpoch, setGoodMorningEpoch] = useState(0)
  const [goodMorningLocal, setGoodMorningLocal] = useState<GoodMorningLocalState | null>(() =>
    readGoodMorningLocal()
  )
  const [goodMorningTick, setGoodMorningTick] = useState(() => Date.now())
  const [goodMorningRevealPhase, setGoodMorningRevealPhase] = useState(false)
  const [goodMorningOverlayClock, setGoodMorningOverlayClock] = useState(() => Date.now())
  const goodMorningSessionIdRef = useRef<string>(getOrCreateGoodMorningSessionId())

  // Task modal: requirements auto-scroll (view-only hint for long requirement lists)
  const requirementsScrollRef = useRef<HTMLDivElement | null>(null)

  // Reward animation: star burst + points count-up (self-selection only)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const celebrationTiming = useMemo(() => getCelebrationTiming(prefersReducedMotion), [prefersReducedMotion])
  const rewardTargetRef = useRef<HTMLElement | null>(null)
  const p1ScoreRef = useRef<HTMLDivElement | null>(null)
  const p2ScoreRef = useRef<HTMLDivElement | null>(null)
  const shiftHudHeaderRef = useRef<HTMLDivElement | null>(null)
  const shiftHudExtraRef = useRef<HTMLDivElement | null>(null)
  const dailyTaskTeaserCardRef = useRef<HTMLDivElement | null>(null)
  const [shiftHudPulse, setShiftHudPulse] = useState(false)
  const [p1ScoreOverride, setP1ScoreOverride] = useState<number | null>(null)
  const [p2ScoreOverride, setP2ScoreOverride] = useState<number | null>(null)
  // Authoritative override value while the count-up animation runs. Updated per frame
  // without setState (the value is written straight to the score DOM node); render call
  // sites read `ref.current ?? state` so incidental re-renders stay consistent.
  const p1ScoreOverrideRef = useRef<number | null>(null)
  const p2ScoreOverrideRef = useRef<number | null>(null)
  const [scoreAnim, setScoreAnim] = useState<{
    slot: 'p1' | 'p2'
    from: number
    to: number
    startedAt: number
  } | null>(null)
  // Order Report: allow animating BOTH players at once.
  const [scoreAnimP1, setScoreAnimP1] = useState<{ from: number; to: number; startedAt: number } | null>(null)
  const [scoreAnimP2, setScoreAnimP2] = useState<{ from: number; to: number; startedAt: number } | null>(null)

  // Progress bar gradient based on employee colors
  const [progressGradient, setProgressGradient] = useState<string | null>(null)
  const [pendingGradient, setPendingGradient] = useState<string | null>(null)

  // Window completion celebration
  const topProgressRef = useRef<HTMLDivElement | null>(null)
  const completedTasksAnchorRef = useRef<HTMLDivElement | null>(null)
  const completedTasksStageRef = useRef<HTMLDivElement | null>(null)
  /** Scroll to card in pending grid after completed-task reset closes the modal. */
  const pendingScrollToTaskIdRef = useRef<string | null>(null)
  const [taskGridCelebrating, setTaskGridCelebrating] = useState(false)
  const taskGridCelebratingRef = useRef(false)
  const cardJiggleStartTimeoutRef = useRef<number | null>(null)
  const cardJiggleEndTimeoutRef = useRef<number | null>(null)
  const taskGridEnterTimeoutRef = useRef<number | null>(null)
  const poweredByTapRef = useRef<{ count: number; lastMs: number }>({ count: 0, lastMs: 0 })
  const windowUnlockToastTimeoutRef = useRef<number | null>(null)
  /** v3 staged windows: collapse Stage 1/2 strip before task evacuation so completed cards slide up. */
  const [windowCompleteStageCollapse, setWindowCompleteStageCollapse] = useState(false)
  const [windowCompleteCelebration, setWindowCompleteCelebration] = useState<WindowCompleteCelebrationViewModel | null>(null)
  const [windowCompleteBetaPreview, setWindowCompleteBetaPreview] = useState(false)
  const [pendingBetaWindowCompleteSeed, setPendingBetaWindowCompleteSeed] = useState(false)
  const windowCompleteBetaPreviewRef = useRef(false)
  const windowCompleteScopeKeyRef = useRef<string | null>(null)
  const headlineRotationRef = useRef(0)
  /** Reuse window-complete headline when switching between windows in the same shift + date. */
  const shiftCompleteHeadlineByDayShiftRef = useRef<Map<string, string>>(new Map())
  const windowCompleteStartTimeoutRef = useRef<number | null>(null)
  const windowCompleteStartScheduledRef = useRef(false)
  const windowCompletePhaseTimeoutsRef = useRef<number[]>([])
  /** Latest staged two-window model for window-complete timing (declared before callbacks that read it). */
  const stagedTasksRefForEvac = useRef<{
    stage1: Task[]
    stage2: Task[]
    label1: string
    label2: string
  } | null>(null)
  const lastWindowCompleteAiFetchKeyRef = useRef<string | null>(null)
  /** Persists AI completion copy per completion fingerprint so switching timeframe tabs does not refetch. */
  const windowCompleteCompletionMessageByKeyRef = useRef<Map<string, string>>(new Map())
  const lastKnownWindowCompleteMessageKeyRef = useRef<string | null>(null)
  const windowCompleteCelebrationRef = useRef(windowCompleteCelebration)

  useEffect(() => {
    taskGridCelebratingRef.current = taskGridCelebrating
  }, [taskGridCelebrating])

  useEffect(() => {
    return () => {
      if (windowCompleteStartTimeoutRef.current) window.clearTimeout(windowCompleteStartTimeoutRef.current)
      windowCompletePhaseTimeoutsRef.current.forEach((t) => window.clearTimeout(t))
      windowCompletePhaseTimeoutsRef.current = []
      if (cardJiggleStartTimeoutRef.current) window.clearTimeout(cardJiggleStartTimeoutRef.current)
      if (cardJiggleEndTimeoutRef.current) window.clearTimeout(cardJiggleEndTimeoutRef.current)
      if (taskGridEnterTimeoutRef.current) window.clearTimeout(taskGridEnterTimeoutRef.current)
      if (windowUnlockToastTimeoutRef.current) window.clearTimeout(windowUnlockToastTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    return subscribeToGoodMorningConfig((c) => setGoodMorningEpoch(c.forceEpoch))
  }, [])

  useEffect(() => {
    let t: number | null = null
    const schedule = () => {
      const now = new Date()
      const ten = new Date(now)
      ten.setHours(10, 0, 0, 0)
      let delay: number
      if (now.getTime() < ten.getTime()) {
        delay = Math.max(0, ten.getTime() - now.getTime()) + 1
      } else {
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
        delay = Math.max(0, nextMidnight.getTime() - now.getTime()) + 1
      }
      t = window.setTimeout(() => {
        setGoodMorningTick(Date.now())
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      if (t !== null) window.clearTimeout(t)
    }
  }, [])

  const showGoodMorning = useMemo(() => {
    if (!isPastTenAmLocal(new Date(goodMorningTick))) return false
    const todayKey = formatDateKey(startOfDay(new Date()))
    const local = goodMorningLocal ?? readGoodMorningLocal()
    const epoch = goodMorningEpoch
    if (!local) return true
    if (local.dismissedDateKey === todayKey && local.lastCompletedEpoch >= epoch) return false
    return true
  }, [goodMorningTick, goodMorningLocal, goodMorningEpoch])

  useEffect(() => {
    if (!showGoodMorning) return
    const id = window.setInterval(() => setGoodMorningOverlayClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [showGoodMorning])

  useEffect(() => {
    if (!showGoodMorning) return
    const sid = goodMorningSessionIdRef.current
    const beat = () => {
      const todayKey = formatDateKey(startOfDay(new Date()))
      void upsertGoodMorningSession(sid, {
        lastSeenAtMs: Date.now(),
        dateKey: todayKey,
        deviceInfo: getGoodMorningDeviceInfo(),
      })
    }
    beat()
    const id = window.setInterval(beat, 5000)
    return () => {
      window.clearInterval(id)
      void clearGoodMorningSession(sid)
    }
  }, [showGoodMorning])

  const dismissGoodMorning = useCallback(() => {
    const todayKey = formatDateKey(startOfDay(new Date()))
    const sid = goodMorningSessionIdRef.current
    void appendGoodMorningLog({
      dateKey: todayKey,
      sessionId: sid,
      deviceInfo: getGoodMorningDeviceInfo(),
    })
    const next: GoodMorningLocalState = { dismissedDateKey: todayKey, lastCompletedEpoch: goodMorningEpoch }
    writeGoodMorningLocal(next)
    setGoodMorningLocal(next)
    void clearGoodMorningSession(sid)
    setGoodMorningRevealPhase(true)
    window.setTimeout(() => setGoodMorningRevealPhase(false), 1200)
  }, [goodMorningEpoch])

  const dismissMusicReminder = useCallback(() => {
    const now = new Date()
    const end = new Date(now)
    end.setHours(20, 30, 0, 0) // today 8:30pm local (reminder window end)
    const SNOOZE_MS = 10 * 60 * 1000
    const untilMs = Math.min(end.getTime(), now.getTime() + SNOOZE_MS)
    setMusicReminderDismissedUntilMs(untilMs)
    setMusicReminderActive(false)
    setMusicReminderFlashOn(true)
    try {
      localStorage.setItem(LS_MUSIC_MISSING_REMINDER_DISMISSED_UNTIL_KEY, String(untilMs))
    } catch {
      // ignore
    }
  }, [])

  const playMusicFromReminder = useCallback(() => {
    // Synchronously ask the in-app MusicPlayer to resume. Because this is triggered directly
    // from a user tap/click, calling play() in the same call stack counts as a user gesture.
    try {
      window.dispatchEvent(new CustomEvent('traq:music-reminder-play'))
    } catch {
      // ignore
    }
    // Snooze the reminder after the user tries to start music.
    dismissMusicReminder()
  }, [dismissMusicReminder])

  const evaluateMusicReminder = useCallback(
    (d: Date) => {
      const inWindow = isWithinMusicReminderHours(d)
      const dismissed = musicReminderDismissedUntilMs > d.getTime()
      const idleLongEnough =
        !musicIsActuallyPlaying &&
        musicNotPlayingSinceMs !== null &&
        d.getTime() - musicNotPlayingSinceMs >= MUSIC_REMINDER_IDLE_GRACE_MS
      const shouldBeActive = musicReminderEnabled && inWindow && idleLongEnough && !dismissed
      setMusicReminderActive(shouldBeActive)
      if (!shouldBeActive) setMusicReminderFlashOn(true)
    },
    [musicIsActuallyPlaying, musicNotPlayingSinceMs, musicReminderDismissedUntilMs, musicReminderEnabled]
  )

  useEffect(() => {
    evaluateMusicReminder(new Date())
    const id = window.setInterval(() => evaluateMusicReminder(new Date()), MUSIC_REMINDER_EVAL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [evaluateMusicReminder])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') evaluateMusicReminder(new Date())
    }
    const onFocus = () => evaluateMusicReminder(new Date())
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [evaluateMusicReminder])

  // Screensaver often opens after long idle; timers may be throttled — re-check so we don’t pop
  // “PLEASE PLAY MUSIC” over the screensaver after 8:30pm.
  useEffect(() => {
    if (!screensaverOpen) return
    evaluateMusicReminder(new Date())
  }, [evaluateMusicReminder, screensaverOpen])

  // Flash while active.
  useEffect(() => {
    if (!musicReminderActive) {
      if (musicReminderFlashIntervalRef.current) window.clearInterval(musicReminderFlashIntervalRef.current)
      musicReminderFlashIntervalRef.current = null
      return
    }
    setMusicReminderFlashOn(true)
    if (musicReminderFlashIntervalRef.current) window.clearInterval(musicReminderFlashIntervalRef.current)
    musicReminderFlashIntervalRef.current = window.setInterval(() => {
      setMusicReminderFlashOn((v) => !v)
    }, 750)
    return () => {
      if (musicReminderFlashIntervalRef.current) window.clearInterval(musicReminderFlashIntervalRef.current)
      musicReminderFlashIntervalRef.current = null
    }
  }, [musicReminderActive])

  type StarParticle = RewardStarParticle
  const [rewardStars, setRewardStars] = useState<StarParticle[]>([])

  // iOS 9: reduce perceived tap delay by handling touchstart
  // and suppressing the follow-up click (prevents double-fire).
  const lastTouchTsRef = useRef<number>(0)
  const recordTouch = useCallback(() => {
    lastTouchTsRef.current = Date.now()
  }, [])
  const shouldIgnoreClick = useCallback(() => {
    return Date.now() - lastTouchTsRef.current < CELEBRATION_TIMING.clickGuardMs
  }, [])

  const reloadForUpdate = useCallback(async (reason = 'manual-refresh') => {
    markIntentionalReload(reason)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.update().catch(() => undefined)))
      }
    } catch {
      // ignore
    } finally {
      window.location.reload()
    }
  }, [])

  const startForceRefreshCountdown = useCallback(() => {
    setShowForceRefreshPrompt(true)
    setForceRefreshSecondsLeft(FORCE_REFRESH_COUNTDOWN_SEC)

    if (forceRefreshIntervalRef.current) {
      window.clearInterval(forceRefreshIntervalRef.current)
      forceRefreshIntervalRef.current = null
    }

    const startedAt = Date.now()
    forceRefreshIntervalRef.current = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
      const next = Math.max(0, FORCE_REFRESH_COUNTDOWN_SEC - elapsedSec)
      setForceRefreshSecondsLeft(next)
      if (next <= 0) {
        if (forceRefreshIntervalRef.current) window.clearInterval(forceRefreshIntervalRef.current)
        forceRefreshIntervalRef.current = null
        void reloadForUpdate('force-refresh')
      }
    }, 250)
  }, [FORCE_REFRESH_COUNTDOWN_SEC, reloadForUpdate])

  const logoutAdmin = useCallback(() => {
    setIsAdmin(false)
    setShowAdminPanel(false)
    setAdminView('employees')
  }, [])

  const addAdminTask = useCallback(async () => {
    if (!isAdmin) return
    setAdminTaskError(null)

    const name = adminTaskName.trim()
    if (!name) {
      setAdminTaskError('Task name is required.')
      return
    }
    const icon = adminTaskIcon.trim() || '🧩'
    const windows = (Object.keys(adminTaskWindows) as WindowKey[]).filter((k) => !!adminTaskWindows[k])
    if (windows.length === 0) {
      setAdminTaskError('Select at least one window.')
      return
    }

    const requirements = adminTaskRequirementsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const weightNumRaw = Number(adminTaskWeight)
    const weight = Number.isFinite(weightNumRaw) && weightNumRaw > 0 ? weightNumRaw : 1

    const baseId = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
    const exists = (id: string) => {
      if (TASKS.some((t) => t.id === id)) return true
      if ((taskCatalog?.tasks || []).some((t) => t.id === id)) return true
      return false
    }
    let id = baseId || `task-${Date.now()}`
    if (exists(id)) {
      id = `${id}-${Math.random().toString(36).slice(2, 6)}`
    }

    const newTask: TaskDef = {
      id,
      name,
      icon,
      requirements,
      windows,
      weight,
      createdAtMs: Date.now(),
    }

    const nextCatalog: TaskCatalog = { tasks: [...(taskCatalog?.tasks || []), newTask] }
    try {
      await saveTaskCatalog(nextCatalog)
    } catch (e) {
      console.error('Failed to save task catalog:', e)
      setAdminTaskError('Failed to save task. Check connection and try again.')
      return
    }

    // Ensure new tasks show up immediately even if custom order exists.
    setTaskOrder((prev) => {
      const next: Record<WindowKey, string[]> = { ...prev }
      windows.forEach((wKey) => {
        const arr = Array.isArray(next[wKey]) ? [...next[wKey]] : []
        if (!arr.includes(id)) arr.push(id)
        next[wKey] = arr
      })
      return next
    })

    // Save stage assignments (v3) if any are set
    const stageEntry: Partial<Record<WindowKey, 1 | 2>> = {}
    if (adminTaskStages['11'] && windows.includes('11')) stageEntry['11'] = adminTaskStages['11']
    if (adminTaskStages['21'] && windows.includes('21')) stageEntry['21'] = adminTaskStages['21']
    if (Object.keys(stageEntry).length > 0) {
      const next = { ...taskStages, [id]: stageEntry }
      setTaskStages(next)
      saveTaskStages(next).catch(() => {})
    }

    // Reset draft
    setAdminTaskName('')
    setAdminTaskIcon('🧩')
    setAdminTaskWindows({ '11': false, '17': true, '21': false })
    setAdminTaskStages({})
    setAdminTaskWeight('1')
    setAdminTaskRequirementsText('')
  }, [adminTaskIcon, adminTaskName, adminTaskRequirementsText, adminTaskStages, adminTaskWeight, adminTaskWindows, isAdmin, taskCatalog, taskStages])

  const resetAdminDailyDraft = useCallback(() => {
    setAdminDailyEditingId(null)
    setAdminDailyName('')
    setAdminDailyFrequencyType('normal')
    setAdminDailyQuota(1)
    setAdminDailyMaterialsDesc('')
    setAdminDailyWhatToDoDesc('')
    setAdminDailyMaterialsFile(null)
    setAdminDailyWhatToDoFile(null)
    setAdminDailySaveError(null)
    setAdminDailyUploadPct({})
  }, [])

  const uploadDailyTaskImage = useCallback(
    async (
      taskId: string,
      kind: 'materials' | 'whatToDo',
      file: File
    ): Promise<string> => {
      const safeTaskId = String(taskId || '').trim()
      if (!safeTaskId) throw new Error('missing-taskId')
      if (!file) throw new Error('missing-file')
      const rawExt = String(file.name || '').split('.').pop() || ''
      const ext = rawExt && rawExt.length <= 6 ? rawExt.toLowerCase().replace(/[^a-z0-9]+/g, '') : 'jpg'
      const storagePath = `dailyTasks/${safeTaskId}/${kind}.${ext || 'jpg'}`
      const ref = storageRef(storage, storagePath)

      return await new Promise<string>((resolve, reject) => {
        try {
          const task = uploadBytesResumable(ref, file)
          task.on(
            'state_changed',
            (snap) => {
              const pct = snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0
              setAdminDailyUploadPct((prev) => ({ ...prev, [kind]: pct }))
            },
            (err) => reject(err),
            () => resolve(storagePath)
          )
        } catch (e) {
          reject(e)
        }
      })
    },
    []
  )

  const saveAdminDailyTask = useCallback(async () => {
    if (!isAdmin) return
    if (adminDailySaving) return
    setAdminDailySaveError(null)

    const name = adminDailyName.trim()
    if (!name) {
      setAdminDailySaveError('Name is required.')
      return
    }

    const tasks = dailyTaskCatalog?.tasks || []
    const isEditing = !!adminDailyEditingId
    const existing = isEditing ? tasks.find((t) => t.id === adminDailyEditingId) || null : null

    const id = existing?.id ?? createNewDailyTaskId()

    setAdminDailySaving(true)
    setAdminDailyUploadPct({})
    try {
      const frequency =
        adminDailyFrequencyType === 'weekly'
          ? ({ type: 'weekly', quotaPerWeek: adminDailyQuota } as const)
          : ({ type: 'normal' } as const)

      let materialsPath = existing?.materials?.imagePath || ''
      let whatPath = existing?.whatToDo?.imagePath || ''

      if (adminDailyMaterialsFile) {
        materialsPath = await uploadDailyTaskImage(id, 'materials', adminDailyMaterialsFile)
      }
      if (adminDailyWhatToDoFile) {
        whatPath = await uploadDailyTaskImage(id, 'whatToDo', adminDailyWhatToDoFile)
      }

      const nextTask: DailyTaskDef = {
        id,
        name,
        frequency,
        materials: {
          imagePath: materialsPath,
          description: adminDailyMaterialsDesc.trim(),
        },
        whatToDo: {
          imagePath: whatPath,
          description: adminDailyWhatToDoDesc.trim(),
        },
        createdAtMs: existing?.createdAtMs ?? Date.now(),
        updatedAtMs: Date.now(),
        ...(existing?.disabledAtMs ? { disabledAtMs: existing.disabledAtMs } : {}),
        ...(existing?.archivedAtMs ? { archivedAtMs: existing.archivedAtMs } : {}),
      }

      const nextTasks = existing
        ? [...tasks.filter((t) => t.id !== existing.id), nextTask]
        : [...tasks, nextTask]

      const nextCatalog: DailyTaskCatalog = { tasks: nextTasks }
      await saveDailyTaskCatalog(nextCatalog)
      setDailyTaskCatalogState(nextCatalog)
      resetAdminDailyDraft()
    } catch (e) {
      console.error('Failed to save daily task:', e)
      setAdminDailySaveError('Failed to save daily task. Check connection and try again.')
    } finally {
      setAdminDailySaving(false)
    }
  }, [
    adminDailyEditingId,
    adminDailyFrequencyType,
    adminDailyMaterialsDesc,
    adminDailyMaterialsFile,
    adminDailyName,
    adminDailyQuota,
    adminDailySaving,
    adminDailyWhatToDoDesc,
    adminDailyWhatToDoFile,
    dailyTaskCatalog,
    isAdmin,
    resetAdminDailyDraft,
    uploadDailyTaskImage,
  ])

  const startEditAdminDailyTask = useCallback(
    (id: string) => {
      const t = resolveDailyTaskDefFromCatalog(dailyTaskCatalog?.tasks, id)
      if (!t) return
      setAdminDailyEditingId(t.id)
      setAdminDailyName(t.name || '')
      setAdminDailyFrequencyType(t.frequency?.type === 'weekly' ? 'weekly' : 'normal')
      setAdminDailyQuota(t.frequency?.type === 'weekly' ? (t.frequency.quotaPerWeek as 1 | 2 | 3) : 1)
      setAdminDailyMaterialsDesc(t.materials?.description || '')
      setAdminDailyWhatToDoDesc(t.whatToDo?.description || '')
      setAdminDailyMaterialsFile(null)
      setAdminDailyWhatToDoFile(null)
      setAdminDailySaveError(null)
      setAdminDailyUploadPct({})
    },
    [dailyTaskCatalog?.tasks]
  )

  const deleteAdminDailyTask = useCallback(
    async (id: string) => {
      if (!isAdmin) return
      const tasks = dailyTaskCatalog?.tasks || []
      const next = tasks.filter((t) => t.id !== id)
      const nextCatalog: DailyTaskCatalog = { tasks: next }
      try {
        await saveDailyTaskCatalog(nextCatalog)
        setDailyTaskCatalogState(nextCatalog)
        if (adminDailyEditingId === id) resetAdminDailyDraft()
      } catch (e) {
        console.error('Failed to delete daily task:', e)
      }
    },
    [adminDailyEditingId, dailyTaskCatalog?.tasks, isAdmin, resetAdminDailyDraft]
  )

  const computeDailyTaskWeekQuotaWarnings = useCallback(
    (week: DailyTaskWeek | null): string[] => {
      if (!week) return []
      const tasks = (dailyTaskCatalog?.tasks || []).filter(isDailyTaskSchedulable)
      const weekly = tasks.filter((t) => t.frequency?.type === 'weekly') as DailyTaskDef[]
      if (!weekly.length) return []

      const counts: Record<string, number> = {}
      Object.keys(week.days || {}).forEach((dk) => {
        const tid = week.days?.[dk]?.taskId
        if (!tid || tid === '__none__') return // Skip "no task" overrides
        counts[tid] = (counts[tid] || 0) + 1
      })

      const warnings: string[] = []
      weekly.forEach((t) => {
        const quota = t.frequency.type === 'weekly' ? t.frequency.quotaPerWeek : 0
        const count = counts[t.id] || 0
        if (count !== quota) {
          warnings.push(`“${t.name}” is scheduled ${count}x this week (quota ${quota}).`)
        }
      })
      return warnings
    },
    [dailyTaskCatalog?.tasks]
  )

  const setAdminDailyOverride = useCallback(
    async (dateKey: string, taskId: string) => {
      if (!isAdmin) return
      const dk = String(dateKey || '').trim()
      const tid = String(taskId || '').trim()
      if (!dk || !tid) return
      setAdminDailyOverrideSaving(dk)
      try {
        const weekStart = getWeekStartDateKeySunday(dk)
        let week = adminDailyWeeksByStart[weekStart] || (await getDailyTaskWeek(weekStart))
        if (!week) {
          const ensured = await ensureDailyTaskWeekForDateKey(dk, dailyTaskCatalog.tasks || [])
          week = ensured.week
        }
        if (!week) return

        const nextDays: DailyTaskWeek['days'] = { ...(week.days || {}) }
        nextDays[dk] = createOverrideDayEntry(tid)
        const nextWeek: DailyTaskWeek = {
          ...week,
          weekStartDateKey: weekStart,
          days: nextDays,
          generatedAtMs: Date.now(),
          generatorVersion: week.generatorVersion || DAILY_TASK_WEEK_GENERATOR_VERSION,
        }
        await upsertDailyTaskWeek(weekStart, nextWeek)
        setAdminDailyWeeksByStart((prev) => ({ ...prev, [weekStart]: nextWeek }))

        // Sync `dailyTaskRuns/{dk}` for any overridden day (including `__none__`) so Recent Runs lists it
        // and Edit history works. Never clobber a completed run.
        const existingRun = await getDailyTaskRun(dk)
        if (!existingRun?.completedAtMs) {
          await upsertDailyTaskRun(dk, {
            taskId: tid,
            selectedAtMs:
              typeof existingRun?.selectedAtMs === 'number' && Number.isFinite(existingRun.selectedAtMs)
                ? existingRun.selectedAtMs
                : Date.now(),
            override: { taskId: tid, atMs: Date.now(), by: 'admin' },
          })
        }
        const toKey = formatDateKey(startOfDay(new Date()))
        const runs = await listDailyTaskRunsInRange(addDaysToDateKey(toKey, -30), toKey)
        setAdminDailyRunsRecent(runs)
      } catch (e) {
        console.error('Failed to set daily task override:', e)
      } finally {
        setAdminDailyOverrideSaving(null)
      }
    },
    [adminDailyWeeksByStart, dailyTaskCatalog.tasks, isAdmin]
  )

  const regenerateDailyTaskSchedule = useCallback(async () => {
    if (!isAdmin) {
      setAdminDailyDebugInfo(['ERROR: Not admin'])
      return
    }
    setAdminDailyRegenerating(true)
    setAdminDailyDebugInfo(['Starting regeneration...'])
    try {
      const tasks = (dailyTaskCatalog.tasks || []).filter(isDailyTaskSchedulable)
      if (!tasks.length) {
        setAdminDailyDebugInfo(['ERROR: No enabled daily tasks to schedule.'])
        setAdminDailyRegenerating(false)
        return
      }

      // Get recent history for recency balancing (last 120 days)
      const today = formatDateKey(startOfDay(new Date()))
      const historyFrom = addDaysToDateKey(today, -120)
      let recentRuns: DailyTaskRun[] = []
      try {
        recentRuns = await listDailyTaskRunsInRange(historyFrom, today)
      } catch (e) {
        console.warn('Failed to load recent runs for schedule regeneration:', e)
      }

      // Regenerate schedules for next 7 days (may span 2 weeks)
      const next7 = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(today, i))
      const weekStarts = Array.from(new Set(next7.map((dk) => getWeekStartDateKeySunday(dk)))).sort()

      let scheduleWeeks: DailyTaskWeek[] = []
      try {
        scheduleWeeks = await loadScheduleWeeksOverlappingDateRange(historyFrom, today)
      } catch (e) {
        console.warn('Failed to load daily task weeks for recency merge:', e)
      }

      let aiByWeek: Record<string, Record<string, string>> = {}
      let scheduleUsedAi = false
      try {
        const weeksPayload = await Promise.all(
          weekStarts.map(async (weekStart) => ({
            weekStartDateKey: weekStart,
            existingWeek: adminDailyWeeksByStart[weekStart] || (await getDailyTaskWeek(weekStart)) || null,
            todayDateKey: today,
          }))
        )
        const aiResult = await fetchValidatedWeeklyPlacements({
          tasks,
          recentRunsForHistory: recentRuns,
          weeks: weeksPayload,
          systemPrompt: getCachedDailyTaskScheduleSystemPrompt(),
        })
        aiByWeek = aiResult.byWeek
        scheduleUsedAi = aiResult.usedAi
      } catch (e) {
        console.warn('AI daily schedule batch skipped:', e)
      }

      const updatedWeeks: Record<string, DailyTaskWeek> = {}
      const allWarnings: string[] = []
      const weeksForRecency = [...scheduleWeeks]

      for (const weekStart of weekStarts) {
        const existing = adminDailyWeeksByStart[weekStart] || (await getDailyTaskWeek(weekStart)) || null

        const picked = aiByWeek[weekStart]
        const weeklyPlacementOverrides =
          scheduleUsedAi && picked && Object.keys(picked).length > 0 ? picked : undefined
        const generatorVersion = weeklyPlacementOverrides
          ? DAILY_TASK_WEEK_GENERATOR_VERSION_AI
          : undefined

        const result = generateDailyTaskWeek({
          weekStartDateKey: weekStart,
          tasks,
          recentRuns,
          scheduleWeeksForRecency: weeksForRecency,
          existingWeek: existing,
          todayDateKey: today,
          weeklyPlacementOverrides,
          generatorVersion,
        })

        if (result.warnings.length) {
          allWarnings.push(...result.warnings)
        }

        if (result.week) {
          await upsertDailyTaskWeek(weekStart, result.week)
          updatedWeeks[weekStart] = result.week
          const idx = weeksForRecency.findIndex((w) => w.weekStartDateKey === weekStart)
          const merged: DailyTaskWeek = { ...result.week, weekStartDateKey: weekStart }
          if (idx >= 0) weeksForRecency[idx] = merged
          else weeksForRecency.push(merged)
        }
      }

      // Update local state
      setAdminDailyWeeksByStart((prev) => ({ ...prev, ...updatedWeeks }))

      // Build debug info to show on screen
      const debugLines: string[] = []
      debugLines.push(`Loaded ${recentRuns.length} task runs from history (last 120 days)`)
      debugLines.push(
        scheduleUsedAi
          ? 'Weekly quota day picks: AI-assisted (validated); monthly/normal fill uses algorithm + run history.'
          : 'Weekly quota day picks: algorithm only (AI unavailable, timed out, or invalid response).'
      )
      debugLines.push('')
      
      const lastByTask = buildMergedRecencyMap(recentRuns, scheduleWeeks)
      const freqLabel = (t: DailyTaskDef): string => {
        switch (t.frequency.type) {
          case 'normal':
            return 'normal'
          case 'monthly':
            return 'monthly'
          case 'weekly':
            return `weekly×${t.frequency.quotaPerWeek}`
        }
      }

      debugLines.push(
        'TASK RECENCY (runs + scheduled weeks; higher score = older; normal-slot ties favor oldest):'
      )
      tasks
        .map((t) => {
          const last = lastByTask[t.id]
          const score = last ? Date.now() - last : 1e15
          const lastDate = last ? new Date(last).toLocaleDateString() : 'NEVER'
          return { name: t.name || t.id, freq: freqLabel(t), last, score, lastDate }
        })
        .sort((a, b) => b.score - a.score)
        .forEach(({ name, freq, score, lastDate }) => {
          const scoreStr =
            score === 1e15 ? 'MAX (never done)' : Math.round(score / (1000 * 60 * 60 * 24)) + ' days ago'
          debugLines.push(`  • [${freq}] ${name}: ${lastDate} (${scoreStr})`)
        })
      
      debugLines.push('')
      debugLines.push('SCHEDULE RESULT:')
      Object.entries(updatedWeeks).forEach(([ws, week]) => {
        debugLines.push(`Week ${ws}:`)
        Object.entries(week.days || {}).sort().forEach(([dk, entry]) => {
          const task = tasks.find(t => t.id === entry.taskId)
          const isPast = dk < today ? '(past)' : dk === today ? '(TODAY)' : ''
          debugLines.push(`  ${dk}: ${task?.name || entry.taskId} [${entry.source}] ${isPast}`)
        })
      })

      if (allWarnings.length) {
        debugLines.push('')
        debugLines.push('WARNINGS:')
        allWarnings.forEach(w => debugLines.push(`  ⚠️ ${w}`))
      }

      setAdminDailyDebugInfo(debugLines)
    } catch (e) {
      console.error('Failed to regenerate daily task schedule:', e)
      setAdminDailyDebugInfo([
        'ERROR: Failed to regenerate schedule',
        '',
        String(e),
        '',
        (e as Error)?.stack || ''
      ])
    } finally {
      setAdminDailyRegenerating(false)
    }
  }, [adminDailyWeeksByStart, dailyTaskCatalog.tasks, isAdmin])

  const adminRecloseTodayDailyTask = useCallback(async () => {
    if (!isAdmin) return
    const dk = formatDateKey(startOfDay(new Date()))
    // Only meaningful if a run exists and it has been revealed/completed.
    if (!todayDailyTaskRun?.revealedAtMs && !todayDailyTaskRun?.completedAtMs) return
    setAdminDailyReclosingToday(true)
    try {
      await adminRecloseDailyTaskRun(dk)
      // Local UI reset (Firestore subscription will also update).
      setShowDailyTaskModal(false)
      setDailyTaskEmployees([])
      setDailyTaskError(null)
      setDailyTaskStep(-1)
      setDailyTaskRevealing(false)
    } catch (e) {
      console.error('Failed to re-close today daily task:', e)
      alert('Failed to re-close today’s task. Please try again.')
    } finally {
      setAdminDailyReclosingToday(false)
    }
  }, [adminRecloseDailyTaskRun, isAdmin, todayDailyTaskRun?.completedAtMs, todayDailyTaskRun?.revealedAtMs])

  const openAdminDailyRunHistoryEdit = useCallback(
    (run: DailyTaskRun) => {
      if (!isAdmin) return
      const isNoTask = run.taskId === '__none__'
      const isCompleted = typeof run.completedAtMs === 'number' && Number.isFinite(run.completedAtMs)
      if (!isNoTask && !isCompleted) return
      setAdminDailyRunHistoryError(null)
      setAdminDailyRunHistoryEdit(run)
      setAdminDailyRunHistoryTitle(getDailyTaskRunHistoryTitle(run, dailyTaskCatalog.tasks))
      const list = (run.completedByList || []).map((s) => (s || '').trim()).filter(Boolean)
      const splitLegacy = (run.completedBy || '').split(/\s*\+\s*/)
      setAdminDailyRunHistoryEmp1(list[0] || splitLegacy[0]?.trim() || '')
      setAdminDailyRunHistoryEmp2(list[1] || splitLegacy[1]?.trim() || '')
      setAdminDailyRunHistoryCreditTaskId(
        run.taskId === '__none__' ? (run.schedulingCreditTaskId || '').trim() : ''
      )
    },
    [dailyTaskCatalog.tasks, isAdmin]
  )

  const saveAdminDailyRunHistoryEdit = useCallback(async () => {
    if (!isAdmin || !adminDailyRunHistoryEdit) return
    const defaultTitle =
      adminDailyRunHistoryEdit.taskId === '__none__'
        ? NO_TASK_DAILY_RUN_LABEL
        : resolveDailyTaskDefFromCatalog(dailyTaskCatalog.tasks, adminDailyRunHistoryEdit.taskId)?.name ||
          adminDailyRunHistoryEdit.taskId
    const titleTrim = adminDailyRunHistoryTitle.trim()
    const titleForApi = titleTrim === defaultTitle.trim() ? '' : titleTrim
    setAdminDailyRunHistorySaving(true)
    setAdminDailyRunHistoryError(null)
    try {
      const creditTrim = adminDailyRunHistoryCreditTaskId.trim()
      if (adminDailyRunHistoryEdit.taskId === '__none__' && creditTrim) {
        const found = resolveDailyTaskDefFromCatalog(dailyTaskCatalog.tasks, creditTrim)
        if (!found) {
          setAdminDailyRunHistoryError('Scheduling credit: pick a valid catalog task id from the list.')
          setAdminDailyRunHistorySaving(false)
          return
        }
      }
      await adminPatchDailyTaskRunHistory(adminDailyRunHistoryEdit.dateKey, {
        historyDisplayName: titleForApi,
        completedBy1: adminDailyRunHistoryEmp1,
        completedBy2: adminDailyRunHistoryEmp2,
        ...(adminDailyRunHistoryEdit.taskId === '__none__'
          ? { schedulingCreditTaskId: creditTrim }
          : {}),
      })
      setAdminDailyRunHistoryEdit(null)
      const toKey = formatDateKey(startOfDay(new Date()))
      const runs = await listDailyTaskRunsInRange(addDaysToDateKey(toKey, -30), toKey)
      setAdminDailyRunsRecent(runs)
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      const msg =
        code === 'daily-task-run-missing'
          ? 'No run document for that day.'
          : code === 'daily-task-run-not-completed'
            ? 'That day is not marked completed yet.'
            : code === 'daily-task-run-completers-required'
              ? 'Enter at least one completer name.'
              : 'Save failed. Check connection and try again.'
      setAdminDailyRunHistoryError(msg)
    } finally {
      setAdminDailyRunHistorySaving(false)
    }
  }, [
    adminDailyRunHistoryEdit,
    adminDailyRunHistoryEmp1,
    adminDailyRunHistoryEmp2,
    adminDailyRunHistoryCreditTaskId,
    adminDailyRunHistoryTitle,
    dailyTaskCatalog.tasks,
    isAdmin,
  ])

  const startEditRequirements = useCallback((taskId: string) => {
    const t = allTasks.find((x) => x.id === taskId)
    if (!t) return
    const current = t.requirements || []
    setAdminEditingReqTaskId(taskId)
    setAdminEditingReqText(current.join('\n'))
    setAdminEditingReqError(null)
  }, [allTasks])

  const startEditName = useCallback((taskId: string) => {
    const t = allTasks.find((x) => x.id === taskId)
    if (!t) return
    setAdminEditingNameTaskId(taskId)
    setAdminEditingNameText(t.name || '')
    setAdminEditingNameError(null)
  }, [allTasks])

  const startEditWindows = useCallback((taskId: string) => {
    const t = allTasks.find((x) => x.id === taskId)
    if (!t) return
    const ov = (taskOverrides?.overrides || {})[taskId]
    const windows = Array.isArray(ov?.windows) ? ov.windows : (t.windows || [])
    setAdminEditingWindowsTaskId(taskId)
    setAdminEditingWindows({
      '11': windows.includes('11'),
      '17': windows.includes('17'),
      '21': windows.includes('21'),
    })
    const todayKeyAtCall = formatDateKey(startOfDay(new Date()))
    const effMs = typeof ov?.windowsEffectiveAtMs === 'number' ? ov.windowsEffectiveAtMs : null
    const effKey = effMs !== null ? formatDateKey(startOfDay(new Date(effMs))) : todayKeyAtCall
    setAdminEditingWindowsEffectiveDateKey(effKey)
    setAdminEditingWindowsError(null)
  }, [allTasks, taskOverrides?.overrides])

  const startEditWeight = useCallback((taskId: string) => {
    const t = allTasks.find((x) => x.id === taskId)
    if (!t) return
    const ov = (taskOverrides?.overrides || {})[taskId]
    const wt = typeof ov?.weight === 'number' ? ov.weight : (t.weight ?? 1)
    setAdminEditingWeightTaskId(taskId)
    setAdminEditingWeight(String(wt))
    const todayKeyAtCall = formatDateKey(startOfDay(new Date()))
    const effMs = typeof ov?.weightEffectiveAtMs === 'number' ? ov.weightEffectiveAtMs : null
    const effKey = effMs !== null ? formatDateKey(startOfDay(new Date(effMs))) : todayKeyAtCall
    setAdminEditingWeightEffectiveDateKey(effKey)
    setAdminEditingWeightError(null)
  }, [allTasks, taskOverrides?.overrides])

  const resetRequirementsToDefault = useCallback(async (taskId: string) => {
    if (!isAdmin) return
    const current = taskOverrides?.overrides || {}
    const ov = current[taskId]
    if (!ov) return
    const nextOverrides = { ...current }
    const nextEntry = { ...ov }
    delete (nextEntry as any).requirements
    delete (nextEntry as any).updatedAtMs
    delete (nextEntry as any).updatedBy
    // If nothing left, delete the whole entry.
    const hasAny =
      (typeof (nextEntry as any).name === 'string' && String((nextEntry as any).name).trim()) ||
      (Array.isArray((nextEntry as any).requirements) && (nextEntry as any).requirements.length > 0) ||
      Array.isArray((nextEntry as any).windows) ||
      typeof (nextEntry as any).weight === 'number'
    if (!hasAny) delete nextOverrides[taskId]
    else nextOverrides[taskId] = nextEntry as any
    const next: TaskOverrides = { overrides: nextOverrides }
    try {
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to reset task requirements:', e)
    }
  }, [isAdmin, taskOverrides])

  const resetNameToDefault = useCallback(async (taskId: string) => {
    if (!isAdmin) return
    const current = taskOverrides?.overrides || {}
    const ov = current[taskId]
    if (!ov) return
    const nextOverrides = { ...current }
    const nextEntry = { ...ov }
    delete (nextEntry as any).name
    delete (nextEntry as any).nameUpdatedAtMs
    delete (nextEntry as any).nameUpdatedBy
    const hasAny =
      (typeof (nextEntry as any).name === 'string' && String((nextEntry as any).name).trim()) ||
      (Array.isArray((nextEntry as any).requirements) && (nextEntry as any).requirements.length > 0) ||
      Array.isArray((nextEntry as any).windows) ||
      typeof (nextEntry as any).weight === 'number'
    if (!hasAny) delete nextOverrides[taskId]
    else nextOverrides[taskId] = nextEntry as any
    const next: TaskOverrides = { overrides: nextOverrides }
    try {
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to reset task name:', e)
    }
  }, [isAdmin, taskOverrides])

  const resetWindowsToDefault = useCallback(async (taskId: string) => {
    if (!isAdmin) return
    const current = taskOverrides?.overrides || {}
    const ov = current[taskId]
    if (!ov) return
    const nextOverrides = { ...current }
    const nextEntry = { ...ov }
    delete (nextEntry as any).windows
    delete (nextEntry as any).windowsEffectiveAtMs
    delete (nextEntry as any).windowsUpdatedBy
    const hasAny =
      (typeof (nextEntry as any).name === 'string' && String((nextEntry as any).name).trim()) ||
      (Array.isArray((nextEntry as any).requirements) && (nextEntry as any).requirements.length > 0) ||
      Array.isArray((nextEntry as any).windows) ||
      typeof (nextEntry as any).weight === 'number'
    if (!hasAny) delete nextOverrides[taskId]
    else nextOverrides[taskId] = nextEntry as any
    const next: TaskOverrides = { overrides: nextOverrides }
    try {
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to reset task windows:', e)
    }
  }, [isAdmin, taskOverrides])

  const resetWeightToDefault = useCallback(async (taskId: string) => {
    if (!isAdmin) return
    const current = taskOverrides?.overrides || {}
    const ov = current[taskId]
    if (!ov) return
    const nextOverrides = { ...current }
    const nextEntry = { ...ov }
    delete (nextEntry as any).weight
    delete (nextEntry as any).weightEffectiveAtMs
    delete (nextEntry as any).weightUpdatedBy
    const hasAny =
      (typeof (nextEntry as any).name === 'string' && String((nextEntry as any).name).trim()) ||
      (Array.isArray((nextEntry as any).requirements) && (nextEntry as any).requirements.length > 0) ||
      Array.isArray((nextEntry as any).windows) ||
      typeof (nextEntry as any).weight === 'number'
    if (!hasAny) delete nextOverrides[taskId]
    else nextOverrides[taskId] = nextEntry as any
    const next: TaskOverrides = { overrides: nextOverrides }
    try {
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to reset task weight:', e)
    }
  }, [isAdmin, taskOverrides])

  const applyIceCombineNow = useCallback(async () => {
    if (!isAdmin) return
    if (adminApplyingIceCombine) return
    setAdminApplyingIceCombine(true)
    try {
      const effectiveAtMs = ICE_COMBINED_CREATED_AT_MS
      const idsToRemove = ['left-ice-5pm', 'right-ice-5pm', 'left-ice-close', 'right-ice-close']
      const current = taskOverrides?.overrides || {}
      const nextOverrides: Record<string, unknown> = { ...current }

      idsToRemove.forEach((taskId) => {
        const prev = (nextOverrides as Record<string, unknown>)[taskId]
        const prevObj = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
        ;(nextOverrides as Record<string, unknown>)[taskId] = {
          ...prevObj,
          windows: [],
          windowsEffectiveAtMs: effectiveAtMs,
          windowsUpdatedBy: 'admin',
        }
      })

      const next: TaskOverrides = { ...taskOverrides, overrides: nextOverrides as any }
      if (typeof next.towelsSplitEffectiveAtMs !== 'number' || next.towelsSplitEffectiveAtMs <= 0) {
        next.towelsSplitEffectiveAtMs = effectiveAtMs
      }
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to apply Ice Combine overrides:', e)
      alert('Failed to apply Ice Combine. Check connection and try again.')
    } finally {
      setAdminApplyingIceCombine(false)
    }
  }, [adminApplyingIceCombine, isAdmin, taskOverrides])

  const [adminApplyingTowelsSplit, setAdminApplyingTowelsSplit] = useState(false)
  const applyTowelsSplitNow = useCallback(async () => {
    if (!isAdmin) return
    if (adminApplyingTowelsSplit) return
    setAdminApplyingTowelsSplit(true)
    try {
      const next: TaskOverrides = { ...taskOverrides, towelsSplitEffectiveAtMs: Date.now() }
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to apply Towels Split:', e)
      alert('Failed to apply Towels Split. Check connection and try again.')
    } finally {
      setAdminApplyingTowelsSplit(false)
    }
  }, [adminApplyingTowelsSplit, isAdmin, taskOverrides])

  const [adminTogglingDice, setAdminTogglingDice] = useState(false)
  const toggleDiceEnabled = useCallback(async () => {
    if (!isAdmin) return
    if (adminTogglingDice) return
    setAdminTogglingDice(true)
    try {
      const enabled = taskOverrides?.diceEnabled === true
      const base: TaskOverrides = taskOverrides ?? { overrides: {} }
      const next: TaskOverrides = { ...base, diceEnabled: !enabled }
      await saveTaskOverrides(next)
    } catch (e) {
      console.error('Failed to toggle dice button:', e)
      alert('Failed to update setting. Check connection and try again.')
    } finally {
      setAdminTogglingDice(false)
    }
  }, [adminTogglingDice, isAdmin, taskOverrides])

  const saveEditedRequirements = useCallback(async () => {
    if (!isAdmin) return
    if (!adminEditingReqTaskId) return
    setAdminEditingReqError(null)
    const taskId = adminEditingReqTaskId
    const base = allTasks.find((t) => t.id === taskId)
    if (!base) return
    const requirements = adminEditingReqText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (requirements.length === 0) {
      setAdminEditingReqError('Requirements cannot be empty.')
      return
    }
    const requiredChecklist = base.requiresChecklist ?? 0
    if (requiredChecklist > 0 && requirements.length < requiredChecklist) {
      setAdminEditingReqError(`This task requires at least ${requiredChecklist} checklist items.`)
      return
    }

    const current = taskOverrides?.overrides || {}
    const prev = current[taskId] || {}
    const next: TaskOverrides = {
      overrides: {
        ...current,
        [taskId]: {
          ...(prev as any),
          requirements,
          updatedAtMs: Date.now(),
          updatedBy: 'admin',
        },
      },
    }
    try {
      await saveTaskOverrides(next)
      setAdminEditingReqTaskId(null)
      setAdminEditingReqText('')
    } catch (e) {
      console.error('Failed to save task requirements override:', e)
      setAdminEditingReqError('Failed to save. Check connection and try again.')
    }
  }, [adminEditingReqTaskId, adminEditingReqText, allTasks, isAdmin, taskOverrides])

  const saveEditedName = useCallback(async () => {
    if (!isAdmin) return
    if (!adminEditingNameTaskId) return
    setAdminEditingNameError(null)
    const taskId = adminEditingNameTaskId
    const name = adminEditingNameText.trim()
    if (!name) {
      setAdminEditingNameError('Name cannot be empty.')
      return
    }
    const current = taskOverrides?.overrides || {}
    const prev = current[taskId] || {}
    const next: TaskOverrides = {
      overrides: {
        ...current,
        [taskId]: {
          ...(prev as any),
          name,
          nameUpdatedAtMs: Date.now(),
          nameUpdatedBy: 'admin',
        },
      },
    }
    try {
      await saveTaskOverrides(next)
      setAdminEditingNameTaskId(null)
      setAdminEditingNameText('')
    } catch (e) {
      console.error('Failed to save task name override:', e)
      setAdminEditingNameError('Failed to save. Check connection and try again.')
    }
  }, [adminEditingNameTaskId, adminEditingNameText, isAdmin, taskOverrides])

  const saveEditedWindows = useCallback(async () => {
    if (!isAdmin) return
    if (!adminEditingWindowsTaskId) return
    setAdminEditingWindowsError(null)
    const taskId = adminEditingWindowsTaskId
    const base = allTasks.find((t) => t.id === taskId)
    if (!base) return

    const windows = (['11', '17', '21'] as WindowKey[]).filter((w) => !!adminEditingWindows[w])
    const todayKeyAtCall = formatDateKey(startOfDay(new Date()))
    const pickedKey = (adminEditingWindowsEffectiveDateKey || '').trim() || todayKeyAtCall
    if (pickedKey < todayKeyAtCall) {
      setAdminEditingWindowsError('Effective date cannot be in the past.')
      return
    }
    const effectiveAtMs =
      pickedKey === todayKeyAtCall ? Date.now() : combineDateTime(new Date(`${pickedKey}T00:00:00`), '00:00').getTime()

    // If admin picked the default windows, treat as reset (keeps overrides clean).
    const baseWindowsSorted = [...(base.windows || [])].slice().sort().join(',')
    const nextWindowsSorted = [...windows].slice().sort().join(',')
    if (baseWindowsSorted === nextWindowsSorted) {
      await resetWindowsToDefault(taskId)
      setAdminEditingWindowsTaskId(null)
      setAdminEditingWindows({ '11': false, '17': false, '21': false })
      setAdminEditingWindowsEffectiveDateKey('')
      setAdminEditingWindowsError(null)
      return
    }

    const current = taskOverrides?.overrides || {}
    const prev = current[taskId] || {}
    const next: TaskOverrides = {
      overrides: {
        ...current,
        [taskId]: {
          ...(prev as any),
          windows,
          windowsEffectiveAtMs: effectiveAtMs,
          windowsUpdatedBy: 'admin',
        },
      },
    }
    try {
      await saveTaskOverrides(next)
      setAdminEditingWindowsTaskId(null)
      setAdminEditingWindows({ '11': false, '17': false, '21': false })
      setAdminEditingWindowsEffectiveDateKey('')
    } catch (e) {
      console.error('Failed to save task windows override:', e)
      setAdminEditingWindowsError('Failed to save. Check connection and try again.')
    }
  }, [
    adminEditingWindows,
    adminEditingWindowsEffectiveDateKey,
    adminEditingWindowsTaskId,
    allTasks,
    isAdmin,
    resetWindowsToDefault,
    taskOverrides?.overrides,
  ])

  const saveEditedWeight = useCallback(async () => {
    if (!isAdmin) return
    if (!adminEditingWeightTaskId) return
    setAdminEditingWeightError(null)
    const taskId = adminEditingWeightTaskId
    const base = allTasks.find((t) => t.id === taskId)
    if (!base) return

    const weightNum = Number(adminEditingWeight)
    if (!Number.isFinite(weightNum) || weightNum < 0) {
      setAdminEditingWeightError('Weight must be a number ≥ 0.')
      return
    }

    const todayKeyAtCall = formatDateKey(startOfDay(new Date()))
    const pickedKey = (adminEditingWeightEffectiveDateKey || '').trim() || todayKeyAtCall
    if (pickedKey < todayKeyAtCall) {
      setAdminEditingWeightError('Effective date cannot be in the past.')
      return
    }
    const effectiveAtMs =
      pickedKey === todayKeyAtCall ? Date.now() : combineDateTime(new Date(`${pickedKey}T00:00:00`), '00:00').getTime()

    const baseWeight = base.weight ?? 1
    if (Math.abs(weightNum - baseWeight) < 1e-9) {
      await resetWeightToDefault(taskId)
      setAdminEditingWeightTaskId(null)
      setAdminEditingWeight('1')
      setAdminEditingWeightEffectiveDateKey('')
      setAdminEditingWeightError(null)
      return
    }

    const current = taskOverrides?.overrides || {}
    const prev = current[taskId] || {}
    const next: TaskOverrides = {
      overrides: {
        ...current,
        [taskId]: {
          ...(prev as any),
          weight: weightNum,
          weightEffectiveAtMs: effectiveAtMs,
          weightUpdatedBy: 'admin',
        },
      },
    }
    try {
      await saveTaskOverrides(next)
      setAdminEditingWeightTaskId(null)
      setAdminEditingWeight('1')
      setAdminEditingWeightEffectiveDateKey('')
    } catch (e) {
      console.error('Failed to save task weight override:', e)
      setAdminEditingWeightError('Failed to save. Check connection and try again.')
    }
  }, [
    adminEditingWeight,
    adminEditingWeightEffectiveDateKey,
    adminEditingWeightTaskId,
    allTasks,
    isAdmin,
    resetWeightToDefault,
    taskOverrides?.overrides,
  ])

  // Auto-update: if the app is open, reload at 12:05am local time daily
  useEffect(() => {
    const STORAGE_KEY = 'traq:lastAutoUpdateLocalDate'

    const localDateKey = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const nextRunMs = (now: Date) => {
      const next = new Date(now)
      next.setHours(0, 5, 0, 0) // 12:05am
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1)
      }
      return next.getTime() - now.getTime()
    }

    const schedule = () => {
      const ms = nextRunMs(new Date())
      const id = window.setTimeout(() => {
        try {
          const today = localDateKey(new Date())
          const last = window.localStorage.getItem(STORAGE_KEY)
          if (last !== today) {
            window.localStorage.setItem(STORAGE_KEY, today)
            void reloadForUpdate('nightly-update')
            return
          }
        } catch {
          // ignore and still reload
          void reloadForUpdate('nightly-update')
          return
        }
        // If we already auto-updated today, just schedule the next run.
        schedule()
      }, ms)
      return id
    }

    let timeoutId = schedule()

    // If the tab was sleeping/backgrounded, reschedule when it becomes visible.
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timeoutId)
      timeoutId = schedule()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearTimeout(timeoutId)
    }
  }, [reloadForUpdate])

  useEffect(() => {
    try {
      const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
      if (!mq) return
      const apply = () => setPrefersReducedMotion(!!mq.matches)
      apply()
      // iOS Safari 16 supports addEventListener; keep a fallback for older
      if (mq.addEventListener) {
        mq.addEventListener('change', apply)
        return () => mq.removeEventListener('change', apply)
      }
      // Legacy API (older Safari)
      ;(mq as MediaQueryList).addListener?.(apply)
      return () => (mq as MediaQueryList).removeListener?.(apply)
    } catch {
      // ignore
    }
  }, [])

  const isElMostlyVisible = useCallback((el: HTMLElement | null, opts?: { threshold?: number }): boolean => {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    // If element has no box, treat as not visible.
    if (!rect.width || !rect.height) return false

    const vpH = window.innerHeight || document.documentElement?.clientHeight || 0
    if (!vpH) return false

    const visibleTop = Math.max(0, rect.top)
    const visibleBottom = Math.min(vpH, rect.bottom)
    const visibleH = Math.max(0, visibleBottom - visibleTop)

    const thresholdRaw = typeof opts?.threshold === 'number' ? opts.threshold : 0.6
    const threshold = Math.max(0, Math.min(1, thresholdRaw))
    return visibleH / rect.height >= threshold
  }, [])

  const isMainShiftHudMostlyVisible = useCallback((): boolean => {
    // The header is a stable ref; use its parent (the full card) for the visibility ratio.
    const header = shiftHudHeaderRef.current
    const card = (header?.parentElement as HTMLElement | null) || null
    return isElMostlyVisible(card, { threshold: 0.6 })
  }, [isElMostlyVisible])

  const spawnRewardStars = useCallback((targetEl: HTMLElement | null, opts?: { origin?: 'bottom' | 'left' | 'right'; count?: number; append?: boolean; bypassReducedMotion?: boolean }) => {
    if (prefersReducedMotion && !opts?.bypassReducedMotion) return
    if (!targetEl) return
    const rect = targetEl.getBoundingClientRect()
    const targetX = rect.left + rect.width / 2
    const targetY = rect.top + rect.height / 2

    const origin = opts?.origin || 'bottom'
    const count = typeof opts?.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 14
    const now = Date.now()

    const next: StarParticle[] = []
    for (let i = 0; i < count; i++) {
      let sx = window.innerWidth / 2
      let sy = window.innerHeight + 16
      if (origin === 'bottom') {
        const spread = 320
        sx = window.innerWidth / 2 + (Math.random() * spread - spread / 2)
        sy = window.innerHeight + 16
      } else if (origin === 'left') {
        sx = -42
        sy = targetY + (Math.random() * 240 - 120)
      } else if (origin === 'right') {
        sx = window.innerWidth + 42
        sy = targetY + (Math.random() * 240 - 120)
      }

      const dx = targetX - sx
      const dy = targetY - sy
      const rx =
        origin === 'left'
          ? 70 + Math.random() * 140
          : origin === 'right'
            ? -(70 + Math.random() * 140)
            : Math.random() * 180 - 90
      const dxMid = dx * 0.55 + rx
      const dyMid = dy * 0.55 - (origin === 'bottom' ? (120 + Math.random() * 80) : (70 + Math.random() * 80))
      next.push({
        id: `${now}-${i}-${Math.random().toString(16).slice(2)}`,
        startX: sx,
        startY: sy,
        dx,
        dy,
        dxMid,
        dyMid,
        rx,
        delayMs: i * celebrationTiming.starStaggerMs,
        durMs: celebrationTiming.starDurMinMs + Math.floor(Math.random() * celebrationTiming.starDurRangeMs),
        sizePx: 44 + Math.floor(Math.random() * 24),
        rotDeg: Math.floor(Math.random() * 180 - 90),
      })
    }
    setRewardStars((prev) => (opts?.append ? [...prev, ...next] : next))

    if (!prefersReducedMotion || opts?.bypassReducedMotion) {
      if (!taskGridCelebratingRef.current) {
        if (cardJiggleStartTimeoutRef.current) window.clearTimeout(cardJiggleStartTimeoutRef.current)
        if (cardJiggleEndTimeoutRef.current) window.clearTimeout(cardJiggleEndTimeoutRef.current)

        cardJiggleStartTimeoutRef.current = window.setTimeout(() => {
          cardJiggleStartTimeoutRef.current = null
          setTaskCardsJiggle(true)
          cardJiggleEndTimeoutRef.current = window.setTimeout(() => {
            cardJiggleEndTimeoutRef.current = null
            setTaskGridEntered(true)
            setTaskCardsJiggle(false)
          }, celebrationTiming.cardJiggleDurationMs + celebrationTiming.cardJiggleStaggerCapMs)
        }, celebrationTiming.starDurMinMs)
      }
    }
  }, [
    celebrationTiming.cardJiggleDurationMs,
    celebrationTiming.cardJiggleStaggerCapMs,
    celebrationTiming.starDurMinMs,
    celebrationTiming.starDurRangeMs,
    celebrationTiming.starStaggerMs,
    prefersReducedMotion,
  ])

  /** v3: wait for scroll unlock + modal unmount paint before reading target rect for stars. */
  const spawnRewardStarsAfterLayoutSettle = useCallback(
    (
      targetEl: HTMLElement | null,
      opts?: Parameters<typeof spawnRewardStars>[1],
    ) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => spawnRewardStars(targetEl, opts))
      })
    },
    [spawnRewardStars],
  )

  const clearWindowCompletePhaseTimeouts = useCallback(() => {
    windowCompletePhaseTimeoutsRef.current.forEach((t) => window.clearTimeout(t))
    windowCompletePhaseTimeoutsRef.current = []
  }, [])

  const buildWindowCompleteCelebration = (
    args: { state: TaskState; windowLabel: string; participants: string[] }
  ): WindowCompleteCelebrationViewModel => {
    const soloScoreCap = isSoloScoreCappedForShift(selectedDateKey, selectedShift)
    const soloCelebrationLayout = isSoloModeActiveForWindow(selectedDateKey, selectedWindow)
    const headlineCacheKey = `${selectedDateKey}:${selectedShift}`
    const headlineMap = shiftCompleteHeadlineByDayShiftRef.current
    let headline = headlineMap.get(headlineCacheKey)
    if (!headline) {
      headline = COMPLETE_HEADLINES[headlineRotationRef.current % COMPLETE_HEADLINES.length]!
      headlineRotationRef.current += 1
      headlineMap.set(headlineCacheKey, headline)
    }

    const tilesByName: Record<string, Array<{ taskId: string; icon: string; taskName?: string }>> = {}

    currentTasks.forEach((task) => {
      const completion = args.state[selectedDateKey]?.[selectedWindow]?.[task.id]
      if (!completion) return
      const status = effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, soloCelebrationLayout)
      if (status !== 'done') return
      const uniqueAssignees = Array.from(new Set((completion.assignees || []).filter(Boolean)))
      uniqueAssignees.forEach((assignee) => {
        if (!tilesByName[assignee]) tilesByName[assignee] = []
        tilesByName[assignee].push({ taskId: task.id, icon: task.icon, taskName: task.name })
      })
    })

    const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
    const rows = computeShiftLeadersForState(
      args.state,
      selectedDateKey,
      selectedShift,
      SHIFT_WINDOWS,
      windowTaskWeights,
      taskWeightByIdByWindow,
      soloScoreCap,
      fairSplitForSelectedDateAndShift,
      trainingKeysForDate(selectedDateKey)
    )
    const rowByName = rows.reduce<Record<string, LeaderRow>>((acc, row) => {
      acc[row.name] = row
      return acc
    }, {})

    // Secret training mode: every participant of the window gets 50 points on a dedicated screen.
    if (selectedWindowIsTraining) {
      const TRAINING_SCORE = 50
      const trainingNames = Array.from(
        new Set([...Object.keys(tilesByName), ...args.participants].filter(Boolean))
      ).slice(0, 4)
      const players: WindowCompleteCelebrationViewModel['players'] = trainingNames.map((name) => ({
        name,
        color: employeeColors[name],
        score: TRAINING_SCORE,
        tiles: tilesByName[name] || [],
        isWinner: true,
      }))
      return {
        windowLabel: args.windowLabel,
        headline: 'TRAINING SHIFT',
        phase: 'evacuate',
        players,
        layout: 'pair',
        trainingShift: true,
      }
    }

    // v2.2: on/after cutover, the 11AM window's completion celebration shows the standalone
    // 11AM number, since `score` (5PM-only) will be 0 at 11AM completion. 5PM/9PM windows keep
    // the leaderboard score. Pre-cutover behavior is unchanged.
    const useAmScoreForCelebration =
      useSeparateDayAmPmForSelected && selectedShift === 'day' && selectedWindow === '11'
    const celebrationScoreForRow = (r: LeaderRow | undefined): number =>
      useAmScoreForCelebration
        ? (r?.dayAmScoreFloat ?? r?.dayAmScore ?? 0)
        : shiftHudScoreForCelebration(r)

    if (soloCelebrationLayout) {
      const soloTiles: Array<{ taskId: string; icon: string; taskName?: string }> = []
      currentTasks.forEach((task) => {
        const completion = args.state[selectedDateKey]?.[selectedWindow]?.[task.id]
        if (!completion) return
        const status = effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, true)
        if (status !== 'done') return
        soloTiles.push({ taskId: task.id, icon: task.icon, taskName: task.name })
      })
      const soloPlayed = rows.filter((r) => shiftHudHasAnyPoints(r))
      const soloName =
        (soloPlayed[0]?.name || '').trim() ||
        (args.participants.find((p) => (p || '').trim()) || '').trim() ||
        'Solo shift'
      const soloScore = soloPlayed[0] ? Math.round(celebrationScoreForRow(soloPlayed[0]) * 10) / 10 : 0
      const players: WindowCompleteCelebrationViewModel['players'] = [
        {
          name: soloName,
          color: employeeColors[soloName],
          score: soloScore,
          tiles: soloTiles,
          isWinner: true,
        },
      ]
      return {
        windowLabel: args.windowLabel,
        headline,
        phase: 'evacuate',
        players,
        layout: 'solo',
      }
    }

    const rankedNames = rows.filter((r) => shiftHudHasAnyPoints(r)).map((r) => r.name)
    const assigneeNames = Object.keys(tilesByName)
    const mergedNames = Array.from(new Set([...rankedNames, ...args.participants, ...assigneeNames])).filter(Boolean)
    const playerNames = mergedNames.slice(0, 2)
    while (playerNames.length < 2) playerNames.push(playerNames.length === 0 ? 'Player One' : 'Player Two')

    const p1Raw = celebrationScoreForRow(rowByName[playerNames[0]])
    const p2Raw = celebrationScoreForRow(rowByName[playerNames[1]])
    const p1Score = Math.round(p1Raw * 10) / 10
    const p2Score = Math.round(p2Raw * 10) / 10
    const tie = p1Score === p2Score

    const players = playerNames.map((name, idx) => {
      const score = idx === 0 ? p1Score : p2Score
      const isWinner = tie ? score > 0 : idx === 0 ? p1Score > p2Score : p2Score > p1Score
      return {
        name,
        color: employeeColors[name],
        score,
        tiles: tilesByName[name] || [],
        isWinner,
      }
    })

    if (tie && p1Score > 0) {
      players[0].isWinner = true
      players[1].isWinner = true
    }

    return {
      windowLabel: args.windowLabel,
      headline,
      phase: 'evacuate',
      players,
      layout: 'pair',
    }
  }

  const STAR_ANIMATION_DURATION_MS = celebrationTiming.starAnimationDurationMs
  // Must match `.task-grid.task-grid--evacuating` animation duration + max stagger (TaskCard + App.css).
  const WINDOW_COMPLETE_EVAC_STAGGER_CAP_MS = 720
  const WINDOW_COMPLETE_EVAC_DURATION_MS = 1080
  const WINDOW_COMPLETE_EVAC_TO_HEADLINE_MS =
    WINDOW_COMPLETE_EVAC_STAGGER_CAP_MS + WINDOW_COMPLETE_EVAC_DURATION_MS + 160
  /** Time for Stage 1/2 strip height collapse before evacuation (v3 staged windows only). */
  const WINDOW_COMPLETE_STAGE_COLLAPSE_MS = 380

  const startWindowCompleteCelebration = useCallback(
    (args: { state: TaskState; windowLabel: string; participants: string[]; waitForStars?: boolean; skipEvacuation?: boolean }) => {
      if (windowCompleteStartTimeoutRef.current) window.clearTimeout(windowCompleteStartTimeoutRef.current)
      windowCompleteStartTimeoutRef.current = null
      clearWindowCompletePhaseTimeouts()
      setTaskGridCelebrating(false)
      setWindowCompleteStageCollapse(false)
      setWindowCompleteCelebration(null)

      // Auto-finish from the split panel: the grid is hidden (so there are no grid cards to
      // evacuate) and the panel already played its own fly-out. Go straight to the cinematic
      // card starting at the headline phase.
      if (args.skipEvacuation) {
        const model = buildWindowCompleteCelebration(args)
        const queuePhase = (delayMs: number, phase: WindowCompleteCelebrationPhase) => {
          const id = window.setTimeout(() => {
            setWindowCompleteCelebration((prev) => (prev ? { ...prev, phase } : prev))
          }, delayMs)
          windowCompletePhaseTimeoutsRef.current.push(id)
        }
        windowCompleteStartScheduledRef.current = false
        setWindowCompleteCelebration({ ...model, phase: 'headline' })
        queuePhase(680, 'boardIn')
        queuePhase(1660, 'settle')
        return
      }

      const afterScrollDelay = celebrationTiming.windowCompleteScrollDelayMs
      const starDelay = args.waitForStars && !prefersReducedMotion ? STAR_ANIMATION_DURATION_MS : 0
      const launchDelay = afterScrollDelay + starDelay

      windowCompleteStartTimeoutRef.current = window.setTimeout(() => {
        const stageTarget = completedTasksStageRef.current || completedTasksAnchorRef.current
        if (stageTarget) {
          stageTarget.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
          if (prefersReducedMotion) {
            const rect = stageTarget.getBoundingClientRect()
            const deltaY = rect.top + rect.height / 2 - window.innerHeight / 2
            if (Math.abs(deltaY) > 4) window.scrollBy({ top: deltaY, behavior: 'auto' })
          }
        } else {
          window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
        }

        windowCompleteStartTimeoutRef.current = window.setTimeout(() => {
          windowCompleteStartTimeoutRef.current = null
          const settleTarget = completedTasksStageRef.current || completedTasksAnchorRef.current
          if (settleTarget) {
            const rect = settleTarget.getBoundingClientRect()
            const deltaY = rect.top + rect.height / 2 - window.innerHeight / 2
            if (Math.abs(deltaY) > 4) window.scrollBy({ top: deltaY, behavior: 'auto' })
          }

          const runEvacAndPhases = () => {
            const model = buildWindowCompleteCelebration(args)
            const queuePhase = (delayMs: number, phase: WindowCompleteCelebrationPhase) => {
              const id = window.setTimeout(() => {
                if (phase !== 'evacuate') setTaskGridCelebrating(false)
                if (phase === 'headline') setWindowCompleteStageCollapse(false)
                setWindowCompleteCelebration((prev) => (prev ? { ...prev, phase } : prev))
              }, delayMs)
              windowCompletePhaseTimeoutsRef.current.push(id)
            }

            setTaskGridCelebrating(!prefersReducedMotion)
            setWindowCompleteCelebration({ ...model, phase: prefersReducedMotion ? 'headline' : 'evacuate' })
            windowCompleteStartScheduledRef.current = false

            if (prefersReducedMotion) {
              queuePhase(260, 'boardIn')
              queuePhase(1400, 'settle')
              return
            }

            const headlineAt = WINDOW_COMPLETE_EVAC_TO_HEADLINE_MS
            queuePhase(headlineAt, 'headline')
            queuePhase(headlineAt + 680, 'boardIn')
            queuePhase(headlineAt + 1660, 'settle')
          }

          const useStripCollapse = !prefersReducedMotion && isV3Ui && stagedTasksRefForEvac.current != null
          if (useStripCollapse) {
            setWindowCompleteStageCollapse(true)
            const collapseId = window.setTimeout(() => {
              runEvacAndPhases()
            }, WINDOW_COMPLETE_STAGE_COLLAPSE_MS)
            windowCompletePhaseTimeoutsRef.current.push(collapseId)
          } else {
            runEvacAndPhases()
          }
        }, afterScrollDelay)
      }, launchDelay)
    },
    [
      STAR_ANIMATION_DURATION_MS,
      WINDOW_COMPLETE_EVAC_TO_HEADLINE_MS,
      WINDOW_COMPLETE_STAGE_COLLAPSE_MS,
      buildWindowCompleteCelebration,
      clearWindowCompletePhaseTimeouts,
      celebrationTiming.windowCompleteScrollDelayMs,
      prefersReducedMotion,
      isV3Ui,
    ]
  )

  useEffect(() => {
    if (rewardStars.length === 0) return
    const maxMs =
      rewardStars.reduce((m, s) => Math.max(m, s.delayMs + s.durMs), 0) + 100
    const t = window.setTimeout(() => setRewardStars([]), maxMs)
    return () => window.clearTimeout(t)
  }, [rewardStars])

  // Count-up writer: format identical to shiftHudPointsCell's override path and write the
  // number straight to the score DOM node(s) so the per-frame animation does not trigger a
  // full App re-render. Targets both the main HUD ref and the v3 notify ref for the slot
  // (writing to an unmounted/hidden ref is a harmless no-op).
  const writeScoreToDom = useCallback((slot: 'p1' | 'p2', v: number) => {
    const text = Number.isFinite(v)
      ? (() => {
          const s = v.toFixed(1)
          return s.endsWith('.0') ? s.slice(0, -2) : s
        })()
      : '—'
    const els =
      slot === 'p1'
        ? [p1ScoreRef.current, v3NotifyP1ScoreRef.current]
        : [p2ScoreRef.current, v3NotifyP2ScoreRef.current]
    for (const el of els) {
      if (!el) continue
      const pm = el.querySelector('.slot-score-pm') // split mode: only the PM value animates
      if (pm) pm.textContent = text
      else el.textContent = text // non-split: the div holds only the number
    }
  }, [])

  useEffect(() => {
    const anim = scoreAnim
    if (!anim) return

    if (prefersReducedMotion) {
      if (anim.slot === 'p1') {
        p1ScoreOverrideRef.current = null
        setP1ScoreOverride(null)
      }
      if (anim.slot === 'p2') {
        p2ScoreOverrideRef.current = null
        setP2ScoreOverride(null)
      }
      setScoreAnim(null)
      return
    }

    const overrideRef = anim.slot === 'p1' ? p1ScoreOverrideRef : p2ScoreOverrideRef
    const setOverride = anim.slot === 'p1' ? setP1ScoreOverride : setP2ScoreOverride
    const durationMs = celebrationTiming.scoreCountUpMs
    let raf = 0
    const tick = () => {
      const elapsed = Date.now() - anim.startedAt
      const t = Math.min(1, elapsed / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      const raw = anim.from + (anim.to - anim.from) * eased
      const v = Math.round(raw * 10) / 10
      // Write straight to the DOM (no setState) so the count-up does not re-render the App.
      overrideRef.current = v
      writeScoreToDom(anim.slot, v)
      if (t >= 1) {
        overrideRef.current = null
        setOverride(null) // single render to settle on the real committed score
        setScoreAnim(null)
        return
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [celebrationTiming.scoreCountUpMs, prefersReducedMotion, scoreAnim, writeScoreToDom])

  useEffect(() => {
    const anim = scoreAnimP1
    if (!anim) return
    if (prefersReducedMotion) {
      p1ScoreOverrideRef.current = null
      setP1ScoreOverride(null)
      setScoreAnimP1(null)
      return
    }
    const durationMs = celebrationTiming.scoreCountUpOrderReportMs
    let raf = 0
    const tick = () => {
      const elapsed = Date.now() - anim.startedAt
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const raw = anim.from + (anim.to - anim.from) * eased
      const v = Math.round(raw * 10) / 10
      p1ScoreOverrideRef.current = v
      writeScoreToDom('p1', v)
      if (t >= 1) {
        p1ScoreOverrideRef.current = null
        setP1ScoreOverride(null)
        setScoreAnimP1(null)
        return
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [celebrationTiming.scoreCountUpOrderReportMs, prefersReducedMotion, scoreAnimP1, writeScoreToDom])

  useEffect(() => {
    const anim = scoreAnimP2
    if (!anim) return
    if (prefersReducedMotion) {
      p2ScoreOverrideRef.current = null
      setP2ScoreOverride(null)
      setScoreAnimP2(null)
      return
    }
    const durationMs = celebrationTiming.scoreCountUpOrderReportMs
    let raf = 0
    const tick = () => {
      const elapsed = Date.now() - anim.startedAt
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const raw = anim.from + (anim.to - anim.from) * eased
      const v = Math.round(raw * 10) / 10
      p2ScoreOverrideRef.current = v
      writeScoreToDom('p2', v)
      if (t >= 1) {
        p2ScoreOverrideRef.current = null
        setP2ScoreOverride(null)
        setScoreAnimP2(null)
        return
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [celebrationTiming.scoreCountUpOrderReportMs, prefersReducedMotion, scoreAnimP2, writeScoreToDom])

  /** Hold HUD at pre-reward score until stars + count-up; avoids flashing afterScore while taskState is already updated. */
  const applyShiftHudCelebrationScoreHold = useCallback((slot: 'p1' | 'p2', beforeScore: number) => {
    setScoreAnim(null)
    if (slot === 'p1') setP1ScoreOverride(beforeScore)
    else setP2ScoreOverride(beforeScore)
  }, [])

  useEffect(() => {
    if (!shiftHudPulse) return
    const t = window.setTimeout(() => setShiftHudPulse(false), prefersReducedMotion ? 0 : 520)
    return () => window.clearTimeout(t)
  }, [prefersReducedMotion, shiftHudPulse])

  // Clear pulse on next task after ~800ms
  useEffect(() => {
    if (!pulseTaskId) return
    if (prefersReducedMotion) {
      setPulseTaskId(null)
      return
    }
    if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
    pulseTimeoutRef.current = window.setTimeout(() => setPulseTaskId(null), 800)
    return () => {
      if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
    }
  }, [prefersReducedMotion, pulseTaskId])

  const appendSelectionLog = useCallback(
    (entry: Omit<SelectionLogEntry, 'ts'>) => {
      // Update local state for legacy UI in App.tsx
      setSelectionLogs((prev) => {
        const next: SelectionLogEntry[] = [{ ...entry, ts: new Date().toISOString() }, ...prev]
        // Cap to keep localStorage small on iOS 9
        if (next.length > 500) next.length = 500
        // Persist off the tap path: serializing up to 500 entries to localStorage
        // synchronously inside the handler adds main-thread time to every selection.
        // In-memory state stays immediate; the cache write happens shortly after.
        const ric =
          typeof (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ===
          'function'
            ? (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback
            : (cb: () => void) => window.setTimeout(cb, 0)
        ric(() => writeCache('traq-logs-v1', next))
        return next
      })
      // Write to Firestore for cross-device sync (fire-and-forget)
      appendSelectionLogEntry({
        action: entry.action,
        taskId: entry.taskId,
        taskName: entry.taskName,
        selectedDate: entry.dateKey,
        selectedWindow: entry.window,
        assignees: entry.assignees,
      }).catch(() => {
        // Ignore errors - localStorage is the fallback
      })
    },
    []
  )

  const now = useMemo(() => new Date(tick), [tick])
  const todayDateKey = useMemo(() => formatDateKey(startOfDay(now)), [now])
  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate])

  // Date-filtered view over breakSelectionState. Returns null whenever the stored value
  // does not belong to the currently selected date, so effects/handlers that key off
  // `selectedDateKey` can't act on a stale value captured during a date navigation render.
  const breakSelection = useMemo<BreakSelection | null>(
    () =>
      breakSelectionState && breakSelectionState.dateKey === selectedDateKey
        ? breakSelectionState.value
        : null,
    [breakSelectionState, selectedDateKey]
  )

  useEffect(() => {
    shiftCompleteHeadlineByDayShiftRef.current.clear()
  }, [selectedDateKey])

  /** Allow fadeInUp once per window/date; block replay when jiggle class is removed. */
  useEffect(() => {
    setTaskGridEntered(false)
    if (taskGridEnterTimeoutRef.current) window.clearTimeout(taskGridEnterTimeoutRef.current)
    taskGridEnterTimeoutRef.current = window.setTimeout(() => {
      taskGridEnterTimeoutRef.current = null
      setTaskGridEntered(true)
    }, 450)
    return () => {
      if (taskGridEnterTimeoutRef.current) window.clearTimeout(taskGridEnterTimeoutRef.current)
    }
  }, [selectedDateKey, selectedWindow])

  const todayDate = useMemo(() => startOfDay(now), [now])
  const leaderboardMonthRoster = useMemo(
    () => filterEmployeesForLeaderboardMonth(employees, archivedAtMs, startOfMonth(leaderboardMonth)),
    [employees, archivedAtMs, leaderboardMonth]
  )
  const leaderboardTodayRoster = useMemo(
    () => filterEmployeesForLeaderboardMonth(employees, archivedAtMs, startOfMonth(todayDate)),
    [employees, archivedAtMs, todayDate]
  )
  const todayKey = useMemo(() => formatDateKey(todayDate), [todayDate])
  const publicTimeOffRequests = useMemo(
    () => timeOffRequests.filter((req) => isTimeOffVisibleOnPublicList(req, todayKey)),
    [timeOffRequests, todayKey]
  )

  // Opt-in: localStorage `traq-debug-timeoff=1` logs public-list visibility breakdown when Time Off is open.
  useEffect(() => {
    if (!showTimeOff) return
    try {
      if (typeof localStorage === 'undefined' || localStorage.getItem('traq-debug-timeoff') !== '1') return
      // eslint-disable-next-line no-console
      console.log('[TRAQ timeoff public]', {
        todayKey,
        totalRaw: timeOffRequests.length,
        publicCount: publicTimeOffRequests.length,
        rows: timeOffRequests.map((r) => ({
          id: r.id,
          employee: r.employee,
          ...getTimeOffPublicListVisibilityDebug(r, todayKey),
        })),
      })
    } catch {
      /* ignore */
    }
  }, [showTimeOff, todayKey, timeOffRequests, publicTimeOffRequests])

  const currentMonthStartKey = useMemo(() => formatDateKey(startOfMonth(todayDate)), [todayDate])
  const isDemoDaySelected = useMemo(() => demoDayKey !== null && selectedDateKey === demoDayKey, [demoDayKey, selectedDateKey])
  const isSoloModeActiveForDateKey = useCallback(
    (dateKey: string): boolean => {
      if (!dateKey) return false
      if (isDemoDaySelected) return !!demoSoloModeByDateKey[dateKey]?.active
      if (dateKey === selectedDateKey) return !!soloMode?.active
      return false
    },
    [demoSoloModeByDateKey, isDemoDaySelected, selectedDateKey, soloMode]
  )

  /** Shift-aware solo score cap: day solo caps day shift; night solo caps night shift only. */
  const isSoloScoreCappedForShift = useCallback(
    (dateKey: string, shift: 'day' | 'night'): boolean => {
      if (!dateKey) return false
      const mode =
        isDemoDaySelected && dateKey === selectedDateKey
          ? demoSoloModeByDateKey[dateKey]
          : dateKey === selectedDateKey
            ? soloMode
            : null
      if (!mode) return false
      if (shift === 'night') return !!(mode.active || mode.nightActive)
      return !!mode.active
    },
    [demoSoloModeByDateKey, isDemoDaySelected, selectedDateKey, soloMode]
  )

  const getSoloModeForDateKey = useCallback(
    (dateKey: string): SoloMode | null => {
      if (!dateKey) return null
      if (isDemoDaySelected && dateKey === selectedDateKey) return demoSoloModeByDateKey[dateKey] ?? null
      if (dateKey === selectedDateKey) return soloMode
      return null
    },
    [demoSoloModeByDateKey, isDemoDaySelected, selectedDateKey, soloMode]
  )

  const isSoloModeActiveForWindow = useCallback(
    (dateKey: string, windowKey: WindowKey): boolean => {
      const mode = getSoloModeForDateKey(dateKey)
      if (!mode) return false
      if (windowKey === '21') return !!mode.active || !!mode.nightActive
      return !!mode.active
    },
    [getSoloModeForDateKey]
  )

  const startRandomDemoDay = useCallback(() => {
    lastInteractionTsRef.current = Date.now()
    if (!demoPrevNavRef.current) {
      demoPrevNavRef.current = { date: selectedDate, windowKey: selectedWindow, follow: followCurrentWindow }
    }
    const key = generateRandomDemoDateKey(todayKey)
    setDemoDayKey(key)
    setSelectedDate(startOfDay(parseDateKey(key)))
    setSelectedWindow('11')
    setFollowCurrentWindow(false)
    setActiveTaskId(null)
    setShowEmployeeSelector(false)
    setShowChecklistModal(false)
    setShowDailyTaskModal(false)
    setShowDailyTaskEmployeeSelector(false)
    setDailyTaskEmployees([])
    setDailyTaskStep(-1)
    setDailyTaskRevealing(false)
    setDemoDailyTaskRunByDateKey((prev) => {
      const enabled = (dailyTaskCatalog.tasks || []).filter(isDailyTaskSchedulable)
      if (!enabled.length) return prev
      const picked = enabled[Math.floor(Math.random() * enabled.length)]
      return {
        ...prev,
        [key]: {
          dateKey: key,
          taskId: picked.id,
          selectedAtMs: Date.now(),
          selectedBy: 'demo',
        },
      }
    })
    setShowAdminPanel(false)
  }, [
    dailyTaskCatalog.tasks,
    followCurrentWindow,
    selectedDate,
    selectedWindow,
    todayKey,
  ])

  const exitDemoDay = useCallback(() => {
    const key = demoDayKey
    setDemoDayKey(null)
    setDemoBreakSelectionByDateKey((prev) => {
      const next = { ...prev }
      if (key) delete next[key]
      return next
    })
    setDemoSoloModeByDateKey((prev) => {
      const next = { ...prev }
      if (key) delete next[key]
      return next
    })
    setDemoDailyTaskRunByDateKey((prev) => {
      const next = { ...prev }
      if (key) delete next[key]
      return next
    })
    setTaskState((prev) => {
      if (!key) return prev
      const next: TaskState = { ...prev }
      delete next[key]
      return next
    })
    setBreakSelectionState(null)
    setSoloMode(null)
    setActiveTaskId(null)
    setShowEmployeeSelector(false)
    setShowChecklistModal(false)
    setShowDailyTaskModal(false)
    setShowDailyTaskEmployeeSelector(false)
    setDailyTaskEmployees([])
    setDailyTaskStep(-1)
    setDailyTaskRevealing(false)
    const restore = demoPrevNavRef.current
    demoPrevNavRef.current = null
    if (restore) {
      setSelectedDate(startOfDay(restore.date))
      setSelectedWindow(restore.windowKey)
      setFollowCurrentWindow(restore.follow)
    } else {
      setSelectedDate(startOfDay(new Date()))
      setSelectedWindow(getCurrentWindow())
      setFollowCurrentWindow(true)
    }
    setShowAdminPanel(false)
  }, [demoDayKey])

  const reshuffleDemoDailyTask = useCallback(() => {
    if (!demoDayKey) return
    setShowDailyTaskModal(false)
    setShowDailyTaskEmployeeSelector(false)
    setDailyTaskEmployees([])
    setDailyTaskStep(-1)
    setDailyTaskRevealing(false)
    setDemoDailyTaskRunByDateKey((prev) => {
      const enabled = (dailyTaskCatalog.tasks || []).filter(isDailyTaskSchedulable)
      if (!enabled.length) return prev
      const picked = enabled[Math.floor(Math.random() * enabled.length)]
      return {
        ...prev,
        [demoDayKey]: {
          dateKey: demoDayKey,
          taskId: picked.id,
          selectedAtMs: Date.now(),
          selectedBy: 'demo',
        },
      }
    })
    setShowAdminPanel(false)
  }, [demoDayKey, dailyTaskCatalog.tasks])

  // Keep sandbox date pinned while Demo Day is active (guards against stray snap-back).
  useEffect(() => {
    if (!demoDayKey) return
    if (selectedDateKey !== demoDayKey) {
      setSelectedDate(startOfDay(parseDateKey(demoDayKey)))
    }
  }, [demoDayKey, selectedDateKey])

  // Break Selection: per-day editable plan (stored separately from task completions)
  useEffect(() => {
    if (isDemoDaySelected) {
      setBreakSelectionState({
        dateKey: selectedDateKey,
        value: demoBreakSelectionByDateKey[selectedDateKey] ?? null,
      })
      return
    }
    // Tag the state with the dateKey it belongs to so date-sensitive consumers
    // (e.g. 5PM self-heal) can ignore stale values captured during a date-change render.
    const subscribedDateKey = selectedDateKey
    setBreakSelectionState({ dateKey: subscribedDateKey, value: null })
    return subscribeToBreakSelection(
      subscribedDateKey,
      (sel) => setBreakSelectionState({ dateKey: subscribedDateKey, value: sel }),
      () => {
        // Non-fatal: still usable via localStorage fallback
      }
    )
  }, [demoBreakSelectionByDateKey, isDemoDaySelected, selectedDateKey])

  // Solo Mode: per-day setting (stored separately from task completions)
  useEffect(() => {
    if (isDemoDaySelected) {
      setSoloMode(demoSoloModeByDateKey[selectedDateKey] ?? null)
      return
    }
    setSoloMode(null)
    return subscribeToSoloMode(
      selectedDateKey,
      (mode) => setSoloMode(mode),
      () => {
        // Non-fatal: still usable via localStorage fallback
      }
    )
  }, [demoSoloModeByDateKey, isDemoDaySelected, selectedDateKey])

  // Subscribe to today's break selection for countdown (independent of selectedDate)
  useEffect(() => {
    return subscribeToBreakSelection(
      todayKey,
      (sel) => setTodayBreakSelection(sel),
      () => {
        // Non-fatal: countdown just won't show
      }
    )
  }, [todayKey])

  // Compute next upcoming break from today's break selection
  const nextBreakInfo = useMemo(() => {
    const slots = todayBreakSelection?.slots || []
    if (slots.length === 0) return null

    const nowMs = now.getTime()
    let earliest: { employee: string; startMs: number } | null = null

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      if (!slot.start || !slot.employee) continue
      const breakStart = combineDateTime(todayDate, slot.start)
      const startMs = breakStart.getTime()
      // Only consider future breaks
      if (startMs <= nowMs) continue
      if (!earliest || startMs < earliest.startMs) {
        earliest = { employee: slot.employee, startMs }
      }
    }

    return earliest
  }, [now, todayBreakSelection, todayDate])

  // Check if both employees are working doubles (both have 1-hour breaks)
  // If so, no shift change countdown is needed
  const bothWorkingDoubles = useMemo(() => {
    const slots = todayBreakSelection?.slots || []
    if (slots.length < 2) return false
    return slots[0]?.shiftType === 'double' && slots[1]?.shiftType === 'double'
  }, [todayBreakSelection])

  // Shift change time: 5:00 PM today
  const shiftChangeMs = useMemo(() => {
    const fivePM = new Date(todayDate)
    fivePM.setHours(17, 0, 0, 0)
    return fivePM.getTime()
  }, [todayDate])

  // Countdown remaining milliseconds (uses the fast-ticking countdownNowMs)
  // Demo mode can override the countdown for testing
  const COUNTDOWN_WINDOW_MS = 30 * 60_000 // 30 minutes
  
  // First, check if we SHOULD be in countdown window using the minute-level `now`
  // This detects entering the window even when the 1-second interval isn't running yet
  const nowMs = now.getTime()
  const shouldBeInBreakWindow = nextBreakInfo !== null && 
    (nextBreakInfo.startMs - nowMs) <= COUNTDOWN_WINDOW_MS && 
    (nextBreakInfo.startMs - nowMs) > 0
  const shouldBeInShiftChangeWindow = !shouldBeInBreakWindow && 
    !bothWorkingDoubles &&
    (shiftChangeMs - nowMs) <= COUNTDOWN_WINDOW_MS && 
    (shiftChangeMs - nowMs) > 0
  
  // Now compute the precise remaining time using countdownNowMs (updated every second when active)
  const demoMsRemaining = demoCountdownEndMs !== null ? Math.max(0, demoCountdownEndMs - countdownNowMs) : null
  const realMsRemaining = nextBreakInfo ? Math.max(0, nextBreakInfo.startMs - countdownNowMs) : null
  const countdownMsRemaining = demoMsRemaining !== null ? demoMsRemaining : realMsRemaining
  const countdownEmployee = demoCountdownEndMs !== null ? 'Demo Employee' : nextBreakInfo?.employee || ''

  const showBreakCountdown = countdownMsRemaining !== null && countdownMsRemaining <= COUNTDOWN_WINDOW_MS && countdownMsRemaining > 0

  // Shift change countdown (5 PM) - only if not both working doubles
  // Demo mode can override for testing
  const realShiftChangeMsRemaining = Math.max(0, shiftChangeMs - countdownNowMs)
  const demoShiftChangeMsRemaining = demoShiftChangeEndMs !== null ? Math.max(0, demoShiftChangeEndMs - countdownNowMs) : null
  const shiftChangeMsRemaining = demoShiftChangeMsRemaining !== null ? demoShiftChangeMsRemaining : realShiftChangeMsRemaining
  const showShiftChangeCountdown = 
    !showBreakCountdown && 
    (demoShiftChangeEndMs !== null || !bothWorkingDoubles) && 
    shiftChangeMsRemaining > 0 && 
    shiftChangeMsRemaining <= COUNTDOWN_WINDOW_MS

  const screensaverCountdown = useMemo((): ScreensaverCountdown | null => {
    if (showBreakCountdown && countdownMsRemaining !== null && countdownEmployee) {
      return { kind: 'break', remainingMs: countdownMsRemaining, employee: countdownEmployee }
    }
    if (showShiftChangeCountdown) {
      return { kind: 'shift', remainingMs: shiftChangeMsRemaining }
    }
    return null
  }, [
    showBreakCountdown,
    showShiftChangeCountdown,
    countdownMsRemaining,
    shiftChangeMsRemaining,
    countdownEmployee,
  ])

  // Clear demo shift change when it hits 0
  useEffect(() => {
    if (demoShiftChangeEndMs !== null && shiftChangeMsRemaining === 0) {
      setDemoShiftChangeEndMs(null)
    }
  }, [demoShiftChangeEndMs, shiftChangeMsRemaining])

  // Sync countdownNowMs when entering countdown window (so it's not stale)
  const wasInWindowRef = useRef(false)
  useEffect(() => {
    const isInWindow = shouldBeInBreakWindow || shouldBeInShiftChangeWindow || demoCountdownEndMs !== null || demoShiftChangeEndMs !== null
    if (isInWindow && !wasInWindowRef.current) {
      // Just entered the window - sync the clock
      setCountdownNowMs(Date.now())
    }
    wasInWindowRef.current = isInWindow
  }, [shouldBeInBreakWindow, shouldBeInShiftChangeWindow, demoCountdownEndMs, demoShiftChangeEndMs])

  // 1-second tick for live countdown (runs when we should be in any countdown window or demo is active)
  useEffect(() => {
    const shouldTick = shouldBeInBreakWindow || shouldBeInShiftChangeWindow || demoCountdownEndMs !== null || demoShiftChangeEndMs !== null
    if (!shouldTick) return
    const id = setInterval(() => setCountdownNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [shouldBeInBreakWindow, shouldBeInShiftChangeWindow, demoCountdownEndMs, demoShiftChangeEndMs])

  // Track previous countdown state to detect when it hits 0
  const prevCountdownMsRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevCountdownMsRef.current
    prevCountdownMsRef.current = countdownMsRemaining

    // Trigger celebration when countdown crosses from >0 to 0
    if (prev !== null && prev > 0 && countdownMsRemaining === 0 && countdownEmployee) {
      // Clear demo mode
      if (demoCountdownEndMs !== null) {
        setDemoCountdownEndMs(null)
      }
      // Clear any existing timeout
      if (breakCelebrationTimeoutRef.current) {
        window.clearTimeout(breakCelebrationTimeoutRef.current)
      }
      // Show celebration
      setBreakCelebration({ show: true, employee: countdownEmployee })
      // Auto-dismiss after 5 seconds
      breakCelebrationTimeoutRef.current = window.setTimeout(() => {
        setBreakCelebration(null)
      }, 5000)
    }
  }, [countdownMsRemaining, countdownEmployee, demoCountdownEndMs])

  // Cleanup celebration timeout on unmount
  useEffect(() => {
    return () => {
      if (breakCelebrationTimeoutRef.current) {
        window.clearTimeout(breakCelebrationTimeoutRef.current)
      }
    }
  }, [])

  // ────────────────────────────────────────────────────────────────────────────
  // Demo Day wrappers: ensure demo-day actions never write to Firestore.
  // ────────────────────────────────────────────────────────────────────────────

  const persistBreakSelectionOrNoop = useCallback(
    async (dateKey: string, selection: BreakSelection | null): Promise<void> => {
      if (isDemoDaySelected && dateKey === selectedDateKey) return
      await saveBreakSelection(dateKey, selection)
    },
    [isDemoDaySelected, selectedDateKey]
  )

  const persistSoloModeOrNoop = useCallback(
    async (dateKey: string, mode: SoloMode | null): Promise<void> => {
      if (isDemoDaySelected && dateKey === selectedDateKey) return
      await saveSoloMode(dateKey, mode)
    },
    [isDemoDaySelected, selectedDateKey]
  )

  const persistCompleteTaskIfAvailableOrNoop = useCallback(
    async (args: CompleteTaskArgs): Promise<void> => {
      if (isDemoDaySelected && args.dateKey === selectedDateKey) return
      await completeTaskIfAvailable(args)
    },
    [isDemoDaySelected, selectedDateKey]
  )

  const persistAdminSetTaskCompletionOrNoop = useCallback(
    async (args: CompleteTaskArgs): Promise<void> => {
      if (isDemoDaySelected && args.dateKey === selectedDateKey) return
      await adminSetTaskCompletion(args)
    },
    [isDemoDaySelected, selectedDateKey]
  )

  const persistAdminClearTaskCompletionOrNoop = useCallback(
    async (dateKey: string, windowKey: WindowKey, taskId: string): Promise<void> => {
      if (isDemoDaySelected && dateKey === selectedDateKey) return
      await adminClearTaskCompletion(dateKey, windowKey, taskId)
    },
    [isDemoDaySelected, selectedDateKey]
  )

  const leaderboardMonthTitle = useMemo(() => formatMonthTitle(startOfMonth(leaderboardMonth)), [leaderboardMonth])

  const orderedMusicTracks = useMemo(() => {
    const byId: Record<string, MusicTrack> = {}
    musicTracks.forEach((t) => {
      byId[t.id] = t
    })
    const order = Array.isArray(musicPlaylist.order) ? musicPlaylist.order : []
    const seen: Record<string, true> = {}
    const next: MusicTrack[] = []
    order.forEach((id) => {
      const t = byId[id]
      if (!t) return
      if (seen[id]) return
      seen[id] = true
      next.push(t)
    })
    musicTracks.forEach((t) => {
      if (seen[t.id]) return
      next.push(t)
    })
    return next
  }, [musicPlaylist.order, musicTracks])

  const persistMusicOrder = useCallback((nextOrder: string[]) => {
    setMusicPlaylist((prev) => ({ ...prev, order: nextOrder }))
    saveMusicPlaylist(nextOrder).catch(() => {
      // ignore
    })
  }, [])

  const [lbScoreDisplayByName, setLbScoreDisplayByName] = useState<Record<string, number>>({})
  const lbScoreDisplayRef = useRef<Record<string, number>>({})
  const lbCardElByNameRef = useRef<Record<string, HTMLDivElement | null>>({})
  const lbPrevRectsByNameRef = useRef<Record<string, DOMRect>>({})

  useEffect(() => {
    lbScoreDisplayRef.current = lbScoreDisplayByName
  }, [lbScoreDisplayByName])
  // Persist task state to localStorage for fast boot/offline (cloud sync is now per-action + realtime)
  useEffect(() => {
    if (!demoDayKey) {
      writeCache('traq-task-state-v1', taskState)
      return
    }
    // Demo Day must never persist into the normal taskState cache.
    const stripped: TaskState = { ...taskState }
    delete stripped[demoDayKey]
    writeCache('traq-task-state-v1', stripped)
  }, [demoDayKey, taskState])

  // Persist task catalog to localStorage for fast boot/offline (Firestore is the source of truth)
  useEffect(() => {
    writeCache('traq-task-catalog-v1', taskCatalog)
  }, [taskCatalog])

  // Persist task overrides to localStorage for fast boot/offline (Firestore is the source of truth)
  useEffect(() => {
    writeCache('traq-task-overrides-v1', taskOverrides)
  }, [taskOverrides])

  // Persist daily task catalog to localStorage for fast boot/offline (Firestore is the source of truth)
  useEffect(() => {
    writeCache('traq-daily-task-catalog-v1', dailyTaskCatalog)
  }, [dailyTaskCatalog])

  // Check Firebase connection status
  useEffect(() => {
    getFirebaseStatus().then(status => {
      if (!status.connected) {
        console.warn('Firebase not connected:', status.error)
      }
    })
  }, [])

  // Load initial data from Firestore
  useEffect(() => {
    // If we boot from cache, show a brief loading overlay to avoid visible UI popping/glitches.
    if (hasBootstrapCache()) {
      const id = setTimeout(() => setShowStartupCover(false), 450)
      return () => clearTimeout(id)
    }
  }, [])

  // Load initial data from Firestore (employees + task order + task catalog). Task completions are live-synced.
  useEffect(() => {
    const loadInitialData = async () => {
      // If we have cached data, render immediately and sync in background
      if (hasBootstrapCache()) {
        setIsLoadingData(false)
        setIsInitialSyncing(true)
      } else {
        setIsLoadingData(true)
        setIsInitialSyncing(true)
      }
      try {
        const [employeeRoster, taskOrderData, taskOrderV3Data, taskCatalogData, taskOverridesData, dailyTaskCatalogData, taskStagesData] = await Promise.all([
          getEmployeeRoster(),
          getTaskOrder(),
          getTaskOrderV3(),
          getTaskCatalog(),
          getTaskOverrides(),
          getDailyTaskCatalog(),
          getTaskStages(),
        ])
        
        if (employeeRoster.list.length > 0) {
          setEmployees(employeeRoster.list)
        }
        setArchivedAtMs(employeeRoster.archivedAtMs)
        if (Object.keys(taskOrderData).length > 0) {
          setTaskOrder(taskOrderData)
        }
        if (taskCatalogData?.tasks?.length) {
          setTaskCatalog(taskCatalogData)
        }
        if (taskOverridesData?.overrides && Object.keys(taskOverridesData.overrides).length > 0) {
          setTaskOverrides(taskOverridesData)
        }
        if (dailyTaskCatalogData?.tasks?.length) {
          setDailyTaskCatalogState(dailyTaskCatalogData)
        }
        if (Object.keys(taskStagesData).length > 0) {
          setTaskStages(taskStagesData)
        }
        if (Object.keys(taskOrderV3Data).length > 0) {
          setTaskOrderV3(taskOrderV3Data)
        }
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setIsLoadingData(false)
        setIsInitialSyncing(false)
        setShowStartupCover(false)
      }
    }
    
    loadInitialData()
  }, [])

  // Subscribe to real-time updates for employees
  useEffect(() => {
    const unsubscribe = subscribeToEmployeeRoster((roster) => {
      if (roster.list.length > 0) {
        setEmployees(roster.list)
      }
      setArchivedAtMs(roster.archivedAtMs)
    })
    
    return () => unsubscribe()
  }, [])

  // Subscribe to real-time updates for employee colors
  useEffect(() => {
    const unsubscribe = subscribeToEmployeeColors((colors) => {
      setEmployeeColors(colors)
    })
    
    return () => unsubscribe()
  }, [])

  // Defensive refresh: if a color is cleared from another device and this client missed the realtime update,
  // ensure we still converge (and reprompt) when the employee selection UI is opened.
  useEffect(() => {
    if (!showEmployeeSelector && !showDailyTaskEmployeeSelector) return
    getEmployeeColors()
      .then((colors) => setEmployeeColors(colors))
      .catch(() => {
        // Non-fatal; realtime (or cache) will still drive UI.
      })
  }, [showDailyTaskEmployeeSelector, showEmployeeSelector])

  // Subscribe to real-time updates for task order
  useEffect(() => {
    const unsubscribe = subscribeToTaskOrder((updatedOrder) => {
      setTaskOrder(updatedOrder)
    })
    
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToTaskOrderV3((orderV3) => {
      setTaskOrderV3(orderV3)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to real-time updates for task stages (v3 stage grouping)
  useEffect(() => {
    const unsubscribe = subscribeToTaskStages((stages) => {
      setTaskStages(stages)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to real-time updates for task catalog (admin-added tasks)
  useEffect(() => {
    const unsubscribe = subscribeToTaskCatalog((catalog) => {
      setTaskCatalog(catalog)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to real-time updates for Daily Task catalog
  useEffect(() => {
    const unsubscribe = subscribeToDailyTaskCatalog((catalog) => {
      setDailyTaskCatalogState(catalog)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToDailyTaskScheduleAiSettings(() => {})
    return () => unsubscribe()
  }, [])

  // Subscribe to today's Daily Task run (shared)
  useEffect(() => {
    const unsubscribe = subscribeToDailyTaskRun(
      todayDateKey,
      (run) => setTodayDailyTaskRun(run),
      (err) => console.warn('Daily task run subscription error:', err)
    )
    return () => unsubscribe()
  }, [todayDateKey])

  // Subscribe to this week's schedule (approval gate for today's assignment)
  useEffect(() => {
    const weekStart = getWeekStartDateKeySunday(todayDateKey)
    const unsubscribe = subscribeToDailyTaskWeek(
      weekStart,
      (week) => setTodayDailyTaskWeek(week),
      (err) => console.warn('Daily task week subscription error:', err)
    )
    return () => unsubscribe()
  }, [todayDateKey])

  // Subscribe to real-time updates for task overrides (requirements overrides)
  useEffect(() => {
    const unsubscribe = subscribeToTaskOverrides((v) => {
      setTaskOverrides(v)
    })
    return () => unsubscribe()
  }, [])

  // Update time-of-day band (Hermitage, TN solar)
  useEffect(() => {
    const updateTimeOfDay = () => {
      setTimeOfDay(getTimeOfDaySolar(new Date(), DEFAULT_SOLAR_COORDS))
    }
    updateTimeOfDay()
    const timeInterval = setInterval(updateTimeOfDay, 60_000)
    return () => clearInterval(timeInterval)
  }, [])

  // Subscribe to force refresh events from admin
  useEffect(() => {
    const unsubscribe = subscribeToForceRefresh((timestamp) => {
      // Only show prompt if the trigger happened after this app instance loaded
      if (timestamp > appLoadTimeRef.current) {
        startForceRefreshCountdown()
      }
    })
    return () => unsubscribe()
  }, [startForceRefreshCountdown])

  // Cleanup force-refresh countdown interval on unmount.
  useEffect(() => {
    return () => {
      if (forceRefreshIntervalRef.current) window.clearInterval(forceRefreshIntervalRef.current)
      forceRefreshIntervalRef.current = null
    }
  }, [])

  // Admin-only: subscribe to night shift reports
  useEffect(() => {
    if (!isAdmin) {
      setNightShiftReports([])
      return
    }
    const unsubscribe = subscribeToNightShiftReports((reports) => {
      setNightShiftReports(reports)
    })
    return () => unsubscribe()
  }, [isAdmin])

  // Subscribe to availability map (for time off feature)
  useEffect(() => {
    const unsubscribe = subscribeToAvailability((state) => {
      setAvailabilityState(state)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to time off requests when the modal is open or admin is viewing time off
  useEffect(() => {
    const shouldSubscribe = showTimeOff || (isAdmin && showAdminPanel && adminView === 'timeoff')
    if (!shouldSubscribe) return
    const unsubscribe = subscribeToTimeOffRequests((requests) => {
      setTimeOffRequests(requests)
    })
    return () => unsubscribe()
  }, [showTimeOff, isAdmin, showAdminPanel, adminView])

  // Subscribe to job applications when admin is viewing the applications tab
  useEffect(() => {
    const shouldSubscribe = isAdmin && showAdminPanel && adminView === 'applications'
    if (!shouldSubscribe) return
    const unsubscribe = subscribeToApplications((apps) => {
      setApplications(apps)
    })
    return () => unsubscribe()
  }, [isAdmin, showAdminPanel, adminView])

  // Admin-only: Daily Tasks week preview + recent history
  useEffect(() => {
    const shouldSubscribe = isAdmin && showAdminPanel && adminView === 'dailyTasks'
    if (!shouldSubscribe) return

    const tasks = dailyTaskCatalog.tasks || []
    const next7 = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(todayDateKey, i))
    const weekStarts = Array.from(new Set(next7.map((dk) => getWeekStartDateKeySunday(dk))))

    // Ensure week docs exist (best-effort)
    weekStarts.forEach((ws) => {
      void ensureDailyTaskWeekForDateKey(ws, tasks)
    })

    const unsubs = weekStarts.map((ws) =>
      subscribeToDailyTaskWeek(
        ws,
        (week: DailyTaskWeek | null) => {
          setAdminDailyWeeksByStart((prev) => ({ ...prev, [ws]: week }))
        },
        (err: unknown) => console.warn('Daily task week subscription error:', err)
      )
    )

    // Load recent runs (last 30 days) for the admin view
    setAdminDailyRunsLoading(true)
    listDailyTaskRunsInRange(addDaysToDateKey(todayDateKey, -30), todayDateKey)
      .then((runs) => setAdminDailyRunsRecent(runs))
      .catch((e) => console.warn('Failed to load recent daily task runs:', e))
      .finally(() => setAdminDailyRunsLoading(false))

    return () => {
      unsubs.forEach((u) => u())
    }
  }, [adminView, dailyTaskCatalog.tasks, isAdmin, showAdminPanel, todayDateKey])

  // Subscribe to stock reports when any stock UI is open
  useEffect(() => {
    if (!showStockReports && !showStockCheckTaskModal) return
    const unsubscribe = subscribeToStockReports((reports) => {
      setStockReports(reports)
    })
    return () => unsubscribe()
  }, [showStockCheckTaskModal, showStockReports])

  const beginStockReportFlow = useCallback(() => {
    setStockReporterName(null)
    setStockKind(null)
    setStockItem('')
    setStockError(null)
    setStockWizardStep('kind')
  }, [])

  const resetStockWizardToList = useCallback(() => {
    setStockWizardStep(null)
    setStockReporterName(null)
    setStockKind(null)
    setStockItem('')
    setStockError(null)
    setStockSending(false)
  }, [])

  const stockReportsPending = useMemo(
    () => stockReports.filter((r) => r.status === 'pending'),
    [stockReports]
  )
  const stockReportsOutPendingCount = useMemo(
    () => countOutPending(stockReportsPending),
    [stockReportsPending]
  )
  const stockReportsFinished = useMemo(
    () =>
      stockReports
        .filter((r) => r.status === 'finished')
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)),
    [stockReports]
  )

  // Cleanup stock send FX timers on unmount
  useEffect(() => {
    return () => {
      if (stockSendFxTimeoutRef.current) {
        window.clearTimeout(stockSendFxTimeoutRef.current)
        stockSendFxTimeoutRef.current = null
      }
    }
  }, [])

  const beginNotifyManagementFlow = useCallback(() => {
    setNotifyKind(null)
    setNotifyCustomTitle('')
    setNotifyDetails('')
    setNotifyReporterName(null)
    setNotifyError(null)
    setNotifySending(false)
    setNotifyWizardStep('kind')
  }, [])

  const resetNotifyManagementFlow = useCallback(() => {
    setNotifyWizardStep(null)
    setNotifyKind(null)
    setNotifyCustomTitle('')
    setNotifyDetails('')
    setNotifyReporterName(null)
    setNotifyError(null)
    setNotifySending(false)
  }, [])

  // Cleanup notify send FX timers on unmount
  useEffect(() => {
    return () => {
      if (notifySendFxTimeoutRef.current) {
        window.clearTimeout(notifySendFxTimeoutRef.current)
        notifySendFxTimeoutRef.current = null
      }
    }
  }, [])

  const sendNotifyManagementNow = useCallback(async () => {
    const kind = notifyKind
    const title = notifyCustomTitle.trim()
    const details = notifyDetails.trim()
    const by = (notifyReporterName || '').trim()

    if (!kind) {
      setNotifyError('Choose what you are reporting.')
      return
    }
    if (kind === 'custom' && !title) {
      setNotifyError('Type a title for your custom report.')
      return
    }
    if (!by) {
      setNotifyError('Please select your name.')
      return
    }

    setNotifySending(true)
    setNotifyError(null)
    try {
      const kindLabel =
        kind === 'leak' ? 'LEAK' : kind === 'broken' ? 'BROKEN' : kind === 'insect' ? 'INSECT SIGHTING' : 'CUSTOM'

      // Save report (Firestore) — implementation added in services/firestore.ts
      await createManagementReport({
        kind,
        details,
        customTitle: kind === 'custom' ? title : undefined,
        createdBy: by,
      })

      // Notify manager via EmailJS (do not block UI on failure)
      const days =
        kind === 'custom'
          ? `${kindLabel} (${title || 'Untitled'}): ${details || '(no additional info)'}`
          : `${kindLabel}: ${details || '(no additional info)'}`
      void sendTimeOffEmailNotification({
        employee: by,
        days,
      })

      resetNotifyManagementFlow()
      // Play confirmation FX (paper plane + message)
      setNotifySendFxNonce((n) => n + 1)
      setNotifySendFxVisible(true)
      if (notifySendFxTimeoutRef.current) window.clearTimeout(notifySendFxTimeoutRef.current)
      notifySendFxTimeoutRef.current = window.setTimeout(() => {
        setNotifySendFxVisible(false)
      }, 1600)

      // Close modal after confirmation
      window.setTimeout(() => {
        setShowNotifyManagement(false)
      }, 900)
    } catch (e) {
      console.error('Failed to create management report:', e)
      const msg = e instanceof Error ? e.message : String(e || '')
      const lower = msg.toLowerCase()
      if (lower.includes('permission') || lower.includes('insufficient permissions') || lower.includes('permission-denied')) {
        setNotifyError('Missing Firestore permission for management reports. Deploy updated Firestore rules, then try again.')
      } else if (lower.includes('firestore sdk not available')) {
        setNotifyError('Firestore is not ready on this device/browser. Try reloading, then submit again.')
      } else {
        setNotifyError(msg ? `Could not send: ${msg}` : 'Could not send. Try again.')
      }
    } finally {
      setNotifySending(false)
    }
  }, [notifyCustomTitle, notifyDetails, notifyKind, notifyReporterName, resetNotifyManagementFlow])

  const sendStockReportNow = useCallback(async () => {
    const kind = stockKind
    const item = stockItem.trim()
    if (!kind) {
      setStockError('Choose what you are reporting.')
      return
    }
    if (!item) {
      setStockError('Type the item you are reporting.')
      return
    }
    setStockSending(true)
    setStockError(null)
    try {
      await createStockReport({
        kind,
        item,
        createdBy: stockReporterName || undefined,
      })
      // Notify manager via EmailJS (do not block UI on failure)
      void sendStockReportEmailNotification({
        kind,
        item,
        by: stockReporterName || undefined,
        reportedAtIso: new Date().toISOString(),
      })
      resetStockWizardToList()
      // Play confirmation FX (paper plane + message)
      setStockSendFxNonce((n) => n + 1)
      setStockSendFxVisible(true)
      if (stockSendFxTimeoutRef.current) window.clearTimeout(stockSendFxTimeoutRef.current)
      stockSendFxTimeoutRef.current = window.setTimeout(() => {
        setStockSendFxVisible(false)
      }, 1600)
    } catch (e) {
      console.error('Failed to create stock report:', e)
      setStockError('Could not send. Try again.')
    } finally {
      setStockSending(false)
    }
  }, [stockKind, stockItem, stockReporterName, resetStockWizardToList])

  const stockCheckCreateItem = useCallback(
    async (args: { kind: StockReportKind; item: string }) => {
      const kind = args.kind
      const item = String(args.item || '').trim()
      if (!item) throw new Error('missing-item')
      const actor =
        assignees.length >= 2
          ? `${String(assignees[0] || '').trim()} & ${String(assignees[1] || '').trim()}`.trim()
          : String(assignees[0] || '').trim()
      await createStockReport({ kind, item, createdBy: actor || undefined })
      void sendStockReportEmailNotification({
        kind,
        item,
        by: actor || undefined,
        reportedAtIso: new Date().toISOString(),
      })
      // Play confirmation FX (paper plane + message)
      setStockSendFxNonce((n) => n + 1)
      setStockSendFxVisible(true)
      if (stockSendFxTimeoutRef.current) window.clearTimeout(stockSendFxTimeoutRef.current)
      stockSendFxTimeoutRef.current = window.setTimeout(() => {
        setStockSendFxVisible(false)
      }, 1600)
    },
    [assignees]
  )

  const stockCheckDeleteItem = useCallback(async (id: string) => {
    const report = stockReports.find((r) => r.id === id) || null
    const actor =
      assignees.length >= 2
        ? `${String(assignees[0] || '').trim()} & ${String(assignees[1] || '').trim()}`.trim()
        : String(assignees[0] || '').trim()
    await deleteStockReport(id, { actor: actor || undefined })
    // Notify management that stock changed (best-effort)
    if (report) {
      void sendStockReportEmailNotification({
        kind: report.kind,
        item: `${report.item} (deleted)`,
        by: actor || undefined,
        reportedAtIso: new Date().toISOString(),
      })
    }
    setStockSendFxNonce((n) => n + 1)
    setStockSendFxVisible(true)
    if (stockSendFxTimeoutRef.current) window.clearTimeout(stockSendFxTimeoutRef.current)
    stockSendFxTimeoutRef.current = window.setTimeout(() => {
      setStockSendFxVisible(false)
    }, 1600)
  }, [assignees, stockReports])

  // Subscribe to notifications (always active for employee notification overlay)
  useEffect(() => {
    const unsubscribe = subscribeToNotifications((notifs) => {
      setNotifications(notifs)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to print request (admin sends document to iPad)
  useEffect(() => {
    const unsubscribe = subscribeToPrintRequest((req) => {
      setPrintRequest(req)
      setPrintRequestPrinted(false)
    })
    return () => unsubscribe()
  }, [])

  // Admin-only: subscribe to management reports while viewing that tab
  useEffect(() => {
    const shouldSubscribe = isAdmin && showAdminPanel && adminView === 'managementReports'
    if (!shouldSubscribe) return
    const unsubscribe = subscribeToManagementReports((reports) => setManagementReports(reports))
    return () => unsubscribe()
  }, [adminView, isAdmin, showAdminPanel])

  // Admin-only: subscribe to music library while the admin panel is open
  useEffect(() => {
    if (!isAdmin || !showAdminPanel) return
    const unsubTracks = subscribeToMusicTracks((t) => setMusicTracks(t))
    const unsubPlaylist = subscribeToMusicPlaylist((p) => setMusicPlaylist(p))
    const unsubMusicLogs = subscribeToMusicControlLogs((logs) => setMusicControlLogs(logs))
    // Sessions for admin remote control: poll via REST so it works even when Firestore SDK listeners are flaky.
    let cancelled = false
    const pollSessions = async () => {
      try {
        const s = await fetchLatestMusicSessionsREST(50)
        if (!cancelled) setMusicSessions(s)
      } catch {
        if (!cancelled) setMusicSessions([])
      }
    }
    pollSessions()
    const pollId = window.setInterval(pollSessions, 3000)

    // Keep a small clock running while admin is open so "Active/last seen" updates feel realtime.
    setAdminSessionsNowMs(Date.now())
    const nowId = window.setInterval(() => setAdminSessionsNowMs(Date.now()), 2000)
    
    // Subscribe to admin login attempts
    const unsubLoginAttempts = subscribeToAdminLoginAttempts((attempts) => setAdminLoginAttempts(attempts))
    
    return () => {
      cancelled = true
      unsubTracks()
      unsubPlaylist()
      unsubMusicLogs()
      unsubLoginAttempts()
      window.clearInterval(pollId)
      window.clearInterval(nowId)
    }
  }, [isAdmin, showAdminPanel])

  // Helper to send remote commands with visual feedback
  const sendCommandWithFeedback = useCallback(
    async (
      sessionId: string,
      action: 'play' | 'pause' | 'next' | 'prev' | 'seek',
      payload?: { positionSec?: number }
    ) => {
      setCommandFeedback((prev) => ({ ...prev, [sessionId]: { status: 'sending' } }))
      try {
        const result = await sendSessionCommandQueuedREST(sessionId, action, payload)
        if (result.success) {
          setCommandFeedback((prev) => ({ ...prev, [sessionId]: { status: 'sent' } }))
        } else {
          console.error(`Command ${action} failed for session ${sessionId}:`, result.error)
          setCommandFeedback((prev) => ({
            ...prev,
            [sessionId]: { status: 'error', error: result.error || 'Unknown error' },
          }))
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setCommandFeedback((prev) => ({ ...prev, [sessionId]: { status: 'error', error: msg } }))
      }
      // Clear feedback after 1.5 seconds
      setTimeout(() => {
        setCommandFeedback((prev) => {
          const { [sessionId]: _, ...rest } = prev
          return rest
        })
      }, 1500)
    },
    []
  )

  // Keep music control logs updating even when Firestore is blocked/unavailable.
  // `appendMusicControlLog()` emits a browser event after updating localStorage.
  useEffect(() => {
    const same = (a: MusicControlLogEntry, b: MusicControlLogEntry) => {
      return a.ts === b.ts && a.action === b.action && a.trackId === b.trackId
    }
    const onLog = (evt: Event) => {
      const e = evt as CustomEvent<MusicControlLogEntry>
      const entry = e.detail
      if (!entry || typeof entry.ts !== 'string' || !entry.ts) return
      setMusicControlLogs((prev) => {
        if (prev.length && same(prev[0]!, entry)) return prev
        const next = [entry, ...prev]
        if (next.length > 500) next.length = 500
        writeCache('traq-music-control-logs-v1', next)
        return next
      })
    }
    window.addEventListener(MUSIC_CONTROL_LOG_EVENT, onLog)
    return () => window.removeEventListener(MUSIC_CONTROL_LOG_EVENT, onLog)
  }, [])

  // Keep "music is actually playing" state in sync with the header player.
  useEffect(() => {
    const read = (): boolean => {
      try {
        const raw = localStorage.getItem(LS_MUSIC_PLAYBACK_STATE_KEY)
        if (!raw) return false
        const data = JSON.parse(raw) as { isActuallyPlaying?: boolean }
        return !!data.isActuallyPlaying
      } catch {
        return false
      }
    }

    const onPlayback = (evt: Event) => {
      const e = evt as CustomEvent<{ isActuallyPlaying?: boolean }>
      setMusicIsActuallyPlaying(!!e.detail?.isActuallyPlaying)
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_MUSIC_PLAYBACK_STATE_KEY) return
      setMusicIsActuallyPlaying(read())
    }

    // Sync once on mount.
    setMusicIsActuallyPlaying(read())
    window.addEventListener('traq:music-playback-state', onPlayback as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('traq:music-playback-state', onPlayback as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [LS_MUSIC_PLAYBACK_STATE_KEY])

  // Track continuous "not playing" duration so the reminder doesn't appear during short gaps.
  useEffect(() => {
    if (musicIsActuallyPlaying) {
      setMusicNotPlayingSinceMs(null)
      return
    }
    setMusicNotPlayingSinceMs((prev) => (prev === null ? Date.now() : prev))
  }, [musicIsActuallyPlaying])

  // Keep title drafts populated for inline editing
  useEffect(() => {
    if (!musicTracks.length) return
    setMusicTitleDraftById((prev) => {
      const next = { ...prev }
      musicTracks.forEach((t) => {
        if (next[t.id] === undefined) next[t.id] = t.title
      })
      return next
    })
  }, [musicTracks])

  // One-time migration from legacy blob -> v2 per-task docs (runs in background)
  useEffect(() => {
    migrateLegacyTaskStateV1ToV2().catch((e) => {
      console.warn('Migration failed (non-fatal):', e)
    })
  }, [])

  // Live-sync month-to-date task completions (calendar-based).
  useEffect(() => {
    const today = startOfDay(new Date())
    const endKey = formatDateKey(today)
    const startKey = formatDateKey(startOfMonth(today)) // month-to-date

    const isInRange = (k: string) => k >= startKey && k <= endKey
    const replaceRange = (prev: TaskState, nextRange: TaskState): TaskState => {
      const next: TaskState = { ...prev }
      Object.keys(next).forEach((k) => {
        if (isInRange(k)) delete next[k]
      })
      Object.keys(nextRange).forEach((k) => {
        next[k] = nextRange[k]
      })
      return next
    }

    const unsubscribe = subscribeToRecentTaskCompletions(
      startKey,
      endKey,
      (recent) => {
        setTaskState((prev) => replaceRange(prev, recent))
      },
      (err) => {
        console.warn('Recent completions subscription error:', err)
      }
    )
    return () => unsubscribe()
  }, [todayKey])

  // NEW badge adoption tracking: keep a small rolling window (covers month boundaries).
  useEffect(() => {
    const DAYS = 21
    const today = startOfDay(new Date())
    const toKey = formatDateKey(today)
    const from = new Date(today)
    from.setDate(from.getDate() - (DAYS - 1))
    const fromKey = formatDateKey(from)

    const unsubscribe = subscribeToRecentTaskCompletions(
      fromKey,
      toKey,
      (recent) => {
        setNewBadgeTaskState(recent)
      },
      (err) => {
        console.warn('NEW badge recent completions subscription error:', err)
        setNewBadgeTaskState({})
      },
      { saveToLocalStorage: false }
    )
    return () => unsubscribe()
  }, [todayKey])

  // Leaderboard month view: default to the current month when opening.
  useEffect(() => {
    if (!showLeaderboard) return
    if (leaderboardView !== 'month') return
    setLeaderboardMonth(startOfMonth(new Date()))
  }, [leaderboardView, showLeaderboard])

  // Leaderboard month view: load that month's task completions without overwriting the app state.
  useEffect(() => {
    if (!showLeaderboard) return
    if (leaderboardView !== 'month') return

    const today = startOfDay(new Date())
    const monthStart = startOfMonth(leaderboardMonth)
    const monthEnd = isSameMonth(monthStart, today) ? today : endOfMonth(monthStart)
    const fromKey = formatDateKey(monthStart)
    const toKey = formatDateKey(monthEnd)

    setLbMonthLoading(true)
    setLbMonthLoadError(null)

    const unsubscribe = subscribeToRecentTaskCompletions(
      fromKey,
      toKey,
      (state) => {
        setLbMonthTaskState(state)
        setLbMonthLoading(false)
      },
      (err) => {
        console.warn('Leaderboard month subscription error:', err)
        setLbMonthLoadError('Could not load this month.')
        setLbMonthLoading(false)
      },
      { saveToLocalStorage: false }
    )

    return () => unsubscribe()
  }, [leaderboardMonth, leaderboardView, showLeaderboard])

  // Training markers for the leaderboard month range, so month aggregation reflects training shifts.
  useEffect(() => {
    if (!showLeaderboard) return
    if (leaderboardView !== 'month') return

    const today = startOfDay(new Date())
    const monthStart = startOfMonth(leaderboardMonth)
    const monthEnd = isSameMonth(monthStart, today) ? today : endOfMonth(monthStart)
    const fromKey = formatDateKey(monthStart)
    const toKey = formatDateKey(monthEnd)

    const unsubscribe = subscribeTrainingWindowsInRange(fromKey, toKey, (ids) => {
      setTrainingDocsInRange(ids)
    })

    return () => unsubscribe()
  }, [leaderboardMonth, leaderboardView, showLeaderboard])

  // Live-sync the currently viewed window (supports browsing older history outside the 30-day leaderboard range)
  useEffect(() => {
    if (isDemoDaySelected) {
      setIsLoadingWindow(false)
      return
    }
    setIsLoadingWindow(true)
    const unsubscribe = subscribeToTaskCompletionsForWindow(
      selectedDateKey,
      selectedWindow,
      (windowMap) => {
        setTaskState((prev) => {
          const guard = localWindowWriteGuardRef.current
          const nowMs = Date.now()
          if (guard && nowMs >= guard.expiresAt) {
            localWindowWriteGuardRef.current = null
          }
          const activeGuard = localWindowWriteGuardRef.current
          if (
            activeGuard &&
            nowMs < activeGuard.expiresAt &&
            activeGuard.dateKey === selectedDateKey &&
            activeGuard.windowKey === selectedWindow
          ) {
            const prevWindow = prev[selectedDateKey]?.[selectedWindow] ?? {}
            if (windowTaskMapsEqual(prevWindow, windowMap)) {
              return prev
            }
          }
          const next: TaskState = { ...prev }
          const day = { ...(next[selectedDateKey] ?? {}) }
          day[selectedWindow] = windowMap
          next[selectedDateKey] = day
          return next
        })
        setIsLoadingWindow(false)
      },
      (err) => {
        console.warn('Window subscription error:', err)
        setIsLoadingWindow(false)
        setSaveError('Sync blocked by Firestore permissions. Check rules deploy.')
      }
    )
    return () => unsubscribe()
  }, [isDemoDaySelected, selectedDateKey, selectedWindow])

  // Save employees to Firestore when admin changes them
  useEffect(() => {
    if (!isLoadingData && isAdmin) {
      saveEmployees(employees)
    }
  }, [employees, isAdmin, isLoadingData])

  // Save task order to Firestore when admin changes it
  useEffect(() => {
    if (!isLoadingData && isAdmin) {
      saveTaskOrder(taskOrder)
    }
  }, [taskOrder, isAdmin, isLoadingData])

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    // Only reset UI state (selector, pending side, checklist, etc.) when the task actually changes.
    // This prevents Firestore subscription updates from closing the employee selector mid-interaction.
    const taskChanged = activeTaskId !== prevTaskIdForInitRef.current
    prevTaskIdForInitRef.current = activeTaskId

    if (taskChanged) {
      setNightSplitChoseTeamSplit(false)
    }

    if (!activeTaskId) {
      setShowEmployeeSelector(false)
      setShowChecklistModal(false)
      setCheckedItems(new Set())
      setSaveError(null)
      setPendingIceSide(null)
      setIceSidesDraft({ left: null, right: null })
      setPendingTowelSide(null)
      setTowelSidesDraft({ diningBar: null, bowlStation: null })
      setShowUnsplitOptions(false)
      return
    }
    const pre = taskSplitOpenPrefillRef.current
    const splitPrefillActive = !!(pre && pre.taskId === activeTaskId)
    if (splitPrefillActive) {
      taskSplitOpenPrefillRef.current = null
    }
    const existing = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    if (splitPrefillActive && pre?.assignees?.length) {
      setAssignees(pre.assignees)
    } else {
      setAssignees(existing?.assignees ?? [])
    }
    const isCombinedIce = activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close'
    const effectiveAt = taskOverrides?.towelsSplitEffectiveAtMs
    const isTowelsSplitEffectiveHere =
      (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
      typeof effectiveAt === 'number' &&
      effectiveAt > 0 &&
      (() => {
        const baseDate = new Date(`${selectedDateKey}T00:00:00`)
        const nextWindowKey: WindowKey | null = selectedWindow === '11' ? '17' : selectedWindow === '17' ? '21' : null
        if (nextWindowKey) {
          const nextW = WINDOWS.find((x) => x.key === nextWindowKey)
          const nextStart = nextW?.start || '24:00'
          return combineDateTime(baseDate, nextStart).getTime() >= effectiveAt
        }
        const nextDay = new Date(baseDate)
        nextDay.setDate(nextDay.getDate() + 1)
        nextDay.setHours(0, 0, 0, 0)
        return nextDay.getTime() >= effectiveAt
      })()
    if (isCombinedIce) {
      const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
      if (splitPrefillActive && pre?.iceSides) {
        setIceSidesDraft({ left: pre.iceSides.left, right: pre.iceSides.right })
        setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
        setIceSidesDraftByKey((prev) => ({
          ...prev,
          [key]: { left: pre.iceSides!.left, right: pre.iceSides!.right },
        }))
        setPendingIceSide(null)
        setSplitMode(true)
        setShowUnsplitOptions(false)
      } else if (splitPrefillActive && pre?.iceSide) {
        // Virtual "Left Ice" / "Right Ice" card from the split panel: open the
        // combined-ice drawer pre-pointed at this side's picker so the user just
        // taps a name and it auto-saves into iceSidesDraft.{left|right}.
        const dirty = !!iceSidesDraftDirtyByKey[key]
        const cached = iceSidesDraftByKey[key]
        if (dirty && cached) {
          setIceSidesDraft(cached)
        } else {
          const existingSides = existing?.iceSides
          setIceSidesDraft({
            left: existingSides?.left ?? null,
            right: existingSides?.right ?? null,
          })
        }
        setSplitMode(true)
        setPendingIceSide(pre.iceSide)
        setShowUnsplitOptions(false)
        setShowEmployeeSelector(true)
      } else {
        const dirty = !!iceSidesDraftDirtyByKey[key]
        const cached = iceSidesDraftByKey[key]
        if (dirty && cached) {
          setIceSidesDraft(cached)
        } else if (taskChanged) {
          // Only reset the draft when opening a different task, not on taskState sync.
          const existingSides = existing?.iceSides
          setIceSidesDraft({
            left:
              (existingSides?.left && String(existingSides.left).trim()) ||
              (existing?.assignees?.[0] ? String(existing.assignees[0]).trim() : '') ||
              null,
            right:
              (existingSides?.right && String(existingSides.right).trim()) ||
              (existing?.assignees?.[1] ? String(existing.assignees[1]).trim() : '') ||
              null,
          })
          // Fresh seed: not a user-modified draft.
          setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: false }))
          setIceSidesDraftByKey((prev) => {
            if (!prev[key]) return prev
            const { [key]: _, ...rest } = prev
            return rest
          })
        }
        if (taskChanged) {
          setPendingIceSide(null)
          setSplitMode(false)
          setShowUnsplitOptions(false)
        }
      }
    } else if (isTowelsSplitEffectiveHere) {
      const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
      const dirty = !!towelSidesDraftDirtyByKey[key]
      const cached = towelSidesDraftByKey[key]
      if (dirty && cached) {
        setTowelSidesDraft(cached)
      } else if (taskChanged) {
        const existingSides = existing?.towelSides
        setTowelSidesDraft({
          diningBar:
            (existingSides?.diningBar && String(existingSides.diningBar).trim()) ||
            (existing?.assignees?.[0] ? String(existing.assignees[0]).trim() : '') ||
            null,
          bowlStation:
            (existingSides?.bowlStation && String(existingSides.bowlStation).trim()) ||
            (existing?.assignees?.[1] ? String(existing.assignees[1]).trim() : '') ||
            null,
        })
        setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: false }))
        setTowelSidesDraftByKey((prev) => {
          if (!prev[key]) return prev
          const { [key]: _, ...rest } = prev
          return rest
        })
      }
      if (taskChanged) {
        setPendingTowelSide(null)
      }
    } else {
      if (taskChanged) {
        const aiShared =
          taskSplitInlinePhase === 'active' &&
          !!activeTaskId &&
          (taskSplitResult?.finalSharedTaskIds || []).includes(activeTaskId)
        if (aiShared) {
          setSplitMode(true)
        } else {
          setSplitMode((existing?.assignees?.length ?? 1) > 1)
        }
        setPendingIceSide(null)
        setIceSidesDraft({ left: null, right: null })
        setPendingTowelSide(null)
        setTowelSidesDraft({ diningBar: null, bowlStation: null })
        setShowUnsplitOptions(false)
      }
    }
    if (taskChanged) {
      setShowEmployeeSelector(false)
      setShowChecklistModal(false)
      setCheckedItems(new Set())
      setSaveError(null)
    }
  }, [
    activeTaskId,
    iceSidesDraftByKey,
    iceSidesDraftDirtyByKey,
    selectedDateKey,
    selectedWindow,
    taskSplitInlinePhase,
    taskSplitResult,
    taskState,
    taskOverrides?.towelsSplitEffectiveAtMs,
    towelSidesDraftByKey,
    towelSidesDraftDirtyByKey,
  ])

  const activeTask = useMemo(() => {
    if (!activeTaskId) return null
    // Injected only when solo mode is on (see getOrderedTasksForDateKeyWindow); not in allTasks catalog.
    if (activeTaskId === 'night-shift-solo-check') {
      return NIGHT_SHIFT_SOLO_CHECK_TASK
    }
    return allTasks.find((t) => t.id === activeTaskId) ?? null
  }, [activeTaskId, allTasks])

  const isOrderReportTaskId = activeTaskId === 'order-report-5pm' || activeTaskId === 'order-report-close'
  const isTaskCardModalOpen = Boolean(activeTask) && !isOrderReportTaskId
  // Shared overlays keep the existing body-fixed lock behavior.
  const isAnySharedModalOpen =
    showCalculator ||
    showMenu ||
    showTimeOff ||
    showStockReports ||
    showNotifyManagement ||
    showDailyTaskModal ||
    (Boolean(activeTask) && isOrderReportTaskId) ||
    Boolean(printRequest)
  const isAnyModalOpen = isAnySharedModalOpen || isTaskCardModalOpen
  /** Floating daily-task promo hides under any modal overlay (z-index above task modals). */
  const suppressDailyTaskFloating = isAnyModalOpen || showDailyTaskEmployeeSelector
  /** Inline grid card unmounts for shared overlays only; task card modals layout-lock instead. */
  const suppressDailyTaskInlineUnmount = isAnySharedModalOpen || showDailyTaskEmployeeSelector
  // Capture scroll position at the moment we *intend* to open a modal (click/tap handler),
  // because iOS Safari can transiently report 0 during the render/lock transition.
  const pendingLockScrollYRef = useRef<number | null>(null)
  const getCurrentScrollY = useCallback(() => {
    const winY = window.scrollY
    if (Number.isFinite(winY)) return winY
    const pageY = window.pageYOffset
    if (Number.isFinite(pageY)) return pageY
    return document.documentElement.scrollTop || 0
  }, [])
  const captureScrollYForNextLock = useCallback(() => {
    pendingLockScrollYRef.current = getCurrentScrollY()
  }, [getCurrentScrollY])

  const scrollToTaskCardInGrid = useCallback(
    (taskId: string): boolean => {
      const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
      if (!el) return false
      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      })
      return true
    },
    [prefersReducedMotion]
  )
  const scrollLockRef = useRef<{
    locked: boolean
    scrollY: number
    prevBodyCssText: string
    prevBodyPaddingRight: string
    prevHtmlClass: string
    prevBodyClass: string
  }>({
    locked: false,
    scrollY: 0,
    prevBodyCssText: '',
    prevBodyPaddingRight: '',
    prevHtmlClass: '',
    prevBodyClass: '',
  })
  const taskModalScrollLockRef = useRef<{
    locked: boolean
    scrollY: number
    prevBodyCssText: string
    prevHtmlCssText: string
  }>({
    locked: false,
    scrollY: 0,
    prevBodyCssText: '',
    prevHtmlCssText: '',
  })
  useLayoutEffect(() => {
    const body = document.body
    const html = document.documentElement

    const lock = () => {
      if (scrollLockRef.current.locked) return

      // Prefer the scroll position captured at the click/tap that opened the modal.
      const captured = pendingLockScrollYRef.current
      pendingLockScrollYRef.current = null
      // Force layout calculation to ensure we get accurate scroll position when falling back.
      void body.offsetHeight
      const scrollY = captured ?? getCurrentScrollY()
      const scrollbarWidth = window.innerWidth - html.clientWidth

      // iOS Safari: cancel tiny residual scroll momentum before freezing.
      // If we don't, the captured scrollY can be off by a few pixels, causing a visible bump on unlock.
      const prevScrollBehavior = html.style.scrollBehavior
      html.style.scrollBehavior = 'auto'
      window.scrollTo(0, scrollY)
      html.style.scrollBehavior = prevScrollBehavior

      scrollLockRef.current.locked = true
      scrollLockRef.current.scrollY = scrollY
      scrollLockRef.current.prevBodyCssText = body.style.cssText
      scrollLockRef.current.prevBodyPaddingRight = body.style.paddingRight
      scrollLockRef.current.prevHtmlClass = html.className
      scrollLockRef.current.prevBodyClass = body.className

      // Add a light class hook for overscroll behavior (where supported).
      html.classList.add('scroll-locked')
      body.classList.add('scroll-locked')

      // Freeze the document at its current scroll position (robust across iOS Safari).
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'

      // Avoid layout shift when the scrollbar disappears (mostly desktop browsers).
      if (scrollbarWidth > 0) {
        const computedPR = window.getComputedStyle(body).paddingRight
        if (computedPR === '0px') body.style.paddingRight = `${scrollbarWidth}px`
      }

      // Force style+layout flush now (prevents a transient blank/half-blank paint on iOS).
      void body.offsetHeight
    }

    const unlock = () => {
      if (!scrollLockRef.current.locked) return

      const { scrollY, prevBodyCssText } = scrollLockRef.current
      scrollLockRef.current.locked = false

      // Read the actual locked offset before restoring body styles (which clears it).
      // This is more accurate than relying on the captured scrollY on iOS Safari.
      const topRaw = body.style.top || ''
      const parsed = Number.parseFloat(topRaw)
      const lockedY = Number.isFinite(parsed) ? Math.abs(parsed) : null

      // Never animate the "restore scroll position" step (global CSS can enable smooth scrolling).
      const prevScrollBehavior = html.style.scrollBehavior
      html.style.scrollBehavior = 'auto'

      // Restore body styles (removes position:fixed).
      body.style.cssText = prevBodyCssText

      html.classList.remove('scroll-locked')
      body.classList.remove('scroll-locked')

      const y = lockedY ?? scrollY
      // Restore scroll BEFORE the forced layout reflow so the browser
      // computes element positions at the correct scroll offset, not scroll=0.
      window.scrollTo(0, y)
      // Some WebKit builds need explicit scrollTop on the scrolling element.
      html.scrollTop = y
      if (document.body) document.body.scrollTop = y
      void document.documentElement.offsetHeight

      html.style.scrollBehavior = prevScrollBehavior

    }

    if (isAnySharedModalOpen) lock()
    else unlock()

    return () => {
      // Ensure we never leave the page locked if App unmounts.
      unlock()
    }
  }, [getCurrentScrollY, isAnySharedModalOpen])

  useLayoutEffect(() => {
    const body = document.body
    const html = document.documentElement

    const lockTaskModal = () => {
      if (taskModalScrollLockRef.current.locked) return
      const captured = pendingLockScrollYRef.current
      pendingLockScrollYRef.current = null
      const scrollY = captured ?? getCurrentScrollY()
      const scrollbarWidth = window.innerWidth - html.clientWidth

      taskModalScrollLockRef.current.locked = true
      taskModalScrollLockRef.current.scrollY = scrollY
      taskModalScrollLockRef.current.prevBodyCssText = body.style.cssText
      taskModalScrollLockRef.current.prevHtmlCssText = html.style.cssText

      const prevScrollBehavior = html.style.scrollBehavior
      html.style.scrollBehavior = 'auto'
      window.scrollTo(0, scrollY)
      html.style.scrollBehavior = prevScrollBehavior

      // Safari-safe task modal lock: avoid body fixed/top shifts.
      html.classList.add('scroll-locked')
      body.classList.add('scroll-locked')
      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'

      if (scrollbarWidth > 0) {
        const computedPR = window.getComputedStyle(body).paddingRight
        if (computedPR === '0px') body.style.paddingRight = `${scrollbarWidth}px`
      }

      void document.documentElement.offsetHeight
    }

    const unlockTaskModal = () => {
      if (!taskModalScrollLockRef.current.locked) return
      const { scrollY, prevBodyCssText, prevHtmlCssText } = taskModalScrollLockRef.current
      taskModalScrollLockRef.current.locked = false

      const prevScrollBehavior = html.style.scrollBehavior
      html.style.scrollBehavior = 'auto'

      body.style.cssText = prevBodyCssText
      html.style.cssText = prevHtmlCssText
      html.classList.remove('scroll-locked')
      body.classList.remove('scroll-locked')

      const y = scrollY
      window.scrollTo(0, y)
      html.scrollTop = y
      if (document.body) document.body.scrollTop = y
      void document.documentElement.offsetHeight
      html.style.scrollBehavior = prevScrollBehavior

      // Correct occasional post-unlock drift on Safari compositor frame.
      window.requestAnimationFrame(() => {
        const cur = getCurrentScrollY()
        if (Math.abs(cur - y) > 0.5) {
          window.scrollTo(0, y)
          html.scrollTop = y
          if (document.body) document.body.scrollTop = y
        }
      })
    }

    if (isTaskCardModalOpen) lockTaskModal()
    else unlockTaskModal()

    return () => {
      unlockTaskModal()
    }
  }, [getCurrentScrollY, isTaskCardModalOpen])

  // After reset modal unlock, scroll to the task card in its new pending position.
  useLayoutEffect(() => {
    const taskId = pendingScrollToTaskIdRef.current
    if (!taskId || activeTaskId !== null) return

    pendingScrollToTaskIdRef.current = null

    const scrollOnce = (allowRetry: boolean) => {
      if (scrollToTaskCardInGrid(taskId)) return
      if (allowRetry) {
        window.setTimeout(() => scrollOnce(false), 50)
      }
    }

    const runAfterUnlock = () => {
      if (windowCompleteStageCollapse) {
        setWindowCompleteStageCollapse(false)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => scrollOnce(true))
        })
        return
      }
      scrollOnce(true)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(runAfterUnlock)
    })
  }, [activeTaskId, scrollToTaskCardInGrid, windowCompleteStageCollapse])

  // FLIP morph: animate modal-sheet from card position on open.
  useLayoutEffect(() => {
    if (!activeTaskId || isClosingModalRef.current) return
    const cardRect = activeCardRectRef.current
    const sheet = modalSheetRef.current
    if (!cardRect || !sheet || typeof sheet.animate !== 'function') return
    if (prefersReducedMotion) return

    const sheetRect = sheet.getBoundingClientRect()
    const scaleX = cardRect.width / sheetRect.width
    const scaleY = cardRect.height / sheetRect.height
    const translateX = (cardRect.left + cardRect.width / 2) - (sheetRect.left + sheetRect.width / 2)
    const translateY = (cardRect.top + cardRect.height / 2) - (sheetRect.top + sheetRect.height / 2)

    sheet.animate([
      {
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
        borderRadius: '16px',
        opacity: '0.4',
      },
      {
        transform: 'translate(0, 0) scale(1, 1)',
        borderRadius: '24px',
        opacity: '1',
      },
    ], {
      duration: 320,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    })
  }, [activeTaskId, prefersReducedMotion])

  // Initialize Break Selection draft when opening the modal.
  useEffect(() => {
    const prev = prevActiveTaskIdRef.current
    prevActiveTaskIdRef.current = activeTaskId
    if (activeTaskId !== 'break-selection') return
    if (prev === 'break-selection') return

    // Prefer the existing in-progress draft for this date (if the user actually modified it),
    // otherwise seed from saved plan.
    const dirty = !!breakDraftDirtyByDateKey[selectedDateKey]
    const cached = breakDraftByDateKey[selectedDateKey]
    if (dirty && Array.isArray(cached) && cached.length === 2) {
      setBreakDraftSlots(cached)
    } else {
      const slots = breakSelection?.slots || []
      const nextDraft: BreakDraftSlot[] = [0, 1].map((i) => {
        const s = slots[i]
        const st = s?.shiftType === 'lunch' || s?.shiftType === 'double' ? s.shiftType : ''
        return {
          employee: s?.employee || '',
          shiftType: st,
          start: s?.start || '',
        }
      })
      setBreakDraftSlots(nextDraft)
      // This is a fresh seed, not a user draft.
      setBreakDraftDirtyByDateKey((prev2) => ({ ...prev2, [selectedDateKey]: false }))
      setBreakDraftByDateKey((prev2) => {
        if (!prev2[selectedDateKey]) return prev2
        const { [selectedDateKey]: _, ...rest } = prev2
        return rest
      })
    }
    // Ensure any in-progress wizard is closed on open.
    closeBreakWizard()
    setBreakDraftError(null)
    setSaveError(null)
  }, [activeTaskId, breakSelection, breakDraftByDateKey, breakDraftDirtyByDateKey, selectedDateKey])

  // Keep the per-day draft cache in sync while the Break Selection modal is open.
  useEffect(() => {
    if (activeTaskId !== 'break-selection') return
    if (!breakDraftDirtyByDateKey[selectedDateKey]) return
    setBreakDraftByDateKey((prev) => ({ ...prev, [selectedDateKey]: breakDraftSlots }))
  }, [activeTaskId, breakDraftDirtyByDateKey, breakDraftSlots, selectedDateKey])

  const windowStartMsForDateKey = useCallback((dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    const w = WINDOWS.find((x) => x.key === windowKey)
    const start = w?.start || '00:00'
    return combineDateTime(baseDate, start).getTime()
  }, [])

  const windowCloseMsForDateKey = useCallback((dateKey: string, windowKey: WindowKey): number => {
    const baseDate = new Date(`${dateKey}T00:00:00`)
    // Close time = start of the next window (or start of next day for 9PM).
    const nextWindowKey: WindowKey | null = windowKey === '11' ? '17' : windowKey === '17' ? '21' : null
    if (nextWindowKey) {
      const nextW = WINDOWS.find((x) => x.key === nextWindowKey)
      const nextStart = nextW?.start || '24:00'
      return combineDateTime(baseDate, nextStart).getTime()
    }
    const nextDay = new Date(baseDate)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    return nextDay.getTime()
  }, [])

  const isTowelsSplitEffectiveForDateKey = useCallback(
    (dateKey: string, windowKey: WindowKey): boolean => {
      const effectiveAt = taskOverrides?.towelsSplitEffectiveAtMs
      if (typeof effectiveAt !== 'number' || effectiveAt <= 0) return false
      const closeMs = windowCloseMsForDateKey(dateKey, windowKey)
      return closeMs >= effectiveAt
    },
    [taskOverrides?.towelsSplitEffectiveAtMs, windowCloseMsForDateKey]
  )

  // Auto-scroll requirements slowly if they overflow (starts after opening a task).
  // Skip for combined ice / split towel modals — primary tiles should stay in view without animation fighting the user.
  useEffect(() => {
    if (!activeTaskId) return
    if (prefersReducedMotion) return

    const isCombinedIceOrTowelSplit =
      activeTaskId === 'ice-5pm' ||
      activeTaskId === 'ice-close' ||
      ((activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
        isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow))
    if (isCombinedIceOrTowelSplit) return

    let stopped = false
    let raf = 0
    let startTimeout = 0
    let mountRetryTimeout = 0
    let pauseTimeout = 0
    let lastTs = 0
    const speedPxPerSec = 22 // gentle (a bit more noticeable on small overflows)
    const openedAt = Date.now()
    const STOP_GRACE_MS = 900 // iPad: opening tap/click can land inside the scroll area; don't cancel instantly.
    const BOTTOM_PAUSE_MS = 900
    const MOUNT_RETRY_MS = 80
    const MOUNT_RETRY_MAX = 30 // ~2.4s max

    let el: HTMLDivElement | null = null

    const stop = () => {
      stopped = true
      if (raf) window.cancelAnimationFrame(raf)
      if (startTimeout) window.clearTimeout(startTimeout)
      if (mountRetryTimeout) window.clearTimeout(mountRetryTimeout)
      if (pauseTimeout) window.clearTimeout(pauseTimeout)
      if (el) {
        el.removeEventListener('wheel', onUserIntent)
        el.removeEventListener('touchmove', onUserIntentImmediate)
      }
    }

    const onUserIntent = () => {
      if (Date.now() - openedAt < STOP_GRACE_MS) return
      stop()
    }
    const onUserIntentImmediate = () => stop()

    const tick = (ts: number) => {
      if (stopped) return
      if (!el) return
      if (!lastTs) lastTs = ts
      const dt = (ts - lastTs) / 1000
      lastTs = ts

      const maxScrollTop = el.scrollHeight - el.clientHeight
      const next = Math.min(maxScrollTop, el.scrollTop + speedPxPerSec * dt)
      el.scrollTop = next

      if (next >= maxScrollTop - 1) {
        pauseTimeout = window.setTimeout(() => {
          if (stopped || !el) return
          el.scrollTop = 0
          lastTs = 0
          raf = window.requestAnimationFrame(tick)
        }, BOTTOM_PAUSE_MS)
        return
      }
      raf = window.requestAnimationFrame(tick)
    }

    const attachAndStart = () => {
      if (stopped) return
      if (!el) return

      el.addEventListener('wheel', onUserIntent, { passive: true })
      el.addEventListener('touchmove', onUserIntentImmediate, { passive: true })

      startTimeout = window.setTimeout(() => {
        if (stopped || !el) return
        el.scrollTop = 0
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (stopped || !el) return
            const overflowPx = el.scrollHeight - el.clientHeight
            if (overflowPx <= 1) {
              stop()
              return
            }
            lastTs = 0
            raf = window.requestAnimationFrame(tick)
          })
        })
      }, 650)
    }

    const waitForMount = (attempt: number) => {
      if (stopped) return
      el = requirementsScrollRef.current
      if (el) {
        attachAndStart()
        return
      }
      if (attempt >= MOUNT_RETRY_MAX) return
      mountRetryTimeout = window.setTimeout(() => waitForMount(attempt + 1), MOUNT_RETRY_MS)
    }

    waitForMount(0)

    return stop
  }, [
    activeTaskId,
    isTowelsSplitEffectiveForDateKey,
    prefersReducedMotion,
    selectedDateKey,
    selectedWindow,
  ])

  const getEffectiveTasksByWindowForDateKey = useCallback((dateKey: string): Record<WindowKey, Task[]> => {
    return getEffectiveTasksByWindowForDateKeyShared({
      dateKey,
      allTasks,
      taskOverrides,
      windowMs: { windowStartMsForDateKey, windowCloseMsForDateKey },
    }) as unknown as Record<WindowKey, Task[]>
  }, [allTasks, taskOverrides?.overrides, windowCloseMsForDateKey, windowStartMsForDateKey])

  const getWeightsForDateKey = useCallback((dateKey: string): {
    windowTaskWeights: Record<WindowKey, number>
    taskWeightByIdByWindow: Record<WindowKey, Record<string, number>>
    taskIdsByWindow: Record<WindowKey, string[]>
  } => {
    return getWeightsForDateKeyShared({
      dateKey,
      allTasks,
      taskOverrides,
      windowMs: { windowStartMsForDateKey, windowCloseMsForDateKey },
    })
  }, [allTasks, taskOverrides?.overrides, windowCloseMsForDateKey, windowStartMsForDateKey])

  // Shift definition:
  // - Day shift = 11AM + 5PM windows
  // - Night shift = 9PM window
  const SHIFT_WINDOWS: Record<'day' | 'night', WindowKey[]> = useMemo(
    () => ({ day: ['11', '17'], night: ['21'] }),
    []
  )

  // Training windows that apply to a given date. Merges the live selected-date markers with the
  // leaderboard month-range markers so both the selected view and month aggregation reflect training.
  const trainingKeysForDate = useCallback(
    (dateKey: string): WindowKey[] => {
      const keys: WindowKey[] = []
      ;(['11', '17', '21'] as WindowKey[]).forEach((wk) => {
        if (dateKey === selectedDateKey && trainingWindowsForSelectedDate.has(wk)) {
          keys.push(wk)
          return
        }
        if (trainingDocsInRange.has(`${dateKey}__${wk}`)) keys.push(wk)
      })
      return keys
    },
    [selectedDateKey, trainingWindowsForSelectedDate, trainingDocsInRange]
  )

  const computeShiftLeaders = useCallback(
    (dateKey: string, shift: 'day' | 'night'): LeaderRow[] => {
      const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(dateKey)
      const fair =
        shift === 'day'
          ? fairSplitContract17?.dateKey === dateKey
            ? fairSplitContract17
            : null
          : fairSplitContract21?.dateKey === dateKey
            ? fairSplitContract21
            : null
      return computeShiftLeadersForState(
        taskState,
        dateKey,
        shift,
        SHIFT_WINDOWS,
        windowTaskWeights,
        taskWeightByIdByWindow,
        isSoloScoreCappedForShift(dateKey, shift),
        fair,
        trainingKeysForDate(dateKey)
      )
    },
    [SHIFT_WINDOWS, getWeightsForDateKey, isSoloScoreCappedForShift, taskState, fairSplitContract17, fairSplitContract21, trainingKeysForDate]
  )

  const computeFullDayLeaders = useCallback(
    (dateKey: string): LeaderRow[] => {
      const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(dateKey)
      return computeFullDayLeadersForState(
        taskState,
        dateKey,
        SHIFT_WINDOWS,
        windowTaskWeights,
        taskWeightByIdByWindow,
        fairSplitContract17?.dateKey === dateKey ? fairSplitContract17 : null,
        fairSplitContract21?.dateKey === dateKey ? fairSplitContract21 : null,
        trainingKeysForDate(dateKey)
      )
    },
    [SHIFT_WINDOWS, getWeightsForDateKey, taskState, fairSplitContract17, fairSplitContract21, trainingKeysForDate]
  )

  const selectedShift: 'day' | 'night' = useMemo(
    () => (selectedWindow === '21' ? 'night' : 'day'),
    [selectedWindow]
  )

  const fairSplitForSelectedDateAndShift = useMemo((): FairSplitContractDoc | null => {
    if (selectedShift === 'day') {
      return fairSplitContract17?.dateKey === selectedDateKey ? fairSplitContract17 : null
    }
    return fairSplitContract21?.dateKey === selectedDateKey ? fairSplitContract21 : null
  }, [selectedShift, selectedDateKey, fairSplitContract17, fairSplitContract21])

  /** Secret training mode is active for the window currently being viewed. */
  const selectedWindowIsTraining = useMemo(
    () => trainingWindowsForSelectedDate.has(selectedWindow),
    [trainingWindowsForSelectedDate, selectedWindow]
  )

  // Secret unlock: 5 taps within ~3s on the (still visually locked) Training tile toggles
  // training mode for the selected date + window. No visible feedback on the tile.
  const handleTrainingSecretTap = useCallback(() => {
    if (trainingTapResetTimerRef.current !== null) {
      window.clearTimeout(trainingTapResetTimerRef.current)
    }
    trainingTapCountRef.current += 1
    if (trainingTapCountRef.current >= 5) {
      trainingTapCountRef.current = 0
      trainingTapResetTimerRef.current = null
      const enable = !trainingWindowsForSelectedDate.has(selectedWindow)
      void (enable
        ? setTrainingWindow(selectedDateKey, selectedWindow)
        : deleteTrainingWindow(selectedDateKey, selectedWindow))
      setShowMenu(false)
      return
    }
    trainingTapResetTimerRef.current = window.setTimeout(() => {
      trainingTapCountRef.current = 0
      trainingTapResetTimerRef.current = null
    }, 3000)
  }, [selectedDateKey, selectedWindow, trainingWindowsForSelectedDate])

  /**
   * True when the selected date is on/after the May 13, 2026 cutover that splits 11AM and 5PM
   * scoring in the HUD and drops 11AM from leaderboard totals (see
   * {@link SEPARATE_DAY_AM_PM_LEADERBOARD_EFFECTIVE_MS}). Past dates keep blended day scores.
   */
  const useSeparateDayAmPmForSelected = useMemo(() => {
    const dateMs = new Date(`${selectedDateKey}T00:00:00`).getTime()
    return dateMs >= SEPARATE_DAY_AM_PM_LEADERBOARD_EFFECTIVE_MS
  }, [selectedDateKey])

  /** Day-shift + cutover means each HUD slot shows two numbers (11AM and 5PM). */
  const showDayAmPmSplit = selectedShift === 'day' && useSeparateDayAmPmForSelected

  // Helper to determine active shift from current time
  const getActiveShiftFromTime = useCallback((): 'day' | 'night' => {
    const now = new Date()
    const hour = now.getHours()
    // Day shift: before 9PM (before 21:00), Night shift: 9PM or later
    return hour >= 21 ? 'night' : 'day'
  }, [])

  // Helper to get target window for daily task points
  const getDailyTaskWindow = useCallback((shift: 'day' | 'night'): WindowKey => {
    return shift === 'day' ? '17' : '21' // 5PM for day, 9PM for night
  }, [])

  // Unfiltered leaders for the selected date/shift. Memoized so completion handlers can
  // reuse it for their "before" celebration rows instead of recomputing a full scoring
  // pass synchronously on every tap.
  const shiftLeadersForSelected = useMemo(
    () => computeShiftLeaders(selectedDateKey, selectedShift),
    [computeShiftLeaders, selectedDateKey, selectedShift]
  )

  // Shift HUD should only show people who actually participated this shift (exclude autoAssigned yum-yum credit).
  const shiftHudLeaders = useMemo(() => {
    const participants = computeShiftHudParticipantsForState(taskState, selectedDateKey, selectedShift, SHIFT_WINDOWS)
    return shiftLeadersForSelected.filter((r) => participants.has(r.name))
  }, [SHIFT_WINDOWS, shiftLeadersForSelected, selectedDateKey, selectedShift, taskState])

  /** Split column order for HUD slots while the split panel is open (employeeA = p1, employeeB = p2). */
  const activeSplitHudPair = useMemo(
    () =>
      resolveActiveSplitHudPair({
        phase: taskSplitInlinePhase,
        windowKey: selectedWindow,
        empA: taskSplitEmpA,
        empB: taskSplitEmpB,
        contract: fairSplitForSelectedDateAndShift,
      }),
    [taskSplitInlinePhase, selectedWindow, taskSplitEmpA, taskSplitEmpB, fairSplitForSelectedDateAndShift],
  )

  const shiftHudDisplaySlots = useMemo(() => {
    const played = shiftHudLeaders.filter((r) =>
      showDayAmPmSplit ? shiftHudHasAnyPoints(r) : shiftHudScoreForCelebration(r) > 0,
    )
    return resolveShiftHudDisplaySlots({
      played,
      allLeaders: shiftLeadersForSelected,
      splitPair: activeSplitHudPair,
    })
  }, [shiftHudLeaders, shiftLeadersForSelected, activeSplitHudPair, showDayAmPmSplit])

  // Employee Selector quick list: use the same two people shown in the Shift HUD slots
  // (top 2 with any points — 5PM, or post-cutover 11AM-standalone).
  const selectorShiftEmployees = useMemo<string[]>(() => {
    const played = shiftHudLeaders.filter((r) => shiftHudHasAnyPoints(r))
    const top2 = played.slice(0, 2).map((r) => String(r.name || '').trim()).filter(Boolean)
    const unique = Array.from(new Set(top2))
    return unique.filter((n) => employees.includes(n))
  }, [employees, shiftHudLeaders])

  // Quick-select order is score-ranked, so completing a task re-ranks the two
  // names and visibly swaps the buttons mid-press. Freeze the order while the
  // selector is open: snapshot on open, and render from the snapshot so positions
  // stay put until the picker closes/reopens. Same names/styling, no reordering.
  const frozenSelectorEmployeesRef = useRef<string[] | null>(null)
  useEffect(() => {
    if (showEmployeeSelector) {
      frozenSelectorEmployeesRef.current = selectorShiftEmployees
    } else {
      frozenSelectorEmployeesRef.current = null
    }
    // Only re-snapshot on open/close, not on every score change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEmployeeSelector])
  const displaySelectorEmployees = useMemo<string[]>(() => {
    const frozen = frozenSelectorEmployeesRef.current
    if (!showEmployeeSelector || !frozen) return selectorShiftEmployees
    // Keep the frozen order but drop names no longer present, and append any new
    // names so membership stays correct even if the roster changes mid-open.
    const live = selectorShiftEmployees
    const stable = frozen.filter((n) => live.includes(n))
    const added = live.filter((n) => !stable.includes(n))
    return [...stable, ...added]
  }, [showEmployeeSelector, selectorShiftEmployees])

  const taskSplitResolvedEmployees = useMemo<[string, string] | null>(() => {
    const slots = breakSelection?.slots || []
    if (slots.length >= 2) {
      const e0 = (slots[0]?.employee || '').trim()
      const e1 = (slots[1]?.employee || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }
    if (shiftHudLeaders.length >= 2) {
      const e0 = (shiftHudLeaders[0]?.name || '').trim()
      const e1 = (shiftHudLeaders[1]?.name || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }
    return null
  }, [breakSelection?.slots, shiftHudLeaders])

  // "Last time: [name] ×N" line for the employee selector. Out of the two
  // employees working right now, who completed the active task the last time
  // those two worked together, and their consecutive shared-shift streak.
  const lastTogetherStreak = useMemo<
    { kind: 'solo' | 'split'; names: string[]; count: number } | null
  >(() => {
    if (selectedWindow !== '17' && selectedWindow !== '21') return null
    if (!activeTaskId) return null
    if (activeTask?.requiresSplit && !isSoloModeActiveForWindow(selectedDateKey, selectedWindow)) return null
    // When a split is active for this window, the two split players ARE the pair — show "Last time"
    // accurately for both 5PM and 9PM without needing a break selection or any completed tasks today.
    const splitPair: [string, string] | null = (() => {
      const a = (fairSplitForSelectedDateAndShift?.employeeA || '').trim()
      const b = (fairSplitForSelectedDateAndShift?.employeeB || '').trim()
      return a && b && a !== b ? [a, b] : null
    })()
    const pair = splitPair || resolveLastTimePair(selectedWindow, breakSelection, shiftHudLeaders)
    if (!pair) return null
    const sharedDates = findSharedShiftDates(taskState, selectedWindow, pair, selectedDateKey)
    if (sharedDates.length === 0) return null
    const last = findLastTogetherCompleter(taskState, activeTaskId, selectedWindow, pair, sharedDates)
    if (!last) return null

    if (last.wasSplit) {
      const count = computeSplitTogetherStreak(
        taskState,
        activeTaskId,
        selectedWindow,
        pair,
        sharedDates,
        last.dateKey
      )
      if (count < 1) return null
      return { kind: 'split', names: last.completers, count }
    }

    const name = last.completers[0]
    if (!name) return null
    const count = computeTogetherStreak(
      taskState,
      activeTaskId,
      selectedWindow,
      name,
      pair,
      sharedDates,
      last.dateKey
    )
    if (count < 1) return null
    return { kind: 'solo', names: [name], count }
  }, [
    selectedWindow,
    activeTaskId,
    activeTask?.requiresSplit,
    isSoloModeActiveForWindow,
    selectedDateKey,
    breakSelection,
    shiftHudLeaders,
    taskState,
    fairSplitForSelectedDateAndShift,
  ])

  const taskSplitEffectiveWindowTaskIds = useMemo(() => {
    if (selectedWindow !== '17' && selectedWindow !== '21') return [] as string[]
    return getSplitWindowEffectiveTaskIds({
      dateKey: selectedDateKey,
      windowKey: selectedWindow,
      taskState,
      allTasks,
      taskOverrides,
      windowMs: { windowStartMsForDateKey, windowCloseMsForDateKey },
    })
  }, [
    selectedDateKey,
    selectedWindow,
    taskState,
    allTasks,
    taskOverrides?.overrides,
    windowStartMsForDateKey,
    windowCloseMsForDateKey,
  ])

  const taskSplitCandidateIds = useMemo(() => {
    if (selectedWindow !== '17' && selectedWindow !== '21') return [] as string[]
    const windowMap = taskState[selectedDateKey]?.[selectedWindow] || {}
    return taskSplitEffectiveWindowTaskIds.filter((id) => !isTaskDoneForSplit(id, windowMap[id]))
  }, [selectedDateKey, selectedWindow, taskSplitEffectiveWindowTaskIds, taskState])

  useEffect(() => {
    taskSplitResultRef.current = taskSplitResult
  }, [taskSplitResult])

  useEffect(() => {
    setFairSplitContract17(readFairSplitContractLocalCache(selectedDateKey, '17'))
    setFairSplitContract21(readFairSplitContractLocalCache(selectedDateKey, '21'))

    const applyFairSplitContract17 = (incoming: FairSplitContractDoc | null) => {
      if (incoming === null && fairSplitPendingWriteRef.current === '17') return
      setFairSplitContract17(incoming)
    }
    const applyFairSplitContract21 = (incoming: FairSplitContractDoc | null) => {
      if (incoming === null && fairSplitPendingWriteRef.current === '21') return
      setFairSplitContract21(incoming)
    }

    const u17 = subscribeFairSplitContract(selectedDateKey, '17', applyFairSplitContract17)
    const u21 = subscribeFairSplitContract(selectedDateKey, '21', applyFairSplitContract21)
    return () => {
      u17()
      u21()
    }
  }, [selectedDateKey])

  // Secret training mode: subscribe to all three windows of the selected date.
  useEffect(() => {
    setTrainingWindowsForSelectedDate(new Set())
    const applyTraining = (windowKey: WindowKey, enabled: boolean) => {
      setTrainingWindowsForSelectedDate((prev) => {
        const next = new Set(prev)
        if (enabled) next.add(windowKey)
        else next.delete(windowKey)
        return next
      })
    }
    const unsubs = (['11', '17', '21'] as WindowKey[]).map((wk) =>
      subscribeTrainingWindow(selectedDateKey, wk, (doc) => applyTraining(wk, !!doc?.enabled))
    )
    return () => unsubs.forEach((u) => u())
  }, [selectedDateKey])

  useEffect(() => {
    taskSplitSuggestGenRef.current += 1
    setNightSplitChoseTeamSplit(false)
  }, [selectedDateKey, selectedWindow])

  useEffect(() => {
    const clearTaskSplitPanelUi = () => {
      setTaskSplitInlinePhase(null)
      setTaskSplitResult(null)
      setTaskSplitErrorBanner(null)
      setTaskSplitEmpA('')
      setTaskSplitEmpB('')
      setSplitIcePromptOpen(false)
      setTaskSplitIceSplitChoice(false)
    }

    const restoreTaskSplitPanelFromContract = (contract: FairSplitContractDoc) => {
      setTaskSplitResult(fairSplitContractToSuggestResult(contract))
      setTaskSplitEmpA(contract.employeeA)
      setTaskSplitEmpB(contract.employeeB)
      setTaskSplitIceSplitChoice(contract.finalIceMode === 'split')
      setTaskSplitInlinePhase('active')
      setSplitIcePromptOpen(false)
      setTaskSplitErrorBanner(null)
    }

    const decision = resolveTaskSplitPanelRestore({
      selectedDateKey,
      selectedWindow,
      contract17: fairSplitContract17,
      contract21: fairSplitContract21,
      phase: taskSplitInlinePhase,
      undoneViewKey: taskSplitUndoneKeyRef.current,
      completedViewKey: taskSplitCompletedKeyRef.current,
    })

    if (decision.action === 'skip') return

    if (decision.action === 'restore') {
      restoreTaskSplitPanelFromContract(decision.contract)
      return
    }

    const viewKey = `${selectedDateKey}:${selectedWindow}`
    if (taskSplitUndoneKeyRef.current === viewKey) {
      const contract = selectedWindow === '17' ? fairSplitContract17 : fairSplitContract21
      if (!contract) taskSplitUndoneKeyRef.current = null
    }
    clearTaskSplitPanelUi()
  }, [selectedDateKey, selectedWindow, fairSplitContract17, fairSplitContract21, taskSplitInlinePhase])

  /**
   * Show "Split ice?" only when combined ice is still an actionable split candidate.
   * Belt-and-suspenders: also treat ice as done if completion already satisfies split rules
   * even if ids were momentarily out of sync with the candidate list.
   */
  const taskSplitWindowHasIce = useMemo(() => {
    if (selectedWindow !== '17' && selectedWindow !== '21') return false
    const wm = taskState[selectedDateKey]?.[selectedWindow] || {}
    return (['ice-5pm', 'ice-close'] as const).some((tid) => {
      if (!taskSplitCandidateIds.includes(tid)) return false
      return !isTaskDoneForSplit(tid, wm[tid])
    })
  }, [selectedDateKey, selectedWindow, taskSplitCandidateIds, taskState])

  const runTaskSplitSuggest = useCallback(
    async (
      a: string,
      b: string,
      opts?: {
        forceIceMode?: 'whole' | 'split'
        isRegenerate?: boolean
        previousResult?: TaskSplitSuggestResult | null
      },
    ) => {
      const generation = ++taskSplitSuggestGenRef.current
      taskSplitUndoneKeyRef.current = null
      taskSplitCompletedKeyRef.current = null
      splitAutoFinishStartedRef.current = false
      flushSync(() => {
        setTaskSplitInlinePhase('loading')
        setTaskSplitErrorBanner(null)
      })
      // Let the browser paint "Balancing…" before the synchronous partition + payload build.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
      if (generation !== taskSplitSuggestGenRef.current) return
      try {
        const historySummary = buildWorkHistorySummary({
          taskState,
          dateKey: selectedDateKey,
          employeeA: a,
          employeeB: b,
          allTasks,
        })
        const lastTogetherSummary = buildLastTogetherSummaryForSplit({
          taskState,
          dateKey: selectedDateKey,
          windowKey: selectedWindow as '17' | '21',
          employeeA: a,
          employeeB: b,
          candidateTaskIds: taskSplitCandidateIds,
          allTasks,
        })
        const previousSuggestion =
          opts?.isRegenerate && opts?.previousResult ? suggestResultToVariant(opts.previousResult) : undefined
        const payload = buildTaskSplitRequestPayload({
          taskState,
          dateKey: selectedDateKey,
          windowKey: selectedWindow as TaskSplitSuggestWindowKey,
          employeeA: a,
          employeeB: b,
          allTasks: allTasks as TaskLike[],
          taskOverrides,
          windowMs: { windowStartMsForDateKey, windowCloseMsForDateKey },
          soloModeActive: isSoloModeActiveForWindow(selectedDateKey, selectedWindow as WindowKey),
          deploymentChannel,
          candidateTaskIds: taskSplitCandidateIds,
          historySummary,
          lastTogetherSummary,
          forceIceMode: opts?.forceIceMode,
          previousSuggestion,
          isRegenerate: opts?.isRegenerate,
        })
        const out = await submitTaskSplitRequest(payload)
        if (generation !== taskSplitSuggestGenRef.current) return

        const wk = selectedWindow as TaskSplitSuggestWindowKey
        const shift: 'day' | 'night' = wk === '17' ? 'day' : 'night'
        const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
        const core = computeShiftScoringCore(
          taskState,
          selectedDateKey,
          shift,
          SHIFT_WINDOWS,
          windowTaskWeights,
          taskWeightByIdByWindow,
        )
        const baselineA = core ? readWindowPointForEmployee(core.pointsByWindow[wk], out.employeeA) : 0
        const baselineB = core ? readWindowPointForEmployee(core.pointsByWindow[wk], out.employeeB) : 0
        const doc = buildFairSplitContractDocument({
          result: out,
          dateKey: selectedDateKey,
          windowKey: wk,
          baselinePointsFloatA: baselineA,
          baselinePointsFloatB: baselineB,
        })
        if (wk === '17') setFairSplitContract17(doc)
        else setFairSplitContract21(doc)

        fairSplitPendingWriteRef.current = wk
        try {
          await setFairSplitContract(doc)
        } finally {
          fairSplitPendingWriteRef.current = null
        }
        if (generation !== taskSplitSuggestGenRef.current) return

        setTaskSplitResult(out)
        setTaskSplitInlinePhase('active')
        if (selectedWindow === '21') {
          const prevMode = isDemoDaySelected ? demoSoloModeByDateKey[selectedDateKey] ?? null : soloMode
          if (prevMode?.nightActive) {
            const nextMode: SoloMode | null = prevMode.active
              ? {
                  active: true,
                  activatedAt: prevMode.activatedAt,
                  ...(prevMode.activatedBy ? { activatedBy: prevMode.activatedBy } : {}),
                }
              : null
            if (isDemoDaySelected) {
              setDemoSoloModeByDateKey((prev) => ({ ...prev, [selectedDateKey]: nextMode }))
            }
            setSoloMode(nextMode)
            void persistSoloModeOrNoop(selectedDateKey, nextMode)
          }
        }
      } catch (e) {
        if (generation !== taskSplitSuggestGenRef.current) return
        if (selectedWindow === '17') {
          setFairSplitContract17(readFairSplitContractLocalCache(selectedDateKey, '17'))
        } else if (selectedWindow === '21') {
          setFairSplitContract21(readFairSplitContractLocalCache(selectedDateKey, '21'))
        }
        const msg = e instanceof Error ? e.message : String(e)
        // Close the inline panel and surface the error so the user can re-tap the dice to retry.
        setTaskSplitErrorBanner(null)
        setTaskSplitInlinePhase(null)
        setSplitIcePromptOpen(false)
        setSaveError(msg || 'Could not generate a split. Try again.')
      }
    },
    [
      allTasks,
      demoSoloModeByDateKey,
      deploymentChannel,
      isDemoDaySelected,
      isSoloModeActiveForWindow,
      persistSoloModeOrNoop,
      selectedDateKey,
      selectedWindow,
      soloMode,
      taskOverrides,
      taskSplitCandidateIds,
      taskState,
      windowCloseMsForDateKey,
      windowStartMsForDateKey,
      SHIFT_WINDOWS,
    ],
  )

  const closeTaskSplitInline = useCallback(() => {
    taskSplitSuggestGenRef.current += 1
    if (splitAutoFinishTimerRef.current != null) {
      window.clearTimeout(splitAutoFinishTimerRef.current)
      splitAutoFinishTimerRef.current = null
    }
    splitAutoFinishStartedRef.current = false
    setSplitEvacuating(false)
    if (selectedWindow === '17' || selectedWindow === '21') {
      taskSplitUndoneKeyRef.current = `${selectedDateKey}:${selectedWindow}`
      clearFairSplitContractLocalCache(selectedDateKey, selectedWindow)
      if (selectedWindow === '17') setFairSplitContract17(null)
      else setFairSplitContract21(null)
      void deleteFairSplitContract(selectedDateKey, selectedWindow)
    }
    setTaskSplitInlinePhase(null)
    setTaskSplitResult(null)
    setTaskSplitErrorBanner(null)
    setTaskSplitEmpA('')
    setTaskSplitEmpB('')
    setSplitIcePromptOpen(false)
    setTaskSplitIceSplitChoice(false)
  }, [selectedDateKey, selectedWindow])

  /**
   * Given a known pair, either ask "Split Ice?" first (when the window has an ice task)
   * or run the suggested split immediately (one person does ice).
   */
  const beginDiceSplitWithPair = useCallback(
    (a: string, b: string) => {
      setTaskSplitEmpA(a)
      setTaskSplitEmpB(b)
      if (taskSplitWindowHasIce) {
        setSplitIcePromptOpen(true)
      } else {
        setTaskSplitIceSplitChoice(false)
        void runTaskSplitSuggest(a, b, { forceIceMode: 'whole' })
      }
    },
    [runTaskSplitSuggest, taskSplitWindowHasIce],
  )

  const handleSplitIceChoice = useCallback(
    (split: boolean) => {
      const a = taskSplitEmpA.trim()
      const b = taskSplitEmpB.trim()
      setSplitIcePromptOpen(false)
      if (!a || !b || a === b) return
      setTaskSplitIceSplitChoice(split)
      void runTaskSplitSuggest(a, b, { forceIceMode: split ? 'split' : 'whole' })
    },
    [runTaskSplitSuggest, taskSplitEmpA, taskSplitEmpB],
  )

  const openTaskSplitSetup = useCallback(() => {
    if (taskSplitInlinePhase !== null) {
      // Panel is already open — pressing dice again exits / undoes.
      closeTaskSplitInline()
      return
    }
    setTaskSplitErrorBanner(null)
    setTaskSplitResult(null)
    setTaskSplitIceSplitChoice(false)
    const r = taskSplitResolvedEmployees
    if (r && r[0] && r[1] && r[0] !== r[1]) {
      // Two working employees are already known — go straight to the split
      // (asking "Split Ice?" first when the window has an ice task).
      beginDiceSplitWithPair(r[0], r[1])
      return
    }
    // We don't know who is working — reuse the task-split employee grid overlay
    // to ask, then proceed to the same split flow.
    setTaskSplitEmpA('')
    setTaskSplitEmpB('')
    setAssignees([])
    setActiveTaskId(null)
    setSplitMode(true)
    setShowAllEmployeesInSelector(false)
    setSplitSetupSelecting(true)
    setShowEmployeeSelector(true)
  }, [beginDiceSplitWithPair, closeTaskSplitInline, taskSplitInlinePhase, taskSplitResolvedEmployees])

  const handleNightSplitTeamChoice = useCallback(() => {
    setNightSplitChoseTeamSplit(true)
    if (isDiceEnabledForChannel(taskOverrides, deploymentChannel) && taskSplitCandidateIds.length > 0) {
      openTaskSplitSetup()
    }
  }, [deploymentChannel, openTaskSplitSetup, taskOverrides, taskSplitCandidateIds.length])

  const taskSplitOnRegenerate = useCallback(() => {
    const a = taskSplitEmpA.trim()
    const b = taskSplitEmpB.trim()
    if (!a || !b || a === b) return
    void runTaskSplitSuggest(a, b, {
      forceIceMode: taskSplitIceSplitChoice ? 'split' : 'whole',
      isRegenerate: true,
      previousResult: taskSplitResult,
    })
  }, [runTaskSplitSuggest, taskSplitEmpA, taskSplitEmpB, taskSplitIceSplitChoice, taskSplitResult])

  const taskSplitHudFloats = useMemo(() => {
    if (taskSplitInlinePhase === null || !taskSplitResult) return null
    const wk = selectedWindow as TaskSplitSuggestWindowKey
    if (wk !== '17' && wk !== '21') return null
    const contract = wk === '17' ? fairSplitContract17 : fairSplitContract21
    if (!contract || contract.dateKey !== selectedDateKey || contract.windowKey !== wk) return null
    const shift = wk === '17' ? ('day' as const) : ('night' as const)
    const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
    const core = computeShiftScoringCore(
      taskState,
      selectedDateKey,
      shift,
      SHIFT_WINDOWS,
      windowTaskWeights,
      taskWeightByIdByWindow,
    )
    if (!core) return null
    return fairSplitPreviewWindowPoints({
      state: taskState,
      dateKey: selectedDateKey,
      shift,
      contract,
      windowTaskWeights,
      taskWeightByIdByWindow,
      deferredFrom17: core.deferredFrom17,
      deferredWeightTotal17: core.deferredWeightTotal17,
      useBalancedScoring: core.useBalancedScoring,
      useDailyTaskPoints: core.useDailyTaskPoints,
      canonicalPointsByWindow: core.pointsByWindow,
    })
  }, [
    taskSplitInlinePhase,
    taskSplitResult,
    selectedWindow,
    selectedDateKey,
    fairSplitContract17,
    fairSplitContract21,
    taskState,
    getWeightsForDateKey,
    SHIFT_WINDOWS,
  ])

  /** True once every task the active split assigned (incl. shared + split ice) is done. */
  const allSplitSuggestedComplete = useMemo(() => {
    if (taskSplitInlinePhase !== 'active' || !taskSplitResult) return false
    if (selectedWindow !== '17' && selectedWindow !== '21') return false
    const windowMap = taskState[selectedDateKey]?.[selectedWindow] || {}
    const ids = new Set<string>([
      ...Object.keys(taskSplitResult.finalAssignment || {}),
      ...(taskSplitResult.finalSharedTaskIds || []),
    ])
    if (taskSplitResult.finalIceSplitAssignment) {
      Object.keys(taskSplitResult.finalIceSplitAssignment).forEach((id) => ids.add(id))
    }
    if (ids.size === 0) return false
    for (const tid of ids) {
      if (!isTaskDoneForSplit(tid, windowMap[tid])) return false
    }
    return true
  }, [taskSplitInlinePhase, taskSplitResult, selectedWindow, selectedDateKey, taskState])

  // Reset the split-complete celebration allowance once the cinematic is gone.
  useEffect(() => {
    if (!windowCompleteCelebration) setSplitAutoCelebration(false)
  }, [windowCompleteCelebration])

  /** Block idle screensaver when any heavy overlay is up (does not touch MusicPlayer / <audio>). */
  const screensaverObstructed = useMemo(
    () =>
      !!demoDayKey ||
      taskSplitInlinePhase !== null ||
      isAnyModalOpen ||
      showLeaderboard ||
      showPointsExplanation ||
      showAdminPanel ||
      showEmployeeSelector ||
      showChecklistModal ||
      showNightShiftPrompt ||
      v3ShiftNotifyOpen ||
      isLoadingData ||
      isLoadingWindow ||
      showStartupCover ||
      musicReminderActive ||
      showGoodMorning,
    [
      demoDayKey,
      taskSplitInlinePhase,
      isAnyModalOpen,
      showLeaderboard,
      showPointsExplanation,
      showAdminPanel,
      showEmployeeSelector,
      showChecklistModal,
      showNightShiftPrompt,
      v3ShiftNotifyOpen,
      isLoadingData,
      isLoadingWindow,
      showStartupCover,
      musicReminderActive,
      showGoodMorning,
    ]
  )

  const dismissScreensaver = useCallback((opts?: { absorbGhostTap?: boolean }) => {
    setScreensaverOpen(false)
    setScreensaverBetaDemoOverride(null)
    lastInteractionTsRef.current = Date.now()
    if (opts?.absorbGhostTap) {
      if (screensaverDismissShieldTimeoutRef.current) {
        clearTimeout(screensaverDismissShieldTimeoutRef.current)
      }
      setScreensaverDismissShield(true)
      screensaverDismissShieldTimeoutRef.current = window.setTimeout(() => {
        setScreensaverDismissShield(false)
        screensaverDismissShieldTimeoutRef.current = null
      }, 450)
    }
  }, [])

  useEffect(() => {
    if (!musicReminderActive) return
    dismissScreensaver()
  }, [musicReminderActive, dismissScreensaver])

  useEffect(() => {
    if (!showGoodMorning) return
    dismissScreensaver()
  }, [showGoodMorning, dismissScreensaver])

  const openScreensaverPreview = useCallback(() => {
    if (!screensaverEnabled) return
    lastInteractionTsRef.current = Date.now()
    setScreensaverBetaDemoOverride(null)
    setScreensaverSessionId((id) => id + 1)
    setScreensaverOpen(true)
  }, [screensaverEnabled])

  /** Random: sample two-name quote, or static break / shift countdown (beta QA). */
  const openScreensaverBetaDemoQuoteOrCountdown = useCallback(() => {
    if (!screensaverEnabled) return
    lastInteractionTsRef.current = Date.now()
    if (Math.random() < 0.5) {
      const lines = [
        'Alex & Jordan are on it today',
        'Great shift, Sam & Riley',
        'Taylor & Morgan — keep it going',
      ]
      setScreensaverBetaDemoOverride({
        kind: 'quote',
        line: lines[Math.floor(Math.random() * lines.length)]!,
      })
    } else if (Math.random() < 0.5) {
      setScreensaverBetaDemoOverride({
        kind: 'countdown',
        value: { kind: 'break', remainingMs: 14 * 60_000 + 32_000, employee: 'Preview' },
      })
    } else {
      setScreensaverBetaDemoOverride({
        kind: 'countdown',
        value: { kind: 'shift', remainingMs: 21 * 60_000 + 5_000 },
      })
    }
    setScreensaverOpen(true)
  }, [screensaverEnabled])

  useEffect(() => {
    if (!screensaverEnabled) return
    const id = window.setInterval(() => {
      if (!screensaverEnabled || isAdmin) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (screensaverObstructed) return
      if (screensaverOpen) return
      if (Date.now() - lastInteractionTsRef.current < SCREENSAVER_IDLE_MS) return
      snapBrowseContextToLiveNowRef.current()
      setScreensaverBetaDemoOverride(null)
      setScreensaverSessionId((id) => id + 1)
      setScreensaverOpen(true)
    }, SCREENSAVER_POLL_MS)
    return () => window.clearInterval(id)
  }, [screensaverEnabled, isAdmin, screensaverObstructed, screensaverOpen])

  // Always reset to quick mode when the selector closes (regardless of which code path closed it).
  useEffect(() => {
    if (showEmployeeSelector) return
    setShowAllEmployeesInSelector(false)
  }, [showEmployeeSelector])

  const todayLeaders = useMemo(() => computeFullDayLeaders(todayKey), [computeFullDayLeaders, todayKey])

  // Apply pending gradient when any score animation starts
  useEffect(() => {
    const hasAnimation = scoreAnim || scoreAnimP1 || scoreAnimP2
    if (hasAnimation && pendingGradient !== null) {
      setProgressGradient(pendingGradient)
      setPendingGradient(null)
    }
  }, [scoreAnim, scoreAnimP1, scoreAnimP2, pendingGradient])

  // Compute pending gradient when shift leaders or employee colors change
  // This prepares the gradient to be applied during the next score animation
  useEffect(() => {
    const applyGradient = () => {
      const newGradient = computeProgressGradient(shiftHudLeaders, employeeColors)
      const hasAnimation = scoreAnim || scoreAnimP1 || scoreAnimP2
      if (hasAnimation) {
        setPendingGradient(newGradient)
      } else {
        setProgressGradient(newGradient)
      }
    }
    const hasAnimation = scoreAnim || scoreAnimP1 || scoreAnimP2
    if (hasAnimation) {
      startTransition(applyGradient)
    } else {
      applyGradient()
    }
  }, [shiftHudLeaders, employeeColors, scoreAnim, scoreAnimP1, scoreAnimP2])

  const selectedCloseLabel = useMemo(() => {
    const dayOfWeek = selectedDate.getDay()
    return dayOfWeek === 5 || dayOfWeek === 6 ? '10' : '9'
  }, [selectedDate])

  const selectedBothDoubleShift = useMemo(() => {
    const slots = breakSelection?.slots || []
    return (
      slots.length >= 2 &&
      slots.every((s) => (s?.employee || '').trim()) &&
      slots.every((s) => s?.shiftType === 'double')
    )
  }, [breakSelection?.slots])

  // Admin-only: allow overriding the two employees for Order Report so past days can be fixed.
  const [orderReportEmployeesOverride, setOrderReportEmployeesOverride] = useState<[string, string] | null>(null)

  // Clear override whenever we open/close an Order Report modal (keeps behavior predictable).
  useEffect(() => {
    if (!isOrderReportTaskId) {
      setOrderReportEmployeesOverride(null)
      return
    }
    setOrderReportEmployeesOverride(null)
  }, [isOrderReportTaskId])

  const derivedOrderReportEmployees = useMemo<[string, string]>(() => {
    if (!isOrderReportTaskId || !activeTaskId) return ['', '']

    const isClose = activeTaskId === 'order-report-close'

    // First: if already completed, reuse its assignees for stable edits (especially for past days).
    const completion = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    if (completion?.assignees?.length === 2) {
      const e0 = (completion.assignees[0] || '').trim()
      const e1 = (completion.assignees[1] || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }

    // Close Order Report: strict — derive from night shift participants only (no Break Selection fallback).
    if (isClose) {
      if (shiftHudLeaders.length >= 2) {
        const e0 = (shiftHudLeaders[0]?.name || '').trim()
        const e1 = (shiftHudLeaders[1]?.name || '').trim()
        if (e0 && e1 && e0 !== e1) return [e0, e1]
      }
      return ['', '']
    }

    // 5PM Order Report: prefer the configured "two-person shift" (Break Selection) for that date.
    const slots = breakSelection?.slots || []
    if (slots.length >= 2) {
      const e0 = (slots[0]?.employee || '').trim()
      const e1 = (slots[1]?.employee || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }

    // Fallback: shift HUD leaders (top 2 participants).
    if (shiftHudLeaders.length >= 2) {
      const e0 = (shiftHudLeaders[0]?.name || '').trim()
      const e1 = (shiftHudLeaders[1]?.name || '').trim()
      if (e0 && e1 && e0 !== e1) return [e0, e1]
    }

    return ['', '']
  }, [activeTaskId, breakSelection?.slots, isOrderReportTaskId, selectedDateKey, selectedWindow, shiftHudLeaders, taskState])

  const orderReportEmployees = useMemo<[string, string]>(() => {
    return orderReportEmployeesOverride ?? derivedOrderReportEmployees
  }, [derivedOrderReportEmployees, orderReportEmployeesOverride])

  const orderReportOverlayError = useMemo(() => {
    if (!isOrderReportTaskId) return null
    const [e0, e1] = orderReportEmployees
    if (!e0 || !e1) {
      const isClose = activeTaskId === 'order-report-close'
      if (isClose) {
        return isAdmin
          ? 'Pick 2 employees for Close Order Report (admin).'
          : 'Close Order Report needs 2 night-shift employees. Complete a close task first.'
      }
      return isAdmin
        ? 'Pick 2 employees for 5PM Order Report (admin), or set Break Selection.'
        : 'Set Break Selection (2 employees) before submitting Order Report.'
    }
    if (e0 === e1) return 'Order Report needs two different employees.'
    return saveError
  }, [activeTaskId, isAdmin, isOrderReportTaskId, orderReportEmployees, saveError])

  const orderReportOverlayDescription = useMemo(() => {
    if (!isOrderReportTaskId || !activeTaskId) {
      return 'Report the number of orders taken by each employee (as shown in KwickPOS UserReport).'
    }
    if (activeTaskId === 'order-report-close') {
      const five = taskState[selectedDateKey]?.['17']?.['order-report-5pm']
      const hasFive = !!five?.orderReportCounts
      return hasFive
        ? 'Enter the TOTAL orders for today for each employee (KwickPOS UserReport). If someone was on the 5PM report, we automatically count only orders after 5PM for scoring.'
        : 'Enter the TOTAL orders for today for each employee (KwickPOS UserReport).'
    }
    return 'Enter the TOTAL orders up to 5PM for each employee (KwickPOS UserReport).'
  }, [activeTaskId, isOrderReportTaskId, selectedDateKey, taskState])

  // Calculate earned labels for all employees (achievement labels from task history)
  // Calendar-based: current month-to-date.
  const earnedLabels = useMemo(
    () => calculateEarnedLabels(taskState, activeEmployees, { fromDateKey: currentMonthStartKey, toDateKey: todayKey }),
    [currentMonthStartKey, activeEmployees, taskState, todayKey]
  )

  const earnedLabelsWithRarity = useMemo(() => {
    const counts: Record<string, number> = {}
    activeEmployees.forEach((emp) => {
      const list = earnedLabels[emp] ?? []
      list.forEach((l) => {
        counts[l.id] = (counts[l.id] || 0) + 1
      })
    })
    const denom = Math.max(1, activeEmployees.length)
    const boosted: Record<string, EmployeeLabel[]> = {}
    activeEmployees.forEach((emp) => {
      const list = earnedLabels[emp] ?? []
      boosted[emp] = list.map((l) => {
        if (l.category !== 'achievement') return l
        const c = counts[l.id] || 0
        const rarity = 1 - c / denom // 0..~1
        const boost = Math.max(0, Math.min(14, Math.round(rarity * 14)))
        return { ...l, priority: l.priority + boost }
      })
    })
    return boosted
  }, [earnedLabels, activeEmployees])

  const leaderboardMonthRange = useMemo(() => {
    const monthStart = startOfMonth(leaderboardMonth)
    const monthEnd = isSameMonth(monthStart, todayDate) ? todayDate : endOfMonth(monthStart)
    return { fromDateKey: formatDateKey(monthStart), toDateKey: formatDateKey(monthEnd) }
  }, [leaderboardMonth, todayDate])

  const earnedLabelsLeaderboardMonth = useMemo(() => {
    if (!showLeaderboard || leaderboardView !== 'month') return earnedLabels
    return calculateEarnedLabels(lbMonthTaskState, activeEmployees, leaderboardMonthRange)
  }, [earnedLabels, activeEmployees, leaderboardMonthRange, leaderboardView, lbMonthTaskState, showLeaderboard])

  const earnedLabelsLeaderboardMonthWithRarity = useMemo(() => {
    const source = earnedLabelsLeaderboardMonth
    const counts: Record<string, number> = {}
    activeEmployees.forEach((emp) => {
      const list = source[emp] ?? []
      list.forEach((l) => {
        counts[l.id] = (counts[l.id] || 0) + 1
      })
    })
    const denom = Math.max(1, activeEmployees.length)
    const boosted: Record<string, EmployeeLabel[]> = {}
    activeEmployees.forEach((emp) => {
      const list = source[emp] ?? []
      boosted[emp] = list.map((l) => {
        if (l.category !== 'achievement') return l
        const c = counts[l.id] || 0
        const rarity = 1 - c / denom
        const boost = Math.max(0, Math.min(14, Math.round(rarity * 14)))
        return { ...l, priority: l.priority + boost }
      })
    })
    return boosted
  }, [earnedLabelsLeaderboardMonth, activeEmployees])

  // Manual/skill labels scaffold (local for now, can be persisted to Firestore later)
  // Format: { employeeName: EmployeeLabel[] }
  // Example: { 'Ashley': [{ ...SKILL_LABELS.trainer, source: 'manual' }] }
  const [manualLabelsByEmployee] = useState<Record<string, EmployeeLabel[]>>(() => {
    // Scaffold: empty for now. When ready, load from localStorage or Firestore.
    // To add manual labels for an employee, populate this record:
    // return { 'Ashley': [{ ...SKILL_LABELS.trainer, source: 'manual' }] }
    return {}
  })

  // Compute display labels (up to 2 per employee, from different categories)
  const displayLabelsByEmployee = useMemo(() => {
    const result: Record<string, EmployeeLabel[]> = {}
    activeEmployees.forEach(emp => {
      // Merge earned labels (achievements) with manual labels (skills, roles)
      const achievementLabels = earnedLabelsWithRarity[emp] ?? []
      const manualLabels = manualLabelsByEmployee[emp] ?? []
      const statusLabels: EmployeeLabel[] =
        achievementLabels.length === 0
          ? [{ ...STATUS_LABELS.newbie, source: 'system' }]
          : []
      const allLabels = [...achievementLabels, ...manualLabels, ...statusLabels]
      result[emp] = pickDisplayLabels(allLabels)
    })
    return result
  }, [earnedLabelsWithRarity, activeEmployees, manualLabelsByEmployee])

  const displayLabelsByEmployeeForLeaderboard = useMemo(() => {
    if (!showLeaderboard || leaderboardView !== 'month') return displayLabelsByEmployee
    const result: Record<string, EmployeeLabel[]> = {}
    activeEmployees.forEach((emp) => {
      const achievementLabels = earnedLabelsLeaderboardMonthWithRarity[emp] ?? []
      const manualLabels = manualLabelsByEmployee[emp] ?? []
      const statusLabels: EmployeeLabel[] =
        achievementLabels.length === 0
          ? [{ ...STATUS_LABELS.newbie, source: 'system' }]
          : []
      const allLabels = [...achievementLabels, ...manualLabels, ...statusLabels]
      result[emp] = pickDisplayLabels(allLabels)
    })
    return result
  }, [
    displayLabelsByEmployee,
    earnedLabelsLeaderboardMonthWithRarity,
    activeEmployees,
    leaderboardView,
    manualLabelsByEmployee,
    showLeaderboard,
  ])

  // Track previous earned labels to detect newly unlocked ones
  const prevEarnedLabelsRef = useRef<Record<string, Set<string>>>({})
  const [labelUnlockToast, setLabelUnlockToast] = useState<{ name: string; label: EmployeeLabel } | null>(null)
  type LabelUnlockSparkle = { id: string; xPct: number; yPct: number; delayMs: number; sizePx: number; rotDeg: number }
  const [labelUnlockSparkles, setLabelUnlockSparkles] = useState<LabelUnlockSparkle[]>([])
  const labelUnlockToastTimeoutRef = useRef<number | null>(null)

  const showLabelUnlockToast = useCallback((name: string, label: EmployeeLabel) => {
    if (labelUnlockToastTimeoutRef.current) window.clearTimeout(labelUnlockToastTimeoutRef.current)
    setLabelUnlockToast({ name, label })

    // Tiny sparkle burst (purely cosmetic, local-only)
    if (!prefersReducedMotion) {
      const now = Date.now()
      const count = 9
      const next: LabelUnlockSparkle[] = []
      for (let i = 0; i < count; i++) {
        // keep sparkles around the card edges; avoid covering text center
        const side = Math.random()
        const xPct =
          side < 0.5
            ? 8 + Math.random() * 26 // left band
            : 66 + Math.random() * 26 // right band
        const yPct = 10 + Math.random() * 70
        next.push({
          id: `${now}-${i}-${Math.random().toString(16).slice(2)}`,
          xPct,
          yPct,
          delayMs: i * 35,
          sizePx: 10 + Math.floor(Math.random() * 10),
          rotDeg: Math.floor(Math.random() * 120 - 60),
        })
      }
      setLabelUnlockSparkles(next)
    } else {
      setLabelUnlockSparkles([])
    }

    labelUnlockToastTimeoutRef.current = window.setTimeout(() => {
      setLabelUnlockToast(null)
      setLabelUnlockSparkles([])
    }, 3500)
  }, [prefersReducedMotion])

  const triggerTestAchievementUnlock = useCallback(() => {
    if (!isAdmin) return
    const roster = activeEmployees.length ? activeEmployees : ['Employee']
    const randomName = roster[Math.floor(Math.random() * roster.length)]!
    const allAchievementDefs = Object.values(ACHIEVEMENT_LABELS)
    const randomDef = allAchievementDefs[Math.floor(Math.random() * allAchievementDefs.length)]!
    const label: EmployeeLabel = { ...randomDef, source: 'computed' }
    showLabelUnlockToast(randomName, label)
  }, [activeEmployees, isAdmin, showLabelUnlockToast])

  // Detect new labels for assignees after each task completion
  useEffect(() => {
    if (prefersReducedMotion) return
    
    // Build current label sets
    const current: Record<string, Set<string>> = {}
    activeEmployees.forEach(emp => {
      current[emp] = new Set((earnedLabels[emp] ?? []).map(l => l.id))
    })

    // Check for newly unlocked labels (skip on first render)
    const prev = prevEarnedLabelsRef.current
    if (Object.keys(prev).length > 0) {
      for (const emp of activeEmployees) {
        const prevSet = prev[emp] ?? new Set()
        const currSet = current[emp] ?? new Set()
        for (const labelId of currSet) {
          if (!prevSet.has(labelId)) {
            // New label unlocked!
            const label = earnedLabels[emp]?.find(l => l.id === labelId)
            if (label) {
              // Show toast for this unlock
              showLabelUnlockToast(emp, label)
              break // Only show one toast at a time
            }
          }
        }
      }
    }

    prevEarnedLabelsRef.current = current
  }, [earnedLabels, activeEmployees, prefersReducedMotion, showLabelUnlockToast])

  // Cleanup label unlock toast timeout
  useEffect(() => {
    return () => {
      if (labelUnlockToastTimeoutRef.current) window.clearTimeout(labelUnlockToastTimeoutRef.current)
    }
  }, [])

  const leadersMonth = useMemo(() => {
    if (!showLeaderboard) return []
    if (leaderboardView !== 'month') return []

    const { fromDateKey: fromKey, toDateKey: toKey } = leaderboardMonthRange

    const byPerson: Record<string, { sum: number; shifts: number }> = {}
    Object.keys(lbMonthTaskState).forEach((dateKey) => {
      if (dateKey < fromKey || dateKey > toKey) return
      const { taskIdsByWindow, windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(dateKey)

      ;(['day', 'night'] as const).forEach((shift) => {
        // Reduce confusion: don't let today's in-progress shift influence the month leaderboard.
        // Count a shift only once all tasks in that shift's windows are completed.
        if (dateKey === todayKey && toKey === todayKey) {
          const windows = SHIFT_WINDOWS[shift]
          let complete = true
          for (let wi = 0; wi < windows.length; wi++) {
            const wKey = windows[wi]
            const ids = taskIdsByWindow[wKey] || []
            for (let ti = 0; ti < ids.length; ti++) {
              const taskId = ids[ti]
              if (!lbMonthTaskState[dateKey]?.[wKey]?.[taskId]) {
                complete = false
                break
              }
            }
            if (!complete) break
          }
          if (!complete) return
        }

        const fair =
          shift === 'day'
            ? fairSplitContract17?.dateKey === dateKey
              ? fairSplitContract17
              : null
            : fairSplitContract21?.dateKey === dateKey
              ? fairSplitContract21
              : null
        const shiftRows = computeShiftLeadersForState(
          lbMonthTaskState,
          dateKey,
          shift,
          SHIFT_WINDOWS,
          windowTaskWeights,
          taskWeightByIdByWindow,
          isSoloScoreCappedForShift(dateKey, shift),
          fair,
          trainingKeysForDate(dateKey)
        )
        shiftRows.forEach((row) => {
          const name = row.name
          if (!byPerson[name]) byPerson[name] = { sum: 0, shifts: 0 }
          byPerson[name].sum += row.score
          byPerson[name].shifts += row.shiftsPlayed
        })
      })
    })

    return Object.keys(byPerson)
      .map((name) => {
        const v = byPerson[name]
        const avg = v.shifts ? Math.round(v.sum / v.shifts) : 0
        return { name, score: avg, shiftsPlayed: v.shifts }
      })
      .sort((a, b) => b.score - a.score)
  }, [
    SHIFT_WINDOWS,
    getWeightsForDateKey,
    lbMonthTaskState,
    leaderboardMonthRange,
    leaderboardView,
    showLeaderboard,
    todayKey,
    fairSplitContract17,
    fairSplitContract21,
    isSoloScoreCappedForShift,
    trainingKeysForDate,
  ])

  const leaderboardRowsMonth = useMemo(() => {
    const byName: Record<string, LeaderRow> = {}
    leadersMonth.forEach((r) => {
      byName[r.name] = r
    })
    const rows: LeaderRow[] = leaderboardMonthRoster.map((name) => ({
      name,
      score: byName[name]?.score ?? 0,
      shiftsPlayed: byName[name]?.shiftsPlayed ?? 0,
    }))
    rows.sort((a, b) => (b.score - a.score) || (b.shiftsPlayed - a.shiftsPlayed) || a.name.localeCompare(b.name))
    return rows
  }, [leaderboardMonthRoster, leadersMonth])

  // Helper function to format date for display (e.g., "Wed, Jan 15")
  const formatDisplayDateForModal = useCallback((dateKey: string): string => {
    const [year, month, day] = dateKey.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }, [])

  // Types for shift history breakdown
  type ShiftEntry = {
    dateKey: string
    displayDate: string
    shift: 'day' | 'night'
    score: number
  }

  type EmployeeShiftHistory = {
    shifts: ShiftEntry[]
    totalScore: number
    shiftCount: number
    averageScore: number
  }

  // Compute shift history for an employee (reusing admin page logic)
  const shiftHistoryByEmployee = useMemo(() => {
    const result: Record<string, EmployeeShiftHistory> = {}
    
    if (!showLeaderboard || leaderboardView !== 'month') return result

    const { fromDateKey: fromKey, toDateKey: toKey } = leaderboardMonthRange

    // Process each date in the month
    const dateKeys = Object.keys(lbMonthTaskState).filter((dateKey) => {
      return dateKey >= fromKey && dateKey <= toKey
    }).sort()

    dateKeys.forEach((dateKey) => {
      const { taskIdsByWindow, windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(dateKey)

      ;(['day', 'night'] as const).forEach((shift) => {
        // Reduce confusion: don't let today's in-progress shift influence the month leaderboard.
        // Count a shift only once all tasks in that shift's windows are completed.
        if (dateKey === todayKey && toKey === todayKey) {
          const windows = SHIFT_WINDOWS[shift]
          let complete = true
          for (let wi = 0; wi < windows.length; wi++) {
            const wKey = windows[wi]
            const ids = taskIdsByWindow[wKey] || []
            for (let ti = 0; ti < ids.length; ti++) {
              const taskId = ids[ti]
              if (!lbMonthTaskState[dateKey]?.[wKey]?.[taskId]) {
                complete = false
                break
              }
            }
            if (!complete) break
          }
          if (!complete) return
        }

        // Compute shift leaders for this date+shift
        const fair =
          shift === 'day'
            ? fairSplitContract17?.dateKey === dateKey
              ? fairSplitContract17
              : null
            : fairSplitContract21?.dateKey === dateKey
              ? fairSplitContract21
              : null
        const shiftRows = computeShiftLeadersForState(
          lbMonthTaskState,
          dateKey,
          shift,
          SHIFT_WINDOWS,
          windowTaskWeights,
          taskWeightByIdByWindow,
          isSoloScoreCappedForShift(dateKey, shift),
          fair,
          trainingKeysForDate(dateKey)
        )

        // Track each shift where the person actually played (shiftsPlayed === 1)
        shiftRows.forEach((row) => {
          const name = row.name
          
          if (row.shiftsPlayed === 1) {
            if (!result[name]) {
              result[name] = { shifts: [], totalScore: 0, shiftCount: 0, averageScore: 0 }
            }
            
            result[name].shifts.push({
              dateKey,
              displayDate: formatDisplayDateForModal(dateKey),
              shift,
              score: row.score,
            })
            result[name].totalScore += row.score
            result[name].shiftCount += 1
          }
        })
      })
    })

    // Calculate averages
    Object.values(result).forEach((history) => {
      history.averageScore = history.shiftCount > 0 
        ? Math.round(history.totalScore / history.shiftCount) 
        : 0
    })

    // Sort shifts by date (most recent first)
    Object.values(result).forEach((history) => {
      history.shifts.sort((a, b) => {
        if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey)
        // If same date, show day before night
        return a.shift === 'day' ? -1 : 1
      })
    })

    return result
  }, [
    lbMonthTaskState,
    leaderboardMonthRange,
    leaderboardView,
    showLeaderboard,
    todayKey,
    getWeightsForDateKey,
    formatDisplayDateForModal,
    fairSplitContract17,
    fairSplitContract21,
    isSoloScoreCappedForShift,
    SHIFT_WINDOWS,
    trainingKeysForDate,
  ])

  const leaderboardRowsToday = useMemo(() => {
    const byName: Record<string, LeaderRow> = {}
    todayLeaders.forEach((r) => {
      byName[r.name] = r
    })
    const rows: LeaderRow[] = leaderboardTodayRoster.map((name) => ({
      name,
      score: byName[name]?.score ?? 0,
      shiftsPlayed: byName[name]?.shiftsPlayed ?? 0,
    }))
    rows.sort((a, b) => (b.score - a.score) || (b.shiftsPlayed - a.shiftsPlayed) || a.name.localeCompare(b.name))
    return rows
  }, [leaderboardTodayRoster, todayLeaders])

  const leaderboardRowsActive = useMemo(
    () => (leaderboardView === 'month' ? leaderboardRowsMonth : leaderboardRowsToday),
    [leaderboardRowsMonth, leaderboardRowsToday, leaderboardView]
  )

  // Compute ranks with tie handling for main leaderboard
  // Players with the same score share the same rank
  // Next rank after a tie = previous rank + 1
  const leaderboardRanks = useMemo(() => {
    if (leaderboardRowsActive.length === 0) return []
    
    const computedRanks: number[] = []
    let currentRank = 1
    let i = 0
    
    while (i < leaderboardRowsActive.length) {
      // Find all consecutive rows with the same score
      const currentScore = leaderboardRowsActive[i].score
      let groupSize = 0
      
      while (i + groupSize < leaderboardRowsActive.length && 
             leaderboardRowsActive[i + groupSize].score === currentScore) {
        groupSize++
      }
      
      // Assign the same rank to all rows in this group
      for (let j = 0; j < groupSize; j++) {
        computedRanks[i + j] = currentRank
      }
      
      // Move to next group and update rank
      i += groupSize
      currentRank += 1
    }
    
    return computedRanks
  }, [leaderboardRowsActive])

  // Count how many players share each rank (for tied detection)
  const leaderboardRankCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    leaderboardRanks.forEach(rank => {
      counts[rank] = (counts[rank] || 0) + 1
    })
    return counts
  }, [leaderboardRanks])

  useEffect(() => {
    if (showLeaderboard) return
    setLbScoreDisplayByName({})
    lbPrevRectsByNameRef.current = {}
  }, [showLeaderboard])

  // Scoreboard UI: animate displayed scores (count-up) without changing scoring math.
  // We delay score updates on first open to avoid re-renders during CSS entrance animations.
  useEffect(() => {
    if (!showLeaderboard) return
    const rows = leaderboardRowsActive
    if (!rows.length) return

    const to: Record<string, number> = {}
    rows.forEach((r) => {
      to[r.name] = r.score
    })

    // Detect first open: no previous scores stored means CSS entrance is playing
    const isFirstOpen = Object.keys(lbScoreDisplayRef.current).length === 0

    if (prefersReducedMotion) {
      // Skip animation but still delay on first open to avoid jitter
      if (isFirstOpen) {
        const tid = setTimeout(() => setLbScoreDisplayByName(to), 650)
        return () => clearTimeout(tid)
      }
      setLbScoreDisplayByName(to)
      return
    }

    // First open: wait for CSS entrance animations to finish before setting scores
    if (isFirstOpen) {
      const tid = setTimeout(() => setLbScoreDisplayByName(to), 650)
      return () => clearTimeout(tid)
    }

    // Already open: animate score changes smoothly
    const from: Record<string, number> = { ...lbScoreDisplayRef.current }
    rows.forEach((r) => {
      if (from[r.name] === undefined) from[r.name] = r.score
    })

    // Skip animation if nothing actually changed
    let hasChange = false
    for (const name of Object.keys(to)) {
      if (from[name] !== to[name]) {
        hasChange = true
        break
      }
    }
    if (!hasChange) {
      setLbScoreDisplayByName(to)
      return
    }

    const durationMs = 360
    const startedAt = Date.now()
    let raf = 0
    const tickAnim = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      const next: Record<string, number> = {}
      Object.keys(to).forEach((name) => {
        const a = from[name] ?? 0
        const b = to[name]
        next[name] = Math.round(a + (b - a) * eased)
      })
      setLbScoreDisplayByName(next)
      if (t >= 1) return
      raf = window.requestAnimationFrame(tickAnim)
    }
    raf = window.requestAnimationFrame(tickAnim)
    return () => window.cancelAnimationFrame(raf)
  }, [leaderboardRowsActive, prefersReducedMotion, showLeaderboard])

  // Scoreboard UI: smooth re-ordering (FLIP) when ranks change, without touching ranking math.
  useLayoutEffect(() => {
    if (!showLeaderboard) return
    if (prefersReducedMotion) return
    const rows = leaderboardRowsActive
    if (!rows.length) return

    const newRects: Record<string, DOMRect> = {}
    rows.forEach((r) => {
      const el = lbCardElByNameRef.current[r.name]
      if (!el) return
      newRects[r.name] = el.getBoundingClientRect()
    })

    const prevRects = lbPrevRectsByNameRef.current
    rows.forEach((r) => {
      const el = lbCardElByNameRef.current[r.name]
      const prev = prevRects[r.name]
      const next = newRects[r.name]
      if (!el || !prev || !next) return
      const dx = prev.left - next.left
      const dy = prev.top - next.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      try {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0px, 0px)' },
          ],
          { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        )
      } catch {
        // ignore (older browsers)
      }
    })

    lbPrevRectsByNameRef.current = newRects
  }, [leaderboardRowsActive, prefersReducedMotion, showLeaderboard])

  const isTodaySelected = isSameDay(selectedDate, now)

  /** Real today, Demo Day sandbox date, or admin — unlocks assignment UI (demo completions stay local / no leaderboard). */
  const canEditTaskAssignmentsOnSelectedDate = useMemo(
    () => isTodaySelected || isDemoDaySelected || isAdmin,
    [isAdmin, isDemoDaySelected, isTodaySelected]
  )

  const windowUnlockKey = `${selectedDateKey}:${selectedWindow}`

  const windowTimeLocked = useMemo(() => {
    if (!isTodaySelected) return false
    const windowConfig = WINDOWS.find((w) => w.key === selectedWindow)
    if (!windowConfig?.unlocksAt) return false
    const [unlockHour, unlockMinute] = windowConfig.unlocksAt.split(':').map(Number)
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    if (currentHour < unlockHour) return true
    if (currentHour === unlockHour && currentMinute < unlockMinute) return true
    return false
  }, [isTodaySelected, now, selectedWindow])

  const isWindowManuallyUnlocked = manualWindowUnlockKeys.has(windowUnlockKey)
  const effectiveWindowLocked = windowTimeLocked && !isWindowManuallyUnlocked

  // Timestamp (today) when the selected window unlocks for task completion, or null if it never locks.
  const windowUnlockTargetMs = useMemo(() => {
    const windowConfig = WINDOWS.find((w) => w.key === selectedWindow)
    if (!windowConfig?.unlocksAt) return null
    const [unlockHour, unlockMinute] = windowConfig.unlocksAt.split(':').map(Number)
    const target = new Date(now)
    target.setHours(unlockHour, unlockMinute, 0, 0)
    return target.getTime()
  }, [now, selectedWindow])

  // Drive a 1-second clock only while locked and within ~31 min of unlock (for a smooth MM:SS countdown).
  useEffect(() => {
    if (!effectiveWindowLocked || windowUnlockTargetMs === null) return
    if (windowUnlockTargetMs - Date.now() > 31 * 60_000) return
    const id = window.setInterval(() => setUnlockCountdownNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [effectiveWindowLocked, windowUnlockTargetMs, now])

  const isWindowTaskLocked = useCallback(
    (taskId?: string | null) => {
      if (isAdmin) return false
      if (!effectiveWindowLocked) return false
      if (
        taskId === 'yum-yum-close' &&
        (selectedWindow === '17' || selectedWindow === '21')
      ) {
        return false
      }
      return true
    },
    [effectiveWindowLocked, isAdmin, selectedWindow],
  )

  useEffect(() => {
    setManualWindowUnlockKeys(new Set())
  }, [selectedDateKey])

  const hasSplitRequiredTaskCompletedInWindow21 = useMemo(() => {
    const tasks = getEffectiveTasksByWindowForDateKey(selectedDateKey)['21'] || []
    const windowMap = taskState[selectedDateKey]?.['21'] || {}
    return tasks.some((task) => {
      if (!task.requiresSplit) return false
      const c = windowMap[task.id]
      if (!c || c.status !== 'done' || c.didNotNeedToComplete) return false
      if ((c.assignees?.length ?? 0) >= 2) return true
      if (task.id === 'ice-5pm' || task.id === 'ice-close') {
        return (
          !!String(c.iceSides?.left || '').trim() && !!String(c.iceSides?.right || '').trim()
        )
      }
      if (task.id === 'towels' || task.id === 'towels-5pm' || task.id === 'towels-close') {
        return (
          !!String(c.towelSides?.diningBar || '').trim() &&
          !!String(c.towelSides?.bowlStation || '').trim()
        )
      }
      return false
    })
  }, [selectedDateKey, taskState, getEffectiveTasksByWindowForDateKey])

  const hasPendingRequiresSplitInWindow21 = useMemo(() => {
    const tasks = getEffectiveTasksByWindowForDateKey(selectedDateKey)['21'] || []
    const windowMap = taskState[selectedDateKey]?.['21'] || {}
    return tasks.some((task) => {
      if (!task.requiresSplit) return false
      const c = windowMap[task.id]
      return !c || c.status !== 'done'
    })
  }, [selectedDateKey, taskState, getEffectiveTasksByWindowForDateKey])

  const hasTwoNightShiftWorkersWithMultipleTasks = useMemo(() => {
    const windowMap = taskState[selectedDateKey]?.['21'] || {}
    const taskCountByPerson: Record<string, number> = {}
    for (const [taskId, completion] of Object.entries(windowMap)) {
      if (!completion || completion.status !== 'done' || completion.didNotNeedToComplete) continue
      if (completion.autoAssigned) continue
      if (completion.completedLate && !completion.lateForgiven) continue
      const people = creditedPeopleForShiftCompletion(taskId, completion)
      for (const name of people) {
        taskCountByPerson[name] = (taskCountByPerson[name] || 0) + 1
      }
    }
    let workersWithMultiple = 0
    for (const count of Object.values(taskCountByPerson)) {
      if (count > 1) workersWithMultiple++
    }
    return workersWithMultiple >= 2
  }, [selectedDateKey, taskState])

  const needsNightSoloDecision = useMemo(() => {
    const hasSplitWork =
      hasPendingRequiresSplitInWindow21 ||
      (isDiceEnabledForChannel(taskOverrides, deploymentChannel) && taskSplitCandidateIds.length > 0)
    return (
      selectedWindow === '21' &&
      taskSplitInlinePhase === null &&
      hasSplitWork &&
      !isSoloModeActiveForWindow(selectedDateKey, '21') &&
      !hasSplitRequiredTaskCompletedInWindow21 &&
      !hasTwoNightShiftWorkersWithMultipleTasks
    )
  }, [
    selectedWindow,
    taskSplitInlinePhase,
    hasPendingRequiresSplitInWindow21,
    taskOverrides,
    deploymentChannel,
    taskSplitCandidateIds.length,
    isSoloModeActiveForWindow,
    selectedDateKey,
    hasSplitRequiredTaskCompletedInWindow21,
    hasTwoNightShiftWorkersWithMultipleTasks,
  ])

  const showNightSoloActiveBanner = useMemo(() => {
    if (selectedWindow !== '21') return false
    const mode = getSoloModeForDateKey(selectedDateKey)
    return !!mode?.nightActive && !mode?.active
  }, [selectedWindow, selectedDateKey, getSoloModeForDateKey, soloMode, demoSoloModeByDateKey])

  const hasEnabledDailyTasks = useMemo(() => {
    return (dailyTaskCatalog.tasks || []).filter(isDailyTaskSchedulable).length > 0
  }, [dailyTaskCatalog.tasks])

  const isDailyTaskContextSelected = isTodaySelected || isDemoDaySelected

  const activeDailyTaskRun = useMemo((): DailyTaskRun | null => {
    if (isDemoDaySelected) return demoDailyTaskRunByDateKey[selectedDateKey] || null
    if (isTodaySelected) return todayDailyTaskRun
    return null
  }, [demoDailyTaskRunByDateKey, isDemoDaySelected, isTodaySelected, selectedDateKey, todayDailyTaskRun])

  const activeDailyTaskDef = useMemo(() => {
    const taskId = activeDailyTaskRun?.taskId
    if (!taskId) return null
    return resolveDailyTaskDefFromCatalog(dailyTaskCatalog.tasks, taskId)
  }, [activeDailyTaskRun?.taskId, dailyTaskCatalog.tasks])

  const todayScheduleEntry = useMemo(
    () => parseWeekDayEntry(todayDailyTaskWeek?.days?.[todayDateKey]),
    [todayDailyTaskWeek?.days, todayDateKey]
  )

  const shouldShowDailyTaskTeaser = useMemo(() => {
    if (!hasEnabledDailyTasks) return false
    if (!isDailyTaskContextSelected) return false
    if (isDemoDaySelected) {
      const isDinnerWindow = selectedWindow === '17' || selectedWindow === '21'
      const wasCompletedBeforeDinner = activeDailyTaskRun?.completedAtMs && isDinnerWindow
      if (wasCompletedBeforeDinner) return false
      if (activeDailyTaskRun?.taskId === '__none__') return false
      return true
    }
    if (!isDayVisibleToPlayers(todayScheduleEntry)) return false
    // If task was completed before dinner shift, hide card during 5PM/9PM windows
    const isDinnerWindow = selectedWindow === '17' || selectedWindow === '21'
    const wasCompletedBeforeDinner = activeDailyTaskRun?.completedAtMs && isDinnerWindow
    if (wasCompletedBeforeDinner) return false
    if (activeDailyTaskRun?.taskId === '__none__') return false
    return true
  }, [
    activeDailyTaskRun?.completedAtMs,
    activeDailyTaskRun?.taskId,
    hasEnabledDailyTasks,
    isDailyTaskContextSelected,
    isDemoDaySelected,
    selectedWindow,
    todayScheduleEntry,
  ])

  useEffect(() => {
    if (!shouldShowDailyTaskTeaser) setShowDailyTaskModal(false)
  }, [shouldShowDailyTaskTeaser])

  // Golden Daily Task card step state (only meaningful when viewing today)
  useEffect(() => {
    if (!isDailyTaskContextSelected) return
    setDailyTaskError(null)
    // No run yet -> unrevealed idle state
    if (!activeDailyTaskRun) {
      setDailyTaskStep(-1)
      setDailyTaskEmployees([])
      setDailyTaskRevealing(false)
      return
    }
    // Completed -> final state
    if (typeof activeDailyTaskRun.completedAtMs === 'number' && Number.isFinite(activeDailyTaskRun.completedAtMs)) {
      setDailyTaskStep(4)
      return
    }
    // Revealed -> start flow at Materials (step 1, since step 0 is removed)
    if (typeof activeDailyTaskRun.revealedAtMs === 'number' && Number.isFinite(activeDailyTaskRun.revealedAtMs)) {
      setDailyTaskStep((prev) => (prev < 1 ? 1 : prev))
      return
    }
    // Not revealed yet
    setDailyTaskStep(-1)
    setDailyTaskEmployees([])
    setDailyTaskRevealing(false)
  }, [activeDailyTaskRun, isDailyTaskContextSelected])

  const resolveDailyTaskImageUrl = useCallback(
    async (path: string): Promise<string> => {
      const p = String(path || '').trim()
      if (!p) return ''
      const cached = dailyTaskImageUrlByPath[p]
      if (cached) return cached
      try {
        const url = await getDownloadURL(storageRef(storage, p))
        setDailyTaskImageUrlByPath((prev) => ({ ...prev, [p]: url }))
        return url
      } catch (e) {
        console.warn('Failed to load daily task image URL:', p, e)
        return ''
      }
    },
    [dailyTaskImageUrlByPath]
  )

  useEffect(() => {
    // Preload images for the currently selected daily task (if any).
    const t = activeDailyTaskDef
    if (!t) return
    const a = t.materials?.imagePath
    const b = t.whatToDo?.imagePath
    if (a) void resolveDailyTaskImageUrl(a)
    if (b) void resolveDailyTaskImageUrl(b)
  }, [activeDailyTaskDef, resolveDailyTaskImageUrl])

  const resolveTaskImageUrl = useCallback(
    async (path: string): Promise<string> => {
      const p = String(path || '').trim()
      if (!p) return ''
      const cached = taskImageUrlByPath[p]
      if (cached) return cached
      try {
        const url = await getDownloadURL(storageRef(storage, p))
        setTaskImageUrlByPath((prev) => ({ ...prev, [p]: url }))
        return url
      } catch (e) {
        console.warn('Failed to load task image URL:', p, e)
        return ''
      }
    },
    [taskImageUrlByPath]
  )

  // Preload task image when active task has imagePath (activeTask is defined later; use allTasks + activeTaskId)
  useEffect(() => {
    if (!activeTaskId) return
    const t = allTasks.find((a) => a.id === activeTaskId)
    if (t?.imagePath) void resolveTaskImageUrl(t.imagePath)
  }, [activeTaskId, allTasks, resolveTaskImageUrl])

  const ensureDemoDailyTaskRunLocal = useCallback(
    (dateKey: string): DailyTaskRun | null => {
      const existing = demoDailyTaskRunByDateKey[dateKey]
      if (existing) return existing
      const enabled = (dailyTaskCatalog.tasks || []).filter(isDailyTaskSchedulable)
      if (!enabled.length) return null
      const picked = enabled[Math.floor(Math.random() * enabled.length)]
      const run: DailyTaskRun = {
        dateKey,
        taskId: picked.id,
        selectedAtMs: Date.now(),
        selectedBy: 'demo',
      }
      setDemoDailyTaskRunByDateKey((prev) => ({ ...prev, [dateKey]: run }))
      return run
    },
    [dailyTaskCatalog.tasks, demoDailyTaskRunByDateKey]
  )

  const revealSelectedDailyTask = useCallback(async () => {
    if (!isDailyTaskContextSelected) return
    if (dailyTaskBusy) return
    setDailyTaskError(null)
    setDailyTaskBusy(true)
    try {
      const tasks = dailyTaskCatalog.tasks || []
      if (!tasks.length) {
        setDailyTaskError('No daily tasks are configured yet.')
        return
      }

      if (isDemoDaySelected) {
        const dk = selectedDateKey
        const run = ensureDemoDailyTaskRunLocal(dk)
        if (!run || run.taskId === '__none__') {
          setDailyTaskError('No daily task scheduled for Demo Day.')
          return
        }
        if (!run.revealedAtMs) {
          const next: DailyTaskRun = { ...run, revealedAtMs: Date.now(), revealedBy: 'demo' }
          setDemoDailyTaskRunByDateKey((prev) => ({ ...prev, [dk]: next }))
        }
        setDailyTaskRevealing(true)
        return
      }

      if (!isTodaySelected) return
      const run = await ensureDailyTaskRunForDateKey({ dateKey: todayDateKey, tasks })
      if (!run || run.taskId === '__none__') {
        setDailyTaskError('No daily task scheduled for today.')
        return
      }
      if (!run.revealedAtMs) await upsertDailyTaskRun(todayDateKey, { revealedAtMs: Date.now() })
      setDailyTaskRevealing(true)
    } catch (e) {
      console.error('Failed to reveal today daily task:', e)
      setDailyTaskError('Failed to reveal today\'s task. Please try again.')
    } finally {
      setDailyTaskBusy(false)
    }
  }, [
    dailyTaskBusy,
    dailyTaskCatalog.tasks,
    ensureDemoDailyTaskRunLocal,
    isDailyTaskContextSelected,
    isDemoDaySelected,
    isTodaySelected,
    selectedDateKey,
    todayDateKey,
  ])

  // Called when the reveal animation completes (v2: curtain; v3: cinematic)
  const handleDailyTaskSlotRevealComplete = useCallback(() => {
    setDailyTaskRevealing(false)
    setDailyTaskStep(1) // Go directly to Materials (skip old step 0)
  }, [])

  const completeSelectedDailyTask = useCallback(async () => {
    if (!isDailyTaskContextSelected) return
    if (dailyTaskBusy) return
    setDailyTaskError(null)
    const picked = (dailyTaskEmployees || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
    const unique = Array.from(new Set(picked))
    if (unique.length === 0) {
      setDailyTaskError('Please select at least 1 employee.')
      return
    }
    if (unique.length > 2) {
      setDailyTaskError('You can select up to 2 employees for a split completion.')
      return
    }
    const completedByDisplay = unique.join(' + ')
    setDailyTaskBusy(true)
    try {
      if (isDemoDaySelected) {
        const dk = selectedDateKey
        const run = ensureDemoDailyTaskRunLocal(dk)
        if (!run) {
          setDailyTaskError('No daily task scheduled for Demo Day.')
          return
        }
        const next: DailyTaskRun = {
          ...run,
          completedAtMs: Date.now(),
          completedBy: completedByDisplay,
          completedByList: unique,
        }
        setDemoDailyTaskRunByDateKey((prev) => ({ ...prev, [dk]: next }))
        setDailyTaskStep(4)
        return
      }

      if (!isTodaySelected) return
      await upsertDailyTaskRun(todayDateKey, {
        completedAtMs: Date.now(),
        completedBy: completedByDisplay,
        completedByList: unique,
      })

      // Check if this date is on/after the effective date for daily task points
      const dateMs = new Date(`${todayDateKey}T00:00:00`).getTime()
      const useDailyTaskPoints = dateMs >= DAILY_TASK_POINTS_EFFECTIVE_MS

      if (useDailyTaskPoints) {
        const activeShift = getActiveShiftFromTime()
        const targetWindow = getDailyTaskWindow(activeShift)

        // Create TaskCompletion for daily task
        const dailyTaskCompletion: TaskCompletion = {
          status: 'done',
          assignees: unique,
          completedAt: new Date().toISOString(),
        }

        // Save to TaskState via adminSetTaskCompletion (since it's programmatic)
        await adminSetTaskCompletion({
          dateKey: todayDateKey,
          windowKey: targetWindow,
          taskId: 'daily-task',
          completion: dailyTaskCompletion,
        })

        // Trigger stars animation on the daily task card
        if (dailyTaskTeaserCardRef.current) {
          spawnRewardStars(dailyTaskTeaserCardRef.current, { count: 14 })
        } else {
          // Fallback: spawn stars toward Shift HUD
          const target = isMainShiftHudMostlyVisible()
            ? (shiftHudExtraRef.current || p1ScoreRef.current || p2ScoreRef.current || shiftHudHeaderRef.current)
            : (shiftHudExtraRef.current || shiftHudHeaderRef.current)
          if (target) {
            spawnRewardStars(target, { count: 14 })
          }
        }
      }

      setDailyTaskStep(4)
    } catch (e) {
      console.error('Failed to complete daily task:', e)
      setDailyTaskError('Failed to save completion. Please try again.')
    } finally {
      setDailyTaskBusy(false)
    }
  }, [
    dailyTaskBusy,
    dailyTaskEmployees,
    ensureDemoDailyTaskRunLocal,
    getActiveShiftFromTime,
    getDailyTaskWindow,
    isDailyTaskContextSelected,
    isDemoDaySelected,
    isTodaySelected,
    selectedDateKey,
    todayDateKey,
  ])

  const getOrderedTasksForDateKeyWindow = useCallback(
    (dateKey: string, windowKey: WindowKey): Task[] => {
      const filtered = [...(getEffectiveTasksByWindowForDateKey(dateKey)[windowKey] || [])]
      if (windowKey === '17' && isSoloModeActiveForDateKey(dateKey) && !filtered.some((task) => task.id === NIGHT_SHIFT_SOLO_CHECK_TASK.id)) {
        filtered.push(NIGHT_SHIFT_SOLO_CHECK_TASK)
      }
      const legacyOrder = taskOrder[windowKey]
      const v3Order = taskOrderV3[windowKey]
      const order =
        uiVariant === 'v3'
          ? v3Order && v3Order.length > 0
            ? v3Order
            : legacyOrder && legacyOrder.length > 0
              ? legacyOrder
              : undefined
          : legacyOrder && legacyOrder.length > 0
            ? legacyOrder
            : undefined
      if (!order || order.length === 0) return filtered

      const ordered: Task[] = []
      order.forEach((id) => {
        const task = filtered.find((t) => t.id === id)
        if (task) ordered.push(task)
      })
      filtered.forEach((task) => {
        if (!order.includes(task.id)) ordered.push(task)
      })
      return ordered
    },
    [getEffectiveTasksByWindowForDateKey, isSoloModeActiveForDateKey, taskOrder, taskOrderV3, uiVariant]
  )

  const currentTasks = useMemo(() => {
    return getOrderedTasksForDateKeyWindow(selectedDateKey, selectedWindow)
  }, [getOrderedTasksForDateKeyWindow, selectedDateKey, selectedWindow])

  /** Only non-null during fixed local-time bands (11-ish, 5-ish, close); see inRange below. Screensaver uses this for periodic suggested-task slots. */
  const screensaverSuggestedTask = useMemo(() => {
    const inRange = (startHour: number, startMinute: number, endHour: number, endMinute: number): boolean => {
      const minuteOfDay = now.getHours() * 60 + now.getMinutes()
      const start = startHour * 60 + startMinute
      const end = endHour * 60 + endMinute
      return minuteOfDay >= start && minuteOfDay <= end
    }

    let suggestedWindow: WindowKey | null = null
    if (inRange(10, 0, 11, 30)) {
      suggestedWindow = '11'
    } else if (inRange(16, 0, 17, 30)) {
      suggestedWindow = '17'
    } else {
      const isFriSat = now.getDay() === 5 || now.getDay() === 6
      const closeHour = isFriSat ? 22 : 21
      if (inRange(closeHour - 1, 0, closeHour, 30)) {
        suggestedWindow = '21'
      }
    }
    if (!suggestedWindow) return null

    const orderedTasks = getOrderedTasksForDateKeyWindow(todayDateKey, suggestedWindow)
    const incomplete = orderedTasks.filter((task) => {
      const completion = taskState[todayDateKey]?.[suggestedWindow!]?.[task.id]
      const status = effectiveStatus(todayDate, suggestedWindow!, completion, now, task.id, isSoloModeActiveForWindow(todayDateKey, suggestedWindow!))
      return status !== 'done'
    })
    if (incomplete.length === 0) return null

    const topThree = incomplete.slice(0, 3)
    const minuteIndex = Math.floor(now.getTime() / 60_000)
    const index = minuteIndex % topThree.length
    const task = topThree[index]
    if (!task) return null
    return {
      id: task.id,
      icon: task.icon,
      name: task.name,
    }
  }, [getOrderedTasksForDateKeyWindow, now, taskState, todayDate, todayDateKey])

  /** Live clock window + today — matches current shift task list, not selected calendar window. */
  const screensaverShiftProgress = useMemo(() => {
    const liveWindow = getWindowForDate(now)
    const tasks = getOrderedTasksForDateKeyWindow(todayDateKey, liveWindow)
    const total = tasks.length
    if (total === 0) return { resolved: 0, total: 0, percent: 0 }
    let resolved = 0
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const completion = taskState[todayDateKey]?.[liveWindow]?.[task.id]
      const status = effectiveStatus(todayDate, liveWindow, completion, now, task.id, isSoloModeActiveForWindow(todayDateKey, liveWindow))
      if (status === 'done') resolved++
    }
    return { total, resolved, percent: Math.round((resolved / total) * 100) }
  }, [getOrderedTasksForDateKeyWindow, now, taskState, todayDate, todayDateKey])

  /** Always-latest inputs for AI quote fetch (interval must not close over stale progress). */
  const latestShiftQuoteInputsRef = useRef({
    deploymentChannel,
    timeOfDay,
    selectorShiftEmployees,
    screensaverShiftProgress,
  })
  latestShiftQuoteInputsRef.current = {
    deploymentChannel,
    timeOfDay,
    selectorShiftEmployees,
    screensaverShiftProgress,
  }

  /** Re-run fetch setup when *meaningful* context changes — not every `now` tick (avoids cancelling in-flight calls). */
  const shiftQuoteRefreshKey = useMemo(
    () =>
      [
        deploymentChannel,
        timeOfDay,
        selectorShiftEmployees.join('|'),
        screensaverShiftProgress.resolved,
        screensaverShiftProgress.total,
        screensaverShiftProgress.percent,
      ].join('\u0001'),
    [
      deploymentChannel,
      timeOfDay,
      selectorShiftEmployees,
      screensaverShiftProgress.resolved,
      screensaverShiftProgress.total,
      screensaverShiftProgress.percent,
    ],
  )

  // Periodically fetch AI-generated motivational quotes (after shift progress + selector employees exist).
  useEffect(() => {
    let cancelled = false
    const doFetch = () => {
      const { deploymentChannel: ch, timeOfDay: tod, selectorShiftEmployees: emps, screensaverShiftProgress: prog } =
        latestShiftQuoteInputsRef.current
      const liveWindow = getWindowForDate(new Date())
      const ctx: ShiftQuoteContext = {
        deploymentChannel: ch,
        timeOfDay: tod,
        windowKey: liveWindow,
        employeesOnShift: emps,
        progress: prog,
        stateTag: prog.percent >= 100 ? 'all_done'
          : prog.percent >= 60 ? 'on_pace'
          : prog.percent > 0 ? 'behind'
          : 'starting',
      }
      fetchShiftQuote(ctx).then((res) => {
        if (!cancelled) setAiShiftContent(res)
      })
    }
    doFetch()
    const id = setInterval(doFetch, 5 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [shiftQuoteRefreshKey])

  useEffect(() => {
    onLateQuoteUpdate((res) => setAiShiftContent(res))
  }, [])

  useEffect(() => {
    onLateWindowCompleteMessage((res) => {
      if (res.source === 'fallback') return
      const msg = res.message.trim()
      const k = lastKnownWindowCompleteMessageKeyRef.current
      if (k && msg) windowCompleteCompletionMessageByKeyRef.current.set(k, msg)
      setWindowCompleteCelebration((prev) =>
        prev ? { ...prev, completionMessage: msg } : null,
      )
    })
  }, [])

  const statusByTask = useMemo(() => {
    const map: Record<string, { status: EffectiveStatus; completion?: TaskCompletion }> = {}
    currentTasks.forEach((task) => {
      const completion = taskState[selectedDateKey]?.[selectedWindow]?.[task.id]
      map[task.id] = {
        status: effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, isSoloModeActiveForWindow(selectedDateKey, selectedWindow)),
        completion,
      }
    })
    return map
  }, [currentTasks, selectedDate, selectedWindow, taskState, selectedDateKey, now])

  const v3CompletedTasksOrdered = useMemo(() => {
    if (!isV3Ui) return [] as Task[]
    const done = currentTasks.filter((t) => statusByTask[t.id]?.status === 'done')
    done.sort((a, b) => {
      const ca = statusByTask[a.id]?.completion?.completedAt || ''
      const cb = statusByTask[b.id]?.completion?.completedAt || ''
      const ta = Date.parse(ca)
      const tb = Date.parse(cb)
      const na = Number.isFinite(ta) ? ta : 0
      const nb = Number.isFinite(tb) ? tb : 0
      if (nb !== na) return nb - na
      return a.id.localeCompare(b.id)
    })
    return done
  }, [isV3Ui, currentTasks, statusByTask])

  const stagedTasks = useMemo<{ stage1: Task[]; stage2: Task[]; label1: string; label2: string } | null>(() => {
    if (uiVariant !== 'v3') return null
    if (selectedWindow !== '11' && selectedWindow !== '21') return null

    const stage1: Task[] = []
    const stage2: Task[] = []
    for (const task of currentTasks) {
      const raw = taskStages[task.id]?.[selectedWindow]
      const inStage1 = Number(raw) === 1
      if (inStage1) stage1.push(task)
      else stage2.push(task)
    }
    if (stage1.length === 0) return null

    let label1: string
    let label2: string
    if (selectedWindow === '11') {
      label1 = 'Stage 1 \u2014 Finish by 11:00'
      label2 = 'Stage 2 \u2014 Finish by 11:30'
    } else {
      const isFriSat = selectedDate.getDay() === 5 || selectedDate.getDay() === 6
      // Night window stages shift one hour later on Fri/Sat (10PM close).
      label1 = isFriSat ? 'Stage 1 \u2014 8:00' : 'Stage 1 \u2014 7:00'
      label2 = isFriSat ? 'Stage 2 \u2014 9:00' : 'Stage 2 \u2014 8:00'
    }

    return { stage1, stage2, label1, label2 }
  }, [uiVariant, selectedWindow, currentTasks, taskStages, selectedDate])

  const taskSplitNightStageLabels = useMemo(() => {
    if (!isV3Ui || selectedWindow !== '21' || !stagedTasks) return null
    return { label1: stagedTasks.label1, label2: stagedTasks.label2 }
  }, [isV3Ui, selectedWindow, stagedTasks])

  stagedTasksRefForEvac.current = stagedTasks

  const showNewBadgeByTaskId = useMemo(() => {
    const nowMs = new Date(tick).getTime()
    const NEW_MS = 7 * 24 * 60 * 60 * 1000
    const allDateKeys = Object.keys(newBadgeTaskState).sort()
    const effectiveByDateKeyCache = new Map<string, Record<WindowKey, Task[]>>()
    const participantsCache = new Map<string, Set<string>>()

    const getEffectiveCached = (dateKey: string) => {
      let cached = effectiveByDateKeyCache.get(dateKey)
      if (!cached) {
        cached = getEffectiveTasksByWindowForDateKey(dateKey)
        effectiveByDateKeyCache.set(dateKey, cached)
      }
      return cached
    }

    const getParticipantsCached = (dateKey: string, shift: 'day' | 'night') => {
      const cacheKey = `${dateKey}:${shift}`
      let cached = participantsCache.get(cacheKey)
      if (!cached) {
        cached = computeShiftHudParticipantsForState(newBadgeTaskState, dateKey, shift, SHIFT_WINDOWS)
        participantsCache.set(cacheKey, cached)
      }
      return cached
    }

    const dateKeysSinceMs = (sinceMs: number) => {
      const minKey = formatDateKey(new Date(sinceMs))
      return allDateKeys.filter((k) => k >= minKey)
    }

    const qualifyingTasks = currentTasks.filter((task) => {
      const createdAtMs = task.createdAtMs ?? 0
      return !!createdAtMs && task.source === 'admin' && nowMs <= createdAtMs + NEW_MS
    })

    const map: Record<string, boolean> = {}
    if (qualifyingTasks.length === 0) {
      currentTasks.forEach((task) => {
        map[task.id] = false
      })
      return map
    }

    const didEmployeePlayShiftWithTask = (employeeName: string, task: Task): boolean => {
      const taskId = task.id
      const createdAtMs = task.createdAtMs ?? 0
      const dateKeys = dateKeysSinceMs(createdAtMs)
      for (let di = 0; di < dateKeys.length; di++) {
        const dateKey = dateKeys[di]
        const effectiveByWindow = getEffectiveCached(dateKey)
        for (const shift of ['day', 'night'] as const) {
          const windows = SHIFT_WINDOWS[shift]
          let taskAppliesToShift = false
          for (let wi = 0; wi < windows.length; wi++) {
            const wKey = windows[wi]
            if (effectiveByWindow[wKey]?.some((t) => t.id === taskId)) {
              taskAppliesToShift = true
              break
            }
          }
          if (!taskAppliesToShift) continue

          const participants = getParticipantsCached(dateKey, shift)
          if (participants.has(employeeName)) return true
        }
      }
      return false
    }

    currentTasks.forEach((task) => {
      const createdAtMs = task.createdAtMs ?? 0
      if (!createdAtMs || task.source !== 'admin') {
        map[task.id] = false
        return
      }
      if (nowMs > createdAtMs + NEW_MS) {
        map[task.id] = false
        return
      }
      const allPlayed = activeEmployees.every((emp) => didEmployeePlayShiftWithTask(emp, task))
      map[task.id] = !allPlayed
    })
    return map
  }, [SHIFT_WINDOWS, currentTasks, activeEmployees, getEffectiveTasksByWindowForDateKey, newBadgeTaskState, tick])

  const showUpdatedRequirementsBadgeByTaskId = useMemo(() => {
    const nowMs = new Date(tick).getTime()
    const UPDATED_MS = 7 * 24 * 60 * 60 * 1000
    const allDateKeys = Object.keys(newBadgeTaskState).sort()
    const effectiveByDateKeyCache = new Map<string, Record<WindowKey, Task[]>>()
    const participantsCache = new Map<string, Set<string>>()

    const getEffectiveCached = (dateKey: string) => {
      let cached = effectiveByDateKeyCache.get(dateKey)
      if (!cached) {
        cached = getEffectiveTasksByWindowForDateKey(dateKey)
        effectiveByDateKeyCache.set(dateKey, cached)
      }
      return cached
    }

    const getParticipantsCached = (dateKey: string, shift: 'day' | 'night') => {
      const cacheKey = `${dateKey}:${shift}`
      let cached = participantsCache.get(cacheKey)
      if (!cached) {
        cached = computeShiftHudParticipantsForState(newBadgeTaskState, dateKey, shift, SHIFT_WINDOWS)
        participantsCache.set(cacheKey, cached)
      }
      return cached
    }

    const dateKeysSinceMs = (sinceMs: number) => {
      const minKey = formatDateKey(new Date(sinceMs))
      return allDateKeys.filter((k) => k >= minKey)
    }

    const qualifyingTasks = currentTasks.filter((task) => {
      const updatedAtMs = task.requirementsUpdatedAtMs
      return task.requirementsOverridden && typeof updatedAtMs === 'number' && nowMs <= updatedAtMs + UPDATED_MS
    })

    const map: Record<string, boolean> = {}
    if (qualifyingTasks.length === 0) {
      currentTasks.forEach((task) => {
        map[task.id] = false
      })
      return map
    }

    const didEmployeePlayShiftWithTaskSince = (employeeName: string, taskId: string, sinceMs: number): boolean => {
      const dateKeys = dateKeysSinceMs(sinceMs)
      for (let di = 0; di < dateKeys.length; di++) {
        const dateKey = dateKeys[di]
        const effectiveByWindow = getEffectiveCached(dateKey)
        for (const shift of ['day', 'night'] as const) {
          const windows = SHIFT_WINDOWS[shift]
          let qualifies = false
          for (let wi = 0; wi < windows.length; wi++) {
            const wKey = windows[wi]
            if (!effectiveByWindow[wKey]?.some((t) => t.id === taskId)) continue
            const closeMs = windowCloseMsForDateKey(dateKey, wKey)
            if (sinceMs <= closeMs) {
              qualifies = true
              break
            }
          }
          if (!qualifies) continue

          const participants = getParticipantsCached(dateKey, shift)
          if (participants.has(employeeName)) return true
        }
      }
      return false
    }

    currentTasks.forEach((task) => {
      const updatedAtMs = task.requirementsUpdatedAtMs
      if (!task.requirementsOverridden || typeof updatedAtMs !== 'number') {
        map[task.id] = false
        return
      }
      if (nowMs > updatedAtMs + UPDATED_MS) {
        map[task.id] = false
        return
      }
      const allPlayed = activeEmployees.every((emp) => didEmployeePlayShiftWithTaskSince(emp, task.id, updatedAtMs))
      map[task.id] = !allPlayed
    })
    return map
  }, [SHIFT_WINDOWS, currentTasks, activeEmployees, getEffectiveTasksByWindowForDateKey, newBadgeTaskState, tick, windowCloseMsForDateKey])

  // Trigger pulse on the next incomplete task after completing one
  const triggerNextTaskPulse = useCallback((completedTaskId: string, updatedState: TaskState) => {
    if (prefersReducedMotion) return
    
    // Find the next incomplete task in order after the completed one
    let foundCompleted = false
    for (const task of currentTasks) {
      if (task.id === completedTaskId) {
        foundCompleted = true
        continue
      }
      if (foundCompleted) {
        const completion = updatedState[selectedDateKey]?.[selectedWindow]?.[task.id]
        const status = effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, isSoloModeActiveForWindow(selectedDateKey, selectedWindow))
        if (status !== 'done') {
          setPulseTaskId(task.id)
          return
        }
      }
    }
    // If no task after, wrap around to find first incomplete
    for (const task of currentTasks) {
      if (task.id === completedTaskId) break
      const completion = updatedState[selectedDateKey]?.[selectedWindow]?.[task.id]
      const status = effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, isSoloModeActiveForWindow(selectedDateKey, selectedWindow))
      if (status !== 'done') {
        setPulseTaskId(task.id)
        return
      }
    }
  }, [currentTasks, now, prefersReducedMotion, selectedDate, selectedDateKey, selectedWindow])

  const taskProgress = useMemo(() => {
    const total = currentTasks.length
    if (total === 0) return { total: 0, resolved: 0, percent: 0 }

    let resolved = 0
    for (let i = 0; i < currentTasks.length; i++) {
      const task = currentTasks[i]
      const status = statusByTask[task.id]?.status ?? 'pending'
      // Only count actually completed tasks. Late/missing should not inflate progress.
      if (status === 'done') resolved++
    }

    const percent = Math.round((resolved / total) * 100)
    return { total, resolved, percent }
  }, [currentTasks, statusByTask])

  /** Inline `WindowCompleteCelebration` (post-evacuation cinematic), not the task grid. */
  const showInlineWindowCelebration = useMemo(
    () =>
      !!windowCompleteCelebration &&
      (taskProgress.percent === 100 || windowCompleteBetaPreview || splitAutoCelebration) &&
      windowCompleteCelebration.phase !== 'evacuate',
    [windowCompleteCelebration, taskProgress.percent, windowCompleteBetaPreview, splitAutoCelebration],
  )

  /** Bottom daily-task nudge 10s after window-complete AI copy finishes typing (`WindowCompleteCelebration`). */
  const FLOATING_DAILY_AFTER_AI_TYPING_MS = 10_000
  /** If no AI message ever arrives, still allow the nudge so the shift is not stuck. */
  const FLOATING_DAILY_IF_NO_AI_MESSAGE_MS = 60_000
  const [floatingDailyTaskDelayReady, setFloatingDailyTaskDelayReady] = useState(false)
  const floatingDailyTaskDelayTimeoutRef = useRef<number | null>(null)

  const clearFloatingDailyTaskDelayTimeout = useCallback(() => {
    if (floatingDailyTaskDelayTimeoutRef.current != null) {
      window.clearTimeout(floatingDailyTaskDelayTimeoutRef.current)
      floatingDailyTaskDelayTimeoutRef.current = null
    }
  }, [])

  const onWindowCompleteAiTypingFinished = useCallback(() => {
    clearFloatingDailyTaskDelayTimeout()
    floatingDailyTaskDelayTimeoutRef.current = window.setTimeout(() => {
      floatingDailyTaskDelayTimeoutRef.current = null
      setFloatingDailyTaskDelayReady(true)
    }, FLOATING_DAILY_AFTER_AI_TYPING_MS)
  }, [clearFloatingDailyTaskDelayTimeout])

  useEffect(() => {
    clearFloatingDailyTaskDelayTimeout()
    if (!showInlineWindowCelebration) {
      setFloatingDailyTaskDelayReady(false)
      return
    }
    setFloatingDailyTaskDelayReady(false)
  }, [showInlineWindowCelebration, clearFloatingDailyTaskDelayTimeout])

  useEffect(() => {
    if (!showInlineWindowCelebration || !windowCompleteCelebration) return
    if (windowCompleteCelebration.completionMessage?.trim()) return
    const t = window.setTimeout(() => {
      setFloatingDailyTaskDelayReady(true)
    }, FLOATING_DAILY_IF_NO_AI_MESSAGE_MS)
    return () => window.clearTimeout(t)
  }, [showInlineWindowCelebration, windowCompleteCelebration?.completionMessage])

  const windowCompleteMessageKey = useMemo(() => {
    if (!windowCompleteCelebration || taskProgress.percent !== 100) return null
    const w = windowCompleteCelebration
    const parts = w.players.map((pl) =>
      `${pl.name}:${(pl.tiles || []).map((t) => t.taskId).sort().join(',')}`,
    )
    return `${selectedDateKey}\u0001${selectedWindow}\u0001${w.layout ?? 'pair'}\u0001${parts.join('||')}`
  }, [
    windowCompleteCelebration?.players,
    windowCompleteCelebration?.layout,
    selectedDateKey,
    selectedWindow,
    taskProgress.percent,
  ])

  useLayoutEffect(() => {
    lastKnownWindowCompleteMessageKeyRef.current = windowCompleteMessageKey
  }, [windowCompleteMessageKey])

  useLayoutEffect(() => {
    windowCompleteCelebrationRef.current = windowCompleteCelebration
  }, [windowCompleteCelebration])

  useEffect(() => {
    if (!windowCompleteMessageKey) {
      lastWindowCompleteAiFetchKeyRef.current = null
      return
    }
    const celebration = windowCompleteCelebrationRef.current
    if (!celebration) return

    const key = windowCompleteMessageKey
    const cached = windowCompleteCompletionMessageByKeyRef.current.get(key)?.trim()

    if (cached && !celebration.completionMessage?.trim()) {
      lastWindowCompleteAiFetchKeyRef.current = key
      setWindowCompleteCelebration((prev) => (prev ? { ...prev, completionMessage: cached } : null))
      return
    }

    if (celebration.completionMessage?.trim()) {
      lastWindowCompleteAiFetchKeyRef.current = key
      return
    }

    if (lastWindowCompleteAiFetchKeyRef.current === key) return
    lastWindowCompleteAiFetchKeyRef.current = key

    const ctx = buildWindowCompleteMessageContext({
      celebration,
      windowKey: selectedWindow,
      timeOfDay,
      deploymentChannel,
    })

    let cancelled = false
    fetchWindowCompleteMessage(ctx).then((res) => {
      const msg = (res.message ?? '').trim()
      if (msg) windowCompleteCompletionMessageByKeyRef.current.set(key, msg)
      if (cancelled) return
      setWindowCompleteCelebration((prev) => {
        if (!prev) return null
        return { ...prev, completionMessage: res.message }
      })
    })
    return () => {
      cancelled = true
    }
  }, [windowCompleteMessageKey, deploymentChannel, selectedWindow, timeOfDay])

  const screensaverGreetingProps = useMemo(() => {
    const countdownActive =
      screensaverBetaDemoOverride?.kind === 'countdown' || (!screensaverBetaDemoOverride && !!screensaverCountdown)
    if (!screensaverOpen) {
      return {
        headline: null as string | null,
        quote: null as string | null,
        showAiBadge: false,
        attributionBelowQuote: false,
      }
    }
    if (countdownActive) {
      return { headline: null, quote: null, showAiBadge: false, attributionBelowQuote: false }
    }
    if (screensaverBetaDemoOverride?.kind === 'quote') {
      return {
        headline: null,
        quote: screensaverBetaDemoOverride.line,
        showAiBadge: false,
        attributionBelowQuote: false,
      }
    }
    if (isAiBackedShiftQuote(aiShiftContent) && aiShiftContent) {
      return {
        headline: aiShiftContent.greeting.trim() || getGreeting(timeOfDay),
        quote: aiShiftContent.quote,
        showAiBadge: true,
        attributionBelowQuote: false,
      }
    }
    const sq = SPEAKER_QUOTES[screensaverSessionId % SPEAKER_QUOTES.length]
    return {
      headline: sq.speaker,
      quote: sq.quote,
      showAiBadge: false,
      attributionBelowQuote: true,
    }
  }, [
    screensaverOpen,
    screensaverBetaDemoOverride,
    screensaverCountdown,
    aiShiftContent,
    timeOfDay,
    screensaverSessionId,
  ])

  const computeWindowTaskPercent = useCallback(
    (state: TaskState): number => {
      const total = currentTasks.length
      if (total === 0) return 0
      let resolved = 0
      for (let i = 0; i < currentTasks.length; i++) {
        const task = currentTasks[i]
        const completion = state[selectedDateKey]?.[selectedWindow]?.[task.id]
        const status = effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, isSoloModeActiveForWindow(selectedDateKey, selectedWindow))
        if (status === 'done') resolved++
      }
      return Math.round((resolved / total) * 100)
    },
    [currentTasks, selectedDate, selectedWindow, selectedDateKey, now]
  )

  const computeCurrentWindowParticipants = useCallback(
    (state: TaskState): string[] => {
      const set = new Set<string>()
      for (let i = 0; i < currentTasks.length; i++) {
        const task = currentTasks[i]
        const completion = state[selectedDateKey]?.[selectedWindow]?.[task.id]
        const status = effectiveStatus(selectedDate, selectedWindow, completion, now, task.id, isSoloModeActiveForWindow(selectedDateKey, selectedWindow))
        if (status !== 'done') continue
        const assignees = completion?.assignees || []
        for (let ai = 0; ai < assignees.length; ai++) {
          const name = (assignees[ai] || '').trim()
          if (name) set.add(name)
        }
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    },
    [currentTasks, now, selectedDate, selectedDateKey, selectedWindow]
  )

  // Auto-finish: when both players have completed everything the split assigned, play the
  // panel fly-out, then hand off to the standard "Shift Complete" celebration. The fair-split
  // contract is intentionally NOT deleted so the HUD/celebration stay at exactly 50/50.
  useEffect(() => {
    if (!allSplitSuggestedComplete) {
      splitAutoFinishStartedRef.current = false
      if (splitAutoFinishTimerRef.current != null) {
        window.clearTimeout(splitAutoFinishTimerRef.current)
        splitAutoFinishTimerRef.current = null
      }
      return
    }
    if (splitAutoFinishStartedRef.current) return
    splitAutoFinishStartedRef.current = true

    const viewKey = `${selectedDateKey}:${selectedWindow}`
    const stateSnapshot = taskState
    const windowLabel = getWindowLabel(selectedDate, selectedWindow)
    setSplitEvacuating(true)

    splitAutoFinishTimerRef.current = window.setTimeout(() => {
      splitAutoFinishTimerRef.current = null
      taskSplitCompletedKeyRef.current = viewKey
      setSplitEvacuating(false)
      setTaskSplitInlinePhase(null)
      setTaskSplitResult(null)
      setSplitAutoCelebration(true)
      const participants = computeCurrentWindowParticipants(stateSnapshot)
      startWindowCompleteCelebration({
        state: stateSnapshot,
        windowLabel,
        participants,
        skipEvacuation: true,
      })
    }, SPLIT_AUTO_FINISH_EVAC_MS)
  }, [
    allSplitSuggestedComplete,
    selectedDateKey,
    selectedWindow,
    selectedDate,
    taskState,
    computeCurrentWindowParticipants,
    startWindowCompleteCelebration,
  ])

  const triggerBetaWindowCompleteAnimation = useCallback(() => {
    windowCompleteBetaPreviewRef.current = true
    setWindowCompleteBetaPreview(true)
    setPendingBetaWindowCompleteSeed(true)
    if (!isDemoDaySelected) {
      startRandomDemoDay()
    }
  }, [
    isDemoDaySelected,
    startRandomDemoDay,
  ])

  useEffect(() => {
    if (!pendingBetaWindowCompleteSeed) return
    if (!isDemoDaySelected) return
    if (currentTasks.length === 0) {
      setPendingBetaWindowCompleteSeed(false)
      return
    }

    const randomFrom = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
    const employeePool = Array.from(new Set(activeEmployees.map((e) => e.trim()).filter(Boolean)))
    const shuffledPool = [...employeePool].sort(() => Math.random() - 0.5)
    const p1 = shuffledPool[0] || 'Player 1'
    const p2 = shuffledPool.find((name) => name !== p1) || shuffledPool[1] || 'Player 2'
    const participants = [p1, p2]
    const completionTime = new Date().toISOString()
    const windowPatch: Record<string, TaskCompletion> = {}

    currentTasks.forEach((task) => {
      const assignee = randomFrom(participants)
      const completion: TaskCompletion = {
        status: 'done',
        assignees: [assignee],
        completedAt: completionTime,
        assignedByAdmin: true,
      }
      if (task.id === 'ice-5pm' || task.id === 'ice-close') {
        completion.iceSides = { left: assignee, right: assignee }
      }
      if (task.id === 'towels' || task.id === 'towels-5pm' || task.id === 'towels-close') {
        completion.towelSides = { diningBar: assignee, bowlStation: assignee }
      }
      windowPatch[task.id] = completion
    })

    const nextState: TaskState = {
      ...taskState,
      [selectedDateKey]: {
        ...(taskState[selectedDateKey] || {}),
        [selectedWindow]: {
          ...((taskState[selectedDateKey] && taskState[selectedDateKey][selectedWindow]) || {}),
          ...windowPatch,
        },
      },
    }

    setTaskState(nextState)
    const windowLabel = getWindowLabel(selectedDate, selectedWindow)
    startWindowCompleteCelebration({
      state: nextState,
      windowLabel,
      participants,
      waitForStars: false,
    })
    setPendingBetaWindowCompleteSeed(false)
  }, [
    currentTasks,
    activeEmployees,
    getWindowLabel,
    isDemoDaySelected,
    pendingBetaWindowCompleteSeed,
    selectedDate,
    selectedDateKey,
    selectedWindow,
    startWindowCompleteCelebration,
    taskState,
  ])

  useEffect(() => {
    const betaPreviewActive =
      windowCompleteBetaPreviewRef.current || windowCompleteBetaPreview

    if (taskProgress.percent !== 100) {
      if (!betaPreviewActive) {
        windowCompleteStartScheduledRef.current = false
        if (windowCompleteStartTimeoutRef.current) {
          window.clearTimeout(windowCompleteStartTimeoutRef.current)
          windowCompleteStartTimeoutRef.current = null
        }
        clearWindowCompletePhaseTimeouts()
        if (taskGridCelebrating) setTaskGridCelebrating(false)
        setWindowCompleteStageCollapse(false)
        if (windowCompleteCelebration) setWindowCompleteCelebration(null)
      }
      return
    }

    windowCompleteBetaPreviewRef.current = false
    setWindowCompleteBetaPreview(false)

    if (!windowCompleteCelebration) {
      if (windowCompleteStartTimeoutRef.current || windowCompleteStartScheduledRef.current) return
      const participants = computeCurrentWindowParticipants(taskState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      const model = buildWindowCompleteCelebration({ state: taskState, windowLabel, participants })
      setTaskGridCelebrating(false)
      setWindowCompleteCelebration({ ...model, phase: 'settle' })
    }
  }, [
    buildWindowCompleteCelebration,
    clearWindowCompletePhaseTimeouts,
    computeCurrentWindowParticipants,
    getWindowLabel,
    selectedDate,
    selectedWindow,
    taskGridCelebrating,
    taskProgress.percent,
    taskState,
    windowCompleteBetaPreview,
    windowCompleteCelebration,
  ])

  useEffect(() => {
    const key = `${selectedDateKey}:${selectedWindow}`
    if (windowCompleteScopeKeyRef.current === null) {
      windowCompleteScopeKeyRef.current = key
      return
    }
    if (windowCompleteScopeKeyRef.current === key) return
    windowCompleteScopeKeyRef.current = key
    if (pendingBetaWindowCompleteSeed) return
    windowCompleteBetaPreviewRef.current = false
    setWindowCompleteBetaPreview(false)
    if (windowCompleteStartTimeoutRef.current) {
      window.clearTimeout(windowCompleteStartTimeoutRef.current)
      windowCompleteStartTimeoutRef.current = null
    }
    clearWindowCompletePhaseTimeouts()
    setTaskGridCelebrating(false)
    setWindowCompleteStageCollapse(false)
    lastWindowCompleteAiFetchKeyRef.current = null
    setWindowCompleteCelebration(null)
  }, [clearWindowCompletePhaseTimeouts, pendingBetaWindowCompleteSeed, selectedDateKey, selectedWindow])

  // Helper to protect Firestore writes from hanging UI forever.
  const withTimeout = <T,>(p: Promise<T>, timeoutMs: number = 8000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const id = window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
      p.then((v) => {
        window.clearTimeout(id)
        resolve(v)
      }).catch((e) => {
        window.clearTimeout(id)
        reject(e)
      })
    })
  }

  /**
   * Beta hosting: seed a minimal two-person break plan so 🎲 testing works without manual setup.
   * Must stay synchronous: awaiting Firestore before opening a task lets iOS deliver a delayed click
   * to whatever moved under the finger. Demo day mirrors saveBreakPlan: demo map + breakSelectionState.
   */
  const seedBetaDiceTestShiftPlanIfNeeded = useCallback(() => {
    if (deploymentChannel !== 'beta') return
    const slots = breakSelection?.slots || []
    if (slots.length >= 2) {
      const e0 = (slots[0]?.employee || '').trim()
      const e1 = (slots[1]?.employee || '').trim()
      if (e0 && e1 && e0 !== e1) return
    }
    if (shiftHudLeaders.length >= 2) {
      const e0 = (shiftHudLeaders[0]?.name || '').trim()
      const e1 = (shiftHudLeaders[1]?.name || '').trim()
      if (e0 && e1 && e0 !== e1) return
    }
    const trimmed = activeEmployees.map((x) => String(x || '').trim()).filter(Boolean)
    const withColor = trimmed.filter((n) => employeeColors[n])
    const pool = withColor.length >= 2 ? withColor : trimmed
    if (pool.length < 2) return
    const shuffled = shuffleInPlaceTaskSplitVariants([...pool])
    const a = shuffled[0]!
    const b = shuffled[1]!
    const selection: BreakSelection = {
      slots: [
        { employee: a, shiftType: 'lunch', start: '13:00', durationMin: 30 },
        { employee: b, shiftType: 'lunch', start: '14:00', durationMin: 30 },
      ],
      updatedAt: new Date().toISOString(),
    }
    flushSync(() => {
      if (isDemoDaySelected) {
        setDemoBreakSelectionByDateKey((prev) => ({ ...prev, [selectedDateKey]: selection }))
      }
      setBreakSelectionState({ dateKey: selectedDateKey, value: selection })
    })
    void withTimeout(persistBreakSelectionOrNoop(selectedDateKey, selection), 8000).catch((e) => {
      console.warn('[beta] dice: could not persist seeded break plan:', e)
    })
  }, [
    breakSelection?.slots,
    deploymentChannel,
    employeeColors,
    employees,
    isDemoDaySelected,
    persistBreakSelectionOrNoop,
    selectedDateKey,
    shiftHudLeaders,
  ])

  const BREAK_WINDOW_START_MIN = 13 * 60 // 1:00 PM
  const BREAK_WINDOW_END_MIN = 16 * 60 // 4:00 PM
  const BREAK_STEP_MIN = 30

  const breakStartOptionsForShift = (shiftType: BreakShiftType): string[] => {
    const duration = breakDurationForShift(shiftType)
    const lastStart = BREAK_WINDOW_END_MIN - duration
    const opts: string[] = []
    for (let t = BREAK_WINDOW_START_MIN; t <= lastStart; t += BREAK_STEP_MIN) {
      opts.push(minutesToTime(t))
    }
    return opts
  }

  const breakEndTimeForSlot = (slot: BreakSlot): string => {
    const start = timeToMinutes(slot.start)
    return minutesToTime(start + slot.durationMin)
  }

  const setBreakDraftField = (idx: number, patch: Partial<{ employee: string; shiftType: '' | BreakShiftType; start: string }>) => {
    setBreakDraftSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
    setBreakDraftDirtyByDateKey((prev) => ({ ...prev, [selectedDateKey]: true }))
  }

  const closeBreakWizard = () => {
    setBreakWizardSlotIdx(null)
    setBreakWizardStep(null)
  }

  const openBreakWizard = (idx: 0 | 1) => {
    const locked = !canEditTaskAssignmentsOnSelectedDate || isInitialSyncing || isSaving
    if (locked) return
    if (activeTaskId !== 'break-selection') return

    const d = breakDraftSlots[idx]
    const step: BreakWizardStep = !d?.employee ? 'employee' : !d?.shiftType ? 'shift' : !d?.start ? 'time' : 'time'
    setBreakWizardSlotIdx(idx)
    setBreakWizardStep(step)
  }

  const breakWizardBack = () => {
    if (breakWizardStep === null) return
    if (breakWizardStep === 'employee') {
      closeBreakWizard()
      return
    }
    if (breakWizardStep === 'shift') {
      setBreakWizardStep('employee')
      return
    }
    if (breakWizardStep === 'time') {
      setBreakWizardStep('shift')
      return
    }
  }

  const pickBreakWizardEmployee = (idx: 0 | 1, employee: string) => {
    const locked = !canEditTaskAssignmentsOnSelectedDate || isInitialSyncing || isSaving
    if (locked) return

    const otherIdx: 0 | 1 = idx === 0 ? 1 : 0
    if (breakDraftSlots[otherIdx]?.employee === employee) return

    // Check if employee needs to select a color first
    if (!employeeColorsRef.current[employee]) {
      setPendingColorEmployee(employee)
      setPendingColorAction('break')
      setPendingBreakWizardIdx(idx)
      setShowColorPicker(true)
      return
    }

    setBreakDraftField(idx, { employee })
    const d = breakDraftSlots[idx]
    const nextStep: BreakWizardStep | null = !d?.shiftType ? 'shift' : !d?.start ? 'time' : null
    if (nextStep) setBreakWizardStep(nextStep)
    else closeBreakWizard()
  }

  const pickBreakWizardShift = (idx: 0 | 1, nextShift: BreakShiftType) => {
    const locked = !canEditTaskAssignmentsOnSelectedDate || isInitialSyncing || isSaving
    if (locked) return
    const d = breakDraftSlots[idx]
    if (!d?.employee) return

    const opts = breakStartOptionsForShift(nextShift)
    const keepStart = d.start && opts.includes(d.start)
    setBreakDraftField(idx, { shiftType: nextShift, start: keepStart ? d.start : '' })
    setBreakWizardStep('time')
  }

  const pickBreakWizardTime = (idx: 0 | 1, t: string) => {
    const locked = !canEditTaskAssignmentsOnSelectedDate || isInitialSyncing || isSaving
    if (locked) return
    const d = breakDraftSlots[idx]
    if (!d?.shiftType) return

    setBreakDraftField(idx, { start: t })
    closeBreakWizard()
  }

  // When both employees are working doubles (both 1-hr breaks), we defer certain 5PM tasks to Close.
  // Critical: ensure the deferred 5PM task completion docs actually exist (so they never go "late" at 5PM),
  // even if the device is briefly offline when Break Selection is saved.
  const ensureDeferredFivePmTasksForDoubleShift = useCallback(
    async (
      dateKey: string,
      taskDate: Date,
      slots: BreakSlot[],
      opts?: { reason?: string; surfaceErrors?: boolean }
    ): Promise<{ attempted: number; failed: number }> => {
      const reason = opts?.reason || 'ensure'
      const surfaceErrors = opts?.surfaceErrors === true

      // Today-only safety: never retroactively create/modify past days from background logic.
      if (!isTodaySelected || dateKey !== selectedDateKey) return { attempted: 0, failed: 0 }

      if (!Array.isArray(slots) || slots.length < 2) return { attempted: 0, failed: 0 }
      const e0 = String(slots[0]?.employee || '').trim()
      const e1 = String(slots[1]?.employee || '').trim()
      if (!e0 || !e1 || e0 === e1) return { attempted: 0, failed: 0 }
      if (!slots.every((s) => s?.shiftType === 'double')) return { attempted: 0, failed: 0 }

      const dayOfWeek = taskDate.getDay()
      const closeTime = dayOfWeek === 5 || dayOfWeek === 6 ? '10' : '9'
      const deferredAssignees: [string, string] = [e0, e1]
      const deferredTaskIds = ['count-drawer', 'blue-bag-count', 'split-tips', 'order-report-5pm'] as const

      const writes: Promise<void>[] = []
      let attempted = 0

      for (const taskId of deferredTaskIds) {
        const existing = taskState[dateKey]?.['17']?.[taskId]

        // If already completed, don't overwrite (especially important if staff already entered real Order Report totals).
        if (existing?.status === 'done') continue

        attempted++

        const isOrderReport = taskId === 'order-report-5pm'
        const completion: TaskCompletion = {
          status: 'done',
          assignees: deferredAssignees,
          completedAt: new Date().toISOString(),
          assignedByAdmin: false,
          completedLate: false,
          lateForgiven: false,
          completedEarly: false,
          deferredToClose: closeTime,
          ...(isOrderReport
            ? {
                // Default 1 each so it never appears as unselected/late at 5PM.
                orderReportCounts: { [deferredAssignees[0]]: 1, [deferredAssignees[1]]: 1 },
              }
            : {}),
        }

        // Optimistically reflect locally so the UI doesn't flip to "late" while syncing.
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const day = { ...(next[dateKey] ?? {}) }
          const w17 = { ...(day['17'] ?? {}) }
          w17[taskId] = completion
          day['17'] = w17
          next[dateKey] = day
          return next
        })

        const p = withTimeout(
          persistCompleteTaskIfAvailableOrNoop({
            dateKey,
            windowKey: '17',
            taskId,
            completion: {
              assignees: completion.assignees,
              completedAt: completion.completedAt,
              assignedByAdmin: completion.assignedByAdmin,
              completedLate: completion.completedLate,
              lateForgiven: completion.lateForgiven,
              completedEarly: completion.completedEarly,
              deferredToClose: completion.deferredToClose,
              orderReportCounts: completion.orderReportCounts,
            },
          }),
          8000
        ).catch((err) => {
          // If someone else already created it, treat as success.
          if (err instanceof Error && err.message === 'already-completed') return
          throw err
        })
        writes.push(p)
      }

      if (!writes.length) return { attempted, failed: 0 }

      const settled = await Promise.allSettled(writes)
      const failed = settled.filter((r) => r.status === 'rejected').length
      if (failed) {
        console.warn('Deferred 5PM auto-complete failed:', { reason, failed, attempted })
        if (surfaceErrors) {
          setSaveError(
            'Break plan saved, but auto-defer tasks failed to sync. Check connection; 5PM tasks may show late until sync completes.'
          )
        }
      }

      return { attempted, failed }
    },
    [isTodaySelected, persistCompleteTaskIfAvailableOrNoop, selectedDateKey, setTaskState, taskState, withTimeout]
  )

  // When Break Selection changes from both Double to NOT both Double, undo any previously
  // auto-created deferred 5PM task completions (so they become normal/incomplete again).
  const clearDeferredFivePmTasksIfNeeded = useCallback(
    async (dateKey: string, opts?: { reason?: string; surfaceErrors?: boolean }): Promise<{ attempted: number; failed: number }> => {
      const reason = opts?.reason || 'clear'
      const surfaceErrors = opts?.surfaceErrors === true

      // Today-only safety: never retroactively modify past days from background logic.
      if (!isTodaySelected || dateKey !== selectedDateKey) return { attempted: 0, failed: 0 }

      const deferredTaskIds = ['count-drawer', 'blue-bag-count', 'split-tips', 'order-report-5pm'] as const
      const deletes: Promise<void>[] = []
      let attempted = 0

      for (const taskId of deferredTaskIds) {
        const taskCompletion = taskState[dateKey]?.['17']?.[taskId]
        // Only clear tasks that were auto-created with deferredToClose (never delete real staff-entered data).
        if (!taskCompletion?.deferredToClose) continue

        attempted++

        // Optimistically remove from local state so the UI updates immediately.
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[dateKey] ?? {}) }
          const windowMap = { ...(dateMap['17'] ?? {}) }
          delete windowMap[taskId]
          dateMap['17'] = windowMap
          next[dateKey] = dateMap
          return next
        })

        const p = withTimeout(
          persistAdminClearTaskCompletionOrNoop(dateKey, '17', taskId),
          8000
        ).catch((err) => {
          // If someone else already deleted it, treat as success.
          if (err instanceof Error && err.message === 'already-completed') return
          throw err
        })
        deletes.push(p)
      }

      if (!deletes.length) return { attempted, failed: 0 }

      const settled = await Promise.allSettled(deletes)
      const failed = settled.filter((r) => r.status === 'rejected').length
      if (failed) {
        console.warn('Clear deferred 5PM tasks failed:', { reason, failed, attempted })
        if (surfaceErrors) {
          setSaveError(
            'Break plan saved, but failed to undo deferred 5PM tasks. Check connection; tasks may still show "Will be counted at 9PM" until sync completes.'
          )
        }
      }

      return { attempted, failed }
    },
    [isTodaySelected, persistAdminClearTaskCompletionOrNoop, selectedDateKey, setTaskState, taskState, withTimeout]
  )

  // Today-only self-heal: if Break Selection indicates both are doubles but the deferred 5PM tasks
  // didn't successfully sync (offline/timeout), re-attempt creation when viewing the 5PM window.
  const lastDeferredEnsureMsRef = useRef<number>(0)
  useEffect(() => {
    if (!isTodaySelected) return
    if (selectedWindow !== '17') return
    // Belt-and-suspenders: refuse to act unless breakSelectionState is tagged for the selected date.
    // Prevents acting on a stale snapshot captured during a date-navigation render (which could
    // otherwise seed today's deferred 5PM docs with yesterday's assignees).
    if (!breakSelectionState || breakSelectionState.dateKey !== selectedDateKey) return
    const slots = breakSelectionState.value?.slots || []
    if (!Array.isArray(slots) || slots.length < 2) return
    if (!slots.every((s) => s?.shiftType === 'double')) return

    const existing = taskState[selectedDateKey]?.['17']?.['order-report-5pm']
    if (existing?.status === 'done') return

    const nowMs = Date.now()
    // Throttle to avoid hammering Firestore during poor connectivity.
    if (nowMs - (lastDeferredEnsureMsRef.current || 0) < 30_000) return

    void ensureDeferredFivePmTasksForDoubleShift(selectedDateKey, selectedDate, slots, {
      reason: 'enter-5pm-window',
      surfaceErrors: false,
    })
    // Only mark the throttle after we've actually decided to fire so early returns don't
    // poison the next 30s of legitimate retries.
    lastDeferredEnsureMsRef.current = nowMs
  }, [breakSelectionState, ensureDeferredFivePmTasksForDoubleShift, isTodaySelected, selectedDate, selectedDateKey, selectedWindow, taskState])

  // Today-only reconciliation: heal days that previously got seeded with the wrong employees
  // (e.g. pre-fix staleness bug). If today's loaded break plan is NOT both-doubles, OR its
  // assignees disagree with what's stored on the 4 deferred 5PM completions, clear the
  // deferred docs so today's staff can complete them normally (or so the self-heal effect
  // can re-create them with today's real employees).
  const lastReconcileDeferredMsRef = useRef<number>(0)
  useEffect(() => {
    if (!isTodaySelected) return
    if (!breakSelectionState || breakSelectionState.dateKey !== selectedDateKey) return
    const plan = breakSelectionState.value
    // Without a loaded plan we can't tell if the deferred docs are stale; leave them alone.
    if (!plan) return

    const slots = plan.slots || []
    const planEmployees = slots.map((s) => (s?.employee || '').trim()).filter(Boolean)
    const bothDoubles =
      slots.length >= 2 && slots.every((s) => s?.shiftType === 'double') && planEmployees.length >= 2

    const deferredTaskIds = ['count-drawer', 'blue-bag-count', 'split-tips', 'order-report-5pm'] as const
    const windowMap = taskState[selectedDateKey]?.['17'] ?? {}

    let mismatch = false
    for (const taskId of deferredTaskIds) {
      const comp = windowMap[taskId]
      if (!comp?.deferredToClose) continue
      if (!bothDoubles) {
        mismatch = true
        break
      }
      const assignees = (comp.assignees || [])
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .slice()
        .sort()
      const expected = planEmployees.slice().sort()
      if (
        assignees.length !== expected.length ||
        assignees.some((a, i) => a !== expected[i])
      ) {
        mismatch = true
        break
      }
    }

    if (!mismatch) return

    const nowMs = Date.now()
    if (nowMs - (lastReconcileDeferredMsRef.current || 0) < 30_000) return
    lastReconcileDeferredMsRef.current = nowMs

    void clearDeferredFivePmTasksIfNeeded(selectedDateKey, {
      reason: 'reconcile-stale-defer',
      surfaceErrors: false,
    })
  }, [breakSelectionState, clearDeferredFivePmTasksIfNeeded, isTodaySelected, selectedDateKey, taskState])

  const applySoloOrderReportAutoWaives = useCallback(
    async (dateKey: string, stateSnapshot: TaskState) => {
      const completedAt = new Date().toISOString()
      const completionBody = makeSoloAutoDidNotNeedCompletionBody(completedAt)
      const orderReportsToPersist = getSoloOrderReportTargetsToWaive(stateSnapshot, dateKey)

      setTaskState((prev) => applySoloOrderReportWaivesToTaskState(prev, dateKey, completedAt))

      for (const t of orderReportsToPersist) {
        const orArgs: CompleteTaskArgs = {
          dateKey,
          windowKey: t.windowKey,
          taskId: t.taskId,
          completion: completionBody,
        }
        try {
          await withTimeout(persistCompleteTaskIfAvailableOrNoop(orArgs), 8000)
        } catch (err) {
          if (err instanceof Error && err.message === 'already-completed') {
            await withTimeout(persistAdminSetTaskCompletionOrNoop(orArgs), 8000)
          } else {
            throw err
          }
        }
      }
    },
    [persistAdminSetTaskCompletionOrNoop, persistCompleteTaskIfAvailableOrNoop, withTimeout]
  )

  const clearSoloOrderReportAutoWaives = useCallback(
    async (dateKey: string, stateSnapshot: TaskState) => {
      const toPersistClear = getSoloOrderReportTargetsToClear(stateSnapshot, dateKey)
      setTaskState((prev) => clearSoloOrderReportWaivesFromTaskState(prev, dateKey))
      if (toPersistClear.length > 0) {
        await Promise.all(
          toPersistClear.map(({ windowKey, taskId }) =>
            withTimeout(persistAdminClearTaskCompletionOrNoop(dateKey, windowKey, taskId), 8000)
          )
        )
      }
    },
    [persistAdminClearTaskCompletionOrNoop, withTimeout]
  )

  const setSoloModeActive = async (nextActive: boolean) => {
    if (!canEditTaskAssignmentsOnSelectedDate) return
    if (isInitialSyncing || isSaving) return
    if (nextActive) {
      const ok = window.confirm(
        'Are you sure you want to activate Solo Mode?\n\n' +
          'Solo Mode means only one person is working this shift. Day shift tasks (11AM and 5PM) can be completed late without penalty, and leaderboard points are capped at 70.\n\n' +
          'Break Selection and both Order Report tasks (5PM + close) will be marked as didn’t need to complete when they aren’t already filled in.\n\n' +
          'Undo on Break Selection turns Solo Mode off and clears those auto-waived tasks.'
      )
      if (!ok) return
    }

    setSaveError(null)
    setIsSaving(true)
    const nextMode: SoloMode | null = nextActive
      ? {
          active: true,
          activatedAt: new Date().toISOString(),
          ...(soloMode?.nightActive
            ? { nightActive: true, nightActivatedAt: soloMode.nightActivatedAt }
            : {}),
        }
      : soloMode?.nightActive
        ? {
            active: false,
            activatedAt: soloMode.activatedAt || new Date().toISOString(),
            nightActive: true,
            nightActivatedAt: soloMode.nightActivatedAt || new Date().toISOString(),
          }
        : null

    const dateKey = selectedDateKey
    const breakWindow: WindowKey = '11'
    const breakTaskId = 'break-selection'

    try {
      if (isDemoDaySelected) {
        setDemoSoloModeByDateKey((prev) => ({ ...prev, [selectedDateKey]: nextMode }))
      }
      await withTimeout(persistSoloModeOrNoop(dateKey, nextMode), 8000)
      setSoloMode(nextMode)

      if (nextActive) {
        const completedAt = new Date().toISOString()
        const completion: TaskCompletion = makeSoloAutoDidNotNeedCompletion(completedAt)
        const soloBreakBodyAtComplete = makeSoloAutoDidNotNeedCompletionBody(completedAt)

        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap: Record<WindowKey, Record<string, TaskCompletion>> = { ...(next[dateKey] ?? {}) }
          const wm = { ...(dateMap[breakWindow] ?? {}) }
          wm[breakTaskId] = completion
          dateMap[breakWindow] = wm
          next[dateKey] = dateMap
          return next
        })

        const persistArgs: CompleteTaskArgs = {
          dateKey,
          windowKey: breakWindow,
          taskId: breakTaskId,
          completion: soloBreakBodyAtComplete,
        }
        try {
          await withTimeout(persistCompleteTaskIfAvailableOrNoop(persistArgs), 8000)
        } catch (err) {
          if (err instanceof Error && err.message === 'already-completed') {
            await withTimeout(persistAdminSetTaskCompletionOrNoop(persistArgs), 8000)
          } else {
            throw err
          }
        }

        await applySoloOrderReportAutoWaives(dateKey, taskState)
      } else {
        const toPersistClearBreak = isSoloAutoDidNotNeedPlaceholder(taskState[dateKey]?.[breakWindow]?.[breakTaskId])
          ? [{ w: breakWindow, id: breakTaskId }]
          : []
        setTaskState((prev) => {
          if (toPersistClearBreak.length === 0) return prev
          const next: TaskState = { ...prev }
          const dateMap: Record<WindowKey, Record<string, TaskCompletion>> = { ...(next[dateKey] ?? {}) }
          const wm = { ...(dateMap[breakWindow] ?? {}) }
          delete wm[breakTaskId]
          if (Object.keys(wm).length === 0) {
            delete (dateMap as Partial<Record<WindowKey, Record<string, TaskCompletion>>>)[breakWindow]
          } else {
            dateMap[breakWindow] = wm
          }
          if (Object.keys(dateMap).length === 0) {
            const rest = { ...next }
            delete (rest as Record<string, unknown>)[dateKey]
            return rest as TaskState
          }
          next[dateKey] = dateMap
          return next
        })
        if (toPersistClearBreak.length > 0) {
          await Promise.all(
            toPersistClearBreak.map(({ w, id }) =>
              withTimeout(persistAdminClearTaskCompletionOrNoop(dateKey, w, id), 8000)
            )
          )
        }
        await clearSoloOrderReportAutoWaives(dateKey, taskState)
      }
    } catch (error) {
      console.error('Failed to save solo mode / break selection sync:', error)
      setSaveError(
        nextActive
          ? 'Failed to save solo mode or update Break Selection. Please try again.'
          : 'Failed to turn off solo mode. Please try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const setNightSoloModeActive = async (nextActive: boolean) => {
    if (!canEditTaskAssignmentsOnSelectedDate) return
    if (isInitialSyncing || isSaving) return
    if (nextActive) {
      const ok = window.confirm(
        'Are you sure you want to activate night solo mode?\n\n' +
          'Night shift solo means one person handles 9/10 PM close tasks without splitting. Split-required tasks can be completed alone, and your close shift score is capped at 70.\n\n' +
          'Close Order Report (and 5PM Order Report if still incomplete) will be marked as didn’t need to complete when they aren’t already filled in.'
      )
      if (!ok) return
    }

    setSaveError(null)
    setIsSaving(true)
    const dateKey = selectedDateKey
    const prev = isDemoDaySelected ? demoSoloModeByDateKey[dateKey] ?? null : soloMode
    const nextMode: SoloMode | null = nextActive
      ? {
          active: !!prev?.active,
          activatedAt: prev?.activatedAt || new Date().toISOString(),
          nightActive: true,
          nightActivatedAt: new Date().toISOString(),
          ...(prev?.activatedBy ? { activatedBy: prev.activatedBy } : {}),
        }
      : prev?.active
        ? {
            active: true,
            activatedAt: prev.activatedAt,
            ...(prev.activatedBy ? { activatedBy: prev.activatedBy } : {}),
          }
        : null

    try {
      if (isDemoDaySelected) {
        setDemoSoloModeByDateKey((prevMap) => ({ ...prevMap, [dateKey]: nextMode }))
      }
      await withTimeout(persistSoloModeOrNoop(dateKey, nextMode), 8000)
      setSoloMode(nextMode)

      if (nextActive) {
        await applySoloOrderReportAutoWaives(dateKey, taskState)
      } else if (!prev?.active) {
        await clearSoloOrderReportAutoWaives(dateKey, taskState)
      }
    } catch (error) {
      console.error('Failed to save night solo mode:', error)
      setSaveError(
        nextActive
          ? 'Failed to activate night solo mode. Please try again.'
          : 'Failed to turn off night solo mode. Please try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const completeNightShiftSoloCheck = async (answer: 'yes' | 'no') => {
    if (activeTaskId !== 'night-shift-solo-check') return
    if (!canEditTaskAssignmentsOnSelectedDate) return
    if (isInitialSyncing || isSaving) return
    if (taskState[selectedDateKey]?.[selectedWindow]?.['night-shift-solo-check']) return

    const confirmMsg =
      answer === 'yes'
        ? 'Confirm: Night shift will also be solo (one person), per your manager?'
        : 'Confirm: Night shift will NOT be solo — there is team coverage at night?'
    if (!window.confirm(confirmMsg)) return

    setSaveError(null)
    setIsSaving(true)

    if (answer === 'yes') {
      const dateKey = selectedDateKey
      const prev = isDemoDaySelected ? demoSoloModeByDateKey[dateKey] ?? null : soloMode
      const nextMode: SoloMode = {
        active: !!prev?.active,
        activatedAt: prev?.activatedAt || new Date().toISOString(),
        nightActive: true,
        nightActivatedAt: new Date().toISOString(),
        ...(prev?.activatedBy ? { activatedBy: prev.activatedBy } : {}),
      }
      try {
        if (isDemoDaySelected) {
          setDemoSoloModeByDateKey((prevMap) => ({ ...prevMap, [dateKey]: nextMode }))
        }
        await withTimeout(persistSoloModeOrNoop(dateKey, nextMode), 8000)
        setSoloMode(nextMode)
        await applySoloOrderReportAutoWaives(dateKey, taskState)
      } catch (error) {
        console.error('Failed to save night solo mode from check task:', error)
        setSaveError('Failed to save night solo mode. Please try again.')
        setIsSaving(false)
        return
      }
    }

    const completedAt = new Date().toISOString()
    const completionBody: Omit<TaskCompletion, 'status'> = {
      assignees: [],
      completedAt,
      assignedByAdmin: false,
      completedLate: false,
      lateForgiven: false,
      completedEarly: false,
      autoAssigned: true,
      didNotNeedToComplete: true,
    }
    const completion: TaskCompletion = { status: 'done', ...completionBody }

    try {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap['night-shift-solo-check'] = completion
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        return next
      })
      setActiveTaskId(null)
      await withTimeout(
        persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: 'night-shift-solo-check',
          completion: completionBody,
        }),
        8000
      )
    } catch (error) {
      console.error('Failed to complete night shift solo check:', error)
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        delete windowMap['night-shift-solo-check']
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        return next
      })
      if (error instanceof Error && error.message === 'already-completed') {
        setSaveError('Already completed by someone else.')
      } else {
        setSaveError(
          error instanceof Error && error.message === 'timeout'
            ? 'Save timed out. Check connection.'
            : 'Failed to save. Try again.'
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  const saveBreakPlan = async () => {
    if (activeTaskId !== 'break-selection') return
    if (!canEditTaskAssignmentsOnSelectedDate) return

    setBreakDraftError(null)
    setSaveError(null)

    // Build normalized slots + validate
    const slots: BreakSlot[] = []
    for (let i = 0; i < 2; i++) {
      const d = breakDraftSlots[i]
      if (!d?.employee || !d?.shiftType || !d?.start) {
        setBreakDraftError('Fill both slots: employee, shift type, and start time.')
        return
      }
      // If an admin cleared this employee's color from another device, reprompt before saving.
      if (!employeeColorsRef.current[d.employee]) {
        setPendingColorEmployee(d.employee)
        setPendingColorAction('noop')
        setShowColorPicker(true)
        return
      }
      const durationMin = breakDurationForShift(d.shiftType)
      const startMin = timeToMinutes(d.start)
      const endMin = startMin + durationMin
      if (startMin < BREAK_WINDOW_START_MIN || endMin > BREAK_WINDOW_END_MIN) {
        setBreakDraftError('Break must fit within 1:00 PM–4:00 PM.')
        return
      }
      slots.push({ employee: d.employee, shiftType: d.shiftType, start: d.start, durationMin })
    }

    if (slots[0].employee === slots[1].employee) {
      setBreakDraftError('Select two different employees.')
      return
    }

    const aStart = timeToMinutes(slots[0].start)
    const aEnd = aStart + slots[0].durationMin
    const bStart = timeToMinutes(slots[1].start)
    const bEnd = bStart + slots[1].durationMin
    const overlaps = Math.max(aStart, bStart) < Math.min(aEnd, bEnd)
    if (overlaps) {
      setBreakDraftError('Breaks overlap. Pick non-overlapping times.')
      return
    }

    // Detect if both employees chose 1 hr break (double shift)
    const bothDoubleShift = slots.every(s => s.shiftType === 'double')

    const selection: BreakSelection = { slots, updatedAt: new Date().toISOString() }

    setIsSaving(true)
    try {
      // Demo Day: local-only (no Firestore writes)
      if (isDemoDaySelected) {
        setDemoBreakSelectionByDateKey((prev) => ({ ...prev, [selectedDateKey]: selection }))
      }
      await withTimeout(persistBreakSelectionOrNoop(selectedDateKey, selection), 8000)
      setBreakSelectionState({ dateKey: selectedDateKey, value: selection })
      // Saved plan is now the source of truth; draft is no longer "dirty".
      setBreakDraftDirtyByDateKey((prev) => ({ ...prev, [selectedDateKey]: false }))
      setBreakDraftByDateKey((prev) => {
        if (!prev[selectedDateKey]) return prev
        const { [selectedDateKey]: _, ...rest } = prev
        return rest
      })

      appendSelectionLog({
        action: 'selected',
        taskId: 'break-selection',
        taskName: 'Break Selection',
        window: selectedWindow,
        dateKey: selectedDateKey,
        assignees: [slots[0].employee, slots[1].employee],
        byAdmin: isAdmin,
      })

      // If both employees chose 1 hr break (double shift), auto-complete 5PM tasks
      // that will be deferred to close time (9 or 10 PM)
      if (bothDoubleShift) {
        // Ensure deferred task completion docs exist (await + surface errors instead of failing silently).
        await ensureDeferredFivePmTasksForDoubleShift(selectedDateKey, selectedDate, slots, {
          reason: 'saveBreakPlan',
          surfaceErrors: true,
        })

        // Log (local) that we deferred these tasks (visibility/audit). This does not imply Firestore sync succeeded.
        const deferredAssignees = [slots[0].employee, slots[1].employee]
        const deferredTaskIds = ['count-drawer', 'blue-bag-count', 'split-tips', 'order-report-5pm']
        for (const taskId of deferredTaskIds) {
          const task = allTasks.find((t) => t.id === taskId) || TASKS.find((t) => t.id === taskId)
          appendSelectionLog({
            action: 'selected',
            taskId,
            taskName: task?.name ?? taskId,
            window: '17',
            dateKey: selectedDateKey,
            assignees: deferredAssignees,
            byAdmin: isAdmin,
          })
        }
      } else {
        // If NOT both Double, undo any previously auto-created deferred 5PM completions
        // (so they become normal/incomplete again and stop showing "Will be counted at 9PM").
        await clearDeferredFivePmTasksIfNeeded(selectedDateKey, {
          reason: 'saveBreakPlan-not-double',
          surfaceErrors: true,
        })
      }

      // Mark the task completed (if not already)
      const existingCompletion = taskState[selectedDateKey]?.[selectedWindow]?.['break-selection']
      if (!existingCompletion) {
        const beforeCompletionSnapshot = existingCompletion
        const beforeWindowPercent = computeWindowTaskPercent(taskState)

        let isLate = false
        const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
        isLate = now >= cutoff
        if (isSoloModeActiveForWindow(selectedDateKey, selectedWindow)) {
          isLate = false
        }

        windowCompleteStartScheduledRef.current = true
        const updatedState = await new Promise<TaskState>((resolve) => {
          setTaskState((prev) => {
            const next: TaskState = { ...prev }
            const dateMap = { ...(next[selectedDateKey] ?? {}) }
            const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
            windowMap['break-selection'] = {
              status: 'done',
              assignees: [slots[0].employee, slots[1].employee],
              completedAt: new Date().toISOString(),
              assignedByAdmin: false,
              completedLate: isLate,
              completedEarly: false,
            }
            dateMap[selectedWindow] = windowMap
            next[selectedDateKey] = dateMap
            resolve(next)
            return next
          })
        })

        const afterWindowPercent = computeWindowTaskPercent(updatedState)
        if (beforeWindowPercent < 100 && afterWindowPercent === 100) {
          const participants = computeCurrentWindowParticipants(updatedState)
          const windowLabel = getWindowLabel(selectedDate, selectedWindow)
          startWindowCompleteCelebration({
            state: updatedState,
            windowLabel,
            participants,
          })
        }
        windowCompleteStartScheduledRef.current = false

        setActiveTaskId(null)

        const persist = persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: 'break-selection',
          completion: {
            assignees: [slots[0].employee, slots[1].employee],
            completedAt: new Date().toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: false,
          },
        })

        Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 600))])
          .then(() => {
            setIsSaving(false)
          })
          .catch((error) => {
            console.error('Failed to save break selection completion:', error)
            if (error instanceof Error && error.message === 'already-completed') {
              // Revert optimistic completion; live sync will correct if needed.
              if (beforeCompletionSnapshot) {
                setTaskState((prev) => {
                  const next: TaskState = { ...prev }
                  const day = { ...(next[selectedDateKey] ?? {}) }
                  const w = { ...(day[selectedWindow] ?? {}) }
                  w['break-selection'] = beforeCompletionSnapshot
                  day[selectedWindow] = w
                  next[selectedDateKey] = day
                  return next
                })
              } else {
                setTaskState((prev) => {
                  const next: TaskState = { ...prev }
                  const day = { ...(next[selectedDateKey] ?? {}) }
                  const w = { ...(day[selectedWindow] ?? {}) }
                  delete w['break-selection']
                  day[selectedWindow] = w
                  next[selectedDateKey] = day
                  return next
                })
              }
              setSaveError('Already completed by someone else.')
            } else {
              setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
            }
            setIsSaving(false)
          })
        return
      }

      // If already completed, we still saved the plan; just close.
      setActiveTaskId(null)
      setIsSaving(false)
    } catch (error) {
      console.error('Failed to save break selection plan:', error)
      setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
      setIsSaving(false)
    }
  }

  const clearBreakPlan = async () => {
    if (activeTaskId !== 'break-selection') return
    if (!canEditTaskAssignmentsOnSelectedDate) return

    setBreakDraftError(null)
    setSaveError(null)
    setIsSaving(true)

    try {
      // Clear the break selection from Firestore
      // Demo Day: local-only (no Firestore writes)
      if (isDemoDaySelected) {
        setDemoBreakSelectionByDateKey((prev) => ({ ...prev, [selectedDateKey]: null }))
      }
      await withTimeout(persistBreakSelectionOrNoop(selectedDateKey, null), 8000)
      setBreakSelectionState({ dateKey: selectedDateKey, value: null })

      // Reset the draft slots
      setBreakDraftSlots([
        { employee: '', shiftType: '', start: '' },
        { employee: '', shiftType: '', start: '' },
      ])
      setBreakDraftDirtyByDateKey((prev) => ({ ...prev, [selectedDateKey]: false }))
      setBreakDraftByDateKey((prev) => {
        if (!prev[selectedDateKey]) return prev
        const { [selectedDateKey]: _, ...rest } = prev
        return rest
      })
      closeBreakWizard()

      // IMPORTANT: "Clear" should revert the app to the pre-selection state.
      // That means removing BOTH:
      // - the Break Selection task completion, and
      // - any 5PM tasks auto-completed as "deferred to close" due to both employees choosing Double (1hr breaks).
      //
      // This is intentionally NOT admin-gated: break selection is an editable plan and must be reversible for staff.

      // Clear the break-selection task completion
      const existingCompletion = taskState[selectedDateKey]?.[selectedWindow]?.['break-selection']
      if (existingCompletion) {
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap['break-selection']
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          return next
        })
        await persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, 'break-selection')
      }

      // Also clear the auto-completed deferred tasks from 5PM window
      // (only the ones that were created by break selection, i.e. have deferredToClose)
      const deferredTaskIds = ['count-drawer', 'blue-bag-count', 'split-tips', 'order-report-5pm']
      for (const taskId of deferredTaskIds) {
        const taskCompletion = taskState[selectedDateKey]?.['17']?.[taskId]
        if (taskCompletion?.deferredToClose) {
          setTaskState((prev) => {
            const next: TaskState = { ...prev }
            const dateMap = { ...(next[selectedDateKey] ?? {}) }
            const windowMap = { ...(dateMap['17'] ?? {}) }
            delete windowMap[taskId]
            dateMap['17'] = windowMap
            next[selectedDateKey] = dateMap
            return next
          })
          await persistAdminClearTaskCompletionOrNoop(selectedDateKey, '17', taskId)
        }
      }

      appendSelectionLog({
        action: 'cleared',
        taskId: 'break-selection',
        taskName: 'Break Selection',
        window: selectedWindow,
        dateKey: selectedDateKey,
        assignees: [],
        byAdmin: isAdmin,
      })

      setIsSaving(false)
    } catch (error) {
      console.error('Failed to clear break selection:', error)
      setSaveError(error instanceof Error && error.message === 'timeout' ? 'Clear timed out. Check connection.' : 'Failed to clear. Try again.')
      setIsSaving(false)
    }
  }

  const toggleAssignee = async (
    name: string,
    opts?: {
      baseAssignees?: string[]
      baseSplitMode?: boolean
    }
  ) => {
    // Dice "who is working?" flow: this selection picks the split pair, it does not complete a task.
    if (splitSetupSelecting) {
      const base = opts?.baseAssignees ?? assignees
      const exists = base.includes(name)
      let next: string[]
      if (exists) next = base.filter((n) => n !== name)
      else if (base.length >= 2) next = [base[1], name]
      else next = [...base, name]
      setAssignees(next)
      if (next.length === 2) {
        setShowEmployeeSelector(false)
        setSplitSetupSelecting(false)
        setSplitMode(false)
        beginDiceSplitWithPair(next[0], next[1])
      }
      return
    }
    if (isWindowTaskLocked(activeTaskId)) {
      setSaveError('This window is locked until unlock time.')
      return
    }
    if (activeTaskId === 'turn-on-music' && !musicIsActuallyPlaying) {
      setSaveError('Start the music before selecting an employee.')
      return
    }
    if (activeCompletion?.didNotNeedToComplete && !isAdmin) {
      setSaveError('Tap Undo to clear this, then you can record who completed it.')
      return
    }
    const beforeCompletionSnapshot = activeTaskId
      ? taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
      : undefined
    const beforeAssigneesSnapshot = beforeCompletionSnapshot?.assignees ?? []

    const currentAssignees = opts?.baseAssignees ?? assignees
    const currentSplitMode = opts?.baseSplitMode ?? splitMode

    // Block second claim: if already completed and you're not admin, you can't change it.
    // Exception: allow a short "undo" window for the original single-assignee selection (fat-finger fix).
    const canSelfUndo =
      !!activeCompletion &&
      !isAdmin &&
      !activeCompletion.assignedByAdmin &&
      (activeCompletion.assignees?.length ?? 0) === 1 &&
      (activeCompletion.assignees?.[0] ?? '') === name &&
      (() => {
        // Allow undo through the end of the currently selected day (same task date),
        // so staff can fix fat-finger selections without needing an admin.
        // Keep it scoped: only the original single assignee can undo their own selection.
        const dayStart = new Date(selectedDateKey + 'T00:00:00')
        if (!Number.isFinite(dayStart.getTime())) return false
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        return Date.now() <= dayEnd.getTime()
      })()

    const exists = currentAssignees.includes(name)
    let newAssignees: string[]
    
    if (currentSplitMode) {
      if (exists) {
        newAssignees = currentAssignees.filter((n) => n !== name)
      } else if (currentAssignees.length >= 2) {
        newAssignees = [currentAssignees[1], name]
      } else {
        newAssignees = [...currentAssignees, name]
      }
    } else {
      newAssignees = exists ? [] : [name]
    }
    
    // If uncompleting (going to 0 assignees) and task was completed, clear the completion
    if (newAssignees.length === 0 && activeCompletion && activeTaskId) {
      if (!isAdmin && !canSelfUndo) {
        setSaveError('Already completed. Only admin can clear.')
        return
      }

      appendSelectionLog({
        action: 'cleared',
        taskId: activeTaskId,
        taskName: activeTask?.name ?? activeTaskId,
        window: selectedWindow,
        dateKey: selectedDateKey,
        assignees: activeCompletion.assignees ?? [],
        byAdmin: isAdmin,
      })

      await new Promise<void>((resolve) => {
        setTaskState((prevState) => {
          const next: TaskState = { ...prevState }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap[activeTaskId]
          if (Object.keys(windowMap).length === 0) {
            delete dateMap[selectedWindow]
          } else {
            dateMap[selectedWindow] = windowMap
          }
          if (Object.keys(dateMap).length === 0) {
            delete next[selectedDateKey]
          } else {
            next[selectedDateKey] = dateMap
          }
          resolve()
          return next
        })
      })
      
      // Save in background (let user continue immediately)
      setIsSaving(true)
      setSaveError(null)
      
      // Close modals and go back to main screen immediately
      setShowEmployeeSelector(false)
      setActiveTaskId(null)
      
      // Don't await - let it happen in background
      Promise.all([
        withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, activeTaskId), 8000),
        new Promise(resolve => setTimeout(resolve, 600))
      ])
        .then(() => {
          if (import.meta.env.DEV) console.log('Uncompleted task state saved successfully')
          setIsSaving(false)
        })
        .catch((error) => {
          console.error('Failed to save uncompleted state:', error)
          // Restore local state if cloud write fails
          if (beforeCompletionSnapshot) {
            setTaskState((prev) => {
              const next: TaskState = { ...prev }
              const day = { ...(next[selectedDateKey] ?? {}) }
              const w = { ...(day[selectedWindow] ?? {}) }
              w[activeTaskId] = beforeCompletionSnapshot
              day[selectedWindow] = w
              next[selectedDateKey] = day
              return next
            })
          }
          setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
          setIsSaving(false)
        })
      
      return // Exit early - don't continue to the selection logic below
    }

    // Allow same-day edits for non-admins (fat-finger fix / quick switch).
    // Only block if: already completed, non-admin, NOT admin-assigned, and past the selected day.
    const canSameDayEdit =
      !!activeCompletion &&
      !isAdmin &&
      !activeCompletion.assignedByAdmin &&
      (() => {
        const dayStart = new Date(selectedDateKey + 'T00:00:00')
        if (!Number.isFinite(dayStart.getTime())) return false
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        return Date.now() <= dayEnd.getTime()
      })()

    if (activeCompletion && !isAdmin && !canSameDayEdit) {
      setSaveError('Already completed. Ask an admin to change.')
      return
    }
    
    setAssignees(newAssignees)
    
    // Auto-save when selection is complete
    const requiredCount = currentSplitMode ? 2 : 1
    if (newAssignees.length === requiredCount && activeTaskId) {
      // If an admin cleared an employee's color from another device, re-prompt before completing.
      const missingColorEmp = newAssignees.find((e) => !employeeColorsRef.current[e])
      if (missingColorEmp) {
        setPendingColorEmployee(missingColorEmp)
        setPendingColorAction('noop')
        setShowColorPicker(true)
        return
      }
      const selectionLogEntry = {
        action: 'selected' as const,
        taskId: activeTaskId,
        taskName: activeTask?.name ?? activeTaskId,
        window: selectedWindow,
        dateKey: selectedDateKey,
        assignees: newAssignees,
        byAdmin: isAdmin,
      }
      if (!isV3Ui) {
        appendSelectionLog(selectionLogEntry)
      }

      // If editing an existing completion, preserve its timing/late flags so points stay consistent.
      // If creating a new completion, compute lateness.
      const existingCompletion = activeCompletion
      const beforeWindowPercent = computeWindowTaskPercent(taskState)
      let isLate = false
      let isEarly = false
      if (!existingCompletion) {
        const window = WINDOWS.find((w) => w.key === selectedWindow)
        if (window) {
          const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
          isLate = now >= cutoff
          if (isSoloModeActiveForWindow(selectedDateKey, selectedWindow)) {
            isLate = false
          }

          // Yum Yum Sauce can be completed early for both 5PM and 9/10PM windows.
          const isYumYum = activeTaskId === 'yum-yum-close' && (selectedWindow === '17' || selectedWindow === '21')
          if (isYumYum) {
            const startAt = combineDateTime(selectedDate, window.start)
            isEarly = now < startAt
          }
        }
      }

      // Build the new state purely (no commit) so updatedState is available synchronously
      // for the celebration math without forcing a render. The setTaskState below batches
      // with the score hold (React 18 auto-batching) into one paint, so there is no flash
      // of afterScore and only one render instead of two synchronous flushSync renders.
      windowCompleteStartScheduledRef.current = true
      let pendingNormalCelebration: null | {
        slot: 'p1' | 'p2' | null
        beforeScore: number
        afterScore: number
      } = null
      const completedAtIso = new Date().toISOString()
      const buildNext = (prev: TaskState): TaskState => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[activeTaskId] = existingCompletion
          ? {
              ...existingCompletion,
              assignees: newAssignees,
              // Preserve assignedByAdmin on edits unless explicitly changed via the admin Assign/Complete controls.
              assignedByAdmin: existingCompletion.assignedByAdmin ?? false,
              // v3 "didn't need to complete": clearing by assigning real people
              didNotNeedToComplete:
                existingCompletion.didNotNeedToComplete && newAssignees.length > 0
                  ? false
                  : !!existingCompletion.didNotNeedToComplete,
              // If editing yum-yum-close that was autoAssigned, clear autoAssigned flag since user is manually selecting.
              // This allows the completion to count toward shift participation in the HUD.
              autoAssigned: (() => {
                if (existingCompletion.didNotNeedToComplete && newAssignees.length > 0) return false
                if (activeTaskId === 'yum-yum-close' && existingCompletion.autoAssigned) return false
                return existingCompletion.autoAssigned ?? false
              })(),
            }
          : {
              status: 'done',
              assignees: newAssignees,
              completedAt: completedAtIso,
              // Admin completions default to normal completion (not admin-assigned).
              assignedByAdmin: false,
              completedLate: isLate,
              completedEarly: isEarly,
            }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        return next
      }
      const updatedState: TaskState = buildNext(taskState)
      setTaskState(buildNext)

      try {
        const afterCompletion = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
        const afterAssignees = afterCompletion?.assignees ?? []
        const rewardName = afterAssignees[afterAssignees.length - 1]
        const isNewCompletion = beforeAssigneesSnapshot.length === 0 && afterAssignees.length > 0
        const isNewAssignee = rewardName && !beforeAssigneesSnapshot.includes(rewardName)
        const shouldCelebrate = (isTodaySelected || isDemoDaySelected) && (isNewCompletion || isNewAssignee)
        if (shouldCelebrate) {
          const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
          // Reuse the memoized unfiltered leaders (same compute as shiftHudLeaders, pre-commit
          // taskState) instead of a redundant synchronous scoring pass on the tap path.
          const beforeRows = shiftLeadersForSelected
          const afterRows = computeShiftLeadersForState(
            updatedState,
            selectedDateKey,
            selectedShift,
            SHIFT_WINDOWS,
            windowTaskWeights,
            taskWeightByIdByWindow,
            isSoloScoreCappedForShift(selectedDateKey, selectedShift),
            fairSplitForSelectedDateAndShift
          )
          const beforeScore = shiftHudScoreForCelebration(beforeRows.find((r) => r.name === rewardName))
          const afterScore = shiftHudScoreForCelebration(afterRows.find((r) => r.name === rewardName))

          // Use "any points" (5PM or post-cutover 11AM) so completing an 11AM task still maps to a slot.
          const slot = shiftHudCelebrationSlotForName(rewardName, afterRows, activeSplitHudPair)

          pendingNormalCelebration = { slot, beforeScore, afterScore }
        }
      } catch {
        // ignore reward failures
      }
      if (pendingNormalCelebration) {
        const { slot, beforeScore } = pendingNormalCelebration
        if (slot === 'p1' || slot === 'p2') {
          // Batches with the setTaskState above into one commit (no flushSync), so the
          // HUD shows beforeScore in the same paint that applies the completion.
          applyShiftHudCelebrationScoreHold(slot, beforeScore)
        }
      }

      const afterWindowPercent =
        beforeWindowPercent < 100 ? computeWindowTaskPercent(updatedState) : beforeWindowPercent
      const willHitHundredPercent = beforeWindowPercent < 100 && afterWindowPercent === 100

      // Trigger pulse on the next incomplete task (local-only celebration).
      // Deferred to the next frame so the completion paints before the pulse scan/render.
      if (!existingCompletion) {
        const pulseTaskIdArg = activeTaskId
        window.requestAnimationFrame(() => triggerNextTaskPulse(pulseTaskIdArg, updatedState))
      }

      // v2: scroll to top so Shift HUD is visible for star flight. v3: floating Shift HUD notification instead (no scroll).
      setRewardStars([])
      if (!isV3Ui) {
        window.setTimeout(() => {
          window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
        }, 100)
      }

      const runStandardCelebrationStars = () => {
        if (!pendingNormalCelebration) return
        const { slot, beforeScore, afterScore } = pendingNormalCelebration
        const starDelay = celebrationTiming.v2StarDelayMs
        window.setTimeout(() => {
          if (slot === 'p1' && p1ScoreRef.current) {
            setP1ScoreOverride(beforeScore)
            rewardTargetRef.current = p1ScoreRef.current
            spawnRewardStars(p1ScoreRef.current)
            setScoreAnim({ slot: 'p1', from: beforeScore, to: afterScore, startedAt: Date.now() })
            return
          }
          if (slot === 'p2' && p2ScoreRef.current) {
            setP2ScoreOverride(beforeScore)
            rewardTargetRef.current = p2ScoreRef.current
            spawnRewardStars(p2ScoreRef.current)
            setScoreAnim({ slot: 'p2', from: beforeScore, to: afterScore, startedAt: Date.now() })
            return
          }

          setShiftHudPulse(true)
          const target = shiftHudExtraRef.current || shiftHudHeaderRef.current
          rewardTargetRef.current = target
          spawnRewardStars(target)
        }, starDelay)
      }

      if (!isV3Ui && pendingNormalCelebration) {
        runStandardCelebrationStars()
      }

      if (!isV3Ui && willHitHundredPercent) {
        const participants = computeCurrentWindowParticipants(updatedState)
        const windowLabel = getWindowLabel(selectedDate, selectedWindow)
        startWindowCompleteCelebration({
          state: updatedState,
          windowLabel,
          participants,
          waitForStars: !!pendingNormalCelebration,
        })
        windowCompleteStartScheduledRef.current = false
      }

      const taskIdSnapshot = activeTaskId
      const activeTaskSnapshot = activeTask

      const finishCloseAndPersist = () => {
        setActiveTaskId(null)
        setShowEmployeeSelector(false)

        if (!existingCompletion && activeTaskSnapshot?.askNightShiftComplete) {
          setPendingNightShiftTask({
            taskId: taskIdSnapshot,
            taskName: activeTaskSnapshot.name,
            assignees: newAssignees,
          })
          setShowNightShiftPrompt(true)
        }

        window.requestAnimationFrame(() => setIsSaving(true))
        setSaveError(null)

        localWindowWriteGuardRef.current = {
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          expiresAt: Date.now() + LOCAL_WINDOW_WRITE_GUARD_MS,
        }

        const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[taskIdSnapshot]
        const persist =
          existingCompletion
            ? persistAdminSetTaskCompletionOrNoop({
                dateKey: selectedDateKey,
                windowKey: selectedWindow,
                taskId: taskIdSnapshot,
                completion: {
                  assignees: completionToPersist?.assignees ?? newAssignees,
                  completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
                  assignedByAdmin: completionToPersist?.assignedByAdmin,
                  completedLate: completionToPersist?.completedLate,
                  lateForgiven: completionToPersist?.lateForgiven,
                  completedEarly: completionToPersist?.completedEarly,
                  autoAssigned: completionToPersist?.autoAssigned,
                  iceSides: completionToPersist?.iceSides,
                },
              })
            : persistCompleteTaskIfAvailableOrNoop({
                dateKey: selectedDateKey,
                windowKey: selectedWindow,
                taskId: taskIdSnapshot,
                completion: {
                  assignees: completionToPersist?.assignees ?? newAssignees,
                  completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
                  assignedByAdmin: completionToPersist?.assignedByAdmin,
                  completedLate: completionToPersist?.completedLate,
                  lateForgiven: completionToPersist?.lateForgiven,
                  completedEarly: completionToPersist?.completedEarly,
                  autoAssigned: completionToPersist?.autoAssigned,
                  iceSides: completionToPersist?.iceSides,
                },
              })

        Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 600))])
          .then(() => {
            if (import.meta.env.DEV) console.log('Completed task state saved successfully')
            localWindowWriteGuardRef.current = null
            setIsSaving(false)
          })
          .catch((error) => {
            console.error('Failed to save completion:', error)
            localWindowWriteGuardRef.current = null
            if (error instanceof Error && error.message === 'already-completed') {
              setTaskState((prev) => {
                const next: TaskState = { ...prev }
                const day = { ...(next[selectedDateKey] ?? {}) }
                const w = { ...(day[selectedWindow] ?? {}) }
                if (beforeCompletionSnapshot) {
                  w[taskIdSnapshot] = beforeCompletionSnapshot
                  day[selectedWindow] = w
                  next[selectedDateKey] = day
                } else {
                  delete w[taskIdSnapshot]
                  day[selectedWindow] = w
                  next[selectedDateKey] = day
                }
                return next
              })
              setSaveError('Already completed by someone else.')
            } else {
              setSaveError(
                error instanceof Error && error.message === 'timeout'
                  ? 'Save timed out. Check connection.'
                  : 'Failed to save. Try again.'
              )
            }
            setIsSaving(false)
          })
      }

      if (isV3Ui) {
        setShowEmployeeSelector(false)
        animateSuccessSlideDownAndDismiss(
          () => {
            finishCloseAndPersist()
            if (pendingNormalCelebration) {
              playV3TaskCompletionCelebration(pendingNormalCelebration, V3_TASK_COMPLETION_ANIM_OPTS)
            }
          },
          V3_TASK_COMPLETION_ANIM_OPTS,
        )
        window.requestAnimationFrame(() => {
          appendSelectionLog(selectionLogEntry)
          if (willHitHundredPercent) {
            const participants = computeCurrentWindowParticipants(updatedState)
            const windowLabel = getWindowLabel(selectedDate, selectedWindow)
            startWindowCompleteCelebration({
              state: updatedState,
              windowLabel,
              participants,
              waitForStars: !!pendingNormalCelebration,
            })
          }
          windowCompleteStartScheduledRef.current = false
        })
      } else {
        finishCloseAndPersist()
        if (!willHitHundredPercent) {
          windowCompleteStartScheduledRef.current = false
        }
      }
    }
  }

  const persistPartialIceTask = async (sides: { left: string | null; right: string | null }) => {
    if (!activeTaskId) return
    if (activeTaskId !== 'ice-5pm' && activeTaskId !== 'ice-close') return

    const left = String(sides.left || '').trim()
    const right = String(sides.right || '').trim()
    if (!left && !right) return

    const newAssignees = [left, right].filter(Boolean)
    const existingCompletion = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const isCreating = !existingCompletion
    let isLate = false
    if (isCreating) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
    }

    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[activeTaskId] = existingCompletion
          ? {
              ...existingCompletion,
              assignees: newAssignees,
              iceSides: { left, right },
              assignedByAdmin: existingCompletion.assignedByAdmin ?? false,
              didNotNeedToComplete: false,
              autoAssigned: false,
            }
          : {
              status: 'done',
              assignees: newAssignees,
              completedAt: new Date().toISOString(),
              assignedByAdmin: false,
              completedLate: isLate,
              completedEarly: false,
              iceSides: { left, right },
            }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    setIsSaving(true)
    setSaveError(null)
    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const persist = isCreating
      ? persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? newAssignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: false,
            iceSides: { left, right },
          },
        })
      : persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? newAssignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: completionToPersist?.assignedByAdmin,
            completedLate: completionToPersist?.completedLate,
            lateForgiven: completionToPersist?.lateForgiven,
            completedEarly: completionToPersist?.completedEarly,
            iceSides: { left, right },
          },
        })

    Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 200))])
      .then(() => {
        if (import.meta.env.DEV) console.log('Partial ice completion saved')
        setIsSaving(false)
      })
      .catch((error) => {
        console.error('Failed to save partial ice completion:', error)
        setIsSaving(false)
      })
  }

  const completeCombinedIceTask = async (sides: { left: string; right: string }) => {
    if (!activeTaskId) return
    if (activeTaskId !== 'ice-5pm' && activeTaskId !== 'ice-close') return
    if (isWindowTaskLocked(activeTaskId)) {
      setSaveError('This window is locked until unlock time.')
      return
    }

    const left = String(sides.left || '').trim()
    const right = String(sides.right || '').trim()
    if (!left || !right) return

    const newAssignees = [left, right]

    const beforeCompletionSnapshot = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const beforeAssigneesSnapshot = beforeCompletionSnapshot?.assignees ?? []

    // If editing an existing completion, preserve its timing/late flags so points stay consistent.
    // If creating a new completion, compute lateness.
    const existingCompletion = activeCompletion
    const beforeWindowPercent = computeWindowTaskPercent(taskState)
    let isLate = false
    let isEarly = false
    if (!existingCompletion) {
      const window = WINDOWS.find((w) => w.key === selectedWindow)
      if (window) {
        const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
        isLate = now >= cutoff
        isEarly = false
      }
    }

    // Allow same-day edits for non-admins (fat-finger fix / quick switch).
    const canSameDayEdit =
      !!existingCompletion &&
      !isAdmin &&
      !existingCompletion.assignedByAdmin &&
      (() => {
        const dayStart = new Date(selectedDateKey + 'T00:00:00')
        if (!Number.isFinite(dayStart.getTime())) return false
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        return Date.now() <= dayEnd.getTime()
      })()

    if (existingCompletion && !isAdmin && !canSameDayEdit) {
      setSaveError('Already completed. Ask an admin to change.')
      return
    }

    if (existingCompletion?.assignedByAdmin && !isAdmin) {
      setSaveError('Already completed. Only admin can change.')
      return
    }

    const iceSelectionLogEntry = {
      action: 'selected' as const,
      taskId: activeTaskId,
      taskName: activeTask?.name ?? activeTaskId,
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: newAssignees,
      byAdmin: isAdmin,
    }
    if (!isV3Ui) {
      appendSelectionLog(iceSelectionLogEntry)
    }

    // Build the new state purely (no commit) so updatedState is synchronously available;
    // the setTaskState below batches with the score hold into one paint (no flushSync).
    windowCompleteStartScheduledRef.current = true
    let pendingNormalCelebration: null | {
      slot: 'p1' | 'p2' | null
      beforeScore: number
      afterScore: number
    } = null
    const completedAtIso = new Date().toISOString()
    const buildNext = (prev: TaskState): TaskState => {
      const next: TaskState = { ...prev }
      const dateMap = { ...(next[selectedDateKey] ?? {}) }
      const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
      windowMap[activeTaskId] = existingCompletion
        ? {
            ...existingCompletion,
            assignees: newAssignees,
            iceSides: { left, right },
            // Preserve assignedByAdmin on edits unless explicitly changed via the admin Assign/Complete controls.
            assignedByAdmin: existingCompletion.assignedByAdmin ?? false,
            didNotNeedToComplete: false,
            autoAssigned: false,
          }
        : {
            status: 'done',
            assignees: newAssignees,
            completedAt: completedAtIso,
            assignedByAdmin: false,
            completedLate: isLate,
            completedEarly: isEarly,
            iceSides: { left, right },
          }
      dateMap[selectedWindow] = windowMap
      next[selectedDateKey] = dateMap
      return next
    }
    const updatedState: TaskState = buildNext(taskState)
    setTaskState(buildNext)

    try {
      const afterCompletion = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
      const afterAssignees = afterCompletion?.assignees ?? []
      const rewardName = afterAssignees[afterAssignees.length - 1]
      const beforeIceLeft = String(beforeCompletionSnapshot?.iceSides?.left || '').trim()
      const beforeIceRight = String(beforeCompletionSnapshot?.iceSides?.right || '').trim()
      const iceTransitionedPartialToFull =
        !!beforeCompletionSnapshot &&
        (!beforeIceLeft || !beforeIceRight) &&
        (!!beforeIceLeft || !!beforeIceRight) &&
        !!left &&
        !!right
      const dualSidesJustFinished =
        beforeAssigneesSnapshot.length < 2 && newAssignees.length === 2
      const isNewCompletion = beforeAssigneesSnapshot.length === 0 && afterAssignees.length > 0
      const isNewAssignee = rewardName && !beforeAssigneesSnapshot.includes(rewardName)
      const shouldCelebrate =
        canEditTaskAssignmentsOnSelectedDate &&
        (isNewCompletion || isNewAssignee || iceTransitionedPartialToFull || dualSidesJustFinished)
      if (shouldCelebrate) {
        const celebrationRewardName =
          newAssignees.length === 2 && newAssignees[0] === newAssignees[1] ? newAssignees[0] : rewardName
        if (celebrationRewardName) {
          const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
          // Reuse the memoized unfiltered leaders (same compute as shiftHudLeaders, pre-commit
          // taskState) instead of a redundant synchronous scoring pass on the tap path.
          const beforeRows = shiftLeadersForSelected
          const afterRows = computeShiftLeadersForState(
            updatedState,
            selectedDateKey,
            selectedShift,
            SHIFT_WINDOWS,
            windowTaskWeights,
            taskWeightByIdByWindow,
            isSoloScoreCappedForShift(selectedDateKey, selectedShift),
            fairSplitForSelectedDateAndShift
          )
          const beforeScore = shiftHudScoreForCelebration(beforeRows.find((r) => r.name === celebrationRewardName))
          const afterScore = shiftHudScoreForCelebration(afterRows.find((r) => r.name === celebrationRewardName))

          const slot = shiftHudCelebrationSlotForName(celebrationRewardName, afterRows, activeSplitHudPair)

          pendingNormalCelebration = { slot, beforeScore, afterScore }
        }
      }
    } catch {
      // ignore reward failures
    }
    if (pendingNormalCelebration) {
      const { slot, beforeScore } = pendingNormalCelebration
      if (slot === 'p1' || slot === 'p2') {
        // Batched with setTaskState above (no flushSync): one paint, no afterScore flash.
        applyShiftHudCelebrationScoreHold(slot, beforeScore)
      }
    }

    const afterWindowPercent =
      beforeWindowPercent < 100 ? computeWindowTaskPercent(updatedState) : beforeWindowPercent
    const willHitHundredPercent = beforeWindowPercent < 100 && afterWindowPercent === 100

    if (!existingCompletion) {
      const pulseTaskIdArg = activeTaskId
      window.requestAnimationFrame(() => triggerNextTaskPulse(pulseTaskIdArg, updatedState))
    }

    setRewardStars([])
    if (!isV3Ui) {
      window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
    }

    if (!isV3Ui && pendingNormalCelebration) {
      const { slot, beforeScore, afterScore } = pendingNormalCelebration
      const starDelay = celebrationTiming.iceTowelStarDelayMs
      const starOpts = { bypassReducedMotion: true as const }
      window.setTimeout(() => {
        if (slot === 'p1' && p1ScoreRef.current) {
          setP1ScoreOverride(beforeScore)
          rewardTargetRef.current = p1ScoreRef.current
          spawnRewardStars(p1ScoreRef.current, starOpts)
          setScoreAnim({ slot: 'p1', from: beforeScore, to: afterScore, startedAt: Date.now() })
          return
        }
        if (slot === 'p2' && p2ScoreRef.current) {
          setP2ScoreOverride(beforeScore)
          rewardTargetRef.current = p2ScoreRef.current
          spawnRewardStars(p2ScoreRef.current, starOpts)
          setScoreAnim({ slot: 'p2', from: beforeScore, to: afterScore, startedAt: Date.now() })
          return
        }

        setShiftHudPulse(true)
        const target = shiftHudExtraRef.current || shiftHudHeaderRef.current
        rewardTargetRef.current = target
        spawnRewardStars(target, starOpts)
      }, starDelay)
    }

    if (!isV3Ui && willHitHundredPercent) {
      const participants = computeCurrentWindowParticipants(updatedState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      startWindowCompleteCelebration({
        state: updatedState,
        windowLabel,
        participants,
        waitForStars: !!pendingNormalCelebration,
      })
      windowCompleteStartScheduledRef.current = false
    }

    const iceTaskIdSnapshot = activeTaskId

    const finishIceCloseAndPersist = () => {
      setActiveTaskId(null)
      setShowEmployeeSelector(false)
      setPendingIceSide(null)
      setIceSidesDraft({ left: null, right: null })
      {
        const key = `${selectedDateKey}:${selectedWindow}:${iceTaskIdSnapshot}`
        setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: false }))
        setIceSidesDraftByKey((prev) => {
          if (!prev[key]) return prev
          const { [key]: _, ...rest } = prev
          return rest
        })
      }

      window.requestAnimationFrame(() => setIsSaving(true))
      setSaveError(null)

      localWindowWriteGuardRef.current = {
        dateKey: selectedDateKey,
        windowKey: selectedWindow,
        expiresAt: Date.now() + LOCAL_WINDOW_WRITE_GUARD_MS,
      }

      const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[iceTaskIdSnapshot]
      const persist =
        existingCompletion
          ? persistAdminSetTaskCompletionOrNoop({
              dateKey: selectedDateKey,
              windowKey: selectedWindow,
              taskId: iceTaskIdSnapshot,
              completion: {
                assignees: completionToPersist?.assignees ?? newAssignees,
                completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
                assignedByAdmin: completionToPersist?.assignedByAdmin,
                completedLate: completionToPersist?.completedLate,
                lateForgiven: completionToPersist?.lateForgiven,
                completedEarly: completionToPersist?.completedEarly,
                iceSides: completionToPersist?.iceSides,
              },
            })
          : persistCompleteTaskIfAvailableOrNoop({
              dateKey: selectedDateKey,
              windowKey: selectedWindow,
              taskId: iceTaskIdSnapshot,
              completion: {
                assignees: completionToPersist?.assignees ?? newAssignees,
                completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
                assignedByAdmin: completionToPersist?.assignedByAdmin,
                completedLate: completionToPersist?.completedLate,
                lateForgiven: completionToPersist?.lateForgiven,
                completedEarly: completionToPersist?.completedEarly,
                iceSides: completionToPersist?.iceSides,
              },
            })

      Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 600))])
        .then(() => {
          if (import.meta.env.DEV) console.log('Completed task state saved successfully')
          localWindowWriteGuardRef.current = null
          setIsSaving(false)
        })
        .catch((error) => {
          console.error('Failed to save completion:', error)
          localWindowWriteGuardRef.current = null
          if (error instanceof Error && error.message === 'already-completed') {
            setTaskState((prev) => {
              const next: TaskState = { ...prev }
              const day = { ...(next[selectedDateKey] ?? {}) }
              const w = { ...(day[selectedWindow] ?? {}) }
              if (beforeCompletionSnapshot) {
                w[iceTaskIdSnapshot] = beforeCompletionSnapshot
                day[selectedWindow] = w
                next[selectedDateKey] = day
              } else {
                delete w[iceTaskIdSnapshot]
                day[selectedWindow] = w
                next[selectedDateKey] = day
              }
              return next
            })
            setSaveError('Already completed by someone else.')
          } else {
            setSaveError(
              error instanceof Error && error.message === 'timeout'
                ? 'Save timed out. Check connection.'
                : 'Failed to save. Try again.'
            )
          }
          setIsSaving(false)
        })
    }

    if (isV3Ui) {
      setShowEmployeeSelector(false)
      animateSuccessSlideDownAndDismiss(
        () => {
          finishIceCloseAndPersist()
          if (pendingNormalCelebration) {
            playV3TaskCompletionCelebration(pendingNormalCelebration, V3_TASK_COMPLETION_ANIM_OPTS)
          }
        },
        V3_TASK_COMPLETION_ANIM_OPTS,
      )
      window.requestAnimationFrame(() => {
        appendSelectionLog(iceSelectionLogEntry)
        if (willHitHundredPercent) {
          const participants = computeCurrentWindowParticipants(updatedState)
          const windowLabel = getWindowLabel(selectedDate, selectedWindow)
          startWindowCompleteCelebration({
            state: updatedState,
            windowLabel,
            participants,
            waitForStars: !!pendingNormalCelebration,
          })
        }
        windowCompleteStartScheduledRef.current = false
      })
    } else {
      finishIceCloseAndPersist()
      if (!willHitHundredPercent) {
        windowCompleteStartScheduledRef.current = false
      }
    }
  }

  const clearCombinedIceTask = useCallback(async (opts?: { closeModal?: boolean }) => {
    if (!activeTaskId) return
    if (activeTaskId !== 'ice-5pm' && activeTaskId !== 'ice-close') return
    if (isWindowTaskLocked(activeTaskId)) return

    // Clearing should also wipe any cached draft for this ice task instance.
    const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
    setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: false }))
    setIceSidesDraftByKey((prev) => {
      if (!prev[key]) return prev
      const { [key]: _, ...rest } = prev
      return rest
    })

    // Always clear local draft UI immediately.
    setPendingIceSide(null)
    setIceSidesDraft({ left: null, right: null })
    setAssignees([])
    if (iceFillAnimCleanupRef.current != null) {
      window.clearTimeout(iceFillAnimCleanupRef.current)
      iceFillAnimCleanupRef.current = null
    }
    iceLeftTileRef.current?.classList.remove('ice-filling')
    iceRightTileRef.current?.classList.remove('ice-filling')
    icePageEmojiLayerRef.current?.replaceChildren()
    setSaveError(null)

    // If not completed yet, nothing to delete.
    const beforeCompletionSnapshot = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    if (!beforeCompletionSnapshot) return

    appendSelectionLog({
      action: 'cleared',
      taskId: activeTaskId,
      taskName: activeTask?.name ?? activeTaskId,
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: beforeCompletionSnapshot.assignees ?? [],
      byAdmin: isAdmin,
    })

    // Optimistically remove completion from local state (same pattern as task un-complete).
    await new Promise<void>((resolve) => {
      setTaskState((prevState) => {
        const next: TaskState = { ...prevState }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        delete windowMap[activeTaskId]
        if (Object.keys(windowMap).length === 0) {
          delete dateMap[selectedWindow]
        } else {
          dateMap[selectedWindow] = windowMap
        }
        if (Object.keys(dateMap).length === 0) {
          delete next[selectedDateKey]
        } else {
          next[selectedDateKey] = dateMap
        }
        resolve()
        return next
      })
    })

    // Persist delete (rules allow delete; keeps "clear" behavior consistent with Break Selection).
    setIsSaving(true)
    try {
      await Promise.all([
        withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, activeTaskId), 8000),
        new Promise((r) => setTimeout(r, 350)),
      ])
      setIsSaving(false)
      if (opts?.closeModal) {
        pendingScrollToTaskIdRef.current = activeTaskId
        setShowEmployeeSelector(false)
        setActiveTaskId(null)
      }
    } catch (error) {
      console.error('Failed to clear combined ice completion:', error)
      // Restore local state on failure
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const day = { ...(next[selectedDateKey] ?? {}) }
        const w = { ...(day[selectedWindow] ?? {}) }
        w[activeTaskId] = beforeCompletionSnapshot
        day[selectedWindow] = w
        next[selectedDateKey] = day
        return next
      })
      setSaveError(error instanceof Error && error.message === 'timeout' ? 'Clear timed out. Check connection.' : 'Failed to clear. Try again.')
      setIsSaving(false)
    }
  }, [
    activeTask?.name,
    activeTaskId,
    appendSelectionLog,
    isAdmin,
    persistAdminClearTaskCompletionOrNoop,
    selectedDateKey,
    selectedWindow,
    taskState,
    isWindowTaskLocked,
  ])

  const persistPartialTowelTask = async (sides: { diningBar: string | null; bowlStation: string | null }) => {
    if (!activeTaskId) return
    if (activeTaskId !== 'towels' && activeTaskId !== 'towels-5pm' && activeTaskId !== 'towels-close') return

    const diningBar = String(sides.diningBar || '').trim()
    const bowlStation = String(sides.bowlStation || '').trim()
    if (!diningBar && !bowlStation) return

    const newAssignees = [diningBar, bowlStation].filter(Boolean)
    const existingCompletion = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const isCreating = !existingCompletion
    let isLate = false
    if (isCreating) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
    }

    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[activeTaskId] = existingCompletion
          ? {
              ...existingCompletion,
              assignees: newAssignees,
              towelSides: { diningBar, bowlStation },
              assignedByAdmin: existingCompletion.assignedByAdmin ?? false,
            }
          : {
              status: 'done',
              assignees: newAssignees,
              completedAt: new Date().toISOString(),
              assignedByAdmin: false,
              completedLate: isLate,
              lateForgiven: false,
              towelSides: { diningBar, bowlStation },
            }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    setIsSaving(true)
    setSaveError(null)
    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const persist = isCreating
      ? persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? newAssignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: false,
            towelSides: { diningBar, bowlStation },
          },
        })
      : persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? newAssignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: completionToPersist?.assignedByAdmin,
            completedLate: completionToPersist?.completedLate,
            lateForgiven: completionToPersist?.lateForgiven,
            completedEarly: completionToPersist?.completedEarly,
            towelSides: { diningBar, bowlStation },
          },
        })

    Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 200))])
      .then(() => {
        if (import.meta.env.DEV) console.log('Partial towel completion saved')
        setIsSaving(false)
      })
      .catch((error) => {
        console.error('Failed to save partial towel completion:', error)
        setIsSaving(false)
      })
  }

  const completeCombinedTowelTask = async (sides: { diningBar: string; bowlStation: string }) => {
    if (!activeTaskId) return
    if (activeTaskId !== 'towels' && activeTaskId !== 'towels-5pm' && activeTaskId !== 'towels-close') return
    if (isWindowTaskLocked(activeTaskId)) {
      setSaveError('This window is locked until unlock time.')
      return
    }

    const diningBar = String(sides.diningBar || '').trim()
    const bowlStation = String(sides.bowlStation || '').trim()
    if (!diningBar || !bowlStation) return

    const newAssignees = [diningBar, bowlStation]
    const beforeCompletionSnapshot = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const beforeAssigneesSnapshot = beforeCompletionSnapshot?.assignees ?? []
    const existingCompletion = activeCompletion
    let isLate = false
    if (!existingCompletion) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
    }
    const canSameDayEdit =
      !!existingCompletion &&
      !isAdmin &&
      !existingCompletion.assignedByAdmin &&
      (() => {
        const dayStart = new Date(selectedDateKey + 'T00:00:00')
        if (!Number.isFinite(dayStart.getTime())) return false
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        return Date.now() <= dayEnd.getTime()
      })()

    if (existingCompletion && !isAdmin && !canSameDayEdit) {
      setSaveError('Already completed. Ask an admin to change.')
      return
    }
    if (existingCompletion?.assignedByAdmin && !isAdmin) {
      setSaveError('Already completed. Only admin can change.')
      return
    }

    const towelSelectionLogEntry = {
      action: 'selected' as const,
      taskId: activeTaskId,
      taskName: activeTask?.name ?? activeTaskId,
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: newAssignees,
      byAdmin: isAdmin,
    }
    if (!isV3Ui) {
      appendSelectionLog(towelSelectionLogEntry)
    }

    const beforeWindowPercent = computeWindowTaskPercent(taskState)

    // Build the new state purely (no commit) so updatedState is synchronously available;
    // the setTaskState below batches with the score hold into one paint (no flushSync).
    windowCompleteStartScheduledRef.current = true
    let pendingNormalCelebration: { slot: 'p1' | 'p2' | null; beforeScore: number; afterScore: number } | null = null
    const completedAtIso = new Date().toISOString()
    const buildNext = (prev: TaskState): TaskState => {
      const next: TaskState = { ...prev }
      const dateMap = { ...(next[selectedDateKey] ?? {}) }
      const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
      windowMap[activeTaskId] = existingCompletion
        ? {
            ...existingCompletion,
            assignees: newAssignees,
            towelSides: { diningBar, bowlStation },
            assignedByAdmin: existingCompletion.assignedByAdmin ?? false,
          }
        : {
            status: 'done',
            assignees: newAssignees,
            completedAt: completedAtIso,
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            towelSides: { diningBar, bowlStation },
          }
      dateMap[selectedWindow] = windowMap
      next[selectedDateKey] = dateMap
      return next
    }
    const updatedState: TaskState = buildNext(taskState)
    setTaskState(buildNext)

    try {
      const rewardName = newAssignees[newAssignees.length - 1]
      const beforeTowelBar = String(beforeCompletionSnapshot?.towelSides?.diningBar || '').trim()
      const beforeTowelBowl = String(beforeCompletionSnapshot?.towelSides?.bowlStation || '').trim()
      const towelTransitionedPartialToFull =
        !!beforeCompletionSnapshot &&
        (!beforeTowelBar || !beforeTowelBowl) &&
        (!!beforeTowelBar || !!beforeTowelBowl) &&
        !!diningBar &&
        !!bowlStation
      const dualSidesJustFinished =
        beforeAssigneesSnapshot.length < 2 && newAssignees.length === 2
      const isNewCompletion = beforeAssigneesSnapshot.length === 0 && newAssignees.length > 0
      const isNewAssignee = rewardName && !beforeAssigneesSnapshot.includes(rewardName)
      const shouldCelebrate =
        canEditTaskAssignmentsOnSelectedDate &&
        (isNewCompletion || isNewAssignee || towelTransitionedPartialToFull || dualSidesJustFinished)
      if (shouldCelebrate) {
        const celebrationRewardName =
          newAssignees.length === 2 && newAssignees[0] === newAssignees[1] ? newAssignees[0] : rewardName
        if (celebrationRewardName) {
          const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
          // Reuse the memoized unfiltered leaders (same compute as shiftHudLeaders, pre-commit
          // taskState) instead of a redundant synchronous scoring pass on the tap path.
          const beforeRows = shiftLeadersForSelected
          const afterRows = computeShiftLeadersForState(
            updatedState,
            selectedDateKey,
            selectedShift,
            SHIFT_WINDOWS,
            windowTaskWeights,
            taskWeightByIdByWindow,
            isSoloScoreCappedForShift(selectedDateKey, selectedShift),
            fairSplitForSelectedDateAndShift
          )
          const beforeScore = shiftHudScoreForCelebration(beforeRows.find((r) => r.name === celebrationRewardName))
          const afterScore = shiftHudScoreForCelebration(afterRows.find((r) => r.name === celebrationRewardName))
          const slot = shiftHudCelebrationSlotForName(celebrationRewardName, afterRows, activeSplitHudPair)
          pendingNormalCelebration = { slot, beforeScore, afterScore }
        }
      }
    } catch {
      /* ignore */
    }
    if (pendingNormalCelebration) {
      const { slot, beforeScore } = pendingNormalCelebration
      if (slot === 'p1' || slot === 'p2') {
        // Batched with setTaskState above (no flushSync): one paint, no afterScore flash.
        applyShiftHudCelebrationScoreHold(slot, beforeScore)
      }
    }

    const afterWindowPercent =
      beforeWindowPercent < 100 ? computeWindowTaskPercent(updatedState) : beforeWindowPercent
    const willHitHundredPercent = beforeWindowPercent < 100 && afterWindowPercent === 100

    if (!existingCompletion) {
      const pulseTaskIdArg = activeTaskId
      window.requestAnimationFrame(() => triggerNextTaskPulse(pulseTaskIdArg, updatedState))
    }
    setRewardStars([])
    if (!isV3Ui) {
      window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
    }

    if (!isV3Ui && pendingNormalCelebration) {
      const { slot, beforeScore, afterScore } = pendingNormalCelebration
      const starDelay = celebrationTiming.iceTowelStarDelayMs
      const starOpts = { bypassReducedMotion: true as const }
      window.setTimeout(() => {
        if (slot === 'p1' && p1ScoreRef.current) {
          setP1ScoreOverride(beforeScore)
          rewardTargetRef.current = p1ScoreRef.current
          spawnRewardStars(p1ScoreRef.current, starOpts)
          setScoreAnim({ slot: 'p1', from: beforeScore, to: afterScore, startedAt: Date.now() })
          return
        }
        if (slot === 'p2' && p2ScoreRef.current) {
          setP2ScoreOverride(beforeScore)
          rewardTargetRef.current = p2ScoreRef.current
          spawnRewardStars(p2ScoreRef.current, starOpts)
          setScoreAnim({ slot: 'p2', from: beforeScore, to: afterScore, startedAt: Date.now() })
          return
        }
        setShiftHudPulse(true)
        const target = shiftHudExtraRef.current || shiftHudHeaderRef.current
        rewardTargetRef.current = target
        spawnRewardStars(target, starOpts)
      }, starDelay)
    }

    if (!isV3Ui && willHitHundredPercent) {
      const participants = computeCurrentWindowParticipants(updatedState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      startWindowCompleteCelebration({ state: updatedState, windowLabel, participants, waitForStars: !!pendingNormalCelebration })
      windowCompleteStartScheduledRef.current = false
    }

    const towelTaskIdSnapshot = activeTaskId

    const finishTowelCloseAndPersist = () => {
      setActiveTaskId(null)
      setShowEmployeeSelector(false)
      setPendingTowelSide(null)
      setTowelSidesDraft({ diningBar: null, bowlStation: null })
      {
        const key = `${selectedDateKey}:${selectedWindow}:${towelTaskIdSnapshot}`
        setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: false }))
        setTowelSidesDraftByKey((prev) => {
          if (!prev[key]) return prev
          const { [key]: _, ...rest } = prev
          return rest
        })
      }

      window.requestAnimationFrame(() => setIsSaving(true))
      setSaveError(null)

      localWindowWriteGuardRef.current = {
        dateKey: selectedDateKey,
        windowKey: selectedWindow,
        expiresAt: Date.now() + LOCAL_WINDOW_WRITE_GUARD_MS,
      }

      const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[towelTaskIdSnapshot]
      const persist = existingCompletion
        ? persistAdminSetTaskCompletionOrNoop({
            dateKey: selectedDateKey,
            windowKey: selectedWindow,
            taskId: towelTaskIdSnapshot,
            completion: {
              assignees: completionToPersist?.assignees ?? newAssignees,
              completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
              assignedByAdmin: completionToPersist?.assignedByAdmin,
              completedLate: completionToPersist?.completedLate,
              lateForgiven: completionToPersist?.lateForgiven,
              completedEarly: completionToPersist?.completedEarly,
              towelSides: completionToPersist?.towelSides,
            },
          })
        : persistCompleteTaskIfAvailableOrNoop({
            dateKey: selectedDateKey,
            windowKey: selectedWindow,
            taskId: towelTaskIdSnapshot,
            completion: {
              assignees: completionToPersist?.assignees ?? newAssignees,
              completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
              assignedByAdmin: completionToPersist?.assignedByAdmin,
              completedLate: completionToPersist?.completedLate,
              lateForgiven: completionToPersist?.lateForgiven,
              completedEarly: completionToPersist?.completedEarly,
              towelSides: completionToPersist?.towelSides,
            },
          })

      Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 600))])
        .then(() => {
          if (import.meta.env.DEV) console.log('Completed task state saved successfully')
          localWindowWriteGuardRef.current = null
          setIsSaving(false)
        })
        .catch((error) => {
          console.error('Failed to save completion:', error)
          localWindowWriteGuardRef.current = null
          if (error instanceof Error && error.message === 'already-completed') {
            setTaskState((prev) => {
              const next: TaskState = { ...prev }
              const day = { ...(next[selectedDateKey] ?? {}) }
              const w = { ...(day[selectedWindow] ?? {}) }
              if (beforeCompletionSnapshot) {
                w[towelTaskIdSnapshot] = beforeCompletionSnapshot
                day[selectedWindow] = w
                next[selectedDateKey] = day
              } else {
                delete w[towelTaskIdSnapshot]
                day[selectedWindow] = w
                next[selectedDateKey] = day
              }
              return next
            })
            setSaveError('Already completed by someone else.')
          } else {
            setSaveError(
              error instanceof Error && error.message === 'timeout'
                ? 'Save timed out. Check connection.'
                : 'Failed to save. Try again.'
            )
          }
          setIsSaving(false)
        })
    }

    if (isV3Ui) {
      setShowEmployeeSelector(false)
      animateSuccessSlideDownAndDismiss(
        () => {
          finishTowelCloseAndPersist()
          if (pendingNormalCelebration) {
            playV3TaskCompletionCelebration(pendingNormalCelebration, V3_TASK_COMPLETION_ANIM_OPTS)
          }
        },
        V3_TASK_COMPLETION_ANIM_OPTS,
      )
      window.requestAnimationFrame(() => {
        appendSelectionLog(towelSelectionLogEntry)
        if (willHitHundredPercent) {
          const participants = computeCurrentWindowParticipants(updatedState)
          const windowLabel = getWindowLabel(selectedDate, selectedWindow)
          startWindowCompleteCelebration({
            state: updatedState,
            windowLabel,
            participants,
            waitForStars: !!pendingNormalCelebration,
          })
        }
        windowCompleteStartScheduledRef.current = false
      })
    } else {
      finishTowelCloseAndPersist()
      if (!willHitHundredPercent) {
        windowCompleteStartScheduledRef.current = false
      }
    }
  }

  const clearCombinedTowelTask = useCallback(async (opts?: { closeModal?: boolean }) => {
    if (!activeTaskId) return
    if (activeTaskId !== 'towels' && activeTaskId !== 'towels-5pm' && activeTaskId !== 'towels-close') return
    if (isWindowTaskLocked(activeTaskId)) return

    const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
    setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: false }))
    setTowelSidesDraftByKey((prev) => {
      if (!prev[key]) return prev
      const { [key]: _, ...rest } = prev
      return rest
    })
    setPendingTowelSide(null)
    setTowelSidesDraft({ diningBar: null, bowlStation: null })
    setAssignees([])
    if (towelFillAnimCleanupRef.current != null) {
      window.clearTimeout(towelFillAnimCleanupRef.current)
      towelFillAnimCleanupRef.current = null
    }
    towelDiningTileRef.current?.classList.remove('towel-filling')
    towelBowlTileRef.current?.classList.remove('towel-filling')
    towelPageEmojiLayerRef.current?.replaceChildren()
    setSaveError(null)

    const beforeCompletionSnapshot = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    if (!beforeCompletionSnapshot) return

    appendSelectionLog({
      action: 'cleared',
      taskId: activeTaskId,
      taskName: activeTask?.name ?? activeTaskId,
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: beforeCompletionSnapshot.assignees ?? [],
      byAdmin: isAdmin,
    })

    await new Promise<void>((resolve) => {
      setTaskState((prevState) => {
        const next: TaskState = { ...prevState }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        delete windowMap[activeTaskId]
        if (Object.keys(windowMap).length === 0) delete dateMap[selectedWindow]
        else dateMap[selectedWindow] = windowMap
        if (Object.keys(dateMap).length === 0) delete next[selectedDateKey]
        else next[selectedDateKey] = dateMap
        resolve()
        return next
      })
    })

    setIsSaving(true)
    try {
      await Promise.all([
        withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, activeTaskId), 8000),
        new Promise((r) => setTimeout(r, 350)),
      ])
      setIsSaving(false)
      if (opts?.closeModal) {
        pendingScrollToTaskIdRef.current = activeTaskId
        setShowEmployeeSelector(false)
        setActiveTaskId(null)
      }
    } catch (error) {
      console.error('Failed to clear combined towel completion:', error)
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const day = { ...(next[selectedDateKey] ?? {}) }
        const w = { ...(day[selectedWindow] ?? {}) }
        w[activeTaskId] = beforeCompletionSnapshot
        day[selectedWindow] = w
        next[selectedDateKey] = day
        return next
      })
      setSaveError(error instanceof Error && error.message === 'timeout' ? 'Clear timed out. Check connection.' : 'Failed to clear. Try again.')
      setIsSaving(false)
    }
  }, [
    activeTask?.name,
    activeTaskId,
    appendSelectionLog,
    isAdmin,
    persistAdminClearTaskCompletionOrNoop,
    selectedDateKey,
    selectedWindow,
    taskState,
    isWindowTaskLocked,
  ])

  const triggerIceFillAnim = useCallback((side: 'left' | 'right') => {
    if (prefersReducedMotion) return
    const count = 6
    const chars: Array<'❄️' | '🧊'> = ['❄️', '🧊']
    const tileEl = side === 'left' ? iceLeftTileRef.current : iceRightTileRef.current
    const layerEl = icePageEmojiLayerRef.current
    if (!tileEl || !layerEl) return
    const rect = tileEl.getBoundingClientRect()
    const startY = -56
    const emojis = Array.from({ length: count }).map((_, i) => {
      const x0 = rect.left + Math.random() * rect.width
      const x1 = rect.left + rect.width * (0.2 + Math.random() * 0.6)
      const y1 = rect.top + rect.height * (0.22 + Math.random() * 0.55)
      const delayMs = i * 70
      const durMs = 700 + Math.floor(Math.random() * 260)
      const sizePx = 34 + Math.floor(Math.random() * 14)
      const char = chars[Math.floor(Math.random() * chars.length)] || '❄️'
      return {
        char,
        x: x0,
        y: startY,
        dx: x1 - x0,
        dy: y1 - startY,
        delayMs,
        durMs,
        sizePx,
      }
    })
    const maxMs = emojis.reduce((m, e) => Math.max(m, e.delayMs + e.durMs), 0) + 100
    if (iceFillAnimCleanupRef.current != null) {
      window.clearTimeout(iceFillAnimCleanupRef.current)
      iceFillAnimCleanupRef.current = null
    }
    // Defer until after React commits draft/filled class from the same event handler.
    window.setTimeout(() => {
      tileEl.classList.remove('ice-filling')
      void tileEl.offsetWidth
      tileEl.classList.add('ice-filling')
      layerEl.replaceChildren()
      for (const e of emojis) {
        const span = document.createElement('span')
        span.className = 'ice-page-emoji'
        span.style.left = `${e.x}px`
        span.style.top = `${e.y}px`
        span.style.setProperty('--dx', `${e.dx}px`)
        span.style.setProperty('--dy', `${e.dy}px`)
        span.style.animationDelay = `${e.delayMs}ms`
        span.style.animationDuration = `${e.durMs}ms`
        span.style.fontSize = `${e.sizePx}px`
        span.textContent = e.char
        layerEl.appendChild(span)
      }
      iceFillAnimCleanupRef.current = window.setTimeout(() => {
        iceFillAnimCleanupRef.current = null
        tileEl.classList.remove('ice-filling')
        layerEl.replaceChildren()
      }, maxMs)
    }, 0)
  }, [prefersReducedMotion])

  const triggerTowelFillAnim = useCallback((side: 'diningBar' | 'bowlStation') => {
    if (prefersReducedMotion) return
    const count = 6
    const tileEl = side === 'diningBar' ? towelDiningTileRef.current : towelBowlTileRef.current
    const layerEl = towelPageEmojiLayerRef.current
    if (!tileEl || !layerEl) return
    const rect = tileEl.getBoundingClientRect()
    const startY = -56
    const emojis = Array.from({ length: count }).map((_, i) => {
      const x0 = rect.left + Math.random() * rect.width
      const x1 = rect.left + rect.width * (0.2 + Math.random() * 0.6)
      const y1 = rect.top + rect.height * (0.22 + Math.random() * 0.55)
      const delayMs = i * 70
      const durMs = 700 + Math.floor(Math.random() * 260)
      const sizePx = 34 + Math.floor(Math.random() * 14)
      return {
        x: x0,
        y: startY,
        dx: x1 - x0,
        dy: y1 - startY,
        delayMs,
        durMs,
        sizePx,
      }
    })
    const maxMs = emojis.reduce((m, e) => Math.max(m, e.delayMs + e.durMs), 0) + 100
    if (towelFillAnimCleanupRef.current != null) {
      window.clearTimeout(towelFillAnimCleanupRef.current)
      towelFillAnimCleanupRef.current = null
    }
    window.setTimeout(() => {
      tileEl.classList.remove('towel-filling')
      void tileEl.offsetWidth
      tileEl.classList.add('towel-filling')
      layerEl.replaceChildren()
      for (const e of emojis) {
        const span = document.createElement('span')
        span.className = 'towel-page-emoji'
        span.style.left = `${e.x}px`
        span.style.top = `${e.y}px`
        span.style.setProperty('--dx', `${e.dx}px`)
        span.style.setProperty('--dy', `${e.dy}px`)
        span.style.animationDelay = `${e.delayMs}ms`
        span.style.animationDuration = `${e.durMs}ms`
        span.style.fontSize = `${e.sizePx}px`
        span.textContent = '🧼'
        layerEl.appendChild(span)
      }
      towelFillAnimCleanupRef.current = window.setTimeout(() => {
        towelFillAnimCleanupRef.current = null
        tileEl.classList.remove('towel-filling')
        layerEl.replaceChildren()
      }, maxMs)
    }, 0)
  }, [prefersReducedMotion])

  const activeCompletion = activeTask
    ? statusByTask[activeTask.id]?.completion
    : undefined

  const isFullyCompleted =
    activeTaskId != null ? (statusByTask[activeTaskId]?.status === 'done') : false
  const showCompletedResetUx = isFullyCompleted

  // Admin-only: explicitly mark an existing completion as "assigned" (⭐) or normal completion.
  // Default admin completion is normal (assignedByAdmin=false); this control is the explicit opt-in.
  const setAdminAssignedByAdmin = useCallback(
    async (nextAssigned: boolean) => {
      if (!isAdmin) return
      if (!activeTaskId) return
      if (!activeCompletion) return

      const before = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
      if (!before) return

      const updatedState = await new Promise<TaskState>((resolve) => {
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          const existing = windowMap[activeTaskId]
          if (!existing) {
            resolve(prev)
            return prev
          }
          windowMap[activeTaskId] = { ...existing, assignedByAdmin: nextAssigned }
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          resolve(next)
          return next
        })
      })

      setIsSaving(true)
      setSaveError(null)
      const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
      const persist = completionToPersist
        ? persistAdminSetTaskCompletionOrNoop({
            dateKey: selectedDateKey,
            windowKey: selectedWindow,
            taskId: activeTaskId,
            completion: {
              assignees: completionToPersist.assignees,
              completedAt: completionToPersist.completedAt,
              assignedByAdmin: completionToPersist.assignedByAdmin ?? false,
              completedLate: completionToPersist.completedLate,
              lateForgiven: completionToPersist.lateForgiven,
              completedEarly: completionToPersist.completedEarly,
              autoAssigned: completionToPersist.autoAssigned,
              deferredToClose: completionToPersist.deferredToClose,
              orderReportCounts: completionToPersist.orderReportCounts,
            },
          })
        : Promise.resolve()

      Promise.all([withTimeout(persist, 8000), new Promise((r) => setTimeout(r, 350))])
        .then(() => setIsSaving(false))
        .catch((error) => {
          // Revert optimistic change if the write fails.
          setTaskState((prev) => {
            const next: TaskState = { ...prev }
            const dateMap = { ...(next[selectedDateKey] ?? {}) }
            const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
            if (before) windowMap[activeTaskId] = before
            dateMap[selectedWindow] = windowMap
            next[selectedDateKey] = dateMap
            return next
          })
          setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
          setIsSaving(false)
        })
    },
    [
      activeCompletion,
      activeTaskId,
      isAdmin,
      persistAdminSetTaskCompletionOrNoop,
      selectedDateKey,
      selectedWindow,
      taskState,
      withTimeout,
    ]
  )

  const toggleLateForgiven = useCallback(async () => {
    if (!isAdmin) return
    if (!activeTaskId) return
    if (!activeCompletion) return
    if (!activeCompletion.completedLate) return

    const before = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    if (!before) return
    const nextLateForgiven = !before.lateForgiven

    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        const existing = windowMap[activeTaskId]
        if (!existing) {
          resolve(prev)
          return prev
        }
        // Forgiveness should only remove the "late" penalty; it should not mark the task as admin-assigned.
        windowMap[activeTaskId] = { ...existing, lateForgiven: nextLateForgiven }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    setIsSaving(true)
    setSaveError(null)
    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const persist = completionToPersist
      ? persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist.assignees,
            completedAt: completionToPersist.completedAt,
            // Preserve original flags; this toggle should only change lateForgiven.
            assignedByAdmin: completionToPersist.assignedByAdmin ?? false,
            completedLate: completionToPersist.completedLate ?? true,
            lateForgiven: nextLateForgiven,
            completedEarly: completionToPersist.completedEarly ?? false,
            autoAssigned: completionToPersist.autoAssigned,
            deferredToClose: completionToPersist.deferredToClose,
            orderReportCounts: completionToPersist.orderReportCounts,
          },
        })
      : Promise.resolve()

    Promise.all([withTimeout(persist, 8000), new Promise((r) => setTimeout(r, 600))])
      .then(() => setIsSaving(false))
      .catch((error) => {
        // Revert optimistic change if the write fails.
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          if (before) windowMap[activeTaskId] = before
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          return next
        })
        setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
        setIsSaving(false)
      })
  }, [activeCompletion, activeTaskId, isAdmin, selectedDateKey, selectedWindow, taskState])

  /**
   * Auto-assign yum-yum-close to the last person who completed it.
   * Used when someone checks the task and it didn't need refilling.
   */
  const handleAutoAssignYumYum = useCallback(async () => {
    if (activeTaskId !== 'yum-yum-close') return
    if (activeCompletion) {
      setSaveError('Task already completed.')
      return
    }

    const lastCompleter = findLastTaskCompleter(taskState, 'yum-yum-close', selectedDateKey, selectedWindow)
    if (!lastCompleter) {
      setSaveError('No previous completion found.')
      return
    }

    const now = new Date()
    const windowConfig = WINDOWS.find((w) => w.key === selectedWindow)
    let isLate = false
    let isEarly = false
    if (windowConfig) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
      const startAt = combineDateTime(selectedDate, windowConfig.start)
      isEarly = now < startAt
    }

    appendSelectionLog({
      action: 'selected',
      taskId: activeTaskId,
      taskName: 'Yum Yum Sauce',
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: lastCompleter.assignees,
      byAdmin: isAdmin,
    })

    const beforeWindowPercent = computeWindowTaskPercent(taskState)

    windowCompleteStartScheduledRef.current = true
    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[activeTaskId] = {
          status: 'done',
          assignees: lastCompleter.assignees,
          completedAt: new Date().toISOString(),
          assignedByAdmin: false,
          completedLate: isLate,
          completedEarly: isEarly,
          autoAssigned: true,
        }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    const afterWindowPercent = computeWindowTaskPercent(updatedState)
    if (beforeWindowPercent < 100 && afterWindowPercent === 100) {
      const participants = computeCurrentWindowParticipants(updatedState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      startWindowCompleteCelebration({
        state: updatedState,
        windowLabel,
        participants,
      })
    }
    windowCompleteStartScheduledRef.current = false

    // Trigger pulse on the next incomplete task (local-only celebration)
    triggerNextTaskPulse(activeTaskId, updatedState)

    setIsSaving(true)
    setSaveError(null)

    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const persist = isAdmin
      ? persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? lastCompleter.assignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: completionToPersist?.assignedByAdmin ?? false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
          },
        })
      : persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: lastCompleter.assignees,
            completedAt: new Date().toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
          },
        })

    Promise.all([withTimeout(persist, 8000), new Promise((r) => setTimeout(r, 600))])
      .then(() => {
        setIsSaving(false)
        setShowEmployeeSelector(false)
        setActiveTaskId(null)
      })
      .catch((error) => {
        // Revert optimistic change if the write fails.
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap[activeTaskId]
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          return next
        })
        if (error instanceof Error && error.message === 'already-completed') {
          setSaveError('Already completed by someone else.')
        } else {
          setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
        }
        setIsSaving(false)
      })
  }, [activeCompletion, activeTaskId, computeWindowTaskPercent, getLateAfterForWindow, isAdmin, selectedDate, selectedDateKey, selectedWindow, startWindowCompleteCelebration, taskState, triggerNextTaskPulse])

  /**
   * Auto-assign combined ice tasks (ice-5pm / ice-close) to the last Left/Right assignees.
   * Used when someone checks the task and it didn't need refilling.
   */
  const handleAutoAssignIce = useCallback(async () => {
    if (activeTaskId !== 'ice-5pm' && activeTaskId !== 'ice-close') return
    if (isWindowTaskLocked(activeTaskId)) {
      setSaveError('This window is locked until unlock time.')
      return
    }
    if (activeCompletion) {
      setSaveError('Task already completed.')
      return
    }

    const lastCompletion = findLastTaskCompletion(taskState, activeTaskId, selectedDateKey, selectedWindow)
    const left = String(lastCompletion?.iceSides?.left || '').trim()
    const right = String(lastCompletion?.iceSides?.right || '').trim()
    if (!left || !right) {
      setSaveError('No previous completion found.')
      return
    }

    const lastAssignees = [left, right]

    const now = new Date()
    const windowConfig = WINDOWS.find((w) => w.key === selectedWindow)
    let isLate = false
    let isEarly = false
    if (windowConfig) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
      const startAt = combineDateTime(selectedDate, windowConfig.start)
      isEarly = now < startAt
    }

    appendSelectionLog({
      action: 'selected',
      taskId: activeTaskId,
      taskName: 'Ice (Left + Right)',
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: lastAssignees,
      byAdmin: isAdmin,
    })

    const beforeWindowPercent = computeWindowTaskPercent(taskState)

    windowCompleteStartScheduledRef.current = true
    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[activeTaskId] = {
          status: 'done',
          assignees: lastAssignees,
          completedAt: new Date().toISOString(),
          assignedByAdmin: false,
          completedLate: isLate,
          completedEarly: isEarly,
          autoAssigned: true,
          iceSides: { left, right },
        }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    const afterWindowPercent = computeWindowTaskPercent(updatedState)
    if (beforeWindowPercent < 100 && afterWindowPercent === 100) {
      const participants = computeCurrentWindowParticipants(updatedState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      startWindowCompleteCelebration({
        state: updatedState,
        windowLabel,
        participants,
      })
    }
    windowCompleteStartScheduledRef.current = false

    // Trigger pulse on the next incomplete task (local-only celebration)
    triggerNextTaskPulse(activeTaskId, updatedState)

    setIsSaving(true)
    setSaveError(null)

    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const persist = isAdmin
      ? persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? lastAssignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: completionToPersist?.assignedByAdmin ?? false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
            iceSides: { left, right },
          },
        })
      : persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: lastAssignees,
            completedAt: new Date().toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
            iceSides: { left, right },
          },
        })

    Promise.all([withTimeout(persist, 8000), new Promise((r) => setTimeout(r, 600))])
      .then(() => {
        setIsSaving(false)
        setPendingIceSide(null)
        setShowEmployeeSelector(false)
        setActiveTaskId(null)
      })
      .catch((error) => {
        // Revert optimistic change if the write fails.
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap[activeTaskId]
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          return next
        })
        if (error instanceof Error && error.message === 'already-completed') {
          setSaveError('Already completed by someone else.')
        } else {
          setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
        }
        setIsSaving(false)
      })
  }, [activeCompletion, activeTaskId, appendSelectionLog, computeWindowTaskPercent, isAdmin, isWindowTaskLocked, selectedDate, selectedDateKey, selectedWindow, startWindowCompleteCelebration, taskState, triggerNextTaskPulse])

  /**
   * Auto-assign peanuts-noodles-close to the last person who completed it.
   * Used when someone checks the task and it didn't need refilling.
   */
  const handleAutoAssignPeanutsNoodles = useCallback(async () => {
    if (activeTaskId !== 'peanuts-noodles-close') return
    if (isWindowTaskLocked(activeTaskId)) {
      setSaveError('This window is locked until unlock time.')
      return
    }
    if (activeCompletion) {
      setSaveError('Task already completed.')
      return
    }

    const lastCompleter = findLastTaskCompleter(taskState, 'peanuts-noodles-close', selectedDateKey, selectedWindow)
    if (!lastCompleter) {
      setSaveError('No previous completion found.')
      return
    }

    const now = new Date()
    const windowConfig = WINDOWS.find((w) => w.key === selectedWindow)
    let isLate = false
    let isEarly = false
    if (windowConfig) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
      const startAt = combineDateTime(selectedDate, windowConfig.start)
      isEarly = now < startAt
    }

    appendSelectionLog({
      action: 'selected',
      taskId: activeTaskId,
      taskName: 'Peanuts Crispy Noodles',
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: lastCompleter.assignees,
      byAdmin: isAdmin,
    })

    const beforeWindowPercent = computeWindowTaskPercent(taskState)

    windowCompleteStartScheduledRef.current = true
    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[activeTaskId] = {
          status: 'done',
          assignees: lastCompleter.assignees,
          completedAt: new Date().toISOString(),
          assignedByAdmin: false,
          completedLate: isLate,
          completedEarly: isEarly,
          autoAssigned: true,
        }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    const afterWindowPercent = computeWindowTaskPercent(updatedState)
    if (beforeWindowPercent < 100 && afterWindowPercent === 100) {
      const participants = computeCurrentWindowParticipants(updatedState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      startWindowCompleteCelebration({
        state: updatedState,
        windowLabel,
        participants,
      })
    }
    windowCompleteStartScheduledRef.current = false

    // Trigger pulse on the next incomplete task (local-only celebration)
    triggerNextTaskPulse(activeTaskId, updatedState)

    setIsSaving(true)
    setSaveError(null)

    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
    const persist = isAdmin
      ? persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: completionToPersist?.assignees ?? lastCompleter.assignees,
            completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
            assignedByAdmin: completionToPersist?.assignedByAdmin ?? false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
          },
        })
      : persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId: activeTaskId,
          completion: {
            assignees: lastCompleter.assignees,
            completedAt: new Date().toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
          },
        })

    Promise.all([withTimeout(persist, 8000), new Promise((r) => setTimeout(r, 600))])
      .then(() => {
        setIsSaving(false)
        setShowEmployeeSelector(false)
        setActiveTaskId(null)
      })
      .catch((error) => {
        // Revert optimistic change if the write fails.
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap[activeTaskId]
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          return next
        })
        if (error instanceof Error && error.message === 'already-completed') {
          setSaveError('Already completed by someone else.')
        } else {
          setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
        }
        setIsSaving(false)
      })
  }, [activeCompletion, activeTaskId, computeWindowTaskPercent, isAdmin, selectedDate, selectedDateKey, selectedWindow, startWindowCompleteCelebration, taskState, triggerNextTaskPulse])

  const saveOrderReport = useCallback(
    async (counts: Record<string, number>, opts?: { clear?: boolean }) => {
      if (!activeTaskId) return
      if (!isOrderReportTaskId) return
      if (!canEditTaskAssignmentsOnSelectedDate) return
      if (isWindowTaskLocked(activeTaskId)) {
        setSaveError('This window is locked until unlock time.')
        return
      }

      const [e0, e1] = orderReportEmployees
      if (!e0 || !e1 || e0 === e1) {
        const isClose = activeTaskId === 'order-report-close'
        if (!e0 || !e1) {
          setSaveError(
            isClose
              ? isAdmin
                ? 'Pick 2 employees for Close Order Report (admin).'
                : 'Close Order Report needs 2 night-shift employees. Complete a close task first.'
              : isAdmin
                ? 'Pick 2 employees for 5PM Order Report (admin), or set Break Selection.'
                : 'Set Break Selection (2 employees) before submitting Order Report.'
          )
        } else {
          setSaveError('Order Report needs two different employees.')
        }
        return
      }

      const taskId = activeTaskId
      const existingCompletion = taskState[selectedDateKey]?.[selectedWindow]?.[taskId]

      // Clear mode: delete/uncomplete the task (same-day allowed for non-admin).
      if (opts?.clear) {
        if (!existingCompletion) {
          // Already pending; nothing to clear.
          setActiveTaskId(null)
          return
        }
        if (!isAdmin && existingCompletion.assignedByAdmin) {
          setSaveError('Already completed. Ask an admin to clear.')
          return
        }
        if (!isAdmin) {
          const dayStart = new Date(selectedDateKey + 'T00:00:00')
          if (!Number.isFinite(dayStart.getTime())) {
            setSaveError('Could not clear (invalid date).')
            return
          }
          const dayEnd = new Date(dayStart)
          dayEnd.setHours(23, 59, 59, 999)
          if (Date.now() > dayEnd.getTime()) {
            setSaveError('Already completed. Ask an admin to clear.')
            return
          }
        }

        const beforeSnapshot = existingCompletion

        // Optimistically remove completion
        await new Promise<void>((resolve) => {
          setTaskState((prevState) => {
            const next: TaskState = { ...prevState }
            const dateMap = { ...(next[selectedDateKey] ?? {}) }
            const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
            delete windowMap[taskId]
            dateMap[selectedWindow] = windowMap
            next[selectedDateKey] = dateMap
            resolve()
            return next
          })
        })

        setActiveTaskId(null)
        setShowEmployeeSelector(false)
        setIsSaving(true)
        setSaveError(null)

        Promise.all([
          withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, taskId), 8000),
          new Promise((resolve) => setTimeout(resolve, 600)),
        ])
          .then(() => {
            setIsSaving(false)
          })
          .catch((error) => {
            console.error('Failed to clear Order Report:', error)
            // Restore local state if cloud delete fails
            if (beforeSnapshot) {
              setTaskState((prev) => {
                const next: TaskState = { ...prev }
                const day = { ...(next[selectedDateKey] ?? {}) }
                const w = { ...(day[selectedWindow] ?? {}) }
                w[taskId] = beforeSnapshot
                day[selectedWindow] = w
                next[selectedDateKey] = day
                return next
              })
            }
            setSaveError(error instanceof Error && error.message === 'timeout' ? 'Clear timed out. Check connection.' : 'Failed to clear. Try again.')
            setIsSaving(false)
          })
        return
      }

      // New completion should compute lateness; edits preserve timing/late flags.
      let isLate = false
      if (!existingCompletion) {
        const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
        isLate = now >= cutoff
      }

      // If both employees are working all day, mark 5PM Order Report as deferred to close.
      const slots = breakSelection?.slots || []
      const bothDoubleShift =
        slots.length >= 2 &&
        slots.every((s) => (s?.employee || '').trim()) &&
        slots.every((s) => s?.shiftType === 'double')
      const dayOfWeek = selectedDate.getDay()
      const closeTime = dayOfWeek === 5 || dayOfWeek === 6 ? '10' : '9'
      const deferredToClose =
        taskId === 'order-report-5pm' && selectedWindow === '17' && bothDoubleShift ? closeTime : undefined

      const beforeWindowPercent = computeWindowTaskPercent(taskState)

      windowCompleteStartScheduledRef.current = true
      const updatedState = await new Promise<TaskState>((resolve) => {
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          const prevCompletion = windowMap[taskId]
          windowMap[taskId] = prevCompletion
            ? {
                ...prevCompletion,
                assignees: [e0, e1],
                // Preserve assignedByAdmin on edits unless explicitly changed via the admin Assign/Complete controls.
                assignedByAdmin: prevCompletion.assignedByAdmin ?? false,
                deferredToClose,
                orderReportCounts: counts,
              }
            : {
                status: 'done',
                assignees: [e0, e1],
                completedAt: new Date().toISOString(),
                // Admin completions default to normal completion (not admin-assigned).
                assignedByAdmin: false,
                completedLate: isLate,
                lateForgiven: false,
                completedEarly: false,
                deferredToClose,
                orderReportCounts: counts,
              }
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          resolve(next)
          return next
        })
      })

      const afterWindowPercent = computeWindowTaskPercent(updatedState)
      const willHitHundredPercent = beforeWindowPercent < 100 && afterWindowPercent === 100

      // Order Report celebration: scroll to top + dual-sided star burst + dual score count-up.
      try {
        const { windowTaskWeights, taskWeightByIdByWindow } = getWeightsForDateKey(selectedDateKey)
        const beforeRowsRaw = computeShiftLeadersForState(
          taskState,
          selectedDateKey,
          selectedShift,
          SHIFT_WINDOWS,
          windowTaskWeights,
          taskWeightByIdByWindow,
          isSoloScoreCappedForShift(selectedDateKey, selectedShift),
          fairSplitForSelectedDateAndShift
        )
        const afterRowsRaw = computeShiftLeadersForState(
          updatedState,
          selectedDateKey,
          selectedShift,
          SHIFT_WINDOWS,
          windowTaskWeights,
          taskWeightByIdByWindow,
          isSoloScoreCappedForShift(selectedDateKey, selectedShift),
          fairSplitForSelectedDateAndShift
        )

        const beforeParticipants = computeShiftHudParticipantsForState(taskState, selectedDateKey, selectedShift, SHIFT_WINDOWS)
        const afterParticipants = computeShiftHudParticipantsForState(updatedState, selectedDateKey, selectedShift, SHIFT_WINDOWS)
        const beforeRows = beforeRowsRaw.filter((r) => beforeParticipants.has(r.name))
        const afterRows = afterRowsRaw.filter((r) => afterParticipants.has(r.name))

        const { p1: afterP1, p2: afterP2 } = shiftHudCelebrationPairRows(afterRows, activeSplitHudPair)

        const p1Name = afterP1?.name
        const p2Name = afterP2?.name
        const p1From = p1Name ? shiftHudScoreForCelebration(beforeRows.find((r) => r.name === p1Name)) : 0
        const p2From = p2Name ? shiftHudScoreForCelebration(beforeRows.find((r) => r.name === p2Name)) : 0
        const p1To = p1Name ? shiftHudScoreForCelebration(afterRows.find((r) => r.name === p1Name)) : 0
        const p2To = p2Name ? shiftHudScoreForCelebration(afterRows.find((r) => r.name === p2Name)) : 0

        // Set starting values immediately so the user sees "before" values, then animate to "after".
        const startAt = Date.now()
        if (afterP1 && p1ScoreRef.current) {
          setP1ScoreOverride(p1From)
          setScoreAnimP1({ from: p1From, to: p1To, startedAt: startAt })
        }
        if (afterP2 && p2ScoreRef.current) {
          setP2ScoreOverride(p2From)
          setScoreAnimP2({ from: p2From, to: p2To, startedAt: startAt })
        }

        // Order Report: v2 scrolls to top for HUD visibility; v3 uses floating Shift HUD notification (no scroll).
        setRewardStars([])
        if (!isV3Ui) {
          window.setTimeout(() => {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
            const starDelay = prefersReducedMotion ? 50 : 550
            window.setTimeout(() => {
              const hasP1Target = afterP1 && p1ScoreRef.current
              const hasP2Target = afterP2 && p2ScoreRef.current

              if (hasP1Target) {
                spawnRewardStars(p1ScoreRef.current, { origin: 'left', count: 18, append: true })
              }
              if (hasP2Target) {
                spawnRewardStars(p2ScoreRef.current, { origin: 'right', count: 18, append: true })
              }

              if (!hasP1Target && !hasP2Target) {
                const fallbackTarget = shiftHudHeaderRef.current
                if (fallbackTarget) {
                  spawnRewardStars(fallbackTarget, { origin: 'left', count: 18, append: false })
                  spawnRewardStars(fallbackTarget, { origin: 'right', count: 18, append: true })
                }
              }
            }, starDelay)
          }, 100)
        } else {
          window.setTimeout(() => {
            const useMainHud = isMainShiftHudMostlyVisible()
            const openedNotify = !useMainHud
            if (openedNotify) setV3ShiftNotifyOpen(true)
            const starDelay = prefersReducedMotion ? 50 : 400
            window.setTimeout(() => {
              const hasP1Target = afterP1 && (useMainHud ? p1ScoreRef.current : v3NotifyP1ScoreRef.current)
              const hasP2Target = afterP2 && (useMainHud ? p2ScoreRef.current : v3NotifyP2ScoreRef.current)

              if (hasP1Target) {
                const t = (useMainHud ? p1ScoreRef.current : v3NotifyP1ScoreRef.current) as HTMLElement
                spawnRewardStars(t, { origin: 'left', count: 18, append: true })
              }
              if (hasP2Target) {
                const t = (useMainHud ? p2ScoreRef.current : v3NotifyP2ScoreRef.current) as HTMLElement
                spawnRewardStars(t, { origin: 'right', count: 18, append: true })
              }

              if (!hasP1Target && !hasP2Target) {
                const fallbackTarget = useMainHud
                  ? (shiftHudExtraRef.current || shiftHudHeaderRef.current)
                  : v3ShiftNotifyHeaderRef.current
                if (fallbackTarget) {
                  spawnRewardStars(fallbackTarget, { origin: 'left', count: 18, append: false })
                  spawnRewardStars(fallbackTarget, { origin: 'right', count: 18, append: true })
                }
              }
              if (openedNotify) window.setTimeout(() => setV3ShiftNotifyOpen(false), 2600)
            }, starDelay)
          }, 100)
        }
      } catch {
        // ignore celebration failures
      }

      // Window 100% celebration: schedule after stars finish (Order Report always has stars).
      if (willHitHundredPercent) {
        const participants = computeCurrentWindowParticipants(updatedState)
        const windowLabel = getWindowLabel(selectedDate, selectedWindow)
        startWindowCompleteCelebration({
          state: updatedState,
          windowLabel,
          participants,
          waitForStars: true,
        })
      }
      windowCompleteStartScheduledRef.current = false

      // Close immediately for fast feedback
      setActiveTaskId(null)
      setShowEmployeeSelector(false)
      setIsSaving(true)
      setSaveError(null)

      const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[taskId]
      const persistPayload = {
        assignees: completionToPersist?.assignees ?? [e0, e1],
        completedAt: completionToPersist?.completedAt ?? new Date().toISOString(),
        assignedByAdmin: completionToPersist?.assignedByAdmin,
        completedLate: completionToPersist?.completedLate,
        lateForgiven: completionToPersist?.lateForgiven,
        completedEarly: completionToPersist?.completedEarly,
        autoAssigned: completionToPersist?.autoAssigned,
        deferredToClose: completionToPersist?.deferredToClose,
        orderReportCounts: completionToPersist?.orderReportCounts,
      }

      const persist = existingCompletion
        ? persistAdminSetTaskCompletionOrNoop({
            dateKey: selectedDateKey,
            windowKey: selectedWindow,
            taskId,
            completion: persistPayload,
          })
        : persistCompleteTaskIfAvailableOrNoop({
            dateKey: selectedDateKey,
            windowKey: selectedWindow,
            taskId,
            completion: persistPayload,
          })

      Promise.all([withTimeout(persist, 8000), new Promise((resolve) => setTimeout(resolve, 600))])
        .then(() => {
          setIsSaving(false)
        })
        .catch((error) => {
          console.error('Failed to save Order Report:', error)
          if (error instanceof Error && error.message === 'already-completed') {
            setSaveError('Already completed by someone else.')
          } else {
            setSaveError(error instanceof Error && error.message === 'timeout' ? 'Save timed out. Check connection.' : 'Failed to save. Try again.')
          }
          setIsSaving(false)
        })
    },
    [
      activeTaskId,
      breakSelection?.slots,
      canEditTaskAssignmentsOnSelectedDate,
      computeWindowTaskPercent,
      getLateAfterForWindow,
      getWeightsForDateKey,
      isAdmin,
      isOrderReportTaskId,
      isTodaySelected,
      isV3Ui,
      isWindowTaskLocked,
      now,
      orderReportEmployees,
      prefersReducedMotion,
      selectedDate,
      selectedDateKey,
      selectedShift,
      selectedWindow,
      SHIFT_WINDOWS,
      spawnRewardStars,
      taskState,
      startWindowCompleteCelebration,
      withTimeout,
    ]
  )

  const handleDragStart = useCallback(
    (taskId: string, e: React.DragEvent) => {
      if (isAdmin) {
        setDraggedTaskId(taskId)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/html', taskId)
      }
    },
    [isAdmin]
  )

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null)
    setDragOverTaskId(null)
  }, [])

  const handleDragEnter = useCallback(
    (taskId: string) => {
    if (isAdmin && draggedTaskId && draggedTaskId !== taskId) {
      setDragOverTaskId(taskId)
    }
    },
    [draggedTaskId, isAdmin]
  )

  const handleDragLeave = useCallback(() => {
    setDragOverTaskId(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isAdmin && draggedTaskId) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [draggedTaskId, isAdmin])

  const handleDrop = useCallback(
    (targetTaskId: string, e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (!isAdmin || !draggedTaskId || draggedTaskId === targetTaskId) {
        setDraggedTaskId(null)
        setDragOverTaskId(null)
        return
      }

      // v3: reorder only from admin portal (taskOrderV3), not drag-and-drop
      if (uiVariant === 'v3') {
        setDraggedTaskId(null)
        setDragOverTaskId(null)
        return
      }

      // Match on-screen order: v3 stage view uses stage1 then stage2, not raw taskOrder interleaving
      const currentOrder =
        stagedTasks != null
          ? [...stagedTasks.stage1.map((t) => t.id), ...stagedTasks.stage2.map((t) => t.id)]
          : currentTasks.map((t) => t.id)
      const draggedIndex = currentOrder.indexOf(draggedTaskId)
      const targetIndex = currentOrder.indexOf(targetTaskId)

      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedTaskId(null)
        setDragOverTaskId(null)
        return
      }

      const newOrder = [...currentOrder]
      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedTaskId)

      setTaskOrder({ ...taskOrder, [selectedWindow]: newOrder })
      setDraggedTaskId(null)
      setDragOverTaskId(null)
    },
    [currentTasks, draggedTaskId, isAdmin, selectedWindow, stagedTasks, taskOrder, uiVariant]
  )

  const handleTaskClick = useCallback(
    (taskId: string, opts?: { bypassSyntheticClickGuard?: boolean }) => {
      if (!opts?.bypassSyntheticClickGuard && shouldIgnoreClick()) return
      if (isWindowTaskLocked(taskId)) return
      if (!draggedTaskId) {
        const el = document.querySelector(`[data-task-id="${taskId}"]`)
        if (el) activeCardRectRef.current = el.getBoundingClientRect()
        captureScrollYForNextLock()
        setActiveTaskId(taskId)
      }
    },
    [captureScrollYForNextLock, draggedTaskId, isWindowTaskLocked, shouldIgnoreClick]
  )

  /**
   * Shared (non-ice) split-panel tasks: open the normal task flow so the user confirms
   * completion in the modal (split picker restricted to A/B via splitPickerRestrict).
   */
  const handleSplitSuggestCardClick = useCallback(
    (taskId: string) => {
      taskSplitOpenPrefillRef.current = null
      handleTaskClick(taskId, { bypassSyntheticClickGuard: true })
    },
    [handleTaskClick],
  )

  const splitPickerRestrict = useMemo<string[] | null>(() => {
    if (taskSplitInlinePhase !== 'active') return null
    const r = taskSplitResult
    if (!r || !activeTaskId) return null
    const shared = (r.finalSharedTaskIds || []).includes(activeTaskId)
    const assigned = activeTaskId in r.finalAssignment
    if (!shared && !assigned) return null
    const a = String(r.employeeA || '').trim()
    const b = String(r.employeeB || '').trim()
    if (!a || !b || a === b) return null
    return [a, b]
  }, [taskSplitInlinePhase, taskSplitResult, activeTaskId])

  const randomTaskPickPool = useMemo(() => {
    return currentTasks.filter((task) => {
      const taskStatus = statusByTask[task.id]?.status ?? 'pending'
      if (taskStatus === 'done') return false
      const completion = statusByTask[task.id]?.completion
      const interactionLocked =
        (selectedWindow === '17' && !!completion?.deferredToClose) ||
        (task.id === 'order-report-5pm' && selectedWindow === '17' && selectedBothDoubleShift)
      return !interactionLocked
    })
  }, [currentTasks, selectedBothDoubleShift, selectedWindow, statusByTask])

  const handleRandomTaskPick = useCallback(() => {
    if (randomTaskPickPool.length === 0) return
    const task = randomTaskPickPool[Math.floor(Math.random() * randomTaskPickPool.length)]!
    // Touch path: dice onClick guards duplicate synthetic click; bypass here so open isn't blocked.
    handleTaskClick(task.id, { bypassSyntheticClickGuard: true })
  }, [handleTaskClick, randomTaskPickPool])

  /**
   * Greeting 🎲 (opt-in via admin `diceEnabled`):
   *  - Beta only: may seed a minimal two-person break plan for testing.
   *  - 5PM/9PM: opens the fair-split setup modal → AI panel.
   *  - Other windows: picks a random incomplete task.
   */
  const handleDiceTap = useCallback(() => {
    lastInteractionTsRef.current = Date.now()
    if (deploymentChannel === 'beta') {
      seedBetaDiceTestShiftPlanIfNeeded()
    }
    if (selectedWindow === '17' || selectedWindow === '21') {
      openTaskSplitSetup()
      return
    }
    handleRandomTaskPick()
  }, [deploymentChannel, handleRandomTaskPick, openTaskSplitSetup, seedBetaDiceTestShiftPlanIfNeeded, selectedWindow])

  // Shared tap-vs-scroll detector so scrolling stays smooth.
  // Threshold is intentionally forgiving: on a large, low-DPI iPad a stationary
  // fat-finger tap can drift several px, and a busy main thread (A-series chip)
  // makes that worse. Anything under this is treated as a tap, not a scroll.
  const TAP_MOVE_THRESHOLD = 16
  const tapStateRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const beginTap = useCallback((e: React.TouchEvent) => {
    // NOTE: do NOT recordTouch() here. The "ignore the synthetic click" window
    // must only start once a tap is actually handled in endTap, otherwise a tap
    // that endTap drops (e.g. flagged as moved) also has its click fallback
    // suppressed, dropping the interaction entirely and forcing repeat taps.
    const t = e.touches && e.touches.length ? e.touches[0] : null
    if (!t) return
    tapStateRef.current = { x: t.clientX, y: t.clientY, moved: false }
  }, [])
  const moveTap = useCallback((e: React.TouchEvent) => {
    const s = tapStateRef.current
    if (!s) return
    const t = e.touches && e.touches.length ? e.touches[0] : null
    if (!t) return
    const dx = Math.abs(t.clientX - s.x)
    const dy = Math.abs(t.clientY - s.y)
    if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) s.moved = true
  }, [])
  const endTap = useCallback(
    (action: () => void, e: React.TouchEvent) => {
      const s = tapStateRef.current
      tapStateRef.current = null
      if (!s) return
      // Re-check movement from the lifted finger. touchmove can fail to fire on a
      // busy main thread, so don't rely on it alone to classify a tap.
      let moved = s.moved
      const ct = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null
      if (ct) {
        const dx = Math.abs(ct.clientX - s.x)
        const dy = Math.abs(ct.clientY - s.y)
        if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) moved = true
      }
      if (moved) return
      action()
      // Successful tap: start the ignore-click window and prevent the delayed
      // synthetic click so the action doesn't double-fire.
      recordTouch()
      e.preventDefault()
    },
    [recordTouch]
  )

  const POWERED_BY_TAP_UNLOCK_COUNT = 5
  const POWERED_BY_TAP_RESET_MS = 2000

  const showWindowUnlockToast = useCallback((windowLabel: string) => {
    if (windowUnlockToastTimeoutRef.current) window.clearTimeout(windowUnlockToastTimeoutRef.current)
    setWindowUnlockToast(windowLabel)
    windowUnlockToastTimeoutRef.current = window.setTimeout(() => {
      windowUnlockToastTimeoutRef.current = null
      setWindowUnlockToast(null)
    }, 2200)
  }, [])

  const handlePoweredByUnlockTap = useCallback(() => {
    if (!windowTimeLocked) {
      poweredByTapRef.current = { count: 0, lastMs: 0 }
      return
    }
    const nowMs = Date.now()
    if (nowMs - poweredByTapRef.current.lastMs > POWERED_BY_TAP_RESET_MS) {
      poweredByTapRef.current = { count: 1, lastMs: nowMs }
      return
    }
    poweredByTapRef.current.count += 1
    poweredByTapRef.current.lastMs = nowMs
    if (poweredByTapRef.current.count < POWERED_BY_TAP_UNLOCK_COUNT) return
    poweredByTapRef.current = { count: 0, lastMs: 0 }
    setManualWindowUnlockKeys((prev) => {
      const next = new Set(prev)
      next.add(windowUnlockKey)
      return next
    })
    showWindowUnlockToast(getWindowLabel(selectedDate, selectedWindow))
  }, [selectedDate, selectedWindow, showWindowUnlockToast, windowTimeLocked, windowUnlockKey])

  const dailyTaskTeaserEl = useMemo(
    () =>
      !shouldShowDailyTaskTeaser || suppressDailyTaskInlineUnmount ? null : (
        <DailyTaskTeaserCard
          ref={dailyTaskTeaserCardRef}
          layoutLocked={isTaskCardModalOpen}
          label={
            activeDailyTaskRun?.revealedAtMs
              ? activeDailyTaskDef?.name || (isDemoDaySelected ? 'Demo Task' : "Today's Task")
              : isDemoDaySelected
                ? 'Demo Task'
                : "Today's Task"
          }
          completed={!!activeDailyTaskRun?.completedAtMs}
          completedBy={
            (activeDailyTaskRun?.completedByList && activeDailyTaskRun.completedByList.length
              ? activeDailyTaskRun.completedByList.join(' + ')
              : '') ||
            activeDailyTaskRun?.completedBy ||
            ''
          }
          attention={
            !isTaskCardModalOpen &&
            !prefersReducedMotion &&
            !(activeDailyTaskRun?.revealedAtMs || activeDailyTaskRun?.completedAtMs)
          }
          onOpen={() => {
            if (shouldIgnoreClick()) return
            captureScrollYForNextLock()
            if (activeDailyTaskRun?.revealedAtMs && !activeDailyTaskRun?.completedAtMs) {
              setDailyTaskStep(1)
            }
            setShowDailyTaskModal(true)
          }}
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) =>
            endTap(() => {
              captureScrollYForNextLock()
              if (activeDailyTaskRun?.revealedAtMs && !activeDailyTaskRun?.completedAtMs) {
                setDailyTaskStep(1)
              }
              setShowDailyTaskModal(true)
            }, e)
          }
        />
      ),
    [
      shouldShowDailyTaskTeaser,
      suppressDailyTaskInlineUnmount,
      isTaskCardModalOpen,
      activeDailyTaskRun,
      activeDailyTaskDef?.name,
      isDemoDaySelected,
      prefersReducedMotion,
      shouldIgnoreClick,
      captureScrollYForNextLock,
      beginTap,
      moveTap,
      endTap,
    ]
  )

  const showFloatingDailyTaskNotification =
    shouldShowDailyTaskTeaser &&
    !suppressDailyTaskFloating &&
    !activeDailyTaskRun?.completedAtMs &&
    taskProgress.percent === 100 &&
    floatingDailyTaskDelayReady

  const dailyTaskFloatingNotificationEl = useMemo(
    () =>
      !showFloatingDailyTaskNotification ? null : (
        <div className="daily-task-floating-notice" aria-live="polite">
          <DailyTaskTeaserCard
            className="daily-task-teaser--notification"
            ref={dailyTaskTeaserCardRef}
            label={
              activeDailyTaskRun?.revealedAtMs
                ? activeDailyTaskDef?.name || (isDemoDaySelected ? 'Demo Task' : "Today's Task")
                : isDemoDaySelected
                  ? 'Demo Task'
                  : "Today's Task"
            }
            subtitle="Daily task incomplete - tap to open"
            completed={false}
            completedBy=""
            attention={!prefersReducedMotion}
            onOpen={() => {
              if (shouldIgnoreClick()) return
              captureScrollYForNextLock()
              if (activeDailyTaskRun?.revealedAtMs && !activeDailyTaskRun?.completedAtMs) {
                setDailyTaskStep(1)
              }
              setShowDailyTaskModal(true)
            }}
            onTouchStart={beginTap}
            onTouchMove={moveTap}
            onTouchEnd={(e) =>
              endTap(() => {
                captureScrollYForNextLock()
                if (activeDailyTaskRun?.revealedAtMs && !activeDailyTaskRun?.completedAtMs) {
                  setDailyTaskStep(1)
                }
                setShowDailyTaskModal(true)
              }, e)
            }
          />
        </div>
      ),
    [
      activeDailyTaskDef?.name,
      activeDailyTaskRun?.completedAtMs,
      activeDailyTaskRun?.revealedAtMs,
      beginTap,
      captureScrollYForNextLock,
      endTap,
      isDemoDaySelected,
      prefersReducedMotion,
      shouldIgnoreClick,
      showFloatingDailyTaskNotification,
      moveTap,
    ]
  )

  const dailyTaskInlineTeaserEl = showFloatingDailyTaskNotification ? null : dailyTaskTeaserEl

  const handleTaskTouchStart = useCallback(
    (_taskId: string, e: React.TouchEvent) => {
      if (isAdmin) return
      beginTap(e)
    },
    [beginTap, isAdmin]
  )
  const handleTaskTouchMove = useCallback(
    (e: React.TouchEvent) => {
      moveTap(e)
    },
    [moveTap]
  )
  const handleTaskTouchEnd = useCallback(
    (taskId: string, e: React.TouchEvent) => {
      if (isAdmin) return
      endTap(() => {
        if (isWindowTaskLocked(taskId)) return
        if (!draggedTaskId) {
          const el = document.querySelector(`[data-task-id="${taskId}"]`)
          if (el) activeCardRectRef.current = el.getBoundingClientRect()
          captureScrollYForNextLock()
          setActiveTaskId(taskId)
        }
      }, e)
    },
    [captureScrollYForNextLock, draggedTaskId, endTap, isAdmin, isWindowTaskLocked]
  )

  const handleWindowCompleteTileClick = useCallback(
    (taskId: string) => {
      if (!taskId) return
      if (shouldIgnoreClick()) return
      captureScrollYForNextLock()
      setActiveTaskId(taskId)
    },
    [captureScrollYForNextLock, shouldIgnoreClick]
  )

  const animateCloseAndDismiss = useCallback(() => {
    if (isClosingModalRef.current) return
    const sheet = modalSheetRef.current
    const targetCardRect = (() => {
      if (activeTaskId) {
        const liveCard = document.querySelector<HTMLElement>(`[data-task-id="${activeTaskId}"]`)
        if (liveCard) return liveCard.getBoundingClientRect()
      }
      return activeCardRectRef.current
    })()

    if (!sheet || !targetCardRect || prefersReducedMotion || typeof sheet.animate !== 'function') {
      activeCardRectRef.current = null
      setActiveTaskId(null)
      return
    }

    isClosingModalRef.current = true
    const sheetRect = sheet.getBoundingClientRect()
    const scaleX = targetCardRect.width / sheetRect.width
    const scaleY = targetCardRect.height / sheetRect.height
    const translateX =
      targetCardRect.left + targetCardRect.width / 2 - (sheetRect.left + sheetRect.width / 2)
    const translateY =
      targetCardRect.top + targetCardRect.height / 2 - (sheetRect.top + sheetRect.height / 2)

    const backdrop = sheet.parentElement
    if (backdrop) {
      backdrop.animate([{ opacity: '1' }, { opacity: '0' }], {
        duration: 235,
        easing: 'ease-in',
        fill: 'forwards',
      })
    }

    const anim = sheet.animate([
      {
        transform: 'translate(0, 0) scale(1, 1)',
        borderRadius: '24px',
        opacity: '1',
      },
      {
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
        borderRadius: '16px',
        opacity: '0',
      },
    ], {
      duration: 270,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
      fill: 'forwards',
    })

    anim.onfinish = () => {
      isClosingModalRef.current = false
      activeCardRectRef.current = null
      flushSync(() => {
        setActiveTaskId(null)
      })
    }
  }, [activeTaskId, prefersReducedMotion])

  /** v3: slide task modal down off-screen after successful completion (not cancel). v2: runs callback immediately. */
  const animateSuccessSlideDownAndDismiss = useCallback(
    (onFinished: () => void, animOpts?: { bypassReducedMotion?: boolean }) => {
      const bypassRm = !!animOpts?.bypassReducedMotion
      if (!isV3Ui) {
        onFinished()
        return
      }
      if (isClosingModalRef.current) {
        onFinished()
        return
      }
      const sheet = modalSheetRef.current
      if (!sheet || (prefersReducedMotion && !bypassRm) || typeof sheet.animate !== 'function') {
        activeCardRectRef.current = null
        onFinished()
        return
      }
      isClosingModalRef.current = true
      setModalSuccessDismiss(true)
      const sheetRect = sheet.getBoundingClientRect()
      const dy = window.innerHeight - sheetRect.top + 32
      const backdrop = sheet.parentElement
      const anim = sheet.animate(
        [
          { transform: 'translate(0px, 0px)', opacity: 1 },
          { transform: `translate(0px, ${dy}px)`, opacity: 0.92 },
        ],
        {
          duration: celebrationTiming.v3SlideDurationMs,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        }
      )
      if (backdrop) {
        backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: celebrationTiming.v3BackdropFadeMs,
          easing: 'ease-in',
          fill: 'forwards',
        })
      }
      anim.onfinish = () => {
        isClosingModalRef.current = false
        setModalSuccessDismiss(false)
        activeCardRectRef.current = null
        onFinished()
      }
    },
    [
      celebrationTiming.v3BackdropFadeMs,
      celebrationTiming.v3SlideDurationMs,
      isV3Ui,
      prefersReducedMotion,
    ]
  )

  const playV3TaskCompletionCelebration = useCallback(
    (
      pending: { slot: 'p1' | 'p2' | null; beforeScore: number; afterScore: number },
      animOpts?: { bypassReducedMotion?: boolean },
    ) => {
      const { slot, beforeScore, afterScore } = pending
      const bypassRm = !!animOpts?.bypassReducedMotion
      const starOpts = bypassRm ? { bypassReducedMotion: true as const } : undefined
      const useMainHud = isMainShiftHudMostlyVisible()
      const openedNotify = !useMainHud
      if (openedNotify) setV3ShiftNotifyOpen(true)
      const leadInMs =
        prefersReducedMotion && !bypassRm
          ? celebrationTiming.v3CelebrationLeadInMs
          : openedNotify
            ? celebrationTiming.v3CelebrationLeadInMs
            : 0
      const runV3CelebrationBody = () => {
        if (slot === 'p1') {
          const p1Target = useMainHud ? p1ScoreRef.current : v3NotifyP1ScoreRef.current
          if (p1Target) {
            setP1ScoreOverride(beforeScore)
            rewardTargetRef.current = p1Target
            spawnRewardStarsAfterLayoutSettle(p1Target, starOpts)
            setScoreAnim({ slot: 'p1', from: beforeScore, to: afterScore, startedAt: Date.now() })
            if (openedNotify) window.setTimeout(() => setV3ShiftNotifyOpen(false), 2400)
            return
          }
        }
        if (slot === 'p2') {
          const p2Target = useMainHud ? p2ScoreRef.current : v3NotifyP2ScoreRef.current
          if (p2Target) {
            setP2ScoreOverride(beforeScore)
            rewardTargetRef.current = p2Target
            spawnRewardStarsAfterLayoutSettle(p2Target, starOpts)
            setScoreAnim({ slot: 'p2', from: beforeScore, to: afterScore, startedAt: Date.now() })
            if (openedNotify) window.setTimeout(() => setV3ShiftNotifyOpen(false), 2400)
            return
          }
        }
        setShiftHudPulse(true)
        const fallback = useMainHud
          ? (shiftHudExtraRef.current || shiftHudHeaderRef.current)
          : v3ShiftNotifyHeaderRef.current
        if (fallback) {
          rewardTargetRef.current = fallback
          spawnRewardStarsAfterLayoutSettle(fallback, starOpts)
        }
        if (openedNotify) window.setTimeout(() => setV3ShiftNotifyOpen(false), 2400)
      }
      const scheduleBody = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(runV3CelebrationBody)
        })
      }
      if (leadInMs <= 0) {
        scheduleBody()
      } else {
        window.setTimeout(scheduleBody, leadInMs)
      }
    },
    [
      celebrationTiming.v3CelebrationLeadInMs,
      isMainShiftHudMostlyVisible,
      prefersReducedMotion,
      spawnRewardStarsAfterLayoutSettle,
    ]
  )

  /** v3 only: optional tasks — complete with no assignees ("didn't need to complete"); undo clears for a real completion. */
  const handleV3OptionalDidNotNeedToComplete = useCallback(async () => {
    if (!isV3Ui) return
    const taskId = activeTaskId
    if (
      taskId !== 'yum-yum-close' &&
      taskId !== 'ice-5pm' &&
      taskId !== 'ice-close' &&
      taskId !== 'peanuts-noodles-close'
    ) {
      return
    }
    if (isWindowTaskLocked(taskId)) {
      setSaveError('This window is locked until unlock time.')
      return
    }
    if (activeCompletion) {
      setSaveError('Task already completed.')
      return
    }
    if (!(isTodaySelected || isDemoDaySelected || isAdmin)) {
      setSaveError('Editing locked for this date.')
      return
    }

    const now = new Date()
    const windowConfig = WINDOWS.find((w) => w.key === selectedWindow)
    let isLate = false
    let isEarly = false
    if (windowConfig) {
      const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
      isLate = now >= cutoff
      const startAt = combineDateTime(selectedDate, windowConfig.start)
      isEarly = now < startAt
    }

    appendSelectionLog({
      action: 'selected',
      taskId,
      taskName: activeTask?.name ?? taskId,
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: [],
      byAdmin: isAdmin,
    })

    const beforeWindowPercent = computeWindowTaskPercent(taskState)

    windowCompleteStartScheduledRef.current = true
    const updatedState = await new Promise<TaskState>((resolve) => {
      setTaskState((prev) => {
        const next: TaskState = { ...prev }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        windowMap[taskId] = {
          status: 'done',
          assignees: [],
          completedAt: now.toISOString(),
          assignedByAdmin: false,
          completedLate: isLate,
          completedEarly: isEarly,
          autoAssigned: true,
          didNotNeedToComplete: true,
        }
        dateMap[selectedWindow] = windowMap
        next[selectedDateKey] = dateMap
        resolve(next)
        return next
      })
    })

    const afterWindowPercent = computeWindowTaskPercent(updatedState)
    if (beforeWindowPercent < 100 && afterWindowPercent === 100) {
      const participants = computeCurrentWindowParticipants(updatedState)
      const windowLabel = getWindowLabel(selectedDate, selectedWindow)
      startWindowCompleteCelebration({
        state: updatedState,
        windowLabel,
        participants,
      })
    }
    windowCompleteStartScheduledRef.current = false

    triggerNextTaskPulse(taskId, updatedState)

    setIsSaving(true)
    setSaveError(null)

    const completionToPersist = updatedState[selectedDateKey]?.[selectedWindow]?.[taskId]
    const persist = isAdmin
      ? persistAdminSetTaskCompletionOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId,
          completion: {
            assignees: completionToPersist?.assignees ?? [],
            completedAt: completionToPersist?.completedAt ?? now.toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
            didNotNeedToComplete: true,
          },
        })
      : persistCompleteTaskIfAvailableOrNoop({
          dateKey: selectedDateKey,
          windowKey: selectedWindow,
          taskId,
          completion: {
            assignees: [],
            completedAt: now.toISOString(),
            assignedByAdmin: false,
            completedLate: isLate,
            lateForgiven: false,
            completedEarly: isEarly,
            autoAssigned: true,
            didNotNeedToComplete: true,
          },
        })

    Promise.all([withTimeout(persist, 8000), new Promise((r) => setTimeout(r, 600))])
      .then(() => {
        setIsSaving(false)
        setPendingIceSide(null)
        setShowEmployeeSelector(false)
        animateSuccessSlideDownAndDismiss(() => {
          playV3TaskCompletionCelebration({ slot: null, beforeScore: 0, afterScore: 0 })
        })
      })
      .catch((error) => {
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap[taskId]
          dateMap[selectedWindow] = windowMap
          next[selectedDateKey] = dateMap
          return next
        })
        if (error instanceof Error && error.message === 'already-completed') {
          setSaveError('Already completed by someone else.')
        } else {
          setSaveError(
            error instanceof Error && error.message === 'timeout'
              ? 'Save timed out. Check connection.'
              : 'Failed to save. Try again.'
          )
        }
        setIsSaving(false)
      })
  }, [
    activeCompletion,
    activeTask?.name,
    activeTaskId,
    animateSuccessSlideDownAndDismiss,
    appendSelectionLog,
    computeCurrentWindowParticipants,
    computeWindowTaskPercent,
    getWindowLabel,
    isAdmin,
    isDemoDaySelected,
    isTodaySelected,
    isV3Ui,
    persistAdminSetTaskCompletionOrNoop,
    persistCompleteTaskIfAvailableOrNoop,
    playV3TaskCompletionCelebration,
    startWindowCompleteCelebration,
    selectedDate,
    selectedDateKey,
    selectedWindow,
    taskState,
    triggerNextTaskPulse,
    withTimeout,
    isWindowTaskLocked,
  ])

  const undoV3DidNotNeedToComplete = useCallback(
    async (taskId: string) => {
      if (!isV3Ui) return
      if (isWindowTaskLocked(taskId)) {
        setSaveError('This window is locked until unlock time.')
        return
      }
      const completion = taskState[selectedDateKey]?.[selectedWindow]?.[taskId]
      if (!completion?.didNotNeedToComplete) return
      if (!(isTodaySelected || isDemoDaySelected || isAdmin)) {
        setSaveError('Cannot undo on this date.')
        return
      }
      const beforeSnapshot = completion
      const orderReportsToClearOnBreakUndo =
        taskId === 'break-selection'
          ? SOLO_AUTO_ORDER_REPORT_TARGETS.filter((t) =>
              isSoloAutoDidNotNeedPlaceholder(taskState[selectedDateKey]?.[t.windowKey]?.[t.taskId])
            )
          : []
      const orderReportSnapshotsBeforeUndo = orderReportsToClearOnBreakUndo
        .map((t) => {
          const c = taskState[selectedDateKey]?.[t.windowKey]?.[t.taskId]
          return c ? { ...t, completion: c } : null
        })
        .filter((x): x is { windowKey: WindowKey; taskId: string; completion: TaskCompletion } => x !== null)
      await new Promise<void>((resolve) => {
        setTaskState((prev) => {
          const next: TaskState = { ...prev }
          const dateMap = { ...(next[selectedDateKey] ?? {}) }
          const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
          delete windowMap[taskId]
          if (Object.keys(windowMap).length === 0) {
            delete dateMap[selectedWindow]
          } else {
            dateMap[selectedWindow] = windowMap
          }

          if (taskId === 'break-selection') {
            for (const t of orderReportsToClearOnBreakUndo) {
              if (!isSoloAutoDidNotNeedPlaceholder(prev[selectedDateKey]?.[t.windowKey]?.[t.taskId])) continue
              const wm = { ...(dateMap[t.windowKey] ?? {}) }
              delete wm[t.taskId]
              if (Object.keys(wm).length === 0) {
                delete (dateMap as Partial<Record<WindowKey, Record<string, TaskCompletion>>>)[t.windowKey]
              } else {
                dateMap[t.windowKey] = wm
              }
            }
          }

          if (Object.keys(dateMap).length === 0) {
            delete next[selectedDateKey]
          } else {
            next[selectedDateKey] = dateMap
          }
          resolve()
          return next
        })
      })
      setIsSaving(true)
      setSaveError(null)
      Promise.all([
        withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, taskId), 8000),
        ...orderReportsToClearOnBreakUndo.map((t) =>
          withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, t.windowKey, t.taskId), 8000)
        ),
        new Promise((r) => setTimeout(r, 400)),
      ])
        .then(() => {
          setIsSaving(false)
          if (activeTaskId === taskId) setActiveTaskId(null)
          if (taskId === 'break-selection') {
            if (isDemoDaySelected) {
              setDemoSoloModeByDateKey((prev) => ({ ...prev, [selectedDateKey]: null }))
            }
            void persistSoloModeOrNoop(selectedDateKey, null).catch(() => {
              /* non-fatal */
            })
            setSoloMode(null)
          }
        })
        .catch((error) => {
          setTaskState((prev) => {
            const next: TaskState = { ...prev }
            const dateMap = { ...(next[selectedDateKey] ?? {}) }
            const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
            windowMap[taskId] = beforeSnapshot
            dateMap[selectedWindow] = windowMap
            for (const snap of orderReportSnapshotsBeforeUndo) {
              const wm = { ...(dateMap[snap.windowKey] ?? {}) }
              wm[snap.taskId] = snap.completion
              dateMap[snap.windowKey] = wm
            }
            next[selectedDateKey] = dateMap
            return next
          })
          setSaveError(
            error instanceof Error && error.message === 'timeout'
              ? 'Save timed out. Check connection.'
              : 'Failed to undo. Try again.'
          )
          setIsSaving(false)
        })
    },
    [
      activeTaskId,
      isAdmin,
      isDemoDaySelected,
      isTodaySelected,
      isV3Ui,
      persistAdminClearTaskCompletionOrNoop,
      persistSoloModeOrNoop,
      selectedDateKey,
      selectedWindow,
      setDemoSoloModeByDateKey,
      setSoloMode,
      taskState,
      withTimeout,
      isWindowTaskLocked,
    ]
  )

  const closeActiveTask = useCallback(() => {
    animateCloseAndDismiss()
  }, [animateCloseAndDismiss])

  const handleModalBackdropTouchStart = useCallback(
    (e: React.TouchEvent) => {
      recordTouch()
      closeActiveTask()
      e.preventDefault()
    },
    [closeActiveTask, recordTouch]
  )

  const resetCompletedTask = useCallback(async () => {
    if (!activeTaskId || !activeCompletion) return
    if (isInitialSyncing || isSaving) return
    if (!canEditTaskAssignmentsOnSelectedDate) return

    const musicSelectionLocked = activeTaskId === 'turn-on-music' && !musicIsActuallyPlaying
    const selectionLocked = isWindowTaskLocked(activeTaskId) || musicSelectionLocked
    if (selectionLocked || (activeCompletion.assignedByAdmin && !isAdmin)) return

    const beforeCompletionSnapshot = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]

    setAssignees([])
    setSplitMode(false)
    setShowUnsplitOptions(false)
    setSaveError(null)

    appendSelectionLog({
      action: 'cleared',
      taskId: activeTaskId,
      taskName: activeTask?.name ?? activeTaskId,
      window: selectedWindow,
      dateKey: selectedDateKey,
      assignees: activeCompletion.assignees ?? [],
      byAdmin: isAdmin,
    })

    await new Promise<void>((resolve) => {
      setTaskState((prevState) => {
        const next: TaskState = { ...prevState }
        const dateMap = { ...(next[selectedDateKey] ?? {}) }
        const windowMap = { ...(dateMap[selectedWindow] ?? {}) }
        delete windowMap[activeTaskId]
        if (Object.keys(windowMap).length === 0) {
          delete dateMap[selectedWindow]
        } else {
          dateMap[selectedWindow] = windowMap
        }
        if (Object.keys(dateMap).length === 0) {
          delete next[selectedDateKey]
        } else {
          next[selectedDateKey] = dateMap
        }
        resolve()
        return next
      })
    })

    setShowEmployeeSelector(false)
    pendingScrollToTaskIdRef.current = activeTaskId
    setActiveTaskId(null)
    setIsSaving(true)

    Promise.all([
      withTimeout(persistAdminClearTaskCompletionOrNoop(selectedDateKey, selectedWindow, activeTaskId), 8000),
      new Promise((resolve) => setTimeout(resolve, 600)),
    ])
      .then(() => {
        if (import.meta.env.DEV) console.log('Reset completed task saved successfully')
        setIsSaving(false)
      })
      .catch((error) => {
        console.error('Failed to reset completed task:', error)
        if (beforeCompletionSnapshot) {
          setTaskState((prev) => {
            const next: TaskState = { ...prev }
            const day = { ...(next[selectedDateKey] ?? {}) }
            const w = { ...(day[selectedWindow] ?? {}) }
            w[activeTaskId] = beforeCompletionSnapshot
            day[selectedWindow] = w
            next[selectedDateKey] = day
            return next
          })
        }
        setSaveError(
          error instanceof Error && error.message === 'timeout'
            ? 'Save timed out. Check connection.'
            : 'Failed to save. Try again.'
        )
        setIsSaving(false)
      })
  }, [
    activeCompletion,
    activeTask?.name,
    activeTaskId,
    appendSelectionLog,
    canEditTaskAssignmentsOnSelectedDate,
    isAdmin,
    isInitialSyncing,
    isSaving,
    musicIsActuallyPlaying,
    persistAdminClearTaskCompletionOrNoop,
    selectedDateKey,
    selectedWindow,
    taskState,
    isWindowTaskLocked,
  ])

  type WindowChangeSource = 'user' | 'auto'
  const handleWindowChange = useCallback((newWindow: WindowKey, source: WindowChangeSource = 'user') => {
    const expectedNow = getWindowForDate(new Date())
    if (newWindow === selectedWindow) {
      if (source === 'auto') return
      const nextFollow = newWindow === expectedNow
      if (followCurrentWindow === nextFollow) return
    }

    if (source === 'user') {
      recordLastUserAction(`window-click:${newWindow}`)
    }

    setIsLoadingWindow(true)
    setSelectedWindow(newWindow)
    if (source === 'user') {
      // Keep following the clock only if the user picked the current window.
      // Otherwise treat it as an intentional "view a different timeframe" action.
      setFollowCurrentWindow(newWindow === expectedNow)
    }
    // Show loading for a brief moment to let the UI update
    setTimeout(() => {
      setIsLoadingWindow(false)
    }, 300)
  }, [selectedWindow, followCurrentWindow])

  /** Snap browsing date + window to real "now" (idle screensaver + Back to today). */
  const snapBrowseContextToLiveNow = useCallback(() => {
    if (demoDayKey) return
    const nowReal = new Date()
    const today = startOfDay(nowReal)
    const expectedWindow = getWindowForDate(nowReal)
    setFollowCurrentWindow(true)
    if (!isSameDay(selectedDate, today)) {
      setSelectedDate(today)
    }
    if (selectedWindow !== expectedWindow) {
      handleWindowChange(expectedWindow, 'auto')
    }
  }, [demoDayKey, handleWindowChange, selectedDate, selectedWindow])

  useEffect(() => {
    snapBrowseContextToLiveNowRef.current = snapBrowseContextToLiveNow
  }, [snapBrowseContextToLiveNow])

  // Track user interaction to support inactivity-based "snap back".
  useEffect(() => {
    const bump = () => {
      lastInteractionTsRef.current = Date.now()
    }
    // Capture phase so modals/controls don't block it.
    window.addEventListener('pointerdown', bump, true)
    window.addEventListener('keydown', bump, true)
    window.addEventListener('touchstart', bump, true)
    window.addEventListener('wheel', bump, true)
    return () => {
      window.removeEventListener('pointerdown', bump, true)
      window.removeEventListener('keydown', bump, true)
      window.removeEventListener('touchstart', bump, true)
      window.removeEventListener('wheel', bump, true)
    }
  }, [])

  // If the user has been inactive long enough, snap back to today + current window.
  // We do this when the page becomes visible/focused and also on the minute tick.
  const snapBackToNowIfInactiveAndVisible = useCallback(
    (source: 'resume' | 'tick') => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      if (isAdmin) return
      if (demoDayKey) return

      const nowReal = new Date()
      const inactiveMs = Date.now() - (lastInteractionTsRef.current || 0)
      // On explicit resume events, be a bit more eager (browser timers may have slept).
      const threshold = source === 'resume' ? Math.min(INACTIVITY_SNAP_MS, 60_000) : INACTIVITY_SNAP_MS
      if (inactiveMs < threshold) return

      const today = startOfDay(nowReal)
      const expectedWindow = getWindowForDate(nowReal)

      // Always re-enable "follow" when snapping back.
      if (!followCurrentWindow) setFollowCurrentWindow(true)

      if (!isSameDay(selectedDate, today)) {
        setSelectedDate(today)
      }

      if (selectedWindow !== expectedWindow) {
        handleWindowChange(expectedWindow, 'auto')
      }
    },
    [demoDayKey, followCurrentWindow, handleWindowChange, isAdmin, selectedDate, selectedWindow]
  )

  // Auto-sync (or snap back) while the page is visible.
  // This runs every minute (via `tick`) and immediately on tab visibility/focus events.
  const syncExpectedWindowIfVisible = useCallback(() => {
    if (typeof document === 'undefined') return
    if (document.visibilityState !== 'visible') return
    if (isAdmin) return

    // First, if they've been away long enough, snap back to today + current window.
    snapBackToNowIfInactiveAndVisible('tick')

    // Otherwise, only auto-follow when the user hasn't intentionally chosen a different window.
    if (!isTodaySelected) return
    if (!followCurrentWindow) return
    const expected = getWindowForDate(new Date())
    if (selectedWindow === expected) return
    handleWindowChange(expected, 'auto')
  }, [
    followCurrentWindow,
    handleWindowChange,
    isAdmin,
    isTodaySelected,
    selectedWindow,
    snapBackToNowIfInactiveAndVisible,
  ])

  useEffect(() => {
    syncExpectedWindowIfVisible()
  }, [tick, syncExpectedWindowIfVisible])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      setTick(Date.now()) // force-refresh "now" after background sleep
      snapBackToNowIfInactiveAndVisible('resume')
      syncExpectedWindowIfVisible()
    }
    const onFocus = () => {
      setTick(Date.now())
      snapBackToNowIfInactiveAndVisible('resume')
      syncExpectedWindowIfVisible()
    }
    const onPageShow = () => {
      setTick(Date.now())
      snapBackToNowIfInactiveAndVisible('resume')
      syncExpectedWindowIfVisible()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [snapBackToNowIfInactiveAndVisible, syncExpectedWindowIfVisible])

  const handleDateChange = (newDate: Date) => {
    setIsLoadingWindow(true)
    setSelectedDate(newDate)
    // Show loading for a brief moment to let the UI update
    setTimeout(() => {
      setIsLoadingWindow(false)
    }, 300)
  }

  return (
    <div
      className={`app-shell time-${timeOfDay}${
        uiVariant === 'v3' ? ' app-shell--v3' : ''
      }`}
    >
      {/* Loading screen for initial load and window transitions */}
      {(isLoadingData || isLoadingWindow || showStartupCover) && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-logo">TRAQ</div>
            <div className="loading-text">Loading...</div>
          </div>
        </div>
      )}

      {/* v3: floating Shift HUD strip for point celebrations (no scroll-to-top); mirrors main shift-hud card */}
      {isV3Ui && v3ShiftNotifyOpen && (() => {
        const isDay = selectedShift === 'day'
        const { p1, p2 } = shiftHudDisplaySlots
        const winnerScore = p1 ? p1.score : null
        const p2Score = p2 ? p2.score : null
        const p1Wins = winnerScore !== null && (p2Score === null || winnerScore > p2Score)
        const tie = winnerScore !== null && p2Score !== null && winnerScore === p2Score
        const closeMatch =
          winnerScore !== null &&
          p2Score !== null &&
          winnerScore > 20 &&
          p2Score > 20 &&
          winnerScore - p2Score <= 3
        const showP1Crown = !!p1 && (p1Wins || tie || closeMatch)
        const showP2Crown = !!p2 && (tie || closeMatch)
        const p1HudLabels = shiftHudSlotLabelsForDisplay(p1 ? displayLabelsByEmployee[p1.name] : undefined)
        const p2HudLabels = shiftHudSlotLabelsForDisplay(p2 ? displayLabelsByEmployee[p2.name] : undefined)
        return (
          <div className="v3-shift-score-notify">
            <div
              className={`traq-v3-hero-unified shift-hud v3-shift-score-notify-card ${isDay ? 'day' : 'night'}`}
              role="status"
              aria-live="polite"
            >
              <div className="shift-hud-header traq-v3-hero-unified-header" ref={v3ShiftNotifyHeaderRef} />

              <div
                className="traq-v3-hero-unified-triad"
                role="group"
                aria-label="Shift leaders and task completion"
              >
                <div
                  className={`traq-v3-hero-slot-col traq-v3-hero-slot-col--p1 shift-player-slot shift-player-slot--v3-accent ${p1 ? 'filled' : ''}`}
                  style={shiftPlayerSlotAccentStyle(p1 ? employeeColors[p1.name] : undefined, 'start')}
                >
                  <div className="slot-main">
                    <div className="slot-name">
                      {p1 ? p1.name : '—'} {showP1Crown ? <span className="slot-crown">👑</span> : null}
                    </div>
                    {p1 && p1HudLabels.length > 0 && (
                      <div className="slot-labels">
                        {p1HudLabels.map((label) => (
                          <span key={label.id} className="slot-label-chip" title={label.description}>
                            {label.emoji} {label.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`slot-score ${showDayAmPmSplit ? 'slot-score--split' : ''}`} ref={v3NotifyP1ScoreRef}>
                    <ShiftHudScoreDisplay
                      row={p1}
                      scoreOverride={p1ScoreOverrideRef.current ?? p1ScoreOverride}
                      showDayAmPmSplit={showDayAmPmSplit}
                    />
                  </div>
                </div>

                <div
                  className={`top-progress traq-v3-hero-unified-progress ${taskProgress.total === 0 ? 'empty' : ''}`}
                  role="progressbar"
                  aria-label="Task completion"
                  aria-valuemin={0}
                  aria-valuemax={taskProgress.total}
                  aria-valuenow={taskProgress.resolved}
                >
                  <div
                    className="progress-percent"
                    style={
                      progressGradient
                        ? {
                            background: progressGradient,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          }
                        : undefined
                    }
                  >
                    {taskProgress.percent}%
                  </div>
                  <div className="dash-progress-sub">
                    {taskProgress.resolved}/{taskProgress.total} done
                  </div>
                </div>

                <div
                  className={`traq-v3-hero-slot-col traq-v3-hero-slot-col--p2 shift-player-slot shift-player-slot--v3-accent ${p2 ? 'filled' : ''}`}
                  style={shiftPlayerSlotAccentStyle(p2 ? employeeColors[p2.name] : undefined, 'end')}
                >
                  <div className="slot-main">
                    <div className="slot-name">
                      {p2 ? p2.name : '—'} {showP2Crown ? <span className="slot-crown">👑</span> : null}
                    </div>
                    {p2 && p2HudLabels.length > 0 && (
                      <div className="slot-labels">
                        {p2HudLabels.map((label) => (
                          <span key={label.id} className="slot-label-chip" title={label.description}>
                            {label.emoji} {label.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`slot-score ${showDayAmPmSplit ? 'slot-score--split' : ''}`} ref={v3NotifyP2ScoreRef}>
                    <ShiftHudScoreDisplay
                      row={p2}
                      scoreOverride={p2ScoreOverrideRef.current ?? p2ScoreOverride}
                      showDayAmPmSplit={showDayAmPmSplit}
                    />
                  </div>
                </div>
              </div>

              <div className="traq-v3-hero-unified-track-wrap" aria-hidden="true">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${taskProgress.percent}%`,
                      background: progressGradient || undefined,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Reward overlay (stars) */}
      <RewardStarsOverlay stars={rewardStars} />

      {/* Combined Ice: big falling ❄️/🧊 from top of screen into the selected tile */}
      <div ref={icePageEmojiLayerRef} className="ice-page-emoji-layer" aria-hidden="true" />

      {/* Towel split: big falling 🧼 from top of screen into the selected tile */}
      <div ref={towelPageEmojiLayerRef} className="towel-page-emoji-layer" aria-hidden="true" />

      {/* Window unlock toast (5-tap powered-by shortcut) */}
      {windowUnlockToast && (
        <div className="window-unlock-toast" role="status" aria-live="polite">
          {windowUnlockToast} window unlocked
        </div>
      )}

      {/* Label unlock celebration toast */}
      {labelUnlockToast && (
        <div className="label-unlock-toast" role="status" aria-live="polite">
          {labelUnlockSparkles.length > 0 && (
            <div className="label-unlock-sparkles" aria-hidden>
              {labelUnlockSparkles.map((s) => (
                <div
                  key={s.id}
                  className="label-unlock-sparkle"
                  style={
                    {
                      ['--x' as any]: `${s.xPct}%`,
                      ['--y' as any]: `${s.yPct}%`,
                      ['--delay' as any]: `${s.delayMs}ms`,
                      ['--size' as any]: `${s.sizePx}px`,
                      ['--rot' as any]: `${s.rotDeg}deg`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          <span className="label-unlock-emoji">{labelUnlockToast.label.emoji}</span>
          <div className="label-unlock-content">
            <div className="label-unlock-title">{labelUnlockToast.name} earned a new label!</div>
            <div className="label-unlock-label">{labelUnlockToast.label.name}</div>
          </div>
        </div>
      )}
      
      {uiVariant === 'v2' ? (
        <header className="hero">
          <h1>
            <span className="hero-left">
              <button
                type="button"
                className="hero-brand hero-brand-trigger"
                aria-label={screensaverEnabled ? 'Open screensaver' : 'App settings'}
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) =>
                  endTap(() => {
                    if (screensaverEnabled) openScreensaverPreview()
                    else setShowAppSettingsMenu(true)
                  }, e)
                }
                onClick={(e) => {
                  e.stopPropagation()
                  if (shouldIgnoreClick()) return
                  if (screensaverEnabled) openScreensaverPreview()
                  else setShowAppSettingsMenu(true)
                }}
              >
                <span className="brand-word">
                  <img className="brand-logo" src={traqLogoUrl} alt="TRAQ" draggable={false} />
                </span>
                {!isLoadingData && isInitialSyncing && <span className="sync-inline">SYNCING</span>}
                {isSaving && <span className="save-inline">SAVING</span>}
              </button>
              <HeaderClock />
            </span>

            <span className="header-music-slot">
              <MusicPlayerSwitcher />
            </span>

            <span className="header-actions">
              <button
                className="leaderboard-button header-leaderboard"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) =>
                  endTap(() => {
                    setLeaderboardView('month')
                    setShowLeaderboard(true)
                  }, e)
                }
                onClick={(e) => {
                  e.stopPropagation()
                  if (shouldIgnoreClick()) return
                  setLeaderboardView('month')
                  setShowLeaderboard(true)
                }}
              >
                <span className="icon">🏆</span>
                {formatMonthTitle(startOfMonth(new Date(tick))).replace(/\s+\d{4}$/, '')}
              </button>
            </span>
          </h1>
        </header>
      ) : (
        <header className="traq-v3-slim-bar" aria-label="TRAQ">
          <div className="traq-v3-slim-left">
            <button
              type="button"
              className="hero-brand hero-brand-trigger traq-v3-brand"
              aria-label={screensaverEnabled ? 'Open screensaver' : 'App settings'}
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) =>
                endTap(() => {
                  if (screensaverEnabled) openScreensaverPreview()
                  else setShowAppSettingsMenu(true)
                }, e)
              }
              onClick={(e) => {
                e.stopPropagation()
                if (shouldIgnoreClick()) return
                if (screensaverEnabled) openScreensaverPreview()
                else setShowAppSettingsMenu(true)
              }}
            >
              <span className="brand-word">
                <img className="brand-logo" src={traqLogoUrl} alt="TRAQ" draggable={false} />
              </span>
              {!isLoadingData && isInitialSyncing && <span className="sync-inline">SYNCING</span>}
              {isSaving && <span className="save-inline">SAVING</span>}
            </button>
            <HeaderClock />
          </div>
          <div className="traq-v3-slim-music header-music-slot">
            <MusicPlayerSwitcher />
          </div>
          <div className="traq-v3-slim-actions">
            <button
              type="button"
              className="leaderboard-button header-leaderboard"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) =>
                endTap(() => {
                  setLeaderboardView('month')
                  setShowLeaderboard(true)
                }, e)
              }
              onClick={(e) => {
                e.stopPropagation()
                if (shouldIgnoreClick()) return
                setLeaderboardView('month')
                setShowLeaderboard(true)
              }}
            >
              <span className="icon">🏆</span>
              {formatMonthTitle(startOfMonth(new Date(tick))).replace(/\s+\d{4}$/, '')}
            </button>
          </div>
        </header>
      )}

      {showAppSettingsMenu && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) => endTap(() => setShowAppSettingsMenu(false), e)}
          onClick={() => {
            if (shouldIgnoreClick()) return
            setShowAppSettingsMenu(false)
          }}
        >
          <div
            className="admin-login-card logo-refresh-menu-card"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-login-title">Settings</div>
            <p className="logo-refresh-menu-text">
              Reload the app to pick up the latest version and any updates.
            </p>
            <div className="logo-refresh-menu-actions">
              <button
                type="button"
                className="admin-update-btn logo-refresh-menu-btn logo-refresh-menu-btn--secondary"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) =>
                  endTap(() => {
                    setShowAppSettingsMenu(false)
                  }, e)
                }
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowAppSettingsMenu(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-update-btn logo-refresh-menu-btn"
                aria-label="Reload app"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => void reloadForUpdate(), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  void reloadForUpdate()
                }}
              >
                Refresh app
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global error indicator at top of page */}
      {saveError && !isSaving && (
        <div className="save-error" style={{ margin: '0 0 16px 0' }}>
          ⚠️ {saveError}
        </div>
      )}

      <div
        className={`good-morning-reveal-root${goodMorningRevealPhase ? ' good-morning-reveal-root--animating' : ''}`}
      >
      {uiVariant === 'v2' && (
      <div className="dashboard-grid" aria-label="Dashboard">
        <div className="dash-card dash-progress">
          <div
            className={`top-progress ${taskProgress.total === 0 ? 'empty' : ''}`}
            role="progressbar"
            aria-label="Task completion"
            aria-valuemin={0}
            aria-valuemax={taskProgress.total}
            aria-valuenow={taskProgress.resolved}
            ref={topProgressRef}
          >
            <div 
              className="progress-percent"
              style={progressGradient ? { 
                background: progressGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              } : undefined}
            >
              {taskProgress.percent}%
            </div>
            <div className="dash-progress-sub">
              {taskProgress.resolved}/{taskProgress.total} done
            </div>
            <div className="progress-track" aria-hidden="true">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${taskProgress.percent}%`,
                  background: progressGradient || undefined
                }} 
              />
            </div>
          </div>
        </div>

        {/* Greeting & Motivation / Break Countdown / Shift Change Countdown */}
        <div className="dash-card dash-greeting">
          {taskSplitInlinePhase !== null && (selectedWindow === '17' || selectedWindow === '21') ? (
            <div className="greeting-compact">
              <div className="greeting-text-compact greeting-text-compact--split">50 / 50 split</div>
            </div>
          ) : showBreakCountdown && countdownMsRemaining !== null && countdownEmployee ? (
            <div className="greeting-compact break-countdown">
              <div className="break-countdown-time">
                ☕ {Math.floor(countdownMsRemaining / 60_000)}:{String(Math.floor((countdownMsRemaining % 60_000) / 1000)).padStart(2, '0')}
              </div>
              <div className="break-countdown-label">
                until {countdownEmployee}'s break
              </div>
            </div>
          ) : showShiftChangeCountdown ? (
            <div className="greeting-compact break-countdown">
              <div className="break-countdown-time">
                ⏰ {Math.floor(shiftChangeMsRemaining / 60_000)}:{String(Math.floor((shiftChangeMsRemaining % 60_000) / 1000)).padStart(2, '0')}
              </div>
              <div className="break-countdown-label">
                until shift change
              </div>
            </div>
          ) : (
            <div className="greeting-compact">
              <div className="greeting-text-compact">{getGreeting(timeOfDay)}</div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Shift HUD (2-player, concise). Shows only active shift (day for 11/5, night for 9/10). */}
      {(() => {
        const isDay = selectedShift === 'day'
        const { p1, p2, extra } = shiftHudDisplaySlots
        // Crown / tie / close-match comparisons use the 5PM (leaderboard) number after cutover so
        // HUD highlights match what feeds the leaderboard.
        const winnerScore = p1 ? p1.score : null
        const p2Score = p2 ? p2.score : null
        const p1Wins = winnerScore !== null && (p2Score === null || winnerScore > p2Score)
        const tie = winnerScore !== null && p2Score !== null && winnerScore === p2Score
        // If both top scores are strong and close, give both a crown to reduce "who's really winning?" confusion.
        // Rule: if both > 20 and within 3 points, both get a crown.
        const closeMatch =
          winnerScore !== null &&
          p2Score !== null &&
          winnerScore > 20 &&
          p2Score > 20 &&
          winnerScore - p2Score <= 3
        const showP1Crown = !!p1 && (p1Wins || tie || closeMatch)
        const showP2Crown = !!p2 && (tie || closeMatch)

        const p1HudLabels = shiftHudSlotLabelsForDisplay(p1 ? displayLabelsByEmployee[p1.name] : undefined)
        const p2HudLabels = shiftHudSlotLabelsForDisplay(p2 ? displayLabelsByEmployee[p2.name] : undefined)

        const windowSelectorEl = (
          <div className="window-selector-float">
            <div className="segmented segmented-compact" role="group" aria-label="Timeframe selector">
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  className={w.key === selectedWindow ? 'active' : ''}
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => handleWindowChange(w.key), e)}
                  onClick={() => {
                    if (shouldIgnoreClick()) return
                    handleWindowChange(w.key)
                  }}
                >
                  {getWindowLabel(selectedDate, w.key)}
                </button>
              ))}
            </div>
            {effectiveWindowLocked && (
              <div className="window-lock-indicator" aria-label="Window locked" title="Locked until unlock time">
                🔒
              </div>
            )}
          </div>
        )

        const menuFabEl = (
          <button
            className={uiVariant === 'v3' ? 'menu-fab menu-fab--v3-home' : 'menu-fab'}
            type="button"
            aria-label={uiVariant === 'v3' ? 'Open home' : 'Open more menu'}
            onTouchStart={beginTap}
            onTouchMove={moveTap}
            onTouchEnd={(e) =>
              endTap(() => {
                captureScrollYForNextLock()
                setShowMenu(true)
              }, e)
            }
            onClick={() => {
              if (shouldIgnoreClick()) return
              captureScrollYForNextLock()
              setShowMenu(true)
            }}
          >
            {uiVariant === 'v3' ? 'Home' : 'More'}
          </button>
        )

        const calcFabEl = (
          <button
            className="calc-fab"
            type="button"
            aria-label="Open calculator"
            onTouchStart={beginTap}
            onTouchMove={moveTap}
            onTouchEnd={(e) =>
              endTap(() => {
                captureScrollYForNextLock()
                setShowCalculator(true)
              }, e)
            }
            onClick={() => {
              if (shouldIgnoreClick()) return
              captureScrollYForNextLock()
              setShowCalculator(true)
            }}
          >
            Calculator
          </button>
        )

        const diceFabVisible =
          isDiceEnabledForChannel(taskOverrides, deploymentChannel) &&
          selectedWindow !== '11' &&
          !(selectedWindow === '21' && isSoloModeActiveForWindow(selectedDateKey, '21'))
        const diceIsSplitWindowTrigger = selectedWindow === '17' || selectedWindow === '21'
        const diceDisabled = diceIsSplitWindowTrigger
          ? taskSplitCandidateIds.length === 0
          : randomTaskPickPool.length === 0
        const diceLabel = diceIsSplitWindowTrigger
          ? taskSplitInlinePhase !== null
            ? 'Exit fair task split view'
            : 'Open fair task split setup'
          : 'Open a random incomplete task'
        const diceTitle = diceIsSplitWindowTrigger
          ? taskSplitInlinePhase !== null
            ? 'Exit split view'
            : 'Generate fair task split for this window'
          : 'Pick a random task'
        const diceTitleResolved =
          diceDisabled && diceIsSplitWindowTrigger
            ? 'No incomplete tasks to split in this window'
            : diceDisabled
              ? 'No random incomplete tasks available'
              : diceTitle
        const diceFabEl = diceFabVisible ? (
          <button
            className="random-task-fab"
            type="button"
            aria-label={diceLabel}
            title={diceTitleResolved}
            aria-pressed={diceIsSplitWindowTrigger ? taskSplitInlinePhase !== null : undefined}
            disabled={diceDisabled}
            onTouchStart={beginTap}
            onTouchMove={moveTap}
            onTouchEnd={(e) => {
              e.stopPropagation()
              endTap(() => handleDiceTap(), e)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (shouldIgnoreClick()) return
              handleDiceTap()
            }}
          >
            🎲
          </button>
        ) : null

        const greetingEl =
          taskSplitInlinePhase !== null && (selectedWindow === '17' || selectedWindow === '21') ? (
            <div className="greeting-compact">
              <div className="greeting-text-compact greeting-text-compact--split">50 / 50 split</div>
            </div>
          ) : showBreakCountdown && countdownMsRemaining !== null && countdownEmployee ? (
            <div className="greeting-compact break-countdown">
              <div className="break-countdown-time">
                ☕ {Math.floor(countdownMsRemaining / 60_000)}:{String(Math.floor((countdownMsRemaining % 60_000) / 1000)).padStart(2, '0')}
              </div>
              <div className="break-countdown-label">until {countdownEmployee}'s break</div>
            </div>
          ) : showShiftChangeCountdown ? (
            <div className="greeting-compact break-countdown">
              <div className="break-countdown-time">
                ⏰ {Math.floor(shiftChangeMsRemaining / 60_000)}:{String(Math.floor((shiftChangeMsRemaining % 60_000) / 1000)).padStart(2, '0')}
              </div>
              <div className="break-countdown-label">until shift change</div>
            </div>
          ) : (
            <div className="greeting-compact">
              <div className="greeting-text-compact">{getGreeting(timeOfDay)}</div>
            </div>
          )

        if (uiVariant === 'v3') {
          return (
            <>
              <div
                className={`traq-v3-hero-unified shift-hud ${isDay ? 'day' : 'night'} ${shiftHudPulse ? 'reward-pulse' : ''}`}
                aria-label="Shift and task progress"
              >
                <div className="shift-hud-header traq-v3-hero-unified-header" ref={shiftHudHeaderRef}>
                  {extra > 0 && (
                    <div className="shift-hud-extra" ref={shiftHudExtraRef}>
                      +{extra}
                    </div>
                  )}
                </div>

                <div
                  className="traq-v3-hero-unified-triad"
                  role="group"
                  aria-label="Shift leaders and task completion"
                >
                  <div
                    className={`traq-v3-hero-slot-col traq-v3-hero-slot-col--p1 shift-player-slot shift-player-slot--v3-accent ${p1 ? 'filled' : ''}`}
                    style={shiftPlayerSlotAccentStyle(p1 ? employeeColors[p1.name] : undefined, 'start')}
                  >
                    <div className="slot-main">
                      <div className="slot-name">
                        {p1 ? p1.name : '—'} {showP1Crown ? <span className="slot-crown">👑</span> : null}
                      </div>
                      {p1 && p1HudLabels.length > 0 && (
                        <div className="slot-labels">
                          {p1HudLabels.map((label) => (
                            <span key={label.id} className="slot-label-chip" title={label.description}>
                              {label.emoji} {label.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div
                      className={`slot-score ${showDayAmPmSplit ? 'slot-score--split' : ''} ${scoreAnim?.slot === 'p1' ? 'reward-pop' : ''}`}
                      ref={p1ScoreRef}
                    >
                      <ShiftHudScoreDisplay
                        row={p1}
                        scoreOverride={p1ScoreOverrideRef.current ?? p1ScoreOverride}
                        showDayAmPmSplit={showDayAmPmSplit}
                      />
                    </div>
                  </div>

                  <div
                    className={`top-progress traq-v3-hero-unified-progress ${taskProgress.total === 0 ? 'empty' : ''}`}
                    role="progressbar"
                    aria-label="Task completion"
                    aria-valuemin={0}
                    aria-valuemax={taskProgress.total}
                    aria-valuenow={taskProgress.resolved}
                    ref={topProgressRef}
                  >
                    <div
                      className="progress-percent"
                      style={
                        progressGradient
                          ? {
                              background: progressGradient,
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text',
                            }
                          : undefined
                      }
                    >
                      {taskProgress.percent}%
                    </div>
                    <div className="dash-progress-sub">
                      {taskProgress.resolved}/{taskProgress.total} done
                    </div>
                  </div>

                  <div
                    className={`traq-v3-hero-slot-col traq-v3-hero-slot-col--p2 shift-player-slot shift-player-slot--v3-accent ${p2 ? 'filled' : ''}`}
                    style={shiftPlayerSlotAccentStyle(p2 ? employeeColors[p2.name] : undefined, 'end')}
                  >
                    <div className="slot-main">
                      <div className="slot-name">
                        {p2 ? p2.name : '—'} {showP2Crown ? <span className="slot-crown">👑</span> : null}
                      </div>
                      {p2 && p2HudLabels.length > 0 && (
                        <div className="slot-labels">
                          {p2HudLabels.map((label) => (
                            <span key={label.id} className="slot-label-chip" title={label.description}>
                              {label.emoji} {label.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div
                      className={`slot-score ${showDayAmPmSplit ? 'slot-score--split' : ''} ${scoreAnim?.slot === 'p2' ? 'reward-pop' : ''}`}
                      ref={p2ScoreRef}
                    >
                      <ShiftHudScoreDisplay
                        row={p2}
                        scoreOverride={p2ScoreOverrideRef.current ?? p2ScoreOverride}
                        showDayAmPmSplit={showDayAmPmSplit}
                      />
                    </div>
                  </div>
                </div>

                <div className="traq-v3-hero-unified-track-wrap" aria-hidden="true">
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${taskProgress.percent}%`,
                        background: progressGradient || undefined,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="traq-v3-controls-quote-row" aria-label="Time window, message, and actions">
                <div className="traq-v3-window-wrap">
                  {windowSelectorEl}
                </div>
                <div className="traq-v3-greeting-inline">{greetingEl}</div>
                <div className="traq-v3-trailing-actions">
                  {menuFabEl}
                  {diceFabEl}
                  {calcFabEl}
                </div>
              </div>
            </>
          )
        }

        return (
          <div className={`shift-hud ${isDay ? 'day' : 'night'} ${shiftHudPulse ? 'reward-pulse' : ''}`}>
            {windowSelectorEl}
            {menuFabEl}
            <div className="shift-hud-header" ref={shiftHudHeaderRef}>
              {extra > 0 && (
                <div className="shift-hud-extra" ref={shiftHudExtraRef}>
                  +{extra}
                </div>
              )}
            </div>

            <div className="shift-hud-players" aria-label="Shift top players">
              <div className={`shift-player-slot ${p1 ? 'filled' : ''}`}>
                {p1 && employeeColors[p1.name] && (
                  <div 
                    className="slot-avatar" 
                    style={{ background: employeeColors[p1.name] }}
                    aria-hidden="true"
                  />
                )}
                <div className="slot-main">
                  <div className="slot-name">
                    {p1 ? p1.name : '—'} {showP1Crown ? <span className="slot-crown">👑</span> : null}
                  </div>
                  {p1 && p1HudLabels.length > 0 && (
                    <div className="slot-labels">
                      {p1HudLabels.map((label) => (
                        <span key={label.id} className="slot-label-chip" title={label.description}>
                          {label.emoji} {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`slot-score ${showDayAmPmSplit ? 'slot-score--split' : ''} ${scoreAnim?.slot === 'p1' ? 'reward-pop' : ''}`}
                  ref={p1ScoreRef}
                >
                  <ShiftHudScoreDisplay
                    row={p1}
                    scoreOverride={p1ScoreOverrideRef.current ?? p1ScoreOverride}
                    showDayAmPmSplit={showDayAmPmSplit}
                  />
                </div>
              </div>

              <div className={`shift-player-slot ${p2 ? 'filled' : ''}`}>
                {p2 && employeeColors[p2.name] && (
                  <div 
                    className="slot-avatar" 
                    style={{ background: employeeColors[p2.name] }}
                    aria-hidden="true"
                  />
                )}
                <div className="slot-main">
                  <div className="slot-name">
                    {p2 ? p2.name : '—'} {showP2Crown ? <span className="slot-crown">👑</span> : null}
                  </div>
                  {p2 && p2HudLabels.length > 0 && (
                    <div className="slot-labels">
                      {p2HudLabels.map((label) => (
                        <span key={label.id} className="slot-label-chip" title={label.description}>
                          {label.emoji} {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`slot-score ${showDayAmPmSplit ? 'slot-score--split' : ''} ${scoreAnim?.slot === 'p2' ? 'reward-pop' : ''}`}
                  ref={p2ScoreRef}
                >
                  <ShiftHudScoreDisplay
                    row={p2}
                    scoreOverride={p2ScoreOverrideRef.current ?? p2ScoreOverride}
                    showDayAmPmSplit={showDayAmPmSplit}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Admin: Night Shift Reports Banner */}
      {isAdmin && nightShiftReports.length > 0 && (
        <div className="night-shift-reports-banner">
          <div className="night-shift-reports-header">
            <span className="night-shift-reports-icon">⚠️</span>
            <span className="night-shift-reports-title">Night Shift Reports ({nightShiftReports.length})</span>
          </div>
          <div className="night-shift-reports-list">
            {nightShiftReports.map((report) => (
              <div key={report.id} className="night-shift-report-item">
                <div className="night-shift-report-info">
                  <strong>{report.taskName}</strong>
                  <span className="night-shift-report-date">
                    {new Date(report.dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="night-shift-report-by">
                    Reported by: {report.reportedBy.join(', ')}
                  </span>
                </div>
                <button
                  className="night-shift-report-dismiss"
                  disabled={dismissingReport === report.id}
                  onClick={async () => {
                    setDismissingReport(report.id)
                    try {
                      await dismissNightShiftReport(report.id)
                    } catch (err) {
                      console.error('Failed to dismiss report:', err)
                    }
                    setDismissingReport(null)
                  }}
                >
                  {dismissingReport === report.id ? '...' : '✓ Dismiss'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Window unlock-status card: shows when tasks unlock, with a live MM:SS countdown in the final 30 min. */}
      {effectiveWindowLocked && windowUnlockTargetMs !== null && (() => {
        const isDay = selectedShift === 'day'
        const inFinal30 = windowUnlockTargetMs - now.getTime() <= 30 * 60_000
        const unlockTimeLabel = new Date(windowUnlockTargetMs).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
        const remainingMs = Math.max(0, windowUnlockTargetMs - unlockCountdownNowMs)
        const mm = Math.floor(remainingMs / 60_000)
        const ss = Math.floor((remainingMs % 60_000) / 1000)
        return (
          <div className={`window-unlock-card ${isDay ? 'day' : 'night'}`} role="status" aria-live="polite">
            <span className="window-unlock-card-label">{inFinal30 ? 'Tasks unlock in' : 'Tasks unlock at'}</span>
            {inFinal30 ? (
              <span className="window-unlock-card-countdown">
                {mm}:{String(ss).padStart(2, '0')}
              </span>
            ) : (
              <span className="window-unlock-card-time">{unlockTimeLabel}</span>
            )}
          </div>
        )
      })()}

      <div className={`tasks-section${uiVariant === 'v3' ? ' tasks-section--v3' : ''}`}>
        {uiVariant !== 'v3' && (
          <div className="tasks-section-fabs">
            {isDiceEnabledForChannel(taskOverrides, deploymentChannel) && selectedWindow !== '11' &&
            !(selectedWindow === '21' && isSoloModeActiveForWindow(selectedDateKey, '21')) ? (() => {
              const diceIsSplitWindowTrigger = selectedWindow === '17' || selectedWindow === '21'
              const diceDisabled = diceIsSplitWindowTrigger
                ? taskSplitCandidateIds.length === 0
                : randomTaskPickPool.length === 0
              const diceLabel = diceIsSplitWindowTrigger
                ? taskSplitInlinePhase !== null
                  ? 'Exit fair task split view'
                  : 'Open fair task split setup'
                : 'Open a random incomplete task'
              const diceTitle = diceIsSplitWindowTrigger
                ? taskSplitInlinePhase !== null
                  ? 'Exit split view'
                  : 'Generate fair task split for this window'
                : 'Pick a random task'
              const diceTitleResolved =
                diceDisabled && diceIsSplitWindowTrigger
                  ? 'No incomplete tasks to split in this window'
                  : diceDisabled
                    ? 'No random incomplete tasks available'
                    : diceTitle
              return (
                <button
                  className="random-task-fab"
                  type="button"
                  aria-label={diceLabel}
                  title={diceTitleResolved}
                  aria-pressed={diceIsSplitWindowTrigger ? taskSplitInlinePhase !== null : undefined}
                  disabled={diceDisabled}
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => {
                    e.stopPropagation()
                    endTap(() => handleDiceTap(), e)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (shouldIgnoreClick()) return
                    handleDiceTap()
                  }}
                >
                  🎲
                </button>
              )
            })() : null}
            <button
              className="calc-fab"
              type="button"
              aria-label="Open calculator"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) =>
                endTap(() => {
                  captureScrollYForNextLock()
                  setShowCalculator(true)
                }, e)
              }
              onClick={() => {
                if (shouldIgnoreClick()) return
                captureScrollYForNextLock()
                setShowCalculator(true)
              }}
            >
              Calculator
            </button>
          </div>
        )}

        {(selectedWindow === '17' || selectedWindow === '21') && taskSplitInlinePhase !== null ? (
          <TaskSplitSuggestPanel
            windowKey={selectedWindow as TaskSplitSuggestWindowKey}
            windowLabel={selectedWindow === '17' ? '5PM' : '9PM'}
            phase={taskSplitInlinePhase}
            evacuating={splitEvacuating}
            onExit={closeTaskSplitInline}
            onRegenerate={taskSplitOnRegenerate}
            result={taskSplitResult}
            taskState={taskState}
            dateKey={selectedDateKey}
            effectiveWindowTaskIds={taskSplitEffectiveWindowTaskIds}
            orderedTaskIds={currentTasks.map((t) => t.id)}
            towelsSplitEffective={isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow)}
            candidateTaskIds={taskSplitCandidateIds}
            allTasks={allTasks}
            employeeColors={employeeColors}
            nightStageLabels={taskSplitNightStageLabels}
            taskStages={taskStages}
            splitHudPoints={taskSplitHudFloats}
            renderIceSideCard={(task: Task, side: 'left' | 'right') => {
              // Virtual side card: render a TaskCard with the name overridden to "Left Ice" / "Right Ice".
              // Show the side's draft assignee (if filled) as the preview; tap opens the combined-ice
              // drawer pre-pointed at this side's picker.
              const draftKey = `${selectedDateKey}:${selectedWindow}:${task.id}`
              const draft = iceSidesDraftByKey[draftKey]
              const sideAssignee = side === 'left' ? draft?.left : draft?.right
              const virtualTask: Task = {
                ...task,
                id: `${task.id}::${side}`,
                name: side === 'left' ? 'Left Ice' : 'Right Ice',
              }
              const baseStatus = statusByTask[task.id]?.status ?? 'pending'
              return (
                <TaskCard
                  key={virtualTask.id}
                  task={virtualTask}
                  status={baseStatus === 'done' ? 'pending' : baseStatus}
                  completion={undefined}
                  showNewBadge={false}
                  showUpdatedRequirementsBadge={false}
                  highlightEarlyCompletable={false}
                  deferredBadgeAt={null}
                  previewAssignees={sideAssignee ? [sideAssignee] : undefined}
                  iceDraftPreview={undefined}
                  towelDraftPreview={undefined}
                  interactionLocked={false}
                  hiddenForActiveModal={false}
                  isAdmin={isAdmin}
                  dragReorderEnabled={false}
                  draggedTaskId={null}
                  dragOverTaskId={null}
                  urgency="none"
                  isPulsing={false}
                  employeeColors={employeeColors}
                  didNotNeedToComplete={false}
                  soloModeActive={isSoloModeActiveForWindow(selectedDateKey, selectedWindow)}
                  onTaskClick={() => {
                    taskSplitOpenPrefillRef.current = { taskId: task.id, iceSide: side }
                    handleTaskClick(task.id, { bypassSyntheticClickGuard: true })
                  }}
                  onTaskTouchStart={() => {}}
                  onTaskTouchMove={() => {}}
                  onTaskTouchEnd={() => {}}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onDragEnter={() => {}}
                  onDragLeave={() => {}}
                  onDragOver={() => {}}
                  onDrop={() => {}}
                />
              )
            }}
            renderTaskCard={(task: Task) => {
              const taskStatus = statusByTask[task.id]?.status ?? 'pending'
              const completion = statusByTask[task.id]?.completion
              const urgency = getTaskUrgency(taskStatus, selectedDate, selectedWindow, new Date(tick))
              const iceDraftPreview =
                (task.id === 'ice-5pm' || task.id === 'ice-close') && !completion
                  ? iceSidesDraftByKey[`${selectedDateKey}:${selectedWindow}:${task.id}`] || undefined
                  : undefined
              const towelDraftPreview =
                (task.id === 'towels' || task.id === 'towels-5pm' || task.id === 'towels-close') &&
                !completion &&
                isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow)
                  ? towelSidesDraftByKey[`${selectedDateKey}:${selectedWindow}:${task.id}`] || undefined
                  : undefined
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  status={taskStatus}
                  completion={completion}
                  showNewBadge={!!showNewBadgeByTaskId[task.id]}
                  showUpdatedRequirementsBadge={!!showUpdatedRequirementsBadgeByTaskId[task.id]}
                  highlightEarlyCompletable={false}
                  deferredBadgeAt={null}
                  previewAssignees={undefined}
                  iceDraftPreview={iceDraftPreview}
                  towelDraftPreview={towelDraftPreview}
                  interactionLocked={false}
                  hiddenForActiveModal={activeTaskId === task.id && !isOrderReportTaskId}
                  isAdmin={isAdmin}
                  dragReorderEnabled={false}
                  draggedTaskId={null}
                  dragOverTaskId={null}
                  urgency={urgency}
                  isPulsing={false}
                  employeeColors={employeeColors}
                  didNotNeedToComplete={isV3Ui && !!completion?.didNotNeedToComplete}
                  onUndoDidNotNeed={isV3Ui ? undoV3DidNotNeedToComplete : undefined}
                  soloModeActive={isSoloModeActiveForWindow(selectedDateKey, selectedWindow)}
                  onTaskClick={handleSplitSuggestCardClick}
                  onTaskTouchStart={() => {}}
                  onTaskTouchMove={() => {}}
                  onTaskTouchEnd={() => {}}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onDragEnter={() => {}}
                  onDragLeave={() => {}}
                  onDragOver={() => {}}
                  onDrop={() => {}}
                />
              )
            }}
            errorBanner={taskSplitErrorBanner}
          />
        ) : (
        <div
          className={`task-grid${taskGridCelebrating ? ' task-grid--evacuating' : ''}${
            taskGridEntered ? ' task-grid--entered' : ''
          }${taskCardsJiggle ? ' task-grid--jiggle' : ''}`}
        >
          {/* v3 + stage dividers: daily task placement is window-specific; otherwise keep above grid */}
          {dailyTaskInlineTeaserEl && !stagedTasks ? dailyTaskInlineTeaserEl : null}
          {selectedWindowIsTraining && taskProgress.percent < 100 && !showInlineWindowCelebration ? (
            <div className="training-banner" key="training-shift-banner">
              <div className="training-banner__label">TRAINING SHIFT</div>
              <div className="training-banner__sub">All players will receive 50 points</div>
            </div>
          ) : null}
          {showNightSoloActiveBanner ? (
            <div className="night-solo-prompt-card night-solo-prompt-card--active" key="night-solo-active">
              <div>
                <div className="night-solo-prompt-card__active-label">Night solo active</div>
                <div className="night-solo-prompt-card__active-sub">
                  Close tasks can be completed alone without splitting. Close score is capped at 70.
                </div>
              </div>
              <button
                type="button"
                className="night-solo-prompt-card__btn"
                disabled={isInitialSyncing || isSaving}
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => void setNightSoloModeActive(false), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  void setNightSoloModeActive(false)
                }}
              >
                Turn off
              </button>
            </div>
          ) : null}
          {currentTasks.length === 0 && <div className="grid-empty">No tasks configured.</div>}
          {(() => {
            if (showInlineWindowCelebration && windowCompleteCelebration) {
              return (
                <WindowCompleteCelebration
                  celebration={windowCompleteCelebration}
                  onTileClick={handleWindowCompleteTileClick}
                  onCompletionTypingFinished={onWindowCompleteAiTypingFinished}
                />
              )
            }

            let taskEvacStaggerNext = 0
            const renderCard = (task: Task) => {
              const taskStatus = statusByTask[task.id]?.status ?? 'pending'
              const urgency = getTaskUrgency(taskStatus, selectedDate, selectedWindow, new Date(tick))
              const highlightEarlyCompletable =
                isTodaySelected &&
                task.id === 'yum-yum-close' &&
                (selectedWindow === '17' || selectedWindow === '21') &&
                taskStatus !== 'done'
              const deferredBadgeAt =
                task.id === 'order-report-5pm' && selectedWindow === '17' && selectedBothDoubleShift
                  ? selectedCloseLabel
                  : null
              const completion = statusByTask[task.id]?.completion
              const interactionLocked =
                (selectedWindow === '17' && !!completion?.deferredToClose) ||
                (task.id === 'order-report-5pm' && selectedWindow === '17' && selectedBothDoubleShift)
              const previewAssignees =
                !completion?.assignees?.length && task.id === 'order-report-5pm' && selectedWindow === '17' && selectedBothDoubleShift
                  ? orderReportEmployees.filter(Boolean)
                  : undefined
              const iceDraftPreview =
                (task.id === 'ice-5pm' || task.id === 'ice-close') && !completion
                  ? iceSidesDraftByKey[`${selectedDateKey}:${selectedWindow}:${task.id}`] || undefined
                  : undefined
              const towelDraftPreview =
                (task.id === 'towels' || task.id === 'towels-5pm' || task.id === 'towels-close') &&
                !completion &&
                isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow)
                  ? towelSidesDraftByKey[`${selectedDateKey}:${selectedWindow}:${task.id}`] || undefined
                  : undefined
              const evacuationStaggerIndex = taskGridCelebrating ? taskEvacStaggerNext++ : undefined
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  status={taskStatus}
                  completion={completion}
                  showNewBadge={!!showNewBadgeByTaskId[task.id]}
                  showUpdatedRequirementsBadge={!!showUpdatedRequirementsBadgeByTaskId[task.id]}
                  highlightEarlyCompletable={highlightEarlyCompletable}
                  deferredBadgeAt={deferredBadgeAt}
                  previewAssignees={previewAssignees}
                  iceDraftPreview={iceDraftPreview}
                  towelDraftPreview={towelDraftPreview}
                  interactionLocked={interactionLocked}
                  hiddenForActiveModal={activeTaskId === task.id && !isOrderReportTaskId}
                  isAdmin={isAdmin}
                  dragReorderEnabled={uiVariant !== 'v3'}
                  draggedTaskId={draggedTaskId}
                  dragOverTaskId={dragOverTaskId}
                  urgency={urgency}
                  isPulsing={task.id === pulseTaskId}
                  employeeColors={employeeColors}
                  didNotNeedToComplete={isV3Ui && !!completion?.didNotNeedToComplete}
                  onUndoDidNotNeed={isV3Ui ? undoV3DidNotNeedToComplete : undefined}
                  soloModeActive={isSoloModeActiveForWindow(selectedDateKey, selectedWindow)}
                  onTaskClick={handleTaskClick}
                  onTaskTouchStart={handleTaskTouchStart}
                  onTaskTouchMove={handleTaskTouchMove}
                  onTaskTouchEnd={handleTaskTouchEnd}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  evacuationStaggerIndex={evacuationStaggerIndex}
                />
              )
            }

            if (stagedTasks) {
              if (isV3Ui) {
                const isDone = (id: string) => statusByTask[id]?.status === 'done'
                const stage1Pending = stagedTasks.stage1.filter((t) => !isDone(t.id))
                const stage2Pending = stagedTasks.stage2.filter((t) => !isDone(t.id))
                const dailyTaskUnderStage2ForThisWindow = selectedWindow === '11'
                return (
                  <>
                    <div
                      className={`task-grid__upper-strip${
                        windowCompleteStageCollapse ? ' task-grid__upper-strip--collapsed' : ''
                      }`}
                    >
                      <div className="stage-divider" key="stage-div-1">
                        {stagedTasks.label1}
                      </div>
                      {!dailyTaskUnderStage2ForThisWindow ? dailyTaskInlineTeaserEl : null}
                      {stage1Pending.map(renderCard)}
                      <div className="stage-divider" key="stage-div-2">
                        {stagedTasks.label2}
                      </div>
                      {stage2Pending.map(renderCard)}
                      {dailyTaskUnderStage2ForThisWindow ? (
                        <>
                          <div className="stage-divider stage-divider--daily" key="stage-div-daily">
                            Daily task
                          </div>
                          {dailyTaskInlineTeaserEl}
                        </>
                      ) : null}
                    </div>
                    {v3CompletedTasksOrdered.length > 0 && (
                      <>
                        <div ref={completedTasksAnchorRef} className="completed-tasks-anchor" aria-hidden="true" />
                        <div ref={completedTasksStageRef} className="stage-divider stage-divider--completed" key="stage-div-done">
                          Completed tasks
                        </div>
                        {v3CompletedTasksOrdered.map(renderCard)}
                      </>
                    )}
                  </>
                )
              }
              const dailyTaskUnderStage2ForThisWindow = selectedWindow === '11'
              return (
                <>
                  <div className="stage-divider" key="stage-div-1">{stagedTasks.label1}</div>
                  {!dailyTaskUnderStage2ForThisWindow ? dailyTaskInlineTeaserEl : null}
                  {stagedTasks.stage1.map(renderCard)}
                  <div className="stage-divider" key="stage-div-2">{stagedTasks.label2}</div>
                  {stagedTasks.stage2.map(renderCard)}
                  {dailyTaskUnderStage2ForThisWindow ? (
                    <>
                      <div className="stage-divider stage-divider--daily" key="stage-div-daily">
                        Daily task
                      </div>
                      {dailyTaskInlineTeaserEl}
                    </>
                  ) : null}
                </>
              )
            }

            if (isV3Ui) {
              const isDone = (id: string) => statusByTask[id]?.status === 'done'
              const pendingTasks = currentTasks.filter((t) => !isDone(t.id))
              return (
                <>
                  {pendingTasks.map(renderCard)}
                  {v3CompletedTasksOrdered.length > 0 && (
                    <>
                      <div ref={completedTasksAnchorRef} className="completed-tasks-anchor" aria-hidden="true" />
                      <div ref={completedTasksStageRef} className="stage-divider stage-divider--completed" key="v3-grid-done">
                        Completed tasks
                      </div>
                      {v3CompletedTasksOrdered.map(renderCard)}
                    </>
                  )}
                </>
              )
            }

            return currentTasks.map(renderCard)
          })()}
        </div>
        )}

        {isAdmin && (
          <div className="admin-test-buttons">
            <button
              className="admin-reminder-test"
              type="button"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => triggerTestAchievementUnlock(), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                triggerTestAchievementUnlock()
              }}
            >
              Test achievement unlock
            </button>
          </div>
        )}

        {showBetaDemoModeFooter ? (
          <div className="beta-demo-mode-footer" role="region" aria-label="Demo mode">
            {!demoDayKey ? (
              <button type="button" className="beta-demo-mode-footer__start" onClick={startRandomDemoDay}>
                Demo mode
              </button>
            ) : (
              <div className="beta-demo-mode-footer__row">
                <span className="beta-demo-mode-footer__date" title="Local-only sandbox date">
                  Demo {demoDayKey}
                </span>
                <button type="button" className="beta-demo-mode-footer__btn" onClick={reshuffleDemoDailyTask}>
                  New task
                </button>
                <button type="button" className="beta-demo-mode-footer__btn beta-demo-mode-footer__exit" onClick={exitDemoDay}>
                  Exit
                </button>
              </div>
            )}
            {showBetaScreensaverPreview ? (
              <>
                <button
                  type="button"
                  className="beta-demo-mode-footer__screensaver"
                  onClick={() => openScreensaverPreview()}
                >
                  Preview screensaver
                </button>
                <button
                  type="button"
                  className="beta-demo-mode-footer__screensaver-demo"
                  title="Random: sample two-name quote, or break / shift countdown (static preview times)"
                  onClick={() => openScreensaverBetaDemoQuoteOrCountdown()}
                >
                  Preview quote or countdown
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="beta-demo-mode-footer__screensaver-demo"
              title="Play the window complete celebration animation"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => triggerBetaWindowCompleteAnimation(), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                triggerBetaWindowCompleteAnimation()
              }}
            >
              Test completion animation
            </button>
          </div>
        ) : null}

        {!demoDayKey ? (
          <div className="bottom-date-nav" role="region" aria-label="Choose day to view">
            <div className="bottom-date-nav__row">
              <button
                type="button"
                className="bottom-date-nav__arrow"
                aria-label="Previous day"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => handleDateChange(addDays(selectedDate, -1)), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  handleDateChange(addDays(selectedDate, -1))
                }}
              >
                ◀
              </button>
              <label className="bottom-date-nav__pill-wrap">
                <span className="bottom-date-nav__pill-face" aria-hidden="true">
                  <span className="bottom-date-nav__cal">📅</span>
                  <span className="bottom-date-nav__label">{displayDate(selectedDate)}</span>
                </span>
                <input
                  type="date"
                  className="bottom-date-nav__native-input"
                  value={selectedDateKey}
                  aria-label="Pick a date"
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    handleDateChange(startOfDay(parseDateKey(v)))
                  }}
                />
              </label>
              <button
                type="button"
                className="bottom-date-nav__arrow"
                aria-label="Next day"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => handleDateChange(addDays(selectedDate, 1)), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  handleDateChange(addDays(selectedDate, 1))
                }}
              >
                ▶
              </button>
              {!isTodaySelected ? (
                <button
                  type="button"
                  className="bottom-date-nav__today"
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => snapBrowseContextToLiveNow(), e)}
                  onClick={() => {
                    if (shouldIgnoreClick()) return
                    snapBrowseContextToLiveNow()
                  }}
                >
                  Back to today
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {uiVariant === 'v3' ? (
          <div className="app-settings-fab-wrap">
            <button
              type="button"
              className="app-settings-fab"
              aria-label="Settings"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => setShowAppSettingsMenu(true), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                setShowAppSettingsMenu(true)
              }}
            >
              <span className="app-settings-fab__icon" aria-hidden>
                ⚙️
              </span>
              <span className="app-settings-fab__label">Settings</span>
            </button>
          </div>
        ) : null}

        <div className="powered-by-footer">
          <button
            type="button"
            className="powered-by-unlock-btn"
            aria-label="Powered by"
            onTouchStart={beginTap}
            onTouchMove={moveTap}
            onTouchEnd={(e) => endTap(handlePoweredByUnlockTap, e)}
            onClick={() => {
              if (shouldIgnoreClick()) return
              handlePoweredByUnlockTap()
            }}
          >
            <img className="powered-by-image" src={poweredByUrl} alt="" loading="lazy" />
          </button>
          <div className="powered-by-version">Version 1</div>
        </div>
      </div>
      </div>

      <CalculatorOverlay open={showCalculator} onClose={() => setShowCalculator(false)} />

      {splitIcePromptOpen && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) => endTap(() => setSplitIcePromptOpen(false), e)}
          onClick={() => {
            if (shouldIgnoreClick()) return
            setSplitIcePromptOpen(false)
          }}
        >
          <div
            className={`selector-card${isV31 ? ' selector-card--v31' : ''}`}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="selector-header-center">
              <h3>Split Ice?</h3>
            </div>
            <div className="split-ice-prompt__row">
              <button
                type="button"
                className="split-ice-prompt__choice"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => handleSplitIceChoice(true), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  handleSplitIceChoice(true)
                }}
              >
                Split Ice
              </button>
              <button
                type="button"
                className="split-ice-prompt__choice"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => handleSplitIceChoice(false), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  handleSplitIceChoice(false)
                }}
              >
                One Person
              </button>
            </div>
          </div>
        </div>
      )}

      <DailyTaskModal
        uiVariant={uiVariant}
        open={showDailyTaskModal}
        onClose={() => {
          setShowDailyTaskModal(false)
          // If someone closes during the reveal, don't keep them stuck in the reveal state.
          setDailyTaskRevealing(false)
        }}
        shouldIgnoreClick={shouldIgnoreClick}
        recordTouch={recordTouch}
        beginTap={beginTap}
        moveTap={moveTap}
        endTap={endTap}
        busy={dailyTaskBusy}
        error={dailyTaskError}
        step={dailyTaskStep}
        setStep={setDailyTaskStep}
        isRevealing={dailyTaskRevealing}
        revealedAtMs={activeDailyTaskRun?.revealedAtMs}
        completedAtMs={activeDailyTaskRun?.completedAtMs}
        completedBy={
          (activeDailyTaskRun?.completedByList && activeDailyTaskRun.completedByList.length
            ? activeDailyTaskRun.completedByList.join(' + ')
            : '') ||
          activeDailyTaskRun?.completedBy
        }
        taskName={activeDailyTaskDef?.name || (isDemoDaySelected ? 'Demo task' : "Today's task")}
        materialsDesc={activeDailyTaskDef?.materials?.description || ''}
        materialsUrl={
          activeDailyTaskDef?.materials?.imagePath
            ? dailyTaskImageUrlByPath[activeDailyTaskDef.materials.imagePath] || ''
            : ''
        }
        whatToDoDesc={activeDailyTaskDef?.whatToDo?.description || ''}
        whatToDoUrl={
          activeDailyTaskDef?.whatToDo?.imagePath
            ? dailyTaskImageUrlByPath[activeDailyTaskDef.whatToDo.imagePath] || ''
            : ''
        }
        selectedEmployees={dailyTaskEmployees}
        onOpenEmployeeSelector={() => setShowDailyTaskEmployeeSelector(true)}
        onReveal={revealSelectedDailyTask}
        onSlotRevealComplete={handleDailyTaskSlotRevealComplete}
        onComplete={completeSelectedDailyTask}
      />

      {/* Daily Task Employee Selector */}
      {showDailyTaskEmployeeSelector && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) =>
            endTap(() => {
              setShowDailyTaskEmployeeSelector(false)
            }, e)
          }
          onClick={() => {
            if (shouldIgnoreClick()) return
            setShowDailyTaskEmployeeSelector(false)
          }}
        >
          <div
            className={`selector-card${isV31 ? ' selector-card--v31' : ''}`}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="selector-header-center">
              <h3>Who completed this task?</h3>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>Select up to 2</div>
            </div>
            
            <div className="employee-grid">
              {activeEmployees.map((user) => (
                <button
                  key={user}
                  className={`employee-option ${dailyTaskEmployees.includes(user) ? 'selected' : ''}`}
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) =>
                    endTap(() => {
                      if (!employeeColorsRef.current[user]) {
                        setPendingColorEmployee(user)
                        setPendingColorAction('noop')
                        setShowColorPicker(true)
                        return
                      }
                      setDailyTaskEmployees((prev) => {
                        const next = Array.from(new Set((prev || []).map((x) => String(x || '').trim()).filter(Boolean)))
                        const has = next.includes(user)
                        if (has) return next.filter((x) => x !== user)
                        if (next.length >= 2) return next
                        return [...next, user]
                      })
                    }, e)
                  }
                  onClick={() => {
                    if (shouldIgnoreClick()) return
                    if (!employeeColorsRef.current[user]) {
                      setPendingColorEmployee(user)
                      setPendingColorAction('noop')
                      setShowColorPicker(true)
                      return
                    }
                    setDailyTaskEmployees((prev) => {
                      const next = Array.from(new Set((prev || []).map((x) => String(x || '').trim()).filter(Boolean)))
                      const has = next.includes(user)
                      if (has) return next.filter((x) => x !== user)
                      if (next.length >= 2) return next
                      return [...next, user]
                    })
                  }}
                >
                  {user}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="daily-task-primary-btn"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) =>
                  endTap(() => {
                    setShowDailyTaskEmployeeSelector(false)
                  }, e)
                }
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowDailyTaskEmployeeSelector(false)
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isOrderReportTaskId && activeTaskId && (() => {
        const completion = taskState[selectedDateKey]?.[selectedWindow]?.[activeTaskId]
        // Show forgive button if: task is completed AND (was marked late OR current time is past cutoff)
        const cutoff = getLateCutoffForWindow(selectedDate, selectedWindow)
        const isPastCutoff = now >= cutoff
        const showForgiveOption = completion?.status === 'done' && (completion?.completedLate || isPastCutoff)
        return (
          <OrderReportOverlay
            open
            employees={orderReportEmployees}
            allEmployees={activeEmployees}
            onChangeEmployees={(pair) => setOrderReportEmployeesOverride(pair)}
            initialCounts={completion?.orderReportCounts}
            description={orderReportOverlayDescription}
            isSaving={isSaving}
            error={orderReportOverlayError}
            onClose={() => setActiveTaskId(null)}
            onSave={saveOrderReport}
            isAdmin={isAdmin}
            completedLate={showForgiveOption}
            lateForgiven={completion?.lateForgiven}
            onToggleLateForgiven={toggleLateForgiven}
          />
        )
      })()}

      {showMenu && (
        <div
          className="modal-backdrop"
          onTouchStart={(e) => {
            recordTouch()
            setShowMenu(false)
            e.preventDefault()
          }}
          onClick={() => {
            if (!shouldIgnoreClick()) setShowMenu(false)
          }}
        >
          <div
            className={uiVariant === 'v3' ? 'modal-sheet home-menu-sheet--v3' : 'modal-sheet'}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">{uiVariant === 'v3' ? null : <h2>More</h2>}</div>
              <button
                className={uiVariant === 'v3' ? 'close-button home-menu-close--v3' : 'close-button'}
                onTouchStart={(e) => {
                  recordTouch()
                  setShowMenu(false)
                  e.preventDefault()
                }}
                onClick={() => {
                  if (!shouldIgnoreClick()) setShowMenu(false)
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div
              className={
                uiVariant === 'v3' ? 'modal-body home-menu-body--v3' : 'modal-body more-menu-body'
              }
            >
              <button
                className={uiVariant === 'v3' ? 'home-menu-tile' : 'more-menu-btn'}
                type="button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => {
                  setShowMenu(false)
                  captureScrollYForNextLock()
                  setShowTimeOff(true)
                }, e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowMenu(false)
                  captureScrollYForNextLock()
                  setShowTimeOff(true)
                }}
              >
                <span className={uiVariant === 'v3' ? 'home-menu-tile-icon' : 'more-menu-btn-icon'}>📅</span>
                <span className={uiVariant === 'v3' ? 'home-menu-tile-label' : 'more-menu-btn-label'}>Time Off</span>
                {uiVariant === 'v3' ? null : <span className="more-menu-btn-arrow">›</span>}
              </button>

              <button
                className={uiVariant === 'v3' ? 'home-menu-tile' : 'more-menu-btn'}
                type="button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) =>
                  endTap(() => {
                    setShowMenu(false)
                    captureScrollYForNextLock()
                    setShowNotifyManagement(true)
                    beginNotifyManagementFlow()
                  }, e)
                }
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowMenu(false)
                  captureScrollYForNextLock()
                  setShowNotifyManagement(true)
                  beginNotifyManagementFlow()
                }}
              >
                <span className={uiVariant === 'v3' ? 'home-menu-tile-icon' : 'more-menu-btn-icon'}>🛠️</span>
                <span className={uiVariant === 'v3' ? 'home-menu-tile-label' : 'more-menu-btn-label'}>Report Issue</span>
                {uiVariant === 'v3' ? null : <span className="more-menu-btn-arrow">›</span>}
              </button>

              <button
                className={uiVariant === 'v3' ? 'home-menu-tile home-menu-tile--stock' : 'more-menu-btn'}
                type="button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) =>
                  endTap(() => {
                    setShowMenu(false)
                    captureScrollYForNextLock()
                    setShowStockReports(true)
                  }, e)
                }
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowMenu(false)
                  captureScrollYForNextLock()
                  setShowStockReports(true)
                }}
              >
                <span className={uiVariant === 'v3' ? 'home-menu-tile-icon' : 'more-menu-btn-icon'}>📦</span>
                <span className={uiVariant === 'v3' ? 'home-menu-tile-label' : 'more-menu-btn-label'}>OUT / LOW STOCK</span>
                {stockReportsPending.length > 0 ? (
                  <span
                    className={
                      uiVariant === 'v3'
                        ? `home-menu-tile-badge${
                            stockReportsOutPendingCount > 0
                              ? ' home-menu-tile-badge--urgent'
                              : ' home-menu-tile-badge--low'
                          }`
                        : `more-menu-btn-badge${
                            stockReportsOutPendingCount > 0
                              ? ' more-menu-btn-badge--urgent'
                              : ' more-menu-btn-badge--low'
                          }`
                    }
                    aria-label={`${stockReportsPending.length} pending stock reports`}
                  >
                    {stockReportsPending.length}
                  </span>
                ) : null}
                {uiVariant === 'v3' ? null : <span className="more-menu-btn-arrow">›</span>}
              </button>

              {(uiVariant !== 'v3' || v3AdminPosEnabled) && (
                <a
                  className={uiVariant === 'v3' ? 'home-menu-tile' : 'more-menu-btn'}
                  href="/pos"
                  onClick={() => setShowMenu(false)}
                >
                  <span className={uiVariant === 'v3' ? 'home-menu-tile-icon' : 'more-menu-btn-icon'}>💵</span>
                  <span className={uiVariant === 'v3' ? 'home-menu-tile-label' : 'more-menu-btn-label'}>Cash Only POS</span>
                  {uiVariant === 'v3' ? null : <span className="more-menu-btn-arrow">›</span>}
                </a>
              )}

              {uiVariant === 'v3' && (
                <button
                  type="button"
                  className="home-menu-tile home-menu-tile--locked home-menu-tile--locked-secret"
                  aria-label="Training mode, locked"
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => handleTrainingSecretTap(), e)}
                  onClick={() => {
                    if (shouldIgnoreClick()) return
                    handleTrainingSecretTap()
                  }}
                >
                  <span className="home-menu-tile-icon">🎓</span>
                  <span className="home-menu-tile-label">Training mode</span>
                  <span className="home-menu-tile-locked-badge">Locked</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OUT / LOW STOCK Modal */}
      {showStockReports && (
        <div
          className="modal-backdrop"
          onTouchStart={(e) => {
            recordTouch()
            if (stockWizardStep) {
              resetStockWizardToList()
            } else {
              resetStockWizardToList()
              setShowStockReports(false)
            }
            e.preventDefault()
          }}
          onClick={() => {
            if (shouldIgnoreClick()) return
            if (stockWizardStep) {
              resetStockWizardToList()
              return
            }
            resetStockWizardToList()
            setShowStockReports(false)
          }}
        >
          <div
            className={`modal-sheet modal-sheet-tall${uiVariant === 'v3' ? ' stock-modal--v3' : ''}`}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                <h2>
                  {stockWizardStep === 'kind'
                    ? 'What are you reporting?'
                    : stockWizardStep === 'item'
                      ? 'Type the Item'
                      : 'OUT / LOW STOCK'}
                </h2>
              </div>
              <button
                className={uiVariant === 'v3' ? 'close-button home-menu-close--v3' : 'close-button'}
                onTouchStart={(e) => {
                  recordTouch()
                  if (stockWizardStep === 'item') {
                    setStockWizardStep('kind')
                  } else if (stockWizardStep === 'kind') {
                    resetStockWizardToList()
                  } else {
                    resetStockWizardToList()
                    setShowStockReports(false)
                  }
                  e.preventDefault()
                }}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  if (stockWizardStep === 'item') {
                    setStockWizardStep('kind')
                  } else if (stockWizardStep === 'kind') {
                    resetStockWizardToList()
                  } else {
                    resetStockWizardToList()
                    setShowStockReports(false)
                  }
                }}
                aria-label={stockWizardStep ? 'Back' : 'Close'}
              >
                {stockWizardStep ? '←' : '✕'}
              </button>
            </div>
            {stockSendFxVisible && (
              <div key={stockSendFxNonce} className="stock-send-fx" aria-live="polite">
                <div className="stock-plane" aria-hidden="true">
                  🛩️
                </div>
                <div className="stock-send-fx-msg">A manager has been notified.</div>
              </div>
            )}
            <div className="modal-body stock-modal-body">
              {!stockWizardStep && (
                <div className="stock-list-view">
                  {stockReportsPending.length === 0 && stockReportsFinished.length === 0 ? (
                    <>
                      <div className="stock-empty">No reports yet.</div>
                      <button
                        className="stock-new-btn"
                        type="button"
                        onTouchStart={beginTap}
                        onTouchMove={moveTap}
                        onTouchEnd={(e) => endTap(() => beginStockReportFlow(), e)}
                        onClick={() => {
                          if (shouldIgnoreClick()) return
                          beginStockReportFlow()
                        }}
                      >
                        + Report Item
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="stock-recent-title stock-section-header stock-section-header--active">
                        <span className="stock-section-header-label">Active</span>
                        {stockReportsPending.length > 0 ? (
                          <span
                            className={`stock-section-count stock-section-count--${
                              stockReportsOutPendingCount > 0 ? 'out' : 'low'
                            }`}
                          >
                            {stockReportsPending.length}
                          </span>
                        ) : null}
                      </div>
                      {stockReportsPending.length === 0 ? (
                        <div className="stock-empty stock-empty-active">No active items.</div>
                      ) : (
                        <div className="stock-bubbles-scroll">
                          <StockPendingReportList
                            reports={stockReportsPending}
                            emptyMessage="No active items."
                            renderCard={(r) => (
                              <StockItemBubble
                                key={r.id}
                                report={r}
                                beginTap={beginTap}
                                moveTap={moveTap}
                                endTap={endTap}
                                shouldIgnoreClick={shouldIgnoreClick}
                                showFinishButton={isAdmin && r.status === 'pending'}
                                finishing={stockFinishingId === r.id}
                                onFinish={() => {
                                  setStockFinishingId(r.id)
                                  void setStockReportStatus(r.id, 'finished')
                                    .catch((err) => {
                                      console.error('Failed to finish stock report:', err)
                                    })
                                    .finally(() => {
                                      setStockFinishingId(null)
                                    })
                                }}
                                deleting={stockDeletingId === r.id}
                                onDelete={() => {
                                  if (!confirm('Delete this report?')) return
                                  setStockDeletingId(r.id)
                                  void deleteStockReport(r.id)
                                    .catch((err) => {
                                      console.error('Failed to delete stock report:', err)
                                    })
                                    .finally(() => {
                                      setStockDeletingId(null)
                                    })
                                  void sendStockReportEmailNotification({
                                    kind: r.kind,
                                    item: `${r.item} (deleted)`,
                                    by: r.createdBy || undefined,
                                    reportedAtIso: new Date().toISOString(),
                                  })
                                  setStockSendFxNonce((n) => n + 1)
                                  setStockSendFxVisible(true)
                                  if (stockSendFxTimeoutRef.current) window.clearTimeout(stockSendFxTimeoutRef.current)
                                  stockSendFxTimeoutRef.current = window.setTimeout(() => {
                                    setStockSendFxVisible(false)
                                  }, 1600)
                                }}
                              />
                            )}
                          />
                        </div>
                      )}

                      <button
                        className="stock-new-btn"
                        type="button"
                        onTouchStart={beginTap}
                        onTouchMove={moveTap}
                        onTouchEnd={(e) => endTap(() => beginStockReportFlow(), e)}
                        onClick={() => {
                          if (shouldIgnoreClick()) return
                          beginStockReportFlow()
                        }}
                      >
                        + Report Item
                      </button>

                      {stockReportsFinished.length > 0 ? (
                        <>
                          <div className="stock-recent-title">Resolved</div>
                          <div className="stock-bubble-grid">
                            {stockReportsFinished.map((r) => (
                              <StockItemBubble
                                key={r.id}
                                report={r}
                                beginTap={beginTap}
                                moveTap={moveTap}
                                endTap={endTap}
                                shouldIgnoreClick={shouldIgnoreClick}
                                showFinishButton={false}
                                deleting={stockDeletingId === r.id}
                                onDelete={() => {
                                  if (!confirm('Delete this report?')) return
                                  setStockDeletingId(r.id)
                                  void deleteStockReport(r.id)
                                    .catch((err) => {
                                      console.error('Failed to delete stock report:', err)
                                    })
                                    .finally(() => {
                                      setStockDeletingId(null)
                                    })
                                  void sendStockReportEmailNotification({
                                    kind: r.kind,
                                    item: `${r.item} (deleted)`,
                                    by: r.createdBy || undefined,
                                    reportedAtIso: new Date().toISOString(),
                                  })
                                  setStockSendFxNonce((n) => n + 1)
                                  setStockSendFxVisible(true)
                                  if (stockSendFxTimeoutRef.current) window.clearTimeout(stockSendFxTimeoutRef.current)
                                  stockSendFxTimeoutRef.current = window.setTimeout(() => {
                                    setStockSendFxVisible(false)
                                  }, 1600)
                                }}
                              />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {stockWizardStep === 'kind' && (
                <div className="stock-kind-view">
                  {stockError ? <div className="stock-error">{stockError}</div> : null}
                  <button
                    className="stock-kind-btn stock-kind-low"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        setStockKind('low')
                        setStockError(null)
                        setStockWizardStep('item')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      setStockKind('low')
                      setStockError(null)
                      setStockWizardStep('item')
                    }}
                  >
                    Low Stock
                  </button>
                  <button
                    className="stock-kind-btn stock-kind-out"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        setStockKind('out')
                        setStockError(null)
                        setStockWizardStep('item')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      setStockKind('out')
                      setStockError(null)
                      setStockWizardStep('item')
                    }}
                  >
                    Out of Stock
                  </button>
                </div>
              )}

              {stockWizardStep === 'item' && (
                <div className="stock-item-view">
                  {stockError ? <div className="stock-error">{stockError}</div> : null}
                  <div className="stock-item-kind">
                    Reporting:{' '}
                    <span className={`stock-kind-chip stock-kind-${stockKind || 'low'}`}>
                      {stockKind === 'out' ? 'Out of Stock' : 'Low Stock'}
                    </span>
                  </div>
                  <label className="stock-item-label">
                    Item
                    <input
                      className="stock-item-input"
                      type="text"
                      value={stockItem}
                      onChange={(e) => setStockItem(e.target.value)}
                      placeholder="Type item name…"
                      autoFocus
                      inputMode="text"
                    />
                  </label>
                  <button
                    className="stock-send-btn"
                    type="button"
                    disabled={stockSending}
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) => endTap(() => void sendStockReportNow(), e)}
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      void sendStockReportNow()
                    }}
                  >
                    {stockSending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notify Management Modal */}
      {showNotifyManagement && (
        <div
          className="modal-backdrop"
          onTouchStart={(e) => {
            recordTouch()
            resetNotifyManagementFlow()
            setShowNotifyManagement(false)
            e.preventDefault()
          }}
          onClick={() => {
            if (shouldIgnoreClick()) return
            resetNotifyManagementFlow()
            setShowNotifyManagement(false)
          }}
        >
          <div
            className="modal-sheet"
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                <h2>
                  {notifyWizardStep === 'kind'
                    ? 'Report Issue'
                    : notifyWizardStep === 'details'
                      ? 'Add Details'
                      : notifyWizardStep === 'who'
                        ? 'Who are you?'
                        : 'Report Issue'}
                </h2>
              </div>
              <button
                className="close-button"
                onTouchStart={(e) => {
                  recordTouch()
                  if (notifyWizardStep === 'who') {
                    setNotifyWizardStep('details')
                  } else if (notifyWizardStep === 'details') {
                    setNotifyWizardStep('kind')
                  } else if (notifyWizardStep === 'kind') {
                    resetNotifyManagementFlow()
                    setShowNotifyManagement(false)
                  } else {
                    resetNotifyManagementFlow()
                    setShowNotifyManagement(false)
                  }
                  e.preventDefault()
                }}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  if (notifyWizardStep === 'who') {
                    setNotifyWizardStep('details')
                  } else if (notifyWizardStep === 'details') {
                    setNotifyWizardStep('kind')
                  } else if (notifyWizardStep === 'kind') {
                    resetNotifyManagementFlow()
                    setShowNotifyManagement(false)
                  } else {
                    resetNotifyManagementFlow()
                    setShowNotifyManagement(false)
                  }
                }}
                aria-label={notifyWizardStep === 'details' || notifyWizardStep === 'who' ? 'Back' : 'Close'}
              >
                {notifyWizardStep === 'details' || notifyWizardStep === 'who' ? '←' : '✕'}
              </button>
            </div>

            {notifySendFxVisible && (
              <div key={notifySendFxNonce} className="notify-send-fx" aria-live="polite">
                <div className="notify-plane" aria-hidden="true">
                  🛩️
                </div>
                <div className="notify-send-fx-msg">A manager has been notified.</div>
              </div>
            )}

            <div className="modal-body notify-modal-body">
              {notifyWizardStep === 'kind' && (
                <div className="notify-kind-view">
                  {notifyError ? <div className="notify-error">{notifyError}</div> : null}
                  <button
                    className="notify-kind-btn notify-kind-leak"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        setNotifyKind('leak')
                        setNotifyError(null)
                        setNotifyWizardStep('details')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      setNotifyKind('leak')
                      setNotifyError(null)
                      setNotifyWizardStep('details')
                    }}
                  >
                    Report Leak
                  </button>
                  <button
                    className="notify-kind-btn notify-kind-broken"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        setNotifyKind('broken')
                        setNotifyError(null)
                        setNotifyWizardStep('details')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      setNotifyKind('broken')
                      setNotifyError(null)
                      setNotifyWizardStep('details')
                    }}
                  >
                    Report Broken
                  </button>
                  <button
                    className="notify-kind-btn notify-kind-insect"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        setNotifyKind('insect')
                        setNotifyError(null)
                        setNotifyWizardStep('details')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      setNotifyKind('insect')
                      setNotifyError(null)
                      setNotifyWizardStep('details')
                    }}
                  >
                    Insect Sighting
                  </button>
                  <button
                    className="notify-kind-btn notify-kind-custom"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        setNotifyKind('custom')
                        setNotifyError(null)
                        setNotifyWizardStep('details')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      setNotifyKind('custom')
                      setNotifyError(null)
                      setNotifyWizardStep('details')
                    }}
                  >
                    Custom
                  </button>
                </div>
              )}

              {notifyWizardStep === 'details' && (
                <div className="notify-details-view">
                  {notifyError ? <div className="notify-error">{notifyError}</div> : null}
                  <div className="notify-details-kind">
                    Reporting:{' '}
                    <span className="notify-kind-chip">
                      {notifyKind === 'leak'
                        ? 'Leak'
                        : notifyKind === 'broken'
                          ? 'Broken'
                          : notifyKind === 'insect'
                            ? 'Insect sighting'
                            : notifyKind === 'custom'
                              ? 'Custom'
                              : '—'}
                    </span>
                  </div>

                  {notifyKind === 'custom' && (
                    <label className="notify-title-label">
                      Title
                      <input
                        className="notify-title-input"
                        type="text"
                        value={notifyCustomTitle}
                        onChange={(e) => setNotifyCustomTitle(e.target.value)}
                        placeholder="Type a short title…"
                        autoFocus
                        inputMode="text"
                      />
                    </label>
                  )}

                  <label className="notify-details-label">
                    Additional info
                    <textarea
                      className="notify-details-input"
                      placeholder="Type any extra details (where/what happened)…"
                      value={notifyDetails}
                      onChange={(e) => setNotifyDetails(e.target.value)}
                      rows={4}
                    />
                  </label>

                  <button
                    className="notify-continue-btn"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        if (notifyKind === 'custom' && !notifyCustomTitle.trim()) {
                          setNotifyError('Type a title for your custom report.')
                          return
                        }
                        setNotifyError(null)
                        setNotifyWizardStep('who')
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      if (notifyKind === 'custom' && !notifyCustomTitle.trim()) {
                        setNotifyError('Type a title for your custom report.')
                        return
                      }
                      setNotifyError(null)
                      setNotifyWizardStep('who')
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}

              {notifyWizardStep === 'who' && (
                <div className="notify-who-view">
                  {notifyError ? <div className="notify-error">{notifyError}</div> : null}
                  <p className="timeoff-help">Select your name, then submit your report.</p>
                  <div className="notify-who-scroll">
                    <div className="timeoff-employee-list">
                      {activeEmployees.map((name) => (
                        <button
                          key={name}
                          className={`timeoff-employee-btn ${notifyReporterName === name ? 'selected' : ''}`}
                          type="button"
                          onTouchStart={beginTap}
                          onTouchMove={moveTap}
                          onTouchEnd={(e) =>
                            endTap(() => {
                              setNotifyReporterName(name)
                              setNotifyError(null)
                            }, e)
                          }
                          onClick={() => {
                            if (shouldIgnoreClick()) return
                            setNotifyReporterName(name)
                            setNotifyError(null)
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="notify-who-footer">
                    <button
                      className="notify-submit-btn"
                      type="button"
                      disabled={notifySending}
                      onTouchStart={beginTap}
                      onTouchMove={moveTap}
                      onTouchEnd={(e) => endTap(() => void sendNotifyManagementNow(), e)}
                      onClick={() => {
                        if (shouldIgnoreClick()) return
                        void sendNotifyManagementNow()
                      }}
                    >
                      {notifySending ? 'Sending…' : 'Submit Report'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Time Off Modal */}
      {showTimeOff && (
        <div
          className="modal-backdrop"
          onTouchStart={(e) => {
            recordTouch()
            if (timeOffWizardStep) {
              // In wizard - go back to list
              setTimeOffWizardStep(null)
              setTimeOffEditingId(null)
              setTimeOffSelectedShifts([])
              setTimeOffDateRange({ start: '', end: '' })
              setTimeOffReason('')
              setTimeOffError(null)
            } else {
              setShowTimeOff(false)
            }
            e.preventDefault()
          }}
          onClick={() => {
            if (!shouldIgnoreClick()) {
              if (timeOffWizardStep) {
                // In wizard - go back to list
                setTimeOffWizardStep(null)
                setTimeOffEditingId(null)
                setTimeOffSelectedShifts([])
                setTimeOffDateRange({ start: '', end: '' })
                setTimeOffReason('')
                setTimeOffError(null)
              } else {
                setShowTimeOff(false)
              }
            }
          }}
        >
          <div
            className={`modal-sheet modal-sheet-tall${uiVariant === 'v3' ? ' timeoff-modal--v3' : ''}`}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                <h2>
                  {timeOffWizardStep === 'who' ? 'Who are you?' :
                   timeOffWizardStep === 'availability' ? 'Your Usual Availability' :
                   timeOffWizardStep === 'select' ? 'Select Time Off' :
                   timeOffWizardStep === 'reason' ? 'Request Details' :
                   'Time Off Requests'}
                </h2>
              </div>
              <button
                className={uiVariant === 'v3' ? 'close-button home-menu-close--v3' : 'close-button'}
                onTouchStart={(e) => {
                  recordTouch()
                  if (timeOffWizardStep) {
                    if (timeOffWizardStep === 'who') {
                      setTimeOffWizardStep(null)
                      setTimeOffEditingId(null)
                    } else if (timeOffWizardStep === 'availability') {
                      setTimeOffWizardStep('who')
                    } else if (timeOffWizardStep === 'select') {
                      setTimeOffWizardStep('availability')
                    } else if (timeOffWizardStep === 'reason') {
                      setTimeOffWizardStep('select')
                    }
                  } else {
                    setShowTimeOff(false)
                  }
                  e.preventDefault()
                }}
                onClick={() => {
                  if (!shouldIgnoreClick()) {
                    if (timeOffWizardStep) {
                      if (timeOffWizardStep === 'who') {
                        setTimeOffWizardStep(null)
                        setTimeOffEditingId(null)
                      } else if (timeOffWizardStep === 'availability') {
                        setTimeOffWizardStep('who')
                      } else if (timeOffWizardStep === 'select') {
                        setTimeOffWizardStep('availability')
                      } else if (timeOffWizardStep === 'reason') {
                        setTimeOffWizardStep('select')
                      }
                    } else {
                      setShowTimeOff(false)
                    }
                  }
                }}
                aria-label={timeOffWizardStep ? 'Back' : 'Close'}
              >
                {timeOffWizardStep ? '←' : '✕'}
              </button>
            </div>

            <div className="modal-body timeoff-modal-body timeoff-content">
              {/* List View */}
              {!timeOffWizardStep && (
                <div className="timeoff-list-view timeoff-view timeoff-view--list">
                  <button
                    className="timeoff-new-btn"
                    type="button"
                    onClick={() => {
                      setTimeOffEditingId(null)
                      setTimeOffSelectedShifts([])
                      setTimeOffDateRange({ start: '', end: '' })
                      setTimeOffReason('')
                      setTimeOffError(null)
                      setTimeOffRequestKind('date_range')
                      // Always show employee selection first
                      setTimeOffWizardStep('who')
                    }}
                  >
                    + New Request
                  </button>

                  {publicTimeOffRequests.length === 0 ? (
                    <div className="timeoff-empty">
                      {timeOffRequests.length === 0
                        ? 'No time off requests yet.'
                        : 'No requests in the current window. Upcoming time off always shows here; after the last day off, each request stays for two more days, then drops off. Admins still see full history.'}
                    </div>
                  ) : (
                    <div className="timeoff-request-list">
                      {publicTimeOffRequests.map((req) => (
                        <div
                          key={req.id}
                          className={`timeoff-request-card timeoff-status-${req.status}`}
                          onClick={() => {
                            if (req.status === 'pending' && req.employee === timeOffSelectedEmployee) {
                              // Allow editing own pending requests
                              setTimeOffEditingId(req.id)
                              setTimeOffSelectedShifts([...req.requestedShifts])
                              setTimeOffDateRange(req.dateRange 
                                ? { start: req.dateRange.startDateKey, end: req.dateRange.endDateKey } 
                                : { start: '', end: '' })
                              setTimeOffReason(req.reason)
                              setTimeOffRequestKind(req.requestKind)
                              setTimeOffError(null)
                              setTimeOffWizardStep('select')
                            }
                          }}
                        >
                          <div className="timeoff-request-header">
                            <span className="timeoff-request-employee">{req.employee}</span>
                            <span className={`timeoff-status-chip timeoff-status-${req.status}`}>
                              {req.status === 'pending' ? '⏳ Pending' :
                               req.status === 'approved' ? '✓ Approved' : '✗ Denied'}
                            </span>
                          </div>
                          <div className="timeoff-request-shifts">
                            {formatTimeOffSummaryLine(req)}
                          </div>
                          {req.reason && (
                            <div className="timeoff-request-reason">
                              "{req.reason.length > 60 ? req.reason.slice(0, 60) + '...' : req.reason}"
                            </div>
                          )}
                          <div className="timeoff-request-meta">
                            {new Date(req.createdAt).toLocaleDateString()}
                            {req.status === 'pending' && req.employee === timeOffSelectedEmployee && (
                              <span className="timeoff-edit-hint"> · Tap to edit</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 1: Who are you? */}
              {timeOffWizardStep === 'who' && (
                <div className="timeoff-who-view timeoff-view timeoff-view--who">
                  <p className="timeoff-help">Select your name to continue.</p>
                  <div className="timeoff-employee-list">
                    {activeEmployees.map((emp) => (
                      <button
                        key={emp}
                        className={`timeoff-employee-btn ${timeOffSelectedEmployee === emp ? 'selected' : ''}`}
                        type="button"
                        onClick={() => {
                          setTimeOffSelectedEmployee(emp)
                          try {
                            localStorage.setItem(LS_TIMEOFF_EMPLOYEE_KEY, emp)
                          } catch {
                            /* empty */
                          }
                          setTimeOffWizardStep('availability')
                        }}
                      >
                        {emp}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Your Usual Availability */}
              {timeOffWizardStep === 'availability' && (
                <div className="timeoff-availability-view timeoff-view timeoff-view--availability">
                  {(() => {
                    const avail = timeOffSelectedEmployee ? availabilityState.patterns[timeOffSelectedEmployee] : null
                    if (!avail) {
                      return (
                        <div className="timeoff-no-availability">
                          <p>Admin hasn't set your usual availability yet.</p>
                          <p>You can still request time off by selecting specific shifts.</p>
                        </div>
                      )
                    }
                    return (
                      <div className="timeoff-week-grid">
                        <div className="timeoff-week-header">
                          <div className="timeoff-week-label"></div>
                          {DAY_OF_WEEK_KEYS.map((day) => (
                            <div key={day} className="timeoff-week-day">{DAY_OF_WEEK_LABELS[day]}</div>
                          ))}
                        </div>
                        <div className="timeoff-week-row">
                          <div className="timeoff-week-label">Lunch</div>
                          {DAY_OF_WEEK_KEYS.map((day) => (
                            <div
                              key={day}
                              className={`timeoff-week-cell ${avail[day]?.lunch ? 'available' : 'unavailable'}`}
                            >
                              {avail[day]?.lunch ? '✓' : '—'}
                            </div>
                          ))}
                        </div>
                        <div className="timeoff-week-row">
                          <div className="timeoff-week-label">Dinner</div>
                          {DAY_OF_WEEK_KEYS.map((day) => (
                            <div
                              key={day}
                              className={`timeoff-week-cell ${avail[day]?.dinner ? 'available' : 'unavailable'}`}
                            >
                              {avail[day]?.dinner ? '✓' : '—'}
                            </div>
                          ))}
                        </div>
                        <div className="timeoff-shift-times">
                          <div>Lunch: 11am–5pm</div>
                          <div>Dinner: 5pm–9pm (5pm–10pm Fri/Sat)</div>
                        </div>
                      </div>
                    )
                  })()}
                  <button
                    className="timeoff-continue-btn"
                    type="button"
                    onClick={() => setTimeOffWizardStep('select')}
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Step 3: Select Shifts or Date Range */}
              {timeOffWizardStep === 'select' && (
                <div className="timeoff-select-view timeoff-view timeoff-view--select">
                  <div className="timeoff-kind-toggle">
                    <button
                      className={timeOffRequestKind === 'shift_blocks' ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setTimeOffRequestKind('shift_blocks')
                        setTimeOffDateRange({ start: '', end: '' })
                      }}
                    >
                      Select Shifts
                    </button>
                    <button
                      className={timeOffRequestKind === 'date_range' ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setTimeOffRequestKind('date_range')
                        setTimeOffSelectedShifts([])
                      }}
                    >
                      Date Range
                    </button>
                  </div>

                  {timeOffRequestKind === 'shift_blocks' && (
                    <div className="timeoff-shift-picker">
                      <div className="timeoff-calendar-shell">
                        <div className="timeoff-calendar-sticky">
                          <div className="timeoff-calendar-nav">
                            <button
                              type="button"
                              onClick={() => setTimeOffCalendarMonth(addDays(timeOffCalendarMonth, -30))}
                            >
                              ‹
                            </button>
                            <span>
                              {timeOffCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                              type="button"
                              onClick={() => setTimeOffCalendarMonth(addDays(timeOffCalendarMonth, 30))}
                            >
                              ›
                            </button>
                          </div>
                          <div className="timeoff-calendar-header">
                          {DAY_OF_WEEK_KEYS.map((day) => (
                            <div key={day}>{DAY_OF_WEEK_LABELS[day]}</div>
                          ))}
                          </div>
                        </div>
                        <div className="timeoff-calendar-body">
                          {(() => {
                            // Generate calendar days for the month
                            const year = timeOffCalendarMonth.getFullYear()
                            const month = timeOffCalendarMonth.getMonth()
                            const firstDay = new Date(year, month, 1)
                            const lastDay = new Date(year, month + 1, 0)
                            const startPad = firstDay.getDay() // 0 = Sunday
                            const days: (Date | null)[] = []
                            
                            for (let i = 0; i < startPad; i++) days.push(null)
                            for (let d = 1; d <= lastDay.getDate(); d++) {
                              days.push(new Date(year, month, d))
                            }
                            
                            const today = startOfDay(new Date())
                            
                            return days.map((date, idx) => {
                              if (!date) return <div key={`pad-${idx}`} className="timeoff-calendar-cell empty" />
                              
                              const dateKey = formatDateKey(date)
                              const isPast = date < today
                              const isToday = date.getTime() === today.getTime()
                              
                              const lunchSelected = timeOffSelectedShifts.some(s => s.dateKey === dateKey && s.shift === 'lunch')
                              const dinnerSelected = timeOffSelectedShifts.some(s => s.dateKey === dateKey && s.shift === 'dinner')
                              
                              const toggleShift = (shift: ShiftType) => {
                                if (isShiftInPast(dateKey, shift)) return
                                
                                const exists = timeOffSelectedShifts.some(s => s.dateKey === dateKey && s.shift === shift)
                                if (exists) {
                                  setTimeOffSelectedShifts(timeOffSelectedShifts.filter(s => !(s.dateKey === dateKey && s.shift === shift)))
                                } else {
                                  setTimeOffSelectedShifts([...timeOffSelectedShifts, { dateKey, shift }])
                                }
                              }
                              
                              return (
                                <div key={dateKey} className={`timeoff-calendar-cell ${isPast ? 'past' : ''} ${isToday ? 'today' : ''}`}>
                                  <div className="timeoff-calendar-date">{date.getDate()}</div>
                                  <div className="timeoff-calendar-shifts">
                                    <button
                                      type="button"
                                      className={`timeoff-shift-btn lunch ${lunchSelected ? 'selected' : ''} ${isShiftInPast(dateKey, 'lunch') ? 'disabled' : ''}`}
                                      onClick={() => toggleShift('lunch')}
                                      disabled={isShiftInPast(dateKey, 'lunch')}
                                    >
                                      L
                                    </button>
                                    <button
                                      type="button"
                                      className={`timeoff-shift-btn dinner ${dinnerSelected ? 'selected' : ''} ${isShiftInPast(dateKey, 'dinner') ? 'disabled' : ''}`}
                                      onClick={() => toggleShift('dinner')}
                                      disabled={isShiftInPast(dateKey, 'dinner')}
                                    >
                                      D
                                    </button>
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                      <div className="timeoff-selected-summary">
                        {timeOffSelectedShifts.length === 0 ? (
                          <span className="timeoff-none-selected">Tap L (Lunch) or D (Dinner) to select shifts</span>
                        ) : (
                          <span>{timeOffSelectedShifts.length} shift{timeOffSelectedShifts.length !== 1 ? 's' : ''} selected</span>
                        )}
                      </div>
                    </div>
                  )}

                  {timeOffRequestKind === 'date_range' && (
                    <div className="timeoff-date-range">
                      <div className="timeoff-date-inputs">
                        <button
                          type="button"
                          className="timeoff-date-picker-btn"
                          onClick={() => {
                            setTimeOffDatePickerMonth(timeOffDateRange.start ? parseDateKey(timeOffDateRange.start) : new Date())
                            setTimeOffDatePickerOpen('start')
                          }}
                        >
                          <span className="timeoff-date-picker-label">Start Date</span>
                          <span className="timeoff-date-picker-value">
                            {timeOffDateRange.start ? displayDate(parseDateKey(timeOffDateRange.start)) : 'Select...'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="timeoff-date-picker-btn"
                          onClick={() => {
                            setTimeOffDatePickerMonth(timeOffDateRange.end ? parseDateKey(timeOffDateRange.end) : (timeOffDateRange.start ? parseDateKey(timeOffDateRange.start) : new Date()))
                            setTimeOffDatePickerOpen('end')
                          }}
                        >
                          <span className="timeoff-date-picker-label">End Date</span>
                          <span className="timeoff-date-picker-value">
                            {timeOffDateRange.end ? displayDate(parseDateKey(timeOffDateRange.end)) : 'Select...'}
                          </span>
                        </button>
                      </div>
                      
                      {/* Custom Date Picker Modal (portal so it's not clipped by modal sheet overflow/contain) */}
                      {timeOffDatePickerOpen &&
                        createPortal(
                          <div
                            className={`timeoff-date-picker-overlay${uiVariant === 'v3' ? ' timeoff-date-picker-overlay--v3' : ''}`}
                            onClick={() => setTimeOffDatePickerOpen(null)}
                          >
                            <div
                              className={`timeoff-date-picker-card${uiVariant === 'v3' ? ' timeoff-date-picker-card--v3' : ''}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="timeoff-date-picker-header">
                                <h3>{timeOffDatePickerOpen === 'start' ? 'Select Start Date' : 'Select End Date'}</h3>
                                <button type="button" onClick={() => setTimeOffDatePickerOpen(null)}>✕</button>
                              </div>
                              <div className="timeoff-date-picker-nav">
                                <button
                                  type="button"
                                  onClick={() => setTimeOffDatePickerMonth(addDays(timeOffDatePickerMonth, -30))}
                                >
                                  ◀
                                </button>
                                <span>
                                  {timeOffDatePickerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setTimeOffDatePickerMonth(addDays(timeOffDatePickerMonth, 30))}
                                >
                                  ▶
                                </button>
                              </div>
                              <div className="timeoff-date-picker-weekdays">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                  <div key={d}>{d}</div>
                                ))}
                              </div>
                              <div className="timeoff-date-picker-days">
                                {(() => {
                                  const year = timeOffDatePickerMonth.getFullYear()
                                  const month = timeOffDatePickerMonth.getMonth()
                                  const firstDay = new Date(year, month, 1)
                                  const lastDay = new Date(year, month + 1, 0)
                                  const startOffset = firstDay.getDay()
                                  const totalDays = lastDay.getDate()
                                  const today = startOfDay(new Date())
                                  const minDate = timeOffDatePickerOpen === 'end' && timeOffDateRange.start
                                    ? parseDateKey(timeOffDateRange.start)
                                    : today

                                  const cells: React.ReactNode[] = []

                                  // Empty cells before first day
                                  for (let i = 0; i < startOffset; i++) {
                                    cells.push(<div key={`empty-${i}`} className="timeoff-date-picker-day empty" />)
                                  }

                                  // Day cells
                                  for (let day = 1; day <= totalDays; day++) {
                                    const date = new Date(year, month, day)
                                    const dateKey = formatDateKey(date)
                                    const isPast = date < minDate
                                    const isSelected =
                                      (timeOffDatePickerOpen === 'start' && timeOffDateRange.start === dateKey) ||
                                      (timeOffDatePickerOpen === 'end' && timeOffDateRange.end === dateKey)
                                    const isInRange =
                                      timeOffDateRange.start &&
                                      timeOffDateRange.end &&
                                      dateKey >= timeOffDateRange.start &&
                                      dateKey <= timeOffDateRange.end

                                    cells.push(
                                      <button
                                        key={day}
                                        type="button"
                                        className={`timeoff-date-picker-day ${isPast ? 'disabled' : ''} ${isSelected ? 'selected' : ''} ${isInRange && !isSelected ? 'in-range' : ''}`}
                                        disabled={isPast}
                                        onClick={() => {
                                          if (timeOffDatePickerOpen === 'start') {
                                            setTimeOffDateRange({
                                              start: dateKey,
                                              end: timeOffDateRange.end && dateKey > timeOffDateRange.end ? '' : timeOffDateRange.end,
                                            })
                                          } else {
                                            setTimeOffDateRange({ ...timeOffDateRange, end: dateKey })
                                          }
                                          setTimeOffDatePickerOpen(null)
                                        }}
                                      >
                                        {day}
                                      </button>
                                    )
                                  }

                                  return cells
                                })()}
                              </div>
                            </div>
                          </div>,
                          document.body
                        )}
                      {timeOffDateRange.start && timeOffDateRange.end && (
                        <div className="timeoff-range-preview">
                          <p>This request covers:</p>
                          {(() => {
                            // Calendar day count should be timezone-safe and inclusive.
                            const toUtcDayMs = (dateKey: string): number => {
                              const [yy, mm, dd] = String(dateKey || '').split('-').map((x) => parseInt(x, 10))
                              if (!yy || !mm || !dd) return NaN
                              return Date.UTC(yy, mm - 1, dd)
                            }
                            const startMs = toUtcDayMs(timeOffDateRange.start)
                            const endMs = toUtcDayMs(timeOffDateRange.end)
                            const calendarDays =
                              Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
                                ? Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
                                : 0
                            
                            return (
                              <p>
                                <strong>{calendarDays} day{calendarDays !== 1 ? 's' : ''}</strong>
                                {' '}({formatDateRange(timeOffDateRange.start, timeOffDateRange.end)})
                              </p>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    className="timeoff-continue-btn"
                    type="button"
                    disabled={
                      (timeOffRequestKind === 'shift_blocks' && timeOffSelectedShifts.length === 0) ||
                      (timeOffRequestKind === 'date_range' && (!timeOffDateRange.start || !timeOffDateRange.end))
                    }
                    onClick={() => setTimeOffWizardStep('reason')}
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Step 4: Reason + Submit */}
              {timeOffWizardStep === 'reason' && (
                <div className="timeoff-reason-view timeoff-view timeoff-view--reason">
                  <div className="timeoff-summary">
                    <h3>Request Summary</h3>
                    <p><strong>Employee:</strong> {timeOffSelectedEmployee}</p>
                    <p><strong>Days:</strong> {
                      timeOffRequestKind === 'shift_blocks'
                        ? (() => {
                            const uniqueDates = new Set(timeOffSelectedShifts.map(s => s.dateKey))
                            const calendarDays = uniqueDates.size
                            if (calendarDays === 0) return 'No days'
                            const sortedDates = Array.from(uniqueDates).sort()
                            const firstDate = sortedDates[0]
                            const lastDate = sortedDates[sortedDates.length - 1]
                            return `${formatDateRange(firstDate, lastDate)} (${calendarDays} day${calendarDays !== 1 ? 's' : ''})`
                          })()
                        : (() => {
                            const calendarDays = countInclusiveCalendarDays(timeOffDateRange.start, timeOffDateRange.end)
                            return `${formatDateRange(timeOffDateRange.start, timeOffDateRange.end)} (${calendarDays} day${calendarDays !== 1 ? 's' : ''})`
                          })()
                    }</p>
                  </div>
                  
                  <label className="timeoff-reason-label">
                    Reason (optional)
                    <textarea
                      className="timeoff-reason-input"
                      placeholder="Why do you need this time off?"
                      value={timeOffReason}
                      onChange={(e) => setTimeOffReason(e.target.value)}
                      rows={3}
                    />
                  </label>

                  {timeOffError && (
                    <div className="timeoff-error">{timeOffError}</div>
                  )}

                  <button
                    className="timeoff-submit-btn"
                    type="button"
                    disabled={timeOffSaving}
                    onClick={async () => {
                      if (!timeOffSelectedEmployee) {
                        setTimeOffError('Please select an employee.')
                        return
                      }
                      
                      setTimeOffSaving(true)
                      setTimeOffError(null)
                      
                      try {
                        let shiftsToSubmit: RequestedShift[]
                        
                        if (timeOffRequestKind === 'shift_blocks') {
                          shiftsToSubmit = timeOffSelectedShifts.filter(s => !isShiftInPast(s.dateKey, s.shift))
                        } else {
                          const avail = availabilityState.patterns[timeOffSelectedEmployee] || null
                          shiftsToSubmit = expandDateRangeToShifts(
                            timeOffDateRange.start,
                            timeOffDateRange.end,
                            avail
                          ).filter(s => !isShiftInPast(s.dateKey, s.shift))
                        }
                        
                        if (shiftsToSubmit.length === 0) {
                          setTimeOffError('No valid future shifts selected.')
                          setTimeOffSaving(false)
                          return
                        }
                        
                        if (timeOffEditingId) {
                          // Update existing request
                          await updateTimeOffRequest(timeOffEditingId, {
                            reason: timeOffReason,
                            requestedShifts: shiftsToSubmit,
                            requestKind: timeOffRequestKind,
                            dateRange: timeOffRequestKind === 'date_range' 
                              ? { startDateKey: timeOffDateRange.start, endDateKey: timeOffDateRange.end } 
                              : undefined,
                          })
                        } else {
                          // Create new request
                          await createTimeOffRequest({
                            employee: timeOffSelectedEmployee,
                            reason: timeOffReason,
                            requestedShifts: shiftsToSubmit,
                            requestKind: timeOffRequestKind,
                            dateRange: timeOffRequestKind === 'date_range' ? { startDateKey: timeOffDateRange.start, endDateKey: timeOffDateRange.end } : undefined,
                          })
                          
                          // Send email notification to manager (fire-and-forget)
                          const uniqueDates = Array.from(new Set(shiftsToSubmit.map(s => s.dateKey))).sort()
                          const daysStr = uniqueDates.length > 0 
                            ? `${uniqueDates.join(', ')} (${uniqueDates.length} day${uniqueDates.length === 1 ? '' : 's'})`
                            : '(none)'
                          sendTimeOffEmailNotification({
                            employee: timeOffSelectedEmployee,
                            days: daysStr,
                          })
                        }
                        
                        // Reset and go back to list
                        setTimeOffWizardStep(null)
                        setTimeOffEditingId(null)
                        setTimeOffSelectedShifts([])
                        setTimeOffDateRange({ start: '', end: '' })
                        setTimeOffReason('')
                      } catch (err) {
                        setTimeOffError('Failed to save request. Please try again.')
                        console.error('Time off save error:', err)
                      } finally {
                        setTimeOffSaving(false)
                      }
                    }}
                  >
                    {timeOffSaving ? 'Saving...' : (timeOffEditingId ? 'Update Request' : 'Submit Request')}
                  </button>

                  {/* Delete button - only shows when editing a pending request */}
                  {timeOffEditingId && (
                    <button
                      className="timeoff-delete-btn"
                      type="button"
                      disabled={timeOffSaving}
                      onClick={async () => {
                        if (!window.confirm('Are you sure you want to delete this time off request?')) {
                          return
                        }
                        
                        setTimeOffSaving(true)
                        setTimeOffError(null)
                        
                        try {
                          await deleteTimeOffRequest(timeOffEditingId)
                          
                          // Reset and go back to list
                          setTimeOffWizardStep(null)
                          setTimeOffEditingId(null)
                          setTimeOffSelectedShifts([])
                          setTimeOffDateRange({ start: '', end: '' })
                          setTimeOffReason('')
                        } catch (err) {
                          setTimeOffError('Failed to delete request. Please try again.')
                          console.error('Time off delete error:', err)
                        } finally {
                          setTimeOffSaving(false)
                        }
                      }}
                    >
                      {timeOffSaving ? 'Deleting...' : 'Delete Request'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTask && !isOrderReportTaskId && (
        <div
          className={`modal-backdrop${modalSuccessDismiss ? ' modal-backdrop--success-dismiss' : ''}`}
          onTouchStart={handleModalBackdropTouchStart}
          onClick={() => {
            if (!shouldIgnoreClick()) closeActiveTask()
          }}
        >
          <div
            className={`modal-sheet${isV31 ? ' modal-sheet--v31-task' : ''}`}
            ref={modalSheetRef}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                {(() => {
                  const isWeighted = (activeTask.weight ?? 1) > 1
                  return (
                    <>
                      <h2>
                        {activeTask.name}
                        {isWeighted ? (
                          <span className="weighted-badge" title="Counts for more points">
                            Bonus
                          </span>
                        ) : null}
                        {activeTaskId === 'stock-check' && stockReportsOutPendingCount > 0 ? (
                          <span className="stock-out-badge" title="Out of stock items">
                            {stockReportsOutPendingCount} Out of Stock
                          </span>
                        ) : null}
                      </h2>
                    </>
                  )
                })()}
              </div>
              <button
                className="close-button"
                onTouchStart={(e) => {
                  recordTouch()
                  closeActiveTask()
                  e.preventDefault()
                }}
                onClick={() => {
                  if (!shouldIgnoreClick()) closeActiveTask()
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div
              className={
                activeTaskId === 'stock-check' ? 'modal-body modal-body--stock-check' : 'modal-body'
              }
            >
              {isV3Ui && activeCompletion?.didNotNeedToComplete && (
                <div className="v3-modal-no-work-banner">
                  <p>
                    Marked as didn&apos;t need to complete — no one was assigned. Tap Undo to clear this, then you can
                    record who completed it.
                  </p>
                  <button
                    type="button"
                    className="v3-modal-no-work-undo"
                    disabled={
                      isSaving || (!(isTodaySelected || isDemoDaySelected || isAdmin)) || !activeTaskId
                    }
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(() => {
                        if (activeTaskId) void undoV3DidNotNeedToComplete(activeTaskId)
                      }, e)
                    }
                    onClick={() => {
                      if (shouldIgnoreClick()) return
                      if (activeTaskId) void undoV3DidNotNeedToComplete(activeTaskId)
                    }}
                  >
                    Undo
                  </button>
                </div>
              )}
              {activeTaskId === 'stock-check' ? (
                <StockCheckModal
                  stockReports={stockReports}
                  beginTap={beginTap}
                  moveTap={moveTap}
                  endTap={endTap}
                  shouldIgnoreClick={shouldIgnoreClick}
                  isBusy={isInitialSyncing || isSaving}
                  error={saveError}
                  assignees={assignees}
                  splitMode={splitMode}
                  hasCompletion={!!activeCompletion}
                  onTapComplete={() => {
                    setSaveError(null)
                    setSplitMode(false)
                    setShowEmployeeSelector(true)
                  }}
                  onEnableSplitAndSelect={() => {
                    setSaveError(null)
                    setSplitMode(true)
                    setShowEmployeeSelector(true)
                  }}
                  onCreateItem={stockCheckCreateItem}
                  onDeleteItem={stockCheckDeleteItem}
                />
              ) : activeTaskId === 'break-selection' ? (
                <div className="modal-requirements-scroll" aria-label="Break selection">
                  <div className="break-selection">
                    <div className="solo-mode-panel">
                      <button
                        type="button"
                        className={`solo-mode-btn ${soloMode?.active ? 'active' : ''}`}
                        disabled={isInitialSyncing || isSaving || !canEditTaskAssignmentsOnSelectedDate}
                        onTouchStart={beginTap}
                        onTouchMove={moveTap}
                        onTouchEnd={(e) =>
                          endTap(() => {
                            void setSoloModeActive(!soloMode?.active)
                          }, e)
                        }
                        onClick={() => {
                          if (shouldIgnoreClick()) return
                          void setSoloModeActive(!soloMode?.active)
                        }}
                      >
                        {soloMode?.active ? 'Solo Mode Active' : 'Activate Solo Mode'}
                      </button>
                      <div className="solo-mode-note">
                        {soloMode?.active
                          ? 'Solo mode is on. 11AM and 5PM tasks will not be marked late today, day-shift score is capped at 70, and both Order Reports are waived if not already filled in.'
                          : 'Solo mode is off.'}
                      </div>
                    </div>
                    <div className="break-help">
                      Pick two employees, choose lunch vs double shift, then pick a break start time. Breaks must fit within{' '}
                      <strong>1:00 PM–4:00 PM</strong>.
                    </div>

                    {!canEditTaskAssignmentsOnSelectedDate && (
                      <div className="note">
                        Viewing {displayDate(selectedDate)}. Editing locked.
                      </div>
                    )}

                    <div className="break-slot-grid" aria-label="Break selection slots">
                      {([0, 1] as const).map((idx) => {
                        const locked = !canEditTaskAssignmentsOnSelectedDate || isInitialSyncing || isSaving
                        const slot = breakDraftSlots[idx]

                        const employee = slot?.employee || ''
                        const shiftType =
                          slot?.shiftType === 'lunch' || slot?.shiftType === 'double' ? (slot.shiftType as BreakShiftType) : null
                        const start = slot?.start || ''
                        const durationMin = shiftType ? breakDurationForShift(shiftType) : null
                        const startMin = start ? timeToMinutes(start) : null
                        const endLabel = durationMin && startMin !== null ? formatTimeLabel(minutesToTime(startMin + durationMin)) : ''
                        const complete = !!employee && !!shiftType && !!start

                        const title = employee ? employee : 'Pick employee'
                        const sub = complete
                          ? `${formatTimeLabel(start)}–${endLabel} • ${shiftType === 'double' ? 'Double (60)' : 'Lunch (30)'}`
                          : employee && shiftType && !start
                            ? `Pick a time • ${shiftType === 'double' ? 'Double (60)' : 'Lunch (30)'}`
                            : employee && !shiftType
                              ? 'Pick lunch vs double shift'
                              : 'Tap to configure'

                        return (
                          <button
                            key={idx}
                            type="button"
                            className={`break-slot-btn ${complete ? 'complete' : ''}`}
                            disabled={locked}
                            onTouchStart={beginTap}
                            onTouchMove={moveTap}
                            onTouchEnd={(e) => endTap(() => openBreakWizard(idx), e)}
                            onClick={() => {
                              if (shouldIgnoreClick()) return
                              openBreakWizard(idx)
                            }}
                          >
                            <div className="break-slot-title">{title}</div>
                            <div className="break-slot-sub">{sub}</div>
                          </button>
                        )
                      })}
                    </div>

                    {breakSelection?.slots?.length ? (
                      <div className="break-current">
                        <div className="break-current-title">Saved plan</div>
                        {breakSelection.slots.map((s, i) => (
                          <div key={i} className="break-current-row">
                            <span className="break-current-emp">{s.employee}</span>
                            <span className="break-current-time">
                              {formatTimeLabel(s.start)} → {formatTimeLabel(breakEndTimeForSlot(s))}
                            </span>
                            <span className="break-current-meta">
                              {s.shiftType === 'double' ? 'Double (60)' : 'Lunch (30)'}
                            </span>
                          </div>
                        ))}
                        {breakSelection.slots.every(s => s.shiftType === 'double') && (
                          <div className="break-deferred-notice">
                            💰 Drawer, Blue Bag & Tips will be counted at {selectedDate.getDay() === 5 || selectedDate.getDay() === 6 ? '10' : '9'}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : activeTaskId === 'night-shift-solo-check' ? (
                <div className="modal-requirements-scroll" aria-label="Night shift solo check">
                  <div className="night-shift-solo-task-panel">
                    <div className="night-shift-solo-task-intro">
                      <h4 className="night-shift-solo-task-title">Check with your manager</h4>
                      <p className="night-shift-solo-task-copy">
                        Day shift is in solo mode. Will <strong>night shift</strong> also run solo (one person)?
                      </p>
                      <ul className="night-shift-solo-task-bullets">
                        {NIGHT_SHIFT_SOLO_CHECK_TASK.requirements.map((item, idx) => (
                          <li key={`${idx}-${item}`}>{renderRequirementText(item)}</li>
                        ))}
                      </ul>
                    </div>
                    {activeCompletion ? (
                      <p className="night-shift-solo-task-done">Recorded. You can close this task.</p>
                    ) : !canEditTaskAssignmentsOnSelectedDate ? (
                      <div className="note">Viewing {displayDate(selectedDate)}. Editing locked.</div>
                    ) : (
                      <div className="night-shift-buttons" role="group" aria-label="Night shift solo answer">
                        <button
                          type="button"
                          className="night-shift-btn night-shift-btn--yes"
                          disabled={isInitialSyncing || isSaving}
                          onTouchStart={beginTap}
                          onTouchMove={moveTap}
                          onTouchEnd={(e) => endTap(() => void completeNightShiftSoloCheck('yes'), e)}
                          onClick={() => {
                            if (shouldIgnoreClick()) return
                            void completeNightShiftSoloCheck('yes')
                          }}
                        >
                          Yes — night is solo
                        </button>
                        <button
                          type="button"
                          className="night-shift-btn night-shift-btn--no"
                          disabled={isInitialSyncing || isSaving}
                          onTouchStart={beginTap}
                          onTouchMove={moveTap}
                          onTouchEnd={(e) => endTap(() => void completeNightShiftSoloCheck('no'), e)}
                          onClick={() => {
                            if (shouldIgnoreClick()) return
                            void completeNightShiftSoloCheck('no')
                          }}
                        >
                          No — night has a team
                        </button>
                      </div>
                    )}
                    {saveError ? <div className="error">{saveError}</div> : null}
                  </div>
                </div>
              ) : (activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') ? (
                <div ref={requirementsScrollRef} className="modal-requirements-scroll" aria-label="Ice selection">
                  {(() => {
                    const locked =
                      isInitialSyncing ||
                      (!(isTodaySelected || isDemoDaySelected) && !isAdmin) ||
                      isWindowTaskLocked(activeTaskId) ||
                      (!!activeCompletion?.assignedByAdmin && !isAdmin)
                    const tilesLocked = locked || showCompletedResetUx
                    return (
                      <div className="ice-combined">
                        <div className="ice-combined-title">Tap to select who filled each machine</div>
                        <div className="ice-sides-grid">
                          <button
                            type="button"
                            className={`ice-side-tile ${iceSidesDraft.left ? 'filled' : ''} ${tilesLocked ? 'locked' : ''}`}
                            disabled={tilesLocked}
                            ref={iceLeftTileRef}
                            onTouchStart={beginTap}
                            onTouchMove={moveTap}
                            onTouchEnd={(e) =>
                              endTap(() => {
                                if (locked) return
                                setPendingIceSide('left')
                                setShowEmployeeSelector(true)
                              }, e)
                            }
                            onClick={() => {
                              if (shouldIgnoreClick()) return
                              if (locked) return
                              setPendingIceSide('left')
                              setShowEmployeeSelector(true)
                            }}
                          >
                            <div className="ice-side-label">Left Ice</div>
                            <div className="ice-side-value">{iceSidesDraft.left || 'Tap to select'}</div>
                          </button>

                          <button
                            type="button"
                            className={`ice-side-tile ${iceSidesDraft.right ? 'filled' : ''} ${tilesLocked ? 'locked' : ''}`}
                            disabled={tilesLocked}
                            ref={iceRightTileRef}
                            onTouchStart={beginTap}
                            onTouchMove={moveTap}
                            onTouchEnd={(e) =>
                              endTap(() => {
                                if (locked) return
                                setPendingIceSide('right')
                                setShowEmployeeSelector(true)
                              }, e)
                            }
                            onClick={() => {
                              if (shouldIgnoreClick()) return
                              if (locked) return
                              setPendingIceSide('right')
                              setShowEmployeeSelector(true)
                            }}
                          >
                            <div className="ice-side-label">Right Ice</div>
                            <div className="ice-side-value">{iceSidesDraft.right || 'Tap to select'}</div>
                          </button>
                        </div>

                        {showCompletedResetUx ? (
                          <div className="ice-actions">
                            <button
                              className="task-reset-btn task-reset-btn--full"
                              type="button"
                              disabled={locked || isSaving}
                              onTouchStart={beginTap}
                              onTouchMove={moveTap}
                              onTouchEnd={(e) => endTap(() => void clearCombinedIceTask({ closeModal: true }), e)}
                              onClick={() => {
                                if (shouldIgnoreClick()) return
                                void clearCombinedIceTask({ closeModal: true })
                              }}
                            >
                              Reset Task
                            </button>
                          </div>
                        ) : (activeCompletion || iceSidesDraft.left || iceSidesDraft.right) ? (
                          <div className="ice-actions">
                            <div className="break-action-buttons">
                              <button
                                className="break-clear-btn"
                                type="button"
                                disabled={locked}
                                onTouchStart={beginTap}
                                onTouchMove={moveTap}
                                onTouchEnd={(e) => endTap(() => void clearCombinedIceTask(), e)}
                                onClick={() => {
                                  if (shouldIgnoreClick()) return
                                  void clearCombinedIceTask()
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {/* v3: optional ice — no past-user credits; v2: auto-assign credits last Left/Right */}
                        {(isTodaySelected || isDemoDaySelected || isAdmin) && !activeCompletion && (() => {
                          if (isV3Ui) {
                            return (
                              <button
                                className="auto-assign-btn"
                                disabled={locked || isSaving}
                                onTouchStart={beginTap}
                                onTouchMove={moveTap}
                                onTouchEnd={(e) => endTap(() => void handleV3OptionalDidNotNeedToComplete(), e)}
                                onClick={() => {
                                  if (shouldIgnoreClick()) return
                                  void handleV3OptionalDidNotNeedToComplete()
                                }}
                              >
                                Didn&apos;t need to complete
                              </button>
                            )
                          }
                          const lastCompletion = findLastTaskCompletion(taskState, activeTaskId, selectedDateKey, selectedWindow)
                          const left = String(lastCompletion?.iceSides?.left || '').trim()
                          const right = String(lastCompletion?.iceSides?.right || '').trim()
                          if (!left || !right) return null
                          return (
                            <button
                              className="auto-assign-btn"
                              disabled={locked || isSaving}
                              onTouchStart={beginTap}
                              onTouchMove={moveTap}
                              onTouchEnd={(e) => endTap(() => handleAutoAssignIce(), e)}
                              onClick={() => {
                                if (shouldIgnoreClick()) return
                                handleAutoAssignIce()
                              }}
                            >
                              I didn't need to fill ice
                              <span className="auto-assign-credit">→ Credits: {left} &amp; {right}</span>
                            </button>
                          )
                        })()}

                        {!(isTodaySelected || isDemoDaySelected) && !isAdmin ? (
                          <div className="note">Viewing {displayDate(selectedDate)}. Assignment locked.</div>
                        ) : locked ? (
                          <div className="note">🔒 Locked</div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
              ) : (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow) ? (
                <div ref={requirementsScrollRef} className="modal-requirements-scroll" aria-label="Towel selection">
                  {(() => {
                    const locked =
                      isInitialSyncing ||
                      (!(isTodaySelected || isDemoDaySelected) && !isAdmin) ||
                      isWindowTaskLocked(activeTaskId) ||
                      (!!activeCompletion?.assignedByAdmin && !isAdmin)
                    const tilesLocked = locked || showCompletedResetUx
                    const towelRequirements = (
                      <div className="requirements-bubbles">
                        {activeTask.requirements.map((item, idx) => (
                          <div key={`${idx}-${item}`} className="requirement-bubble">
                            {renderRequirementText(item)}
                          </div>
                        ))}
                      </div>
                    )
                    return (
                      <div className={`ice-combined towel-combined${isV31 ? ' towel-combined--v31' : ''}`}>
                        <div
                          className={`task-modal-requirements-panel task-modal-requirements-panel--towel${
                            isV31 ? ' task-modal-requirements-panel--v31' : ''
                          }`}
                        >
                          {towelRequirements}
                        </div>
                        <div className="ice-combined-title">Tap to select who did each area</div>
                        <div className="ice-sides-grid towel-sides-grid">
                          <button
                            type="button"
                            className={`towel-side-tile towel-dining-bar ${towelSidesDraft.diningBar ? 'filled' : ''} ${tilesLocked ? 'locked' : ''}`}
                            disabled={tilesLocked}
                            ref={towelDiningTileRef}
                            onTouchStart={beginTap}
                            onTouchMove={moveTap}
                            onTouchEnd={(e) =>
                              endTap(() => {
                                if (locked) return
                                setPendingTowelSide('diningBar')
                                setShowEmployeeSelector(true)
                              }, e)
                            }
                            onClick={() => {
                              if (shouldIgnoreClick()) return
                              if (locked) return
                              setPendingTowelSide('diningBar')
                              setShowEmployeeSelector(true)
                            }}
                          >
                            <div className="towel-side-label">Dining/Bar Towel</div>
                            <div className="towel-side-value">{towelSidesDraft.diningBar || 'Tap to select'}</div>
                          </button>

                          <button
                            type="button"
                            className={`towel-side-tile towel-bowl-station ${towelSidesDraft.bowlStation ? 'filled' : ''} ${tilesLocked ? 'locked' : ''}`}
                            disabled={tilesLocked}
                            ref={towelBowlTileRef}
                            onTouchStart={beginTap}
                            onTouchMove={moveTap}
                            onTouchEnd={(e) =>
                              endTap(() => {
                                if (locked) return
                                setPendingTowelSide('bowlStation')
                                setShowEmployeeSelector(true)
                              }, e)
                            }
                            onClick={() => {
                              if (shouldIgnoreClick()) return
                              if (locked) return
                              setPendingTowelSide('bowlStation')
                              setShowEmployeeSelector(true)
                            }}
                          >
                            <div className="towel-side-label">Bowl Station Towel</div>
                            <div className="towel-side-value">{towelSidesDraft.bowlStation || 'Tap to select'}</div>
                          </button>
                        </div>

                        {showCompletedResetUx ? (
                          <div className="ice-actions">
                            <button
                              className="task-reset-btn task-reset-btn--full"
                              type="button"
                              disabled={locked || isSaving}
                              onTouchStart={beginTap}
                              onTouchMove={moveTap}
                              onTouchEnd={(e) => endTap(() => void clearCombinedTowelTask({ closeModal: true }), e)}
                              onClick={() => {
                                if (shouldIgnoreClick()) return
                                void clearCombinedTowelTask({ closeModal: true })
                              }}
                            >
                              Reset Task
                            </button>
                          </div>
                        ) : (activeCompletion || towelSidesDraft.diningBar || towelSidesDraft.bowlStation) ? (
                          <div className="ice-actions">
                            <div className="break-action-buttons">
                              <button
                                className="break-clear-btn"
                                type="button"
                                disabled={locked}
                                onTouchStart={beginTap}
                                onTouchMove={moveTap}
                                onTouchEnd={(e) => endTap(() => void clearCombinedTowelTask(), e)}
                                onClick={() => {
                                  if (shouldIgnoreClick()) return
                                  void clearCombinedTowelTask()
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {!(isTodaySelected || isDemoDaySelected) && !isAdmin ? (
                          <div className="note">Viewing {displayDate(selectedDate)}. Assignment locked.</div>
                        ) : locked ? (
                          <div className="note">🔒 Locked</div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div ref={requirementsScrollRef} className="modal-requirements-scroll" aria-label="Task requirements">
                  {activeTask.imagePath ? (
                    <div className="daily-task-image-shell">
                      {taskImageUrlByPath[activeTask.imagePath] ? (
                        <img
                          className="daily-task-image"
                          src={taskImageUrlByPath[activeTask.imagePath]}
                          alt="Task reference"
                        />
                      ) : (
                        <div className="daily-task-image-placeholder">Loading image…</div>
                      )}
                    </div>
                  ) : null}
                  <div className="requirements-bubbles">
                    {isTodaySelected &&
                    !activeCompletion &&
                    activeTaskId === 'yum-yum-close' &&
                    (selectedWindow === '17' || selectedWindow === '21') ? (
                      <div className="early-complete-note">This task can be completed early.</div>
                    ) : null}
                    {activeTask.requirements.map((item, idx) => (
                      <div key={`${idx}-${item}`} className="requirement-bubble">
                        {renderRequirementText(item)}
                      </div>
                    ))}
                    {activeCompletion?.deferredToClose && (
                      <div className="deferred-notice">
                        💰 Auto-completed — will be counted at {activeCompletion.deferredToClose}PM
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="modal-actions" aria-label="Task actions">
                {activeTaskId === 'stock-check' || activeTaskId === 'night-shift-solo-check' ? null : activeTaskId === 'break-selection' ? (
                  <>
                    {breakDraftError ? <div className="error">{breakDraftError}</div> : null}
                    {saveError ? <div className="error">{saveError}</div> : null}
                    <div className="break-action-buttons">
                      <button
                        className="break-save-btn"
                        type="button"
                        disabled={isInitialSyncing || isSaving || !canEditTaskAssignmentsOnSelectedDate}
                        onTouchStart={beginTap}
                        onTouchMove={moveTap}
                        onTouchEnd={(e) => endTap(() => saveBreakPlan(), e)}
                        onClick={() => {
                          if (shouldIgnoreClick()) return
                          saveBreakPlan()
                        }}
                      >
                        {activeCompletion ? 'Update break plan' : 'Save break plan'}
                      </button>
                      {breakSelection?.slots?.length ? (
                        <button
                          className="break-clear-btn"
                          type="button"
                          disabled={isInitialSyncing || isSaving || !canEditTaskAssignmentsOnSelectedDate}
                          onTouchStart={beginTap}
                          onTouchMove={moveTap}
                          onTouchEnd={(e) => endTap(() => clearBreakPlan(), e)}
                          onClick={() => {
                            if (shouldIgnoreClick()) return
                            clearBreakPlan()
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    {isAdmin && activeCompletion?.completedLate && (
                      <div className="admin-actions">
                        <button
                          className={`admin-action-btn ${activeCompletion?.lateForgiven ? 'active' : ''}`}
                          disabled={isInitialSyncing || isSaving}
                          onTouchStart={beginTap}
                          onTouchMove={moveTap}
                          onTouchEnd={(e) => endTap(() => toggleLateForgiven(), e)}
                          onClick={() => {
                            if (shouldIgnoreClick()) return
                            toggleLateForgiven()
                          }}
                        >
                          {activeCompletion?.lateForgiven
                            ? 'Late forgiven (counts for points)'
                            : 'Forgive late (allow points)'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!canEditTaskAssignmentsOnSelectedDate && (
                      <div className="note">
                        Viewing {displayDate(selectedDate)}. Assignment locked.
                      </div>
                    )}

                    {canEditTaskAssignmentsOnSelectedDate && (
                      <>
                        {showCompletedResetUx &&
                        !(
                          (activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') ||
                          ((activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                            isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow))
                        ) && (
                          <div className="completed-by-label">Completed by:</div>
                        )}

                        {!showCompletedResetUx && lastTogetherStreak && (
                          <div className="last-completer-streak" aria-label="Last completer">
                            <span className="last-completer-streak__icon" aria-hidden="true">🔁</span>
                            <span className="last-completer-streak__label">Last time:</span>
                            {lastTogetherStreak.names.map((name, idx) => (
                              <span className="last-completer-streak__entry" key={name}>
                                {idx > 0 ? <span className="last-completer-streak__sep">·</span> : null}
                                <span className="last-completer-streak__name">{name}</span>
                              </span>
                            ))}
                            <span className="last-completer-streak__count">×{lastTogetherStreak.count}</span>
                          </div>
                        )}

                        {(() => {
                          const isCombinedIce = activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close'
                          const isCombinedTowelModal =
                            (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                            isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow)
                          const musicSelectionLocked = activeTaskId === 'turn-on-music' && !musicIsActuallyPlaying
                          const selectionLocked = isWindowTaskLocked(activeTaskId) || musicSelectionLocked
                          if (isCombinedIce || isCombinedTowelModal) {
                            return null
                          }
                          const splitRequired =
                            !!activeTask?.requiresSplit && !isSoloModeActiveForWindow(selectedDateKey, selectedWindow)
                          const showNightSoloPromptInModal =
                            splitRequired &&
                            needsNightSoloDecision &&
                            !activeCompletion &&
                            !nightSplitChoseTeamSplit &&
                            canEditTaskAssignmentsOnSelectedDate
                          if (showCompletedResetUx) {
                            return (
                              <div className="selection-buttons">
                                <div className="completed-assignee-display" aria-label="Completed by">
                                  {activeCompletion?.assignedByAdmin && !isAdmin ? (
                                    <>⭐ {assignees.join(' · ')}</>
                                  ) : (
                                    assignees.join(' · ')
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className="task-reset-btn"
                                  disabled={
                                    isInitialSyncing ||
                                    isSaving ||
                                    selectionLocked ||
                                    (activeCompletion?.assignedByAdmin && !isAdmin)
                                  }
                                  onTouchStart={beginTap}
                                  onTouchMove={moveTap}
                                  onTouchEnd={(e) => endTap(() => void resetCompletedTask(), e)}
                                  onClick={() => {
                                    if (shouldIgnoreClick()) return
                                    void resetCompletedTask()
                                  }}
                                >
                                  Reset
                                </button>
                              </div>
                            )
                          }
                          return (
                            <>
                              {splitRequired ? (
                                showNightSoloPromptInModal ? (
                                  <div className="night-solo-prompt-card night-solo-prompt-card--modal">
                                    <h4 className="night-solo-prompt-card__title">Just you tonight?</h4>
                                    <p className="night-solo-prompt-card__copy">
                                      Working alone on close? Activate solo mode to complete this task alone. Close score is capped at 70.
                                    </p>
                                    <div className="night-solo-prompt-card__actions">
                                      <button
                                        type="button"
                                        className="night-solo-prompt-card__btn night-solo-prompt-card__btn--primary"
                                        disabled={isInitialSyncing || isSaving}
                                        onTouchStart={beginTap}
                                        onTouchMove={moveTap}
                                        onTouchEnd={(e) => endTap(() => void setNightSoloModeActive(true), e)}
                                        onClick={() => {
                                          if (shouldIgnoreClick()) return
                                          void setNightSoloModeActive(true)
                                        }}
                                      >
                                        Activate solo mode
                                      </button>
                                      <button
                                        type="button"
                                        className="night-solo-prompt-card__btn night-solo-prompt-card__btn--secondary"
                                        disabled={isInitialSyncing || isSaving}
                                        onTouchStart={beginTap}
                                        onTouchMove={moveTap}
                                        onTouchEnd={(e) => endTap(() => handleNightSplitTeamChoice(), e)}
                                        onClick={() => {
                                          if (shouldIgnoreClick()) return
                                          handleNightSplitTeamChoice()
                                        }}
                                      >
                                        Tap to split
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                <div className="selection-buttons">
                                  <button
                                    className={`select-employee-btn ${selectionLocked ? 'locked' : ''} ${activeCompletion?.assignedByAdmin && !isAdmin ? 'locked' : ''}`}
                                    disabled={isInitialSyncing || selectionLocked || (activeCompletion?.assignedByAdmin && !isAdmin)}
                                    onTouchStart={beginTap}
                                    onTouchMove={moveTap}
                                    onTouchEnd={(e) =>
                                      endTap(() => {
                                        if (musicSelectionLocked || selectionLocked) return
                                        setSplitMode(true)
                                        setShowUnsplitOptions(false)
                                        if (activeTask?.requiresChecklist && !activeCompletion) {
                                          setShowChecklistModal(true)
                                        } else {
                                          setShowEmployeeSelector(true)
                                        }
                                      }, e)
                                    }
                                    onClick={() => {
                                      if (shouldIgnoreClick()) return
                                      if (musicSelectionLocked || selectionLocked) return
                                      setSplitMode(true)
                                      setShowUnsplitOptions(false)
                                      if (activeTask?.requiresChecklist && !activeCompletion) {
                                        setShowChecklistModal(true)
                                      } else {
                                        setShowEmployeeSelector(true)
                                      }
                                    }}
                                  >
                                    {activeCompletion?.assignedByAdmin && !isAdmin ? (
                                      <>⭐ {assignees.join(' · ')}</>
                                    ) : musicSelectionLocked ? (
                                      <>▶ Start music first</>
                                    ) : selectionLocked ? (
                                      <>🔒 Locked</>
                                    ) : assignees.length >= 2 ? (
                                      <>{assignees.join(' · ')} {activeCompletion && <span className="edit-hint">✏️</span>}</>
                                    ) : (
                                      'Tap to select split'
                                    )}
                                  </button>
                                </div>
                                )
                              ) : (
                              <div className="selection-buttons">
                                <button
                                  className={`select-employee-btn ${selectionLocked ? 'locked' : ''} ${activeCompletion?.assignedByAdmin && !isAdmin ? 'locked' : ''}`}
                                  disabled={isInitialSyncing || selectionLocked || (activeCompletion?.assignedByAdmin && !isAdmin)}
                                  onTouchStart={beginTap}
                                  onTouchMove={moveTap}
                                  onTouchEnd={(e) =>
                                    endTap(() => {
                                      if (musicSelectionLocked || selectionLocked) return
                                      if (activeTask?.requiresChecklist && !activeCompletion) {
                                        setShowChecklistModal(true)
                                      } else {
                                        setShowEmployeeSelector(true)
                                      }
                                    }, e)
                                  }
                                  onClick={() => {
                                    if (shouldIgnoreClick()) return
                                    if (musicSelectionLocked || selectionLocked) return
                                    if (activeTask?.requiresChecklist && !activeCompletion) {
                                      setShowChecklistModal(true)
                                    } else {
                                      setShowEmployeeSelector(true)
                                    }
                                  }}
                                >
                                  {activeCompletion?.assignedByAdmin && !isAdmin ? (
                                    <>⭐ {assignees.join(' · ')}</>
                                  ) : musicSelectionLocked ? (
                                    <>▶ Start music first</>
                                  ) : selectionLocked ? (
                                    <>🔒 Locked</>
                                  ) : assignees.length > 0 ? (
                                    <>{assignees.join(' · ')} {activeCompletion && <span className="edit-hint">✏️</span>}</>
                                  ) : (
                                    'Tap to select employee'
                                  )}
                                </button>
                                <button
                                  className={`split-button ${splitMode ? 'active' : ''} ${selectionLocked ? 'locked' : ''} ${activeCompletion?.assignedByAdmin && !isAdmin ? 'locked' : ''}`}
                                  disabled={isInitialSyncing || selectionLocked || (activeCompletion?.assignedByAdmin && !isAdmin)}
                                  onTouchStart={beginTap}
                                  onTouchMove={moveTap}
                                  onTouchEnd={(e) =>
                                    endTap(() => {
                                      if (musicSelectionLocked || selectionLocked) return
                                      setSplitMode(true)
                                      setShowUnsplitOptions(false)
                                      if (activeTask?.requiresChecklist && !activeCompletion) {
                                        setShowChecklistModal(true)
                                      } else {
                                        setShowEmployeeSelector(true)
                                      }
                                    }, e)
                                  }
                                  onClick={() => {
                                    if (shouldIgnoreClick()) return
                                    if (musicSelectionLocked || selectionLocked) return
                                    setSplitMode(true)
                                    setShowUnsplitOptions(false)
                                    if (activeTask?.requiresChecklist && !activeCompletion) {
                                      setShowChecklistModal(true)
                                    } else {
                                      setShowEmployeeSelector(true)
                                    }
                                  }}
                                >
                                  {selectionLocked ? '🔒' : 'Split'}
                                </button>

                                {activeCompletion?.assignees?.length && activeCompletion.assignees.length > 1 ? (
                                  <button
                                    className={`unsplit-button ${showUnsplitOptions ? 'active' : ''} ${selectionLocked ? 'locked' : ''} ${activeCompletion?.assignedByAdmin && !isAdmin ? 'locked' : ''}`}
                                    disabled={isInitialSyncing || selectionLocked || (activeCompletion?.assignedByAdmin && !isAdmin)}
                                    onTouchStart={beginTap}
                                    onTouchMove={moveTap}
                                    onTouchEnd={(e) =>
                                      endTap(() => {
                                        if (musicSelectionLocked || selectionLocked) return
                                        setSplitMode(false)
                                        setShowUnsplitOptions((prev) => !prev)
                                      }, e)
                                    }
                                    onClick={() => {
                                      if (shouldIgnoreClick()) return
                                      if (musicSelectionLocked || selectionLocked) return
                                      setSplitMode(false)
                                      setShowUnsplitOptions((prev) => !prev)
                                    }}
                                  >
                                    {selectionLocked ? '🔒' : 'Unsplit'}
                                  </button>
                                ) : null}
                              </div>
                              )}

                              {!splitRequired && showUnsplitOptions && activeCompletion?.assignees?.length && activeCompletion.assignees.length > 1 ? (
                                <div className="unsplit-options" aria-label="Unsplit options">
                                  <div className="unsplit-label">Keep credit for:</div>
                                  <div className="unsplit-choice-row">
                                    {activeCompletion.assignees.slice(0, 2).map((emp) => (
                                      <button
                                        key={`unsplit-${emp}`}
                                        type="button"
                                        className="unsplit-choice"
                                        disabled={isInitialSyncing || isSaving || selectionLocked || (activeCompletion?.assignedByAdmin && !isAdmin)}
                                        onTouchStart={beginTap}
                                        onTouchMove={moveTap}
                                        onTouchEnd={(e) =>
                                          endTap(() => {
                                            setSaveError(null)
                                            setSplitMode(false)
                                            setShowUnsplitOptions(false)
                                            void toggleAssignee(emp, { baseAssignees: [], baseSplitMode: false })
                                          }, e)
                                        }
                                        onClick={() => {
                                          if (shouldIgnoreClick()) return
                                          setSaveError(null)
                                          setSplitMode(false)
                                          setShowUnsplitOptions(false)
                                          void toggleAssignee(emp, { baseAssignees: [], baseSplitMode: false })
                                        }}
                                      >
                                        {emp}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      className="unsplit-other"
                                      disabled={isInitialSyncing || isSaving || selectionLocked || (activeCompletion?.assignedByAdmin && !isAdmin)}
                                      onTouchStart={beginTap}
                                      onTouchMove={moveTap}
                                      onTouchEnd={(e) =>
                                        endTap(() => {
                                          setSaveError(null)
                                          setSplitMode(false)
                                          setAssignees([])
                                          setShowUnsplitOptions(false)
                                          setShowEmployeeSelector(true)
                                        }, e)
                                      }
                                      onClick={() => {
                                        if (shouldIgnoreClick()) return
                                        setSaveError(null)
                                        setSplitMode(false)
                                        setAssignees([])
                                        setShowUnsplitOptions(false)
                                        setShowEmployeeSelector(true)
                                      }}
                                    >
                                      Other…
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {/* Auto-assign button for Yum Yum Sauce */}
                              {activeTaskId === 'yum-yum-close' && !activeCompletion && (() => {
                                if (isV3Ui) {
                                  return (
                                    <button
                                      className="auto-assign-btn"
                                      disabled={isInitialSyncing || isSaving}
                                      onTouchStart={beginTap}
                                      onTouchMove={moveTap}
                                      onTouchEnd={(e) => endTap(() => void handleV3OptionalDidNotNeedToComplete(), e)}
                                      onClick={() => {
                                        if (shouldIgnoreClick()) return
                                        void handleV3OptionalDidNotNeedToComplete()
                                      }}
                                    >
                                      Didn&apos;t need to complete
                                    </button>
                                  )
                                }
                                const lastCompleter = findLastTaskCompleter(taskState, 'yum-yum-close', selectedDateKey, selectedWindow)
                                if (!lastCompleter) return null
                                return (
                                  <button
                                    className="auto-assign-btn"
                                    disabled={isInitialSyncing || isSaving}
                                    onTouchStart={beginTap}
                                    onTouchMove={moveTap}
                                    onTouchEnd={(e) => endTap(() => handleAutoAssignYumYum(), e)}
                                    onClick={() => {
                                      if (shouldIgnoreClick()) return
                                      handleAutoAssignYumYum()
                                    }}
                                  >
                                    I didn't need to fill yum yum sauce
                                    <span className="auto-assign-credit">→ Credits: {lastCompleter.assignees.join(' & ')}</span>
                                  </button>
                                )
                              })()}

                              {/* Auto-assign button for Peanuts Crispy Noodles */}
                              {activeTaskId === 'peanuts-noodles-close' && !activeCompletion && (() => {
                                if (isV3Ui) {
                                  return (
                                    <button
                                      className="auto-assign-btn"
                                      disabled={isInitialSyncing || isSaving}
                                      onTouchStart={beginTap}
                                      onTouchMove={moveTap}
                                      onTouchEnd={(e) => endTap(() => void handleV3OptionalDidNotNeedToComplete(), e)}
                                      onClick={() => {
                                        if (shouldIgnoreClick()) return
                                        void handleV3OptionalDidNotNeedToComplete()
                                      }}
                                    >
                                      Didn&apos;t need to complete
                                    </button>
                                  )
                                }
                                const lastCompleter = findLastTaskCompleter(taskState, 'peanuts-noodles-close', selectedDateKey, selectedWindow)
                                if (!lastCompleter) return null
                                return (
                                  <button
                                    className="auto-assign-btn"
                                    disabled={isInitialSyncing || isSaving}
                                    onTouchStart={beginTap}
                                    onTouchMove={moveTap}
                                    onTouchEnd={(e) => endTap(() => handleAutoAssignPeanutsNoodles(), e)}
                                    onClick={() => {
                                      if (shouldIgnoreClick()) return
                                      handleAutoAssignPeanutsNoodles()
                                    }}
                                  >
                                    I didn't need to fill crispy noodles
                                    <span className="auto-assign-credit">→ Credits: {lastCompleter.assignees.join(' & ')}</span>
                                  </button>
                                )
                              })()}

                              {/* Admin-only: explicit Assign vs Complete (does NOT change assignees) */}
                              {isAdmin && activeCompletion ? (
                                <div className="admin-actions">
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <button
                                      className={`admin-action-btn ${!activeCompletion.assignedByAdmin ? 'active' : ''}`}
                                      disabled={isInitialSyncing || isSaving}
                                      onTouchStart={beginTap}
                                      onTouchMove={moveTap}
                                      onTouchEnd={(e) => endTap(() => setAdminAssignedByAdmin(false), e)}
                                      onClick={() => {
                                        if (shouldIgnoreClick()) return
                                        setAdminAssignedByAdmin(false)
                                      }}
                                    >
                                      Complete
                                    </button>
                                    <button
                                      className={`admin-action-btn ${activeCompletion.assignedByAdmin ? 'active' : ''}`}
                                      disabled={isInitialSyncing || isSaving}
                                      onTouchStart={beginTap}
                                      onTouchMove={moveTap}
                                      onTouchEnd={(e) => endTap(() => setAdminAssignedByAdmin(true), e)}
                                      onClick={() => {
                                        if (shouldIgnoreClick()) return
                                        setAdminAssignedByAdmin(true)
                                      }}
                                    >
                                      ⭐ Assign
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {isAdmin && activeCompletion?.completedLate && (
                                <div className="admin-actions">
                                  <button
                                    className={`admin-action-btn ${activeCompletion?.lateForgiven ? 'active' : ''}`}
                                    onTouchStart={beginTap}
                                    onTouchMove={moveTap}
                                    onTouchEnd={(e) => endTap(() => toggleLateForgiven(), e)}
                                    onClick={() => {
                                      if (shouldIgnoreClick()) return
                                      toggleLateForgiven()
                                    }}
                                  >
                                    {activeCompletion?.lateForgiven
                                      ? 'Late forgiven (counts for points)'
                                      : 'Forgive late (allow points)'}
                                  </button>
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTaskId === 'break-selection' && breakWizardSlotIdx !== null && breakWizardStep !== null && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) => endTap(() => closeBreakWizard(), e)}
          onClick={() => {
            if (shouldIgnoreClick()) return
            closeBreakWizard()
          }}
        >
          <div
            className="selector-card break-wizard-card"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const idx = breakWizardSlotIdx
              const locked = !canEditTaskAssignmentsOnSelectedDate || isInitialSyncing || isSaving
              const slot = breakDraftSlots[idx]
              const otherIdx: 0 | 1 = idx === 0 ? 1 : 0
              const otherEmployee = breakDraftSlots[otherIdx]?.employee || ''

              const employee = slot?.employee || ''
              const shiftType =
                slot?.shiftType === 'lunch' || slot?.shiftType === 'double' ? (slot.shiftType as BreakShiftType) : null
              const start = slot?.start || ''
              const startOptions = shiftType ? breakStartOptionsForShift(shiftType) : []
              const durationMin = shiftType ? breakDurationForShift(shiftType) : null
              const otherSlot = breakDraftSlots[otherIdx]
              const otherShiftType =
                otherSlot?.shiftType === 'lunch' || otherSlot?.shiftType === 'double' ? (otherSlot.shiftType as BreakShiftType) : null
              const otherDurationMin = otherShiftType ? breakDurationForShift(otherShiftType) : null
              const otherStart = otherSlot?.start || ''
              const otherStartMin = otherStart ? timeToMinutes(otherStart) : null
              const otherEndMin =
                otherStartMin !== null && otherDurationMin !== null ? otherStartMin + otherDurationMin : null

              const overlapsOtherSlot = (candidateStart: string): boolean => {
                if (!durationMin) return false
                if (otherStartMin === null || otherEndMin === null) return false
                const aStart = timeToMinutes(candidateStart)
                const aEnd = aStart + durationMin
                const bStart = otherStartMin
                const bEnd = otherEndMin
                return Math.max(aStart, bStart) < Math.min(aEnd, bEnd)
              }

              const stepLabel =
                breakWizardStep === 'employee' ? 'Pick employee' : breakWizardStep === 'shift' ? 'Pick shift type' : 'Pick time'

              return (
                <>
                  <div className="break-wizard-header">
                    <button
                      type="button"
                      className="break-wizard-nav-btn"
                      disabled={locked}
                      onClick={() => breakWizardBack()}
                      aria-label="Back"
                    >
                      ←
                    </button>
                    <div className="break-wizard-title">
                      <div className="break-wizard-step">
                        {employee ? `${employee} — ${stepLabel}` : stepLabel}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="break-wizard-nav-btn"
                      disabled={locked}
                      onClick={() => closeBreakWizard()}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {breakWizardStep === 'employee' && (
                    <div className="employee-grid">
                      {activeEmployees.map((user) => (
                        <button
                          key={user}
                          type="button"
                          className={`employee-option ${employee === user ? 'selected' : ''}`}
                          disabled={locked || (!!otherEmployee && otherEmployee === user)}
                          onClick={() => pickBreakWizardEmployee(idx, user)}
                        >
                          {user}
                        </button>
                      ))}
                    </div>
                  )}

                  {breakWizardStep === 'shift' && (
                    <div className="break-wizard-choices">
                      <button
                        type="button"
                        className={`break-wizard-choice ${shiftType === 'lunch' ? 'active' : ''}`}
                        disabled={locked || !employee}
                        onClick={() => pickBreakWizardShift(idx, 'lunch')}
                      >
                        Lunch shift (30 min)
                      </button>
                      <button
                        type="button"
                        className={`break-wizard-choice ${shiftType === 'double' ? 'active' : ''}`}
                        disabled={locked || !employee}
                        onClick={() => pickBreakWizardShift(idx, 'double')}
                      >
                        Double shift (1 hour)
                      </button>
                    </div>
                  )}

                  {breakWizardStep === 'time' && (
                    <>
                      {!shiftType ? (
                        <div className="note">Select a shift type first.</div>
                      ) : (
                        <div className="break-time-grid">
                          {startOptions.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`break-time-btn ${start === t ? 'active' : ''}`}
                              disabled={locked || overlapsOtherSlot(t)}
                              onClick={() => pickBreakWizardTime(idx, t)}
                            >
                              {formatTimeLabel(t)}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {showEmployeeSelector && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) =>
            endTap(() => {
              setShowEmployeeSelector(false)
              setPendingIceSide(null)
              setSplitSetupSelecting(false)
            }, e)
          }
          onClick={() => {
            if (shouldIgnoreClick()) return
            setShowEmployeeSelector(false)
            setPendingIceSide(null)
            setSplitSetupSelecting(false)
          }}
        >
          <div
            className={`selector-card${isV31 ? ' selector-card--v31' : ''}`}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="selector-header-center">
              <>
                {((activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') && pendingIceSide) ? (
                  <h3>Select {pendingIceSide === 'left' ? 'Left Ice' : 'Right Ice'} Employee</h3>
                ) : ((activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                  isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow) &&
                  pendingTowelSide) ? (
                  <h3>Select {pendingTowelSide === 'diningBar' ? 'Dining/Bar Towel' : 'Bowl Station Towel'} Employee</h3>
                ) : (
                  <>
                    <h3>{splitSetupSelecting ? 'Who is working?' : `Select ${splitMode ? 'Two Employees' : 'Employee'}`}</h3>
                    {splitMode && (
                      <div className="selection-counter">
                        {assignees.length} of 2 selected
                      </div>
                    )}
                  </>
                )}
              </>
            </div>
            
            {(() => {
              const restrictToSplit = splitPickerRestrict
              const requiresSplitForcedQuick =
                !!activeTask?.requiresSplit &&
                !isSoloModeActiveForWindow(selectedDateKey, selectedWindow) &&
                selectorShiftEmployees.length >= 2
              const isQuickMode =
                !splitSetupSelecting &&
                (!!restrictToSplit ||
                  requiresSplitForcedQuick ||
                  (!showAllEmployeesInSelector && selectorShiftEmployees.length >= 2))
              const users = restrictToSplit
                ? restrictToSplit
                : isQuickMode
                  ? displaySelectorEmployees
                  : activeEmployees
              return (
                <>
                  <div className={`employee-grid ${isQuickMode ? 'quick-select' : ''}`}>
                    {users.map((user) => (
                <button
                  key={user}
                  className={`employee-option ${
                    ((activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') && pendingIceSide)
                      ? ((pendingIceSide === 'left' ? iceSidesDraft.left : iceSidesDraft.right) === user ? 'selected' : '')
                      : ((activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                          isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow) &&
                          pendingTowelSide)
                        ? ((pendingTowelSide === 'diningBar' ? towelSidesDraft.diningBar : towelSidesDraft.bowlStation) === user ? 'selected' : '')
                        : (assignees.includes(user) ? 'selected' : '')
                  }`}
                  disabled={
                    (activeTaskId === 'turn-on-music' && !musicIsActuallyPlaying)
                  }
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) =>
                    endTap(() => {
                      if (activeTaskId === 'turn-on-music' && !musicIsActuallyPlaying) return
                      const isIceSidePick = (activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') && !!pendingIceSide
                      // Check for pending notifications before selecting
                      const pendingNotifs = getPendingNotificationsForEmployee(notifications, user)
                      if (pendingNotifs.length > 0) {
                        setPendingNotifEmployee(user)
                        setPendingNotifQueue(pendingNotifs)
                        setPendingNotifIndex(0)
                        return
                      }
                      if (isIceSidePick) {
                        const side = pendingIceSide
                        if (!side) return
                        // Check if employee needs to select a color (only when changing selection)
                        const current = side === 'left' ? iceSidesDraft.left : iceSidesDraft.right
                        if (current !== user && !employeeColors[user]) {
                          setPendingColorEmployee(user)
                          setPendingColorAction('ice')
                          setShowColorPicker(true)
                          return
                        }
                        triggerIceFillAnim(side)
                        const nextSides = { ...iceSidesDraft, [side]: user }
                        setIceSidesDraft(nextSides)
                        if (activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') {
                          const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                          setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                          setIceSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                        }
                        setShowEmployeeSelector(false)
                        setPendingIceSide(null)
                        if (nextSides.left && nextSides.right) {
                          void completeCombinedIceTask({ left: nextSides.left, right: nextSides.right })
                        } else {
                          void persistPartialIceTask(nextSides)
                        }
                        return
                      }
                      const isTowelSidePick =
                        (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                        isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow) &&
                        !!pendingTowelSide
                      if (isTowelSidePick) {
                        const side = pendingTowelSide
                        if (!side) return
                        const current = side === 'diningBar' ? towelSidesDraft.diningBar : towelSidesDraft.bowlStation
                        if (current !== user && !employeeColors[user]) {
                          setPendingColorEmployee(user)
                          setPendingColorAction('towel')
                          setShowColorPicker(true)
                          return
                        }
                        triggerTowelFillAnim(side)
                        const nextSides = { ...towelSidesDraft, [side]: user }
                        setTowelSidesDraft(nextSides)
                        const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                        setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                        setTowelSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                        setShowEmployeeSelector(false)
                        setPendingTowelSide(null)
                        if (nextSides.diningBar && nextSides.bowlStation) {
                          void completeCombinedTowelTask({ diningBar: nextSides.diningBar, bowlStation: nextSides.bowlStation })
                        } else {
                          void persistPartialTowelTask(nextSides)
                        }
                        return
                      }
                      // Check if employee needs to select a color (only when adding, not deselecting).
                      // Skipped for the dice "who is working?" pick — that doesn't complete a task.
                      if (!splitSetupSelecting && !assignees.includes(user) && !employeeColorsRef.current[user]) {
                        setPendingColorEmployee(user)
                        setPendingColorAction('task')
                        setShowColorPicker(true)
                        return
                      }
                      toggleAssignee(user)
                    }, e)
                  }
                  onClick={() => {
                    if (shouldIgnoreClick()) return
                    if (activeTaskId === 'turn-on-music' && !musicIsActuallyPlaying) return
                    const isIceSidePick = (activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') && !!pendingIceSide
                    // Check for pending notifications before selecting (skipped for the dice "who is working?" pick).
                    const pendingNotifs = getPendingNotificationsForEmployee(notifications, user)
                    if (!splitSetupSelecting && pendingNotifs.length > 0) {
                      setPendingNotifEmployee(user)
                      setPendingNotifQueue(pendingNotifs)
                      setPendingNotifIndex(0)
                      return
                    }
                    if (isIceSidePick) {
                      const side = pendingIceSide
                      if (!side) return
                      // Check if employee needs to select a color (only when changing selection)
                      const current = side === 'left' ? iceSidesDraft.left : iceSidesDraft.right
                      if (current !== user && !employeeColors[user]) {
                        setPendingColorEmployee(user)
                        setPendingColorAction('ice')
                        setShowColorPicker(true)
                        return
                      }
                      triggerIceFillAnim(side)
                      const nextSides = { ...iceSidesDraft, [side]: user }
                      setIceSidesDraft(nextSides)
                      if (activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close') {
                        const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                        setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                        setIceSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                      }
                      setShowEmployeeSelector(false)
                      setPendingIceSide(null)
                      if (nextSides.left && nextSides.right) {
                        void completeCombinedIceTask({ left: nextSides.left, right: nextSides.right })
                      } else {
                        void persistPartialIceTask(nextSides)
                      }
                      return
                    }
                    const isTowelSidePickOnClick =
                      (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                      isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow) &&
                      !!pendingTowelSide
                    if (isTowelSidePickOnClick) {
                      const side = pendingTowelSide
                      if (!side) return
                      const current = side === 'diningBar' ? towelSidesDraft.diningBar : towelSidesDraft.bowlStation
                      if (current !== user && !employeeColors[user]) {
                        setPendingColorEmployee(user)
                        setPendingColorAction('towel')
                        setShowColorPicker(true)
                        return
                      }
                      triggerTowelFillAnim(side)
                      const nextSides = { ...towelSidesDraft, [side]: user }
                      setTowelSidesDraft(nextSides)
                      const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                      setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                      setTowelSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                      setShowEmployeeSelector(false)
                      setPendingTowelSide(null)
                      if (nextSides.diningBar && nextSides.bowlStation) {
                        void completeCombinedTowelTask({ diningBar: nextSides.diningBar, bowlStation: nextSides.bowlStation })
                      } else {
                        void persistPartialTowelTask(nextSides)
                      }
                      return
                    }
                    // Check if employee needs to select a color (only when adding, not deselecting).
                    // Skipped for the dice "who is working?" pick — that doesn't complete a task.
                    if (!splitSetupSelecting && !assignees.includes(user) && !employeeColorsRef.current[user]) {
                      setPendingColorEmployee(user)
                      setPendingColorAction('task')
                      setShowColorPicker(true)
                      return
                    }
                    toggleAssignee(user)
                  }}
                >
                  {user}
                </button>
                    ))}
                  </div>

                  {isQuickMode && !restrictToSplit && (
                    <div className="employee-selector-actions">
                      <button
                        type="button"
                        className="employee-selector-more-btn"
                        onTouchStart={beginTap}
                        onTouchMove={moveTap}
                        onTouchEnd={(e) => endTap(() => setShowAllEmployeesInSelector(true), e)}
                        onClick={() => {
                          if (shouldIgnoreClick()) return
                          setShowAllEmployeesInSelector(true)
                        }}
                      >
                        More
                      </button>
                    </div>
                  )}
                </>
              )
            })()}

          </div>
        </div>
      )}

      {/* Color Picker Modal - shown when employee needs to select their favorite color */}
      {showColorPicker && pendingColorEmployee && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) =>
            endTap(() => {
              setShowColorPicker(false)
              setPendingColorEmployee(null)
              setPendingColorAction(null)
              setPendingBreakWizardIdx(null)
            }, e)
          }
          onClick={() => {
            if (shouldIgnoreClick()) return
            setShowColorPicker(false)
            setPendingColorEmployee(null)
            setPendingColorAction(null)
            setPendingBreakWizardIdx(null)
          }}
        >
          <div
            className="selector-card color-picker-card"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="color-picker-header">
              <h3>What's your favorite color?</h3>
              <p className="color-picker-subtitle">{pendingColorEmployee}, pick a color to continue</p>
            </div>
            
            <div className="color-picker-grid">
              {(() => {
                // Get colors already taken by other employees
                const takenColors = new Set(Object.values(employeeColors))
                // Build available colors: primary first, then backup, filtering out taken
                const allColors = [...EMPLOYEE_COLOR_OPTIONS_PRIMARY, ...EMPLOYEE_COLOR_OPTIONS_BACKUP]
                const availableColors = allColors.filter((c) => !takenColors.has(c)).slice(0, 12)
                return availableColors.map((color) => (
                  <button
                    key={color}
                    className="color-picker-option"
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) =>
                      endTap(async () => {
                        // Save the color
                        await saveEmployeeColor(pendingColorEmployee, color)
                        employeeColorsRef.current = { ...employeeColorsRef.current, [pendingColorEmployee]: color }
                        setEmployeeColors((prev) => ({ ...prev, [pendingColorEmployee]: color }))
                        
                        // Close picker and proceed based on action type
                        const emp = pendingColorEmployee
                        const action = pendingColorAction
                        const breakIdx = pendingBreakWizardIdx
                        setShowColorPicker(false)
                        setPendingColorEmployee(null)
                        setPendingColorAction(null)
                        setPendingBreakWizardIdx(null)
                        
                        if (action === 'break' && breakIdx !== null) {
                          // Continue with break wizard employee selection
                          setBreakDraftField(breakIdx, { employee: emp })
                          const d = breakDraftSlots[breakIdx]
                          const nextStep: BreakWizardStep | null = !d?.shiftType ? 'shift' : !d?.start ? 'time' : null
                          if (nextStep) setBreakWizardStep(nextStep)
                      } else if (action === 'ice') {
                          // Continue with Combined Ice Left/Right selection
                          const isCombinedIce = activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close'
                          const side = pendingIceSide
                          if (isCombinedIce && (side === 'left' || side === 'right')) {
                            triggerIceFillAnim(side)
                            const nextSides = { ...iceSidesDraft, [side]: emp }
                            setIceSidesDraft(nextSides)
                            const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                            setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                            setIceSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                            setShowEmployeeSelector(false)
                            setPendingIceSide(null)
                            if (nextSides.left && nextSides.right) {
                              void completeCombinedIceTask({ left: nextSides.left, right: nextSides.right })
                            } else {
                              void persistPartialIceTask(nextSides)
                            }
                          }
                      } else if (action === 'towel') {
                          const isCombinedTowel =
                            (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                            isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow)
                          const side = pendingTowelSide
                          if (isCombinedTowel && (side === 'diningBar' || side === 'bowlStation')) {
                            triggerTowelFillAnim(side)
                            const nextSides = { ...towelSidesDraft, [side]: emp }
                            setTowelSidesDraft(nextSides)
                            const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                            setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                            setTowelSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                            setShowEmployeeSelector(false)
                            setPendingTowelSide(null)
                            if (nextSides.diningBar && nextSides.bowlStation) {
                              void completeCombinedTowelTask({ diningBar: nextSides.diningBar, bowlStation: nextSides.bowlStation })
                            } else {
                              void persistPartialTowelTask(nextSides)
                            }
                          }
                      } else if (action === 'task') {
                          // Continue with task employee toggle
                          toggleAssignee(emp)
                      } else {
                        // 'noop' (or null): just setting a color, no follow-up action.
                        }
                      }, e)
                    }
                    onClick={async () => {
                      if (shouldIgnoreClick()) return
                      // Save the color
                      await saveEmployeeColor(pendingColorEmployee, color)
                      employeeColorsRef.current = { ...employeeColorsRef.current, [pendingColorEmployee]: color }
                      setEmployeeColors((prev) => ({ ...prev, [pendingColorEmployee]: color }))
                      
                      // Close picker and proceed based on action type
                      const emp = pendingColorEmployee
                      const action = pendingColorAction
                      const breakIdx = pendingBreakWizardIdx
                      setShowColorPicker(false)
                      setPendingColorEmployee(null)
                      setPendingColorAction(null)
                      setPendingBreakWizardIdx(null)
                      
                      if (action === 'break' && breakIdx !== null) {
                        // Continue with break wizard employee selection
                        setBreakDraftField(breakIdx, { employee: emp })
                        const d = breakDraftSlots[breakIdx]
                        const nextStep: BreakWizardStep | null = !d?.shiftType ? 'shift' : !d?.start ? 'time' : null
                        if (nextStep) setBreakWizardStep(nextStep)
                      } else if (action === 'ice') {
                        // Continue with Combined Ice Left/Right selection
                        const isCombinedIce = activeTaskId === 'ice-5pm' || activeTaskId === 'ice-close'
                        const side = pendingIceSide
                        if (isCombinedIce && (side === 'left' || side === 'right')) {
                          triggerIceFillAnim(side)
                          const nextSides = { ...iceSidesDraft, [side]: emp }
                          setIceSidesDraft(nextSides)
                          const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                          setIceSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                          setIceSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                          setShowEmployeeSelector(false)
                          setPendingIceSide(null)
                          if (nextSides.left && nextSides.right) {
                            void completeCombinedIceTask({ left: nextSides.left, right: nextSides.right })
                          } else {
                            void persistPartialIceTask(nextSides)
                          }
                        }
                      } else if (action === 'towel') {
                        const isCombinedTowel =
                          (activeTaskId === 'towels' || activeTaskId === 'towels-5pm' || activeTaskId === 'towels-close') &&
                          isTowelsSplitEffectiveForDateKey(selectedDateKey, selectedWindow)
                        const side = pendingTowelSide
                        if (isCombinedTowel && (side === 'diningBar' || side === 'bowlStation')) {
                          triggerTowelFillAnim(side)
                          const nextSides = { ...towelSidesDraft, [side]: emp }
                          setTowelSidesDraft(nextSides)
                          const key = `${selectedDateKey}:${selectedWindow}:${activeTaskId}`
                          setTowelSidesDraftDirtyByKey((prev) => ({ ...prev, [key]: true }))
                          setTowelSidesDraftByKey((prev) => ({ ...prev, [key]: nextSides }))
                          setShowEmployeeSelector(false)
                          setPendingTowelSide(null)
                          if (nextSides.diningBar && nextSides.bowlStation) {
                            void completeCombinedTowelTask({ diningBar: nextSides.diningBar, bowlStation: nextSides.bowlStation })
                          } else {
                            void persistPartialTowelTask(nextSides)
                          }
                        }
                      } else if (action === 'task') {
                        // Continue with task employee toggle
                        toggleAssignee(emp)
                      } else {
                        // 'noop' (or null): just setting a color, no follow-up action.
                      }
                    }}
                  />
                ))
              })()}
            </div>

            <button
              className="color-picker-back-btn"
              type="button"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) =>
                endTap(() => {
                  setShowColorPicker(false)
                  setPendingColorEmployee(null)
                  setPendingColorAction(null)
                  setPendingBreakWizardIdx(null)
                }, e)
              }
              onClick={() => {
                if (shouldIgnoreClick()) return
                setShowColorPicker(false)
                setPendingColorEmployee(null)
                setPendingColorAction(null)
                setPendingBreakWizardIdx(null)
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Print Request Overlay - admin sends document to iPad, non-dismissible until printed */}
      {printRequest && createPortal(
        <div className="print-request-overlay" id="print-request-overlay-root">
          {/* PDF.js canvas container - renders all pages for print */}
          <div className="print-request-pdf-container" id="print-request-pdf-container" aria-hidden="true" />
          <div className="print-request-overlay-card">
            <div className="print-request-overlay-icon">🖨️</div>
            <div className="print-request-overlay-message">{printRequest.message}</div>
            {(printRequest.fileType === 'docx' || printRequest.fileType === 'doc') ? (
              <div className="print-request-pdf-only-notice">
                PDF only. Please ask admin to send a PDF for printing.
              </div>
            ) : (
              <button
                type="button"
                className="print-request-print-btn"
                onClick={async () => {
                  if (!printRequest || printRequest.fileType !== 'pdf') return
                  const { fileUrl } = printRequest
                  const container = document.getElementById('print-request-pdf-container')
                  if (!container) { setPrintRequestPrinted(true); return }
                  try {
                    const res = await fetch(fileUrl, { mode: 'cors' })
                    const data = await res.arrayBuffer()
                    const pdfjsLib = await loadPdfJs()
                    const pdf = await pdfjsLib.getDocument({ data }).promise
                    const numPages = pdf.numPages
                    container.innerHTML = ''
                    const scale = 2

                    // Render each PDF page to a temporary canvas, then convert to <img>
                    // iOS Safari cannot print <canvas> bitmaps — only <img> elements work
                    const images: HTMLImageElement[] = []
                    for (let i = 1; i <= numPages; i++) {
                      const page = await pdf.getPage(i)
                      const viewport = page.getViewport({ scale })
                      const canvas = document.createElement('canvas')
                      canvas.width = viewport.width
                      canvas.height = viewport.height
                      const ctx = canvas.getContext('2d')
                      if (!ctx) continue
                      await page.render({ canvas, canvasContext: ctx, viewport }).promise
                      const img = document.createElement('img')
                      img.src = canvas.toDataURL('image/png')
                      img.style.width = '100%'
                      img.style.height = 'auto'
                      img.style.display = 'block'
                      images.push(img)
                    }

                    images.forEach((img) => container.appendChild(img))

                    await Promise.all(images.map((img) =>
                      img.decode ? img.decode() : new Promise<void>((r) => { img.onload = () => r() })
                    ))

                    const overlayCard = container.parentElement?.querySelector('.print-request-overlay-card') as HTMLElement | null
                    const overlay = container.parentElement as HTMLElement | null

                    if (overlayCard) overlayCard.style.display = 'none'
                    if (overlay) {
                      overlay.style.position = 'static'
                      overlay.style.overflow = 'visible'
                      overlay.style.display = 'block'
                      overlay.style.background = 'white'
                      overlay.style.height = 'auto'
                      overlay.style.padding = '0'
                      overlay.style.transform = 'none'
                      overlay.style.webkitTransform = 'none'
                    }
                    container.style.position = 'static'
                    container.style.opacity = '1'
                    container.style.zIndex = 'auto'
                    container.style.overflow = 'visible'
                    container.style.height = 'auto'
                    container.style.pointerEvents = 'auto'

                    document.body.classList.add('printing-pdf')

                    const onAfterPrint = () => {
                      window.removeEventListener('afterprint', onAfterPrint)
                      if (overlayCard) overlayCard.style.display = ''
                      if (overlay) {
                        overlay.style.position = ''
                        overlay.style.overflow = ''
                        overlay.style.display = ''
                        overlay.style.background = ''
                        overlay.style.height = ''
                        overlay.style.padding = ''
                        overlay.style.transform = ''
                        overlay.style.webkitTransform = ''
                      }
                      container.style.position = ''
                      container.style.opacity = ''
                      container.style.zIndex = ''
                      container.style.overflow = ''
                      container.style.height = ''
                      container.style.pointerEvents = ''
                      document.body.classList.remove('printing-pdf')
                      container.innerHTML = ''
                      setPrintRequestPrinted(true)
                    }
                    window.addEventListener('afterprint', onAfterPrint)

                    requestAnimationFrame(() => {
                      setTimeout(() => { window.print() }, 200)
                    })
                  } catch (err) {
                    console.error('Print failed:', err)
                    document.body.classList.remove('printing-pdf')
                    container.innerHTML = ''
                    setPrintRequestPrinted(true)
                  }
                }}
              >
                Print
              </button>
            )}
            {((printRequest.fileType === 'docx' || printRequest.fileType === 'doc') || printRequestPrinted) && (
              <button
                type="button"
                className="print-request-done-btn"
                onClick={async () => {
                  try {
                    await dismissPrintRequest()
                  } catch (err) {
                    console.error('Failed to dismiss print request:', err)
                  }
                  setPrintRequest(null)
                  setPrintRequestPrinted(false)
                }}
              >
                Done
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Notification Overlay - portal to ensure full screen coverage on iOS */}
      {pendingNotifEmployee && pendingNotifQueue.length > 0 && createPortal(
        <div className="notification-overlay">
          <div className="notification-overlay-card">
            <div className="notification-overlay-icon">⚠️</div>
            <div className="notification-overlay-header">
              <strong>Notification for {pendingNotifEmployee}</strong>
              {pendingNotifQueue.length > 1 && (
                <span className="notification-overlay-count">
                  ({pendingNotifIndex + 1} of {pendingNotifQueue.length})
                </span>
              )}
            </div>
            <div className="notification-overlay-message">
              {pendingNotifQueue[pendingNotifIndex]?.message || ''}
            </div>
            <button
              className="notification-overlay-dismiss-btn"
              type="button"
              onClick={async () => {
                const currentNotif = pendingNotifQueue[pendingNotifIndex]
                if (currentNotif && pendingNotifEmployee) {
                  // Dismiss this notification for the employee
                  try {
                    await dismissNotificationForEmployee(currentNotif.id, pendingNotifEmployee)
                  } catch (err) {
                    console.error('Failed to dismiss notification:', err)
                  }
                }
                
                // Move to next notification or complete
                if (pendingNotifIndex < pendingNotifQueue.length - 1) {
                  setPendingNotifIndex(pendingNotifIndex + 1)
                } else {
                  // All notifications dismissed, check if color is needed then complete the selection
                  const emp = pendingNotifEmployee
                  setPendingNotifEmployee(null)
                  setPendingNotifQueue([])
                  setPendingNotifIndex(0)
                  
                  // Check if employee needs to select a color (only when adding, not deselecting)
                  if (!assignees.includes(emp) && !employeeColors[emp]) {
                    setPendingColorEmployee(emp)
                    setPendingColorAction('task')
                    setShowColorPicker(true)
                    return
                  }
                  toggleAssignee(emp)
                }
              }}
            >
              Message Received
            </button>
          </div>
        </div>,
        document.body
      )}

      {showChecklistModal && activeTask?.requiresChecklist && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) => endTap(() => setShowChecklistModal(false), e)}
          onClick={() => {
            if (shouldIgnoreClick()) return
            setShowChecklistModal(false)
          }}
        >
          <div
            className="selector-card"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="checklist-header">
              <h3>Confirm Completion</h3>
            </div>
            
            <div className="checklist-message">
              By checking these off you are confirming that these tasks are fully completed
            </div>
            
            <div className="checklist-items">
              {activeTask.requirements.slice(0, activeTask.requiresChecklist).map((item, index) => (
                <label key={index} className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checkedItems.has(index)}
                    onChange={() => {
                      setCheckedItems((prev) => {
                        const next = new Set(prev)
                        if (next.has(index)) {
                          next.delete(index)
                        } else {
                          next.add(index)
                        }
                        return next
                      })
                    }}
                  />
                  <span>{renderRequirementText(item)}</span>
                </label>
              ))}
            </div>
            
            <button
              className="checklist-continue-btn"
              disabled={checkedItems.size < activeTask.requiresChecklist}
              onClick={() => {
                setShowChecklistModal(false)
                setShowEmployeeSelector(true)
              }}
            >
              Continue to select employee
            </button>
          </div>
        </div>
      )}

      {/* Night Shift Completion Prompt */}
      {showNightShiftPrompt && pendingNightShiftTask && (
        <div
          className="selector-backdrop"
          onClick={() => {
            // Clicking backdrop = task was completed, no report needed
            setShowNightShiftPrompt(false)
            setPendingNightShiftTask(null)
          }}
        >
          <div className="selector-card night-shift-prompt" onClick={(e) => e.stopPropagation()}>
            <div className="night-shift-header">
              <h3>Was this task completed by night shift?</h3>
              <p className="night-shift-subtitle">
                {pendingNightShiftTask.taskName}
              </p>
            </div>
            
            <div className="night-shift-buttons">
              <button
                className="night-shift-btn night-shift-btn--yes"
                onClick={() => {
                  // Yes = night shift completed it, no report needed
                  setShowNightShiftPrompt(false)
                  setPendingNightShiftTask(null)
                }}
              >
                ✓ Yes, it was done
              </button>
              <button
                className="night-shift-btn night-shift-btn--no"
                onClick={async () => {
                  // No = night shift didn't complete it, save report
                  try {
                    await saveNightShiftReport(
                      selectedDateKey,
                      pendingNightShiftTask.taskId,
                      pendingNightShiftTask.taskName,
                      pendingNightShiftTask.assignees
                    )
                  } catch (err) {
                    console.error('Failed to save night shift report:', err)
                  }
                  setShowNightShiftPrompt(false)
                  setPendingNightShiftTask(null)
                }}
              >
                ✗ No, it was not done
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && (
        <div className="selector-backdrop" onClick={() => setShowAdminPanel(false)}>
          <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-header">
              <h2>Admin Panel</h2>
              <div className="admin-header-actions">
                <button
                  className="admin-header-btn"
                  type="button"
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => void reloadForUpdate(), e)}
                  onClick={() => void reloadForUpdate()}
                >
                  Update
                </button>
                <button
                  className="admin-header-btn admin-header-btn--warn"
                  type="button"
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => {
                    if (confirm('Force refresh all connected browsers?')) {
                      void triggerForceRefresh()
                    }
                  }, e)}
                  onClick={() => {
                    if (confirm('Force refresh all connected browsers?')) {
                      void triggerForceRefresh()
                    }
                  }}
                >
                  Refresh All
                </button>
                <button
                  className="admin-header-btn admin-header-btn--danger"
                  type="button"
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => logoutAdmin(), e)}
                  onClick={() => logoutAdmin()}
                >
                  Log out
                </button>
                <button className="close-button" onClick={() => setShowAdminPanel(false)} aria-label="Close admin panel">
                  ✕
                </button>
              </div>
            </div>

            <div className="admin-tabs" role="group" aria-label="Admin views">
              <button
                className={adminView === 'employees' ? 'active' : ''}
                onClick={() => setAdminView('employees')}
              >
                Team
              </button>
              <button
                className={adminView === 'availability' ? 'active' : ''}
                onClick={() => setAdminView('availability')}
              >
                Availability
              </button>
              <button
                className={adminView === 'tasks' ? 'active' : ''}
                onClick={() => setAdminView('tasks')}
              >
                Tasks
              </button>
              <button
                className={adminView === 'dailyTasks' ? 'active' : ''}
                onClick={() => setAdminView('dailyTasks')}
              >
                Daily Tasks
              </button>
              <button
                className={adminView === 'timeoff' ? 'active' : ''}
                onClick={() => setAdminView('timeoff')}
              >
                Time Off
              </button>
              <button
                className={adminView === 'managementReports' ? 'active' : ''}
                onClick={() => setAdminView('managementReports')}
              >
                Reports
              </button>
              <button
                className={adminView === 'logs' ? 'active' : ''}
                onClick={() => setAdminView('logs')}
              >
                Logs
              </button>
              <button
                className={adminView === 'music' ? 'active' : ''}
                onClick={() => setAdminView('music')}
              >
                Music
              </button>
              <button
                className={adminView === 'notifications' ? 'active' : ''}
                onClick={() => setAdminView('notifications')}
              >
                Notify
              </button>
              <button
                className={adminView === 'applications' ? 'active' : ''}
                onClick={() => setAdminView('applications')}
              >
                Hiring
                {applications.filter(a => a.status === 'new').length > 0 && (
                  <span className="admin-tab-badge">{applications.filter(a => a.status === 'new').length}</span>
                )}
              </button>
              <button
                className={adminView === 'demo' ? 'active' : ''}
                onClick={() => setAdminView('demo')}
              >
                Demo
              </button>
            </div>

            {adminView === 'employees' ? (
              <div className="admin-section">
                <h3>Employees</h3>
                <div className="employee-admin-list">
                  {employees.map((emp, index) => {
                    const empColor = employeeColors[emp]
                    return (
                      <div key={index} className="employee-admin-item">
                        <div className="employee-admin-info">
                          {empColor ? (
                            <span 
                              className="employee-color-indicator" 
                              style={{ backgroundColor: empColor }}
                              title={`Color: ${empColor}`}
                            />
                          ) : (
                            <span 
                              className="employee-color-indicator employee-color-none"
                              title="No color set"
                            />
                          )}
                          <span>{emp}</span>
                        </div>
                        <div className="employee-admin-actions">
                          {empColor && (
                            <button 
                              className="remove-color-btn"
                              onClick={async () => {
                                await removeEmployeeColor(emp)
                                setEmployeeColors((prev) => {
                                  const next = { ...prev }
                                  delete next[emp]
                                  return next
                                })
                              }}
                              title="Remove color"
                            >
                              🎨✕
                            </button>
                          )}
                          <button 
                            className="delete-btn"
                            onClick={() => {
                              if (confirm(`Delete ${emp}?`)) {
                                setEmployees(employees.filter((_, i) => i !== index))
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  className="add-employee-btn"
                  onClick={() => {
                    const name = prompt('Enter employee name:')
                    if (name && name.trim()) {
                      setEmployees([...employees, name.trim()])
                    }
                  }}
                >
                  + Add Employee
                </button>
              </div>
            ) : adminView === 'availability' ? (
              <div className="admin-section">
                <h3>Weekly Availability</h3>
                <p className="admin-help">Set each employee's usual working shifts. This helps with time off requests.</p>
                
                {activeEmployees.length === 0 ? (
                  <div className="admin-empty">Add employees first.</div>
                ) : (
                  <div className="admin-availability-list">
                    {activeEmployees.map((emp) => {
                      const avail = availabilityState.patterns[emp] || null
                      const isEditing = adminAvailabilityEditingEmployee === emp
                      
                      return (
                        <div key={emp} className="admin-availability-card">
                          <div className="admin-availability-header">
                            <span className="admin-availability-name">{emp}</span>
                            <button
                              className="admin-availability-edit-btn"
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  setAdminAvailabilityEditingEmployee(null)
                                } else {
                                  setAdminAvailabilityEditingEmployee(emp)
                                  // Initialize availability if not set
                                  if (!avail) {
                                    setAvailabilityState((prev) => ({
                                      ...prev,
                                      patterns: {
                                        ...prev.patterns,
                                        [emp]: createDefaultWeeklyAvailability(),
                                      },
                                    }))
                                  }
                                }
                              }}
                            >
                              {isEditing ? 'Done' : 'Edit'}
                            </button>
                          </div>
                          
                          {isEditing ? (
                            <div className="admin-availability-editor">
                              <div className="admin-availability-grid">
                                <div className="admin-availability-grid-header">
                                  <div></div>
                                  {DAY_OF_WEEK_KEYS.map((day) => (
                                    <div key={day} className="admin-availability-day-label">
                                      {DAY_OF_WEEK_LABELS[day]}
                                    </div>
                                  ))}
                                </div>
                                <div className="admin-availability-grid-row">
                                  <div className="admin-availability-shift-label">Lunch</div>
                                  {DAY_OF_WEEK_KEYS.map((day) => {
                                    const currentAvail =
                                      availabilityState.patterns[emp] || createDefaultWeeklyAvailability()
                                    const isAvailable = currentAvail[day]?.lunch ?? false
                                    return (
                                      <button
                                        key={day}
                                        type="button"
                                        className={`admin-availability-toggle ${isAvailable ? 'available' : ''}`}
                                        onClick={async () => {
                                          const newAvail = { ...currentAvail }
                                          newAvail[day] = { ...newAvail[day], lunch: !isAvailable }
                                          const changeDateKey = formatDateKey(startOfDay(new Date()))
                                          const nextState = applyEmployeeAvailabilityUpdate(
                                            availabilityState,
                                            emp,
                                            newAvail,
                                            changeDateKey
                                          )
                                          setAvailabilityState(nextState)
                                          await saveAvailabilityState(nextState)
                                        }}
                                      >
                                        {isAvailable ? '✓' : ''}
                                      </button>
                                    )
                                  })}
                                </div>
                                <div className="admin-availability-grid-row">
                                  <div className="admin-availability-shift-label">Dinner</div>
                                  {DAY_OF_WEEK_KEYS.map((day) => {
                                    const currentAvail =
                                      availabilityState.patterns[emp] || createDefaultWeeklyAvailability()
                                    const isAvailable = currentAvail[day]?.dinner ?? false
                                    return (
                                      <button
                                        key={day}
                                        type="button"
                                        className={`admin-availability-toggle ${isAvailable ? 'available' : ''}`}
                                        onClick={async () => {
                                          const newAvail = { ...currentAvail }
                                          newAvail[day] = { ...newAvail[day], dinner: !isAvailable }
                                          const changeDateKey = formatDateKey(startOfDay(new Date()))
                                          const nextState = applyEmployeeAvailabilityUpdate(
                                            availabilityState,
                                            emp,
                                            newAvail,
                                            changeDateKey
                                          )
                                          setAvailabilityState(nextState)
                                          await saveAvailabilityState(nextState)
                                        }}
                                      >
                                        {isAvailable ? '✓' : ''}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="admin-availability-summary">
                              {avail ? (
                                <div className="admin-availability-summary-grid">
                                  {DAY_OF_WEEK_KEYS.map((day) => {
                                    const hasLunch = avail[day]?.lunch
                                    const hasDinner = avail[day]?.dinner
                                    if (!hasLunch && !hasDinner) return null
                                    return (
                                      <span key={day} className="admin-availability-tag">
                                        {DAY_OF_WEEK_LABELS[day]}
                                        {hasLunch && hasDinner ? ' (L+D)' : hasLunch ? ' (L)' : ' (D)'}
                                      </span>
                                    )
                                  })}
                                </div>
                              ) : (
                                <span className="admin-availability-none">Not configured</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : adminView === 'tasks' ? (
              <div className="admin-section">
                <h3>Tasks</h3>
                <p className="admin-help">
                  Add new tasks to the live task list. Scoring rebalances automatically, and tasks won’t affect dates/windows before they exist.
                </p>

                {adminTaskError ? <div className="admin-empty">{adminTaskError}</div> : null}

                <div className="admin-notif-form">
                  <label className="admin-notif-label">
                    Name
                    <input
                      className="admin-notif-input"
                      type="text"
                      value={adminTaskName}
                      onChange={(e) => setAdminTaskName(e.target.value)}
                      placeholder="e.g. Restock To-Go Lids"
                    />
                  </label>

                  <label className="admin-notif-label">
                    Icon (emoji)
                    <input
                      className="admin-notif-input"
                      type="text"
                      value={adminTaskIcon}
                      onChange={(e) => setAdminTaskIcon(e.target.value)}
                      placeholder="🧩"
                    />
                  </label>

                  <div className="admin-notif-label">
                    Windows
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                      {(['11', '17', '21'] as WindowKey[]).map((w) => (
                        <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={!!adminTaskWindows[w]}
                            onChange={(e) => setAdminTaskWindows({ ...adminTaskWindows, [w]: e.target.checked })}
                          />
                          {w === '11' ? '11AM' : w === '17' ? '5PM' : '9PM'}
                        </label>
                      ))}
                    </div>
                  </div>

                  {uiVariant === 'v3' && (adminTaskWindows['11'] || adminTaskWindows['21']) && (
                    <div className="admin-notif-label">
                      Stage Assignment
                      {adminTaskWindows['11'] && (
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 13, opacity: 0.7 }}>11AM:</span>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            {([1, 2] as const).map((s) => (
                              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                <input
                                  type="radio"
                                  name="admin-task-stage-11"
                                  checked={(adminTaskStages['11'] ?? 2) === s}
                                  onChange={() => setAdminTaskStages({ ...adminTaskStages, '11': s })}
                                />
                                Stage {s}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {adminTaskWindows['21'] && (
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 13, opacity: 0.7 }}>9/10PM:</span>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            {([1, 2] as const).map((s) => (
                              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                <input
                                  type="radio"
                                  name="admin-task-stage-21"
                                  checked={(adminTaskStages['21'] ?? 2) === s}
                                  onChange={() => setAdminTaskStages({ ...adminTaskStages, '21': s })}
                                />
                                Stage {s}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="admin-notif-label">
                    Weight (default 1)
                    <input
                      className="admin-notif-input"
                      inputMode="decimal"
                      value={adminTaskWeight}
                      onChange={(e) => setAdminTaskWeight(e.target.value)}
                      placeholder="1"
                    />
                  </label>

                  <label className="admin-notif-label">
                    Requirements (one per line)
                    <textarea
                      className="admin-notif-textarea"
                      value={adminTaskRequirementsText}
                      onChange={(e) => setAdminTaskRequirementsText(e.target.value)}
                      placeholder={'Example:\n- Wipe down shelf\n- Refill lids\n- Confirm stock is fronted'}
                    />
                  </label>

                  <button
                    className="admin-notif-send"
                    type="button"
                    onClick={() => void addAdminTask()}
                  >
                    + Add Task
                  </button>
                </div>

                <h3 style={{ marginTop: 18 }}>Admin-added tasks</h3>
                {(taskCatalog.tasks || []).length === 0 ? (
                  <div className="admin-empty">No admin-added tasks yet.</div>
                ) : (
                  <div className="admin-timeoff-list">
                    {[...(taskCatalog.tasks || [])]
                      .slice()
                      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
                      .map((t) => (
                        <div key={t.id} className="admin-timeoff-card">
                          <div className="admin-timeoff-header">
                            <span className="admin-timeoff-employee">
                              {t.icon} {t.name}
                            </span>
                            <span className="admin-timeoff-status admin-timeoff-status-approved">
                              {t.windows.map((w) => (w === '11' ? '11AM' : w === '17' ? '5PM' : '9PM')).join(', ')}
                            </span>
                          </div>
                          <div className="admin-timeoff-shifts">
                            <strong>id:</strong> {t.id} &nbsp; <strong>weight:</strong> {t.weight ?? 1}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                <h3 style={{ marginTop: 18 }}>Edit requirements (all tasks)</h3>
                <p className="admin-help">Overrides replace the default requirements text. Use “Reset” to go back to the built-in/default version.</p>

                <h3 style={{ marginTop: 18 }}>Edit names (all tasks)</h3>
                <p className="admin-help">Overrides replace the default display name. No badge is shown for name edits.</p>

                {adminEditingNameTaskId ? (
                  // Names are edited in a dedicated modal (see below).
                  null
                ) : null}

                {adminEditingReqTaskId ? (
                  // Requirements are edited in a dedicated modal (see below).
                  null
                ) : null}

                <div className="admin-task-filters">
                  <input
                    className="admin-notif-input"
                    type="text"
                    value={adminTasksSearch}
                    onChange={(e) => setAdminTasksSearch(e.target.value)}
                    placeholder="Search tasks by name or id…"
                    aria-label="Search tasks by name or id"
                  />
                  <div className="admin-task-filter-toggles" role="group" aria-label="Task filter">
                    <button
                      type="button"
                      className={`admin-task-filter-btn ${adminTasksFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setAdminTasksFilter('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`admin-task-filter-btn ${adminTasksFilter === 'overridden' ? 'active' : ''}`}
                      onClick={() => setAdminTasksFilter('overridden')}
                    >
                      Overridden only
                    </button>
                  </div>
                  <button
                    type="button"
                    className="admin-header-btn"
                    disabled={!isAdmin || adminApplyingIceCombine}
                    onClick={() => {
                      if (!isAdmin) return
                      if (adminApplyingIceCombine) return
                      if (
                        confirm(
                          'Apply Ice Combine now?\n\nThis will remove Left/Right Ice tasks from 5PM + Close going forward (history is preserved). The new combined Ice task cards will remain.'
                        )
                      ) {
                        void applyIceCombineNow()
                      }
                    }}
                    title="Hide legacy Left/Right Ice tasks for future windows without changing history."
                  >
                    {adminApplyingIceCombine ? 'Applying Ice Combine…' : 'Apply Ice Combine (5PM + Close)'}
                  </button>
                  <button
                    type="button"
                    className="admin-header-btn"
                    disabled={!isAdmin || adminApplyingTowelsSplit}
                    onClick={() => {
                      if (!isAdmin) return
                      if (adminApplyingTowelsSplit) return
                      if (
                        confirm(
                          'Apply Towels Split now?\n\nTowels (11AM, 5PM & 9PM) will use the split UI (Dining/Bar + Bowl Station) going forward. Past completions are preserved.'
                        )
                      ) {
                        void applyTowelsSplitNow()
                      }
                    }}
                    title="Enable split Towels UI for future windows without changing history."
                  >
                    {adminApplyingTowelsSplit ? 'Applying Towels Split…' : 'Apply Towels Split (11AM, 5PM & 9PM)'}
                  </button>
                  <button
                    type="button"
                    className="admin-header-btn"
                    disabled={!isAdmin || adminTogglingDice}
                    onClick={() => {
                      if (!isAdmin) return
                      void toggleDiceEnabled()
                    }}
                    title="When enabled, staff see the 🎲 next to the greeting on 5PM & 9PM only (hidden on 11 AM)."
                  >
                    {adminTogglingDice
                      ? 'Updating Dice…'
                      : taskOverrides?.diceEnabled === true
                        ? 'Disable 🎲 (random / fair split)'
                        : 'Enable 🎲 (random / fair split)'}
                  </button>
                </div>

                <div className="admin-timeoff-list">
                  {[...allTasks]
                    .slice()
                    .filter((t) => {
                      const q = adminTasksSearch.trim().toLowerCase()
                      if (q) {
                        const name = (t.name || '').toLowerCase()
                        const id = (t.id || '').toLowerCase()
                        if (!name.includes(q) && !id.includes(q)) return false
                      }
                      const isOverriddenAny = !!taskOverrides?.overrides?.[t.id]
                      if (adminTasksFilter === 'overridden' && !isOverriddenAny) return false
                      return true
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((t) => {
                      const ov = taskOverrides?.overrides?.[t.id]
                      const isOverridden = !!ov
                      const isNameOverridden = typeof ov?.name === 'string' && ov.name.trim().length > 0
                      const isReqOverridden = Array.isArray((ov as any)?.requirements) && ((ov as any).requirements || []).length > 0
                      const isWindowsOverridden = Array.isArray((ov as any)?.windows)
                      const isWeightOverridden = typeof (ov as any)?.weight === 'number'

                      const windowLabel = (w: WindowKey) => (w === '11' ? '11AM' : w === '17' ? '5PM' : '9PM')
                      const listWindows = (windows: WindowKey[]) =>
                        windows.length ? windows.slice().sort().map(windowLabel).join(', ') : '— (removed)'
                      const baseWindows = listWindows((t.windows || []) as WindowKey[])
                      const overrideWindows = isWindowsOverridden ? listWindows(((ov as any).windows || []) as WindowKey[]) : null
                      const windowsEffKey =
                        typeof (ov as any)?.windowsEffectiveAtMs === 'number'
                          ? formatDateKey(startOfDay(new Date((ov as any).windowsEffectiveAtMs)))
                          : null
                      const baseWeight = t.weight ?? 1
                      const overrideWeight = isWeightOverridden ? ((ov as any).weight as number) : null
                      const weightEffKey =
                        typeof (ov as any)?.weightEffectiveAtMs === 'number'
                          ? formatDateKey(startOfDay(new Date((ov as any).weightEffectiveAtMs)))
                          : null
                      return (
                        <div key={t.id} className="admin-timeoff-card">
                          <div className="admin-timeoff-header">
                            <span className="admin-timeoff-employee">
                              {t.icon} {t.name}
                            </span>
                            <span className={`admin-timeoff-status ${isOverridden ? 'admin-timeoff-status-approved' : 'admin-timeoff-status-pending'}`}>
                              {isOverridden ? 'Overridden' : 'Default'}
                            </span>
                          </div>
                          <div className="admin-timeoff-shifts">
                            <strong>id:</strong> {t.id}
                            {t.requiresChecklist ? (
                              <span> &nbsp; <strong>checklist:</strong> {t.requiresChecklist}</span>
                            ) : null}
                            <span> &nbsp; <strong>windows:</strong> {baseWindows}</span>
                            <span> &nbsp; <strong>weight:</strong> {baseWeight}</span>
                          </div>
                          {isWindowsOverridden ? (
                            <div className="admin-timeoff-shifts">
                              <span className="admin-chip admin-chip--overridden">Windows override</span>
                              <span style={{ marginLeft: 10 }}>
                                {overrideWindows} {windowsEffKey ? `(effective ${windowsEffKey})` : '(effective immediately)'}
                              </span>
                            </div>
                          ) : null}
                          {isWeightOverridden ? (
                            <div className="admin-timeoff-shifts">
                              <span className="admin-chip admin-chip--overridden">Weight override</span>
                              <span style={{ marginLeft: 10 }}>
                                {overrideWeight} {weightEffKey ? `(effective ${weightEffKey})` : '(effective immediately)'}
                              </span>
                            </div>
                          ) : null}
                          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                            <button className="admin-notif-send" type="button" onClick={() => startEditName(t.id)}>
                              Edit name
                            </button>
                            {isNameOverridden ? (
                              <button
                                className="admin-header-btn admin-header-btn--warn"
                                type="button"
                                onClick={() => {
                                  if (confirm(`Reset name for “${t.name}” to default?`)) {
                                    void resetNameToDefault(t.id)
                                  }
                                }}
                              >
                                Reset name
                              </button>
                            ) : null}
                            <button className="admin-notif-send" type="button" onClick={() => startEditWindows(t.id)}>
                              Edit windows
                            </button>
                            {isWindowsOverridden ? (
                              <button
                                className="admin-header-btn admin-header-btn--warn"
                                type="button"
                                onClick={() => {
                                  if (confirm(`Reset windows for “${t.name}” to default?`)) {
                                    void resetWindowsToDefault(t.id)
                                  }
                                }}
                              >
                                Reset windows
                              </button>
                            ) : null}
                            <button className="admin-notif-send" type="button" onClick={() => startEditWeight(t.id)}>
                              Edit weight
                            </button>
                            {isWeightOverridden ? (
                              <button
                                className="admin-header-btn admin-header-btn--warn"
                                type="button"
                                onClick={() => {
                                  if (confirm(`Reset weight for “${t.name}” to default?`)) {
                                    void resetWeightToDefault(t.id)
                                  }
                                }}
                              >
                                Reset weight
                              </button>
                            ) : null}
                            <button className="admin-notif-send" type="button" onClick={() => startEditRequirements(t.id)}>
                              Edit requirements
                            </button>
                            {isReqOverridden ? (
                              <button
                                className="admin-header-btn admin-header-btn--warn"
                                type="button"
                                onClick={() => {
                                  if (confirm(`Reset requirements for “${t.name}” to default?`)) {
                                    void resetRequirementsToDefault(t.id)
                                  }
                                }}
                              >
                                Reset
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            ) : adminView === 'dailyTasks' ? (
              <div className="admin-section">
                <h3>Daily Tasks</h3>
                <p className="admin-help">
                  Create the “Today’s Task” golden-card tasks. Weekly quotas are <strong>exact per Sun–Sat</strong>.
                  Overrides are allowed and may break quotas (we’ll show warnings).
                </p>
                <p className="admin-help" style={{ marginTop: -4 }}>
                  <strong>Recent runs:</strong> Rows that say “Completed by …” include <strong>Edit history</strong> to fix
                  the label shown in this list (not the catalog) and who completed the task.
                </p>

                <h3 style={{ marginTop: 12 }}>Recent daily task runs (last 30 days)</h3>
                {adminDailyRunsLoading ? (
                  <div className="admin-empty">Loading…</div>
                ) : adminDailyRunsRecent.length === 0 ? (
                  <div className="admin-empty">No runs found.</div>
                ) : (
                  <div className="admin-timeoff-list">
                    {adminDailyRunsRecent.slice(0, 30).map((r) => {
                      const name = getDailyTaskRunHistoryTitle(r, dailyTaskCatalog.tasks)
                      const completedBy = formatDailyTaskRunCompletedBy(r)
                      const status = r.completedAtMs
                        ? `Completed by ${completedBy || 'unknown'}`
                        : r.revealedAtMs
                        ? 'Revealed'
                        : 'Selected'
                      const canEditHistory =
                        r.taskId === '__none__' ||
                        (typeof r.completedAtMs === 'number' && Number.isFinite(r.completedAtMs))
                      return (
                        <div key={r.dateKey} className="admin-timeoff-card">
                          <div className="admin-timeoff-header">
                            <span className="admin-timeoff-employee">{r.dateKey}</span>
                            <span className="admin-timeoff-status admin-timeoff-status-approved">{status}</span>
                          </div>
                          <div className="admin-timeoff-shifts">
                            <strong>Task:</strong> {name}
                          </div>
                          {canEditHistory ? (
                            <div style={{ marginTop: 10 }}>
                              <button
                                type="button"
                                className="admin-notif-send"
                                onClick={() => openAdminDailyRunHistoryEdit(r)}
                              >
                                Edit history
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}

                {adminDailyRunHistoryEdit ? (
                  <div
                    className="admin-modal-backdrop"
                    role="presentation"
                    onClick={() => {
                      if (!adminDailyRunHistorySaving) setAdminDailyRunHistoryEdit(null)
                    }}
                  >
                    <div className="admin-modal-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                      <div className="admin-modal-header">
                        <div className="admin-modal-title">
                          <h3>Edit daily run</h3>
                          <div className="admin-modal-sub">{adminDailyRunHistoryEdit.dateKey}</div>
                        </div>
                        <button
                          type="button"
                          className="admin-header-btn"
                          disabled={adminDailyRunHistorySaving}
                          onClick={() => setAdminDailyRunHistoryEdit(null)}
                        >
                          Close
                        </button>
                      </div>
                      <p className="admin-help" style={{ marginTop: 0 }}>
                        Updates the saved run only (not the catalog task). Clear the title or match the catalog name to
                        remove a custom title. For <strong>— No task —</strong> days, completer fields can be left blank.
                      </p>
                      {adminDailyRunHistoryError ? (
                        <div style={{ marginBottom: 10, color: '#b91c1c', fontWeight: 700, fontSize: 14 }}>
                          {adminDailyRunHistoryError}
                        </div>
                      ) : null}
                      <label className="admin-label">Title in history</label>
                      <input
                        type="text"
                        className="admin-notif-input"
                        style={{ width: '100%', marginBottom: 12 }}
                        value={adminDailyRunHistoryTitle}
                        onChange={(e) => setAdminDailyRunHistoryTitle(e.target.value)}
                        disabled={adminDailyRunHistorySaving}
                      />
                      <label className="admin-label">Completed by (1st)</label>
                      <input
                        type="text"
                        className="admin-notif-input"
                        style={{ width: '100%', marginBottom: 12 }}
                        value={adminDailyRunHistoryEmp1}
                        onChange={(e) => setAdminDailyRunHistoryEmp1(e.target.value)}
                        disabled={adminDailyRunHistorySaving}
                      />
                      <label className="admin-label">Completed by (2nd, optional)</label>
                      <input
                        type="text"
                        className="admin-notif-input"
                        style={{ width: '100%', marginBottom: 12 }}
                        value={adminDailyRunHistoryEmp2}
                        onChange={(e) => setAdminDailyRunHistoryEmp2(e.target.value)}
                        disabled={adminDailyRunHistorySaving}
                      />
                      {adminDailyRunHistoryEdit.taskId === '__none__' ? (
                        <>
                          <label className="admin-label">Count work toward task (scheduling)</label>
                          <p className="admin-help" style={{ marginTop: 0, marginBottom: 8 }}>
                            Optional. Credits this day toward recency and monthly/weekly-from-runs logic for a real
                            catalog task while keeping this day as &quot;No task&quot; on the card.
                          </p>
                          <select
                            className="admin-notif-input"
                            style={{ width: '100%', marginBottom: 12 }}
                            value={adminDailyRunHistoryCreditTaskId}
                            onChange={(e) => setAdminDailyRunHistoryCreditTaskId(e.target.value)}
                            disabled={adminDailyRunHistorySaving}
                          >
                            <option value="">(none)</option>
                            {(dailyTaskCatalog.tasks || [])
                              .filter(isDailyTaskSchedulable)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name || t.id}
                                </option>
                              ))}
                          </select>
                        </>
                      ) : null}
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                        <button
                          type="button"
                          className="admin-header-btn"
                          disabled={adminDailyRunHistorySaving}
                          onClick={() => setAdminDailyRunHistoryEdit(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="admin-notif-send"
                          disabled={adminDailyRunHistorySaving}
                          onClick={() => void saveAdminDailyRunHistoryEdit()}
                        >
                          {adminDailyRunHistorySaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {adminDailySaveError ? <div className="admin-empty">{adminDailySaveError}</div> : null}

                <div className="admin-notif-form">
                  <label className="admin-notif-label">
                    Name
                    <input
                      className="admin-notif-input"
                      type="text"
                      value={adminDailyName}
                      onChange={(e) => setAdminDailyName(e.target.value)}
                      placeholder="e.g. Clean grill station"
                    />
                  </label>

                  <label className="admin-notif-label">
                    Frequency
                    <select
                      className="admin-notif-input"
                      value={adminDailyFrequencyType}
                      onChange={(e) => setAdminDailyFrequencyType(e.target.value === 'weekly' ? 'weekly' : 'normal')}
                    >
                      <option value="normal">Normal (no weekly quota)</option>
                      <option value="weekly">Weekly quota (1–3/week)</option>
                    </select>
                  </label>

                  {adminDailyFrequencyType === 'weekly' ? (
                    <label className="admin-notif-label">
                      Quota per week (Sun–Sat)
                      <select
                        className="admin-notif-input"
                        value={String(adminDailyQuota)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          setAdminDailyQuota(n === 2 ? 2 : n === 3 ? 3 : 1)
                        }}
                      >
                        <option value="1">1 day/week</option>
                        <option value="2">2 days/week</option>
                        <option value="3">3 days/week</option>
                      </select>
                    </label>
                  ) : null}

                  <label className="admin-notif-label">
                    Materials needed image
                    <input
                      className="admin-notif-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAdminDailyMaterialsFile(e.target.files?.[0] || null)}
                    />
                    <div className="admin-help">Images are automatically center-cropped to fit.</div>
                    {typeof adminDailyUploadPct.materials === 'number' ? (
                      <div className="admin-help">Upload: {adminDailyUploadPct.materials}%</div>
                    ) : null}
                  </label>

                  <label className="admin-notif-label">
                    Materials needed description
                    <textarea
                      className="admin-notif-textarea"
                      value={adminDailyMaterialsDesc}
                      onChange={(e) => setAdminDailyMaterialsDesc(e.target.value)}
                      placeholder="Short description of items needed…"
                    />
                  </label>

                  <label className="admin-notif-label">
                    What to do image
                    <input
                      className="admin-notif-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAdminDailyWhatToDoFile(e.target.files?.[0] || null)}
                    />
                    <div className="admin-help">Images are automatically center-cropped to fit.</div>
                    {typeof adminDailyUploadPct.whatToDo === 'number' ? (
                      <div className="admin-help">Upload: {adminDailyUploadPct.whatToDo}%</div>
                    ) : null}
                  </label>

                  <label className="admin-notif-label">
                    What to do description
                    <textarea
                      className="admin-notif-textarea"
                      value={adminDailyWhatToDoDesc}
                      onChange={(e) => setAdminDailyWhatToDoDesc(e.target.value)}
                      placeholder="Short description of what to do…"
                    />
                  </label>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      className="admin-notif-send"
                      type="button"
                      disabled={adminDailySaving}
                      onClick={() => void saveAdminDailyTask()}
                    >
                      {adminDailySaving ? 'Saving...' : adminDailyEditingId ? 'Update Daily Task' : '+ Add Daily Task'}
                    </button>
                    {adminDailyEditingId ? (
                      <button
                        className="admin-header-btn admin-header-btn--warn"
                        type="button"
                        onClick={() => resetAdminDailyDraft()}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </div>

                <h3 style={{ marginTop: 18 }}>Daily tasks</h3>
                {(dailyTaskCatalog.tasks || []).length === 0 ? (
                  <div className="admin-empty">No daily tasks yet.</div>
                ) : (
                  <div className="admin-timeoff-list">
                    {[...(dailyTaskCatalog.tasks || [])]
                      .filter(isDailyTaskSchedulable)
                      .slice()
                      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                      .map((t) => {
                        const freqLabel =
                          t.frequency?.type === 'weekly'
                            ? `Weekly: ${t.frequency.quotaPerWeek}/week`
                            : 'Normal'
                        return (
                          <div key={t.id} className="admin-timeoff-card">
                            <div className="admin-timeoff-header">
                              <span className="admin-timeoff-employee">
                                {t.name}
                              </span>
                              <span className="admin-timeoff-status admin-timeoff-status-approved">
                                {freqLabel}
                              </span>
                            </div>
                            <div className="admin-timeoff-shifts">
                              <strong>id:</strong> {t.id}
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                              <button className="admin-notif-send" type="button" onClick={() => startEditAdminDailyTask(t.id)}>
                                Edit
                              </button>
                              <button
                                className="admin-header-btn admin-header-btn--danger"
                                type="button"
                                onClick={() => {
                                  if (confirm(`Delete daily task “${t.name}”?`)) {
                                    void deleteAdminDailyTask(t.id)
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}

                <h3 style={{ marginTop: 18 }}>Next 7 days</h3>
                <p className="admin-help">Preview + override. Overrides may break weekly quotas.</p>

                <div
                  style={{
                    background: '#1a1a2e',
                    border: '1px solid #444',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 300,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>Regeneration Debug Info</strong>
                    <button
                      type="button"
                      onClick={() => setAdminDailyDebugInfo(null)}
                      style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ color: '#9aa' }}>
                    UI loaded:{' '}
                    {new Date(adminDailyDebugInitAtMs).toLocaleString()}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {(adminDailyDebugInfo && adminDailyDebugInfo.length ? adminDailyDebugInfo : ['(no debug yet)']).map(
                      (line, i) => (
                        <div key={i}>{line || '\u00A0'}</div>
                      )
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <button
                    className="admin-notif-send"
                    type="button"
                    disabled={adminDailyRegenerating}
                    onClick={() => {
                      setAdminDailyDebugInfo(['Button clicked! Starting...'])
                      void regenerateDailyTaskSchedule()
                    }}
                  >
                    {adminDailyRegenerating ? 'Regenerating... (DBG2)' : '🔄 Regenerate Schedule (DBG2)'}
                  </button>
                </div>

                {(() => {
                  const enabled = (dailyTaskCatalog.tasks || []).filter(isDailyTaskSchedulable)
                  const next7 = Array.from({ length: 7 }).map((_, i) => addDaysToDateKey(todayDateKey, i))
                  const weekStarts = Array.from(new Set(next7.map((dk) => getWeekStartDateKeySunday(dk))))
                  const warnings = Array.from(
                    new Set(
                      weekStarts.flatMap((ws) => computeDailyTaskWeekQuotaWarnings(adminDailyWeeksByStart[ws] || null))
                    )
                  )

                  return (
                    <>
                      {warnings.length ? (
                        <div className="admin-empty">
                          <strong>Warnings:</strong>
                          <div style={{ marginTop: 6 }}>
                            {warnings.map((w) => (
                              <div key={w}>{w}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="admin-timeoff-list">
                        {next7.map((dk) => {
                          const ws = getWeekStartDateKeySunday(dk)
                          const week = adminDailyWeeksByStart[ws] || null
                          const entry = week?.days?.[dk]
                          const currentId = entry?.taskId || ''
                          const currentName = currentId === '__none__'
                            ? '— No task —'
                            : currentId
                              ? enabled.find((t) => t.id === currentId)?.name || currentId
                              : '(unassigned)'
                          const pick = adminDailyOverridePickByDateKey[dk] ?? currentId
                          const label = parseDateKey(dk).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                          const parsedEntry = parseWeekDayEntry(entry)
                          const approvalStatus = getDayApprovalStatus(parsedEntry)
                          return (
                            <div key={dk} className="admin-timeoff-card">
                              <div className="admin-timeoff-header">
                                <span className="admin-timeoff-employee">{label}</span>
                                <span className="admin-timeoff-header-badges">
                                  <span className={`admin-timeoff-status admin-timeoff-status--approval-${approvalStatus}`}>
                                    {approvalStatusLabel(approvalStatus)}
                                  </span>
                                  <span className={`admin-timeoff-status ${entry?.source === 'override' ? 'admin-timeoff-status-approved' : 'admin-timeoff-status-pending'}`}>
                                    {entry?.source === 'override' ? 'Override' : 'Auto'}
                                  </span>
                                </span>
                              </div>
                              <div className="admin-timeoff-shifts">
                                <strong>Task:</strong> {currentName}
                              </div>
                              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <select
                                  className="admin-notif-input"
                                  value={pick}
                                  onChange={(e) =>
                                    setAdminDailyOverridePickByDateKey((prev) => ({ ...prev, [dk]: e.target.value }))
                                  }
                                  style={{ minWidth: 220 }}
                                >
                                  <option value="">Select task…</option>
                                  <option value="__none__">— No task —</option>
                                  {enabled
                                    .slice()
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                    .map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  className="admin-notif-send"
                                  type="button"
                                  disabled={!pick || adminDailyOverrideSaving === dk}
                                  onClick={() => {
                                    const nextId = adminDailyOverridePickByDateKey[dk] ?? currentId
                                    if (!nextId) return
                                    const displayName = nextId === '__none__' ? 'No task' : (enabled.find((t) => t.id === nextId)?.name || nextId)
                                    if (confirm(`Override ${label} to "${displayName}"?`)) {
                                      void setAdminDailyOverride(dk, nextId)
                                    }
                                  }}
                                >
                                  {adminDailyOverrideSaving === dk ? '...' : 'Set override'}
                                </button>

                                {dk === todayDateKey && (todayDailyTaskRun?.revealedAtMs || todayDailyTaskRun?.completedAtMs) ? (
                                  <button
                                    className="admin-header-btn admin-header-btn--warn"
                                    type="button"
                                    disabled={adminDailyReclosingToday}
                                    onClick={() => {
                                      if (confirm('Re-close today’s task?\n\nThis will:\n• Make it “Tap to reveal” again\n• Clear completion (if it was completed)\n\nThis does NOT change the schedule task for today.')) {
                                        void adminRecloseTodayDailyTask()
                                      }
                                    }}
                                  >
                                    {adminDailyReclosingToday ? '...' : 'Re-close today'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : adminView === 'timeoff' ? (
              <div className="admin-section">
                <h3>Time Off Requests</h3>
                <p className="admin-help">Review and approve/deny employee time off requests.</p>
                
                {timeOffRequests.length === 0 ? (
                  <div className="admin-empty">No time off requests.</div>
                ) : (
                  <div className="admin-timeoff-list">
                    {/* Sort: pending first, then by date */}
                    {[...timeOffRequests]
                      .sort((a, b) => {
                        if (a.status === 'pending' && b.status !== 'pending') return -1
                        if (a.status !== 'pending' && b.status === 'pending') return 1
                        return (b.createdAt || '').localeCompare(a.createdAt || '')
                      })
                      .map((req) => (
                        <div key={req.id} className={`admin-timeoff-card admin-timeoff-status-${req.status}`}>
                          <div className="admin-timeoff-header">
                            <span className="admin-timeoff-employee">{req.employee}</span>
                            <span className={`admin-timeoff-status admin-timeoff-status-${req.status}`}>
                              {req.status === 'pending' ? '⏳ Pending' :
                               req.status === 'approved' ? '✓ Approved' : '✗ Denied'}
                            </span>
                          </div>
                          <div className="admin-timeoff-shifts">
                            <strong>Days:</strong> {formatTimeOffSummaryLine(req)}
                          </div>
                          {req.requestKind === 'shift_blocks' && req.requestedShifts.length > 0 && (
                            <TimeOffShiftDetailList requestedShifts={req.requestedShifts} />
                          )}
                          {req.reason && (
                            <div className="admin-timeoff-reason">
                              <strong>Reason:</strong> {req.reason}
                            </div>
                          )}
                          <div className="admin-timeoff-meta">
                            Requested: {new Date(req.createdAt).toLocaleDateString()}
                            {req.decision && (
                              <span> · {req.status} on {new Date(req.decision.at).toLocaleDateString()}</span>
                            )}
                          </div>
                          
                          {req.status === 'pending' && (
                            <div className="admin-timeoff-actions">
                              <button
                                className="admin-timeoff-approve-btn"
                                type="button"
                                disabled={adminTimeOffProcessing === req.id}
                                onClick={async () => {
                                  setAdminTimeOffProcessing(req.id)
                                  try {
                                    await setTimeOffRequestStatus(req.id, 'approved')
                                    // Send notification to employee with date range
                                    const dateInfo = formatTimeOffNotificationBody(req)
                                    await createNotification(req.employee, `✅ Your time off request has been APPROVED!\n\n${dateInfo}`)
                                  } catch (err) {
                                    console.error('Failed to approve:', err)
                                  }
                                  setAdminTimeOffProcessing(null)
                                }}
                              >
                                {adminTimeOffProcessing === req.id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                className="admin-timeoff-deny-btn"
                                type="button"
                                disabled={adminTimeOffProcessing === req.id}
                                onClick={async () => {
                                  setAdminTimeOffProcessing(req.id)
                                  try {
                                    await setTimeOffRequestStatus(req.id, 'denied')
                                    // Send notification to employee with date range
                                    const dateInfo = formatTimeOffNotificationBody(req)
                                    await createNotification(req.employee, `❌ Your time off request has been DENIED.\n\n${dateInfo}`)
                                  } catch (err) {
                                    console.error('Failed to deny:', err)
                                  }
                                  setAdminTimeOffProcessing(null)
                                }}
                              >
                                {adminTimeOffProcessing === req.id ? '...' : '✗ Deny'}
                              </button>
                            </div>
                          )}
                          
                          {/* Delete button always visible for admin */}
                          <div className="admin-timeoff-actions" style={{ marginTop: req.status === 'pending' ? 0 : 10 }}>
                            <button
                              className="admin-timeoff-delete-btn"
                              type="button"
                              disabled={adminTimeOffProcessing === req.id}
                              onClick={async () => {
                                if (!confirm('Delete this request?')) return
                                setAdminTimeOffProcessing(req.id)
                                try {
                                  await deleteTimeOffRequest(req.id)
                                } catch (err) {
                                  console.error('Failed to delete:', err)
                                }
                                setAdminTimeOffProcessing(null)
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : adminView === 'managementReports' ? (
              <div className="admin-section">
                <h3>Management Reports</h3>
                <p className="admin-help">Incoming staff reports from “Notify Management”.</p>

                {managementReports.length === 0 ? (
                  <div className="admin-empty">No reports yet.</div>
                ) : (
                  <div className="admin-mgmt-list">
                    {managementReports.map((r) => {
                      const status: ManagementReportStatus = r.status === 'resolved' ? 'resolved' : 'new'
                      const kindLabel =
                        r.kind === 'leak'
                          ? 'Leak'
                          : r.kind === 'broken'
                            ? 'Broken'
                            : r.kind === 'insect'
                              ? 'Insect'
                              : 'Custom'
                      const title =
                        r.kind === 'custom' && (r.customTitle || '').trim()
                          ? `${r.customTitle}`.trim()
                          : ''
                      const createdAtLabel = r.createdAt ? new Date(r.createdAt).toLocaleString() : ''
                      const isBusy = mgmtReportProcessingId === r.id

                      return (
                        <div key={r.id} className={`admin-mgmt-card admin-mgmt-status-${status}`}>
                          <div className="admin-mgmt-header">
                            <span className="admin-mgmt-by">👤 {r.createdBy || 'Staff'}</span>
                            <span className={`admin-mgmt-status-chip admin-mgmt-status-${status}`}>
                              {status === 'new' ? '⚠️ New' : '✓ Resolved'}
                            </span>
                          </div>

                          <div className="admin-mgmt-kind">
                            <span className="admin-mgmt-kind-chip">{kindLabel}</span>
                            {title ? <span className="admin-mgmt-title">• {title}</span> : null}
                          </div>

                          {r.details ? (
                            <div className="admin-mgmt-details">{r.details}</div>
                          ) : (
                            <div className="admin-mgmt-details admin-mgmt-details--empty">(no additional info)</div>
                          )}

                          <div className="admin-mgmt-meta">{createdAtLabel}</div>

                          <div className="admin-mgmt-actions">
                            <button
                              className="admin-mgmt-resolve-btn"
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setMgmtReportProcessingId(r.id)
                                try {
                                  await setManagementReportStatus(r.id, status === 'new' ? 'resolved' : 'new')
                                } catch (err) {
                                  console.error('Failed to update management report:', err)
                                  alert('Failed to update report. Try again.')
                                } finally {
                                  setMgmtReportProcessingId(null)
                                }
                              }}
                            >
                              {isBusy ? '...' : status === 'new' ? '✓ Resolve' : '↩ Reopen'}
                            </button>

                            <button
                              className="admin-mgmt-delete-btn"
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                if (!confirm('Delete this report?')) return
                                setMgmtReportProcessingId(r.id)
                                try {
                                  await deleteManagementReport(r.id)
                                } catch (err) {
                                  console.error('Failed to delete management report:', err)
                                  alert('Failed to delete report. Try again.')
                                } finally {
                                  setMgmtReportProcessingId(null)
                                }
                              }}
                            >
                              {isBusy ? '...' : '🗑 Delete'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : adminView === 'notifications' ? (
              <div className="admin-section">
                <h3>Send Notification</h3>
                <p className="admin-help">Send a notification that employees will see when selected for a task.</p>
                
                <div className="notif-send-form">
                  <div className="notif-target-row">
                    <label>To:</label>
                    <select
                      className="notif-target-select"
                      value={notifTarget}
                      onChange={(e) => setNotifTarget(e.target.value)}
                      disabled={notifSending}
                    >
                      <option value="all">All Employees</option>
                      {activeEmployees.map((emp) => (
                        <option key={emp} value={emp}>{emp}</option>
                      ))}
                    </select>
                  </div>
                  
                  <textarea
                    className="notif-message-input"
                    placeholder="Enter notification message..."
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    disabled={notifSending}
                    rows={3}
                  />
                  
                  {notifError && <div className="notif-error">{notifError}</div>}
                  
                  <button
                    className="notif-send-btn"
                    type="button"
                    disabled={notifSending || !notifMessage.trim()}
                    onClick={async () => {
                      if (!notifMessage.trim()) return
                      setNotifSending(true)
                      setNotifError(null)
                      try {
                        await createNotification(notifTarget, notifMessage.trim())
                        setNotifMessage('')
                        setNotifTarget('all')
                      } catch (err) {
                        console.error('Failed to send notification:', err)
                        setNotifError('Failed to send notification. Please try again.')
                      } finally {
                        setNotifSending(false)
                      }
                    }}
                  >
                    {notifSending ? 'Sending...' : 'Send Notification'}
                  </button>
                </div>
                
                <h3 style={{ marginTop: 24 }}>Active Notifications</h3>
                {notifications.filter(n => n.active).length === 0 ? (
                  <div className="admin-empty">No active notifications.</div>
                ) : (
                  <div className="notif-list">
                    {notifications.filter(n => n.active).map((notif) => (
                      <div key={notif.id} className="notif-card">
                        <div className="notif-card-header">
                          <span className="notif-card-target">
                            {notif.to === 'all' ? '📢 All Employees' : `👤 ${notif.to}`}
                          </span>
                          <span className="notif-card-time">
                            {new Date(notif.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="notif-card-message">{notif.message}</div>
                        {notif.to === 'all' && Object.keys(notif.dismissedBy || {}).length > 0 && (
                          <div className="notif-card-dismissed">
                            Seen by: {Object.keys(notif.dismissedBy).join(', ')}
                          </div>
                        )}
                        <div className="notif-card-actions">
                          <button
                            className="notif-deactivate-btn"
                            type="button"
                            onClick={async () => {
                              try {
                                await setNotificationActive(notif.id, false)
                              } catch (err) {
                                console.error('Failed to deactivate notification:', err)
                              }
                            }}
                          >
                            Deactivate
                          </button>
                          <button
                            className="notif-delete-btn"
                            type="button"
                            onClick={async () => {
                              if (!confirm('Delete this notification?')) return
                              try {
                                await deleteNotification(notif.id)
                              } catch (err) {
                                console.error('Failed to delete notification:', err)
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {notifications.filter(n => !n.active).length > 0 && (
                  <>
                    <h3 style={{ marginTop: 24 }}>Inactive Notifications</h3>
                    <div className="notif-list notif-list-inactive">
                      {notifications.filter(n => !n.active).slice(0, 10).map((notif) => (
                        <div key={notif.id} className="notif-card notif-card-inactive">
                          <div className="notif-card-header">
                            <span className="notif-card-target">
                              {notif.to === 'all' ? '📢 All' : `👤 ${notif.to}`}
                            </span>
                            <span className="notif-card-time">
                              {new Date(notif.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="notif-card-message">{notif.message}</div>
                          <div className="notif-card-actions">
                            <button
                              className="notif-reactivate-btn"
                              type="button"
                              onClick={async () => {
                                try {
                                  await setNotificationActive(notif.id, true)
                                } catch (err) {
                                  console.error('Failed to reactivate notification:', err)
                                }
                              }}
                            >
                              Reactivate
                            </button>
                            <button
                              className="notif-delete-btn"
                              type="button"
                              onClick={async () => {
                                if (!confirm('Delete this notification?')) return
                                try {
                                  await deleteNotification(notif.id)
                                } catch (err) {
                                  console.error('Failed to delete notification:', err)
                                }
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : adminView === 'logs' ? (
              <div className="admin-section">
                <h3>Logs</h3>
                <div className="logs-list">
                  {selectionLogs.length === 0 ? (
                    <div className="logs-empty">No logs yet.</div>
                  ) : (
                    (showAllSelectionLogs ? selectionLogs : selectionLogs.slice(0, 3)).map((log, idx) => (
                      <div key={idx} className="log-row">
                        <div className="log-top">
                          <div className="log-ts">{new Date(log.ts).toLocaleString()}</div>
                          <div className={`log-action ${log.action}`}>{log.action}</div>
                        </div>
                        <div className="log-main">
                          <div className="log-task">{log.taskName}</div>
                          <div className="log-meta">
                            {log.dateKey} • {log.window}
                            {log.byAdmin ? ' • admin' : ''}
                          </div>
                        </div>
                        <div className="log-assignees">
                          {log.assignees && log.assignees.length ? log.assignees.join(' · ') : '—'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {selectionLogs.length > 3 && (
                  <button
                    className="add-employee-btn"
                    style={{ marginTop: 10 }}
                    onClick={() => setShowAllSelectionLogs((v) => !v)}
                    aria-expanded={showAllSelectionLogs}
                  >
                    {showAllSelectionLogs ? 'Show less' : `View all (${selectionLogs.length})`}
                  </button>
                )}

                <h3 style={{ marginTop: 18 }}>Music Controls</h3>
                <div className="logs-list">
                  {musicControlLogs.length === 0 ? (
                    <div className="logs-empty">No music control logs yet.</div>
                  ) : (
                    (showAllMusicControlLogs ? musicControlLogs : musicControlLogs.slice(0, 3)).map((log, idx) => (
                      <div key={idx} className="log-row">
                        <div className="log-top">
                          <div className="log-ts">{log.ts ? new Date(log.ts).toLocaleString() : '—'}</div>
                          <div className={`log-action ${log.action}`}>{log.action}</div>
                        </div>
                        <div className="log-main">
                          <div className="log-task">{log.trackTitle || '—'}</div>
                          <div className="log-meta">{log.trackId ? `id: ${log.trackId}` : ''}</div>
                        </div>
                        <div className="log-assignees">music</div>
                      </div>
                    ))
                  )}
                </div>
                {musicControlLogs.length > 3 && (
                  <button
                    className="add-employee-btn"
                    style={{ marginTop: 10 }}
                    onClick={() => setShowAllMusicControlLogs((v) => !v)}
                    aria-expanded={showAllMusicControlLogs}
                  >
                    {showAllMusicControlLogs ? 'Show less' : `View all (${musicControlLogs.length})`}
                  </button>
                )}

                <h3 style={{ marginTop: 18 }}>Admin Login Attempts</h3>
                <div className="logs-list">
                  {adminLoginAttempts.length === 0 ? (
                    <div className="logs-empty">No login attempts yet.</div>
                  ) : (
                    (showAllAdminLoginAttempts ? adminLoginAttempts : adminLoginAttempts.slice(0, 5)).map((attempt, idx) => (
                      <div key={idx} className="log-row">
                        <div className="log-top">
                          <div className="log-ts">{attempt.ts ? new Date(attempt.ts).toLocaleString() : '—'}</div>
                          <div className={`log-action ${attempt.success ? 'selected' : 'cleared'}`}>
                            {attempt.success ? '✓ Success' : '✗ Failed'}
                          </div>
                        </div>
                        <div className="log-main">
                          <div className="log-task">{attempt.success ? 'Admin logged in' : 'Wrong PIN entered'}</div>
                          <div className="log-meta" style={{ fontSize: '10px', opacity: 0.7, wordBreak: 'break-all' }}>
                            {attempt.userAgent ? attempt.userAgent.slice(0, 80) + (attempt.userAgent.length > 80 ? '...' : '') : '—'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {adminLoginAttempts.length > 5 && (
                  <button
                    className="add-employee-btn"
                    style={{ marginTop: 10 }}
                    onClick={() => setShowAllAdminLoginAttempts((v) => !v)}
                    aria-expanded={showAllAdminLoginAttempts}
                  >
                    {showAllAdminLoginAttempts ? 'Show less' : `View all (${adminLoginAttempts.length})`}
                  </button>
                )}
              </div>
            ) : adminView === 'music' ? (
              <div className="admin-section">
                <h3>Music</h3>

                <div className="music-admin-upload">
                  <div className="music-admin-upload-row">
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/*"
                      disabled={musicUploadBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null
                        setMusicUploadFile(f)
                        setMusicUploadError(null)
                        if (f) {
                          const base = (f.name || 'New Track').replace(/\\.[^/.]+$/, '')
                          setMusicUploadTitle(base)
                        }
                      }}
                    />
                  </div>
                  <div className="music-admin-upload-row">
                    <input
                      className="music-admin-title"
                      type="text"
                      placeholder="Track title"
                      disabled={musicUploadBusy}
                      value={musicUploadTitle}
                      onChange={(e) => setMusicUploadTitle(e.target.value)}
                    />
                    <label className="music-admin-enabled">
                      <input
                        type="checkbox"
                        disabled={musicUploadBusy}
                        checked={musicUploadEnabled}
                        onChange={(e) => setMusicUploadEnabled(e.target.checked)}
                      />
                      Enabled
                    </label>
                    <button
                      className="add-employee-btn"
                      disabled={musicUploadBusy || !musicUploadFile}
                      onClick={async () => {
                        if (!musicUploadFile) return
                        setMusicUploadBusy(true)
                        setMusicUploadProgressPct(0)
                        setMusicUploadError(null)
                        try {
                          const trackId =
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (globalThis as any).crypto?.randomUUID?.() ||
                            `${Date.now()}-${Math.random().toString(16).slice(2)}`

                          const storagePath = `music/${trackId}.mp3`
                          const ref = storageRef(storage, storagePath)
                          const task = uploadBytesResumable(ref, musicUploadFile, {
                            contentType: musicUploadFile.type || 'audio/mpeg',
                          })

                          await new Promise<void>((resolve, reject) => {
                            task.on(
                              'state_changed',
                              (snap) => {
                                const pct = snap.totalBytes
                                  ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
                                  : 0
                                setMusicUploadProgressPct(pct)
                              },
                              (err) => reject(err),
                              () => resolve()
                            )
                          })

                          const title = (musicUploadTitle || musicUploadFile.name || 'Untitled').trim()
                          await upsertMusicTrack({
                            id: trackId,
                            title,
                            storagePath,
                            enabled: musicUploadEnabled,
                            originalFileName: musicUploadFile.name,
                            contentType: musicUploadFile.type || 'audio/mpeg',
                            bytes: musicUploadFile.size,
                          })

                          const nextOrder = [...orderedMusicTracks.map((t) => t.id), trackId]
                          persistMusicOrder(nextOrder)

                          setMusicUploadFile(null)
                          setMusicUploadTitle('')
                          setMusicUploadEnabled(true)
                          setMusicUploadProgressPct(0)
                        } catch (e) {
                          setMusicUploadError(String(e))
                        } finally {
                          setMusicUploadBusy(false)
                        }
                      }}
                    >
                      Upload
                    </button>
                  </div>

                  {musicUploadBusy ? (
                    <div className="music-admin-progress" aria-label="Upload progress">
                      <div className="music-admin-progress-bar">
                        <div
                          className="music-admin-progress-fill"
                          style={{ width: `${musicUploadProgressPct}%` }}
                        />
                      </div>
                      <div className="music-admin-progress-meta">{musicUploadProgressPct}%</div>
                    </div>
                  ) : null}
                  {musicUploadError ? <div className="admin-pin-error">{musicUploadError}</div> : null}
                </div>

                <div className="music-admin-help">
                  Drag to reorder (or use ↑/↓). Playlist loops all day in the header player.
                </div>

                <div className="music-admin-list">
                  {orderedMusicTracks.length === 0 ? (
                    <div className="logs-empty">No tracks yet.</div>
                  ) : (
                    orderedMusicTracks.map((t, idx) => (
                      <div
                        key={t.id}
                        className={`music-track-row ${t.enabled ? '' : 'disabled'} ${
                          draggedMusicId === t.id ? 'dragging' : ''
                        } ${dragOverMusicId === t.id ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={() => {
                          setDraggedMusicId(t.id)
                          setDragOverMusicId(t.id)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOverMusicId(t.id)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const dragged = draggedMusicId
                          if (!dragged || dragged === t.id) return
                          const ids = orderedMusicTracks.map((x) => x.id)
                          const from = ids.indexOf(dragged)
                          const to = ids.indexOf(t.id)
                          if (from < 0 || to < 0) return
                          ids.splice(to, 0, ids.splice(from, 1)[0]!)
                          persistMusicOrder(ids)
                          setDraggedMusicId(null)
                          setDragOverMusicId(null)
                        }}
                        onDragEnd={() => {
                          setDraggedMusicId(null)
                          setDragOverMusicId(null)
                        }}
                      >
                        <div className="music-track-handle" aria-hidden>
                          ☰
                        </div>
                        <input
                          className="music-track-title"
                          type="text"
                          value={musicTitleDraftById[t.id] ?? t.title}
                          onChange={(e) =>
                            setMusicTitleDraftById((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          onBlur={async () => {
                            const draft = (musicTitleDraftById[t.id] ?? t.title).trim()
                            if (!draft || draft === t.title) return
                            try {
                              await upsertMusicTrack({ ...t, title: draft })
                            } catch {
                              // ignore
                            }
                          }}
                        />
                        <label className="music-track-enabled">
                          <input
                            type="checkbox"
                            checked={t.enabled}
                            onChange={async (e) => {
                              try {
                                await upsertMusicTrack({ ...t, enabled: e.target.checked })
                              } catch {
                                // ignore
                              }
                            }}
                          />
                          Enabled
                        </label>
                        <button
                          className="music-move"
                          disabled={idx === 0}
                          onClick={() => {
                            const ids = orderedMusicTracks.map((x) => x.id)
                            if (idx <= 0) return
                            ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
                            persistMusicOrder(ids)
                          }}
                        >
                          ↑
                        </button>
                        <button
                          className="music-move"
                          disabled={idx === orderedMusicTracks.length - 1}
                          onClick={() => {
                            const ids = orderedMusicTracks.map((x) => x.id)
                            if (idx >= ids.length - 1) return
                            ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
                            persistMusicOrder(ids)
                          }}
                        >
                          ↓
                        </button>
                        <button
                          className="delete-btn"
                          onClick={async () => {
                            if (!confirm(`Delete “${t.title}”? This removes the file and metadata.`)) return
                            try {
                              await deleteObject(storageRef(storage, t.storagePath))
                            } catch {
                              // ignore (file may already be gone)
                            }
                            try {
                              await deleteMusicTrack(t.id)
                            } catch {
                              // ignore
                            }
                            persistMusicOrder(orderedMusicTracks.filter((x) => x.id !== t.id).map((x) => x.id))
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Now Playing - Remote Control */}
                <div className="now-playing-section">
                  {(() => {
                    const seenMs = (s: MusicSession) => {
                      const ts = s.lastSeenAt || s.updatedAt
                      const ms = ts ? new Date(ts).getTime() : 0
                      return Number.isFinite(ms) ? ms : 0
                    }
                    const bySeenDesc = (a: MusicSession, b: MusicSession) => seenMs(b) - seenMs(a)
                    // "Active" for admin control: recently heartbeating, even if paused.
                    const ACTIVE_WINDOW_MS = 10 * 60_000
                    const isActive = (s: MusicSession) => {
                      const ms = seenMs(s)
                      return ms > 0 && adminSessionsNowMs - ms <= ACTIVE_WINDOW_MS
                    }
                    const active = [...musicSessions].filter(isActive).sort(bySeenDesc)
                    const activeCount = active.length
                    return (
                      <h4>
                        🎵 Now Playing ({activeCount} active session{activeCount !== 1 ? 's' : ''})
                      </h4>
                    )
                  })()}
                  {(() => {
                    const playing = (s: MusicSession) =>
                      !!(s.isAudioFlowing || s.isActuallyPlaying || s.isBuffering || s.isRecovering)
                    const seenMs = (s: MusicSession) => {
                      const ts = s.lastSeenAt || s.updatedAt
                      const ms = ts ? new Date(ts).getTime() : 0
                      return Number.isFinite(ms) ? ms : 0
                    }
                    const bySeenDesc = (a: MusicSession, b: MusicSession) => seenMs(b) - seenMs(a)
                    const ACTIVE_WINDOW_MS = 10 * 60_000
                    const isActive = (s: MusicSession) => {
                      const ms = seenMs(s)
                      return ms > 0 && adminSessionsNowMs - ms <= ACTIVE_WINDOW_MS
                    }
                    const active = [...musicSessions].filter(isActive).sort(bySeenDesc)
                    const activePlaying = active.filter(playing)
                    const activeNotPlaying = active.filter((s) => !playing(s))
                    const sessionsToShow = [...activePlaying, ...activeNotPlaying].slice(0, 10)

                    if (sessionsToShow.length === 0) {
                      return <div className="logs-empty">No sessions found yet. Music will appear here when playing in a browser.</div>
                    }

                    return (
                      <div className="now-playing-list">
                        {sessionsToShow.map((session) => {
                        const formatTime = (sec: number): string => {
                          const s = Math.max(0, Math.floor(sec))
                          const h = Math.floor(s / 3600)
                          const m = Math.floor((s % 3600) / 60)
                          const ss = s % 60
                          if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
                          return `${m}:${String(ss).padStart(2, '0')}`
                        }
                        const lastSeenMsRaw = session.lastSeenAt || session.updatedAt
                        const lastSeenMs = lastSeenMsRaw ? new Date(lastSeenMsRaw).getTime() : 0
                        const ageMs = lastSeenMs ? Math.max(0, adminSessionsNowMs - lastSeenMs) : Infinity

                        // Playback status (from last reported flags). This can remain accurate even if the browser
                        // throttles background JS timers and stops heartbeating for long periods.
                        const playbackIcon = session.isRecovering
                          ? '↻'
                          : session.isBuffering
                            ? '○'
                            : session.isAudioFlowing
                              ? '●'
                              : session.isPlaying
                                ? '○'
                                : '◌'
                        const playbackText = session.isRecovering
                          ? `Recovering (${Math.max(1, session.recoveryAttempt || 1)}/3)`
                          : session.isBuffering
                            ? `Buffering ${session.bufferProgress}%`
                            : session.isAudioFlowing
                              ? 'Playing'
                              : session.isPlaying
                                ? 'Loading'
                                : 'Paused'

                        const lastSeenLabel = (() => {
                          if (!Number.isFinite(ageMs) || ageMs === Infinity) return ''
                          const s = Math.floor(ageMs / 1000)
                          if (s < 60) return `${s}s ago`
                          const m = Math.floor(s / 60)
                          if (m < 60) return `${m}m ago`
                          const h = Math.floor(m / 60)
                          return `${h}h ago`
                        })()

                        const heartbeatText = (() => {
                          if (!Number.isFinite(ageMs) || ageMs === Infinity) return 'No heartbeat'
                          if (ageMs < 30_000) return 'Live'
                          if (ageMs < 5 * 60_000) return `Delayed (${lastSeenLabel})`
                          return `Backgrounded? (${lastSeenLabel})`
                        })()
                        return (
                          <div key={session.sessionId} className="now-playing-session">
                            <div className="now-playing-header">
                              <span className="now-playing-device">
                                {session.deviceInfo.includes('iPhone') || session.deviceInfo.includes('Android Phone') ? '📱' : 
                                 session.deviceInfo.includes('iPad') || session.deviceInfo.includes('Tablet') ? '📱' : '💻'}{' '}
                                {session.deviceInfo}
                              </span>
                              <span
                                className={`now-playing-status ${session.isActuallyPlaying ? 'playing' : session.isBuffering ? 'buffering' : ''}`}
                                title={
                                  session.lastSeenAt
                                    ? `Last seen: ${new Date(session.lastSeenAt).toLocaleString()}`
                                    : undefined
                                }
                              >
                                {playbackIcon} {playbackText} · {heartbeatText}
                              </span>
                            </div>
                            <div className="now-playing-track">
                              {session.currentTrackTitle || 'No track'}
                            </div>
                            <div className="now-playing-progress">
                              <input
                                type="range"
                                className="now-playing-scrubber"
                                min={0}
                                max={session.durationSec || 100}
                                value={session.positionSec}
                                onChange={(e) => {
                                  const seekTo = Number(e.target.value)
                                  sendCommandWithFeedback(session.sessionId, 'seek', { positionSec: seekTo })
                                }}
                              />
                              <div className="now-playing-times">
                                <span>{formatTime(session.positionSec ?? 0)}</span>
                                <span>{formatTime(session.durationSec ?? 0)}</span>
                              </div>
                            </div>
                            <div className="now-playing-controls">
                              <button 
                                className="now-playing-btn"
                                disabled={commandFeedback[session.sessionId]?.status === 'sending'}
                                onClick={() => sendCommandWithFeedback(session.sessionId, 'prev')}
                              >
                                ⏮
                              </button>
                              <button 
                                className="now-playing-btn now-playing-btn-primary"
                                disabled={commandFeedback[session.sessionId]?.status === 'sending'}
                                onClick={() => sendCommandWithFeedback(session.sessionId, session.isAudioFlowing ? 'pause' : 'play')}
                              >
                                {commandFeedback[session.sessionId]?.status === 'sending' ? '…' : session.isAudioFlowing ? '⏸' : '▶'}
                              </button>
                              <button 
                                className="now-playing-btn"
                                disabled={commandFeedback[session.sessionId]?.status === 'sending'}
                                onClick={() => sendCommandWithFeedback(session.sessionId, 'next')}
                              >
                                ⏭
                              </button>
                            </div>
                            {/* Command feedback indicator */}
                            {commandFeedback[session.sessionId]?.status === 'sent' && (
                              <div className="now-playing-feedback sent">✓ Command sent</div>
                            )}
                            {commandFeedback[session.sessionId]?.status === 'error' && (
                              <div className="now-playing-feedback error">
                                ✗ Command failed
                                {commandFeedback[session.sessionId]?.error ? `: ${commandFeedback[session.sessionId]!.error}` : ''}
                              </div>
                            )}
                            {/* Show warning if player needs user gesture */}
                            {session.lastCommandResult === 'needs_gesture' && (
                              <div className="now-playing-feedback warning">⚠ Player needs user tap to resume</div>
                            )}
                            {/* Playback diagnostics (best-effort from client). Helps explain "random stops". */}
                            {session.lastPlaybackIssueAt && (
                              <div className="now-playing-feedback warning" title={session.lastPlaybackIssueDetail || undefined}>
                                ⚠ Last playback issue: {session.lastPlaybackIssueKind || 'unknown'}
                                {session.lastPlaybackIssueDetail
                                  ? ` — ${session.lastPlaybackIssueDetail.length > 140 ? `${session.lastPlaybackIssueDetail.slice(0, 140)}…` : session.lastPlaybackIssueDetail}`
                                  : ''}
                              </div>
                            )}
                          </div>
                        )
                        })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            ) : adminView === 'applications' ? (
              <div className="admin-section">
                <h3>Job Applications</h3>
                <p className="admin-help">
                  View and manage applications submitted through the Bonfire hiring portal.
                </p>
                
                {applications.length === 0 ? (
                  <div className="admin-empty">No applications yet.</div>
                ) : (
                  <div className="applications-list">
                    {/* Status filter */}
                    <div className="applications-stats">
                      <span className="app-stat new">{applications.filter(a => a.status === 'new').length} new</span>
                      <span className="app-stat reviewed">{applications.filter(a => a.status === 'reviewed').length} reviewed</span>
                      <span className="app-stat contacted">{applications.filter(a => a.status === 'contacted').length} contacted</span>
                      <span className="app-stat hired">{applications.filter(a => a.status === 'hired').length} hired</span>
                      <span className="app-stat rejected">{applications.filter(a => a.status === 'rejected').length} rejected</span>
                    </div>
                    
                    {applications.map((app) => {
                      const isExpanded = expandedApplicationId === app.id
                      return (
                        <div key={app.id} className={`application-card ${app.status}`}>
                          <div 
                            className="application-header"
                            onClick={() => setExpandedApplicationId(isExpanded ? null : app.id)}
                          >
                            <div className="application-main">
                              <span className="application-name">{app.name}</span>
                              <span className={`application-status-badge ${app.status}`}>{app.status}</span>
                            </div>
                            <div className="application-meta">
                              <span className="application-date">
                                {new Date(app.createdAt).toLocaleDateString()}
                              </span>
                              <span className="application-expand">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="application-details">
                              <div className="application-field">
                                <label>Email</label>
                                <a href={`mailto:${app.email}`}>{app.email}</a>
                              </div>
                              <div className="application-field">
                                <label>Phone</label>
                                <a href={`tel:${app.phone}`}>{app.phone}</a>
                              </div>
                              <div className="application-field">
                                <label>Birth Date</label>
                                <span>{app.birthDate}</span>
                              </div>
                              <div className="application-field">
                                <label>Address</label>
                                <span>{app.address}</span>
                              </div>
                              <div className="application-field">
                                <label>Availability</label>
                                <div className="availability-chips">
                                  {app.availability.map((shift) => (
                                    <span key={shift} className="availability-chip">
                                      {SHIFT_LABELS[shift as ShiftKey] || shift}
                                    </span>
                                  ))}
                                  {app.availabilityOther && (
                                    <span className="availability-other">Other: {app.availabilityOther}</span>
                                  )}
                                </div>
                              </div>
                              <div className="application-field">
                                <label>Employment History</label>
                                <pre className="employment-history">{app.employmentHistory}</pre>
                              </div>
                              <div className="application-field">
                                <label>Felony Conviction</label>
                                <span className={app.felonyConviction ? 'felony-yes' : 'felony-no'}>
                                  {app.felonyConviction ? 'Yes' : 'No'}
                                </span>
                              </div>
                              
                              {/* Notes */}
                              <div className="application-field">
                                <label>Admin Notes</label>
                                <textarea
                                  className="application-notes"
                                  value={applicationNotesDraft[app.id] ?? app.notes ?? ''}
                                  onChange={(e) => setApplicationNotesDraft(prev => ({ ...prev, [app.id]: e.target.value }))}
                                  placeholder="Add notes about this applicant..."
                                  rows={2}
                                />
                                {(applicationNotesDraft[app.id] !== undefined && applicationNotesDraft[app.id] !== (app.notes ?? '')) && (
                                  <button
                                    className="save-notes-btn"
                                    onClick={async () => {
                                      await updateApplicationNotes(app.id, applicationNotesDraft[app.id] || '')
                                      setApplicationNotesDraft(prev => {
                                        const next = { ...prev }
                                        delete next[app.id]
                                        return next
                                      })
                                    }}
                                  >
                                    Save Notes
                                  </button>
                                )}
                              </div>
                              
                              {/* Status Actions */}
                              <div className="application-actions">
                                <span className="actions-label">Set Status:</span>
                                {(['new', 'reviewed', 'contacted', 'hired', 'rejected'] as ApplicationStatus[]).map((status) => (
                                  <button
                                    key={status}
                                    className={`status-btn ${status} ${app.status === status ? 'active' : ''}`}
                                    onClick={() => updateApplicationStatus(app.id, status)}
                                    disabled={app.status === status}
                                  >
                                    {status}
                                  </button>
                                ))}
                              </div>
                              
                              {/* Delete */}
                              <button
                                className="delete-application-btn"
                                onClick={() => {
                                  if (confirm(`Delete application from ${app.name}? This cannot be undone.`)) {
                                    deleteApplication(app.id)
                                    setExpandedApplicationId(null)
                                  }
                                }}
                              >
                                Delete Application
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : adminView === 'demo' ? (
              <div className="admin-section">
                <h3>Demo Tools</h3>
                <p className="admin-help">
                  Demo Day is a sandboxed date for testing task completion UX/animations. Demo Day does not write to Firestore and does not affect leaderboards.
                </p>
                
                <div className="demo-buttons">
                  <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.9 }}>
                    Demo Day: <strong>{demoDayKey ? demoDayKey : 'OFF'}</strong>
                    {demoDayKey ? <span style={{ marginLeft: 8 }}>(local only)</span> : null}
                  </div>

                  <button
                    className="add-employee-btn"
                    style={{ marginBottom: 12 }}
                    onClick={startRandomDemoDay}
                  >
                    🧪 Start Demo Day (Random)
                  </button>

                  {demoDayKey ? (
                    <button
                      className="add-employee-btn"
                      style={{ marginBottom: 12, background: '#666' }}
                      onClick={exitDemoDay}
                    >
                      ✕ Exit Demo Day
                    </button>
                  ) : null}

                  {demoDayKey ? (
                    <button className="add-employee-btn" style={{ marginBottom: 12 }} onClick={reshuffleDemoDailyTask}>
                      🎲 New Demo Daily Task
                    </button>
                  ) : null}

                  <button
                    className="add-employee-btn"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      // Start a 10-second countdown demo
                      setDemoCountdownEndMs(Date.now() + 10_000)
                      setCountdownNowMs(Date.now())
                      setShowAdminPanel(false)
                    }}
                  >
                    ⏱️ Start 10-Second Countdown
                  </button>
                  
                  <button
                    className="add-employee-btn"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      // Start a 30-second countdown demo
                      setDemoCountdownEndMs(Date.now() + 30_000)
                      setCountdownNowMs(Date.now())
                      setShowAdminPanel(false)
                    }}
                  >
                    ⏱️ Start 30-Second Countdown
                  </button>
                  
                  <button
                    className="add-employee-btn"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      // Trigger celebration directly
                      if (breakCelebrationTimeoutRef.current) {
                        window.clearTimeout(breakCelebrationTimeoutRef.current)
                      }
                      setBreakCelebration({ show: true, employee: 'Demo Employee' })
                      breakCelebrationTimeoutRef.current = window.setTimeout(() => {
                        setBreakCelebration(null)
                      }, 5000)
                      setShowAdminPanel(false)
                    }}
                  >
                    🎉 Show Celebration Overlay
                  </button>
                  
                  <button
                    className="add-employee-btn"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      // Start a 10-second shift change countdown demo
                      setDemoShiftChangeEndMs(Date.now() + 10_000)
                      setCountdownNowMs(Date.now())
                      setShowAdminPanel(false)
                    }}
                  >
                    ⏰ Start 10-Second Shift Change
                  </button>
                  
                  {(demoCountdownEndMs !== null || demoShiftChangeEndMs !== null) && (
                    <button
                      className="add-employee-btn"
                      style={{ background: '#666' }}
                      onClick={() => {
                        setDemoCountdownEndMs(null)
                        setDemoShiftChangeEndMs(null)
                      }}
                    >
                      ✕ Cancel Demo Countdown
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Admin nested modal: Requirements editor (UI only; reuses existing save/reset logic) */}
          {adminEditingReqTaskId ? (
            <div
              className="admin-modal-backdrop"
              onClick={(e) => {
                e.stopPropagation()
                setAdminEditingReqTaskId(null)
                setAdminEditingReqText('')
                setAdminEditingReqError(null)
              }}
            >
              <div className="admin-modal-sheet" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const taskId = adminEditingReqTaskId
                  const t = allTasks.find((x) => x.id === taskId)
                  const reqOverride = (taskOverrides?.overrides || {})[taskId]?.requirements
                  const hasReqOverride = Array.isArray(reqOverride) && reqOverride.length > 0
                  const nonEmptyLineCount = adminEditingReqText
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean).length

                  return (
                    <>
                      <div className="admin-modal-header">
                        <div className="admin-modal-title">
                          <h3>Edit requirements</h3>
                          <div className="admin-modal-sub">
                            <div>
                              <strong>{t ? `${t.icon} ${t.name}` : taskId}</strong>
                            </div>
                            <div>Task id: {taskId}</div>
                            <div>
                              <span className={`admin-chip ${hasReqOverride ? 'admin-chip--overridden' : ''}`}>
                                {hasReqOverride ? 'Overridden' : 'Default'}
                              </span>
                              <span style={{ marginLeft: 10 }}>One requirement per line • {nonEmptyLineCount} items</span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="close-button"
                          type="button"
                          aria-label="Close requirements editor"
                          onClick={() => {
                            setAdminEditingReqTaskId(null)
                            setAdminEditingReqText('')
                            setAdminEditingReqError(null)
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="admin-modal-body">
                        {adminEditingReqError ? <div className="admin-empty">{adminEditingReqError}</div> : null}
                        <label className="admin-notif-label">
                          Requirements (one per line)
                          <span className="admin-modal-sub">
                            Tip: use <code>**bold**</code> for emphasis.
                          </span>
                          <textarea
                            className="admin-notif-textarea"
                            value={adminEditingReqText}
                            onChange={(e) => setAdminEditingReqText(e.target.value)}
                            placeholder={'Example:\nWipe down shelf\nRefill lids\nConfirm stock is fronted'}
                          />
                        </label>
                      </div>

                      <div className="admin-modal-actions">
                        {hasReqOverride ? (
                          <button
                            className="admin-header-btn admin-header-btn--warn"
                            type="button"
                            onClick={() => {
                              if (!t) return
                              if (confirm(`Reset requirements for “${t.name}” to default?`)) {
                                void resetRequirementsToDefault(taskId)
                                setAdminEditingReqTaskId(null)
                                setAdminEditingReqText('')
                                setAdminEditingReqError(null)
                              }
                            }}
                          >
                            Reset to default
                          </button>
                        ) : null}

                        <button
                          className="admin-header-btn admin-header-btn--warn"
                          type="button"
                          onClick={() => {
                            setAdminEditingReqTaskId(null)
                            setAdminEditingReqText('')
                            setAdminEditingReqError(null)
                          }}
                        >
                          Cancel
                        </button>
                        <button className="admin-notif-send" type="button" onClick={() => void saveEditedRequirements()}>
                          Save requirements
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}

          {/* Admin nested modal: Name editor (UI only; reuses existing save/reset logic) */}
          {adminEditingNameTaskId ? (
            <div
              className="admin-modal-backdrop"
              onClick={(e) => {
                e.stopPropagation()
                setAdminEditingNameTaskId(null)
                setAdminEditingNameText('')
                setAdminEditingNameError(null)
              }}
            >
              <div className="admin-modal-sheet" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const taskId = adminEditingNameTaskId
                  const t = allTasks.find((x) => x.id === taskId)
                  const nameOverride = (taskOverrides?.overrides || {})[taskId]?.name
                  const hasNameOverride = typeof nameOverride === 'string' && nameOverride.trim().length > 0
                  const previewName = adminEditingNameText.trim()

                  return (
                    <>
                      <div className="admin-modal-header">
                        <div className="admin-modal-title">
                          <h3>Edit name</h3>
                          <div className="admin-modal-sub">
                            <div>
                              <strong>{t ? `${t.icon} ${t.name}` : taskId}</strong>
                            </div>
                            <div>Task id: {taskId}</div>
                            <div>
                              <span className={`admin-chip ${hasNameOverride ? 'admin-chip--overridden' : ''}`}>
                                {hasNameOverride ? 'Overridden' : 'Default'}
                              </span>
                              <span style={{ marginLeft: 10 }}>
                                Preview: <strong>{previewName || '—'}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="close-button"
                          type="button"
                          aria-label="Close name editor"
                          onClick={() => {
                            setAdminEditingNameTaskId(null)
                            setAdminEditingNameText('')
                            setAdminEditingNameError(null)
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="admin-modal-body">
                        {adminEditingNameError ? <div className="admin-empty">{adminEditingNameError}</div> : null}
                        <label className="admin-notif-label">
                          Name
                          <input
                            className="admin-notif-input"
                            type="text"
                            value={adminEditingNameText}
                            onChange={(e) => setAdminEditingNameText(e.target.value)}
                            placeholder="e.g. Restock To-Go Lids"
                          />
                        </label>
                      </div>

                      <div className="admin-modal-actions">
                        {hasNameOverride ? (
                          <button
                            className="admin-header-btn admin-header-btn--warn"
                            type="button"
                            onClick={() => {
                              if (!t) return
                              if (confirm(`Reset name for “${t.name}” to default?`)) {
                                void resetNameToDefault(taskId)
                                setAdminEditingNameTaskId(null)
                                setAdminEditingNameText('')
                                setAdminEditingNameError(null)
                              }
                            }}
                          >
                            Reset to default
                          </button>
                        ) : null}

                        <button
                          className="admin-header-btn admin-header-btn--warn"
                          type="button"
                          onClick={() => {
                            setAdminEditingNameTaskId(null)
                            setAdminEditingNameText('')
                            setAdminEditingNameError(null)
                          }}
                        >
                          Cancel
                        </button>
                        <button className="admin-notif-send" type="button" onClick={() => void saveEditedName()}>
                          Save name
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}

          {/* Admin nested modal: Windows editor (UI only; uses TaskOverrides) */}
          {adminEditingWindowsTaskId ? (
            <div
              className="admin-modal-backdrop"
              onClick={(e) => {
                e.stopPropagation()
                setAdminEditingWindowsTaskId(null)
                setAdminEditingWindows({ '11': false, '17': false, '21': false })
                setAdminEditingWindowsEffectiveDateKey('')
                setAdminEditingWindowsError(null)
              }}
            >
              <div className="admin-modal-sheet" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const taskId = adminEditingWindowsTaskId
                  const t = allTasks.find((x) => x.id === taskId)
                  const ov = (taskOverrides?.overrides || {})[taskId] as any
                  const hasWindowsOverride = Array.isArray(ov?.windows)
                  const todayKeyAtRender = formatDateKey(startOfDay(new Date()))

                  const windowLabel = (w: WindowKey) => (w === '11' ? '11AM' : w === '17' ? '5PM' : '9PM')
                  const selectedWindows = (['11', '17', '21'] as WindowKey[]).filter((w) => !!adminEditingWindows[w])
                  const preview = selectedWindows.length ? selectedWindows.map(windowLabel).join(', ') : '— (removed)'

                  return (
                    <>
                      <div className="admin-modal-header">
                        <div className="admin-modal-title">
                          <h3>Edit windows</h3>
                          <div className="admin-modal-sub">
                            <div>
                              <strong>{t ? `${t.icon} ${t.name}` : taskId}</strong>
                            </div>
                            <div>Task id: {taskId}</div>
                            <div>
                              <span className={`admin-chip ${hasWindowsOverride ? 'admin-chip--overridden' : ''}`}>
                                {hasWindowsOverride ? 'Overridden' : 'Default'}
                              </span>
                              <span style={{ marginLeft: 10 }}>
                                Preview: <strong>{preview}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="close-button"
                          type="button"
                          aria-label="Close windows editor"
                          onClick={() => {
                            setAdminEditingWindowsTaskId(null)
                            setAdminEditingWindows({ '11': false, '17': false, '21': false })
                            setAdminEditingWindowsEffectiveDateKey('')
                            setAdminEditingWindowsError(null)
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="admin-modal-body">
                        {adminEditingWindowsError ? <div className="admin-empty">{adminEditingWindowsError}</div> : null}
                        <div className="admin-notif-label">
                          Windows
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                            {(['11', '17', '21'] as WindowKey[]).map((w) => (
                              <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={!!adminEditingWindows[w]}
                                  onChange={(e) => setAdminEditingWindows({ ...adminEditingWindows, [w]: e.target.checked })}
                                />
                                {windowLabel(w)}
                              </label>
                            ))}
                          </div>
                          <div className="admin-modal-sub" style={{ marginTop: 8 }}>
                            Deselect all windows to remove the task from all timeframes (starting at the effective date).
                          </div>
                        </div>

                        <label className="admin-notif-label" style={{ marginTop: 14 }}>
                          Effective date
                          <input
                            className="admin-notif-input"
                            type="date"
                            min={todayKeyAtRender}
                            value={adminEditingWindowsEffectiveDateKey || todayKeyAtRender}
                            onChange={(e) => setAdminEditingWindowsEffectiveDateKey(e.target.value)}
                          />
                          <div className="admin-modal-sub">
                            If you choose today, the change applies starting now (so already-closed windows stay unchanged).
                          </div>
                        </label>
                      </div>

                      <div className="admin-modal-actions">
                        {hasWindowsOverride ? (
                          <button
                            className="admin-header-btn admin-header-btn--warn"
                            type="button"
                            onClick={() => {
                              if (!t) return
                              if (confirm(`Reset windows for “${t.name}” to default?`)) {
                                void resetWindowsToDefault(taskId)
                                setAdminEditingWindowsTaskId(null)
                                setAdminEditingWindows({ '11': false, '17': false, '21': false })
                                setAdminEditingWindowsEffectiveDateKey('')
                                setAdminEditingWindowsError(null)
                              }
                            }}
                          >
                            Reset to default
                          </button>
                        ) : null}

                        <button
                          className="admin-header-btn admin-header-btn--warn"
                          type="button"
                          onClick={() => {
                            setAdminEditingWindowsTaskId(null)
                            setAdminEditingWindows({ '11': false, '17': false, '21': false })
                            setAdminEditingWindowsEffectiveDateKey('')
                            setAdminEditingWindowsError(null)
                          }}
                        >
                          Cancel
                        </button>
                        <button className="admin-notif-send" type="button" onClick={() => void saveEditedWindows()}>
                          Save windows
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}

          {/* Admin nested modal: Weight editor (UI only; uses TaskOverrides) */}
          {adminEditingWeightTaskId ? (
            <div
              className="admin-modal-backdrop"
              onClick={(e) => {
                e.stopPropagation()
                setAdminEditingWeightTaskId(null)
                setAdminEditingWeight('1')
                setAdminEditingWeightEffectiveDateKey('')
                setAdminEditingWeightError(null)
              }}
            >
              <div className="admin-modal-sheet" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const taskId = adminEditingWeightTaskId
                  const t = allTasks.find((x) => x.id === taskId)
                  const ov = (taskOverrides?.overrides || {})[taskId] as any
                  const hasWeightOverride = typeof ov?.weight === 'number'
                  const todayKeyAtRender = formatDateKey(startOfDay(new Date()))
                  const preview = adminEditingWeight.trim()

                  return (
                    <>
                      <div className="admin-modal-header">
                        <div className="admin-modal-title">
                          <h3>Edit weight</h3>
                          <div className="admin-modal-sub">
                            <div>
                              <strong>{t ? `${t.icon} ${t.name}` : taskId}</strong>
                            </div>
                            <div>Task id: {taskId}</div>
                            <div>
                              <span className={`admin-chip ${hasWeightOverride ? 'admin-chip--overridden' : ''}`}>
                                {hasWeightOverride ? 'Overridden' : 'Default'}
                              </span>
                              <span style={{ marginLeft: 10 }}>
                                Preview: <strong>{preview || '—'}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="close-button"
                          type="button"
                          aria-label="Close weight editor"
                          onClick={() => {
                            setAdminEditingWeightTaskId(null)
                            setAdminEditingWeight('1')
                            setAdminEditingWeightEffectiveDateKey('')
                            setAdminEditingWeightError(null)
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="admin-modal-body">
                        {adminEditingWeightError ? <div className="admin-empty">{adminEditingWeightError}</div> : null}
                        <label className="admin-notif-label">
                          Weight (number ≥ 0)
                          <input
                            className="admin-notif-input"
                            inputMode="decimal"
                            value={adminEditingWeight}
                            onChange={(e) => setAdminEditingWeight(e.target.value)}
                            placeholder="1"
                          />
                          <div className="admin-modal-sub">Set to 0 to make the task worth 0 points (still trackable).</div>
                        </label>

                        <label className="admin-notif-label" style={{ marginTop: 14 }}>
                          Effective date
                          <input
                            className="admin-notif-input"
                            type="date"
                            min={todayKeyAtRender}
                            value={adminEditingWeightEffectiveDateKey || todayKeyAtRender}
                            onChange={(e) => setAdminEditingWeightEffectiveDateKey(e.target.value)}
                          />
                          <div className="admin-modal-sub">
                            If you choose today, the change applies starting now (so already-closed windows stay unchanged).
                          </div>
                        </label>
                      </div>

                      <div className="admin-modal-actions">
                        {hasWeightOverride ? (
                          <button
                            className="admin-header-btn admin-header-btn--warn"
                            type="button"
                            onClick={() => {
                              if (!t) return
                              if (confirm(`Reset weight for “${t.name}” to default?`)) {
                                void resetWeightToDefault(taskId)
                                setAdminEditingWeightTaskId(null)
                                setAdminEditingWeight('1')
                                setAdminEditingWeightEffectiveDateKey('')
                                setAdminEditingWeightError(null)
                              }
                            }}
                          >
                            Reset to default
                          </button>
                        ) : null}

                        <button
                          className="admin-header-btn admin-header-btn--warn"
                          type="button"
                          onClick={() => {
                            setAdminEditingWeightTaskId(null)
                            setAdminEditingWeight('1')
                            setAdminEditingWeightEffectiveDateKey('')
                            setAdminEditingWeightError(null)
                          }}
                        >
                          Cancel
                        </button>
                        <button className="admin-notif-send" type="button" onClick={() => void saveEditedWeight()}>
                          Save weight
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showLeaderboard && (
        <div
          className="selector-backdrop"
          onTouchStart={beginTap}
          onTouchMove={moveTap}
          onTouchEnd={(e) =>
            endTap(() => {
              setShowLeaderboard(false)
            }, e)
          }
          onClick={() => {
            if (shouldIgnoreClick()) return
            setShowLeaderboard(false)
          }}
        >
          <div
            className={`leaderboard-panel lb-v2${uiVariant === 'v3' ? ' lb-v2-v3' : ''}`}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="lb-v2-header">
              <div className="lb-v2-header-left">
                <div className="lb-v2-title">
                  <span className="lb-v2-trophy">🏆</span>
                  Leaderboard
                </div>
                <div className="lb-v2-subtitle">
                  {leaderboardView === 'month' ? (
                    <div className="lb-month-nav" role="group" aria-label="Leaderboard month">
                      <button
                        className="lb-v2-nav-btn"
                        type="button"
                        aria-label="Previous month"
                        onClick={() => setLeaderboardMonth((prev) => startOfMonth(addMonths(prev, -1)))}
                      >
                        ←
                      </button>
                      <span className="lb-v2-period">{leaderboardMonthTitle}</span>
                      <button
                        className="lb-v2-nav-btn"
                        type="button"
                        aria-label="Next month"
                        disabled={isSameMonth(startOfMonth(leaderboardMonth), startOfMonth(now))}
                        onClick={() => setLeaderboardMonth((prev) => startOfMonth(addMonths(prev, 1)))}
                      >
                        →
                      </button>
                    </div>
                  ) : (
                    <span className="lb-v2-period">Today's Rankings</span>
                  )}
                </div>
              </div>
              <div className="lb-v2-header-right">
                <div className="lb-v2-tabs" role="group" aria-label="Leaderboard views">
                  <button
                    className={`lb-v2-tab ${leaderboardView === 'month' ? 'active' : ''}`}
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) => endTap(() => setLeaderboardView('month'), e)}
                    onClick={() => { if (shouldIgnoreClick()) return; setLeaderboardView('month') }}
                  >
                    Monthly
                  </button>
                  <button
                    className={`lb-v2-tab ${leaderboardView === 'today' ? 'active' : ''}`}
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) => endTap(() => setLeaderboardView('today'), e)}
                    onClick={() => { if (shouldIgnoreClick()) return; setLeaderboardView('today') }}
                  >
                    Today
                  </button>
                </div>
                <button
                  className="lb-v2-close"
                  onTouchStart={beginTap}
                  onTouchMove={moveTap}
                  onTouchEnd={(e) => endTap(() => setShowLeaderboard(false), e)}
                  onClick={() => { if (shouldIgnoreClick()) return; setShowLeaderboard(false) }}
                  aria-label="Close leaderboard"
                >
                  ✕
                </button>
              </div>
            </div>

            {(() => {
              const rows = leaderboardRowsActive
              const maxScore = rows.length > 0 ? Math.max(...rows.map(r => r.score), 1) : 100
              
              // All players with their ranks for podium display
              const allPodiumPlayers: Array<{ player: LeaderRow; rank: number }> = rows.map((r, idx) => ({
                player: r,
                rank: leaderboardRanks[idx] ?? idx + 1
              }))
              
              const totalShifts = rows.reduce((sum, r) => sum + r.shiftsPlayed, 0)

              const setCardRef = (name: string) => (el: HTMLDivElement | null): void => {
                lbCardElByNameRef.current[name] = el
              }

              const accentColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']
              const getAccentColor = (name: string) => {
                let h = 0
                for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
                return accentColors[Math.abs(h) % accentColors.length]
              }

              return (
                <div className="lb-v2-content">
                  {/* Stats Summary */}
                  {leaderboardView === 'month' && (
                    <div className="lb-v2-stats">
                      <div className="lb-v2-stat">
                        <span className="lb-v2-stat-value">{rows.length}</span>
                        <span className="lb-v2-stat-label">Players</span>
                      </div>
                      <div className="lb-v2-stat">
                        <span className="lb-v2-stat-value">{totalShifts}</span>
                        <span className="lb-v2-stat-label">Total Shifts</span>
                      </div>
                      <div className="lb-v2-stat">
                        <span className="lb-v2-stat-value">{maxScore}</span>
                        <span className="lb-v2-stat-label">Top Score</span>
                      </div>
                      <div className="lb-v2-stat lb-v2-stat-updated">
                        <span className="lb-v2-stat-label">
                          Updated {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {lbMonthLoading ? ' • Loading…' : ''}
                          {lbMonthLoadError ? ` • ${lbMonthLoadError}` : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Podium - All players */}
                  {allPodiumPlayers.length > 0 && (
                    <div className="lb-v2-podium">
                      {allPodiumPlayers.map(({ player, rank }, idx) => {
                        const podiumLabels = displayLabelsByEmployeeForLeaderboard[player.name] ?? []
                        const isTied = leaderboardRankCounts[rank] > 1
                        
                        // Determine order class and styling based on rank
                        const orderClass = rank === 1 ? 'lb-v2-podium-1' : rank === 2 ? 'lb-v2-podium-2' : rank === 3 ? 'lb-v2-podium-3' : `lb-v2-podium-${rank}`
                        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                        
                        // Bar height calculation: 100%, 70%, 50%, then graded for ranks 4+
                        const barHeight = rank === 1 ? '100%' 
                          : rank === 2 ? '70%' 
                          : rank === 3 ? '50%'
                          : `${Math.max(20, 40 - (rank - 4) * 5)}%`
                        
                        const barClass =
                          uiVariant === 'v3'
                            ? 'lb-v2-podium-bar lb-v2-podium-bar-v3'
                            : rank === 1
                              ? 'lb-v2-podium-bar lb-v2-podium-bar-gold'
                              : 'lb-v2-podium-bar'

                        const avatarClass =
                          uiVariant === 'v3'
                            ? `lb-v2-podium-avatar lb-v2-podium-avatar-v3${rank === 1 ? ' lb-v2-podium-avatar-v3--first' : ''}`
                            : rank === 1
                              ? 'lb-v2-podium-avatar lb-v2-podium-avatar-gold lb-v2-podium-avatar-medal'
                              : rank <= 3
                                ? 'lb-v2-podium-avatar lb-v2-podium-avatar-medal'
                                : 'lb-v2-podium-avatar lb-v2-podium-avatar-rank'

                        const delay = `${idx * 0.1}s`
                        
                        return (
                          <div 
                            key={player.name} 
                            className={`lb-v2-podium-slot ${orderClass} ${leaderboardView === 'month' ? 'lb-v2-clickable' : ''}`} 
                            ref={setCardRef(player.name)} 
                            style={{ '--delay': delay, ...(leaderboardView === 'month' ? { cursor: 'pointer' } : {}) } as React.CSSProperties}
                            {...(leaderboardView === 'month' ? {
                              onTouchStart: beginTap,
                              onTouchMove: moveTap,
                              onTouchEnd: (e: React.TouchEvent) => endTap(() => {
                                setCalculationEmployee(player.name)
                                setShowCalculationModal(true)
                              }, e),
                              onClick: () => {
                                if (shouldIgnoreClick()) return
                                setCalculationEmployee(player.name)
                                setShowCalculationModal(true)
                              }
                            } : {})}
                          >
                            {rank === 1 && <div className="lb-v2-podium-crown">👑</div>}
                            {uiVariant === 'v3' ? (
                              <div className={avatarClass}>
                                <span className="lb-v2-podium-avatar-initials">
                                  {leaderboardDisplayInitials(player.name)}
                                </span>
                              </div>
                            ) : (
                              <div className={avatarClass} style={{ background: getAccentColor(player.name) }}>
                                {medal !== null ? medal : (
                                  <>
                                    {rank}
                                    {isTied && <span className="lb-v2-tied-badge-small">=</span>}
                                  </>
                                )}
                              </div>
                            )}
                            <div className="lb-v2-podium-name">{player.name}{isTied && <span className="lb-v2-tied-badge">=</span>}</div>
                            <div className="lb-v2-podium-score">{lbScoreDisplayByName[player.name] ?? player.score} pts</div>
                            {leaderboardView === 'month' && (
                              <div className="lb-v2-podium-shifts">{player.shiftsPlayed} shifts</div>
                            )}
                            {uiVariant !== 'v3' && podiumLabels.length > 0 && (
                              <div className="lb-v2-podium-labels">
                                {podiumLabels.slice(0, 2).map(label => (
                                  <span key={label.id} className="lb-v2-label lb-v2-podium-label" title={label.description}>
                                    {label.emoji}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className={barClass} style={{ height: barHeight }} />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* How points work button */}
                  <button
                    className="lb-v2-info-btn"
                    type="button"
                    onTouchStart={beginTap}
                    onTouchMove={moveTap}
                    onTouchEnd={(e) => endTap(() => setShowPointsExplanation(true), e)}
                    onClick={() => { if (shouldIgnoreClick()) return; setShowPointsExplanation(true) }}
                  >
                    <span className="lb-v2-info-icon">ℹ️</span>
                    How are points counted?
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {showCalculationModal && calculationEmployee && (
        <div
          className="modal-backdrop calculation-modal-backdrop"
          onTouchStart={(e) => {
            e.stopPropagation()
            lastTouchTsRef.current = Date.now()
          }}
          onClick={() => {
            if (!shouldIgnoreClick()) {
              setShowCalculationModal(false)
              setCalculationEmployee(null)
            }
          }}
        >
          <div
            className="modal-sheet calculation-modal-sheet"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">📊 {calculationEmployee}'s Monthly Score</div>
              <button
                className="close-button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => {
                  setShowCalculationModal(false)
                  setCalculationEmployee(null)
                }, e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowCalculationModal(false)
                  setCalculationEmployee(null)
                }}
              >
                ✕
              </button>
            </div>
            <div className="calculation-modal-content">
              {(() => {
                const history = shiftHistoryByEmployee[calculationEmployee]
                if (!history || history.shiftCount === 0) {
                  return (
                    <div className="calculation-empty">
                      <span className="calculation-empty-icon">📭</span>
                      <p>{calculationEmployee} has no shifts recorded this month</p>
                    </div>
                  )
                }

                return (
                  <>
                    {/* Summary Stats */}
                    <div className="calculation-summary">
                      <div className="calculation-summary-stat">
                        <span className="calculation-summary-value">{history.averageScore}</span>
                        <span className="calculation-summary-label">Avg Score</span>
                      </div>
                      <div className="calculation-summary-stat">
                        <span className="calculation-summary-value">{history.shiftCount}</span>
                        <span className="calculation-summary-label">Shifts</span>
                      </div>
                      <div className="calculation-summary-stat">
                        <span className="calculation-summary-value">{history.totalScore}</span>
                        <span className="calculation-summary-label">Total Pts</span>
                      </div>
                    </div>

                    {/* Shift List */}
                    <div className="calculation-shift-list">
                      {history.shifts.map((entry, idx) => {
                        // Post-cutover the "Day" leaderboard score is 5PM-only — flag it in the
                        // employee's history modal so the number isn't confused with old blends.
                        const dayUsesPmOnly =
                          new Date(`${entry.dateKey}T00:00:00`).getTime() >=
                          SEPARATE_DAY_AM_PM_LEADERBOARD_EFFECTIVE_MS
                        const dayLabel = dayUsesPmOnly ? '☀️ Day (5PM)' : '☀️ Day'
                        return (
                        <div key={`${entry.dateKey}-${entry.shift}-${idx}`} className="calculation-shift-entry">
                          <div className="calculation-shift-date">{entry.displayDate}</div>
                          <div className={`calculation-shift-type ${entry.shift}`}>
                            {entry.shift === 'day' ? dayLabel : '🌙 Night'}
                          </div>
                          <div className="calculation-shift-score-container">
                            <div 
                              className={`calculation-shift-bar ${entry.score >= 80 ? 'high' : entry.score >= 60 ? 'medium' : 'low'}`}
                              style={{ width: `${entry.score}%` }}
                            />
                            <span className="calculation-shift-score">{entry.score} pts</span>
                          </div>
                        </div>
                        )
                      })}
                    </div>

                    {/* Calculation Footer */}
                    <div className="calculation-footer">
                      {history.totalScore} pts ÷ {history.shiftCount} shifts = <strong>{history.averageScore} avg</strong>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {showPointsExplanation && (
        <div
          className="modal-backdrop points-explanation-backdrop"
          onTouchStart={(e) => {
            e.stopPropagation()
            lastTouchTsRef.current = Date.now()
          }}
          onClick={() => {
            if (!shouldIgnoreClick()) setShowPointsExplanation(false)
          }}
        >
          <div
            className="modal-sheet points-explanation-modal"
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">📊 How Points Work</div>
              <button
                className="close-button"
                onTouchStart={beginTap}
                onTouchMove={moveTap}
                onTouchEnd={(e) => endTap(() => setShowPointsExplanation(false), e)}
                onClick={() => {
                  if (shouldIgnoreClick()) return
                  setShowPointsExplanation(false)
                }}
              >
                ✕
              </button>
            </div>
            <div className="points-explanation-content">
              <div className="points-section">
                <h3>Daily Score (0–100 pts)</h3>
                <ul>
                  <li>Complete tasks on time to earn points</li>
                  <li>Tasks marked with ⭐ are worth <strong>more points</strong></li>
                  <li>If you split a task with someone, points are divided equally</li>
                  <li><strong>Late completions don't count</strong> (unless forgiven)</li>
                </ul>
              </div>
              <div className="points-section">
                <h3>Day Shift</h3>
                <p>
                  Your <strong>5PM</strong> task completions form your day-shift leaderboard score.
                  Your <strong>11AM</strong> score is shown separately at the top of the screen and does
                  not change your leaderboard total.
                </p>
              </div>
              <div className="points-section">
                <h3>Night Shift</h3>
                <p>Score is based entirely on your 9PM task completions.</p>
              </div>
              <div className="points-section">
                <h3>Full Day</h3>
                <p>If you work both shifts, your day and night scores are <strong>averaged</strong>.</p>
              </div>
              <div className="points-section">
                <h3>Monthly Score</h3>
                <p>Your monthly score is the <strong>average of all your shift scores</strong> over the past 30 days.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {musicReminderEnabled && musicReminderActive && (
        <div
          className={`music-reminder-overlay ${musicReminderFlashOn ? 'flashOn' : 'flashOff'}`}
          role="alert"
          aria-live="assertive"
          aria-label="Music reminder"
        >
          <div className="music-reminder-card">
            <div className="music-reminder-text">PLEASE PLAY MUSIC :)</div>
            <button
              className="music-reminder-dismiss"
              onTouchStart={beginTap}
              onTouchMove={moveTap}
              onTouchEnd={(e) => endTap(() => playMusicFromReminder(), e)}
              onClick={() => {
                if (shouldIgnoreClick()) return
                playMusicFromReminder()
              }}
            >
              Play Music
            </button>
          </div>
        </div>
      )}

      {showForceRefreshPrompt && (
        <div className="force-refresh-overlay">
          <div className="force-refresh-modal">
            <div className="force-refresh-icon">🔄</div>
            <h2>Updating…</h2>
            <p>
              An admin triggered an update. Refreshing in{' '}
              <strong>{forceRefreshSecondsLeft}</strong>
              …
            </p>
          </div>
        </div>
      )}

      {/* Break celebration overlay */}
      {breakCelebration?.show && (
        <div className="break-celebration-overlay" role="alert" aria-live="polite">
          <div className="break-celebration-content">
            <div className="break-celebration-emoji">☕</div>
            <div className="break-celebration-message">
              Don't forget to take your break :)
            </div>
            <div className="break-celebration-name">{breakCelebration.employee}</div>
          </div>
        </div>
      )}

      {screensaverEnabled ? (
        <Screensaver
          visible={screensaverOpen}
          onDismiss={() => dismissScreensaver({ absorbGhostTap: true })}
          timeOfDay={timeOfDay}
          shiftProgress={screensaverShiftProgress}
          progressGradient={progressGradient}
          suggestedTask={screensaverSuggestedTask}
          greetingHeadline={screensaverGreetingProps.headline}
          greetingQuote={screensaverGreetingProps.quote}
          greetingQuoteShowAiBadge={screensaverGreetingProps.showAiBadge}
          greetingAttributionBelowQuote={screensaverGreetingProps.attributionBelowQuote}
          countdown={
            screensaverBetaDemoOverride?.kind === 'countdown'
              ? screensaverBetaDemoOverride.value
              : screensaverBetaDemoOverride?.kind === 'quote'
                ? null
                : screensaverCountdown
          }
        />
      ) : null}

      {screensaverDismissShield ? (
        <div
          className="screensaver-dismiss-shield"
          aria-hidden
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerUp={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        />
      ) : null}

      {dailyTaskFloatingNotificationEl}

      {showGoodMorning &&
        createPortal(
          <div
            className="good-morning-overlay"
            role="button"
            tabIndex={0}
            aria-label="Good morning. Tap to continue."
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                dismissGoodMorning()
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerUp={(e) => {
              if (!e.isPrimary) return
              e.stopPropagation()
              e.preventDefault()
              const el = e.currentTarget as HTMLElement
              try {
                el.releasePointerCapture(e.pointerId)
              } catch {
                /* already released */
              }
              dismissGoodMorning()
            }}
            onPointerCancel={(e) => {
              try {
                ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
              } catch {
                /* ignore */
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            <div className="good-morning-overlay-inner">
              <h1 className="good-morning-title">Good Morning!</h1>
              <div className="good-morning-time">
                {new Date(goodMorningOverlayClock).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
              <div className="good-morning-date">
                {new Date(goodMorningOverlayClock).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className="good-morning-brand-row" aria-hidden="true">
                <img className="good-morning-brand-logo" src={traqLogoUrl} alt="" draggable={false} />
              </div>
              <p className="good-morning-tap-hint">Tap anywhere to continue</p>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

export default App