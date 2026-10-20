import { BOSS_FIGHT_TIME, DT, FINAL_FIGHT_TIME } from './config'
import { Game } from './game'
import type { GameEvent, SaveState, UpgradeId } from './types'
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

export function runBot(opts: BotOptions): BotResult {
  const g = new Game(opts.start && structuredClone(opts.start), opts.seed)
  g.resize(240, 160)
  g.hitRadius = 6
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
      const loot = candidates.find((p) => p.kind === 'golden' || p.kind === 'rainbow')
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
      if (e.type === 'levelup') levelTimes.set(e.level, t)
      else if (e.type === 'boss-rise') bossRose = t
      else if (e.type === 'boss-defeat') bossLog.push({ t: bossRose, tier: e.tier, outcome: 'defeat', secs: t - bossRose })
      else if (e.type === 'boss-escape' && !g.boss?.final) bossLog.push({ t: bossRose, tier: g.state.stats.bossKills + 1, outcome: 'escape', secs: t - bossRose })
      else if (e.type === 'boss-escape') finalLog.push({ t: bossRose, outcome: 'escape', secs: t - bossRose })
      else if (e.type === 'final-defeat') finalLog.push({ t: bossRose, outcome: 'defeat', secs: t - bossRose })
    }
    // The bot always picks CONTINUE (infinite mode) so long runs keep climbing.
    if (g.state.crashPending) g.continueAfterCrash()
  }
  return { levelTimes, purchases, bossLog, finalLog, earned, game: g }
}
