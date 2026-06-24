import { Component, type ErrorInfo, type ReactNode } from 'react'
import { markIntentionalReload } from '../utils/reloadForensics'

/**
 * Top-level safety net. A fatal render error anywhere in the tree would
 * otherwise leave the iPad on a permanent blank white screen that only a
 * manual refresh fixes.
 *
 * Design goals (kiosk that must run 24h with music playing):
 * - NEVER auto-reload the page. A full reload pauses the music and forces
 *   staff to re-interact. Instead we recover in place by re-rendering the
 *   tree, which keeps the page (and network/session) alive.
 * - Persist every crash to a localStorage ring buffer so the exact error can
 *   be read back later, even when the crash self-heals silently.
 * - If a crash is deterministic and loops, stop auto-recovering and show a
 *   static card with the captured error text + a MANUAL reload button.
 */

const CRASH_LOG_KEY = 'traq-crash-log'
const CRASH_LOG_MAX = 10
const RECOVERY_LOG_KEY = 'traq-error-recovery-log'
const RECOVERY_WINDOW_MS = 60_000
const MAX_AUTO_RECOVERIES = 3
const RECOVERY_DELAY_MS = 50

type CrashRecord = {
  ts: string
  name: string
  message: string
  stack: string
  componentStack: string
  path: string
  ua: string
}

function captureCrash(error: Error, info: ErrorInfo): CrashRecord {
  const record: CrashRecord = {
    ts: new Date().toISOString(),
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    stack: (error?.stack ?? '').split('\n').slice(0, 8).join('\n'),
    componentStack: (info?.componentStack ?? '').split('\n').slice(0, 12).join('\n'),
    path: typeof location !== 'undefined' ? location.pathname : '',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  }
  try {
    const raw = localStorage.getItem(CRASH_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed) ? parsed : []
    list.unshift(record)
    list.length = Math.min(list.length, CRASH_LOG_MAX)
    localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(list))
  } catch {
    /* ignore persistence failures */
  }
  return record
}

function readRecoveryLog(): number[] {
  try {
    const raw = sessionStorage.getItem(RECOVERY_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n) => typeof n === 'number')
  } catch {
    return []
  }
}

function recordRecovery(nowMs: number): void {
  try {
    const recent = readRecoveryLog().filter((t) => nowMs - t < RECOVERY_WINDOW_MS)
    recent.push(nowMs)
    sessionStorage.setItem(RECOVERY_LOG_KEY, JSON.stringify(recent))
  } catch {
    /* ignore */
  }
}

function recentRecoveryCount(nowMs: number): number {
  return readRecoveryLog().filter((t) => nowMs - t < RECOVERY_WINDOW_MS).length
}

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { fatal: boolean; looping: boolean; latest: CrashRecord | null }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  private recoveryTimer: number | null = null

  state: AppErrorBoundaryState = { fatal: false, looping: false, latest: null }

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { fatal: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const record = captureCrash(error, info)
    console.error('AppErrorBoundary caught a render error:', error, info)

    const nowMs = Date.now()
    if (recentRecoveryCount(nowMs) >= MAX_AUTO_RECOVERIES) {
      // Deterministic crash loop: stop trying, show the static card instead of
      // thrashing. Still NO page reload.
      this.setState({ looping: true, latest: record })
      return
    }

    // Self-heal in place: re-render the tree without reloading the page.
    recordRecovery(nowMs)
    this.setState({ latest: record })
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = null
      this.setState({ fatal: false })
    }, RECOVERY_DELAY_MS)
  }

  componentWillUnmount(): void {
    if (this.recoveryTimer !== null) {
      window.clearTimeout(this.recoveryTimer)
      this.recoveryTimer = null
    }
  }

  private handleManualReload = (): void => {
    try {
      sessionStorage.removeItem(RECOVERY_LOG_KEY)
    } catch {
      /* ignore */
    }
    markIntentionalReload('error-boundary-manual')
    window.location.reload()
  }

  private handleTryAgain = (): void => {
    try {
      sessionStorage.removeItem(RECOVERY_LOG_KEY)
    } catch {
      /* ignore */
    }
    this.setState({ fatal: false, looping: false })
  }

  render(): ReactNode {
    if (!this.state.fatal) return this.props.children

    // Deterministic loop: static recovery card, no auto-reload.
    if (this.state.looping) {
      const latest = this.state.latest
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            padding: '24px',
            textAlign: 'center',
            background: '#1a1a1a',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ fontSize: '20px', fontWeight: 600 }}>Something went wrong</div>
          {latest ? (
            <div
              style={{
                maxWidth: '520px',
                fontSize: '12px',
                lineHeight: 1.4,
                opacity: 0.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {latest.name}: {latest.message}
              {latest.componentStack ? `\n${latest.componentStack.split('\n').slice(0, 4).join('\n')}` : ''}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={this.handleTryAgain}
              style={{
                padding: '12px 20px',
                fontSize: '15px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'transparent',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleManualReload}
              style={{
                padding: '12px 20px',
                fontSize: '15px',
                borderRadius: '10px',
                border: 'none',
                background: '#fff',
                color: '#1a1a1a',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      )
    }

    // Auto-recovery in flight: render nothing for a frame (no white error flash, no reload).
    return null
  }
}
