import type { FeatureId } from './types'

export interface LevelDef {
  level: number
  feature: FeatureId
  title: string
  desc: string
}

/**
 * Levels unlock *mechanics*, not stat bumps. Reaching a level stocks the shop
 * with that mechanic's upgrade at level 0; nothing happens until the player
 * buys level 1.
 */
export const LEVELS: LevelDef[] = [
  { level: 2, feature: 'second', title: 'EXTRA PIXELS', desc: 'The upgrade shop opens. Buy EXTRA PIXEL to add more pixels to the arena.' },
  { level: 3, feature: 'crit', title: 'CRITICAL HITS', desc: 'Buy CRIT CHANCE to start landing x3 critical hits. BLUE PIXELS are in stock too.' },
  { level: 4, feature: 'combo', title: 'COMBOS', desc: 'Buy COMBOS so quick pops stack a multiplier. XP GAIN is in stock too.' },
  { level: 5, feature: 'blast', title: 'BLAST RADIUS', desc: 'Buy BLAST RADIUS to make your taps explode.' },
  { level: 6, feature: 'drone', title: 'AUTO DESTROYER', desc: 'Buy a drone and it hunts pixels for you.' },
  { level: 7, feature: 'golden', title: 'GOLDEN PIXELS', desc: 'Buy GOLDEN PIXELS for rare x25 spawns. Drones cannot catch them.' },
  { level: 8, feature: 'chain', title: 'CHAIN REACTIONS', desc: 'Buy CHAIN REACTION so pixels can detonate their neighbours.' },
  { level: 9, feature: 'bomb', title: 'BOMBS', desc: 'Buy BOMB BAY to drop bombs into crowds. Tap one to detonate it early.' },
  { level: 10, feature: 'rain', title: 'PIXEL RAIN', desc: 'Buy PIXEL RAIN to summon storms of falling pixels.' },
  { level: 11, feature: 'laser', title: 'LASERS', desc: 'Buy LASERS for an orbital beam that slices the arena.' },
  { level: 12, feature: 'nuke', title: 'THE NUKE', desc: 'Build a NUKE SILO, charge it with kills, then wipe the board.' },
  { level: 13, feature: 'swarm', title: 'DRONE SWARM', desc: 'Buy DRONE SWARM to add two drones to your fleet.' },
  { level: 14, feature: 'cluster', title: 'CLUSTER BOMBS', desc: 'Buy CLUSTER BOMBS so bombs scatter bomblets.' },
  { level: 15, feature: 'twin', title: 'TWIN LASERS', desc: 'Buy TWIN LASERS to fire two beams per strike.' },
  { level: 16, feature: 'goldRain', title: 'GOLDEN STORMS', desc: 'Buy GOLDEN STORMS so rain carries golden pixels.' },
  { level: 17, feature: 'rainbow', title: 'RAINBOW MODE', desc: 'Buy RAINBOW MODE for rare rainbow pixels. Pop one and every pixel pays x10 or more for a few seconds.' },
  { level: 18, feature: 'overclock', title: 'OVERCLOCK', desc: 'Buy OVERCLOCK to run every machine 25% faster.' },
  { level: 20, feature: 'boss', title: 'SIGNAL', desc: 'Something has surfaced beneath the grid. Destroy it before it burrows back down. ARMOR PIERCING is in stock.' },
]

const featureLevel = new Map<FeatureId, number>(LEVELS.map((l) => [l.feature, l.level]))

export function levelForFeature(feature: FeatureId): number {
  return featureLevel.get(feature) ?? Infinity
}

export function hasFeature(level: number, feature: FeatureId): boolean {
  return level >= levelForFeature(feature)
}

export function levelDef(level: number): LevelDef | undefined {
  return LEVELS.find((l) => l.level === level)
}

/** Unlocks the player can see coming: the next `visible` are named, the rest are `???`. */
export function upcomingUnlocks(level: number, visible = 2): { def: LevelDef; hidden: boolean }[] {
  return LEVELS.filter((l) => l.level > level).map((def, i) => ({ def, hidden: i >= visible }))
}
