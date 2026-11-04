import { describe, expect, it } from 'vitest'
import * as C from './config'
import { computeStats } from './formulas'
import { Game, type Pixel } from './game'
import { BITS_PER_BOSS, BITS_PER_ZERO, bitsForRun, canInstall, FAST_BOOT_LEVELS, install, KERNEL, KERNEL_TOTAL, PANIC_EVERY, SPEED_MAX, SPEED_PAR, SPEED_STEP } from './kernel'
import { beginReboot, rebootState } from './prestige'
import { makeSaveFile, parseSaveFile, RETRO_BITS, sanitizeState } from './save'
import { createInitialState } from './state'
import type { GameEvent, KernelId, SaveState } from './types'

function makeGame(patch: (s: SaveState) => void = () => {}, seed = 1): Game {
  const s = createInitialState()
  patch(s)
  const g = new Game(s, seed)
  g.resize(240, 160)
  return g
}

function run(g: Game, seconds: number): GameEvent[] {
  const out: GameEvent[] = []
  for (let i = 0; i < Math.round(seconds / C.DT); i++) {
    g.tick(C.DT)
    out.push(...g.drainEvents())
  }
  return out
}

function addPixel(g: Game, x: number, y: number, kind: Pixel['kind'] = 'normal'): Pixel {
  const p: Pixel = { id: 20_000 + g.pixels.length, x, y, vy: 0, kind, slot: false, age: 1, life: 99, dead: false }
  g.pixels.push(p)
  return p
}

/** Every node a KERNEL needs to reach `id`, installed at level 1. */
function withKernel(s: SaveState, levels: Partial<Record<KernelId, number>>): void {
  for (const [id, l] of Object.entries(levels) as [KernelId, number][]) s.kernel[id] = l
}

describe('the KERNEL', () => {
  it('has three branches of five nodes, each needing the one before it', () => {
    for (const branch of ['boot', 'override', 'exploit'] as const) {
      const nodes = KERNEL.filter((d) => d.branch === branch)
      expect(nodes).toHaveLength(5)
      expect(nodes[0].requires).toBeUndefined()
      for (let i = 1; i < nodes.length; i++) expect(nodes[i].requires).toBe(nodes[i - 1].id)
    }
    expect(KERNEL_TOTAL).toBeGreaterThan(150)
  })

  it('installing spends bits, needs the node before it, and stops at the max', () => {
    const s = createInitialState()
    s.bits = 100
    expect(canInstall(s, 'fastBoot')).toBe(false)
    expect(install(s, 'fastBoot')).toBe(false)
    expect(install(s, 'xpBoost')).toBe(true)
    expect(s.bits).toBe(98)
    expect(install(s, 'fastBoot')).toBe(true)
    for (let i = 0; i < 10; i++) install(s, 'xpBoost')
    expect(s.kernel.xpBoost).toBe(5)
    expect(canInstall(s, 'xpBoost')).toBe(false)
  })

  it('cannot install without enough bits', () => {
    const s = createInitialState()
    s.bits = 1
    expect(install(s, 'xpBoost')).toBe(false)
    expect(s.kernel.xpBoost).toBe(0)
    expect(s.bits).toBe(1)
  })

  it('XP BOOST and ROOT ACCESS feed straight into the stats', () => {
    const base = computeStats(createInitialState())
    const s = createInitialState()
    withKernel(s, { xpBoost: 4, rootAccess: 2 })
    const st = computeStats(s)
    expect(st.xpPerKill).toBeCloseTo(base.xpPerKill * 2)
    expect(st.bossDamage).toBeCloseTo(base.bossDamage * 2)
  })
})

describe('CORE BITS', () => {
  it('pays nothing until PIXEL ZERO has died this run', () => {
    const s = createInitialState()
    s.stats.bossKills = 4
    expect(bitsForRun(s).total).toBe(0)
  })

  it('pays for PIXEL ZERO, the bosses and speed', () => {
    const s = createInitialState()
    s.stats.finalKills = 1
    s.stats.bossKills = 5
    s.zeroTime = SPEED_PAR - 2.5 * SPEED_STEP
    const p = bitsForRun(s)
    expect(p).toMatchObject({ zero: BITS_PER_ZERO, bosses: 5 * BITS_PER_BOSS, speed: 2, mult: 1 })
    expect(p.total).toBe(BITS_PER_ZERO + 5 * BITS_PER_BOSS + 2)
  })

  it('caps the speed bonus and never makes it negative', () => {
    const s = createInitialState()
    s.stats.finalKills = 1
    s.zeroTime = 1
    expect(bitsForRun(s).speed).toBe(SPEED_MAX)
    s.zeroTime = SPEED_PAR * 2
    expect(bitsForRun(s).speed).toBe(0)
  })

  it('BIT MINER multiplies the payout, rounding up', () => {
    const s = createInitialState()
    s.stats.finalKills = 1
    s.zeroTime = SPEED_PAR
    s.kernel.bitMiner = 1
    expect(bitsForRun(s).total).toBe(Math.ceil(BITS_PER_ZERO * 1.25))
  })

  it('remembers how long the run took to its first PIXEL ZERO', () => {
    const g = makeGame((s) => {
      s.level = 20
      s.stats.bossKills = C.FINAL_EVERY
      s.runTime = 1234
    })
    const b = g.spawnBoss()
    run(g, C.FINAL_RISE + 0.1)
    b.hp = 1
    g.pointerDown(b.x, b.y)
    expect(g.state.zeroTime).toBeCloseTo(1234 + C.FINAL_RISE + 0.1, 0)
  })
})

describe('REBOOT through the KERNEL', () => {
  function crashed(): SaveState {
    const s = createInitialState()
    s.level = 22
    s.stats.finalKills = 1
    s.stats.bossKills = 5
    s.zeroTime = SPEED_PAR
    s.crashPending = true
    s.bits = 3
    return s
  }

  it('pays the bits once and holds the run at the boot screen', () => {
    const s = crashed()
    const paid = beginReboot(s)
    expect(paid).toBe(BITS_PER_ZERO + 5 * BITS_PER_BOSS)
    expect(s.bits).toBe(3 + paid)
    expect(s.bootPending).toBe(true)
    expect(s.crashPending).toBe(false)
    expect(beginReboot(s)).toBe(0)
    expect(s.bits).toBe(3 + paid)
  })

  it('BOOT keeps bits and the KERNEL, and resets the run clock', () => {
    const s = crashed()
    beginReboot(s)
    install(s, 'xpBoost')
    const next = rebootState(s)
    expect(next.bits).toBe(s.bits)
    expect(next.kernel.xpBoost).toBe(1)
    expect([next.level, next.runTime, next.zeroTime, next.bootPending, next.stats.finalKills]).toEqual([1, 0, 0, false, 0])
  })

  it('FAST BOOT starts the next run at a higher level, with the shop open', () => {
    const s = crashed()
    withKernel(s, { xpBoost: 1, fastBoot: 2 })
    const next = rebootState(s)
    expect(next.level).toBe(FAST_BOOT_LEVELS[2])
    expect(next.reveal).toEqual({ hud: true, panel: true })
  })

  it('STARTER KIT and CACHED PERKS hand out upgrades at boot and the moment they are installed', () => {
    const s = crashed()
    withKernel(s, { xpBoost: 1, fastBoot: 1, starterKit: 1 })
    s.bits = 100
    expect(install(s, 'cachedPerks')).toBe(true)
    expect([s.upgrades.swarm, s.upgrades.cluster, s.upgrades.twin]).toEqual([1, 1, 0])
    const next = rebootState(s)
    expect(next.upgrades.respawn).toBe(2)
    expect(next.upgrades.value).toBe(3)
    expect(next.upgrades.swarm).toBe(1)
    // A perk is only switched on once its level is reached, like any other.
    expect(computeStats(next).drones).toBe(0)
  })

  it('the world stays frozen behind the boot screen, offline time included', () => {
    const g = makeGame((s) => {
      s.level = 8
      s.upgrades.auto = 5
      s.bootPending = true
    })
    expect(g.collectOffline(3600)).toBeNull()
  })
})

describe('OVERRIDE nodes', () => {
  it('SCRIPT buys the cheapest upgrade on its own, and can be switched off', () => {
    const g = makeGame((s) => {
      s.level = 3
      s.pixels = 1000
      s.kernel.script = 1
    })
    run(g, 1)
    expect(g.state.upgrades.respawn).toBeGreaterThan(0)
    const spent = g.state.pixels
    g.state.settings.autoBuy = false
    g.state.pixels = 1e6
    run(g, 1)
    expect(g.state.pixels).toBe(1e6)
    expect(spent).toBeLessThan(1000)
  })

  it('STICKY COMBO 1 doubles the window; 2 never runs out but a miss breaks it', () => {
    const s = createInitialState()
    s.kernel.stickyCombo = 1
    expect(computeStats(s).comboWindow).toBe(C.COMBO_WINDOW * 2)
    const g = makeGame((st) => {
      st.level = 4
      st.upgrades.combo = 1
      st.kernel.stickyCombo = 2
    })
    addPixel(g, 50, 50)
    addPixel(g, 60, 50)
    g.pointerDown(50, 50)
    g.pointerDown(60, 50)
    run(g, 30)
    expect(g.combo.count).toBe(2)
    g.pointerDown(200, 140)
    expect(g.combo.count).toBe(0)
  })

  it('GOLD MAGNET lets drones catch golden pixels', () => {
    const g = makeGame((s) => {
      s.level = 7
      s.upgrades.auto = 1
      s.kernel.goldMagnet = 1
    })
    g.pixels = []
    g.respawns = []
    const gold = addPixel(g, 120, 80, 'golden')
    run(g, 6)
    expect(gold.dead).toBe(true)
    expect(g.state.stats.goldenKills).toBe(1)
  })

  it("DEAD MAN'S SWITCH offers AUTO nuke from the first NUKE SILO level", () => {
    const g = makeGame((s) => {
      s.level = 12
      s.upgrades.nukeCharge = 1
    })
    expect(g.autoNukeUnlocked).toBe(false)
    g.state.kernel.autoLaunch = 1
    g.refreshStats()
    expect(g.autoNukeUnlocked).toBe(true)
  })

  it('DOUBLE RAINBOW stacks rainbow time instead of resetting it', () => {
    const g = makeGame((s) => {
      s.level = 17
      s.upgrades.rainbow = 1
      s.kernel.doubleRainbow = 1
    })
    const d = g.stats.rainbowDuration
    addPixel(g, 40, 40, 'rainbow')
    addPixel(g, 200, 120, 'rainbow')
    g.pointerDown(40, 40)
    g.pointerDown(200, 120)
    expect(g.rainbow).toBeCloseTo(d * 2)
  })
})

describe('EXPLOIT nodes', () => {
  it('MAGNET pulls resting pixels towards the last tap, stopping short of it', () => {
    const g = makeGame((s) => {
      s.kernel.magnet = 1
    })
    g.pixels = []
    g.respawns = []
    const p = addPixel(g, 150, 80)
    g.pointerDown(100, 80)
    run(g, 10)
    expect(p.dead).toBe(false)
    expect(p.x).toBeLessThan(150)
    expect(Math.hypot(p.x - 100, p.y - 80)).toBeGreaterThanOrEqual(C.MAGNET_RING - 0.01)
  })

  it('OVERFLOW keeps half the nuke charge', () => {
    const g = makeGame((s) => {
      s.level = 12
      s.upgrades.nukeCharge = 1
      s.kernel.overflow = 1
    })
    g.state.nukeCharge = g.stats.nukeKills
    g.launchNuke()
    run(g, C.NUKE_WARMUP + 0.05)
    expect(g.state.nukeCharge).toBeGreaterThanOrEqual(Math.floor(g.stats.nukeKills / 2))
  })

  it('GLITCH PIXEL spawns only once installed', () => {
    const quiet = makeGame((s) => (s.upgrades.multi = 0))
    expect(quiet.stats.glitchChance).toBe(0)
    const g = makeGame((s) => {
      s.level = 2
      s.upgrades.multi = 10
      s.upgrades.respawn = 14
      s.kernel.glitch = 3
    })
    let glitches = 0
    for (let i = 0; i < 400; i++) {
      for (const p of g.pixels) if (!p.dead && p.kind === 'normal') g.pointerDown(p.x, p.y)
      for (const e of run(g, 0.4)) if (e.type === 'spawn' && e.kind === 'glitch') glitches++
    }
    expect(glitches).toBeGreaterThan(0)
  })

  it('a glitch pixel copies the last special: golden when nothing was hit yet', () => {
    const g = makeGame()
    g.pixels = []
    const p = addPixel(g, 60, 60, 'glitch')
    g.pointerDown(60, 60)
    const pop = g.drainEvents().find((e) => e.type === 'pop')
    expect(pop).toMatchObject({ kind: 'glitch', copy: 'golden', amount: g.stats.value * C.GOLDEN_MULT })
    expect(p.dead).toBe(true)
    expect(g.state.stats.glitchKills).toBe(1)
    expect(g.state.stats.goldenKills).toBe(0)
  })

  it('a glitch pixel after a blue one pays blue XP; after a rainbow it starts rainbow mode', () => {
    const g = makeGame((s) => {
      s.level = 17
      s.upgrades.rainbow = 1
    })
    g.pixels = []
    addPixel(g, 30, 30, 'blue')
    g.pointerDown(30, 30)
    addPixel(g, 90, 30, 'glitch')
    g.drainEvents()
    g.pointerDown(90, 30)
    expect(g.drainEvents().find((e) => e.type === 'pop')).toMatchObject({ copy: 'blue', xp: g.stats.xpPerKill * C.BLUE_XP_MULT })
    addPixel(g, 150, 30, 'rainbow')
    g.pointerDown(150, 30)
    run(g, g.stats.rainbowDuration + 0.1)
    expect(g.rainbow).toBe(0)
    addPixel(g, 210, 30, 'glitch')
    g.pointerDown(210, 30)
    expect(g.rainbow).toBeGreaterThan(0)
  })

  it('a glitch pixel after a bomb sets off a bomb blast where it was', () => {
    const g = makeGame()
    g.pixels = []
    g.lastSpecial = 'bomb'
    addPixel(g, 100, 100, 'glitch')
    const near = addPixel(g, 110, 100)
    g.pointerDown(100, 100)
    const events = run(g, 0.2)
    expect(events.some((e) => e.type === 'blast' && e.cause === 'bomb')).toBe(true)
    expect(near.dead).toBe(true)
  })

  it('drones, chains and the boss leave glitch pixels for the player', () => {
    const g = makeGame((s) => {
      s.level = 8
      s.upgrades.auto = 5
      s.kernel.goldMagnet = 1
    })
    g.pixels = []
    g.respawns = []
    const p = addPixel(g, 120, 80, 'glitch')
    run(g, 3)
    expect(p.dead).toBe(false)
  })

  it(`KERNEL PANIC brings PIXEL ZERO after ${PANIC_EVERY} boss kills`, () => {
    const g = makeGame((s) => {
      s.level = 20
      s.stats.bossKills = PANIC_EVERY
    })
    expect(g.finalDue).toBe(false)
    g.state.kernel.kernelPanic = 1
    g.refreshStats()
    expect(g.finalDue).toBe(true)
    expect(g.nextBoss?.killsToFinal).toBe(0)
  })
})

describe('KERNEL saves', () => {
  it('a version 1 save with reboots gets back pay in bits', () => {
    const s = createInitialState() as unknown as Record<string, unknown>
    delete s.bits
    delete s.kernel
    s.reboots = 2
    const file = parseSaveFile({ v: 1, savedAt: 1, maxSeenAt: 1, state: s })
    expect(file.state.bits).toBe(2 * RETRO_BITS)
    expect(file.state.kernel.xpBoost).toBe(0)
  })

  it('a version 2 save gets no back pay', () => {
    const s = createInitialState()
    s.reboots = 2
    s.bits = 4
    const file = parseSaveFile(JSON.parse(JSON.stringify(makeSaveFile(s, 1))))
    expect(file.state.bits).toBe(4)
  })

  it('clamps KERNEL levels and bits from hand-edited saves', () => {
    const out = sanitizeState({ bits: -5, kernel: { xpBoost: 99, glitch: -1, nope: 3 }, bootPending: 'yes' })
    expect(out.bits).toBe(0)
    expect(out.kernel.xpBoost).toBe(5)
    expect(out.kernel.glitch).toBe(0)
    expect(out.bootPending).toBe(false)
    expect('nope' in out.kernel).toBe(false)
  })
})
