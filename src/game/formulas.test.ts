import { describe, expect, it } from 'vitest'
import { fmt, fmtTime } from './format'
import * as F from './formulas'
import { LEVELS, hasFeature, levelForFeature, upcomingUnlocks } from './levels'
import { createInitialState } from './state'
import { UPGRADES, costOf } from './upgrades'

describe('upgrade costs', () => {
  it('start cheap enough to buy within the first few pops', () => {
    expect(costOf('respawn', 0)).toBeLessThanOrEqual(10)
    expect(costOf('value', 0)).toBeLessThanOrEqual(10)
  })

  it('grow strictly with level for every upgrade', () => {
    for (const u of UPGRADES) {
      for (let l = 0; l + 1 < u.max; l++) expect(costOf(u.id, l + 1)).toBeGreaterThan(costOf(u.id, l))
    }
  })

  it('every upgrade gated by a feature points at a real level unlock', () => {
    for (const u of UPGRADES) if (u.requires) expect(levelForFeature(u.requires)).toBeLessThan(Infinity)
  })
})

describe('stat curves', () => {
  it('respawn time shrinks but never below the floor', () => {
    expect(F.respawnTime(0)).toBe(2)
    for (let l = 0; l < 30; l++) expect(F.respawnTime(l + 1)).toBeLessThanOrEqual(F.respawnTime(l))
    expect(F.respawnTime(100)).toBe(0.3)
  })

  it('every unlockable mechanic is off at level 0', () => {
    expect(F.critChance(0)).toBe(0)
    expect(F.comboCap(0)).toBe(0)
    expect(F.blastRadius(0)).toBe(0)
    expect(F.goldenChance(0)).toBe(0)
    expect(F.blueChance(0)).toBe(0)
    expect(F.rainbowInterval(0)).toBe(Infinity)
    expect(F.chainChance(0)).toBe(0)
    expect(F.droneCount(0, true)).toBe(0)
    expect(F.bombInterval(0)).toBe(Infinity)
    expect(F.laserInterval(0)).toBe(Infinity)
    expect(F.nukeKills(0)).toBe(Infinity)
  })

  it('boss curves: HP grows by tier, kills pay a lasting bonus, armor piercing starts at x1', () => {
    for (let t = 1; t < 30; t++) expect(F.bossMaxHp(t + 1)).toBeGreaterThan(F.bossMaxHp(t))
    expect(F.bossBonus(0)).toBe(1)
    expect(F.bossBonus(3)).toBeGreaterThan(F.bossBonus(2))
    expect(F.pierceMult(0)).toBe(1)
    expect(F.pierceMult(5)).toBeGreaterThan(F.pierceMult(4))
  })

  it('crit chance is capped', () => {
    expect(F.critChance(1)).toBeCloseTo(0.05)
    expect(F.critChance(1000)).toBe(0.5)
  })

  it('combo bonus stops at the cap', () => {
    expect(F.comboMult(0, 10)).toBe(1)
    expect(F.comboMult(10, 10)).toBeCloseTo(1.3)
    expect(F.comboMult(99, 10)).toBeCloseTo(1.3)
  })

  it('xp requirements grow every level', () => {
    expect(F.xpToNext(1)).toBe(10)
    for (let l = 1; l < 30; l++) expect(F.xpToNext(l + 1)).toBeGreaterThan(F.xpToNext(l))
  })
})

describe('computeStats', () => {
  it('a fresh game is exactly one pixel and nothing else', () => {
    const st = F.computeStats(createInitialState())
    expect(st.maxPixels).toBe(1)
    expect(st.value).toBe(1)
    expect(st.critChance).toBe(0)
    expect(st.drones).toBe(0)
    expect(st.blastRadius).toBe(0)
    expect(st.goldenChance).toBe(0)
    expect(st.blueChance).toBe(0)
    expect(st.rainbowInterval).toBe(Infinity)
    expect(st.bombInterval).toBe(Infinity)
    expect(st.laserInterval).toBe(Infinity)
  })

  it('levels only stock the shop; purchases switch mechanics on', () => {
    const s = createInitialState()
    s.level = 5
    let st = F.computeStats(s)
    expect([st.maxPixels, st.critChance, st.comboCap, st.blastRadius, st.drones]).toEqual([1, 0, 0, 0, 0])
    s.upgrades.multi = 1
    s.upgrades.critChance = 1
    s.upgrades.combo = 1
    s.upgrades.blast = 1
    st = F.computeStats(s)
    expect(st.maxPixels).toBe(2)
    expect(st.critChance).toBeCloseTo(0.05)
    expect(st.comboCap).toBe(10)
    expect(st.blastRadius).toBe(9)
  })

  it('drones unlock at level 6 but must be bought', () => {
    const s = createInitialState()
    s.level = 6
    expect(F.computeStats(s).drones).toBe(0)
    s.upgrades.auto = 1
    expect(F.computeStats(s).drones).toBe(1)
    s.upgrades.auto = 4
    expect(F.computeStats(s).drones).toBe(2)
    s.level = 13
    expect(F.computeStats(s).drones).toBe(2) // swarm unlocked but not bought
    s.upgrades.swarm = 1
    expect(F.computeStats(s).drones).toBe(4)
    s.upgrades.auto = 0
    expect(F.computeStats(s).drones).toBe(0) // swarm never gives drones for free
  })

  it('level and achievement bonuses multiply value', () => {
    const s = createInitialState()
    s.level = 3
    s.achievements = ['first', 'k100']
    expect(F.computeStats(s).value).toBeCloseTo(1.1 * 1.04)
  })

  it('overclock speeds up automation intervals once bought', () => {
    const s = createInitialState()
    s.level = 18
    s.upgrades.bomb = 1
    s.upgrades.laser = 1
    const before = F.computeStats(s)
    s.upgrades.overclock = 1
    const after = F.computeStats(s)
    expect(after.bombInterval).toBeCloseTo(before.bombInterval * F.OVERCLOCK)
    expect(after.laserInterval).toBeCloseTo(before.laserInterval * F.OVERCLOCK)
  })
})

describe('levels', () => {
  it('are ordered and each feature appears once', () => {
    const levels = LEVELS.map((l) => l.level)
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)
    expect(new Set(LEVELS.map((l) => l.feature)).size).toBe(LEVELS.length)
  })

  it('show the next two unlocks and hide the rest behind ???', () => {
    const up = upcomingUnlocks(1, 2)
    expect(up[0].def.level).toBe(2)
    expect(up[0].hidden).toBe(false)
    expect(up[1].hidden).toBe(false)
    expect(up.slice(2).every((u) => u.hidden)).toBe(true)
  })

  it('hasFeature respects level thresholds', () => {
    expect(hasFeature(5, 'drone')).toBe(false)
    expect(hasFeature(6, 'drone')).toBe(true)
  })
})

describe('format', () => {
  it('formats compact numbers', () => {
    expect(fmt(0)).toBe('0')
    expect(fmt(1.7)).toBe('1.7')
    expect(fmt(999)).toBe('999')
    expect(fmt(1234)).toBe('1.23K')
    expect(fmt(45_600_000)).toBe('45.6M')
    expect(fmt(Infinity)).toBe('---')
  })

  it('formats time', () => {
    expect(fmtTime(65)).toBe('1:05')
    expect(fmtTime(3725)).toBe('1h 02m')
  })
})
