import { useEffect, useMemo, useState } from 'react'
import './ApplyAnalyticsPage.css'
import {
  subscribeToApplyEvents,
  APPLY_QUESTION_LABELS,
  APPLY_QUESTION_ORDER,
  APPLY_CLICK_SOURCE_LABELS,
  type ApplyEvent,
  type ApplyEventType,
  type ApplyQuestionKey,
  type ApplyClickSource,
} from '../../services/applyEvents'

type RangePreset = 'today' | '7d' | '30d' | 'all'

const RANGE_OPTIONS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
]

function sinceMsFor(range: RangePreset): number {
  if (range === 'all') return 0
  const now = new Date()
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return start.getTime()
  }
  const days = range === '7d' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—'
  const v = (numerator / denominator) * 100
  return `${v >= 99.95 ? '100' : v.toFixed(1)}%`
}

function relativeTime(tsMs: number): string {
  const diff = Date.now() - tsMs
  if (diff < 60_000) return 'just now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const EVENT_LABELS: Record<ApplyEventType, string> = {
  page_opened: 'Page opened',
  apply_clicked: 'Apply clicked',
  form_started: 'Form started',
  field_engaged: 'Field engaged',
  apply_tab_hidden: 'Tab hidden',
  abandoned: 'Exited',
  submitted: 'Submitted',
}

const EVENT_BADGE_CLASS: Record<ApplyEventType, string> = {
  page_opened: 'apply-event-badge apply-event-badge-page',
  apply_clicked: 'apply-event-badge apply-event-badge-click',
  form_started: 'apply-event-badge apply-event-badge-started',
  field_engaged: 'apply-event-badge apply-event-badge-engaged',
  apply_tab_hidden: 'apply-event-badge apply-event-badge-tabhidden',
  abandoned: 'apply-event-badge apply-event-badge-abandoned',
  submitted: 'apply-event-badge apply-event-badge-submitted',
}

/** Ordered checkpoints from "least engaged" to "submitted"; used for the funnel-by-session view. */
type Checkpoint =
  | 'page_opened'
  | 'apply_clicked'
  | 'form_started'
  | 'field_engaged'
  | 'tab_hidden'
  | 'abandoned'
  | 'submitted'

const CHECKPOINT_LABELS: Record<Checkpoint, string> = {
  page_opened: 'Opened only',
  apply_clicked: 'Clicked apply',
  form_started: 'Started form',
  field_engaged: 'Engaged a field',
  tab_hidden: 'Backgrounded tab',
  abandoned: 'Exited',
  submitted: 'Submitted',
}

type SessionSummary = {
  sessionId: string
  events: ApplyEvent[]
  firstTsMs: number
  lastTsMs: number
  /** Highest checkpoint the session reached (priority-based, not chronological). */
  lastCheckpoint: Checkpoint | 'unknown'
  /** Best-known last question the user was on (abandoned/tab_hidden meta or last field_engaged). */
  farthestQuestion?: ApplyQuestionKey
  /** True if the session emitted an `abandoned` event (real exit). */
  exited: boolean
  /** True if the session emitted an `apply_tab_hidden` event. */
  backgroundedTab: boolean
  /** True if the session submitted. */
  submitted: boolean
}

/** Treat questions later in `APPLY_QUESTION_ORDER` as "farther" reached. */
function farthestOf(
  a: ApplyQuestionKey | undefined,
  b: ApplyQuestionKey | undefined
): ApplyQuestionKey | undefined {
  if (!a) return b
  if (!b) return a
  return APPLY_QUESTION_ORDER.indexOf(a) >= APPLY_QUESTION_ORDER.indexOf(b) ? a : b
}

export function ApplyAnalyticsPage() {
  const [range, setRange] = useState<RangePreset>('7d')
  const [events, setEvents] = useState<ApplyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const since = sinceMsFor(range)
    let cancelled = false
    let unsub: (() => void) | undefined
    try {
      unsub = subscribeToApplyEvents(
        since,
        (list) => {
          if (cancelled) return
          setError(null)
          setEvents(list)
          setLoading(false)
        },
        (msg) => {
          if (cancelled) return
          setError(msg)
          setLoading(false)
        }
      )
    } catch (err) {
      console.error('Failed to subscribe to apply events:', err)
      setError('Failed to load events. Check connection and try again.')
      setLoading(false)
    }
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [range])

  const counts = useMemo(() => {
    const c: Record<ApplyEventType, number> = {
      page_opened: 0,
      apply_clicked: 0,
      form_started: 0,
      field_engaged: 0,
      apply_tab_hidden: 0,
      abandoned: 0,
      submitted: 0,
    }
    for (const e of events) {
      if (e.type in c) c[e.type] += 1
    }
    return c
  }, [events])

  /** Group events by sessionId so we can reason about each visitor's journey. */
  const sessionSummaries = useMemo<SessionSummary[]>(() => {
    const byId = new Map<string, ApplyEvent[]>()
    for (const e of events) {
      if (!e.sessionId) continue
      let list = byId.get(e.sessionId)
      if (!list) {
        list = []
        byId.set(e.sessionId, list)
      }
      list.push(e)
    }

    const result: SessionSummary[] = []
    for (const [sessionId, list] of byId.entries()) {
      list.sort((a, b) => a.tsMs - b.tsMs)
      const has = (t: ApplyEventType) => list.some((e) => e.type === t)
      const submitted = has('submitted')
      const exited = has('abandoned')
      const backgroundedTab = has('apply_tab_hidden')

      // Farthest field reached: prefer the explicit lastQuestion on abandoned/tab_hidden,
      // else the deepest `field_engaged` we saw. Field "depth" is form order.
      let farthest: ApplyQuestionKey | undefined
      for (const e of list) {
        if (e.type === 'field_engaged' && e.meta?.lastQuestion) {
          farthest = farthestOf(farthest, e.meta.lastQuestion as ApplyQuestionKey)
        }
      }
      const lastAbandoned = [...list].reverse().find((e) => e.type === 'abandoned')
      const lastTabHidden = [...list].reverse().find((e) => e.type === 'apply_tab_hidden')
      farthest = farthestOf(
        farthestOf(farthest, lastAbandoned?.meta?.lastQuestion as ApplyQuestionKey | undefined),
        lastTabHidden?.meta?.lastQuestion as ApplyQuestionKey | undefined
      )

      // Priority order matches funnel progression — "submitted" wins, then real exits, etc.
      let lastCheckpoint: SessionSummary['lastCheckpoint'] = 'unknown'
      if (submitted) lastCheckpoint = 'submitted'
      else if (exited) lastCheckpoint = 'abandoned'
      else if (backgroundedTab) lastCheckpoint = 'tab_hidden'
      else if (has('field_engaged')) lastCheckpoint = 'field_engaged'
      else if (has('form_started')) lastCheckpoint = 'form_started'
      else if (has('apply_clicked')) lastCheckpoint = 'apply_clicked'
      else if (has('page_opened')) lastCheckpoint = 'page_opened'

      result.push({
        sessionId,
        events: list,
        firstTsMs: list[0]?.tsMs ?? 0,
        lastTsMs: list[list.length - 1]?.tsMs ?? 0,
        lastCheckpoint,
        farthestQuestion: farthest,
        exited,
        backgroundedTab,
        submitted,
      })
    }
    result.sort((a, b) => b.lastTsMs - a.lastTsMs)
    return result
  }, [events])

  /** Unique-session funnel counts (a single session shouldn't inflate `apply_clicked`, etc.). */
  const sessionCounts = useMemo(() => {
    let pageOpened = 0
    let applyClicked = 0
    let formStarted = 0
    let fieldEngaged = 0
    let tabHidden = 0
    let abandoned = 0
    let submitted = 0
    for (const s of sessionSummaries) {
      const has = (t: ApplyEventType) => s.events.some((e) => e.type === t)
      if (has('page_opened')) pageOpened += 1
      if (has('apply_clicked')) applyClicked += 1
      if (has('form_started')) formStarted += 1
      if (has('field_engaged')) fieldEngaged += 1
      if (s.backgroundedTab) tabHidden += 1
      if (s.exited) abandoned += 1
      if (s.submitted) submitted += 1
    }
    return { pageOpened, applyClicked, formStarted, fieldEngaged, tabHidden, abandoned, submitted }
  }, [sessionSummaries])

  /** Sessions grouped by their highest reached checkpoint — answers "where did they stop?". */
  const checkpointBreakdown = useMemo(() => {
    const c: Record<Checkpoint | 'unknown', number> = {
      page_opened: 0,
      apply_clicked: 0,
      form_started: 0,
      field_engaged: 0,
      tab_hidden: 0,
      abandoned: 0,
      submitted: 0,
      unknown: 0,
    }
    for (const s of sessionSummaries) c[s.lastCheckpoint] += 1
    return c
  }, [sessionSummaries])

  /** Drop-off v2: non-submitted sessions, bucketed by farthest field reached (or "before any field"). */
  const dropoff = useMemo(() => {
    const tally = new Map<ApplyQuestionKey | 'no_field', number>()
    let nonSubmittedSessions = 0
    for (const s of sessionSummaries) {
      if (s.submitted) continue
      // Only count sessions that actually engaged with the apply intent (page_opened + something more)
      // — otherwise pure bot-like page_opened sessions dominate.
      if (s.lastCheckpoint === 'page_opened' || s.lastCheckpoint === 'unknown') continue
      nonSubmittedSessions += 1
      const key = s.farthestQuestion ?? 'no_field'
      tally.set(key, (tally.get(key) ?? 0) + 1)
    }
    const rows = Array.from(tally.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => {
        if (a.key === 'no_field') return 1
        if (b.key === 'no_field') return -1
        return APPLY_QUESTION_ORDER.indexOf(a.key) - APPLY_QUESTION_ORDER.indexOf(b.key)
      })
    return { rows, total: nonSubmittedSessions }
  }, [sessionSummaries])

  const clickBreakdown = useMemo(() => {
    const tally = new Map<ApplyClickSource | 'unknown', number>()
    for (const e of events) {
      if (e.type !== 'apply_clicked') continue
      const src = (e.meta?.source as ApplyClickSource | undefined) ?? 'unknown'
      tally.set(src, (tally.get(src) ?? 0) + 1)
    }
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1])
  }, [events])

  const recent = useMemo(() => events.slice(0, 50), [events])

  return (
    <div className="apply-analytics-page">
      <header className="admin-page-header">
        <h1>Apply Analytics</h1>
        <p>Funnel events from the Bonfire apply site. Counts are unique sessions unless noted.</p>
      </header>

      <div className="apply-analytics-range">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            className={`apply-range-btn ${range === opt.id ? 'active' : ''}`}
            onClick={() => setRange(opt.id)}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="apply-analytics-error" role="alert">
          {error}
        </div>
      )}

      <div className="apply-funnel">
        <FunnelStat
          label="Page opened"
          value={sessionCounts.pageOpened}
          rawCount={counts.page_opened}
          tone="page"
        />
        <FunnelStat
          label="Apply clicked"
          value={sessionCounts.applyClicked}
          rawCount={counts.apply_clicked}
          tone="click"
          ratio={pct(sessionCounts.applyClicked, sessionCounts.pageOpened)}
          ratioLabel="of page opens"
        />
        <FunnelStat
          label="Form started"
          value={sessionCounts.formStarted}
          rawCount={counts.form_started}
          tone="started"
          ratio={pct(sessionCounts.formStarted, sessionCounts.applyClicked)}
          ratioLabel="of apply clicks"
        />
        <FunnelStat
          label="Submitted"
          value={sessionCounts.submitted}
          rawCount={counts.submitted}
          tone="submitted"
          ratio={pct(sessionCounts.submitted, sessionCounts.formStarted)}
          ratioLabel="of form starts"
        />
        <FunnelStat
          label="Exited"
          value={sessionCounts.abandoned}
          rawCount={counts.abandoned}
          tone="abandoned"
          ratio={pct(sessionCounts.abandoned, sessionCounts.formStarted)}
          ratioLabel="of form starts"
          sub="page closed / navigated away"
        />
      </div>

      <div className="apply-analytics-grid">
        <section className="admin-card apply-card">
          <header className="apply-card-header">
            <h2>Where users drop off</h2>
            <p>
              Non-submitted sessions bucketed by farthest field they engaged with. Uses
              <code className="apply-inline-code"> field_engaged</code> events as the primary signal so the chart
              works even when the exit write fails to flush.
            </p>
          </header>
          {loading ? (
            <div className="apply-empty">Loading…</div>
          ) : dropoff.rows.length === 0 ? (
            <div className="apply-empty">No non-submitted sessions with engagement in this range.</div>
          ) : (
            <table className="apply-table">
              <thead>
                <tr>
                  <th>Farthest field reached</th>
                  <th className="apply-table-num">Sessions</th>
                  <th className="apply-table-num">Share</th>
                </tr>
              </thead>
              <tbody>
                {dropoff.rows.map(({ key, count }) => (
                  <tr key={key}>
                    <td>
                      {key === 'no_field' ? (
                        <span className="apply-muted">Before any field (started but did not engage)</span>
                      ) : (
                        APPLY_QUESTION_LABELS[key]
                      )}
                    </td>
                    <td className="apply-table-num">{count}</td>
                    <td className="apply-table-num">{pct(count, dropoff.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-card apply-card">
          <header className="apply-card-header">
            <h2>Sessions by last checkpoint</h2>
            <p>How far each session got before stopping. Each session is counted once.</p>
          </header>
          {loading ? (
            <div className="apply-empty">Loading…</div>
          ) : sessionSummaries.length === 0 ? (
            <div className="apply-empty">No sessions yet.</div>
          ) : (
            <table className="apply-table">
              <thead>
                <tr>
                  <th>Checkpoint</th>
                  <th className="apply-table-num">Sessions</th>
                  <th className="apply-table-num">Share</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    'submitted',
                    'abandoned',
                    'tab_hidden',
                    'field_engaged',
                    'form_started',
                    'apply_clicked',
                    'page_opened',
                  ] as Checkpoint[]
                ).map((c) => {
                  const n = checkpointBreakdown[c]
                  if (n === 0) return null
                  return (
                    <tr key={c}>
                      <td>{CHECKPOINT_LABELS[c]}</td>
                      <td className="apply-table-num">{n}</td>
                      <td className="apply-table-num">{pct(n, sessionSummaries.length)}</td>
                    </tr>
                  )
                })}
                {checkpointBreakdown.unknown > 0 && (
                  <tr>
                    <td>
                      <span className="apply-muted">Unknown</span>
                    </td>
                    <td className="apply-table-num">{checkpointBreakdown.unknown}</td>
                    <td className="apply-table-num">
                      {pct(checkpointBreakdown.unknown, sessionSummaries.length)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-card apply-card">
          <header className="apply-card-header">
            <h2>Apply button clicks</h2>
            <p>Which CTA drives clicks (raw events, not deduped).</p>
          </header>
          {loading ? (
            <div className="apply-empty">Loading…</div>
          ) : clickBreakdown.length === 0 ? (
            <div className="apply-empty">No apply clicks in this range.</div>
          ) : (
            <table className="apply-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="apply-table-num">Count</th>
                  <th className="apply-table-num">Share</th>
                </tr>
              </thead>
              <tbody>
                {clickBreakdown.map(([src, count]) => (
                  <tr key={src}>
                    <td>
                      {src === 'unknown' ? (
                        <span className="apply-muted">Unknown</span>
                      ) : (
                        APPLY_CLICK_SOURCE_LABELS[src]
                      )}
                    </td>
                    <td className="apply-table-num">{count}</td>
                    <td className="apply-table-num">{pct(count, counts.apply_clicked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-card apply-card">
          <header className="apply-card-header">
            <h2>Tab switches</h2>
            <p>
              Sessions where the tab was backgrounded at least once. Different from "Exited" —
              users often return after switching tabs.
            </p>
          </header>
          <div className="apply-card-body">
            <div className="apply-mini-stat">
              <div className="apply-mini-stat-value">{sessionCounts.tabHidden}</div>
              <div className="apply-mini-stat-label">sessions</div>
            </div>
            <div className="apply-mini-stat">
              <div className="apply-mini-stat-value">{counts.apply_tab_hidden}</div>
              <div className="apply-mini-stat-label">total events</div>
            </div>
          </div>
        </section>
      </div>

      <section className="admin-card apply-card">
        <header className="apply-card-header">
          <h2>Recent events</h2>
          <p>Latest 50 events in this range. Session id is shortened.</p>
        </header>
        {loading ? (
          <div className="apply-empty">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="apply-empty">No events yet.</div>
        ) : (
          <div className="apply-recent-list">
            {recent.map((e) => (
              <div key={e.id} className="apply-recent-row">
                <span className={EVENT_BADGE_CLASS[e.type]}>{EVENT_LABELS[e.type]}</span>
                <span className="apply-recent-meta">{describeMeta(e)}</span>
                <span className="apply-recent-session" title={e.sessionId || ''}>
                  {e.sessionId ? e.sessionId.slice(0, 8) : '—'}
                </span>
                <span className="apply-recent-time" title={e.ts}>
                  {relativeTime(e.tsMs)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function describeMeta(e: ApplyEvent): string {
  if (e.type === 'apply_clicked') {
    const src = e.meta?.source
    if (src && src in APPLY_CLICK_SOURCE_LABELS) return APPLY_CLICK_SOURCE_LABELS[src]
    return src ?? ''
  }
  if (e.type === 'field_engaged') {
    const q = e.meta?.lastQuestion
    if (q && q in APPLY_QUESTION_LABELS)
      return `Engaged: ${APPLY_QUESTION_LABELS[q as ApplyQuestionKey]}`
    return ''
  }
  if (e.type === 'apply_tab_hidden') {
    const q = e.meta?.lastQuestion
    if (q && q in APPLY_QUESTION_LABELS)
      return `On: ${APPLY_QUESTION_LABELS[q as ApplyQuestionKey]}`
    return 'Tab backgrounded'
  }
  if (e.type === 'abandoned') {
    const q = e.meta?.lastQuestion
    const reason = e.meta?.reason
    const reasonText = reason === 'beforeunload' ? ' (unload)' : reason === 'pagehide' ? ' (pagehide)' : ''
    if (q && q in APPLY_QUESTION_LABELS)
      return `Left on: ${APPLY_QUESTION_LABELS[q as ApplyQuestionKey]}${reasonText}`
    return `Left before any field${reasonText}`
  }
  if (e.type === 'submitted') {
    return e.meta?.applicationId ? `App ${e.meta.applicationId.slice(0, 8)}` : ''
  }
  return ''
}

type FunnelStatProps = {
  label: string
  value: number
  rawCount: number
  tone: 'page' | 'click' | 'started' | 'submitted' | 'abandoned'
  ratio?: string
  ratioLabel?: string
  sub?: string
}

function FunnelStat({ label, value, rawCount, tone, ratio, ratioLabel, sub }: FunnelStatProps) {
  return (
    <div className={`apply-funnel-stat apply-funnel-${tone}`}>
      <div className="apply-funnel-stat-label">{label}</div>
      <div className="apply-funnel-stat-value">{value}</div>
      <div className="apply-funnel-stat-sub">
        {ratio ? (
          <>
            <strong>{ratio}</strong> {ratioLabel}
          </>
        ) : (
          'unique sessions'
        )}
      </div>
      {sub && <div className="apply-funnel-stat-raw">{sub}</div>}
      {rawCount !== value && (
        <div className="apply-funnel-stat-raw" title="Total events including repeats">
          {rawCount} total events
        </div>
      )}
    </div>
  )
}

export default ApplyAnalyticsPage
