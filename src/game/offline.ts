import { FOX_LEG_MAX, LASER_WIDTH, MAX_OFFLINE_SECONDS, OFFLINE_EFFICIENCY, PIXEL_SIZE, WORLD_AREA } from './config'
import { computeStats, type Stats } from './formulas'
import type { SaveState } from './types'

/**
 * Seconds of offline progress to award.
 *
 * Clock-abuse protection: we measure from the *latest* timestamp we have ever
 * observed (`maxSeenAt`), not just the last save. Winding the clock back yields
 * nothing, and winding it back then forward again only pays out once real time
 * passes the previous high-water mark. Gains are capped at MAX_OFFLINE_SECONDS.
 */
export function offlineSeconds(now: number, savedAt: number, maxSeenAt: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(savedAt)) return 0
  const ref = Math.max(savedAt, Number.isFinite(maxSeenAt) ? maxSeenAt : 0)
  const ms = now - ref
  if (ms <= 0) return 0
  return Math.min(ms / 1000, MAX_OFFLINE_SECONDS)
}

/**
 * Steady-state kills/second from automation only (drones, bombs, lasers).
 * Manual play, golden pixels, combos and storms are deliberately excluded:
 * offline progress should never beat playing.
 */
export function automationKillRate(st: Stats, area = WORLD_AREA): number {
  const spawnCap = st.maxPixels / st.respawnTime
  const side = Math.sqrt(area)
  const hop = (0.45 * side) / Math.max(1, Math.sqrt(st.maxPixels)) / st.droneSpeed
  const droneRate = st.drones > 0 ? st.drones / Math.max(st.droneCooldown, hop) : 0
  const density = st.maxPixels / area
  const bombRate = Number.isFinite(st.bombInterval)
    ? (1 / st.bombInterval) * Math.max(1, density * Math.PI * st.bombRadius ** 2)
    : 0
  const laserRate = Number.isFinite(st.laserInterval)
    ? (st.laserBeams / st.laserInterval) * Math.max(1, density * (LASER_WIDTH + PIXEL_SIZE) * side * 1.2)
    : 0
  // The fox only reaches part of the arena, so count it at half its leap rate.
  const foxRate = st.foxEnabled ? 0.5 / (st.foxCooldown + 2 * FOX_LEG_MAX) : 0
  return Math.min(spawnCap, droneRate + bombRate + laserRate + foxRate)
}

export interface OfflineGains {
  seconds: number
  kills: number
  pixels: number
  xp: number
}

export function offlineGains(state: SaveState, seconds: number): OfflineGains {
  const st = computeStats(state)
  const rate = automationKillRate(st)
  const kills = Math.floor(rate * seconds * OFFLINE_EFFICIENCY)
  const avgValue = st.value * (1 + st.critChance * (st.critMult - 1))
  return { seconds, kills, pixels: kills * avgValue, xp: kills * st.xpPerKill }
}
