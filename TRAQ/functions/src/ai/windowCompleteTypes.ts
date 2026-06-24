export type WindowKey = '11' | '17' | '21'

export type WindowCompletePlayerPayload = {
  name: string
  score: number
  isWinner: boolean
  tasks: Array<{ taskName: string }>
}

export type WindowCompleteMessageContext = {
  deploymentChannel: 'main' | 'beta'
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  windowKey: WindowKey
  windowLabel: string
  layout: 'pair' | 'solo'
  players: WindowCompletePlayerPayload[]
}

export type WindowCompleteMessageResponse = {
  message: string
  source: 'ai' | 'cache' | 'fallback'
  expiresAtMs: number
}

function isTimeOfDay(v: unknown): v is WindowCompleteMessageContext['timeOfDay'] {
  return v === 'morning' || v === 'afternoon' || v === 'evening' || v === 'night'
}

export function validateWindowCompleteMessageContext(data: unknown): WindowCompleteMessageContext | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.deploymentChannel !== 'main' && d.deploymentChannel !== 'beta') return null
  if (!isTimeOfDay(d.timeOfDay)) return null
  if (d.windowKey !== '11' && d.windowKey !== '17' && d.windowKey !== '21') return null
  if (typeof d.windowLabel !== 'string' || d.windowLabel.length < 1 || d.windowLabel.length > 80) return null
  if (d.layout !== 'pair' && d.layout !== 'solo') return null
  if (!Array.isArray(d.players) || d.players.length < 1) return null

  const players: WindowCompletePlayerPayload[] = []
  for (const raw of d.players.slice(0, 2)) {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Record<string, unknown>
    if (typeof p.name !== 'string' || p.name.length < 1 || p.name.length > 80) return null
    if (typeof p.score !== 'number' || !Number.isFinite(p.score)) return null
    if (typeof p.isWinner !== 'boolean') return null
    if (!Array.isArray(p.tasks)) return null
    const tasks: Array<{ taskName: string }> = []
    for (const t of p.tasks.slice(0, 40)) {
      if (!t || typeof t !== 'object') return null
      const o = t as Record<string, unknown>
      if (typeof o.taskName !== 'string' || o.taskName.length < 1 || o.taskName.length > 200) return null
      tasks.push({ taskName: o.taskName })
    }
    players.push({ name: p.name, score: p.score, isWinner: p.isWinner, tasks })
  }

  if (d.layout === 'solo' && players.length !== 1) return null
  if (d.layout === 'pair' && players.length !== 2) return null

  return {
    deploymentChannel: d.deploymentChannel as 'main' | 'beta',
    timeOfDay: d.timeOfDay,
    windowKey: d.windowKey as WindowKey,
    windowLabel: d.windowLabel,
    layout: d.layout,
    players,
  }
}
