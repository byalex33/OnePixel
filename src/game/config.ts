/** Fixed simulation rate. Progression never depends on render FPS. */
export const TICK_RATE = 60
export const DT = 1 / TICK_RATE

/**
 * The arena is measured in world units. Its *area* is constant across devices
 * (only the aspect ratio follows the screen) so pixel density, blast radii and
 * balance feel the same on a phone and on a widescreen monitor.
 */
export const WORLD_AREA = 240 * 160
export const PIXEL_SIZE = 5
export const SPAWN_MARGIN = 9
export const MIN_SPAWN_DIST = 11

/** The upgrade shop opens at this level. Before that it is just you and the pixel. */
export const UPGRADES_UNLOCK_LEVEL = 2

/** Blue pixels are an XP treat; they hit the shop at the first scenery stage. */
export const BLUE_LEVEL = 3
export const BLUE_XP_MULT = 10

export const COMBO_WINDOW = 1.6
export const COMBO_STEP = 0.03

export const GOLDEN_LIFETIME = 5.5
export const GOLDEN_MULT = 25
export const GOLDEN_XP_MULT = 5

/** Rainbow pixels: pop one and every pixel pays x5 while rainbow mode lasts. */
export const RAINBOW_LIFETIME = 4.5
export const RAINBOW_MULT = 5

export const BOMB_FUSE = 1.1
export const BOMBLET_FUSE = 0.45
export const BOMBLET_RADIUS = 13

export const CHAIN_RADIUS = 13
export const CHAIN_DELAY = 0.085
export const CHAIN_MAX_DEPTH = 14

export const LASER_CHARGE = 0.45
export const LASER_FIRE = 0.28
export const LASER_WIDTH = 5

export const RAIN_RATE = 9 // pixels per second
export const RAIN_SPEED = 34

export const NUKE_WARMUP = 1.3
export const FRENZY_TIME = 6
export const FRENZY_RESPAWN_MULT = 0.08

export const MAX_OFFLINE_SECONDS = 4 * 3600
export const MIN_OFFLINE_SECONDS = 30
export const OFFLINE_EFFICIENCY = 0.5

export const SAVE_KEY = 'onepixel.save'
export const SAVE_VERSION = 1
export const AUTOSAVE_SECONDS = 15

/** The boss: a giant stuck pixel that surfaces from beneath the grid at level 20. */
export const BOSS_NAME = 'DEAD PIXEL'
/** Half the width of its square body, in world units. */
export const BOSS_RADIUS = 13
export const BOSS_RISE = 1.6
export const BOSS_SINK = 1.2
/** Seconds the player has to finish it before it burrows back down. */
export const BOSS_FIGHT_TIME = 60
export const BOSS_INTERVAL = 180
export const BOSS_FIRST_DELAY = 6
export const BOSS_SPEED = 9
export const BOSS_ENRAGED_SPEED = 17
export const BOSS_ENRAGE_AT = 0.5
export const BOSS_EAT_INTERVAL = 2.5
export const BOSS_ENRAGED_EAT_INTERVAL = 1.5
/** How far beyond its body it can reach to swallow a pixel. */
export const BOSS_EAT_REACH = 12
/** Fraction of max HP healed per pixel swallowed. */
export const BOSS_EAT_HEAL = 0.02
/** An escaped boss comes back with the damage it took, minus this much recovery. */
export const BOSS_ESCAPE_RECOVER = 0.15
/** Damage per hit by source, before armor piercing (and, for taps, crits and combos). */
export const BOSS_DAMAGE = { click: 10, drone: 1, chain: 4, bomblet: 12, bomb: 35, laser: 25 } as const
/** A nuke takes this fraction of max HP, once per fight (late-game nukes recharge in seconds). */
export const BOSS_NUKE_FRACTION = 0.2
/** Defeat pays this many pixel values per tier, plus a slice of the XP bar. */
export const BOSS_REWARD_VALUE = 150
export const BOSS_REWARD_XP_FRAC = 0.1
export const BOSS_LOOT_BASE = 12
export const BOSS_LOOT_PER_TIER = 2
export const BOSS_LOOT_MAX = 30
