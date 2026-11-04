import { UPGRADES_UNLOCK_LEVEL } from './config'
import { applyKits, bitsForRun, FAST_BOOT_LEVELS } from './kernel'
import { createInitialState } from './state'
import type { SaveState } from './types'

/**
 * REBOOT, step one: pay this run's CORE BITS and bring up the KERNEL boot screen.
 * The run itself is untouched until BOOT, so bits spent now (FAST BOOT included) shape the next run.
 * Returns the bits paid. Calling it again while the boot screen is up pays nothing.
 */
export function beginReboot(state: SaveState): number {
  if (state.bootPending) return 0
  const paid = bitsForRun(state).total
  state.bits += paid
  state.bootPending = true
  state.crashPending = false
  return paid
}

/**
 * REBOOT, step two (BOOT): start over with one more reboot on the counter, which makes prices
 * and bosses harder and every pixel worth more. Feats, settings, lifetime stats, CORE BITS and
 * the KERNEL survive; this run's boss progress does not. KERNEL head starts apply here.
 */
export function rebootState(prev: SaveState): SaveState {
  const s = createInitialState()
  s.reboots = prev.reboots + 1
  s.totalPixels = prev.totalPixels
  s.achievements = [...prev.achievements]
  s.settings = { ...prev.settings }
  s.stats = { ...prev.stats, bossKills: 0, bossEscapes: 0, finalKills: 0 }
  s.bits = prev.bits
  s.kernel = { ...prev.kernel }
  s.level = FAST_BOOT_LEVELS[s.kernel.fastBoot] ?? 1
  if (s.level >= UPGRADES_UNLOCK_LEVEL) s.reveal = { hud: true, panel: true }
  applyKits(s)
  return s
}
