import * as C from './config'
import { ACHIEVEMENTS } from './achievements'
import { comboMult, computeStats, xpToNext, type Stats } from './formulas'
import { Rng } from './rng'
import { createInitialState } from './state'
import type { Cause, GameEvent, PixelKind, SaveState, UpgradeId } from './types'
import { costOf, isMaxed, isUnlocked } from './upgrades'

export interface Pixel {
  id: number
  x: number
  y: number
  vy: number
  kind: PixelKind
  /** Slot pixels respawn when destroyed. Rain pixels do not. */
  slot: boolean
  age: number
  life: number
  dead: boolean
}

export interface Respawn {
  t: number
  total: number
  x: number
  y: number
}

export interface Drone {
  id: number
  x: number
  y: number
  targetId: number | null
  cooldown: number
  phase: number
}

export interface Bomb {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  fuse: number
  total: number
  r: number
  mini: boolean
  group: number
}

export interface Laser {
  x1: number
  y1: number
  x2: number
  y2: number
  t: number
  phase: 'charge' | 'fire'
  group: number
}

interface PendingBlast {
  x: number
  y: number
  r: number
  delay: number
  cause: Cause
  group: number
  depth: number
}

export interface FoxState {
  x: number
  y: number
  /** Ground line and walkable span; set by the renderer to match the scenery. */
  groundY: number
  minX: number
  maxX: number
  /** sit / walk: wandering along the ground. out / back: a leap after a pixel. */
  phase: 'sit' | 'walk' | 'out' | 'back'
  t: number
  /** Duration of the current leap leg. */
  dur: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  /** Peak height of the current leap, in world units. */
  arc: number
  /** Where the current stroll is heading. */
  walkTo: number
  /** Seconds left sitting before the next stroll. */
  rest: number
  cooldown: number
  facing: 1 | -1
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MAX_EVENTS = 800
const EARN_BINS = 10
const EARN_BIN_SECONDS = 0.5

/**
 * The whole simulation. Pure TypeScript, no DOM, no React. The renderer reads
 * entity arrays directly and consumes one-shot events via `drainEvents()`.
 */
export class Game {
  state: SaveState
  stats: Stats
  rng: Rng
  /** Separate stream for the fox's cosmetic wandering, so it never shifts gameplay rolls. */
  private foxRng: Rng

  w = 240
  h = 160
  /** Tap tolerance in world units. Set by the renderer based on CSS scale. */
  hitRadius = C.PIXEL_SIZE
  /** Regions (world units) covered by HUD overlays where pixels should not spawn. */
  exclusions: Rect[] = []

  pixels: Pixel[] = []
  respawns: Respawn[] = []
  drones: Drone[] = []
  bombs: Bomb[] = []
  lasers: Laser[] = []
  combo = { count: 0, timer: 0 }
  fox: FoxState
  rain = { active: false, remaining: 0, acc: 0, caught: 0 }
  nuke: { t: number } | null = null
  frenzy = 0
  bombTimer: number
  laserTimer: number
  time = 0

  private blasts: PendingBlast[] = []
  private groups = new Map<number, { cause: Cause; count: number }>()
  private nextId = 1
  private events: GameEvent[] = []
  private statsDirty = false
  /** Guarantees the first spawn after unlocking golden pixels is golden. */
  private forceGolden = false
  private achTimer = 0
  private earnBins: number[] = new Array(EARN_BINS).fill(0)
  private earnBinT = 0
  /** Increments whenever something the UI shows changes. */
  revision = 0

  constructor(state: SaveState = createInitialState(), seed?: number) {
    this.state = state
    this.rng = new Rng(seed)
    this.foxRng = new Rng(seed === undefined ? undefined : seed ^ 0x5f0c5)
    this.stats = computeStats(state)
    this.bombTimer = Math.min(this.stats.bombInterval, 4)
    this.laserTimer = Math.min(this.stats.laserInterval, 3)
    const fx = this.w * 0.6
    const fy = this.h * 0.8
    this.fox = {
      x: fx,
      y: fy,
      groundY: fy,
      minX: 12,
      maxX: this.w - 12,
      phase: 'sit',
      t: 0,
      dur: C.FOX_LEG_MIN,
      fromX: fx,
      fromY: fy,
      toX: fx,
      toY: fy,
      arc: 0,
      walkTo: fx,
      rest: 1.5,
      cooldown: 1,
      facing: -1,
    }
    // The very first thing the player sees: one pixel, dead centre.
    this.spawnPixel(this.w / 2, this.h / 2, 'normal', true)
    this.ensureSlots()
  }

  // ---------------------------------------------------------------- public API

  resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return
    const sx = w / this.w
    const sy = h / this.h
    const scaleAll = (o: { x: number; y: number }) => {
      o.x *= sx
      o.y *= sy
    }
    this.pixels.forEach(scaleAll)
    this.respawns.forEach(scaleAll)
    this.drones.forEach(scaleAll)
    this.bombs.forEach(scaleAll)
    this.blasts.forEach(scaleAll)
    const fx = this.fox
    for (const k of ['x', 'minX', 'maxX', 'fromX', 'toX', 'walkTo'] as const) fx[k] *= sx
    for (const k of ['y', 'groundY', 'fromY', 'toY'] as const) fx[k] *= sy
    for (const l of this.lasers) {
      l.x1 *= sx
      l.x2 *= sx
      l.y1 *= sy
      l.y2 *= sy
    }
    this.w = w
    this.h = h
  }

  /** Line the fox's ground and walkable span up with the scenery (world units). */
  setFoxGround(groundY: number, minX: number, maxX: number): void {
    const f = this.fox
    f.groundY = groundY
    f.minX = minX
    f.maxX = Math.max(minX, maxX)
    if (f.phase === 'sit' || f.phase === 'walk') {
      f.y = groundY
      f.x = Math.max(f.minX, Math.min(f.maxX, f.x))
      f.walkTo = Math.max(f.minX, Math.min(f.maxX, f.walkTo))
    } else if (f.phase === 'back') {
      f.toY = groundY
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events
    this.events = []
    return e
  }

  /** Pixels per second, averaged over the last few seconds. */
  get incomeRate(): number {
    let sum = 0
    for (const b of this.earnBins) sum += b
    return sum / (EARN_BINS * EARN_BIN_SECONDS)
  }

  get nukeReady(): boolean {
    return this.stats.nukeEnabled && this.state.nukeCharge >= this.stats.nukeKills && !this.nuke
  }

  canBuy(id: UpgradeId): boolean {
    return isUnlocked(this.state, id) && !isMaxed(this.state, id) && this.state.pixels >= costOf(id, this.state.upgrades[id])
  }

  buy(id: UpgradeId): boolean {
    if (!this.canBuy(id)) {
      this.emit({ type: 'denied' })
      return false
    }
    this.state.pixels -= costOf(id, this.state.upgrades[id])
    this.state.upgrades[id] += 1
    this.markSeen(id)
    this.refreshStats()
    if (this.state.upgrades[id] === 1) this.onFirstPurchase(id)
    this.emit({ type: 'buy', id, level: this.state.upgrades[id] })
    this.revision++
    return true
  }

  /** Buy as many levels as the player can afford. Returns how many were bought. */
  buyMax(id: UpgradeId): number {
    let n = 0
    while (this.canBuy(id)) {
      this.buy(id)
      n++
    }
    if (n === 0) this.emit({ type: 'denied' })
    return n
  }

  markSeen(id: UpgradeId): void {
    if (!this.state.seenUpgrades.includes(id)) this.state.seenUpgrades.push(id)
  }

  launchNuke(): boolean {
    if (!this.nukeReady) return false
    this.nuke = { t: C.NUKE_WARMUP }
    this.emit({ type: 'nuke-warn' })
    this.revision++
    return true
  }

  /** A tap / click at world coordinates. */
  pointerDown(x: number, y: number): void {
    if (this.nuke) return
    const st = this.state.stats
    st.clicks++

    for (const b of this.bombs) {
      if (Math.hypot(b.x - x, b.y - y) <= this.hitRadius + 3) b.fuse = 0
    }

    const blastR = this.stats.blastRadius
    const reach = blastR > 0 ? blastR + C.PIXEL_SIZE / 2 : 0
    const hits: { p: Pixel; d: number }[] = []
    for (const p of this.pixels) {
      if (p.dead) continue
      const d = Math.hypot(p.x - x, p.y - y)
      if (d <= this.hitRadius || d <= reach) hits.push({ p, d })
    }
    if (blastR > 0) this.emit({ type: 'blast', x, y, r: blastR, cause: 'click' })
    if (hits.length === 0) {
      this.emit({ type: 'miss', x, y })
      return
    }
    hits.sort((a, b) => a.d - b.d)
    const group = this.newGroup('click')
    const comboOn = this.stats.comboCap > 0
    for (const { p } of hits) {
      if (comboOn) {
        this.combo.count++
        this.combo.timer = C.COMBO_WINDOW
        if (this.combo.count > st.maxCombo) st.maxCombo = this.combo.count
      }
      st.manualKills++
      this.destroy(p, 'click', group)
    }
  }

  tick(dt: number): void {
    this.time += dt
    this.state.stats.playTime += dt
    if (this.statsDirty) this.refreshStats()

    this.updateCombo(dt)
    this.updateNuke(dt)
    this.updatePixels(dt)
    this.updateRespawns(dt)
    this.updateDrones(dt)
    this.updateFox(dt)
    this.updateBombs(dt)
    this.updateBlasts(dt)
    this.updateLasers(dt)
    this.updateRain(dt)
    if (this.frenzy > 0) this.frenzy = Math.max(0, this.frenzy - dt)

    // Compact dead entities once per tick.
    if (this.pixels.some((p) => p.dead)) this.pixels = this.pixels.filter((p) => !p.dead)
    this.ensureSlots()
    if (this.pixels.length > this.state.stats.mostOnScreen) this.state.stats.mostOnScreen = this.pixels.length
    if (this.blasts.length === 0 && this.bombs.length === 0 && this.lasers.length === 0) this.groups.clear()

    this.earnBinT += dt
    if (this.earnBinT >= EARN_BIN_SECONDS) {
      this.earnBinT -= EARN_BIN_SECONDS
      this.earnBins.pop()
      this.earnBins.unshift(0)
    }

    this.achTimer -= dt
    if (this.achTimer <= 0) {
      this.achTimer = 0.5
      this.checkAchievements()
    }
  }

  /** Award pixels/xp computed by offline progress. */
  grant(pixels: number, xp: number): void {
    this.earn(pixels, false)
    this.addXp(xp)
    this.checkAchievements()
    this.revision++
  }

  // ------------------------------------------------------------ core mechanics

  private destroy(p: Pixel, cause: Cause, group: number, mult = 1, depth = 0): void {
    if (p.dead) return
    p.dead = true
    const s = this.stats
    const st = this.state.stats

    let amount = s.value * mult
    let xp = s.xpPerKill
    if (p.kind === 'golden') {
      amount *= C.GOLDEN_MULT
      xp *= C.GOLDEN_XP_MULT
      st.goldenKills++
    }
    const crit = s.critChance > 0 && this.rng.chance(s.critChance)
    if (crit) {
      amount *= s.critMult
      st.crits++
    }
    if (cause === 'click' && s.comboCap > 0) amount *= comboMult(this.combo.count, s.comboCap)

    this.earn(amount, true)
    this.addXp(xp)

    st.kills++
    if (cause === 'drone') st.droneKills++
    else if (cause === 'bomb') st.bombKills++
    else if (cause === 'laser') st.laserKills++
    else if (cause === 'chain') st.chainKills++
    else if (cause === 'fox') st.foxKills++
    if (p.kind === 'rain' || (p.vy > 0 && p.kind === 'golden')) {
      st.rainKills++
      if (this.rain.active) this.rain.caught++
    }

    if (s.nukeEnabled && !this.nuke && cause !== 'nuke') {
      this.state.nukeCharge = Math.min(s.nukeKills, this.state.nukeCharge + 1)
    }

    const g = this.groups.get(group)
    if (g) {
      g.count++
      if (g.cause === 'click' && g.count > st.bestMultiClick) st.bestMultiClick = g.count
      if (g.cause === 'chain' && g.count > st.bestChain) st.bestChain = g.count
      if (g.cause === 'bomb' && g.count > st.bestBomb) st.bestBomb = g.count
      if (g.cause === 'laser' && g.count > st.bestLaser) st.bestLaser = g.count
    }

    if (p.slot) this.queueRespawn()

    if (cause !== 'nuke' && s.chainChance > 0 && depth < C.CHAIN_MAX_DEPTH && this.rng.chance(s.chainChance)) {
      const chainGroup = cause === 'chain' ? group : this.newGroup('chain')
      this.blasts.push({ x: p.x, y: p.y, r: C.CHAIN_RADIUS, delay: C.CHAIN_DELAY, cause: 'chain', group: chainGroup, depth: depth + 1 })
    }

    this.emit({ type: 'pop', x: p.x, y: p.y, kind: p.kind, amount, xp, crit, cause, combo: this.combo.count })
  }

  private earn(amount: number, track: boolean): void {
    const s = this.state
    s.pixels += amount
    s.totalPixels += amount
    if (track) this.earnBins[0] += amount
    if (!s.reveal.hud) s.reveal.hud = true
    this.revision++
  }

  private addXp(xp: number): void {
    const s = this.state
    s.xp += xp
    while (s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level)
      s.level++
      this.onLevelUp(s.level)
    }
  }

  private onLevelUp(level: number): void {
    if (level >= C.UPGRADES_UNLOCK_LEVEL) this.state.reveal.panel = true
    this.refreshStats()
    this.emit({ type: 'levelup', level })
    this.revision++
  }

  /** Show off a newly bought mechanic straight away rather than after a full cycle. */
  private onFirstPurchase(id: UpgradeId): void {
    switch (id) {
      case 'bomb':
        this.bombTimer = 1.5
        break
      case 'laser':
        this.laserTimer = 1.2
        break
      case 'rain':
        this.state.rainTimer = 3
        break
      case 'golden':
        this.forceGolden = true
        break
    }
  }

  refreshStats(): void {
    this.stats = computeStats(this.state)
    this.statsDirty = false
    if (this.bombTimer > this.stats.bombInterval) this.bombTimer = this.stats.bombInterval
    if (this.laserTimer > this.stats.laserInterval) this.laserTimer = this.stats.laserInterval
  }

  private checkAchievements(): void {
    const owned = this.state.achievements
    for (const a of ACHIEVEMENTS) {
      if (!owned.includes(a.id) && a.check(this.state)) {
        owned.push(a.id)
        this.statsDirty = true
        this.emit({ type: 'achievement', id: a.id })
        this.revision++
      }
    }
  }

  private newGroup(cause: Cause): number {
    const id = this.nextId++
    this.groups.set(id, { cause, count: 0 })
    return id
  }

  private emit(e: GameEvent): void {
    this.events.push(e)
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS)
  }

  // ------------------------------------------------------------------ spawning

  private spawnPixel(x: number, y: number, kind: PixelKind, slot: boolean, vy = 0): Pixel {
    const p: Pixel = {
      id: this.nextId++,
      x,
      y,
      vy,
      kind,
      slot,
      age: 0,
      life: kind === 'golden' && vy === 0 ? C.GOLDEN_LIFETIME : Infinity,
      dead: false,
    }
    this.pixels.push(p)
    if (vy === 0) this.emit({ type: 'spawn', x, y, kind })
    return p
  }

  private slotCount(): number {
    let n = this.respawns.length
    for (const p of this.pixels) if (p.slot && !p.dead) n++
    return n
  }

  private queueRespawn(delay?: number): void {
    const base = delay ?? this.stats.respawnTime * (this.frenzy > 0 ? C.FRENZY_RESPAWN_MULT : 1)
    const pos = this.findSpawnPos()
    this.respawns.push({ t: base, total: base, x: pos.x, y: pos.y })
  }

  private ensureSlots(): void {
    let missing = this.stats.maxPixels - this.slotCount()
    let i = 0
    while (missing-- > 0) this.queueRespawn(0.25 + 0.15 * i++)
  }

  findSpawnPos(): { x: number; y: number } {
    const m = C.SPAWN_MARGIN
    let best = { x: this.w / 2, y: this.h / 2 }
    let bestScore = -1
    for (let i = 0; i < 24; i++) {
      const x = this.rng.range(m, Math.max(m + 1, this.w - m))
      const y = this.rng.range(m, Math.max(m + 1, this.h - m))
      if (this.exclusions.some((r) => x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 3 && y < r.y + r.h + 3)) continue
      let nearest = Infinity
      for (const p of this.pixels) if (!p.dead) nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y))
      for (const r of this.respawns) nearest = Math.min(nearest, Math.hypot(r.x - x, r.y - y))
      if (nearest >= C.MIN_SPAWN_DIST) return { x, y }
      if (nearest > bestScore) {
        bestScore = nearest
        best = { x, y }
      }
    }
    return best
  }

  // ------------------------------------------------------------------- updates

  private updateCombo(dt: number): void {
    if (this.combo.count === 0) return
    this.combo.timer -= dt
    if (this.combo.timer <= 0) {
      this.combo.count = 0
      this.revision++
    }
  }

  private updateNuke(dt: number): void {
    if (!this.nuke) return
    this.nuke.t -= dt
    if (this.nuke.t > 0) return
    this.nuke = null
    const group = this.newGroup('nuke')
    const before = this.state.totalPixels
    let count = 0
    for (const p of this.pixels) {
      if (p.dead) continue
      this.destroy(p, 'nuke', group, this.stats.nukeYield)
      count++
    }
    this.bombs = []
    this.lasers = []
    this.blasts = []
    this.state.nukeCharge = 0
    this.state.stats.nukes++
    this.frenzy = C.FRENZY_TIME
    for (let i = 0; i < this.respawns.length; i++) {
      const r = this.respawns[i]
      r.t = Math.min(r.t, 0.35 + i * 0.03)
      r.total = Math.max(r.t, 0.01)
    }
    this.emit({ type: 'nuke', count, amount: this.state.totalPixels - before })
    this.revision++
  }

  private updatePixels(dt: number): void {
    for (const p of this.pixels) {
      if (p.dead) continue
      p.age += dt
      if (p.vy !== 0) {
        p.y += p.vy * dt
        if (p.y > this.h + 6) p.dead = true
        continue
      }
      if (p.life !== Infinity) {
        p.life -= dt
        if (p.life <= 0) {
          p.dead = true
          this.emit({ type: 'golden-expire', x: p.x, y: p.y })
          if (p.slot) this.queueRespawn()
        }
      }
    }
  }

  private updateRespawns(dt: number): void {
    if (this.respawns.length === 0) return
    const remaining: Respawn[] = []
    const due: Respawn[] = []
    for (const r of this.respawns) {
      r.t -= dt
      if (r.t <= 0) due.push(r)
      else remaining.push(r)
    }
    this.respawns = remaining
    for (const r of due) {
      let kind: PixelKind = 'normal'
      if (this.stats.goldenChance > 0 && (this.forceGolden || this.rng.chance(this.stats.goldenChance))) {
        kind = 'golden'
        this.forceGolden = false
      }
      this.spawnPixel(r.x, r.y, kind, true)
    }
  }

  private updateDrones(dt: number): void {
    const s = this.stats
    while (this.drones.length < s.drones) {
      this.drones.push({
        id: this.nextId++,
        x: this.rng.range(this.w * 0.2, this.w * 0.8),
        y: -6,
        targetId: null,
        cooldown: 0.4,
        phase: this.rng.range(0, Math.PI * 2),
      })
    }
    if (this.drones.length === 0) return

    const byId = new Map<number, Pixel>()
    for (const p of this.pixels) if (!p.dead) byId.set(p.id, p)
    const claimed = new Set<number>()
    for (const d of this.drones) if (d.targetId !== null) claimed.add(d.targetId)

    for (const d of this.drones) {
      d.phase += dt * 2
      if (d.cooldown > 0) d.cooldown -= dt
      let target = d.targetId !== null ? byId.get(d.targetId) : undefined
      if (!target || target.kind === 'golden') {
        if (d.targetId !== null) claimed.delete(d.targetId)
        target = undefined
        d.targetId = null
        let best = Infinity
        for (const p of byId.values()) {
          if (p.kind === 'golden' || claimed.has(p.id) || p.age < 0.15) continue
          const dist = Math.hypot(p.x - d.x, p.y - d.y)
          if (dist < best) {
            best = dist
            target = p
          }
        }
        if (target) {
          d.targetId = target.id
          claimed.add(target.id)
        }
      }

      const speed = s.droneSpeed
      if (target) {
        const dx = target.x - d.x
        const dy = target.y - d.y
        const dist = Math.hypot(dx, dy)
        const step = speed * dt
        if (dist <= step + 0.5) {
          d.x = target.x
          d.y = target.y
          if (d.cooldown <= 0) {
            this.emit({ type: 'drone-zap', x1: d.x, y1: d.y - 4, x2: target.x, y2: target.y })
            this.destroy(target, 'drone', 0)
            d.cooldown = s.droneCooldown
            d.targetId = null
          }
        } else {
          d.x += (dx / dist) * step
          d.y += (dy / dist) * step
        }
      } else {
        // Idle patrol: lazy figure-eight around its current spot, clamped to the arena.
        d.x += Math.cos(d.phase) * 8 * dt
        d.y += Math.sin(d.phase * 2) * 5 * dt + (d.y < 10 ? 20 * dt : 0)
        d.x = Math.max(4, Math.min(this.w - 4, d.x))
      }
    }
  }

  /**
   * The fox strolls left and right along the ground, sitting for a while
   * between walks. Once FOX FRIEND is bought it also leaps from wherever it is
   * to the nearest pixel in range, catches it, and drops back to the ground.
   */
  private updateFox(dt: number): void {
    const f = this.fox
    const s = this.stats
    if (f.phase === 'sit' || f.phase === 'walk') {
      f.y = f.groundY
      if (s.foxEnabled && !this.nuke) {
        f.cooldown -= dt
        if (f.cooldown <= 0) {
          let target: Pixel | undefined
          let best = s.foxRange
          for (const p of this.pixels) {
            if (p.dead || p.age < 0.2) continue
            const d = Math.hypot(p.x - f.x, p.y - f.groundY)
            if (d < best) {
              best = d
              target = p
            }
          }
          if (target) {
            this.foxLeap('out', target.x, target.y)
            return
          }
          f.cooldown = 0.25
        }
      }
      this.foxWander(dt)
      return
    }

    f.t += dt
    const p = Math.min(1, f.t / f.dur)
    f.x = f.fromX + (f.toX - f.fromX) * p
    f.y = f.fromY + (f.toY - f.fromY) * p - Math.sin(p * Math.PI) * f.arc
    if (p < 1) return
    if (f.phase === 'out') {
      for (const px of this.pixels) {
        if (!px.dead && Math.hypot(px.x - f.toX, px.y - f.toY) <= C.FOX_CATCH_RADIUS) this.destroy(px, 'fox', 0)
      }
      this.foxLeap('back', Math.max(f.minX, Math.min(f.maxX, f.toX)), f.groundY)
    } else {
      f.phase = 'sit'
      f.rest = 0.6
      f.cooldown = s.foxCooldown
    }
  }

  private foxWander(dt: number): void {
    const f = this.fox
    const r = this.foxRng
    if (f.phase === 'sit') {
      f.rest -= dt
      if (f.rest > 0) return
      // Stroll somewhere new; head back toward the middle when near an edge.
      let dir: 1 | -1 = r.chance(0.5) ? 1 : -1
      if (f.x - f.minX < 25) dir = 1
      else if (f.maxX - f.x < 25) dir = -1
      f.walkTo = Math.max(f.minX, Math.min(f.maxX, f.x + dir * r.range(15, 70)))
      f.facing = dir
      f.phase = 'walk'
      return
    }
    const step = C.FOX_WALK_SPEED * dt
    const d = f.walkTo - f.x
    if (Math.abs(d) <= step) {
      f.x = f.walkTo
      f.phase = 'sit'
      f.rest = r.range(C.FOX_REST_MIN, C.FOX_REST_MAX)
    } else {
      f.x += Math.sign(d) * step
      f.facing = d > 0 ? 1 : -1
    }
  }

  private foxLeap(phase: 'out' | 'back', toX: number, toY: number): void {
    const f = this.fox
    const d = Math.hypot(toX - f.x, toY - f.y)
    f.phase = phase
    f.t = 0
    f.dur = Math.min(C.FOX_LEG_MAX, C.FOX_LEG_MIN + d / 220)
    f.fromX = f.x
    f.fromY = f.y
    f.toX = toX
    f.toY = toY
    f.arc = (phase === 'out' ? 16 : 6) + d * 0.3
    if (Math.abs(toX - f.x) > 0.5) f.facing = toX > f.x ? 1 : -1
  }

  private updateBombs(dt: number): void {
    if (Number.isFinite(this.stats.bombInterval) && !this.nuke) {
      this.bombTimer -= dt
      if (this.bombTimer <= 0) {
        this.bombTimer = this.stats.bombInterval
        this.dropBomb()
      }
    }
    if (this.bombs.length === 0) return
    const live: Bomb[] = []
    for (const b of this.bombs) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vx *= Math.pow(0.04, dt)
      b.vy *= Math.pow(0.04, dt)
      b.x = Math.max(2, Math.min(this.w - 2, b.x))
      b.y = Math.max(2, Math.min(this.h - 2, b.y))
      b.fuse -= dt
      if (b.fuse > 0) {
        live.push(b)
        continue
      }
      this.blasts.push({ x: b.x, y: b.y, r: b.r, delay: 0, cause: 'bomb', group: b.group, depth: 0 })
      if (!b.mini && this.stats.cluster) {
        for (let i = 0; i < 3; i++) {
          const a = this.rng.range(0, Math.PI * 2)
          const v = this.rng.range(45, 70)
          live.push({
            id: this.nextId++,
            x: b.x,
            y: b.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            fuse: C.BOMBLET_FUSE + i * 0.08,
            total: C.BOMBLET_FUSE + i * 0.08,
            r: C.BOMBLET_RADIUS,
            mini: true,
            group: b.group,
          })
        }
      }
    }
    this.bombs = live
  }

  private dropBomb(): void {
    const r = this.stats.bombRadius
    let x = this.rng.range(20, this.w - 20)
    let y = this.rng.range(20, this.h - 20)
    let best = -1
    const alive = this.pixels.filter((p) => !p.dead)
    for (let i = 0; i < Math.min(8, alive.length); i++) {
      const c = alive[this.rng.int(0, alive.length - 1)]
      let n = 0
      for (const p of alive) if (Math.hypot(p.x - c.x, p.y - c.y) <= r) n++
      if (n > best) {
        best = n
        x = c.x
        y = c.y
      }
    }
    this.bombs.push({ id: this.nextId++, x, y, vx: 0, vy: 0, fuse: C.BOMB_FUSE, total: C.BOMB_FUSE, r, mini: false, group: this.newGroup('bomb') })
    this.emit({ type: 'bomb-drop', x, y })
  }

  private updateBlasts(dt: number): void {
    if (this.blasts.length === 0) return
    const due: PendingBlast[] = []
    const later: PendingBlast[] = []
    for (const b of this.blasts) {
      b.delay -= dt
      if (b.delay <= 0) due.push(b)
      else later.push(b)
    }
    this.blasts = later
    for (const b of due) {
      this.emit({ type: 'blast', x: b.x, y: b.y, r: b.r, cause: b.cause })
      const reach = b.r + C.PIXEL_SIZE / 2
      for (const p of this.pixels) {
        if (!p.dead && Math.hypot(p.x - b.x, p.y - b.y) <= reach) this.destroy(p, b.cause, b.group, 1, b.depth)
      }
    }
  }

  private updateLasers(dt: number): void {
    if (Number.isFinite(this.stats.laserInterval) && !this.nuke) {
      this.laserTimer -= dt
      if (this.laserTimer <= 0) {
        this.laserTimer = this.stats.laserInterval
        for (let i = 0; i < this.stats.laserBeams; i++) this.createLaser()
      }
    }
    if (this.lasers.length === 0) return
    const live: Laser[] = []
    for (const l of this.lasers) {
      l.t -= dt
      if (l.t > 0) {
        live.push(l)
        continue
      }
      if (l.phase === 'charge') {
        l.phase = 'fire'
        l.t = C.LASER_FIRE
        this.fireLaser(l)
        live.push(l)
      }
    }
    this.lasers = live
  }

  private createLaser(): void {
    const alive = this.pixels.filter((p) => !p.dead)
    const anchor = alive.length ? alive[this.rng.int(0, alive.length - 1)] : { x: this.w / 2, y: this.h / 2 }
    // Mostly horizontal/diagonal sweeps read best on wide and tall screens alike.
    const a = this.rng.range(-0.6, 0.6) + (this.rng.chance(0.3) ? Math.PI / 2 : 0)
    const L = this.w + this.h
    const dx = Math.cos(a) * L
    const dy = Math.sin(a) * L
    this.lasers.push({ x1: anchor.x - dx, y1: anchor.y - dy, x2: anchor.x + dx, y2: anchor.y + dy, t: C.LASER_CHARGE, phase: 'charge', group: this.newGroup('laser') })
  }

  private fireLaser(l: Laser): void {
    this.emit({ type: 'laser-fire', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })
    const lx = l.x2 - l.x1
    const ly = l.y2 - l.y1
    const len = Math.hypot(lx, ly) || 1
    const reach = C.LASER_WIDTH / 2 + C.PIXEL_SIZE / 2
    for (const p of this.pixels) {
      if (p.dead) continue
      const dist = Math.abs((p.x - l.x1) * ly - (p.y - l.y1) * lx) / len
      if (dist <= reach) this.destroy(p, 'laser', l.group)
    }
  }

  private updateRain(dt: number): void {
    if (!this.stats.rainEnabled) return
    const r = this.rain
    if (!r.active) {
      if (this.nuke) return
      this.state.rainTimer -= dt
      if (this.state.rainTimer <= 0) {
        r.active = true
        r.remaining = this.stats.rainDuration
        r.acc = 0
        r.caught = 0
        this.emit({ type: 'rain-start' })
        this.revision++
      }
      return
    }
    r.remaining -= dt
    r.acc += C.RAIN_RATE * dt
    while (r.acc >= 1) {
      r.acc -= 1
      const golden = this.stats.goldRain && this.rng.chance(0.1)
      const x = this.rng.range(C.SPAWN_MARGIN, this.w - C.SPAWN_MARGIN)
      this.spawnPixel(x, -4, golden ? 'golden' : 'rain', false, C.RAIN_SPEED * this.rng.range(0.8, 1.3))
    }
    if (r.remaining <= 0) {
      r.active = false
      this.state.rainTimer = this.stats.rainInterval
      if (r.caught > this.state.stats.bestStorm) this.state.stats.bestStorm = r.caught
      this.emit({ type: 'rain-end', caught: r.caught })
      this.revision++
    }
  }
}

