import { describe, expect, it } from 'vitest'
import { BOSS_FIGHT_TIME } from './config'
import { incomeAt, runBot, type BotOptions, type BotResult } from './bot'
import { fmt, fmtTime } from './format'
import { costOf, unlockLevelOf, UPGRADE_MAP } from './upgrades'
import type { UpgradeId } from './types'

/*
 * Pacing guard-rails. These run a simulated player through the opening and
 * assert milestones land in sensible windows. Run `npm run balance` to see
 * the full timeline.
 */
describe('balance', () => {
  const engaged = runBot({ cps: 3, reaction: 0.3, seconds: 30 * 60, seed: 7 })
  const casual = runBot({ cps: 1.2, reaction: 0.6, seconds: 30 * 60, seed: 11 })

  it('prints the timeline', () => {
    for (const [name, r] of [['engaged', engaged], ['casual', casual]] as const) {
      const rows = [...r.levelTimes.entries()].map(([l, t]) => `L${l}@${fmtTime(t)}`).join(' ')
      console.log(`${name}: ${rows}\n  final: ${fmt(r.game.state.pixels)} px, ${fmt(r.game.state.totalPixels)} total, ${r.game.state.stats.kills} kills, ach ${r.game.state.achievements.length}`)
    }
    expect(true).toBe(true)
  })

  it('first level-up comes quickly', () => {
    expect(engaged.levelTimes.get(2)).toBeLessThan(40)
    expect(casual.levelTimes.get(2)).toBeLessThan(75)
  })

  it('the first drone is bought within the first few minutes', () => {
    const unlock = engaged.levelTimes.get(6)
    const bought = engaged.purchases.find((p) => p.id === 'auto')?.t
    expect(unlock).toBeDefined()
    expect(bought).toBeDefined()
    expect(bought!).toBeGreaterThanOrEqual(unlock!)
    expect(bought!).toBeLessThan(7 * 60)
  })

  it('an engaged player reaches the nuke in roughly 10-30 minutes', () => {
    const t = engaged.levelTimes.get(12)
    expect(t).toBeDefined()
    expect(t!).toBeGreaterThan(10 * 60)
    expect(t!).toBeLessThan(30 * 60)
  })

  it('levels never arrive faster than every ~15s after the opening', () => {
    const times = [...engaged.levelTimes.values()]
    for (let i = 3; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(15)
  })

  it('a casual player still sees most mechanics in 30 minutes', () => {
    expect(casual.game.state.level).toBeGreaterThanOrEqual(10)
  })

  it('there is always something to buy early on (no long dead zones)', () => {
    const early = engaged.purchases.filter((p) => p.t < 10 * 60).map((p) => p.t)
    let maxGap = 0
    for (let i = 1; i < early.length; i++) maxGap = Math.max(maxGap, early[i] - early[i - 1])
    expect(early.length).toBeGreaterThan(20)
    expect(maxGap).toBeLessThan(90)
  })

})

/*
 * The boss arrives at level 20, hours in, so it gets its own long run.
 */
describe('boss pacing', () => {
  const run = runBot({ cps: 3, reaction: 0.3, seconds: 6 * 3600, seed: 7 })
  const l20 = run.levelTimes.get(20) ?? Infinity
  const log = run.bossLog

  it('prints the boss log', () => {
    const fights = log.map((f) => `T${f.tier}${f.outcome === 'escape' ? ' escaped' : ''}@${Math.round(f.secs)}s`).join(' ')
    console.log(`engaged: L20@${fmtTime(l20)}, ${run.game.state.stats.bossKills} bosses down, ${run.game.state.stats.bossEscapes} escaped\n  ${fights}`)
    expect(true).toBe(true)
  })

  it('the first boss is a fight, not a formality', () => {
    expect(log[0]?.outcome).toBe('defeat')
    expect(log[0].secs).toBeGreaterThan(12)
    expect(log[0].secs).toBeLessThan(BOSS_FIGHT_TIME)
  })

  it('later tiers start to escape', () => {
    expect(log.some((f) => f.outcome === 'escape')).toBe(true)
  })

  it('no tier is a wall: wounds carry over, so the bot keeps climbing', () => {
    const lastTwoHours = log.filter((f) => f.t > run.game.state.stats.playTime - 2 * 3600)
    expect(lastTwoHours.some((f) => f.outcome === 'defeat')).toBe(true)
    expect(run.game.state.stats.bossKills).toBeGreaterThanOrEqual(8)
  })
})

/*
 * The late game, L15 to the first PIXEL ZERO kill (the REBOOT choice). The
 * engaged bot launches every nuke the instant it is ready, which on a board of
 * golden pixels is ~95% of its income, so it earns far more than real players
 * (~100k/s at L17 on itch.io). The human profiles nuke by hand only now and
 * then, or never, and they set the prices.
 */
const LATE: UpgradeId[] = ['twin', 'goldRain', 'rainbow', 'overclock', 'pierce']

interface LateRow {
  id: UpgradeId
  unlock: number
  cost: number
  /** Minutes of income at the moment it unlocks. */
  minutes: number
  /** Seconds from unlock to the first purchase. */
  wait: number
}

function lateReport(r: BotResult) {
  const rows: LateRow[] = LATE.map((id) => {
    const unlock = r.levelTimes.get(unlockLevelOf(UPGRADE_MAP[id])) ?? Infinity
    const cost = costOf(id, 0)
    const bought = r.purchases.find((p) => p.id === id)?.t ?? Infinity
    return { id, unlock, cost, minutes: cost / Math.max(1, incomeAt(r, unlock)) / 60, wait: bought - unlock }
  })
  const l15 = r.levelTimes.get(15) ?? Infinity
  const l17 = r.levelTimes.get(17) ?? Infinity
  const zero = r.finalLog.find((f) => f.outcome === 'defeat')
  const zeroAt = zero ? zero.t + zero.secs : Infinity
  // Longest stretch with nothing to buy, from L15 until PIXEL ZERO falls.
  const late = r.purchases.filter((p) => p.t >= l15 && p.t <= zeroAt).map((p) => p.t)
  let maxGap = 0
  for (let i = 1; i < late.length; i++) maxGap = Math.max(maxGap, late[i] - late[i - 1])
  return { rows, l15, l17, zeroAt, maxGap }
}

const PROFILES: [string, BotOptions][] = [
  ['engaged', { cps: 3, reaction: 0.3, seconds: 4 * 3600, seed: 7 }],
  ['human', { cps: 1.5, reaction: 0.8, nukeDelay: 30, saveFor: LATE, seconds: 4 * 3600, seed: 7 }],
  ['no-nuke', { cps: 1, reaction: 1.2, nukeDelay: Infinity, saveFor: LATE, seconds: 4 * 3600, seed: 11 }],
]

describe('late-game pacing', () => {
  const runs = PROFILES.map(([name, opts]) => ({ name, r: runBot(opts) }))
  const reports = runs.map(({ name, r }) => ({ name, r, ...lateReport(r) }))

  it('prints the late-game report', () => {
    for (const { name, r, rows, l17, zeroAt, maxGap } of reports) {
      const lv = [15, 17, 18, 19, 20].map((l) => {
        const t = r.levelTimes.get(l)
        return t === undefined ? `L${l} -` : `L${l}@${fmtTime(t)} ${fmt(incomeAt(r, t))}/s`
      })
      const kills = r.bossLog.filter((f) => f.outcome === 'defeat').map((f) => fmtTime(f.t + f.secs))
      const zero = Number.isFinite(zeroAt) ? `${fmtTime(zeroAt)}, L17 -> PIXEL ZERO ${fmtTime(zeroAt - l17)}` : 'never'
      console.log(
        [
          `${name}: ${lv.join(' | ')}`,
          ...rows.map((x) => `  ${x.id.padEnd(9)} ${fmt(x.cost).padStart(6)} ${x.minutes.toFixed(1).padStart(6)} min of income at unlock, bought ${fmtTime(x.wait)} after`),
          `  bosses down at ${kills.slice(0, 5).join(' ') || '-'}`,
          `  PIXEL ZERO down at ${zero}, longest late wait ${fmtTime(maxGap)}`,
        ].join('\n'),
      )
    }
    expect(true).toBe(true)
  })

  it('no late upgrade costs more than ~15 minutes of income when it unlocks', () => {
    for (const { rows } of reports) for (const x of rows) expect(x.minutes).toBeLessThan(15)
  })

  it('a player saving for a late upgrade affords it within ~15 minutes', () => {
    for (const { name, rows } of reports.filter((x) => x.name !== 'engaged')) {
      for (const x of rows) expect(x.wait, `${name} ${x.id}`).toBeLessThan(15 * 60)
    }
  })

  it('every profile reaches the REBOOT choice (PIXEL ZERO down) in one long session', () => {
    for (const { name, zeroAt, l17 } of reports) {
      expect(zeroAt, name).toBeLessThan(3 * 3600)
      expect(zeroAt - l17, name).toBeLessThan(2 * 3600)
    }
  })

  it('there is always something to buy between L15 and PIXEL ZERO', () => {
    for (const { name, maxGap } of reports) expect(maxGap, name).toBeLessThan(15 * 60)
  })
})
