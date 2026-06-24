import { describe, expect, it } from 'vitest'
import type { TaskOverrides } from '../services/firestore'
import { isDiceEnabledForChannel } from './diceVisibility'

const base: TaskOverrides = { overrides: {} }

describe('isDiceEnabledForChannel', () => {
  it('hidden when dice is off', () => {
    expect(isDiceEnabledForChannel(base, 'main')).toBe(false)
    expect(isDiceEnabledForChannel(base, 'beta')).toBe(false)
    expect(isDiceEnabledForChannel({ ...base, diceBetaOnly: true }, 'beta')).toBe(false)
  })

  it('visible on both channels when dice on and beta-only off', () => {
    const overrides = { ...base, diceEnabled: true }
    expect(isDiceEnabledForChannel(overrides, 'main')).toBe(true)
    expect(isDiceEnabledForChannel(overrides, 'beta')).toBe(true)
  })

  it('visible on beta only when beta-only on', () => {
    const overrides = { ...base, diceEnabled: true, diceBetaOnly: true }
    expect(isDiceEnabledForChannel(overrides, 'main')).toBe(false)
    expect(isDiceEnabledForChannel(overrides, 'beta')).toBe(true)
  })
})
