import { BLUE_LEVEL, BLUE_XP_MULT, UPGRADES_UNLOCK_LEVEL } from './config'
import * as F from './formulas'
import { hasFeature, levelForFeature } from './levels'
import type { FeatureId, SaveState, UpgradeId } from './types'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  desc: string
  /** Feature that must be unlocked (via level) before the upgrade shows up. */
  requires?: FeatureId
  /** Alternative to `requires` for upgrades not tied to a level feature. */
  minLevel?: number
  baseCost: number
  growth: number
  max: number
  /** Human readable value of the stat at a given upgrade level. */
  show: (lvl: number) => string
}

const s = (n: number) => `${n.toFixed(2)}s`
const pct = (n: number) => `${Math.round(n * 100)}%`
const x = (n: number) => `x${n % 1 === 0 ? n : n.toFixed(2)}`
const u = (n: number) => `${Math.round(n)}u`

const off = (l: number, on: () => string) => (l <= 0 ? 'off' : on())
const perk = (l: number) => (l > 0 ? 'on' : 'off')

/**
 * The shop. Anything gated by `requires` appears when its level is reached but
 * starts at level 0 (no effect); buying level 1 switches it on.
 */
export const UPGRADES: UpgradeDef[] = [
  { id: 'respawn', name: 'RESPAWN SPEED', desc: 'Pixels come back faster.', baseCost: 8, growth: 2.0, max: 14, show: (l) => s(F.respawnTime(l)) },
  { id: 'value', name: 'PIXEL VALUE', desc: 'Every pixel is worth more.', baseCost: 10, growth: 1.8, max: 60, show: (l) => x(Number(F.valueMult(l).toFixed(2))) },
  { id: 'multi', name: 'EXTRA PIXEL', desc: 'One more pixel in the arena.', requires: 'second', baseCost: 12, growth: 2.9, max: 17, show: (l) => `${l + 1} px` },
  { id: 'critChance', name: 'CRIT CHANCE', desc: 'Unlock critical hits. Levels raise the odds.', requires: 'crit', baseCost: 80, growth: 2.0, max: 13, show: (l) => off(l, () => pct(F.critChance(l))) },
  { id: 'critPower', name: 'CRIT POWER', desc: 'Critical hits pay out more.', requires: 'crit', baseCost: 150, growth: 2.1, max: 20, show: (l) => x(F.critMult(l)) },
  { id: 'blue', name: 'BLUE PIXELS', desc: `Unlock blue pixels worth x${BLUE_XP_MULT} XP. Levels make them more common.`, minLevel: BLUE_LEVEL, baseCost: 60, growth: 2.3, max: 12, show: (l) => off(l, () => pct(F.blueChance(l))) },
  { id: 'combo', name: 'COMBOS', desc: 'Unlock combos: quick pops stack +3% each. Levels raise the cap.', requires: 'combo', baseCost: 120, growth: 2.0, max: 13, show: (l) => off(l, () => `${F.comboCap(l)} stk`) },
  { id: 'xp', name: 'XP GAIN', desc: 'More XP from every pixel.', requires: 'combo', baseCost: 100, growth: 2.15, max: 20, show: (l) => x(F.xpMult(l)) },
  { id: 'blast', name: 'BLAST RADIUS', desc: 'Unlock explosive taps that hit nearby pixels. Levels grow the blast.', requires: 'blast', baseCost: 350, growth: 2.15, max: 16, show: (l) => off(l, () => u(F.blastRadius(l))) },
  { id: 'auto', name: 'AUTO DESTROYER', desc: 'Buy a drone that hunts pixels. Faster each level, +1 drone every 3.', requires: 'drone', baseCost: 300, growth: 2.1, max: 18, show: (l) => (l === 0 ? 'none' : `${F.droneCount(l, false)}x ${s(F.droneCooldown(l))}`) },
  { id: 'golden', name: 'GOLDEN PIXELS', desc: 'Unlock rare golden pixels worth x25. Levels make them more common.', requires: 'golden', baseCost: 1500, growth: 2.1, max: 13, show: (l) => off(l, () => pct(F.goldenChance(l))) },
  { id: 'chain', name: 'CHAIN REACTION', desc: 'Destroyed pixels may detonate neighbours. Levels raise the odds.', requires: 'chain', baseCost: 3000, growth: 2.15, max: 11, show: (l) => off(l, () => pct(F.chainChance(l))) },
  { id: 'bomb', name: 'BOMB BAY', desc: 'Bombs drop into crowds. Levels: more often, bigger.', requires: 'bomb', baseCost: 5000, growth: 2.15, max: 16, show: (l) => off(l, () => `${s(F.bombInterval(l))} ${u(F.bombRadius(l))}`) },
  { id: 'rain', name: 'PIXEL RAIN', desc: 'Storms of falling pixels. Levels: sooner and longer.', requires: 'rain', baseCost: 9000, growth: 2.2, max: 13, show: (l) => off(l, () => `${Math.round(F.rainInterval(l))}s/${Math.round(F.rainDuration(l))}s`) },
  { id: 'laser', name: 'LASERS', desc: 'An orbital laser slices the arena. Levels fire more often.', requires: 'laser', baseCost: 15000, growth: 2.15, max: 16, show: (l) => off(l, () => s(F.laserInterval(l))) },
  { id: 'nukeCharge', name: 'NUKE SILO', desc: 'Build a nuke, charged by kills. Levels charge it faster.', requires: 'nuke', baseCost: 30000, growth: 2.3, max: 11, show: (l) => off(l, () => `${F.nukeKills(l)} kills`) },
  { id: 'nukeYield', name: 'WARHEAD YIELD', desc: 'Nuked pixels are worth more.', requires: 'nuke', baseCost: 40000, growth: 2.3, max: 20, show: (l) => x(F.nukeYield(l)) },
  { id: 'swarm', name: 'DRONE SWARM', desc: 'Two extra drones join your fleet.', requires: 'swarm', baseCost: 150_000, growth: 1, max: 1, show: perk },
  { id: 'cluster', name: 'CLUSTER BOMBS', desc: 'Bombs scatter three bomblets when they burst.', requires: 'cluster', baseCost: 400_000, growth: 1, max: 1, show: perk },
  { id: 'twin', name: 'TWIN LASERS', desc: 'Every laser strike fires two beams.', requires: 'twin', baseCost: 1_500_000, growth: 1, max: 1, show: perk },
  { id: 'goldRain', name: 'GOLDEN STORMS', desc: 'Pixel rain carries golden pixels.', requires: 'goldRain', baseCost: 5_000_000, growth: 1, max: 1, show: perk },
  { id: 'rainbow', name: 'RAINBOW MODE', desc: 'Rare rainbow pixels. Pop one and every pixel pays x10 or more while it lasts. Levels: bigger, longer, more often.', requires: 'rainbow', baseCost: 100_000_000, growth: 2.2, max: 9, show: (l) => off(l, () => `x${F.rainbowMult(l)} ${F.rainbowDuration(l).toFixed(1)}s`) },
  { id: 'overclock', name: 'OVERCLOCK', desc: 'Drones, bombs, lasers and storms run 25% faster.', requires: 'overclock', baseCost: 150_000_000, growth: 1, max: 1, show: perk },
  { id: 'pierce', name: 'ARMOR PIERCING', desc: 'Every hit on the boss does more damage.', requires: 'boss', baseCost: 250_000_000, growth: 1.8, max: 25, show: (l) => x(F.pierceMult(l)) },
]

export const UPGRADE_MAP = Object.fromEntries(UPGRADES.map((d) => [d.id, d])) as Record<UpgradeId, UpgradeDef>

/** Price of the next level. Every REBOOT multiplies all prices. */
export function costOf(id: UpgradeId, level: number, reboots = 0): number {
  const d = UPGRADE_MAP[id]
  return F.upgradeCost(d.baseCost, d.growth, level) * F.rebootPriceMult(reboots)
}

export function isUnlocked(state: SaveState, id: UpgradeId): boolean {
  if (state.level < UPGRADES_UNLOCK_LEVEL) return false
  const { requires, minLevel } = UPGRADE_MAP[id]
  if (minLevel !== undefined && state.level < minLevel) return false
  return !requires || hasFeature(state.level, requires)
}

/** The level at which an upgrade first appears in the shop. */
export function unlockLevelOf(def: UpgradeDef): number {
  return Math.max(UPGRADES_UNLOCK_LEVEL, def.minLevel ?? 0, def.requires ? levelForFeature(def.requires) : 0)
}

export function isMaxed(state: SaveState, id: UpgradeId): boolean {
  return state.upgrades[id] >= UPGRADE_MAP[id].max
}

/** How many levels of `id` the player can afford right now, and their total cost. */
export function maxPurchase(state: SaveState, id: UpgradeId): { count: number; cost: number } {
  if (!isUnlocked(state, id)) return { count: 0, cost: 0 }
  const max = UPGRADE_MAP[id].max
  let lvl = state.upgrades[id]
  let money = state.pixels
  let count = 0
  let cost = 0
  while (lvl < max) {
    const c = costOf(id, lvl, state.reboots)
    if (c > money) break
    money -= c
    cost += c
    lvl++
    count++
  }
  return { count, cost }
}
