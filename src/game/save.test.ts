import { describe, expect, it } from 'vitest'
import { MAX_OFFLINE_SECONDS, SAVE_KEY, SAVE_VERSION } from './config'
import { computeStats } from './formulas'
import { automationKillRate, offlineGains, offlineSeconds } from './offline'
import { SaveError, exportSave, importSave, loadFrom, makeSaveFile, parseSaveFile, sanitizeState, writeTo, type KeyValueStore } from './save'
import { createInitialState } from './state'
import { UPGRADE_MAP } from './upgrades'

const HOUR = 3600 * 1000

class MemStore implements KeyValueStore {
  map = new Map<string, string>()
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
}

describe('offline time', () => {
  const now = 1_800_000_000_000

  it('counts real elapsed time since the last save', () => {
    expect(offlineSeconds(now, now - 60_000, now - 60_000)).toBeCloseTo(60)
  })

  it('is capped', () => {
    expect(offlineSeconds(now, now - 100 * HOUR, 0)).toBe(MAX_OFFLINE_SECONDS)
  })

  it('pays nothing when the clock goes backwards', () => {
    expect(offlineSeconds(now - HOUR, now, now)).toBe(0)
  })

  it('measures from the highest timestamp ever seen (rollback then forward)', () => {
    // Player saved at `now`, rolled the clock back 10h, played (saving at
    // now-10h) and then rolled forward to now+1min. Only 1 minute is real.
    const savedAt = now - 10 * HOUR
    expect(offlineSeconds(now + 60_000, savedAt, now)).toBeCloseTo(60)
  })

  it('rejects garbage timestamps', () => {
    expect(offlineSeconds(NaN, 0, 0)).toBe(0)
    expect(offlineSeconds(now, Infinity, 0)).toBe(0)
  })
})

describe('offline gains', () => {
  it('are zero without automation', () => {
    const s = createInitialState()
    s.level = 4
    expect(offlineGains(s, 3600).pixels).toBe(0)
  })

  it('come from drones once unlocked, at reduced efficiency', () => {
    const s = createInitialState()
    s.level = 6
    s.upgrades.auto = 3
    s.upgrades.multi = 4
    const g = offlineGains(s, 600)
    expect(g.kills).toBeGreaterThan(0)
    expect(g.pixels).toBeGreaterThan(0)
    const fullRate = automationKillRate(computeStats(s))
    expect(g.kills).toBeLessThanOrEqual(fullRate * 600 * 0.5 + 1)
  })

  it('never exceed what the arena can spawn', () => {
    const s = createInitialState()
    s.level = 18
    for (const id of Object.keys(s.upgrades) as (keyof typeof s.upgrades)[]) s.upgrades[id] = UPGRADE_MAP[id].max
    const st = computeStats(s)
    expect(automationKillRate(st)).toBeLessThanOrEqual(st.maxPixels / st.respawnTime + 1e-9)
  })
})

describe('save files', () => {
  it('round-trip through export / import', () => {
    const s = createInitialState()
    s.pixels = 1234.5
    s.level = 7
    s.upgrades.value = 3
    s.achievements = ['first', 'crit']
    const code = exportSave(makeSaveFile(s, 1000))
    expect(code.startsWith('ONEPIXEL:')).toBe(true)
    const back = importSave(code)
    expect(back.v).toBe(SAVE_VERSION)
    expect(back.state.pixels).toBe(1234.5)
    expect(back.state.level).toBe(7)
    expect(back.state.upgrades.value).toBe(3)
    expect(back.state.achievements).toEqual(['first', 'crit'])
  })

  it('detect tampering via checksum', () => {
    const code = exportSave(makeSaveFile(createInitialState(), 1000))
    const dot = code.lastIndexOf('.')
    const tampered = code.slice(0, dot - 2) + (code[dot - 2] === 'A' ? 'B' : 'A') + code.slice(dot - 1)
    expect(() => importSave(tampered)).toThrow(SaveError)
  })

  it('reject non-save text', () => {
    expect(() => importSave('hello')).toThrow(SaveError)
    expect(() => importSave('ONEPIXEL:abc')).toThrow(SaveError)
  })

  it('reject saves from a newer version', () => {
    expect(() => parseSaveFile({ v: SAVE_VERSION + 1, state: {} })).toThrow(/newer/)
  })

  it('migrate the unversioned v0 format', () => {
    const file = parseSaveFile({ pixels: 50, level: 3, upgrades: { respawn: 2 } })
    expect(file.v).toBe(SAVE_VERSION)
    expect(file.state.pixels).toBe(50)
    expect(file.state.level).toBe(3)
    expect(file.state.upgrades.respawn).toBe(2)
    expect(file.state.upgrades.value).toBe(0)
  })

  it('sanitise hostile or broken values', () => {
    const s = sanitizeState({
      pixels: -5,
      level: 'nine',
      xp: NaN,
      upgrades: { respawn: 9999, value: -3, bogus: 4 },
      achievements: ['first', 'first', 'not-real', 7],
      settings: { sound: 'yes' },
    })
    expect(s.pixels).toBe(0)
    expect(s.level).toBe(1)
    expect(s.xp).toBe(0)
    expect(s.upgrades.respawn).toBe(UPGRADE_MAP.respawn.max)
    expect(s.upgrades.value).toBe(0)
    expect('bogus' in s.upgrades).toBe(false)
    expect(s.achievements).toEqual(['first'])
    expect(s.settings.sound).toBe(true)
  })

  it('persist to and load from storage, surviving corruption', () => {
    const store = new MemStore()
    const s = createInitialState()
    s.pixels = 77
    writeTo(store, makeSaveFile(s, 5))
    expect(loadFrom(store)?.state.pixels).toBe(77)
    store.setItem(SAVE_KEY, '{not json')
    expect(loadFrom(store)).toBeNull()
    expect(loadFrom(new MemStore())).toBeNull()
  })

  it('track the highest time seen', () => {
    const f = makeSaveFile(createInitialState(), 100, 500)
    expect(f.savedAt).toBe(100)
    expect(f.maxSeenAt).toBe(500)
  })
})
