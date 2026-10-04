export type UpgradeId =
  | 'respawn'
  | 'value'
  | 'multi'
  | 'critChance'
  | 'critPower'
  | 'xp'
  | 'combo'
  | 'auto'
  | 'blast'
  | 'golden'
  | 'chain'
  | 'bomb'
  | 'rain'
  | 'laser'
  | 'nukeCharge'
  | 'nukeYield'
  | 'swarm'
  | 'cluster'
  | 'twin'
  | 'goldRain'
  | 'overclock'
  | 'fox'

export type FeatureId =
  | 'second'
  | 'crit'
  | 'combo'
  | 'drone'
  | 'blast'
  | 'golden'
  | 'chain'
  | 'bomb'
  | 'rain'
  | 'laser'
  | 'nuke'
  | 'swarm'
  | 'cluster'
  | 'twin'
  | 'goldRain'
  | 'overclock'
  | 'signal'

export type UpgradeLevels = Record<UpgradeId, number>

export interface LifetimeStats {
  kills: number
  clicks: number
  manualKills: number
  crits: number
  goldenKills: number
  droneKills: number
  bombKills: number
  laserKills: number
  chainKills: number
  rainKills: number
  nukes: number
  maxCombo: number
  bestMultiClick: number
  bestChain: number
  bestBomb: number
  bestLaser: number
  bestStorm: number
  mostOnScreen: number
  foxKills: number
  playTime: number
}

export interface Settings {
  sound: boolean
  music: boolean
  shake: boolean
  haptics: boolean
}

/** Everything that persists between sessions. Entities on screen are transient. */
export interface SaveState {
  pixels: number
  totalPixels: number
  xp: number
  level: number
  upgrades: UpgradeLevels
  achievements: string[]
  stats: LifetimeStats
  nukeCharge: number
  rainTimer: number
  seenUpgrades: UpgradeId[]
  reveal: { hud: boolean; panel: boolean }
  settings: Settings
}

export type PixelKind = 'normal' | 'golden' | 'rain'
export type Cause = 'click' | 'drone' | 'chain' | 'bomb' | 'laser' | 'nuke' | 'fox'

export type GameEvent =
  | {
      type: 'pop'
      x: number
      y: number
      kind: PixelKind
      amount: number
      xp: number
      crit: boolean
      cause: Cause
      combo: number
    }
  | { type: 'spawn'; x: number; y: number; kind: PixelKind }
  | { type: 'miss'; x: number; y: number }
  | { type: 'blast'; x: number; y: number; r: number; cause: Cause }
  | { type: 'bomb-drop'; x: number; y: number }
  | { type: 'laser-fire'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'drone-zap'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'golden-expire'; x: number; y: number }
  | { type: 'rain-start' }
  | { type: 'rain-end'; caught: number }
  | { type: 'nuke-warn' }
  | { type: 'nuke'; count: number; amount: number }
  | { type: 'levelup'; level: number }
  | { type: 'achievement'; id: string }
  | { type: 'buy'; id: UpgradeId; level: number }
  | { type: 'denied' }
