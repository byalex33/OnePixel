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

/** Rainbow pixels: pop one and every pixel pays extra (see `rainbowMult`) while rainbow mode lasts. */
export const RAINBOW_LIFETIME = 4.5

export const BOMB_FUSE = 1.1
/** Cluster bomblets are lobbed across the map, then blink briefly before bursting. */
export const CLUSTER_BOMBLETS = 3
export const BOMBLET_FLIGHT = 0.55 // base seconds in the air; longer throws take longer
export const BOMBLET_FUSE = 0.18
export const BOMBLET_RADIUS = 13

export const CHAIN_RADIUS = 13
export const CHAIN_DELAY = 0.085
export const CHAIN_MAX_DEPTH = 14
/** How far a chain can jump to reach its next pixel. */
export const CHAIN_JUMP = 48

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

/**
 * PIXEL ZERO, the final boss: the very first pixel. It surfaces instead of the
 * regular boss once every FINAL_EVERY kills. Killing it crashes the screen.
 */
export const FINAL_NAME = 'PIXEL ZERO'
export const FINAL_EVERY = 5
export const FINAL_RADIUS = 22
export const FINAL_SPEED = 6
export const FINAL_ENRAGED_SPEED = 11
export const FINAL_FIGHT_TIME = 90
/** A slower, more dramatic rise than the regular boss, while it pulls the arena into itself. */
export const FINAL_RISE = 3
/** Seconds of death animation (shatter, collapse to one pixel, screen switch-off) before the crash screen. */
export const FINAL_DEATH = 4
/** Max HP of the first PIXEL ZERO; each later one (infinite mode) doubles it. */
export const FINAL_HP = 400_000
/** It heals far less than the regular boss, from eating and between attempts, so persistence wins. */
export const FINAL_EAT_HEAL = 0.0025
export const FINAL_ESCAPE_RECOVER = 0.05
/** A nuke takes a fair chunk, once per fight. */
export const FINAL_NUKE_FRACTION = 0.1
/** Bombs and lasers hit PIXEL ZERO much harder than regular bosses, so the machines pull their weight. */
export const FINAL_MACHINE_MULT: Partial<Record<'bomb' | 'bomblet' | 'laser', number>> = { bomb: 8, bomblet: 8, laser: 4 }
export const FINAL_REWARD_VALUE = 2000
export const FINAL_REWARD_XP_FRAC = 0.5
/** Weak spots: only taps can hit them, for extra damage. They hop elsewhere when hit and every few seconds. */
export const FINAL_SPOTS = 2
export const FINAL_SPOT_RADIUS = 4.5
export const FINAL_SPOT_MULT = 5
export const FINAL_SPOT_MOVE = 3.5
/** EMP: the core charges up. Tap it before it fires, or your drones are jammed for a while. */
export const FINAL_EMP_INTERVAL = 14
export const FINAL_EMP_ENRAGED_INTERVAL = 9
export const FINAL_EMP_CHARGE = 2.5
export const FINAL_EMP_JAM = 5
export const FINAL_CORE_RADIUS = 6
export const FINAL_CORE_MULT = 3

/** Each REBOOT (prestige): prices x2 and bosses x1.6 tougher, but pixels are worth x2.5 more, for good. */
export const REBOOT_PRICE_MULT = 2
export const REBOOT_BOSS_HP_MULT = 1.6
export const REBOOT_VALUE_MULT = 2.5
