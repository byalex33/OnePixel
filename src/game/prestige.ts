import { createInitialState } from './state'
import type { SaveState } from './types'

/**
 * REBOOT (prestige): start over at level 1 with one more reboot on the counter,
 * which makes prices and bosses harder and every pixel worth more. Feats,
 * settings and lifetime stats survive; this run's boss progress does not.
 */
export function rebootState(prev: SaveState): SaveState {
  const s = createInitialState()
  s.reboots = prev.reboots + 1
  s.achievements = [...prev.achievements]
  s.settings = { ...prev.settings }
  s.stats = { ...prev.stats, bossKills: 0, bossEscapes: 0, finalKills: 0 }
  return s
}
