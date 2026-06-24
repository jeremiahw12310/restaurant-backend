export type WindowKey = '11' | '17' | '21'

export type ShiftQuoteContext = {
  deploymentChannel: 'main' | 'beta'
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  windowKey: WindowKey
  employeesOnShift: string[]
  progress: { resolved: number; total: number; percent: number }
  stateTag?: 'all_done' | 'on_pace' | 'behind' | 'starting'
}

export type ShiftQuotePresentation = 'team' | 'attributed'

export type ShiftQuoteResponse = {
  greeting: string
  quote: string
  source: 'ai' | 'cache' | 'fallback'
  expiresAtMs: number
  presentation: ShiftQuotePresentation
  /** When presentation is attributed, HUD shows this instead of a time-of-day greeting. */
  speakerName?: string
}

export function validateQuoteContext(data: unknown): ShiftQuoteContext | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.deploymentChannel !== 'main' && d.deploymentChannel !== 'beta') return null
  if (typeof d.timeOfDay !== 'string') return null
  if (d.windowKey !== '11' && d.windowKey !== '17' && d.windowKey !== '21') return null
  if (!Array.isArray(d.employeesOnShift)) return null
  if (!d.progress || typeof d.progress !== 'object') return null
  const p = d.progress as Record<string, unknown>
  if (typeof p.resolved !== 'number' || typeof p.total !== 'number' || typeof p.percent !== 'number') return null
  return {
    deploymentChannel: d.deploymentChannel as 'main' | 'beta',
    timeOfDay: d.timeOfDay as ShiftQuoteContext['timeOfDay'],
    windowKey: d.windowKey as WindowKey,
    employeesOnShift: (d.employeesOnShift as unknown[]).map(String).slice(0, 6),
    progress: { resolved: p.resolved as number, total: p.total as number, percent: p.percent as number },
    stateTag: typeof d.stateTag === 'string' ? d.stateTag as ShiftQuoteContext['stateTag'] : undefined,
  }
}
