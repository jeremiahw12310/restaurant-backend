import type { StockReport } from '../services/firestore'

export function splitPendingByKind(reports: StockReport[]) {
  return {
    out: reports.filter((r) => r.kind === 'out'),
    low: reports.filter((r) => r.kind === 'low'),
  }
}

/** Split into Out/Low subsections when both kinds exist and there is more than one item. */
export function shouldSplitPendingSections(reports: StockReport[]): boolean {
  if (reports.length <= 1) return false
  const { out, low } = splitPendingByKind(reports)
  return out.length > 0 && low.length > 0
}

export function countOutPending(reports: StockReport[]): number {
  return reports.filter((r) => r.kind === 'out').length
}
