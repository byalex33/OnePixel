import { COMBO_STEP, FOX_LEVEL } from './config'
import { hasFeature } from './levels'
import type { FeatureId, SaveState, UpgradeId } from './types'

/*
 * Every stat curve lives here as a pure function so the upgrade panel, the
 * simulation, offline progress and the tests all agree on the numbers.
 *
 * Mechanics are never given away: reaching a level only puts an upgrade in the
 * shop at level 0, which does nothing. Level 1 switches the mechanic on, and
 * each level after that improves it. `n(l)` is the number of improvements.
 */
const n = (l: number) => Math.max(0, l - 1)

export const respawnTime = (l: number) => Math.max(0.3, 2.0 * Math.pow(0.85, l))
export const valueMult = (l: number) => (1 + l) * Math.pow(1.05, l)
export const xpMult = (l: number) => 1 + 0.15 * l
export const critChance = (l: number) => (l <= 0 ? 0 : Math.min(0.5, 0.05 + 0.035 * n(l)))
export const critMult = (l: number) => 3 + 0.5 * l
export const comboCap = (l: number) => (l <= 0 ? 0 : 10 + 5 * n(l))
/** Drones are bought, never given: level 0 means no drones, even with the swarm unlock. */
export const droneCount = (l: number, swarm: boolean) => (l <= 0 ? 0 : 1 + Math.floor((l - 1) / 3) + (swarm ? 2 : 0))
export const droneCooldown = (l: number) => 1.5 * Math.pow(0.88, n(l))
export const droneSpeed = (l: number) => 60 * Math.pow(1.07, n(l))
export const foxCooldown = (l: number) => (l <= 0 ? Infinity : 4 * Math.pow(0.86, n(l)))
export const foxRange = (l: number) => 75 + 8 * n(l)
export const blastRadius = (l: number) => (l <= 0 ? 0 : 9 + 3 * n(l))
export const goldenChance = (l: number) => (l <= 0 ? 0 : Math.min(0.25, 0.04 + 0.015 * n(l)))
export const chainChance = (l: number) => (l <= 0 ? 0 : Math.min(0.55, 0.06 + 0.05 * n(l)))
export const bombInterval = (l: number) => (l <= 0 ? Infinity : 14 * Math.pow(0.88, n(l)))
export const bombRadius = (l: number) => 24 + 2 * n(l)
export const rainInterval = (l: number) => 75 * Math.pow(0.9, n(l))
export const rainDuration = (l: number) => 8 + 0.6 * n(l)
export const laserInterval = (l: number) => (l <= 0 ? Infinity : 7 * Math.pow(0.86, n(l)))
export const nukeKills = (l: number) => (l <= 0 ? Infinity : Math.round(300 * Math.pow(0.88, n(l))))
export const nukeYield = (l: number) => 10 + 5 * l
export const levelBonus = (level: number) => 1 + 0.05 * (level - 1)
export const achievementBonus = (n: number) => 1 + 0.02 * n
export const comboMult = (count: number, cap: number) => 1 + COMBO_STEP * Math.min(count, cap)
export const OVERCLOCK = 0.8

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => Math.round(10 * Math.pow(2.0, level - 1))

export const upgradeCost = (base: number, growth: number, level: number) =>
  Math.floor(base * Math.pow(growth, level))

export interface Stats {
  respawnTime: number
  maxPixels: number
  /** Pixels per normal kill before crit / combo / golden. */
  value: number
  xpPerKill: number
  critChance: number
  critMult: number
  comboCap: number
  drones: number
  droneCooldown: number
  droneSpeed: number
  blastRadius: number
  foxEnabled: boolean
  foxCooldown: number
  foxRange: number
  goldenChance: number
  chainChance: number
  bombInterval: number
  bombRadius: number
  cluster: boolean
  rainInterval: number
  rainDuration: number
  rainEnabled: boolean
  goldRain: boolean
  laserInterval: number
  laserBeams: number
  nukeEnabled: boolean
  nukeKills: number
  nukeYield: number
}

export function computeStats(s: SaveState): Stats {
  const u = s.upgrades
  // Feature gates guard against hand-edited saves; normally the shop enforces them.
  const has = (id: UpgradeId, feature: FeatureId) => u[id] > 0 && hasFeature(s.level, feature)
  const oc = has('overclock', 'overclock') ? OVERCLOCK : 1
  return {
    respawnTime: respawnTime(u.respawn),
    maxPixels: 1 + (has('multi', 'second') ? u.multi : 0),
    value: valueMult(u.value) * levelBonus(s.level) * achievementBonus(s.achievements.length),
    xpPerKill: xpMult(u.xp),
    critChance: has('critChance', 'crit') ? critChance(u.critChance) : 0,
    critMult: critMult(u.critPower),
    comboCap: has('combo', 'combo') ? comboCap(u.combo) : 0,
    drones: has('auto', 'drone') ? droneCount(u.auto, has('swarm', 'swarm')) : 0,
    droneCooldown: droneCooldown(u.auto) * oc,
    droneSpeed: droneSpeed(u.auto),
    blastRadius: has('blast', 'blast') ? blastRadius(u.blast) : 0,
    foxEnabled: u.fox > 0 && s.level >= FOX_LEVEL,
    foxCooldown: foxCooldown(u.fox),
    foxRange: foxRange(u.fox),
    goldenChance: has('golden', 'golden') ? goldenChance(u.golden) : 0,
    chainChance: has('chain', 'chain') ? chainChance(u.chain) : 0,
    bombInterval: has('bomb', 'bomb') ? bombInterval(u.bomb) * oc : Infinity,
    bombRadius: bombRadius(u.bomb),
    cluster: has('cluster', 'cluster'),
    rainInterval: rainInterval(u.rain) * oc,
    rainDuration: rainDuration(u.rain),
    rainEnabled: has('rain', 'rain'),
    goldRain: has('goldRain', 'goldRain'),
    laserInterval: has('laser', 'laser') ? laserInterval(u.laser) * oc : Infinity,
    laserBeams: has('twin', 'twin') ? 2 : 1,
    nukeEnabled: has('nukeCharge', 'nuke'),
    nukeKills: has('nukeCharge', 'nuke') ? nukeKills(u.nukeCharge) : Infinity,
    nukeYield: nukeYield(u.nukeYield),
  }
}
