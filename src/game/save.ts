import { ACHIEVEMENTS } from './achievements'
import { BOSS_INTERVAL, SAVE_KEY, SAVE_VERSION } from './config'
import { createInitialState } from './state'
import type { SaveState, UpgradeId } from './types'
import { UPGRADE_MAP } from './upgrades'

export interface SaveFile {
  v: number
  savedAt: number
  /** Highest wall-clock time ever observed. Used to defeat clock rollback. */
  maxSeenAt: number
  state: SaveState
}

export class SaveError extends Error {}

const EXPORT_PREFIX = 'ONEPIXEL:'

export function makeSaveFile(state: SaveState, now: number, prevMaxSeen = 0): SaveFile {
  return { v: SAVE_VERSION, savedAt: now, maxSeenAt: Math.max(now, prevMaxSeen), state: structuredClone(state) }
}

type Raw = Record<string, unknown>

/**
 * Migrations keyed by the version they upgrade *from*. Each returns a file one
 * version newer. Version 0 is the unversioned prototype format, which stored
 * the bare state object with no envelope.
 */
const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  0: (raw) => ({ v: 1, savedAt: 0, maxSeenAt: 0, state: raw }),
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number, min = 0, max = Number.MAX_VALUE): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/** Fill missing fields from defaults and clamp everything to sane ranges. */
export function sanitizeState(raw: unknown): SaveState {
  const base = createInitialState()
  if (!isObj(raw)) return base
  const out = base
  out.pixels = num(raw.pixels, 0)
  out.totalPixels = Math.max(num(raw.totalPixels, 0), out.pixels)
  out.xp = num(raw.xp, 0)
  out.level = Math.floor(num(raw.level, 1, 1, 999))
  out.nukeCharge = num(raw.nukeCharge, 0)
  out.rainTimer = num(raw.rainTimer, base.rainTimer, 0, 3600)
  out.bossTimer = num(raw.bossTimer, base.bossTimer, 0, BOSS_INTERVAL)
  out.bossHealth = num(raw.bossHealth, 1, 0.05, 1)

  if (isObj(raw.upgrades)) {
    for (const id of Object.keys(out.upgrades) as UpgradeId[]) {
      out.upgrades[id] = Math.floor(num(raw.upgrades[id], 0, 0, UPGRADE_MAP[id].max))
    }
  }
  if (isObj(raw.stats)) {
    for (const k of Object.keys(out.stats) as (keyof typeof out.stats)[]) out.stats[k] = num(raw.stats[k], 0)
  }
  const known = new Set(ACHIEVEMENTS.map((a) => a.id))
  if (Array.isArray(raw.achievements)) {
    out.achievements = [...new Set(raw.achievements.filter((a): a is string => typeof a === 'string' && known.has(a)))]
  }
  if (Array.isArray(raw.seenUpgrades)) {
    out.seenUpgrades = [...new Set(raw.seenUpgrades.filter((u): u is UpgradeId => typeof u === 'string' && u in UPGRADE_MAP))]
  }
  if (isObj(raw.reveal)) {
    out.reveal = { hud: bool(raw.reveal.hud, false), panel: bool(raw.reveal.panel, false) }
  }
  if (isObj(raw.settings)) {
    out.settings = {
      sound: bool(raw.settings.sound, true),
      music: bool(raw.settings.music, true),
      autoNuke: bool(raw.settings.autoNuke, true),
      shake: bool(raw.settings.shake, true),
      haptics: bool(raw.settings.haptics, true),
    }
  }
  return out
}

export function parseSaveFile(input: unknown): SaveFile {
  if (!isObj(input)) throw new SaveError('Save data is not an object')
  let raw: Raw = input
  let v = typeof raw.v === 'number' ? raw.v : 0
  if (v > SAVE_VERSION) throw new SaveError(`Save is from a newer version (v${v})`)
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v]
    if (!m) throw new SaveError(`No migration from v${v}`)
    raw = m(raw)
    v = typeof raw.v === 'number' ? raw.v : v + 1
  }
  return {
    v: SAVE_VERSION,
    savedAt: num(raw.savedAt, 0),
    maxSeenAt: num(raw.maxSeenAt, 0),
    state: sanitizeState(raw.state),
  }
}

// --------------------------------------------------------------- export codes

/** FNV-1a, enough to catch truncated or hand-edited export strings. */
export function checksum(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(s: string): string {
  const bin = atob(s)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function exportSave(file: SaveFile): string {
  const body = toBase64(JSON.stringify(file))
  return `${EXPORT_PREFIX}${body}.${checksum(body)}`
}

export function importSave(text: string): SaveFile {
  const t = text.trim()
  if (!t.startsWith(EXPORT_PREFIX)) throw new SaveError('Not a OnePixel save code')
  const rest = t.slice(EXPORT_PREFIX.length)
  const dot = rest.lastIndexOf('.')
  if (dot < 0) throw new SaveError('Save code is incomplete')
  const body = rest.slice(0, dot)
  if (checksum(body) !== rest.slice(dot + 1)) throw new SaveError('Save code is corrupted (checksum mismatch)')
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64(body))
  } catch {
    throw new SaveError('Save code could not be decoded')
  }
  return parseSaveFile(parsed)
}

// ------------------------------------------------------------------- storage

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function loadFrom(store: KeyValueStore): SaveFile | null {
  try {
    const raw = store.getItem(SAVE_KEY)
    if (!raw) return null
    return parseSaveFile(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeTo(store: KeyValueStore, file: SaveFile): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}
