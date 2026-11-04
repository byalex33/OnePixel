import { BOSS_FIGHT_TIME, DT, FINAL_FIGHT_TIME } from './config'
import { Game } from './game'
import { canInstall } from './kernel'
import { beginReboot, rebootState } from './prestige'
import type { GameEvent, KernelId, SaveState, UpgradeId } from './types'
import { costOf, isMaxed, isUnlocked, UPGRADES } from './upgrades'

export interface BotOptions {
  /** Average taps per second the simulated player manages. */
  cps: number
  /** Seconds a pixel must be visible before the player reacts to it. */
  reaction: number
  seconds: number
  seed: number
  /** Seconds the nuke sits ready before the player notices and launches it (auto-nuke still fires at once). Default 0. */
  nukeDelay?: number
  /** Upgrades the player saves up for as soon as they reach the shop, instead of buying cheaper levels first. */
  saveFor?: UpgradeId[]
  /** Start from this save instead of a fresh game. */
  start?: SaveState
  /** Sees every simulation event, with the time it happened. */
  onEvent?: (e: GameEvent, t: number) => void
  /** REBOOT this many times when PIXEL ZERO dies (spending bits by KERNEL_PRIORITY), then CONTINUE. Default 0. */
  reboots?: number
  /** The order the bot installs KERNEL nodes in. Defaults to KERNEL_PRIORITY. */
  kernelPriority?: KernelId[]
}

/** A sensible player's KERNEL shopping list: faster runs and boss damage first, then the rule changes. */
export const KERNEL_PRIORITY: KernelId[] = [
  'xpBoost',
  'rootAccess',
  'fastBoot',
  'script',
  'starterKit',
  'stickyCombo',
  'cachedPerks',
  'magnet',
  'goldMagnet',
  'overflow',
  'autoLaunch',
  'bitMiner',
  'glitch',
  'doubleRainbow',
  'kernelPanic',
]

export interface RunLog {
  /** Seconds into the simulation the run started. */
  start: number
  /** Seconds from the run's start to its first PIXEL ZERO kill, or null if it never fell. */
  zero: number | null
  /** Seconds from the run's start to level 20 (bosses), or null. */
  l20: number | null
  /** Boss fights lost (regular and PIXEL ZERO) before the first PIXEL ZERO kill. */
  escapes: number
  /** CORE BITS paid when this run rebooted (0 if it never did). */
  bits: number
  /** Bits left after shopping, and the nodes bought, at that reboot. */
  bank: number
  bought: KernelId[]
}

export interface BotResult {
  /** level -> seconds when reached */
  levelTimes: Map<number, number>
  purchases: { t: number; id: string; level: number }[]
  /** Every boss fight: when it rose, how it ended, and how long it took. */
  bossLog: { t: number; tier: number; outcome: 'defeat' | 'escape'; secs: number }[]
  /** Every PIXEL ZERO fight. */
  finalLog: { t: number; outcome: 'defeat' | 'escape'; secs: number }[]
  /** Lifetime pixels earned, sampled every INCOME_SAMPLE seconds (index i is at i * INCOME_SAMPLE). */
  earned: number[]
  /** One entry per run: the first, then one more for each REBOOT. */
  runs: RunLog[]
  game: Game
}

/**
 * A crude stand-in for an engaged human, used to sanity-check pacing.
 * It taps the oldest reachable pixel (the boss first, then golden and rainbow, then blue), buys the cheapest
 * affordable upgrade (or saves for a `saveFor` one), and launches nukes once they have been ready `nukeDelay` seconds.
 */
export const INCOME_SAMPLE = 5

/** Average pixels/second the bot earned over the `window` seconds before `t`. */
export function incomeAt(r: BotResult, t: number, window = 60): number {
  const i = Math.min(r.earned.length - 1, Math.floor(t / INCOME_SAMPLE))
  const j = Math.max(0, i - Math.round(window / INCOME_SAMPLE))
  return i > j ? (r.earned[i] - r.earned[j]) / ((i - j) * INCOME_SAMPLE) : 0
}

function newGame(state: SaveState | undefined, seed: number): Game {
  const g = new Game(state, seed)
  g.resize(240, 160)
  g.hitRadius = 6
  return g
}

/** Spend every bit the bot can, in priority order. Returns what it bought. */
function shopKernel(g: Game, priority: KernelId[]): KernelId[] {
  const bought: KernelId[] = []
  for (;;) {
    const pick = priority.find((id) => canInstall(g.state, id))
    if (!pick || !g.installKernel(pick)) return bought
    bought.push(pick)
  }
}

export function runBot(opts: BotOptions): BotResult {
  let g = newGame(opts.start && structuredClone(opts.start), opts.seed)
  const runs: RunLog[] = [{ start: 0, zero: null, l20: null, escapes: 0, bits: 0, bank: 0, bought: [] }]
  let rebootsLeft = opts.reboots ?? 0
  const levelTimes = new Map<number, number>([[1, 0]])
  const purchases: BotResult['purchases'] = []
  const bossLog: BotResult['bossLog'] = []
  const finalLog: BotResult['finalLog'] = []
  const earned: number[] = []
  const sampleEvery = Math.round(INCOME_SAMPLE / DT)
  let bossRose = 0
  let clickCd = 0
  let buyCd = 0
  let nukeWait = 0
  const steps = Math.round(opts.seconds / DT)

  for (let i = 0; i < steps; i++) {
    const t = i * DT
    if (i % sampleEvery === 0) earned.push(g.state.totalPixels)
    clickCd -= DT
    if (clickCd <= 0) {
      const candidates = g.pixels.filter((p) => !p.dead && p.age >= opts.reaction && p.y > 0)
      const loot = candidates.find((p) => p.kind === 'golden' || p.kind === 'rainbow' || p.kind === 'glitch')
      const fightTime = g.boss?.final ? FINAL_FIGHT_TIME : BOSS_FIGHT_TIME
      const boss = g.boss && g.boss.phase === 'fight' && g.boss.timeLeft < fightTime - opts.reaction ? g.boss : undefined
      const target = boss ?? loot ?? candidates.find((p) => p.kind === 'blue') ?? candidates.sort((a, b) => b.age - a.age)[0]
      if (target) {
        g.pointerDown(target.x, target.y)
        clickCd = 1 / opts.cps
      }
    }
    buyCd -= DT
    if (buyCd <= 0) {
      buyCd = 1
      for (;;) {
        const options = UPGRADES.filter((u) => isUnlocked(g.state, u.id) && !isMaxed(g.state, u.id))
          .map((u) => ({ id: u.id, cost: costOf(u.id, g.state.upgrades[u.id], g.state.reboots) }))
          .sort((a, b) => a.cost - b.cost)
        const pick = options.find((o) => opts.saveFor?.includes(o.id) && g.state.upgrades[o.id] === 0) ?? options[0]
        if (!pick || pick.cost > g.state.pixels) break
        if (!g.buy(pick.id)) break
        purchases.push({ t, id: pick.id, level: g.state.upgrades[pick.id] })
      }
    }
    nukeWait = g.nukeReady ? nukeWait + DT : 0
    if (g.nukeReady && nukeWait >= (opts.nukeDelay ?? 0)) g.launchNuke()
    g.tick(DT)
    for (const e of g.drainEvents()) {
      opts.onEvent?.(e, t)
      const cur = runs[runs.length - 1]
      if (e.type === 'levelup' && e.level === 20 && cur.l20 === null) cur.l20 = t - cur.start
      if (e.type === 'boss-escape' && cur.zero === null) cur.escapes++
      if (e.type === 'levelup') levelTimes.set(e.level, t)
      else if (e.type === 'boss-rise') bossRose = t
      else if (e.type === 'boss-defeat') bossLog.push({ t: bossRose, tier: e.tier, outcome: 'defeat', secs: t - bossRose })
      else if (e.type === 'boss-escape' && !g.boss?.final) bossLog.push({ t: bossRose, tier: g.state.stats.bossKills + 1, outcome: 'escape', secs: t - bossRose })
      else if (e.type === 'boss-escape') finalLog.push({ t: bossRose, outcome: 'escape', secs: t - bossRose })
      else if (e.type === 'final-defeat') {
        finalLog.push({ t: bossRose, outcome: 'defeat', secs: t - bossRose })
        const run = runs[runs.length - 1]
        if (run.zero === null) run.zero = t - run.start
      }
    }
    if (g.state.crashPending && rebootsLeft > 0) {
      // REBOOT: collect the bits, shop the KERNEL, BOOT a fresh run.
      rebootsLeft--
      const run = runs[runs.length - 1]
      run.bits = beginReboot(g.state)
      run.bought = shopKernel(g, opts.kernelPriority ?? KERNEL_PRIORITY)
      run.bank = g.state.bits
      g = newGame(rebootState(g.state), opts.seed + runs.length)
      runs.push({ start: t, zero: null, l20: null, escapes: 0, bits: 0, bank: 0, bought: [] })
      bossRose = 0
      nukeWait = 0
    }
    // Out of reboots, the bot picks CONTINUE (infinite mode) so long runs keep climbing.
    if (g.state.crashPending) g.continueAfterCrash()
  }
  return { levelTimes, purchases, bossLog, finalLog, earned, runs, game: g }
}
