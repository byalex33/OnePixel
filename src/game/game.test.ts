import { describe, expect, it } from 'vitest'
import * as C from './config'
import { xpToNext } from './formulas'
import { Game, type Pixel } from './game'
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
  const p: Pixel = { id: 10_000 + g.pixels.length, x, y, vy: 0, kind, slot: false, age: 1, life: kind === 'golden' ? 99 : Infinity, dead: false }
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

  it('the fox wanders but does not hunt until FOX FRIEND is bought', () => {
    const g = makeGame((s) => (s.level = 3))
    g.pixels = []
    g.respawns = []
    addPixel(g, g.fox.x + 10, g.fox.groundY - 10)
    const xs: number[] = []
    for (let i = 0; i < 30; i++) {
      run(g, 1)
      xs.push(g.fox.x)
      expect(g.fox.phase === 'sit' || g.fox.phase === 'walk').toBe(true)
    }
    expect(g.state.stats.foxKills).toBe(0)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10)
  })

  it('the fox stays on the ground and inside its walkable span', () => {
    const g = makeGame((s) => (s.level = 3))
    g.setFoxGround(140, 30, 90)
    for (let i = 0; i < 600; i++) {
      run(g, 0.1)
      expect(g.fox.x).toBeGreaterThanOrEqual(30)
      expect(g.fox.x).toBeLessThanOrEqual(90)
      expect(g.fox.y).toBeCloseTo(140)
    }
  })

  it('FOX FRIEND appears in the shop at level 3', () => {
    const g = makeGame((s) => {
      s.level = 2
      s.pixels = 1e6
    })
    expect(isUnlocked(g.state, 'fox')).toBe(false)
    g.state.level = 3
    expect(isUnlocked(g.state, 'fox')).toBe(true)
    expect(g.buy('fox')).toBe(true)
  })

  it('the fox leaps to a nearby pixel, catches it and lands back on the ground', () => {
    const g = makeGame((s) => {
      s.level = 3
      s.upgrades.fox = 1
    })
    g.pixels = []
    g.respawns = []
    const target = addPixel(g, g.fox.x - 20, g.fox.groundY - 15)
    const far = addPixel(g, 5, 5)
    const events = run(g, 1.2 + C.FOX_LEG_MAX)
    expect(target.dead).toBe(true)
    expect(far.dead).toBe(false)
    expect(g.state.stats.foxKills).toBe(1)
    expect(events.some((e) => e.type === 'pop' && e.cause === 'fox')).toBe(true)
    run(g, C.FOX_LEG_MAX + 0.1)
    expect(g.fox.phase === 'sit' || g.fox.phase === 'walk').toBe(true)
    expect(g.fox.y).toBeCloseTo(g.fox.groundY)
  })

  it('the fox can catch golden pixels, unlike drones', () => {
    const g = makeGame((s) => {
      s.level = 7
      s.upgrades.fox = 1
    })
    g.pixels = []
    g.respawns = []
    const gold = addPixel(g, g.fox.x + 15, g.fox.groundY - 10, 'golden')
    run(g, 1.2 + C.FOX_LEG_MAX)
    expect(gold.dead).toBe(true)
    expect(g.state.stats.goldenKills).toBe(1)
  })

  it('golden pixels expire if nobody catches them', () => {
    const g = makeGame((s) => (s.level = 7))
    const gold = addPixel(g, 200, 120, 'golden')
    gold.life = 0.5
    const events = run(g, 1)
    expect(gold.dead).toBe(true)
    expect(events.some((e) => e.type === 'golden-expire')).toBe(true)
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
