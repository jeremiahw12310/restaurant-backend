import type { TaskOverrides } from '../services/firestore'

export type DeploymentChannel = 'main' | 'beta'

/** Whether the 🎲 dice affordance should be active on this Hosting entry. */
export function isDiceEnabledForChannel(
  taskOverrides: TaskOverrides | null | undefined,
  deploymentChannel: DeploymentChannel,
): boolean {
  if (taskOverrides?.diceEnabled !== true) return false
  if (taskOverrides.diceBetaOnly === true && deploymentChannel !== 'beta') return false
  return true
}
