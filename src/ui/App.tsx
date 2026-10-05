import { UPGRADES_UNLOCK_LEVEL } from '../game/config'
import { Arena } from './Arena'
import { CrashScreen } from './CrashScreen'
import { useMediaQuery, useRuntime } from './hooks'
import { Panel } from './Panel'

export default function App() {
  const rt = useRuntime()
  const desktop = useMediaQuery('(min-width: 768px)')
  const showPanel = rt.game.state.level >= UPGRADES_UNLOCK_LEVEL

  return (
    <div
      className="flex h-dvh w-full flex-col-reverse overflow-hidden bg-bg md:flex-row"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {showPanel && <Panel desktop={desktop} />}
      <Arena />
      <CrashScreen />
    </div>
  )
}
