import { DT } from './config'
import { Game } from './game'
import { costOf, isMaxed, isUnlocked, UPGRADES } from './upgrades'

export interface BotOptions {
  /** Average taps per second the simulated player manages. */
  cps: number
  /** Seconds a pixel must be visible before the player reacts to it. */
  reaction: number
  seconds: number
  seed: number
}

export interface BotResult {
  /** level -> seconds when reached */
  levelTimes: Map<number, number>
  purchases: { t: number; id: string; level: number }[]
  game: Game
}

/**
 * A crude stand-in for an engaged human, used to sanity-check pacing.
 * It taps the oldest reachable pixel (golden and rainbow first, then blue), buys the cheapest
 * affordable upgrade, and launches nukes as soon as they are ready.
 */
export function runBot(opts: BotOptions): BotResult {
  const g = new Game(undefined, opts.seed)
  g.resize(240, 160)
  g.hitRadius = 6
  const levelTimes = new Map<number, number>([[1, 0]])
  const purchases: BotResult['purchases'] = []
  let clickCd = 0
  let buyCd = 0
  const steps = Math.round(opts.seconds / DT)

  for (let i = 0; i < steps; i++) {
    const t = i * DT
    clickCd -= DT
    if (clickCd <= 0) {
      const candidates = g.pixels.filter((p) => !p.dead && p.age >= opts.reaction && p.y > 0)
      const special = candidates.find((p) => p.kind === 'golden' || p.kind === 'rainbow') ?? candidates.find((p) => p.kind === 'blue')
      const target = special ?? candidates.sort((a, b) => b.age - a.age)[0]
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
    for (const e of g.drainEvents()) if (e.type === 'levelup') levelTimes.set(e.level, t)
  }
  return { levelTimes, purchases, game: g }
}
