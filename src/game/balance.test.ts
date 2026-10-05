import { describe, expect, it } from 'vitest'
import { BOSS_FIGHT_TIME } from './config'
import { runBot } from './bot'
import { fmt, fmtTime } from './format'

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
