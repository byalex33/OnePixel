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
  | 'rainbow'
  | 'blue'
  | 'pierce'

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
  | 'rainbow'
  | 'overclock'
  | 'boss'

export type UpgradeLevels = Record<UpgradeId, number>

export interface LifetimeStats {
  kills: number
  clicks: number
  manualKills: number
  crits: number
  goldenKills: number
  blueKills: number
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
  playTime: number
  bossKills: number
  bossEscapes: number
  /** PIXEL ZERO kills this run. */
  finalKills: number
}

export interface Settings {
  sound: boolean
  music: boolean
  /** Launch the nuke as soon as it charges. Only offered once NUKE SILO is maxed. */
  autoNuke: boolean
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
  /** Seconds until the next boss surfaces. Sits at 0 while one is up. */
  bossTimer: number
  /** Fraction of max HP the next boss surfaces with. Below 1 after one escapes wounded. */
  bossHealth: number
  seenUpgrades: UpgradeId[]
  reveal: { hud: boolean; panel: boolean }
  settings: Settings
  /** Times the player has chosen REBOOT (prestige). Everything costs more and pays more. */
  reboots: number
  /** PIXEL ZERO is dead and the crash screen is waiting for REBOOT or CONTINUE. */
  crashPending: boolean
}

export type PixelKind = 'normal' | 'golden' | 'blue' | 'rain' | 'rainbow'
export type Cause = 'click' | 'drone' | 'chain' | 'bomb' | 'laser' | 'nuke'
export type BossDamageSource = Exclude<Cause, 'nuke'> | 'bomblet'

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
  | { type: 'blast'; x: number; y: number; r: number; cause: Cause; mini?: boolean }
  | { type: 'bomb-drop'; x: number; y: number }
  | { type: 'laser-fire'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'drone-zap'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'chain-arc'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'expire'; x: number; y: number; kind: PixelKind }
  | { type: 'rainbow-start'; duration: number }
  | { type: 'rainbow-end' }
  | { type: 'rain-start' }
  | { type: 'rain-end'; caught: number }
  | { type: 'nuke-warn' }
  | { type: 'nuke'; count: number; amount: number }
  | { type: 'boss-rise'; x: number; y: number; tier: number; final: boolean }
  | { type: 'boss-hit'; x: number; y: number; dmg: number; crit: boolean; source: BossDamageSource | 'nuke'; weak?: boolean }
  | { type: 'boss-enrage'; x: number; y: number }
  | { type: 'boss-eat'; x: number; y: number }
  | { type: 'boss-defeat'; x: number; y: number; tier: number; amount: number }
  | { type: 'boss-escape'; x: number; y: number }
  | { type: 'emp-charge'; x: number; y: number }
  | { type: 'emp-blocked'; x: number; y: number }
  | { type: 'emp'; x: number; y: number }
  | { type: 'final-defeat'; x: number; y: number; amount: number }
  /** PIXEL ZERO pulls every pixel on screen into itself; points are flattened x, y pairs. */
  | { type: 'final-absorb'; x: number; y: number; points: number[] }
  | { type: 'final-surfaced'; x: number; y: number }
  | { type: 'levelup'; level: number }
  | { type: 'achievement'; id: string }
  | { type: 'buy'; id: UpgradeId; level: number }
  | { type: 'denied' }
