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

/** The fox moves in when the ground appears (first scenery stage). */
export const FOX_LEVEL = 3
/** Seconds for each leg of a fox leap (out to the pixel, then back home), scaled by distance. */
export const FOX_LEG_MIN = 0.35
export const FOX_LEG_MAX = 0.75
export const FOX_CATCH_RADIUS = 8
/** Wandering: walking speed (world units/s) and how long it sits between strolls. */
export const FOX_WALK_SPEED = 16
export const FOX_REST_MIN = 1.2
export const FOX_REST_MAX = 3.5

export const COMBO_WINDOW = 1.6
export const COMBO_STEP = 0.03

export const GOLDEN_LIFETIME = 5.5
export const GOLDEN_MULT = 25
export const GOLDEN_XP_MULT = 5

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
