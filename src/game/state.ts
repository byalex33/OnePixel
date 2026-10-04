import type { LifetimeStats, SaveState, UpgradeLevels } from './types'
import { UPGRADES } from './upgrades'
import { rainInterval } from './formulas'

export function emptyUpgrades(): UpgradeLevels {
  return Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as UpgradeLevels
}

export function emptyStats(): LifetimeStats {
  return {
    kills: 0,
    clicks: 0,
    manualKills: 0,
    crits: 0,
    goldenKills: 0,
    droneKills: 0,
    bombKills: 0,
    laserKills: 0,
    chainKills: 0,
    rainKills: 0,
    nukes: 0,
    maxCombo: 0,
    bestMultiClick: 0,
    bestChain: 0,
    bestBomb: 0,
    bestLaser: 0,
    bestStorm: 0,
    mostOnScreen: 0,
    foxKills: 0,
    playTime: 0,
  }
}

export function createInitialState(): SaveState {
  return {
    pixels: 0,
    totalPixels: 0,
    xp: 0,
    level: 1,
    upgrades: emptyUpgrades(),
    achievements: [],
    stats: emptyStats(),
    nukeCharge: 0,
    // First storm arrives a little sooner than the regular interval.
    rainTimer: rainInterval(0) * 0.4,
    seenUpgrades: [],
    reveal: { hud: false, panel: false },
    settings: { sound: true, music: true, shake: true, haptics: true },
  }
}
