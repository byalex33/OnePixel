import { describe, expect, it } from 'vitest'
import * as C from './config'
import * as F from './formulas'
import { xpToNext } from './formulas'
import { Game, type Boss, type Pixel } from './game'
import { rebootState } from './prestige'
import { createInitialState } from './state'
import type { GameEvent, SaveState } from './types'
import { costOf, isUnlocked, maxPurchase, UPGRADE_MAP } from './upgrades'

function makeGame(patch: (s: SaveState) => void = () => {}, seed = 1): Game {
  const s = createInitialState()
  patch(s)
  const g = new Game(s, seed)
  g.resize(240, 160)
  return g
}

function run(g: Game, seconds: number): GameEvent[] {
  const out: GameEvent[] = []
  const steps = Math.round(seconds / C.DT)
  for (let i = 0; i < steps; i++) {
    g.tick(C.DT)
    out.push(...g.drainEvents())
  }
  return out
}

function addPixel(g: Game, x: number, y: number, kind: Pixel['kind'] = 'normal'): Pixel {
  const p: Pixel = { id: 10_000 + g.pixels.length, x, y, vy: 0, kind, slot: false, age: 1, life: kind === 'golden' || kind === 'rainbow' ? 99 : Infinity, dead: false }
  g.pixels.push(p)
  return p
}

describe('the opening', () => {
  it('starts with exactly one pixel in the centre', () => {
    const g = makeGame()
    expect(g.pixels).toHaveLength(1)
    expect(g.pixels[0].x).toBeCloseTo(120)
    expect(g.pixels[0].y).toBeCloseTo(80)
    expect(g.drones).toHaveLength(0)
    expect(g.respawns).toHaveLength(0)
  })

  it('tapping the pixel destroys it and pays out', () => {
    const g = makeGame()
    g.pointerDown(120, 80)
    expect(g.state.pixels).toBe(1)
    expect(g.state.xp).toBe(1)
    expect(g.state.stats.kills).toBe(1)
    expect(g.state.reveal.hud).toBe(true)
    const pops = g.drainEvents().filter((e) => e.type === 'pop')
    expect(pops).toHaveLength(1)
  })

  it('the pixel comes back after the respawn timer', () => {
    const g = makeGame()
    g.pointerDown(120, 80)
    run(g, 0.05)
    expect(g.pixels).toHaveLength(0)
    expect(g.respawns).toHaveLength(1)
    run(g, C.DT + 2.0)
    expect(g.pixels).toHaveLength(1)
  })

  it('missing does nothing but register a tap', () => {
    const g = makeGame()
    g.pointerDown(10, 10)
    expect(g.state.pixels).toBe(0)
    expect(g.state.stats.clicks).toBe(1)
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true)
  })

  it('keeps the upgrade shop locked until level 2, then unlocks it with an achievement', () => {
    const g = makeGame((s) => (s.pixels = 1000))
    expect(isUnlocked(g.state, 'respawn')).toBe(false)
    expect(g.buy('respawn')).toBe(false)
    expect(g.state.pixels).toBe(1000)
    g.grant(0, xpToNext(1))
    run(g, 0.6)
    expect(g.state.level).toBe(2)
    expect(g.state.reveal.panel).toBe(true)
    expect(isUnlocked(g.state, 'respawn')).toBe(true)
    expect(g.state.achievements).toContain('shop')
    expect(g.buy('respawn')).toBe(true)
  })
})

describe('upgrades', () => {
  it('buying deducts the cost and improves the stat', () => {
    const g = makeGame((s) => {
      s.level = 2
      s.pixels = 100
    })
    const before = g.stats.respawnTime
    expect(g.buy('respawn')).toBe(true)
    expect(g.state.pixels).toBe(100 - costOf('respawn', 0))
    expect(g.stats.respawnTime).toBeLessThan(before)
  })

  it('cannot buy without funds or before unlock', () => {
    const g = makeGame((s) => {
      s.level = 2
      s.pixels = 1
    })
    expect(g.buy('respawn')).toBe(false)
    expect(g.drainEvents().some((e) => e.type === 'denied')).toBe(true)
    g.state.pixels = 1e9
    expect(g.buy('auto')).toBe(false) // requires level 5
  })

  it('buy max purchases every affordable level and nothing more', () => {
    const g = makeGame((s) => {
      s.level = 2
      s.pixels = costOf('respawn', 0) + costOf('respawn', 1) + costOf('respawn', 2) + 1
    })
    expect(maxPurchase(g.state, 'respawn')).toEqual({ count: 3, cost: g.state.pixels - 1 })
    expect(g.buyMax('respawn')).toBe(3)
    expect(g.state.upgrades.respawn).toBe(3)
    expect(g.state.pixels).toBe(1)
    expect(g.buyMax('respawn')).toBe(0)
    expect(g.drainEvents().some((e) => e.type === 'denied')).toBe(true)
  })

  it('buy max stops at the level cap', () => {
    const g = makeGame((s) => {
      s.level = 2
      s.pixels = 1e30
    })
    expect(g.buyMax('respawn')).toBe(UPGRADE_MAP.respawn.max)
    expect(maxPurchase(g.state, 'respawn').count).toBe(0)
  })

  it('buy max respects locks', () => {
    const g = makeGame((s) => (s.pixels = 1e9))
    expect(maxPurchase(g.state, 'respawn').count).toBe(0) // level 1: shop closed
    expect(g.buyMax('respawn')).toBe(0)
  })

  it('extra pixel upgrades physically add pixels to the arena', () => {
    const g = makeGame((s) => {
      s.level = 2
      s.pixels = 1e6
    })
    run(g, 2)
    expect(g.pixels.length).toBe(1)
    g.buy('multi')
    g.buy('multi')
    run(g, 2)
    expect(g.pixels.length).toBe(3)
  })
})

describe('levelling', () => {
  it('levels up when XP fills the bar and carries the remainder', () => {
    const g = makeGame()
    g.grant(0, xpToNext(1) + 3)
    expect(g.state.level).toBe(2)
    expect(g.state.xp).toBe(3)
    expect(g.drainEvents().some((e) => e.type === 'levelup')).toBe(true)
  })

  it('levelling stocks the shop but never switches a mechanic on by itself', () => {
    const g = makeGame()
    g.grant(0, 1e12)
    expect(g.state.level).toBeGreaterThanOrEqual(20)
    run(g, 20)
    expect(g.pixels.filter((p) => p.slot)).toHaveLength(1)
    expect(g.drones).toHaveLength(0)
    expect(g.bombs).toHaveLength(0)
    expect(g.lasers).toHaveLength(0)
    expect(g.rain.active).toBe(false)
    expect(g.nukeReady).toBe(false)
    const st = g.stats
    expect([st.critChance, st.comboCap, st.blastRadius, st.goldenChance, st.chainChance]).toEqual([0, 0, 0, 0, 0])
    expect([st.cluster, st.goldRain, st.laserBeams]).toEqual([false, false, 1])
  })

  it('buying level 1 of an unlocked upgrade switches its mechanic on', () => {
    const g = makeGame((s) => {
      s.level = 9
      s.pixels = 1e9
    })
    expect(g.stats.bombInterval).toBe(Infinity)
    expect(g.buy('bomb')).toBe(true)
    expect(g.stats.bombInterval).toBeLessThan(Infinity)
    const events = run(g, 2)
    expect(events.some((e) => e.type === 'bomb-drop')).toBe(true)
  })

  it('one-off perks unlock at their level and can only be bought once', () => {
    const g = makeGame((s) => {
      s.level = 12
      s.pixels = 1e12
    })
    expect(g.buy('swarm')).toBe(false) // level 13
    g.state.level = 13
    expect(g.buy('swarm')).toBe(true)
    expect(g.buy('swarm')).toBe(false)
  })

  it('can level up several times from one big grant', () => {
    const g = makeGame()
    g.grant(0, xpToNext(1) + xpToNext(2) + xpToNext(3))
    expect(g.state.level).toBe(4)
  })
})

describe('combat mechanics', () => {
  it('crits multiply the payout', () => {
    const g = makeGame((s) => {
      s.level = 3
      s.upgrades.critChance = 100 // clamped to the max chance
    })
    let crits = 0
    let total = 0
    for (let i = 0; i < 200; i++) {
      const p = addPixel(g, 50, 50)
      const before = g.state.pixels
      g.pointerDown(p.x, p.y)
      const gained = g.state.pixels - before
      total++
      if (gained > g.stats.value * 1.5) crits++
    }
    expect(crits / total).toBeGreaterThan(0.35)
    expect(crits / total).toBeLessThan(0.65)
  })

  it('combo increases manual rewards and decays after the window', () => {
    const g = makeGame((s) => {
      s.level = 4
      s.upgrades.combo = 1
    })
    const gains: number[] = []
    for (let i = 0; i < 5; i++) {
      const p = addPixel(g, 60, 60)
      const before = g.state.pixels
      g.pointerDown(p.x, p.y)
      gains.push(g.state.pixels - before)
    }
    expect(gains[4]).toBeGreaterThan(gains[0])
    expect(g.combo.count).toBe(5)
    run(g, C.COMBO_WINDOW + 0.1)
    expect(g.combo.count).toBe(0)
  })

  it('blast radius catches neighbouring pixels on a single tap', () => {
    const g = makeGame((s) => {
      s.level = 5
      s.upgrades.blast = 1
    })
    addPixel(g, 30, 30)
    addPixel(g, 36, 30)
    addPixel(g, 30, 37)
    addPixel(g, 120, 140)
    g.pointerDown(30, 30)
    run(g, 0)
    expect(g.state.stats.bestMultiClick).toBe(3)
  })

  it('reaching level 6 unlocks drones for sale without granting one', () => {
    const g = makeGame((s) => {
      s.level = 5
      s.pixels = 1e6
    })
    expect(g.buy('auto')).toBe(false)
    g.grant(0, xpToNext(5))
    expect(g.state.level).toBe(6)
    run(g, 2)
    expect(g.drones).toHaveLength(0)
    expect(g.buy('auto')).toBe(true)
    run(g, 0.1)
    expect(g.drones).toHaveLength(1)
  })

  it('drones hunt normal pixels but never golden ones', () => {
    const g = makeGame((s) => {
      s.level = 7
      s.upgrades.auto = 1
    })
    g.pixels = []
    g.respawns = []
    const gold = addPixel(g, 200, 120, 'golden')
    run(g, 6)
    expect(g.state.stats.droneKills).toBeGreaterThan(0)
    expect(gold.dead).toBe(false)
  })

  it('BLUE PIXELS appear in the shop at level 3 and the first purchase spawns one', () => {
    const g = makeGame((s) => (s.level = 2))
    expect(isUnlocked(g.state, 'blue')).toBe(false)
    g.state.level = 3
    expect(isUnlocked(g.state, 'blue')).toBe(true)
    g.state.pixels = 1e6
    expect(g.buy('blue')).toBe(true)
    const p = g.pixels[0]
    g.pointerDown(p.x, p.y)
    const events = run(g, F.respawnTime(0) + 0.1)
    expect(events.some((e) => e.type === 'spawn' && e.kind === 'blue')).toBe(true)
  })

  it('blue pixels pay a big helping of XP', () => {
    const g = makeGame((s) => {
      s.level = 3
      s.upgrades.blue = 1
    })
    g.pixels = []
    g.respawns = []
    const xpBefore = g.state.xp
    const b = addPixel(g, 60, 60, 'blue')
    g.pointerDown(b.x, b.y)
    const pop = g.drainEvents().find((e) => e.type === 'pop')
    expect(pop && pop.type === 'pop' && pop.xp).toBeCloseTo(g.stats.xpPerKill * C.BLUE_XP_MULT)
    expect(g.state.xp - xpBefore).toBeCloseTo(g.stats.xpPerKill * C.BLUE_XP_MULT)
    expect(g.state.stats.blueKills).toBe(1)
  })

  it('golden pixels expire if nobody catches them', () => {
    const g = makeGame((s) => (s.level = 7))
    const gold = addPixel(g, 200, 120, 'golden')
    gold.life = 0.5
    const events = run(g, 1)
    expect(gold.dead).toBe(true)
    expect(events.some((e) => e.type === 'expire' && e.kind === 'golden')).toBe(true)
  })

  it('rainbow pixels only appear once RAINBOW MODE is bought', () => {
    const g = makeGame((s) => (s.level = 17))
    const quiet = run(g, 60)
    expect(quiet.some((e) => e.type === 'spawn' && e.kind === 'rainbow')).toBe(false)
    g.state.pixels = 1e12
    g.buy('rainbow')
    const events = run(g, 2)
    expect(events.some((e) => e.type === 'spawn' && e.kind === 'rainbow')).toBe(true)
    expect(g.pixels.filter((p) => p.kind === 'rainbow')).toHaveLength(1)
  })

  it('popping a rainbow pixel makes every pixel pay the rainbow multiplier until rainbow mode ends', () => {
    const g = makeGame((s) => {
      s.level = 17
      s.upgrades.rainbow = 1
    })
    g.pixels = []
    g.respawns = []
    g.rainbowTimer = Infinity
    const value = g.stats.value
    const rb = addPixel(g, 60, 60, 'rainbow')
    g.pointerDown(rb.x, rb.y)
    const start = g.drainEvents()
    expect(start.some((e) => e.type === 'rainbow-start')).toBe(true)
    expect(g.rainbow).toBeCloseTo(F.rainbowDuration(1))
    expect(F.rainbowMult(1)).toBe(10)
    expect(g.state.pixels).toBeCloseTo(value * F.rainbowMult(1))

    const p = addPixel(g, 180, 100)
    g.pointerDown(p.x, p.y)
    expect(g.state.pixels).toBeCloseTo(value * F.rainbowMult(1) * 2)

    const events = run(g, F.rainbowDuration(1) + 0.1)
    expect(events.some((e) => e.type === 'rainbow-end')).toBe(true)
    expect(g.rainbow).toBe(0)
    const before = g.state.pixels
    const q = addPixel(g, 120, 40)
    g.pointerDown(q.x, q.y)
    expect(g.state.pixels - before).toBeCloseTo(g.stats.value) // achievements may have raised the base
  })

  it('drones leave rainbow pixels for the player, and they expire', () => {
    const g = makeGame((s) => {
      s.level = 17
      s.upgrades.auto = 1
    })
    g.pixels = []
    g.respawns = []
    const rb = addPixel(g, 200, 120, 'rainbow')
    rb.life = 3
    const events = run(g, 4)
    expect(g.state.stats.droneKills).toBeGreaterThan(0)
    expect(g.rainbow).toBe(0)
    expect(events.some((e) => e.type === 'expire' && e.kind === 'rainbow')).toBe(true)
  })

  it('bombs drop, detonate and clear the blast radius', () => {
    const g = makeGame((s) => {
      s.level = 9
      s.upgrades.bomb = 1
    })
    g.pixels = []
    for (let i = 0; i < 5; i++) addPixel(g, 100 + i * 3, 80)
    g.bombTimer = 0.01
    const events = run(g, C.BOMB_FUSE + 0.2)
    expect(events.some((e) => e.type === 'bomb-drop')).toBe(true)
    expect(events.some((e) => e.type === 'blast' && e.cause === 'bomb')).toBe(true)
    expect(g.state.stats.bombKills).toBeGreaterThanOrEqual(5)
  })

  it('lasers destroy every pixel along the beam', () => {
    const g = makeGame((s) => {
      s.level = 11
      s.upgrades.laser = 1
    })
    g.pixels = []
    for (let i = 0; i < 6; i++) addPixel(g, 20 + i * 35, 100)
    g.laserTimer = 0.01
    // Force a horizontal beam through y=100.
    const events: GameEvent[] = []
    g.tick(C.DT)
    events.push(...g.drainEvents())
    for (const l of g.lasers) Object.assign(l, { x1: -500, y1: 100, x2: 500, y2: 100 })
    events.push(...run(g, C.LASER_CHARGE + 0.1))
    expect(events.some((e) => e.type === 'laser-fire')).toBe(true)
    expect(g.state.stats.bestLaser).toBeGreaterThanOrEqual(6)
  })

  it('chain reactions cascade through clusters', () => {
    const g = makeGame((s) => {
      s.level = 8
      s.upgrades.chain = 11
    }, 3)
    g.pixels = []
    for (let x = 0; x < 10; x++) for (let y = 0; y < 4; y++) addPixel(g, 40 + x * 8, 40 + y * 8)
    // Each kill has a ~55% chance to chain; a handful of taps makes this certain enough.
    for (let i = 0; i < 6 && g.state.stats.chainKills === 0; i++) {
      const p = g.pixels.find((q) => !q.dead)
      if (p) g.pointerDown(p.x, p.y)
      run(g, 1)
    }
    expect(g.state.stats.chainKills).toBeGreaterThan(0)
  })

  it('chains jump to the nearest pixel in reach, skipping golden ones', () => {
    const g = makeGame((s) => {
      s.level = 8
      s.upgrades.chain = 11
    }, 3)
    const chainP = F.chainChance(11)
    g.rng.chance = (p) => p === chainP
    g.pixels = []
    const first = addPixel(g, 40, 80)
    const gold = addPixel(g, 60, 80, 'golden') // nearer, but chains leave it for the player
    const near = addPixel(g, 40 + C.CHAIN_JUMP - 4, 80)
    const far = addPixel(g, near.x + C.CHAIN_JUMP + 10, 80) // out of reach of the next hop
    g.pointerDown(first.x, first.y)
    const events = run(g, 0.2)
    expect(near.dead).toBe(true)
    expect(gold.dead).toBe(false)
    expect(far.dead).toBe(false)
    expect(events.filter((e) => e.type === 'chain-arc')).toHaveLength(1)
  })

  it('a lucky chain can hop along a whole line and earn CHAIN GANG', () => {
    const g = makeGame((s) => {
      s.level = 8
      s.upgrades.chain = 11
    }, 3)
    const chainP = F.chainChance(11)
    g.rng.chance = (p) => p === chainP
    g.pixels = []
    // Spaced wider than a blast, so only jumping can reach them.
    const line = Array.from({ length: 8 }, (_, i) => addPixel(g, 20 + i * 28, 80))
    g.pointerDown(line[0].x, line[0].y)
    run(g, 1.5) // achievements are checked twice a second
    expect(line.every((p) => p.dead)).toBe(true)
    expect(g.state.stats.bestChain).toBe(7)
    expect(g.state.achievements).toContain('chain')
  })

  it('the nuke wipes every pixel, pays the yield and starts fallout', () => {
    const g = makeGame((s) => {
      s.level = 12
      s.upgrades.nukeCharge = 1
      s.upgrades.multi = 4
    })
    run(g, 1)
    const targets = Array.from({ length: 10 }, (_, i) => addPixel(g, 20 + i * 15, 50))
    expect(g.launchNuke()).toBe(false) // not charged
    g.state.nukeCharge = g.stats.nukeKills
    expect(g.launchNuke()).toBe(true)
    const events = run(g, C.NUKE_WARMUP + 0.05)
    const nuke = events.find((e) => e.type === 'nuke')
    if (!nuke || nuke.type !== 'nuke') throw new Error('no nuke event')
    // Drones keep hunting during the warm-up; the nuke takes whatever is left.
    expect(targets.every((p) => p.dead)).toBe(true)
    expect(nuke.count).toBeGreaterThan(5)
    expect(nuke.amount).toBeGreaterThanOrEqual(nuke.count * g.stats.value * g.stats.nukeYield * 0.95)
    expect(g.state.nukeCharge).toBe(0)
    expect(g.frenzy).toBeGreaterThan(0)
  })

  it('auto-launches the nuke only once NUKE SILO is maxed and the switch is on', () => {
    const charged = (level: number, autoNuke: boolean) => {
      const g = makeGame((s) => {
        s.level = 12
        s.upgrades.nukeCharge = level
        s.settings.autoNuke = autoNuke
      })
      g.state.nukeCharge = g.stats.nukeKills
      return g
    }
    const maxed = UPGRADE_MAP.nukeCharge.max

    const notMaxed = charged(maxed - 1, true)
    expect(notMaxed.autoNukeUnlocked).toBe(false)
    run(notMaxed, 0.1)
    expect(notMaxed.nuke).toBeNull()

    const off = charged(maxed, false)
    expect(off.autoNukeUnlocked).toBe(true)
    run(off, 0.1)
    expect(off.nuke).toBeNull()

    const on = charged(maxed, true)
    const events = run(on, 0.1)
    expect(on.nuke).not.toBeNull()
    expect(events.some((e) => e.type === 'nuke-warn')).toBe(true)
  })

  it('cluster bomblets are lobbed to crowds away from the parent blast', () => {
    const g = makeGame((s) => {
      s.level = 14
      s.upgrades.bomb = 1
      s.upgrades.cluster = 1
    }, 5)
    g.pixels = []
    g.respawns = []
    const crowds = [
      [200, 120],
      [200, 30],
      [60, 130],
    ].flatMap(([x, y]) => [addPixel(g, x, y), addPixel(g, x + 4, y), addPixel(g, x, y + 4)])
    const r = g.stats.bombRadius
    g.bombs.push({ id: 999, x: 40, y: 40, vx: 0, vy: 0, fuse: 0.001, total: 1, r, mini: false, group: 0 })
    run(g, 0.05)
    const bomblets = g.bombs.filter((b) => b.mini)
    expect(bomblets).toHaveLength(C.CLUSTER_BOMBLETS)
    for (const b of bomblets) expect(Math.hypot(b.arc!.x1 - 40, b.arc!.y1 - 40)).toBeGreaterThan(r + C.BOMBLET_RADIUS)
    run(g, 2)
    expect(g.bombs).toHaveLength(0)
    expect(crowds.every((p) => p.dead)).toBe(true)
  })

  it('pixel rain storms start, spawn falling pixels and end', () => {
    const g = makeGame((s) => {
      s.level = 10
      s.upgrades.rain = 1
      s.rainTimer = 0.1
    })
    const events = run(g, 1)
    expect(events.some((e) => e.type === 'rain-start')).toBe(true)
    expect(g.pixels.some((p) => p.kind === 'rain')).toBe(true)
    const more = run(g, g.stats.rainDuration + 1)
    expect(more.some((e) => e.type === 'rain-end')).toBe(true)
  })
})

describe('simulation', () => {
  it('is deterministic for a given seed', () => {
    const play = () => {
      const g = makeGame((s) => (s.level = 9), 42)
      for (let i = 0; i < 600; i++) {
        if (i % 20 === 0 && g.pixels[0]) g.pointerDown(g.pixels[0].x, g.pixels[0].y)
        g.tick(C.DT)
      }
      return g.state.pixels
    }
    expect(play()).toBe(play())
  })

  it('rescales entity positions when the arena is resized', () => {
    const g = makeGame()
    g.resize(480, 80)
    expect(g.pixels[0].x).toBeCloseTo(240)
    expect(g.pixels[0].y).toBeCloseTo(40)
  })

  it('awards achievements and their value bonus', () => {
    const g = makeGame()
    g.pointerDown(120, 80)
    run(g, 0.6)
    expect(g.state.achievements).toContain('first')
    expect(g.stats.value).toBeCloseTo(1.02)
  })
})

describe('the boss', () => {
  /** A level 20 game with an empty arena and a boss parked dead centre, ready to fight. */
  function fight(patch: (s: SaveState) => void = () => {}, seed = 1): { g: Game; b: Boss } {
    const g = makeGame((s) => {
      s.level = 20
      patch(s)
    }, seed)
    g.pixels = []
    g.respawns = []
    const b = g.spawnBoss()
    run(g, C.BOSS_RISE + C.DT)
    g.pixels = []
    g.respawns = []
    Object.assign(b, { x: 120, y: 80, vx: 0, vy: 0 })
    g.drainEvents()
    return { g, b }
  }
  const hits = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'boss-hit' }> => e.type === 'boss-hit')

  it('stays below the grid before level 20', () => {
    const g = makeGame((s) => (s.level = 19))
    const events = run(g, C.BOSS_FIRST_DELAY + 5)
    expect(g.boss).toBeNull()
    expect(events.some((e) => e.type === 'boss-rise')).toBe(false)
  })

  it('surfaces shortly after reaching level 20, then joins the fight', () => {
    const g = makeGame((s) => (s.level = 20))
    const events = run(g, C.BOSS_FIRST_DELAY + 0.1)
    expect(events.some((e) => e.type === 'boss-rise')).toBe(true)
    expect(g.boss?.phase).toBe('rise')
    expect(g.boss?.maxHp).toBe(F.bossMaxHp(1))
    expect(g.state.bossTimer).toBe(0)
    run(g, C.BOSS_RISE)
    expect(g.boss?.phase).toBe('fight')
  })

  it('cannot be hurt while it is still rising', () => {
    const g = makeGame((s) => (s.level = 20))
    g.pixels = []
    const b = g.spawnBoss()
    g.pointerDown(b.x, b.y)
    expect(b.hp).toBe(b.maxHp)
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true)
  })

  it('taps on its body hurt it; taps elsewhere miss', () => {
    const { g, b } = fight()
    g.pointerDown(120 + b.r, 80 - b.r)
    expect(b.hp).toBe(b.maxHp - C.BOSS_DAMAGE.click)
    g.pointerDown(20, 20)
    expect(b.hp).toBe(b.maxHp - C.BOSS_DAMAGE.click)
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true)
  })

  it('tapping it keeps the combo going, and the combo boosts tap damage', () => {
    const { g, b } = fight((s) => (s.upgrades.combo = 1))
    for (let i = 0; i < 5; i++) g.pointerDown(120, 80)
    expect(g.combo.count).toBe(5)
    let expected = 0
    for (let i = 1; i <= 5; i++) expected += C.BOSS_DAMAGE.click * F.comboMult(i, g.stats.comboCap)
    expect(b.maxHp - b.hp).toBeCloseTo(expected)
  })

  it('one tap can hit the boss and a pixel at the same time', () => {
    const { g, b } = fight()
    const p = addPixel(g, 120 + b.r + 2, 80)
    g.pointerDown(120 + b.r + 2, 80)
    expect(p.dead).toBe(true)
    expect(b.hp).toBeLessThan(b.maxHp)
  })

  it('drones, bombs, bomblets, chains and lasers all chip away at it', () => {
    const { g, b } = fight((s) => (s.upgrades.auto = 1))
    const drone = hits(run(g, 3))
    expect(drone.length).toBeGreaterThan(0)
    expect(drone.every((e) => e.source === 'drone' && e.dmg === C.BOSS_DAMAGE.drone)).toBe(true)

    const blastAt = (cause: 'bomb' | 'chain', r: number, mini: boolean) =>
      g['blasts'].push({ x: 120, y: 80 + b.r + r / 2, r, delay: 0, cause, group: 0, depth: 1, mini })
    blastAt('bomb', 30, false)
    blastAt('bomb', C.BOMBLET_RADIUS, true)
    blastAt('chain', C.CHAIN_RADIUS, false)
    g.lasers.push({ x1: -500, y1: 80, x2: 500, y2: 80, t: 0.001, phase: 'charge', group: 0 })
    g.drones = []
    const sources = hits(run(g, 0.05)).map((e) => [e.source, e.dmg])
    expect(sources).toEqual(
      expect.arrayContaining([
        ['bomb', C.BOSS_DAMAGE.bomb],
        ['bomblet', C.BOSS_DAMAGE.bomblet],
        ['chain', C.BOSS_DAMAGE.chain],
        ['laser', C.BOSS_DAMAGE.laser],
      ]),
    )
  })

  it('only taps can crit it', () => {
    const { g } = fight((s) => {
      s.upgrades.critChance = 13
      s.upgrades.auto = 1
    })
    let tapCrits = 0
    for (let i = 0; i < 40; i++) {
      g.pointerDown(120, 80)
      tapCrits += hits(g.drainEvents()).filter((e) => e.crit).length
    }
    expect(tapCrits).toBeGreaterThan(5)
    const machine = hits(run(g, 3)).filter((e) => e.source === 'drone')
    expect(machine.length).toBeGreaterThan(0)
    expect(machine.every((e) => !e.crit && e.dmg === C.BOSS_DAMAGE.drone)).toBe(true)
  })

  it('armor piercing multiplies every hit', () => {
    const { g, b } = fight((s) => (s.upgrades.pierce = 4))
    g.pointerDown(120, 80)
    expect(b.maxHp - b.hp).toBeCloseTo(C.BOSS_DAMAGE.click * F.pierceMult(4))
  })

  it('a nuke takes a fixed chunk, but only once per fight', () => {
    const { g, b } = fight((s) => (s.upgrades.nukeCharge = 1))
    for (let i = 0; i < 2; i++) {
      g.state.nukeCharge = g.stats.nukeKills
      expect(g.launchNuke()).toBe(true)
      run(g, C.NUKE_WARMUP + 0.05)
    }
    expect(b.hp).toBeCloseTo(b.maxHp * (1 - C.BOSS_NUKE_FRACTION))
  })

  it('swallows a nearby pixel to heal, and the pixel pays nothing', () => {
    const { g, b } = fight()
    b.hp = b.maxHp * 0.6
    const p = addPixel(g, 120 + b.r + 4, 80)
    p.slot = true
    b.eatTimer = 0.01
    const pixelsBefore = g.state.pixels
    const events = run(g, 0.05)
    expect(p.dead).toBe(true)
    expect(events.some((e) => e.type === 'boss-eat')).toBe(true)
    expect(b.hp).toBeCloseTo(b.maxHp * (0.6 + C.BOSS_EAT_HEAL))
    expect(g.state.pixels).toBe(pixelsBefore)
    expect(g.state.stats.kills).toBe(0)
    expect(g.respawns.length).toBeGreaterThan(0)
  })

  it('leaves golden and rainbow pixels alone', () => {
    const { g, b } = fight()
    const p = addPixel(g, 120 + b.r + 4, 80, 'golden')
    b.eatTimer = 0.01
    run(g, 0.05)
    expect(p.dead).toBe(false)
  })

  it('enrages below half health', () => {
    const { g, b } = fight()
    b.hp = b.maxHp * C.BOSS_ENRAGE_AT + 5
    g.pointerDown(120, 80)
    expect(b.enraged).toBe(true)
    expect(g.drainEvents().some((e) => e.type === 'boss-enrage')).toBe(true)
  })

  it('defeat pays out, drops golden loot, adds a permanent bonus and toughens the next one', () => {
    const { g, b } = fight()
    b.hp = 1
    const value = g.stats.value
    const xp = g.state.xp
    g.pointerDown(120, 80)
    const defeat = g.drainEvents().find((e) => e.type === 'boss-defeat')
    if (!defeat || defeat.type !== 'boss-defeat') throw new Error('no defeat event')
    expect(g.boss).toBeNull()
    expect(defeat.amount).toBeCloseTo(value * C.BOSS_REWARD_VALUE)
    expect(g.state.xp - xp).toBeCloseTo(xpToNext(20) * C.BOSS_REWARD_XP_FRAC)
    expect(g.pixels.filter((p) => p.kind === 'golden')).toHaveLength(C.BOSS_LOOT_BASE + C.BOSS_LOOT_PER_TIER)
    expect(g.state.stats.bossKills).toBe(1)
    expect(g.state.bossTimer).toBe(C.BOSS_INTERVAL)
    expect(g.stats.value).toBeCloseTo(value * F.bossBonus(1))
    const next = g.spawnBoss()
    expect(next.tier).toBe(2)
    expect(next.maxHp).toBeGreaterThan(b.maxHp)
  })

  it('escapes when time runs out, and comes back with its wounds', () => {
    const { g, b } = fight()
    b.hp = b.maxHp * 0.4
    b.timeLeft = 0.01
    const events = run(g, 0.05)
    expect(events.some((e) => e.type === 'boss-escape')).toBe(true)
    expect(b.phase).toBe('sink')
    g.pointerDown(120, 80)
    expect(b.hp).toBeCloseTo(b.maxHp * 0.4) // can't be hurt on the way down
    expect(g.state.stats.bossEscapes).toBe(1)
    expect(g.state.bossTimer).toBe(C.BOSS_INTERVAL)
    expect(g.state.bossHealth).toBeCloseTo(0.4 + C.BOSS_ESCAPE_RECOVER)
    run(g, C.BOSS_SINK)
    expect(g.boss).toBeNull()

    g.state.bossTimer = 0.01
    run(g, 0.05)
    expect(g.boss?.tier).toBe(1)
    expect(g.boss?.hp).toBeCloseTo(b.maxHp * (0.4 + C.BOSS_ESCAPE_RECOVER), 0)
  })

  it('reloading mid-fight brings it straight back', () => {
    const { g } = fight()
    const reloaded = new Game(structuredClone(g.state), 2)
    reloaded.resize(240, 160)
    const events = run(reloaded, 0.05)
    expect(events.some((e) => e.type === 'boss-rise')).toBe(true)
  })

  it('moves with the arena when it is resized', () => {
    const { g, b } = fight()
    g.resize(480, 80)
    expect(b.x).toBeCloseTo(240)
    expect(b.y).toBeCloseTo(40)
  })

  it('fights deterministically for a given seed', () => {
    const play = () => {
      const { g, b } = fight((s) => {
        s.upgrades.auto = 7
        s.upgrades.multi = 8
        s.upgrades.critChance = 5
      }, 9)
      for (let i = 0; i < 1200; i++) {
        if (i % 15 === 0 && g.boss) g.pointerDown(g.boss.x, g.boss.y)
        g.tick(C.DT)
      }
      return [b.hp, b.x, b.y, g.state.pixels]
    }
    expect(play()).toEqual(play())
  })
})

describe('PIXEL ZERO, the final boss', () => {
  const hits = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'boss-hit' }> => e.type === 'boss-hit')

  /** A level 20 game that has beaten five bosses, with PIXEL ZERO risen and parked dead centre. */
  function finalFight(patch: (s: SaveState) => void = () => {}): { g: Game; b: Boss; intro: GameEvent[] } {
    const g = makeGame((s) => {
      s.level = 20
      s.stats.bossKills = C.FINAL_EVERY
      patch(s)
    })
    for (let i = 0; i < 6; i++) addPixel(g, 20 + i * 30, 40)
    const b = g.spawnBoss()
    const intro = [...g.drainEvents(), ...run(g, C.FINAL_RISE + C.DT)]
    Object.assign(b, { x: 120, y: 80, vx: 0, vy: 0 })
    return { g, b, intro }
  }

  it('surfaces after five boss kills, pulls in every pixel and stops anything else spawning', () => {
    const { g, b, intro } = finalFight()
    expect(b.final).toBe(true)
    expect(b.maxHp).toBe(F.finalMaxHp(1, 0))
    const absorb = intro.find((e) => e.type === 'final-absorb')
    if (absorb?.type !== 'final-absorb') throw new Error('no absorb event')
    expect(absorb.points.length).toBeGreaterThanOrEqual(12)
    expect(intro.some((e) => e.type === 'final-surfaced')).toBe(true)
    run(g, 10)
    expect(g.pixels).toHaveLength(0)
  })

  it('weak spots take extra damage, but only from taps', () => {
    const { g, b } = finalFight()
    b.spots = [{ dx: 12, dy: 0 }]
    g.pointerDown(b.x + 12, b.y)
    b.spots = [{ dx: 12, dy: 0 }]
    g.pointerDown(b.x - 12, b.y + 12)
    const dmg = hits(g.drainEvents()).map((e) => [e.dmg, e.weak])
    expect(dmg).toEqual([
      [C.BOSS_DAMAGE.click * C.FINAL_SPOT_MULT, true],
      [C.BOSS_DAMAGE.click, false],
    ])
  })

  it('bombs and lasers hit it harder than they hit regular bosses', () => {
    const { g, b } = finalFight()
    g['blasts'].push({ x: b.x, y: b.y + b.r + 5, r: 30, delay: 0, cause: 'bomb', group: 0, depth: 0 })
    g.lasers.push({ x1: -500, y1: b.y, x2: 500, y2: b.y, t: 0.001, phase: 'charge', group: 0 })
    const dmg = Object.fromEntries(hits(run(g, 0.05)).map((e) => [e.source, e.dmg]))
    expect(dmg.bomb).toBe(C.BOSS_DAMAGE.bomb * C.FINAL_MACHINE_MULT.bomb!)
    expect(dmg.laser).toBe(C.BOSS_DAMAGE.laser * C.FINAL_MACHINE_MULT.laser!)
  })

  it('its EMP jams drones unless the player taps the charging core', () => {
    const { g, b } = finalFight((s) => (s.upgrades.auto = 1))
    b.empTimer = 0.01
    expect(run(g, 0.05).some((e) => e.type === 'emp-charge')).toBe(true)
    g.pointerDown(b.x, b.y)
    expect(g.drainEvents().some((e) => e.type === 'emp-blocked')).toBe(true)
    expect(b.empCharge).toBe(0)
    expect(g.droneJam).toBe(0)

    b.empTimer = 0.01
    const events = run(g, C.FINAL_EMP_CHARGE + 0.1)
    expect(events.some((e) => e.type === 'emp')).toBe(true)
    expect(g.droneJam).toBeGreaterThan(0)
    const x = g.drones.map((d) => [d.x, d.y])
    run(g, 0.5)
    expect(g.drones.map((d) => [d.x, d.y])).toEqual(x) // jammed drones hang still
  })

  it('killing it crashes the screen, then CONTINUE keeps the run going', () => {
    const { g, b } = finalFight()
    b.hp = 1
    g.pointerDown(b.x, b.y)
    expect(g.drainEvents().some((e) => e.type === 'final-defeat')).toBe(true)
    expect(g.state.crashPending).toBe(true)
    // It lingers while its death animation plays, then the crash screen takes over.
    expect(g.boss?.phase).toBe('die')
    expect(g.advanceCrash(C.FINAL_DEATH / 2)).toBe(false)
    expect(g.advanceCrash(C.FINAL_DEATH / 2)).toBe(true)
    expect(g.boss).toBeNull()
    expect(g.state.stats.finalKills).toBe(1)
    expect(g.state.stats.bossKills).toBe(C.FINAL_EVERY)
    expect(g.finalDue).toBe(false) // the next one needs five more regular kills
    g.continueAfterCrash()
    expect(g.state.crashPending).toBe(false)
  })

  it('awards SYSTEM CRASH at once, so a REBOOT straight from the crash screen keeps it', () => {
    const { g, b } = finalFight()
    b.hp = 1
    g.pointerDown(b.x, b.y)
    expect(g.state.achievements).toContain('final')
    expect(g.drainEvents().some((e) => e.type === 'achievement' && e.id === 'final')).toBe(true)
    expect(rebootState(g.state).achievements).toContain('final')
  })

  it('REBOOT starts over harder but richer, keeping feats and settings', () => {
    const { g } = finalFight()
    g.state.achievements = ['first', 'boss']
    g.state.settings.sound = false
    const next = rebootState(g.state)
    expect([next.level, next.reboots, next.pixels, next.stats.bossKills]).toEqual([1, 1, 0, 0])
    expect(next.achievements).toEqual(['first', 'boss'])
    expect(next.settings.sound).toBe(false)
    expect(costOf('respawn', 0, next.reboots)).toBe(costOf('respawn', 0) * C.REBOOT_PRICE_MULT)
    const fresh = createInitialState()
    fresh.achievements = next.achievements
    expect(F.computeStats(next).value).toBeCloseTo(F.computeStats(fresh).value * C.REBOOT_VALUE_MULT)
  })
})
