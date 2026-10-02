/** Limited palette. Mostly monochrome; colour is reserved for gameplay signals. */
export const PAL = {
  bg: '#171717',
  dot: '122,122,122', // #7a7a7a as an rgb triplet for rgba()
  ink: '#d4d4d4',
  white: '#f2f2f2',
  light: '#bdbdbd',
  mid: '#7a7a7a',
  dark: '#3a3a3a',
  gold: '#ffcc33',
  red: '#ff4d3d',
  cyan: '#5ee6ff',
  orange: '#ff9a2e',
  pink: '#ff77a8',
} as const

/** Indexed colours for the particle system (drawn in batches per colour). */
export const PARTICLE_COLORS = [PAL.white, PAL.light, PAL.mid, PAL.gold, PAL.red, PAL.cyan, PAL.orange, PAL.dark]
export const C_WHITE = 0
export const C_LIGHT = 1
export const C_MID = 2
export const C_GOLD = 3
export const C_RED = 4
export const C_CYAN = 5
export const C_ORANGE = 6
export const C_DARK = 7
