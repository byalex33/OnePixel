import type { KernelId, KernelLevels, SaveState, UpgradeId } from './types'

/*
 * The KERNEL: permanent upgrades bought with CORE BITS, which only REBOOT pays out.
 * Three branches of five nodes; each node needs the one before it in its branch.
 * BOOT makes runs faster, OVERRIDE bends the rules, EXPLOIT adds new mechanics.
 */

export type KernelBranch = 'boot' | 'override' | 'exploit'

export interface KernelDef {
  id: KernelId
  branch: KernelBranch
  name: string
  desc: string
  /** Bits for each level, in order. Its length is the max level. */
  costs: number[]
  /** The node before it in its branch, which needs at least one level first. */
  requires?: KernelId
  /** Only takes effect from the next REBOOT. */
  atBoot?: boolean
  /** What the node does at a given level, for the board. */
  show: (l: number) => string
}

export const BRANCHES: { id: KernelBranch; name: string; desc: string }[] = [
  { id: 'boot', name: 'BOOT', desc: 'Faster runs' },
  { id: 'override', name: 'OVERRIDE', desc: 'Rule changes' },
  { id: 'exploit', name: 'EXPLOIT', desc: 'New mechanics' },
]

/** FAST BOOT: the level each run starts at. */
export const FAST_BOOT_LEVELS = [1, 3, 6, 9]
/** STARTER KIT: upgrade levels each run starts with, per kit level. */
export const STARTER_KIT: Partial<Record<UpgradeId, number>> = { respawn: 2, value: 3, multi: 2, xp: 2 }
/** CACHED PERKS: one-off perks owned from the start of a run, by tier. */
export const CACHED_PERKS: UpgradeId[][] = [['swarm', 'cluster'], ['twin', 'goldRain'], ['overclock']]
/** GLITCH PIXEL: odds a respawn comes back as a glitch pixel, by level. */
export const GLITCH_CHANCE = [0, 0.02, 0.035, 0.05]
/** OVERFLOW: the share of the nuke's charge kept after it fires. */
export const OVERFLOW_KEEP = 0.5
/** KERNEL PANIC: PIXEL ZERO surfaces after this many regular kills instead of FINAL_EVERY. */
export const PANIC_EVERY = 3

export const xpBoost = (l: number) => 1 + 0.25 * l
export const rootAccess = (l: number) => 1 + 0.5 * l
export const bitMiner = (l: number) => 1 + 0.25 * l

const pct = (n: number) => `+${Math.round(n * 100)}%`
const onOff = (l: number) => (l > 0 ? 'ON' : 'OFF')

export const KERNEL: KernelDef[] = [
  // BOOT
  { id: 'xpBoost', branch: 'boot', name: 'XP BOOST', desc: 'Every pixel gives more XP, so you level faster.', costs: [2, 3, 4, 5, 6], show: (l) => pct(xpBoost(l) - 1) },
  {
    id: 'fastBoot',
    branch: 'boot',
    name: 'FAST BOOT',
    desc: 'Start each run at a higher level, with its unlocks in stock.',
    costs: [4, 6, 9],
    requires: 'xpBoost',
    atBoot: true,
    show: (l) => `LV ${FAST_BOOT_LEVELS[l]}`,
  },
  {
    id: 'starterKit',
    branch: 'boot',
    name: 'STARTER KIT',
    desc: 'Start each run with RESPAWN, PIXEL VALUE, EXTRA PIXEL and XP GAIN already upgraded.',
    costs: [3, 4, 6],
    requires: 'fastBoot',
    show: (l) => (l === 0 ? 'NONE' : `KIT ${l}`),
  },
  {
    id: 'cachedPerks',
    branch: 'boot',
    name: 'CACHED PERKS',
    desc: 'One-off perks are yours the moment they unlock: SWARM and CLUSTER, then TWIN and GOLDEN STORMS, then OVERCLOCK.',
    costs: [5, 7, 10],
    requires: 'starterKit',
    show: (l) => `${CACHED_PERKS.slice(0, l).flat().length}/5`,
  },
  { id: 'bitMiner', branch: 'boot', name: 'BIT MINER', desc: 'Every REBOOT pays out more CORE BITS.', costs: [6, 10], requires: 'cachedPerks', show: (l) => pct(bitMiner(l) - 1) },
  // OVERRIDE
  { id: 'script', branch: 'override', name: 'SCRIPT', desc: 'An auto-buyer that keeps buying the cheapest upgrade. Switch it off any time in UPGRADES.', costs: [3], show: onOff },
  {
    id: 'stickyCombo',
    branch: 'override',
    name: 'STICKY COMBO',
    desc: 'Level 1: combos last twice as long. Level 2: they never run out, but a miss still breaks them.',
    costs: [4, 10],
    requires: 'script',
    show: (l) => (l === 0 ? 'OFF' : l === 1 ? 'x2 TIME' : 'NO LIMIT'),
  },
  { id: 'goldMagnet', branch: 'override', name: 'GOLD MAGNET', desc: 'Drones can catch golden pixels too.', costs: [6], requires: 'stickyCombo', show: onOff },
  {
    id: 'autoLaunch',
    branch: 'override',
    name: "DEAD MAN'S SWITCH",
    desc: 'AUTO nuke from the first NUKE SILO level, instead of only once it is maxed.',
    costs: [5],
    requires: 'goldMagnet',
    show: onOff,
  },
  {
    id: 'doubleRainbow',
    branch: 'override',
    name: 'DOUBLE RAINBOW',
    desc: 'Rainbow pixels keep coming during rainbow mode, and popping one adds its time on top.',
    costs: [10],
    requires: 'autoLaunch',
    show: onOff,
  },
  // EXPLOIT
  { id: 'rootAccess', branch: 'exploit', name: 'ROOT ACCESS', desc: 'Every hit on a boss does more damage.', costs: [2, 4, 6, 9], show: (l) => `x${rootAccess(l)}` },
  { id: 'magnet', branch: 'exploit', name: 'MAGNET', desc: 'Pixels drift towards the last place you tapped, so blasts catch more.', costs: [6], requires: 'rootAccess', show: onOff },
  { id: 'overflow', branch: 'exploit', name: 'OVERFLOW', desc: 'The nuke keeps half its charge after it fires.', costs: [8], requires: 'magnet', show: (l) => (l > 0 ? '50% KEPT' : 'OFF') },
  {
    id: 'glitch',
    branch: 'exploit',
    name: 'GLITCH PIXEL',
    desc: 'Rare glitch pixels copy the last special you hit: a golden payout, blue XP, a rainbow or a bomb blast.',
    costs: [8, 10, 14],
    requires: 'overflow',
    show: (l) => (l === 0 ? 'OFF' : pct(GLITCH_CHANCE[l]).slice(1)),
  },
  {
    id: 'kernelPanic',
    branch: 'exploit',
    name: 'KERNEL PANIC',
    desc: `PIXEL ZERO surfaces after ${PANIC_EVERY} boss kills instead of 5.`,
    costs: [15],
    requires: 'glitch',
    show: (l) => (l > 0 ? `EVERY ${PANIC_EVERY}` : 'EVERY 5'),
  },
]

export const KERNEL_MAP = Object.fromEntries(KERNEL.map((d) => [d.id, d])) as Record<KernelId, KernelDef>
export const KERNEL_IDS = KERNEL.map((d) => d.id)
/** Bits to install every node at every level. */
export const KERNEL_TOTAL = KERNEL.reduce((sum, d) => sum + d.costs.reduce((a, b) => a + b, 0), 0)

export function emptyKernel(): KernelLevels {
  return Object.fromEntries(KERNEL_IDS.map((id) => [id, 0])) as KernelLevels
}

export const kernelMax = (id: KernelId) => KERNEL_MAP[id].costs.length

/** Bits for the next level, or null when maxed. */
export function kernelCost(state: SaveState, id: KernelId): number | null {
  return KERNEL_MAP[id].costs[state.kernel[id]] ?? null
}

export function kernelReachable(state: SaveState, id: KernelId): boolean {
  const req = KERNEL_MAP[id].requires
  return !req || state.kernel[req] > 0
}

export function canInstall(state: SaveState, id: KernelId): boolean {
  const cost = kernelCost(state, id)
  return cost !== null && kernelReachable(state, id) && state.bits >= cost
}

/** Spend bits on the next level of a node. Returns false if it can't be bought. */
export function install(state: SaveState, id: KernelId): boolean {
  if (!canInstall(state, id)) return false
  state.bits -= kernelCost(state, id)!
  state.kernel[id]++
  // Kits apply straight away too; FAST BOOT waits for the next run.
  applyKits(state)
  return true
}

/** STARTER KIT and CACHED PERKS: raise owned upgrades to what the kernel hands out. Never lowers anything. */
export function applyKits(state: SaveState): void {
  const kit = state.kernel.starterKit
  if (kit > 0) for (const [id, per] of Object.entries(STARTER_KIT) as [UpgradeId, number][]) state.upgrades[id] = Math.max(state.upgrades[id], per * kit)
  for (const id of CACHED_PERKS.slice(0, state.kernel.cachedPerks).flat()) state.upgrades[id] = Math.max(state.upgrades[id], 1)
}

/** True if every level of every node in the branch is installed. */
export function branchComplete(state: SaveState, branch: KernelBranch): boolean {
  return KERNEL.filter((d) => d.branch === branch).every((d) => state.kernel[d.id] >= d.costs.length)
}

export const installedCount = (state: SaveState) => KERNEL.filter((d) => state.kernel[d.id] > 0).length

// ------------------------------------------------------------------ payout

/** Bits for each PIXEL ZERO and each regular boss killed this run. */
export const BITS_PER_ZERO = 8
export const BITS_PER_BOSS = 2
/** Speed bonus: +1 bit for every SPEED_STEP seconds the first PIXEL ZERO kill beat SPEED_PAR by, up to SPEED_MAX. */
export const SPEED_PAR = 3 * 3600
export const SPEED_STEP = 15 * 60
export const SPEED_MAX = 10

export interface BitsPayout {
  zero: number
  bosses: number
  speed: number
  /** BIT MINER's multiplier. */
  mult: number
  total: number
}

/** What a REBOOT right now would pay. Nothing until PIXEL ZERO has died this run. */
export function bitsForRun(state: SaveState): BitsPayout {
  const st = state.stats
  if (st.finalKills <= 0) return { zero: 0, bosses: 0, speed: 0, mult: 1, total: 0 }
  const zero = BITS_PER_ZERO * st.finalKills
  const bosses = BITS_PER_BOSS * st.bossKills
  const speed = Math.max(0, Math.min(SPEED_MAX, Math.floor((SPEED_PAR - state.zeroTime) / SPEED_STEP)))
  const mult = bitMiner(state.kernel.bitMiner)
  return { zero, bosses, speed, mult, total: Math.ceil((zero + bosses + speed) * mult) }
}
