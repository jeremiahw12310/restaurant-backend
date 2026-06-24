import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import aiEngineLogoUrl from '../assets/TRAQ.png'
import type { TaskStageMap, TaskState } from '../services/firestore'
import type { Task } from '../types/task'
import type { TaskSplitSuggestResult } from '../services/taskSplitSuggestAi'
import type { TaskSplitSuggestWindowKey } from '../services/taskSplitSuggestAi'
import { isAlwaysSharedShareTask, isTaskDoneForSplit } from '../utils/taskSplitPartition'
import './TaskSplitSuggestPanel.css'

export type TaskSplitSuggestPanelProps = {
  windowLabel: string
  windowKey: TaskSplitSuggestWindowKey
  /** No longer includes 'pick' — the dice setup modal owns that step now. */
  phase: 'loading' | 'active'
  /** When true, the active panel plays a card fly-out before the auto-finish celebration. */
  evacuating?: boolean
  onExit: () => void
  onRegenerate: () => void
  result: TaskSplitSuggestResult | null
  taskState: TaskState
  dateKey: string
  /**
   * Same task-id universe as split generation (effective window + positive weight + deferred rules).
   * Lets the Completed row list tasks finished before the suggestion was built, not only keys in `finalAssignment`.
   */
  effectiveWindowTaskIds: string[]
  /** Admin-configured task order for the active window (same as main grid). */
  orderedTaskIds: string[]
  /** When true, towels shown twice get a Dining/Bar vs Bowl Station side label. */
  towelsSplitEffective: boolean
  /** Pending (non-done) task ids used for the loading shuffle animation. */
  candidateTaskIds: string[]
  allTasks: Task[]
  employeeColors: Record<string, string>
  /** Render a real <TaskCard /> for the given task, fully wired by the parent. */
  renderTaskCard: (task: Task) => ReactNode
  /** Render a virtual "Left Ice" / "Right Ice" card when ice mode is split. */
  renderIceSideCard: (task: Task, side: 'left' | 'right') => ReactNode
  errorBanner: string | null
  /** v3 night window only: Stage 1/2 labels match main grid; pending tiles are grouped under each name. */
  nightStageLabels: { label1: string; label2: string } | null
  taskStages: TaskStageMap
  /** When set, show canonical fair-split window scores (baseline + gap × progress) instead of static projected workload. */
  splitHudPoints?: { pointsA: number; pointsB: number } | null
}

type PanelTile =
  | { kind: 'task'; task: Task }
  | { kind: 'iceSide'; task: Task; side: 'left' | 'right' }
  | { kind: 'sharedDup'; task: Task; towelSide?: 'diningBar' | 'bowlStation' }

function sortTasksByConfiguredOrder(tasks: Task[], orderedTaskIds: string[]): Task[] {
  const rank = new Map(orderedTaskIds.map((id, i) => [id, i]))
  return [...tasks].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return a.id.localeCompare(b.id)
  })
}

function sortTilesByConfiguredOrder(tiles: PanelTile[], orderedTaskIds: string[]): PanelTile[] {
  const rank = new Map(orderedTaskIds.map((id, i) => [id, i]))
  return [...tiles].sort((a, b) => {
    const ra = rank.get(a.task.id) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b.task.id) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    if (a.kind === 'iceSide' && b.kind === 'iceSide') {
      return a.side === 'left' ? -1 : 1
    }
    return 0
  })
}

function partitionTilesByNightStage(
  tiles: PanelTile[],
  taskStages: TaskStageMap,
  windowKey: TaskSplitSuggestWindowKey
): { stage1: PanelTile[]; stage2: PanelTile[] } {
  const stage1: PanelTile[] = []
  const stage2: PanelTile[] = []
  for (const tile of tiles) {
    const raw = taskStages[tile.task.id]?.[windowKey]
    if (Number(raw) === 1) stage1.push(tile)
    else stage2.push(tile)
  }
  return { stage1, stage2 }
}

const SHUFFLE_FALLBACK_NAMES = ['Prep', 'Clean', 'Stock', 'Close']

function TaskSplitShuffleAnimation({ taskNames }: { taskNames: string[] }) {
  const names = useMemo(() => {
    const unique = Array.from(new Set(taskNames.map((n) => n.trim()).filter(Boolean)))
    if (unique.length >= 4) return unique
    const padded = [...unique]
    for (const fallback of SHUFFLE_FALLBACK_NAMES) {
      if (padded.length >= 4) break
      if (!padded.includes(fallback)) padded.push(fallback)
    }
    return padded.length > 0 ? padded : SHUFFLE_FALLBACK_NAMES
  }, [taskNames])

  const [offset, setOffset] = useState(0)
  const [shuffling, setShuffling] = useState(false)

  useEffect(() => {
    if (names.length < 2) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return

    let cancelled = false
    let shuffleTimer: number | undefined
    const interval = window.setInterval(() => {
      if (cancelled) return
      setShuffling(true)
      shuffleTimer = window.setTimeout(() => {
        if (cancelled) return
        setOffset((o) => (o + 1) % names.length)
        setShuffling(false)
      }, 420)
    }, 880)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      if (shuffleTimer !== undefined) window.clearTimeout(shuffleTimer)
    }
  }, [names])

  const visibleCount = Math.min(4, names.length)
  const stack = Array.from({ length: visibleCount }, (_, depth) => {
    const name = names[(offset + depth) % names.length]!
    return { name, depth, key: `${name}-${depth}` }
  })

  return (
    <div className="task-split-panel__shuffle" aria-hidden="true">
      {stack.map(({ name, depth, key }) => (
        <div
          key={key}
          className={`task-split-panel__shuffle-card${depth === 0 && shuffling ? ' is-shuffling' : ''}`}
          style={{ ['--shuffle-depth' as string]: depth } as CSSProperties}
        >
          {name}
        </div>
      ))}
    </div>
  )
}

export function TaskSplitSuggestPanel(props: TaskSplitSuggestPanelProps) {
  const { result, taskState, dateKey, windowKey } = props
  const windowMap = taskState[dateKey]?.[windowKey] || {}

  const taskById = useMemo(() => new Map(props.allTasks.map((t) => [t.id, t])), [props.allTasks])

  const shuffleTaskNames = useMemo(() => {
    return props.candidateTaskIds
      .map((id) => taskById.get(id)?.name || id)
      .filter(Boolean)
  }, [props.candidateTaskIds, taskById])

  const columns = useMemo(() => {
    if (!result) {
      return { a: [] as PanelTile[], b: [] as PanelTile[], shared: [] as Task[], done: [] as Task[] }
    }
    const sharedSet = new Set(result.finalSharedTaskIds || [])
    const iceSplitMode = result.finalIceMode === 'split'

    const pendingA: PanelTile[] = []
    const pendingB: PanelTile[] = []
    const pendingShared: Task[] = []
    const doneById = new Map<string, Task>()

    for (const tid of Object.keys(result.finalAssignment)) {
      const t = taskById.get(tid)
      if (!t) continue
      const c = windowMap[tid]
      if (isTaskDoneForSplit(tid, c)) {
        doneById.set(tid, t)
        continue
      }
      if (iceSplitMode && (tid === 'ice-5pm' || tid === 'ice-close')) {
        pendingA.push({ kind: 'iceSide', task: t, side: 'left' })
        pendingB.push({ kind: 'iceSide', task: t, side: 'right' })
        continue
      }
      if (sharedSet.has(tid)) {
        if (isAlwaysSharedShareTask(t)) {
          pendingShared.push(t)
        } else {
          const isTowel =
            (tid === 'towels' || tid === 'towels-5pm' || tid === 'towels-close') &&
            props.towelsSplitEffective
          pendingA.push({ kind: 'sharedDup', task: t, towelSide: isTowel ? 'diningBar' : undefined })
          pendingB.push({ kind: 'sharedDup', task: t, towelSide: isTowel ? 'bowlStation' : undefined })
        }
        continue
      }
      if (result.finalAssignment[tid] === result.employeeB) {
        pendingB.push({ kind: 'task', task: t })
      } else {
        pendingA.push({ kind: 'task', task: t })
      }
    }

    for (const tid of props.effectiveWindowTaskIds) {
      const t = taskById.get(tid)
      if (!t) continue
      if (!isTaskDoneForSplit(tid, windowMap[tid])) continue
      doneById.set(tid, t)
    }

    const done = Array.from(doneById.values())
    done.sort((x, y) => {
      const cx = windowMap[x.id]?.completedAt || ''
      const cy = windowMap[y.id]?.completedAt || ''
      const tx = Date.parse(cx)
      const ty = Date.parse(cy)
      const nx = Number.isFinite(tx) ? tx : 0
      const ny = Number.isFinite(ty) ? ty : 0
      if (ny !== nx) return ny - nx
      return x.id.localeCompare(y.id)
    })
    const shared = sortTasksByConfiguredOrder(pendingShared, props.orderedTaskIds)
    return { a: pendingA, b: pendingB, shared, done }
  }, [result, taskById, windowMap, props.effectiveWindowTaskIds, props.orderedTaskIds, props.towelsSplitEffective])

  const renderTile = (tile: PanelTile): ReactNode => {
    if (tile.kind === 'iceSide') return props.renderIceSideCard(tile.task, tile.side)
    if (tile.kind === 'sharedDup') {
      const label =
        tile.towelSide === 'diningBar'
          ? 'Dining/Bar'
          : tile.towelSide === 'bowlStation'
            ? 'Bowl Station'
            : null
      return (
        <>
          {props.renderTaskCard(tile.task)}
          {label ? <div className="task-split-panel__towel-side">({label})</div> : null}
        </>
      )
    }
    return props.renderTaskCard(tile.task)
  }

  const renderTilesColumn = (tiles: PanelTile[]) => {
    const labels = props.nightStageLabels
    if (!labels) {
      const sorted = sortTilesByConfiguredOrder(tiles, props.orderedTaskIds)
      return (
        <>
          {sorted.map((tile, i) => (
            <div key={`${tile.kind}-${tile.task.id}-${i}`} className="task-split-panel__tile">{renderTile(tile)}</div>
          ))}
          {sorted.length === 0 ? <span className="task-split-panel__empty">None</span> : null}
        </>
      )
    }
    const { stage1, stage2 } = partitionTilesByNightStage(tiles, props.taskStages, props.windowKey)
    const sortedStage1 = sortTilesByConfiguredOrder(stage1, props.orderedTaskIds)
    const sortedStage2 = sortTilesByConfiguredOrder(stage2, props.orderedTaskIds)
    const bothEmpty = stage1.length === 0 && stage2.length === 0
    return (
      <>
        <div className="stage-divider task-split-panel__stage-divider">{labels.label1}</div>
        {sortedStage1.map((tile, i) => (
          <div key={`s1-${tile.kind}-${tile.task.id}-${i}`} className="task-split-panel__tile">{renderTile(tile)}</div>
        ))}
        <div className="stage-divider task-split-panel__stage-divider">{labels.label2}</div>
        {sortedStage2.map((tile, i) => (
          <div key={`s2-${tile.kind}-${tile.task.id}-${i}`} className="task-split-panel__tile">{renderTile(tile)}</div>
        ))}
        {bothEmpty ? <span className="task-split-panel__empty">None</span> : null}
      </>
    )
  }

  return (
    <section className="task-split-panel" aria-label="50/50 split">
      {props.errorBanner ? <div className="task-split-panel__error">{props.errorBanner}</div> : null}

      {props.phase === 'loading' ? (
        <div className="task-split-panel__loading">
          <div className="task-split-panel__loading-title">Splitting Tasks…</div>
          <TaskSplitShuffleAnimation taskNames={shuffleTaskNames} />
          <span
            className="ai-engine-badge ai-engine-badge--window-complete ai-engine-badge--window-complete--pending"
            aria-label="AI Engine pending"
          >
            <span className="ai-engine-badge__pill">AI Engine</span>
          </span>
          <button
            type="button"
            className="task-split-panel__btn task-split-panel__btn--exit"
            onClick={props.onExit}
          >
            Exit
          </button>
        </div>
      ) : null}

      {props.phase === 'active' && result ? (
        <div className={props.evacuating ? 'task-split-panel__active task-split-panel__active--evacuating' : 'task-split-panel__active'}>
          {result.rationale ? (
            <div className="task-split-panel__rationale-card">
              <p className="task-split-panel__rationale-text">
                {result.rationale}
                <span className="task-split-panel__rationale-badge">
                  <span className="ai-engine-badge ai-engine-badge--window-complete" aria-label="AI Engine">
                    <img className="ai-engine-badge__logo" src={aiEngineLogoUrl} alt="" aria-hidden="true" />
                    <span className="ai-engine-badge__pill">AI Engine</span>
                  </span>
                </span>
              </p>
            </div>
          ) : null}

          <div className="task-split-panel__grid">
            {[
              { emp: result.employeeA, tiles: columns.a },
              { emp: result.employeeB, tiles: columns.b },
            ].map(({ emp, tiles }) => {
              const playerColor = props.employeeColors[emp]
              return (
                <div
                  key={emp}
                  className="task-split-panel__side"
                  style={playerColor ? ({ ['--player-color' as string]: playerColor } as CSSProperties) : undefined}
                >
                  <div className="task-split-panel__name-card">
                    <div className="task-split-panel__name">{emp}</div>
                  </div>
                  <div className="task-split-panel__tiles">{renderTilesColumn(tiles)}</div>
                </div>
              )
            })}
          </div>

          {columns.a.length === 0 &&
          columns.b.length === 0 &&
          columns.shared.length === 0 &&
          columns.done.length > 0 ? (
            <p className="task-split-panel__all-done">All suggested tasks complete — tap Exit to return to the grid.</p>
          ) : null}

          {columns.shared.length > 0 ? (
            <div className="task-split-panel__shared">
              <div className="task-split-panel__shared-heading">Split together</div>
              <div className="task-split-panel__shared-row">
                {columns.shared.map((t) => (
                  <div key={t.id} className="task-split-panel__shared-card">
                    {props.renderTaskCard(t)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="task-split-panel__actions">
            <button type="button" className="task-split-panel__btn" onClick={props.onRegenerate}>
              Retry Split
            </button>
            <button
              type="button"
              className="task-split-panel__btn task-split-panel__btn--exit"
              onClick={props.onExit}
            >
              Exit
            </button>
          </div>

          {columns.done.length > 0 ? (
            <div className="task-split-panel__done">
              <div className="task-split-panel__done-heading">Completed</div>
              <div className="task-split-panel__done-row">
                {columns.done.map((t, idx) => (
                  <div
                    key={t.id}
                    className="task-split-panel__done-card task-split-fly-in"
                    style={
                      {
                        ['--task-split-fly-delay' as string]: `${Math.min(idx * 72, 720)}ms`,
                      } as CSSProperties
                    }
                  >
                    {props.renderTaskCard(t)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
