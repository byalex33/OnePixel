import { BOSS_FIGHT_TIME, DT } from './config'
import { Game } from './game'
import type { GameEvent, SaveState } from './types'
import { costOf, isMaxed, isUnlocked, UPGRADES } from './upgrades'

export interface BotOptions {
  /** Average taps per second the simulated player manages. */
  cps: number
  /** Seconds a pixel must be visible before the player reacts to it. */
  reaction: number
  seconds: number
  seed: number
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
  game: Game
}

/**
 * A crude stand-in for an engaged human, used to sanity-check pacing.
 * It taps the oldest reachable pixel (the boss first, then golden and rainbow, then blue), buys the cheapest
 * affordable upgrade, and launches nukes as soon as they are ready.
 */
export function runBot(opts: BotOptions): BotResult {
  const g = new Game(opts.start && structuredClone(opts.start), opts.seed)
  g.resize(240, 160)
  g.hitRadius = 6
  const levelTimes = new Map<number, number>([[1, 0]])
  const purchases: BotResult['purchases'] = []
  const bossLog: BotResult['bossLog'] = []
  let bossRose = 0
  let clickCd = 0
  let buyCd = 0
  const steps = Math.round(opts.seconds / DT)

  for (let i = 0; i < steps; i++) {
    const t = i * DT
    clickCd -= DT
    if (clickCd <= 0) {
      const candidates = g.pixels.filter((p) => !p.dead && p.age >= opts.reaction && p.y > 0)
      const loot = candidates.find((p) => p.kind === 'golden' || p.kind === 'rainbow')
      const boss = g.boss && g.boss.phase === 'fight' && g.boss.timeLeft < BOSS_FIGHT_TIME - opts.reaction ? g.boss : undefined
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
          .map((u) => ({ id: u.id, cost: costOf(u.id, g.state.upgrades[u.id]) }))
          .sort((a, b) => a.cost - b.cost)
        const pick = options[0]
        if (!pick || pick.cost > g.state.pixels) break
        if (!g.buy(pick.id)) break
        purchases.push({ t, id: pick.id, level: g.state.upgrades[pick.id] })
      }
    }
    if (g.nukeReady) g.launchNuke()
    g.tick(DT)
    for (const e of g.drainEvents()) {
      opts.onEvent?.(e, t)
      if (e.type === 'levelup') levelTimes.set(e.level, t)
      else if (e.type === 'boss-rise') bossRose = t
      else if (e.type === 'boss-defeat') bossLog.push({ t: bossRose, tier: e.tier, outcome: 'defeat', secs: t - bossRose })
      else if (e.type === 'boss-escape') bossLog.push({ t: bossRose, tier: g.state.stats.bossKills + 1, outcome: 'escape', secs: t - bossRose })
    }
  }
  return { levelTimes, purchases, bossLog, game: g }
}
