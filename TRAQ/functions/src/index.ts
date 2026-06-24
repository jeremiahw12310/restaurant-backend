import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions/v1'
import nodemailer from 'nodemailer'
import { validateQuoteContext } from './ai/quoteTypes'
import { generateShiftQuote } from './ai/generateShiftQuote'
import { validateWindowCompleteMessageContext } from './ai/windowCompleteTypes'
import { generateWindowCompleteMessage } from './ai/generateWindowCompleteMessage'
import { generateDailyTaskSchedule } from './ai/generateDailyTaskSchedule'
import { validateTaskSplitRequestPayload } from './ai/taskSplitTypes'
import { generateTaskSplitChoice, pickFinalVariant } from './ai/generateTaskSplitChoice'

admin.initializeApp()

// Allow `undefined` fields to be silently dropped on Firestore writes.
// Several Spotify endpoints return optional fields (`display_name`, `email`)
// that may be missing, and we'd rather just omit them than refuse the write.
try {
  admin.firestore().settings({ ignoreUndefinedProperties: true })
} catch {
  // settings() can only be called before the first use; ignore second-call errors in tests.
}

// ─────────────────────────────────────────────────────────────────────────────
// Spotify Web Playback integration (house-account streaming for the iPad).
// We expose Firestore-trigger functions (mirroring the AI request pattern) so
// the client never sees the long-lived refresh_token and so we don't depend on
// allUsers permissions for callable/HTTP functions.
// ─────────────────────────────────────────────────────────────────────────────
export { processSpotifyOAuthRequest } from './spotify/handleOAuthCodeExchange'
export { processSpotifyTokenRequest } from './spotify/handleTokenRequest'
export { processSpotifySearchRequest } from './spotify/handleSearchRequest'
export { processSpotifyPlaybackCommand } from './spotify/handlePlaybackCommand'
export { processSpotifyDisconnect } from './spotify/handleDisconnect'

// Manager destination (hard-coded per your request)
const MANAGER_EMAIL = 'jeremiahw12310@gmail.com'

type RequestedShift = { dateKey: string; shift: 'lunch' | 'dinner' }
type TimeOffRequestDoc = {
  employee: string
  status: 'pending' | 'approved' | 'denied'
  reason: string
  createdAt: string
  updatedAt: string
  requestedShifts: RequestedShift[]
  requestKind: 'shift_blocks' | 'date_range'
  dateRange?: { startDateKey: string; endDateKey: string }

  // function-internal markers (not used by client)
  managerEmailSentAt?: string
  managerEmailClaimedAt?: string
  managerEmailLastError?: string
}

const uniqueSorted = (arr: string[]) => Array.from(new Set(arr)).sort()

const formatShiftLabel = (s: RequestedShift['shift']) => (s === 'lunch' ? 'Lunch' : 'Dinner')

const formatRequestedDatesSummary = (requestedShifts: RequestedShift[]) => {
  const days = uniqueSorted((requestedShifts || []).map((s) => s.dateKey).filter(Boolean))
  return days.length ? `${days.join(', ')} (${days.length} day${days.length === 1 ? '' : 's'})` : '(none)'
}

const buildEmailText = (id: string, req: TimeOffRequestDoc) => {
  const dates = formatRequestedDatesSummary(req.requestedShifts || [])
  const kind = req.requestKind === 'date_range' ? 'Date range' : 'Shift blocks'
  const range = req.dateRange ? `${req.dateRange.startDateKey} → ${req.dateRange.endDateKey}` : ''
  const reason = (req.reason || '').trim()

  return [
    `New time off request`,
    ``,
    `Employee: ${req.employee || '(unknown)'}`,
    `Kind: ${kind}${range ? ` (${range})` : ''}`,
    `Days: ${dates}`,
    `Status: ${req.status || 'pending'}`,
    `Created: ${req.createdAt || ''}`,
    ``,
    `Reason: ${reason || '(none provided)'}`,
    ``,
    `Request ID: ${id}`,
  ].join('\n')
}

const buildEmailHtml = (id: string, req: TimeOffRequestDoc) => {
  const dates = uniqueSorted((req.requestedShifts || []).map((s) => s.dateKey).filter(Boolean))
  const perShift = (req.requestedShifts || []).slice(0, 40).map((s) => `${s.dateKey} • ${formatShiftLabel(s.shift)}`)
  const kind = req.requestKind === 'date_range' ? 'Date range' : 'Shift blocks'
  const range = req.dateRange ? `${req.dateRange.startDateKey} → ${req.dateRange.endDateKey}` : ''
  const reason = (req.reason || '').trim()

  const esc = (x: string) =>
    String(x || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2 style="margin: 0 0 12px;">New time off request</h2>
      <div style="margin: 0 0 12px;">
        <div><b>Employee:</b> ${esc(req.employee || '(unknown)')}</div>
        <div><b>Kind:</b> ${esc(kind)}${range ? ` (${esc(range)})` : ''}</div>
        <div><b>Days:</b> ${esc(dates.join(', '))}${dates.length ? ` (${dates.length})` : ''}</div>
        <div><b>Status:</b> ${esc(req.status || 'pending')}</div>
        <div><b>Created:</b> ${esc(req.createdAt || '')}</div>
      </div>
      <div style="margin: 0 0 12px;">
        <div style="margin-bottom: 6px;"><b>Reason:</b></div>
        <div style="white-space: pre-wrap; border: 1px solid #ddd; padding: 10px; border-radius: 8px;">
          ${esc(reason || '(none provided)')}
        </div>
      </div>
      ${
        perShift.length
          ? `<details>
               <summary style="cursor: pointer;">Requested shifts (${perShift.length}${(req.requestedShifts || []).length > perShift.length ? '+' : ''})</summary>
               <ul>${perShift.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
             </details>`
          : ''
      }
      <div style="margin-top: 14px; color: #666; font-size: 12px;">
        Request ID: ${esc(id)}
      </div>
    </div>
  `.trim()
}

/**
 * Firestore onCreate trigger for new time off requests.
 *
 * Note: We intentionally deploy this as a **1st-gen** function (firebase-functions v1 API)
 * to avoid Eventarc trigger creation issues that can happen with Firestore multi-region
 * databases (e.g. `nam5`).
 */
export const emailManagerOnTimeOffRequestCreated = functions
  .runWith({ secrets: ['GMAIL_USER', 'GMAIL_APP_PASSWORD'] })
  .region('us-central1')
  .firestore.document('timeOffRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const requestId = context.params.requestId as string
    const req = snap.data() as TimeOffRequestDoc
    if (!req || typeof req.employee !== 'string') return

    const gmailUser = process.env.GMAIL_USER || ''
    const gmailPass = process.env.GMAIL_APP_PASSWORD || ''
    if (!gmailUser || !gmailPass) {
      console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD secret in function runtime.')
      return
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    })

    try {
      const subject = `TRAQ: Time off request from ${req.employee || 'Unknown'}`
      await transporter.sendMail({
        from: `Bonfire Hermitage TN <${gmailUser}>`,
        to: MANAGER_EMAIL,
        subject,
        text: buildEmailText(requestId, req),
        html: buildEmailHtml(requestId, req),
      })
      console.log(`Time off email sent for request ${requestId}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`Failed to send time off email for request ${requestId}: ${msg}`)
      throw e
    }
  })

// Job application manager emails: client-side EmailJS from the apply page (same as time off / stock).

// ─────────────────────────────────────────────────────────────────────────────
// AI-generated shift quotes (Firestore trigger — works around org IAM policy
// that blocks allUsers on callable/HTTP functions)
// ─────────────────────────────────────────────────────────────────────────────

export const processShiftQuoteRequest = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], maxInstances: 5 })
  .region('us-central1')
  .firestore.document('aiQuoteRequests/{requestId}')
  .onCreate(async (snap) => {
    const data = snap.data()
    const ctx = validateQuoteContext(data)
    if (!ctx) {
      await snap.ref.update({ status: 'error', error: 'Invalid context' })
      return
    }

    const key = process.env.OPENAI_API_KEY || ''
    if (!key) {
      await snap.ref.update({ status: 'error', error: 'API key not configured' })
      return
    }

    try {
      const result = await generateShiftQuote(ctx, key)
      await snap.ref.update({
        status: 'complete',
        greeting: result.greeting,
        quote: result.quote,
        source: result.source,
        expiresAtMs: result.expiresAtMs,
        presentation: result.presentation,
        speakerName: result.speakerName ?? '',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`processShiftQuoteRequest failed: ${msg}`)
      await snap.ref.update({ status: 'error', error: msg })
    }
  })

// ─────────────────────────────────────────────────────────────────────────────
// AI window-complete celebration copy (Firestore trigger, same pattern as quotes)
// ─────────────────────────────────────────────────────────────────────────────

export const processWindowCompleteMessageRequest = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], maxInstances: 5 })
  .region('us-central1')
  .firestore.document('aiWindowCompleteRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Record<string, unknown> | undefined
    if (!raw) {
      await snap.ref.update({ status: 'error', error: 'Empty document' })
      return
    }

    const ctx = validateWindowCompleteMessageContext({
      deploymentChannel: raw.deploymentChannel,
      timeOfDay: raw.timeOfDay,
      windowKey: raw.windowKey,
      windowLabel: raw.windowLabel,
      layout: raw.layout,
      players: raw.players,
    })
    if (!ctx) {
      await snap.ref.update({ status: 'error', error: 'Invalid window-complete context' })
      return
    }

    const key = process.env.OPENAI_API_KEY || ''
    if (!key) {
      await snap.ref.update({ status: 'error', error: 'OpenAI API key not configured' })
      return
    }

    try {
      const result = await generateWindowCompleteMessage(ctx, key)
      await snap.ref.update({
        status: 'complete',
        message: result.message,
        source: result.source,
        expiresAtMs: result.expiresAtMs,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`processWindowCompleteMessageRequest failed: ${msg}`)
      await snap.ref.update({ status: 'error', error: msg })
    }
  })

// ─────────────────────────────────────────────────────────────────────────────
// AI daily task week scheduling (weekly quota day picks; client validates + merges)
// ─────────────────────────────────────────────────────────────────────────────

export const processDailyTaskScheduleRequest = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], maxInstances: 5 })
  .region('us-central1')
  .firestore.document('aiDailyTaskScheduleRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Record<string, unknown> | undefined
    if (!raw || raw.status !== 'pending') {
      await snap.ref.update({ status: 'error', error: 'Invalid or missing pending request' })
      return
    }
    if (!raw.payload || typeof raw.payload !== 'object') {
      await snap.ref.update({ status: 'error', error: 'Missing payload' })
      return
    }

    const key = process.env.OPENAI_API_KEY || ''
    if (!key) {
      await snap.ref.update({ status: 'error', error: 'OpenAI API key not configured' })
      return
    }

    try {
      const systemPrompt =
        typeof raw.systemPrompt === 'string' && raw.systemPrompt.trim()
          ? raw.systemPrompt.trim()
          : undefined
      const resultJson = await generateDailyTaskSchedule(key, raw.payload, systemPrompt)
      await snap.ref.update({
        status: 'complete',
        resultJson,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`processDailyTaskScheduleRequest failed: ${msg}`)
      await snap.ref.update({ status: 'error', error: msg })
    }
  })

// ─────────────────────────────────────────────────────────────────────────────
// AI fair task split (dice): client sends score-balanced variants; model picks one
// ─────────────────────────────────────────────────────────────────────────────

export const processTaskSplitRequest = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], maxInstances: 5 })
  .region('us-central1')
  .firestore.document('aiTaskSplitRequests/{requestId}')
  .onCreate(async (snap) => {
    const raw = snap.data() as Record<string, unknown> | undefined
    if (!raw || raw.status !== 'pending') {
      await snap.ref.update({ status: 'error', error: 'Invalid or missing pending request' })
      return
    }
    if (!raw.payload || typeof raw.payload !== 'object') {
      await snap.ref.update({ status: 'error', error: 'Missing payload' })
      return
    }

    const payload = validateTaskSplitRequestPayload(raw.payload)
    if (!payload) {
      await snap.ref.update({ status: 'error', error: 'Invalid task split payload' })
      return
    }

    const key = process.env.OPENAI_API_KEY || ''

    try {
      const choice = key
        ? await generateTaskSplitChoice(payload, key)
        : { choiceIndex: 0, rationale: '', source: 'fallback' as const }
      const finalVariant = pickFinalVariant(payload, choice)
      await snap.ref.update({
        status: 'complete',
        choiceIndex: choice.choiceIndex,
        rationale: choice.rationale,
        source: choice.source,
        finalAssignment: finalVariant.assignment,
        finalMask: finalVariant.mask,
        finalIceMode: finalVariant.iceMode,
        finalIceSplitAssignment: finalVariant.iceSplitAssignment,
        finalSharedTaskIds: finalVariant.sharedTaskIds || [],
        projectedScoreFloatA: finalVariant.projectedScoreFloatA,
        projectedScoreFloatB: finalVariant.projectedScoreFloatB,
        scoreDiff: finalVariant.scoreDiff,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`processTaskSplitRequest failed: ${msg}`)
      const v0 = pickFinalVariant(payload, { choiceIndex: 0, rationale: '', source: 'fallback' })
      await snap.ref.update({
        status: 'complete',
        choiceIndex: 0,
        rationale: '',
        source: 'fallback',
        finalAssignment: v0.assignment,
        finalMask: v0.mask,
        finalIceMode: v0.iceMode,
        finalIceSplitAssignment: v0.iceSplitAssignment,
        finalSharedTaskIds: v0.sharedTaskIds || [],
        projectedScoreFloatA: v0.projectedScoreFloatA,
        projectedScoreFloatB: v0.projectedScoreFloatB,
        scoreDiff: v0.scoreDiff,
        error: msg,
      })
    }
  })
