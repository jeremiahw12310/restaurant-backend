import { describe, it, expect } from 'vitest'
import type { FairSplitContractDoc } from './firestore'
import {
  fairSplitContractToSuggestResult,
  resolveTaskSplitPanelRestore,
} from './taskSplitSuggestAi'

function baseContract(over: Partial<FairSplitContractDoc> = {}): FairSplitContractDoc {
  return {
    dateKey: '2026-06-20',
    windowKey: '17',
    employeeA: 'Alex',
    employeeB: 'Jordan',
    taskIds: ['prep', 'ice-5pm'],
    suggestedAssignment: { prep: 'Alex', mop: 'Jordan' },
    finalSharedTaskIds: ['towels-5pm'],
    finalIceMode: 'split',
    finalIceSplitAssignment: { 'ice-5pm': { left: 'Alex', right: 'Jordan' } },
    baselinePointsFloatA: 12.5,
    baselinePointsFloatB: 8,
    version: 1,
    ...over,
  }
}

describe('fairSplitContractToSuggestResult', () => {
  it('maps contract fields into panel result shape', () => {
    const contract = baseContract()
    const result = fairSplitContractToSuggestResult(contract)
    expect(result.employeeA).toBe('Alex')
    expect(result.employeeB).toBe('Jordan')
    expect(result.finalAssignment).toEqual({ prep: 'Alex', mop: 'Jordan' })
    expect(result.finalSharedTaskIds).toEqual(['towels-5pm'])
    expect(result.finalIceMode).toBe('split')
    expect(result.finalIceSplitAssignment).toEqual({ 'ice-5pm': { left: 'Alex', right: 'Jordan' } })
    expect(result.projectedScoreFloatA).toBe(12.5)
    expect(result.projectedScoreFloatB).toBe(8)
    expect(result.scoreDiff).toBe(4.5)
    expect(result.source).toBe('restored')
    expect(result.rationale).toBe('')
  })

  it('returns a copy so panel edits do not mutate the contract', () => {
    const contract = baseContract()
    const result = fairSplitContractToSuggestResult(contract)
    result.finalAssignment.prep = 'Changed'
    result.finalSharedTaskIds.push('extra')
    expect(contract.suggestedAssignment.prep).toBe('Alex')
    expect(contract.finalSharedTaskIds).toEqual(['towels-5pm'])
  })
})

describe('resolveTaskSplitPanelRestore', () => {
  const contract17 = baseContract({ windowKey: '17' })
  const contract21 = baseContract({ windowKey: '21', employeeA: 'Sam', employeeB: 'Riley' })

  it('hides on non-split windows', () => {
    expect(
      resolveTaskSplitPanelRestore({
        selectedDateKey: '2026-06-20',
        selectedWindow: '11',
        contract17,
        contract21: null,
        phase: null,
        undoneViewKey: null,
      }),
    ).toEqual({ action: 'hide' })
  })

  it('skips while loading', () => {
    expect(
      resolveTaskSplitPanelRestore({
        selectedDateKey: '2026-06-20',
        selectedWindow: '17',
        contract17,
        contract21: null,
        phase: 'loading',
        undoneViewKey: null,
      }),
    ).toEqual({ action: 'skip' })
  })

  it('restores when the matching contract exists for the active window', () => {
    expect(
      resolveTaskSplitPanelRestore({
        selectedDateKey: '2026-06-20',
        selectedWindow: '17',
        contract17,
        contract21: null,
        phase: null,
        undoneViewKey: null,
      }),
    ).toEqual({ action: 'restore', contract: contract17 })
  })

  it('hides after undo for the current view', () => {
    expect(
      resolveTaskSplitPanelRestore({
        selectedDateKey: '2026-06-20',
        selectedWindow: '17',
        contract17,
        contract21: null,
        phase: null,
        undoneViewKey: '2026-06-20:17',
      }),
    ).toEqual({ action: 'hide' })
  })

  it('restores the 9PM contract when viewing window 21', () => {
    expect(
      resolveTaskSplitPanelRestore({
        selectedDateKey: '2026-06-20',
        selectedWindow: '21',
        contract17: null,
        contract21,
        phase: null,
        undoneViewKey: null,
      }),
    ).toEqual({ action: 'restore', contract: contract21 })
  })

  it('hides on split window when only the other window has a contract', () => {
    expect(
      resolveTaskSplitPanelRestore({
        selectedDateKey: '2026-06-20',
        selectedWindow: '21',
        contract17,
        contract21: null,
        phase: null,
        undoneViewKey: null,
      }),
    ).toEqual({ action: 'hide' })
  })
})
