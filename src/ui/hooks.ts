import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { Runtime } from '../app/runtime'

export const RuntimeContext = createContext<Runtime | null>(null)

/**
 * Returns the runtime and re-renders whenever the runtime publishes a new
 * version (throttled to ~10Hz plus immediate updates for important events).
 * Components read game state directly off `rt.game` during render.
 */
export function useRuntime(): Runtime {
  const rt = useContext(RuntimeContext)
  if (!rt) throw new Error('RuntimeContext missing')
  useSyncExternalStore(rt.subscribe, rt.getVersion)
  return rt
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}
