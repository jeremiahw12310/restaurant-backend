import { useEffect, useState } from 'react'
import App from '../../App.tsx'
import {
  effectiveV3ReleaseForChannel,
  subscribeToAppUiSettings,
  type V3Release,
} from '../../services/appSettings.ts'

export type DeploymentChannel = 'main' | 'beta'

/**
 * TRAQ 3.x — same app logic as v2; shell + minor release from Firestore (`config/appUi`).
 */
export default function TraqAppV3({
  deploymentChannel = 'main',
}: {
  /** Beta HTML entry sets `beta` so the app can show beta-only affordances (e.g. Demo mode footer). */
  deploymentChannel?: DeploymentChannel
}) {
  const [v3AdminPosEnabled, setV3AdminPosEnabled] = useState(true)
  const [v3Release, setV3Release] = useState<V3Release>('3.0')
  useEffect(() => {
    return subscribeToAppUiSettings((s) => {
      setV3AdminPosEnabled(s.v3AdminPosEnabled)
      setV3Release(effectiveV3ReleaseForChannel(deploymentChannel, s))
    })
  }, [deploymentChannel])
  return (
    <App
      uiVariant="v3"
      v3AdminPosEnabled={v3AdminPosEnabled}
      v3Release={v3Release}
      deploymentChannel={deploymentChannel}
    />
  )
}
