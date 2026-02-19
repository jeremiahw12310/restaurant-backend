import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions/v1'
import nodemailer from 'nodemailer'

admin.initializeApp()

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

// ─────────────────────────────────────────────────────────────────────────────
// Job Application Email Notification
// ─────────────────────────────────────────────────────────────────────────────

type ApplicationDoc = {
  name: string
  email: string
  birthDate: string
  address: string
  phone: string
  availability: string[]
  availabilityOther?: string
  employmentHistory: string
  felonyConviction: boolean
  status: string
  createdAt: string
  createdAtMs: number
  notes?: string

  // function-internal markers
  managerEmailSentAt?: string
  managerEmailClaimedAt?: string
  managerEmailLastError?: string
}

const SHIFT_LABELS: Record<string, string> = {
  mon_lunch: 'Monday 11am-5pm',
  tue_lunch: 'Tuesday 11am-5pm',
  wed_lunch: 'Wednesday 11am-5pm',
  thu_lunch: 'Thursday 11am-5pm',
  fri_lunch: 'Friday 11am-5pm',
  sat_lunch: 'Saturday 11am-5pm',
  sun_lunch: 'Sunday 11am-5pm',
  mon_dinner: 'Monday 5pm-9pm',
  tue_dinner: 'Tuesday 5pm-9pm',
  wed_dinner: 'Wednesday 5pm-9pm',
  thu_dinner: 'Thursday 5pm-9pm',
  fri_dinner: 'Friday 5pm-10pm',
  sat_dinner: 'Saturday 5pm-10pm',
  sun_dinner: 'Sunday 5pm-10pm',
}

const buildApplicationEmailText = (id: string, app: ApplicationDoc) => {
  const availability = (app.availability || [])
    .map((s) => SHIFT_LABELS[s] || s)
    .join(', ')

  return [
    `🔥 New Job Application`,
    ``,
    `Name: ${app.name || '(unknown)'}`,
    `Email: ${app.email || ''}`,
    `Phone: ${app.phone || ''}`,
    `Birth Date: ${app.birthDate || ''}`,
    `Address: ${app.address || ''}`,
    ``,
    `Availability:`,
    availability || '(none selected)',
    app.availabilityOther ? `Other: ${app.availabilityOther}` : '',
    ``,
    `Employment History:`,
    app.employmentHistory || '(none provided)',
    ``,
    `Felony Conviction: ${app.felonyConviction ? 'Yes' : 'No'}`,
    ``,
    `Submitted: ${app.createdAt || ''}`,
    `Application ID: ${id}`,
  ].filter(Boolean).join('\n')
}

const buildApplicationEmailHtml = (id: string, app: ApplicationDoc) => {
  const esc = (x: string) =>
    String(x || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const availability = (app.availability || [])
    .map((s) => `<span style="display: inline-block; background: #e5e7eb; padding: 2px 8px; border-radius: 4px; margin: 2px; font-size: 13px;">${esc(SHIFT_LABELS[s] || s)}</span>`)
    .join(' ')

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 600px;">
      <div style="background: linear-gradient(135deg, #d11a2a 0%, #a0121f 100%); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 24px;">🔥 New Job Application</h2>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 12px 12px;">
        <div style="margin-bottom: 16px;">
          <div style="font-size: 20px; font-weight: 700; color: #111;">${esc(app.name || 'Unknown')}</div>
          <div style="color: #666; font-size: 14px;">Submitted ${esc(app.createdAt || '')}</div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 120px; vertical-align: top;"><b>Email</b></td>
            <td style="padding: 8px 0;"><a href="mailto:${esc(app.email)}" style="color: #d11a2a;">${esc(app.email)}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><b>Phone</b></td>
            <td style="padding: 8px 0;"><a href="tel:${esc(app.phone)}" style="color: #d11a2a;">${esc(app.phone)}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><b>Birth Date</b></td>
            <td style="padding: 8px 0;">${esc(app.birthDate)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><b>Address</b></td>
            <td style="padding: 8px 0;">${esc(app.address)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><b>Availability</b></td>
            <td style="padding: 8px 0;">${availability || '<em>None selected</em>'}${app.availabilityOther ? `<br><em style="color: #666;">Other: ${esc(app.availabilityOther)}</em>` : ''}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><b>Employment</b></td>
            <td style="padding: 8px 0; white-space: pre-wrap;">${esc(app.employmentHistory || '(none provided)')}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><b>Felony</b></td>
            <td style="padding: 8px 0; font-weight: 700; color: ${app.felonyConviction ? '#dc2626' : '#059669'};">${app.felonyConviction ? 'Yes' : 'No'}</td>
          </tr>
        </table>
        
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #999; font-size: 12px;">
          Application ID: ${esc(id)}
        </div>
      </div>
    </div>
  `.trim()
}

/**
 * Firestore onCreate trigger for new job applications.
 */
export const emailManagerOnApplicationSubmitted = functions
  .runWith({ secrets: ['GMAIL_USER', 'GMAIL_APP_PASSWORD'] })
  .region('us-central1')
  .firestore.document('applications/{applicationId}')
  .onCreate(async (snap, context) => {
    const applicationId = context.params.applicationId as string
    const app = snap.data() as ApplicationDoc
    if (!app || typeof app.name !== 'string') return

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
      const subject = `🔥 Bonfire Application: ${app.name || 'New Applicant'}`
      await transporter.sendMail({
        from: `Bonfire Hermitage TN <${gmailUser}>`,
        to: MANAGER_EMAIL,
        subject,
        text: buildApplicationEmailText(applicationId, app),
        html: buildApplicationEmailHtml(applicationId, app),
      })
      console.log(`Application email sent for application ${applicationId}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`Failed to send application email for application ${applicationId}: ${msg}`)
      throw e
    }
  })

