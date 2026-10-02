import { UPGRADES_UNLOCK_LEVEL } from './config'
import type { SaveState } from './types'

export interface AchievementDef {
  id: string
  name: string
  desc: string
  check: (s: SaveState) => boolean
}

/** Each achievement permanently grants +2% pixel value. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'HELLO WORLD', desc: 'Destroy your first pixel.', check: (s) => s.stats.kills >= 1 },
  { id: 'shop', name: 'UPGRADES UNLOCKED', desc: 'Reach level 2 to open the upgrade shop.', check: (s) => s.level >= UPGRADES_UNLOCK_LEVEL },
  { id: 'k100', name: 'CENTURION', desc: 'Destroy 100 pixels.', check: (s) => s.stats.kills >= 100 },
  { id: 'k1k', name: 'PIXEL PURGE', desc: 'Destroy 1,000 pixels.', check: (s) => s.stats.kills >= 1000 },
  { id: 'k10k', name: 'DEAD PIXELS', desc: 'Destroy 10,000 pixels.', check: (s) => s.stats.kills >= 10000 },
  { id: 'clicks', name: 'TRIGGER FINGER', desc: 'Tap 500 times.', check: (s) => s.stats.clicks >= 500 },
  { id: 'crit', name: 'CRITICAL', desc: 'Land a critical hit.', check: (s) => s.stats.crits >= 1 },
  { id: 'combo10', name: 'IN THE ZONE', desc: 'Reach a x10 combo.', check: (s) => s.stats.maxCombo >= 10 },
  { id: 'combo30', name: 'UNSTOPPABLE', desc: 'Reach a x30 combo.', check: (s) => s.stats.maxCombo >= 30 },
  { id: 'crowd', name: 'CROWDED', desc: 'Have 5 pixels on screen at once.', check: (s) => s.stats.mostOnScreen >= 5 },
  { id: 'drone', name: 'AUTOMATION', desc: 'Drones destroy 100 pixels.', check: (s) => s.stats.droneKills >= 100 },
  { id: 'multi', name: 'TRIPLE TAP', desc: 'Destroy 3 pixels with one tap.', check: (s) => s.stats.bestMultiClick >= 3 },
  { id: 'fox', name: 'GOOD FOX', desc: 'Your fox catches 25 pixels.', check: (s) => s.stats.foxKills >= 25 },
  { id: 'gold', name: 'MIDAS', desc: 'Catch a golden pixel.', check: (s) => s.stats.goldenKills >= 1 },
  { id: 'gold25', name: 'GOLD HOARDER', desc: 'Catch 25 golden pixels.', check: (s) => s.stats.goldenKills >= 25 },
  { id: 'chain', name: 'CHAIN GANG', desc: 'One chain reaction destroys 6 pixels.', check: (s) => s.stats.bestChain >= 6 },
  { id: 'bomb', name: 'CARPET BOMB', desc: 'One bomb destroys 5 pixels.', check: (s) => s.stats.bestBomb >= 5 },
  { id: 'storm', name: 'UMBRELLA', desc: 'Destroy 40 pixels in one storm.', check: (s) => s.stats.bestStorm >= 40 },
  { id: 'laser', name: 'LINE CLEAR', desc: 'One laser strike destroys 4 pixels.', check: (s) => s.stats.bestLaser >= 4 },
  { id: 'nuke', name: 'OVERKILL', desc: 'Launch a nuke.', check: (s) => s.stats.nukes >= 1 },
  { id: 'rich', name: 'MILLIONAIRE', desc: 'Earn 1,000,000 pixels in total.', check: (s) => s.totalPixels >= 1e6 },
  { id: 'lvl10', name: 'DOUBLE DIGITS', desc: 'Reach level 10.', check: (s) => s.level >= 10 },
  { id: 'lvl15', name: 'VETERAN', desc: 'Reach level 15.', check: (s) => s.level >= 15 },
]
