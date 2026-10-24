import * as C from './config'
import { ACHIEVEMENTS } from './achievements'
import { bossMaxHp, comboMult, computeStats, finalMaxHp, rebootBossHpMult, xpToNext, type Stats } from './formulas'
import { hasFeature } from './levels'
import { offlineGains, type OfflineGains } from './offline'
import { Rng } from './rng'
import { createInitialState } from './state'
import type { BossDamageSource, Cause, GameEvent, PixelKind, SaveState, UpgradeId } from './types'
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
  /** A cluster bomblet in flight from (x0, y0) to (x1, y1); the fuse starts once it lands. */
  arc?: { x0: number; y0: number; x1: number; y1: number; dur: number; t: number }
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
  /** A cluster bomblet rather than a full bomb. */
  mini?: boolean
  /** The pixel a chain jumped to; the blast follows it if it moves. */
  target?: Pixel
}

export interface Boss {
  x: number
  y: number
  /** Unit heading; speed depends on whether it is enraged. */
  vx: number
  vy: number
  /** Half the width of its square body. */
  r: number
  hp: number
  maxHp: number
  tier: number
  /** Rising out of the grid, fighting, or sinking back after escaping. */
  phase: 'rise' | 'fight' | 'sink' | 'die'
  /** Seconds into the current rise or sink. */
  t: number
  /** Seconds left before it escapes. */
  timeLeft: number
  eatTimer: number
  enraged: boolean
  /** It only takes nuke damage once per fight. */
  nuked: boolean
  /** PIXEL ZERO, the final boss, rather than a regular one. */
  final: boolean
  /** PIXEL ZERO's tap-only weak spots, as offsets from its centre, and seconds until they hop. */
  spots: { dx: number; dy: number }[]
  spotTimer: number
  /** Seconds until PIXEL ZERO's next EMP starts charging, and seconds left on a charge (0 when idle). */
  empTimer: number
  empCharge: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MAX_EVENTS = 800
/** Golden and rainbow pixels are left for the player: drones, chains and the boss skip them. */
const autoCanTake = (p: Pixel) => p.kind !== 'golden' && p.kind !== 'rainbow'
/** Drone target id meaning "the boss" rather than a pixel. */
const BOSS_TARGET = -1
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
  rain = { active: false, remaining: 0, acc: 0, caught: 0 }
  nuke: { t: number } | null = null
  boss: Boss | null = null
  frenzy = 0
  /** Seconds left of an EMP jam: drones hang dead in the air. */
  droneJam = 0
  /** Seconds of rainbow mode left; every pixel pays `stats.rainbowMult` while it runs. */
  rainbow = 0
  rainbowTimer: number
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
  /** Same for blue pixels, so the first purchase shows off straight away. */
  private forceBlue = false
  private achTimer = 0
  private earnBins: number[] = new Array(EARN_BINS).fill(0)
  private earnBinT = 0
  /** Increments whenever something the UI shows changes. */
  revision = 0

  constructor(state: SaveState = createInitialState(), seed?: number) {
    this.state = state
    this.rng = new Rng(seed)
    this.stats = computeStats(state)
    this.bombTimer = Math.min(this.stats.bombInterval, 4)
    this.laserTimer = Math.min(this.stats.laserInterval, 3)
    this.rainbowTimer = Math.min(this.stats.rainbowInterval, 10)
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
    for (const b of this.bombs) {
      if (!b.arc) continue
      b.arc.x0 *= sx
      b.arc.x1 *= sx
      b.arc.y0 *= sy
      b.arc.y1 *= sy
    }
    this.blasts.forEach(scaleAll)
    if (this.boss) scaleAll(this.boss)
    for (const l of this.lasers) {
      l.x1 *= sx
      l.x2 *= sx
      l.y1 *= sy
      l.y2 *= sy
    }
    this.w = w
    this.h = h
    // Proportional scaling can squeeze resting pixels towards an edge; pull them back on screen.
    const m = C.SPAWN_MARGIN
    const clampX = (x: number) => (w > 2 * m ? Math.max(m, Math.min(w - m, x)) : w / 2)
    const clampY = (y: number) => (h > 2 * m ? Math.max(m, Math.min(h - m, y)) : h / 2)
    for (const o of [...this.respawns, ...this.pixels.filter((p) => p.vy === 0)]) {
      o.x = clampX(o.x)
      o.y = clampY(o.y)
    }
  }

  /** HUD overlay regions changed: record them and move anything resting underneath. */
  setExclusions(rects: Rect[]): void {
    this.exclusions = rects
    for (const r of this.respawns) if (this.underHud(r.x, r.y)) Object.assign(r, this.findSpawnPos())
    for (const p of this.pixels) {
      if (!p.dead && p.vy === 0 && this.underHud(p.x, p.y)) Object.assign(p, this.findSpawnPos())
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

  /** Auto-launch is the reward for maxing NUKE SILO. */
  get autoNukeUnlocked(): boolean {
    return this.stats.nukeEnabled && isMaxed(this.state, 'nukeCharge')
  }

  canBuy(id: UpgradeId): boolean {
    return isUnlocked(this.state, id) && !isMaxed(this.state, id) && this.state.pixels >= costOf(id, this.state.upgrades[id], this.state.reboots)
  }

  buy(id: UpgradeId): boolean {
    if (!this.canBuy(id)) {
      this.emit({ type: 'denied' })
      return false
    }
    this.state.pixels -= costOf(id, this.state.upgrades[id], this.state.reboots)
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
    const boss = this.fightingBoss()
    const bossHit = boss !== null && Math.abs(boss.x - x) <= boss.r + this.hitRadius && Math.abs(boss.y - y) <= boss.r + this.hitRadius
    if (hits.length === 0 && !bossHit) {
      this.emit({ type: 'miss', x, y })
      return
    }
    if (bossHit) {
      this.bumpCombo()
      this.hitBoss('click', x, y)
    }
    if (hits.length === 0) return
    hits.sort((a, b) => a.d - b.d)
    const group = this.newGroup('click')
    for (const { p } of hits) {
      this.bumpCombo()
      st.manualKills++
      this.destroy(p, 'click', group)
    }
  }

  /** The next boss to surface is PIXEL ZERO: FINAL_EVERY regular kills after the last one. */
  get finalDue(): boolean {
    return this.state.stats.bossKills - this.state.lastFinalAt >= C.FINAL_EVERY
  }

  /**
   * AUTO keeps a charged nuke back while PIXEL ZERO is due or not yet fighting. Its lockdown means no kills,
   * so nothing can charge the nuke during the fight; this way AUTO still lands its one nuke hit.
   */
  get holdNukeForFinal(): boolean {
    const b = this.boss
    if (b) return b.final && b.phase !== 'fight'
    return this.finalDue && hasFeature(this.state.level, 'boss')
  }

  /** What surfaces next and when, for the HUD. Null before bosses unlock or while one is up. */
  get nextBoss(): { final: boolean; seconds: number; health: number; killsToFinal: number } | null {
    if (this.boss || !hasFeature(this.state.level, 'boss')) return null
    return {
      final: this.finalDue,
      seconds: this.state.bossTimer,
      health: this.state.bossHealth,
      killsToFinal: Math.max(0, C.FINAL_EVERY - (this.state.stats.bossKills - this.state.lastFinalAt)),
    }
  }

  /** While PIXEL ZERO is up nothing else spawns: it is just the player and the boss. */
  get lockdown(): boolean {
    return this.boss?.final === true
  }

  /** CONTINUE on the crash screen: infinite mode, the bosses keep coming. */
  continueAfterCrash(): void {
    if (this.boss?.phase === 'die') this.boss = null
    this.state.crashPending = false
    this.revision++
  }

  /** Real time passing behind the frozen world while PIXEL ZERO dies. True once the death animation is over. */
  advanceCrash(dt: number): boolean {
    const b = this.boss
    if (b?.phase !== 'die') return true
    b.t += dt
    if (b.t < C.FINAL_DEATH) return false
    this.boss = null
    this.revision++
    return true
  }

  /** PIXEL ZERO arrives alone: every pixel on screen is pulled into it (no reward) and any storm stops. */
  private clearArenaFor(at: { x: number; y: number }): void {
    const points: number[] = []
    for (const p of this.pixels) {
      if (p.dead) continue
      p.dead = true
      points.push(p.x, p.y)
    }
    this.pixels = []
    this.respawns = []
    if (this.rain.active) {
      this.rain.active = false
      this.state.rainTimer = this.stats.rainInterval
      this.emit({ type: 'rain-end', caught: this.rain.caught })
    }
    this.emit({ type: 'final-absorb', x: at.x, y: at.y, points })
  }

  /** Bring the boss up now. Normally driven by `state.bossTimer`; public for tests and the dev console. */
  spawnBoss(): Boss {
    const st = this.state.stats
    const final = this.finalDue
    const tier = final ? st.finalKills + 1 : st.bossKills + 1
    const maxHp = final ? finalMaxHp(tier, this.state.reboots) : Math.round(bossMaxHp(tier) * rebootBossHpMult(this.state.reboots))
    const hp = Math.max(1, Math.round(maxHp * this.state.bossHealth))
    const r = final ? C.FINAL_RADIUS : C.BOSS_RADIUS
    const pos = this.findBossPos(r)
    const a = this.rng.range(0, Math.PI * 2)
    this.boss = {
      x: pos.x,
      y: pos.y,
      vx: Math.cos(a),
      vy: Math.sin(a),
      r,
      hp,
      maxHp,
      tier,
      phase: 'rise',
      t: 0,
      timeLeft: this.state.bossTimeLeft > 0 ? this.state.bossTimeLeft : final ? C.FINAL_FIGHT_TIME : C.BOSS_FIGHT_TIME,
      eatTimer: C.BOSS_EAT_INTERVAL,
      enraged: hp <= maxHp * C.BOSS_ENRAGE_AT,
      nuked: this.state.bossNuked,
      final,
      spots: final ? Array.from({ length: C.FINAL_SPOTS }, () => this.randomSpot(r)) : [],
      spotTimer: C.FINAL_SPOT_MOVE,
      empTimer: C.FINAL_EMP_INTERVAL,
      empCharge: 0,
    }
    // Held at 0 while the boss is up, so reloading mid-fight brings it straight back (see saveState).
    this.state.bossTimer = 0
    this.emit({ type: 'boss-rise', x: pos.x, y: pos.y, tier, final })
    if (final) this.clearArenaFor(pos)
    this.revision++
    return this.boss
  }

  tick(dt: number): void {
    this.time += dt
    this.state.stats.playTime += dt
    if (this.statsDirty) this.refreshStats()

    this.updateCombo(dt)
    if (this.state.settings.autoNuke && this.autoNukeUnlocked && this.nukeReady && !this.holdNukeForFinal) this.launchNuke()
    this.updateNuke(dt)
    this.updatePixels(dt)
    this.updateRespawns(dt)
    this.updateDrones(dt)
    this.updateBombs(dt)
    this.updateBlasts(dt)
    this.updateLasers(dt)
    this.updateRain(dt)
    this.updateRainbow(dt)
    this.updateBoss(dt)
    if (this.frenzy > 0) this.frenzy = Math.max(0, this.frenzy - dt)
    if (this.droneJam > 0) this.droneJam = Math.max(0, this.droneJam - dt)

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

  /** The state to persist. A boss mid-fight writes down its wounds and clock, so a reload resumes the same fight. */
  saveState(): SaveState {
    const b = this.fightingBoss()
    if (b) {
      this.state.bossHealth = b.hp / b.maxHp
      this.state.bossTimeLeft = b.timeLeft
      this.state.bossNuked = b.nuked
    }
    return this.state
  }

  /**
   * Time away: nothing moves behind the crash screen, and PIXEL ZERO's lockdown means machines kill nothing,
   * so neither pays. Otherwise pays the automation rate. Returns what was paid, or null for nothing.
   */
  collectOffline(seconds: number): OfflineGains | null {
    if (this.offlineFrozen) return null
    const gains = offlineGains(this.state, seconds)
    if (gains.kills <= 0) return null
    this.grant(gains.pixels, gains.xp)
    return gains
  }

  private get offlineFrozen(): boolean {
    if (this.state.crashPending || this.lockdown) return true
    // Just loaded from a save made mid-fight: PIXEL ZERO comes straight back on the first tick.
    return this.boss === null && this.state.bossTimer <= 0 && this.finalDue && hasFeature(this.state.level, 'boss')
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
    } else if (p.kind === 'blue') {
      xp *= C.BLUE_XP_MULT
      st.blueKills++
    }
    if (p.kind === 'rainbow') this.startRainbow()
    if (this.rainbow > 0) amount *= s.rainbowMult
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
      this.chainFrom(p, cause === 'chain' ? group : null, depth + 1)
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
      case 'blue':
        this.forceBlue = true
        break
      case 'rainbow':
        this.rainbowTimer = 1.5
        break
    }
  }

  refreshStats(): void {
    this.stats = computeStats(this.state)
    this.statsDirty = false
    if (this.bombTimer > this.stats.bombInterval) this.bombTimer = this.stats.bombInterval
    if (this.laserTimer > this.stats.laserInterval) this.laserTimer = this.stats.laserInterval
    if (this.rainbowTimer > this.stats.rainbowInterval) this.rainbowTimer = this.stats.rainbowInterval
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

  /**
   * A chain jumps from a destroyed pixel to the nearest pixel within reach (or
   * the boss) and detonates there. With nothing in reach it fizzles.
   */
  private chainFrom(from: Pixel, group: number | null, depth: number): void {
    const claimed = new Set(this.blasts.map((b) => b.target))
    let target: Pixel | undefined
    let best = C.CHAIN_JUMP
    for (const q of this.pixels) {
      if (q.dead || !autoCanTake(q) || claimed.has(q)) continue
      const d = Math.hypot(q.x - from.x, q.y - from.y)
      if (d < best) {
        best = d
        target = q
      }
    }
    let x: number
    let y: number
    if (target) {
      x = target.x
      y = target.y
    } else {
      const b = this.fightingBoss()
      if (!b) return
      x = Math.max(b.x - b.r, Math.min(from.x, b.x + b.r))
      y = Math.max(b.y - b.r, Math.min(from.y, b.y + b.r))
      if (Math.hypot(x - from.x, y - from.y) > C.CHAIN_JUMP) return
    }
    this.emit({ type: 'chain-arc', x1: from.x, y1: from.y, x2: x, y2: y })
    this.blasts.push({ x, y, r: C.CHAIN_RADIUS, delay: C.CHAIN_DELAY, cause: 'chain', group: group ?? this.newGroup('chain'), depth, target })
  }

  private newGroup(cause: Cause): number {
    const id = this.nextId++
    this.groups.set(id, { cause, count: 0 })
    return id
  }

  private bumpCombo(): void {
    if (this.stats.comboCap <= 0) return
    this.combo.count++
    this.combo.timer = C.COMBO_WINDOW
    if (this.combo.count > this.state.stats.maxCombo) this.state.stats.maxCombo = this.combo.count
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
      life: vy !== 0 ? Infinity : kind === 'golden' ? C.GOLDEN_LIFETIME : kind === 'rainbow' ? C.RAINBOW_LIFETIME : Infinity,
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
      if (this.underHud(x, y)) continue
      const b = this.boss
      if (b && Math.abs(x - b.x) < b.r + 4 && Math.abs(y - b.y) < b.r + 4) continue
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

  /** True if a pixel centred here would be drawn (even partly) beneath a HUD overlay. */
  private underHud(x: number, y: number): boolean {
    const pad = C.PIXEL_SIZE
    return this.exclusions.some((r) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad)
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
    const boss = this.fightingBoss()
    if (boss && !boss.nuked) {
      boss.nuked = true
      this.damageBoss(boss.maxHp * (boss.final ? C.FINAL_NUKE_FRACTION : C.BOSS_NUKE_FRACTION), false, 'nuke', boss.x, boss.y)
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
          this.emit({ type: 'expire', x: p.x, y: p.y, kind: p.kind })
          if (p.slot) this.queueRespawn()
        }
      }
    }
  }

  private updateRespawns(dt: number): void {
    if (this.respawns.length === 0 || this.lockdown) return
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
      } else if (this.stats.blueChance > 0 && (this.forceBlue || this.rng.chance(this.stats.blueChance))) {
        kind = 'blue'
        this.forceBlue = false
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
    if (this.drones.length === 0 || this.droneJam > 0) return

    const byId = new Map<number, Pixel>()
    for (const p of this.pixels) if (!p.dead) byId.set(p.id, p)
    const claimed = new Set<number>()
    for (const d of this.drones) if (d.targetId !== null) claimed.add(d.targetId)
    // The boss is a shared target: any number of drones can work on it at once.
    const boss = this.fightingBoss()

    for (const d of this.drones) {
      d.phase += dt * 2
      if (d.cooldown > 0) d.cooldown -= dt
      let onBoss = boss !== null && d.targetId === BOSS_TARGET
      let target = d.targetId !== null && !onBoss ? byId.get(d.targetId) : undefined
      if (!onBoss && (!target || !autoCanTake(target))) {
        if (d.targetId !== null) claimed.delete(d.targetId)
        target = undefined
        d.targetId = null
        let best = Infinity
        for (const p of byId.values()) {
          if (!autoCanTake(p) || claimed.has(p.id) || p.age < 0.15) continue
          const dist = Math.hypot(p.x - d.x, p.y - d.y)
          if (dist < best) {
            best = dist
            target = p
          }
        }
        if (boss && Math.hypot(boss.x - d.x, boss.y - d.y) - boss.r < best) {
          target = undefined
          onBoss = true
          d.targetId = BOSS_TARGET
        } else if (target) {
          d.targetId = target.id
          claimed.add(target.id)
        }
      }

      const speed = s.droneSpeed
      if (onBoss && boss) {
        const dx = boss.x - d.x
        const dy = boss.y - d.y
        const dist = Math.hypot(dx, dy)
        const step = speed * dt
        if (dist > boss.r * 0.6) {
          d.x += (dx / dist) * Math.min(step, dist)
          d.y += (dy / dist) * Math.min(step, dist)
        } else if (d.cooldown <= 0) {
          this.emit({ type: 'drone-zap', x1: d.x, y1: d.y - 4, x2: d.x, y2: d.y })
          this.hitBoss('drone', d.x, d.y)
          d.cooldown = s.droneCooldown
          d.targetId = null
        }
      } else if (target) {
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
      const a = b.arc
      if (a && a.t < a.dur) {
        a.t = Math.min(a.dur, a.t + dt)
        const p = a.t / a.dur
        b.x = a.x0 + (a.x1 - a.x0) * p
        b.y = a.y0 + (a.y1 - a.y0) * p
        live.push(b)
        continue
      }
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
      this.blasts.push({ x: b.x, y: b.y, r: b.r, delay: 0, cause: 'bomb', group: b.group, depth: 0, mini: b.mini })
      if (!b.mini && this.stats.cluster) live.push(...this.scatterBomblets(b))
    }
    this.bombs = live
  }

  /**
   * Cluster bomblets are lobbed to the biggest crowds elsewhere on the map,
   * clear of the parent blast and of each other, so they find fresh pixels.
   */
  private scatterBomblets(b: Bomb): Bomb[] {
    const clear = b.r + C.BOMBLET_RADIUS
    const pool = this.pixels.filter((p) => !p.dead && Math.hypot(p.x - b.x, p.y - b.y) > clear)
    const targets: { x: number; y: number }[] = []
    for (let i = 0; i < C.CLUSTER_BOMBLETS; i++) {
      let best: { x: number; y: number } | null = null
      let bestScore = -1
      for (const c of pool) {
        if (targets.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < C.BOMBLET_RADIUS * 2.5)) continue
        let crowd = 0
        for (const p of pool) if (Math.hypot(p.x - c.x, p.y - c.y) <= C.BOMBLET_RADIUS) crowd++
        const score = crowd + this.rng.next() // biggest crowd first, random tie-break
        if (score > bestScore) {
          bestScore = score
          best = c
        }
      }
      if (!best) {
        // Nothing left out there: fan out evenly around the blast instead.
        const a = (i / C.CLUSTER_BOMBLETS) * Math.PI * 2 + this.rng.range(-0.5, 0.5)
        const d = clear + this.rng.range(20, 50)
        const m = C.SPAWN_MARGIN
        best = { x: Math.max(m, Math.min(this.w - m, b.x + Math.cos(a) * d)), y: Math.max(m, Math.min(this.h - m, b.y + Math.sin(a) * d)) }
      }
      targets.push({ x: best.x, y: best.y })
    }
    return targets.map((t, i) => ({
      id: this.nextId++,
      x: b.x,
      y: b.y,
      vx: 0,
      vy: 0,
      fuse: C.BOMBLET_FUSE,
      total: C.BOMBLET_FUSE,
      r: C.BOMBLET_RADIUS,
      mini: true,
      group: b.group,
      arc: { x0: b.x, y0: b.y, x1: t.x, y1: t.y, dur: C.BOMBLET_FLIGHT + Math.hypot(t.x - b.x, t.y - b.y) / 400 + i * 0.06, t: 0 },
    }))
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
    // A fighting boss is worth a small crowd.
    const boss = this.fightingBoss()
    if (boss) {
      let n = 4
      for (const p of alive) if (Math.hypot(p.x - boss.x, p.y - boss.y) <= r) n++
      if (n > best) {
        x = boss.x
        y = boss.y
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
      if (b.target && !b.target.dead) {
        b.x = b.target.x
        b.y = b.target.y
      }
      this.emit({ type: 'blast', x: b.x, y: b.y, r: b.r, cause: b.cause, mini: b.mini })
      const reach = b.r + C.PIXEL_SIZE / 2
      for (const p of this.pixels) {
        if (p.dead || (b.cause === 'chain' && !autoCanTake(p))) continue
        if (Math.hypot(p.x - b.x, p.y - b.y) <= reach) this.destroy(p, b.cause, b.group, 1, b.depth)
      }
      if ((b.cause === 'bomb' || b.cause === 'chain') && this.bossTouches(b.x, b.y, b.r)) {
        this.hitBoss(b.cause === 'chain' ? 'chain' : b.mini ? 'bomblet' : 'bomb', b.x, b.y)
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
    const boss = this.fightingBoss()
    const anchor = boss && this.rng.chance(0.5) ? boss : alive.length ? alive[this.rng.int(0, alive.length - 1)] : { x: this.w / 2, y: this.h / 2 }
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
    const boss = this.fightingBoss()
    if (boss && Math.abs((boss.x - l.x1) * ly - (boss.y - l.y1) * lx) / len <= boss.r + C.LASER_WIDTH / 2) {
      this.hitBoss('laser', boss.x, boss.y)
    }
  }

  private updateRain(dt: number): void {
    if (!this.stats.rainEnabled) return
    const r = this.rain
    if (!r.active) {
      if (this.nuke || this.lockdown) return
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

  private startRainbow(): void {
    this.rainbow = Math.max(this.rainbow, this.stats.rainbowDuration)
    this.emit({ type: 'rainbow-start', duration: this.rainbow })
    this.revision++
  }

  private updateRainbow(dt: number): void {
    if (this.rainbow > 0) {
      this.rainbow = Math.max(0, this.rainbow - dt)
      if (this.rainbow === 0) {
        this.emit({ type: 'rainbow-end' })
        this.revision++
      }
    }
    // One rainbow pixel at a time, and never while the mode is already running.
    if (!Number.isFinite(this.stats.rainbowInterval) || this.nuke || this.rainbow > 0 || this.lockdown) return
    if (this.pixels.some((p) => p.kind === 'rainbow' && !p.dead)) return
    this.rainbowTimer -= dt
    if (this.rainbowTimer <= 0) {
      this.rainbowTimer = this.stats.rainbowInterval
      const pos = this.findSpawnPos()
      this.spawnPixel(pos.x, pos.y, 'rainbow', false)
    }
  }

  // ---------------------------------------------------------------------- boss

  private fightingBoss(): Boss | null {
    return this.boss && this.boss.phase === 'fight' ? this.boss : null
  }

  /** Does a circle touch the fighting boss's square body? */
  private bossTouches(x: number, y: number, r: number): boolean {
    const b = this.fightingBoss()
    if (!b) return false
    const dx = Math.max(0, Math.abs(x - b.x) - b.r)
    const dy = Math.max(0, Math.abs(y - b.y) - b.r)
    return Math.hypot(dx, dy) <= r
  }

  private findBossPos(r: number): { x: number; y: number } {
    const m = r + 4
    const clear = (x: number, y: number) => !this.exclusions.some((e) => x + r > e.x && x - r < e.x + e.w && y + r > e.y && y - r < e.y + e.h)
    for (let i = 0; i < 24; i++) {
      const x = this.rng.range(m, Math.max(m + 1, this.w - m))
      const y = this.rng.range(m, Math.max(m + 1, this.h - m))
      if (clear(x, y)) return { x, y }
    }
    return { x: this.w / 2, y: this.h / 2 }
  }

  /** One hit from a source. Machines do flat damage; taps can crit and ride the combo. */
  private hitBoss(source: BossDamageSource, x: number, y: number): void {
    const b = this.fightingBoss()
    if (!b) return
    const s = this.stats
    let dmg = C.BOSS_DAMAGE[source] * s.bossDamage
    if (b.final && (source === 'bomb' || source === 'bomblet' || source === 'laser')) dmg *= C.FINAL_MACHINE_MULT[source] ?? 1
    let crit = false
    let weak = 1
    if (source === 'click') {
      crit = s.critChance > 0 && this.rng.chance(s.critChance)
      if (crit) dmg *= s.critMult
      if (s.comboCap > 0) dmg *= comboMult(this.combo.count, s.comboCap)
      weak = this.weakSpotHit(x, y)
      dmg *= weak
    }
    this.damageBoss(dmg, crit, source, x, y, weak > 1)
  }

  /**
   * PIXEL ZERO's tap-only targets. Tapping the charging core stops the EMP;
   * tapping a weak spot hits hard and sends the spot elsewhere. Returns the damage multiplier.
   */
  private weakSpotHit(x: number, y: number): number {
    const b = this.fightingBoss()
    if (!b?.final) return 1
    if (b.empCharge > 0 && Math.hypot(x - b.x, y - b.y) <= C.FINAL_CORE_RADIUS + 1) {
      b.empCharge = 0
      b.empTimer = b.enraged ? C.FINAL_EMP_ENRAGED_INTERVAL : C.FINAL_EMP_INTERVAL
      this.emit({ type: 'emp-blocked', x: b.x, y: b.y })
      return C.FINAL_CORE_MULT
    }
    const i = b.spots.findIndex((sp) => Math.hypot(x - (b.x + sp.dx), y - (b.y + sp.dy)) <= C.FINAL_SPOT_RADIUS + 1)
    if (i < 0) return 1
    b.spots[i] = this.randomSpot(b.r)
    return C.FINAL_SPOT_MULT
  }

  /** A weak spot somewhere on the body, clear of the core. */
  private randomSpot(r: number): { dx: number; dy: number } {
    const lim = r - C.FINAL_SPOT_RADIUS - 1
    for (;;) {
      const dx = this.rng.range(-lim, lim)
      const dy = this.rng.range(-lim, lim)
      if (Math.hypot(dx, dy) > C.FINAL_CORE_RADIUS + C.FINAL_SPOT_RADIUS) return { dx, dy }
    }
  }

  private damageBoss(dmg: number, crit: boolean, source: BossDamageSource | 'nuke', x: number, y: number, weak = false): void {
    const b = this.fightingBoss()
    if (!b) return
    b.hp = Math.max(0, b.hp - dmg)
    this.emit({ type: 'boss-hit', x, y, dmg, crit, source, weak })
    this.revision++
    if (b.hp <= 0) {
      this.defeatBoss(b)
      return
    }
    if (!b.enraged && b.hp <= b.maxHp * C.BOSS_ENRAGE_AT) {
      b.enraged = true
      b.eatTimer = Math.min(b.eatTimer, C.BOSS_ENRAGED_EAT_INTERVAL)
      this.emit({ type: 'boss-enrage', x: b.x, y: b.y })
    }
  }

  private defeatBoss(b: Boss): void {
    if (b.final) {
      this.defeatFinal(b)
      return
    }
    this.boss = null
    const amount = this.stats.value * C.BOSS_REWARD_VALUE * b.tier
    this.emit({ type: 'boss-defeat', x: b.x, y: b.y, tier: b.tier, amount })
    this.earn(amount, true)
    this.addXp(xpToNext(this.state.level) * C.BOSS_REWARD_XP_FRAC)
    this.state.stats.bossKills++
    this.state.bossTimer = C.BOSS_INTERVAL
    this.state.bossHealth = 1
    this.clearSavedFight()
    this.refreshStats()
    // It bursts into golden loot. Drones leave golden pixels alone, so it is all yours.
    const n = Math.min(C.BOSS_LOOT_MAX, C.BOSS_LOOT_BASE + C.BOSS_LOOT_PER_TIER * b.tier)
    const m = C.SPAWN_MARGIN
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.range(-0.3, 0.3)
      const d = this.rng.range(b.r * 0.4, b.r + 18)
      const x = Math.max(m, Math.min(this.w - m, b.x + Math.cos(a) * d))
      const y = Math.max(m, Math.min(this.h - m, b.y + Math.sin(a) * d))
      const pos = this.underHud(x, y) ? this.findSpawnPos() : { x, y }
      this.spawnPixel(pos.x, pos.y, 'golden', false)
    }
    this.revision++
  }

  /**
   * PIXEL ZERO is dead: a huge payout, then the screen crashes and the player picks REBOOT or CONTINUE.
   * The world freezes at once; it stays on screen in its 'die' phase while the death animation plays.
   */
  private defeatFinal(b: Boss): void {
    b.phase = 'die'
    b.t = 0
    b.hp = 0
    this.droneJam = 0
    // Nothing else on screen while it dies: no beams, bombs or blasts frozen mid-air.
    this.lasers = []
    this.bombs = []
    this.blasts = []
    const amount = this.stats.value * C.FINAL_REWARD_VALUE * b.tier
    this.earn(amount, true)
    this.addXp(xpToNext(this.state.level) * C.FINAL_REWARD_XP_FRAC)
    this.state.stats.finalKills++
    this.state.lastFinalAt = this.state.stats.bossKills
    this.state.bossTimer = C.BOSS_INTERVAL
    this.state.bossHealth = 1
    this.clearSavedFight()
    this.state.crashPending = true
    this.refreshStats()
    this.emit({ type: 'final-defeat', x: b.x, y: b.y, amount })
    // Nothing ticks behind the crash screen, so award SYSTEM CRASH now or a REBOOT would skip it.
    this.checkAchievements()
    this.revision++
  }

  private updateFinal(b: Boss, dt: number): void {
    b.spotTimer -= dt
    if (b.spotTimer <= 0) {
      b.spotTimer = C.FINAL_SPOT_MOVE
      b.spots = b.spots.map(() => this.randomSpot(b.r))
    }
    if (b.empCharge > 0) {
      b.empCharge -= dt
      if (b.empCharge <= 0) {
        b.empCharge = 0
        b.empTimer = b.enraged ? C.FINAL_EMP_ENRAGED_INTERVAL : C.FINAL_EMP_INTERVAL
        this.droneJam = C.FINAL_EMP_JAM
        this.emit({ type: 'emp', x: b.x, y: b.y })
        this.revision++
      }
      return
    }
    b.empTimer -= dt
    if (b.empTimer <= 0) {
      b.empCharge = C.FINAL_EMP_CHARGE
      this.emit({ type: 'emp-charge', x: b.x, y: b.y })
      this.revision++
    }
  }

  /** The fight is over: the next boss gets a full clock and its own nuke hit. */
  private clearSavedFight(): void {
    this.state.bossTimeLeft = 0
    this.state.bossNuked = false
  }

  private escapeBoss(b: Boss): void {
    b.phase = 'sink'
    b.t = 0
    this.state.stats.bossEscapes++
    this.state.bossTimer = C.BOSS_RETRY_INTERVAL
    // It keeps its wounds, so a tough tier becomes a siege rather than a wall.
    this.state.bossHealth = Math.min(1, b.hp / b.maxHp + (b.final ? C.FINAL_ESCAPE_RECOVER : C.BOSS_ESCAPE_RECOVER))
    this.clearSavedFight()
    this.emit({ type: 'boss-escape', x: b.x, y: b.y })
    this.revision++
  }

  private updateBoss(dt: number): void {
    const b = this.boss
    if (!b) {
      if (!hasFeature(this.state.level, 'boss')) return
      this.state.bossTimer = Math.max(0, this.state.bossTimer - dt)
      if (this.state.bossTimer <= 0 && !this.nuke) this.spawnBoss()
      return
    }
    if (b.phase === 'rise') {
      b.t += dt
      if (b.t >= (b.final ? C.FINAL_RISE : C.BOSS_RISE)) {
        b.phase = 'fight'
        b.t = 0
        if (b.final) this.emit({ type: 'final-surfaced', x: b.x, y: b.y })
        this.revision++
      }
      return
    }
    if (b.phase === 'die') return
    if (b.phase === 'sink') {
      b.t += dt
      if (b.t >= C.BOSS_SINK) {
        this.boss = null
        this.revision++
      }
      return
    }

    b.timeLeft -= dt
    if (b.timeLeft <= 0) {
      this.escapeBoss(b)
      return
    }
    if (b.final) this.updateFinal(b, dt)

    // Wander, but lean towards the nearest pixel it could swallow.
    let prey: Pixel | null = null
    let preyDist = Infinity
    for (const p of this.pixels) {
      if (p.dead || !autoCanTake(p)) continue
      const d = Math.hypot(p.x - b.x, p.y - b.y)
      if (d < preyDist) {
        preyDist = d
        prey = p
      }
    }
    let turn = this.rng.range(-1, 1) * (b.enraged ? 3 : 1.2) * dt
    if (prey) {
      const want = Math.atan2(prey.y - b.y, prey.x - b.x)
      let diff = want - Math.atan2(b.vy, b.vx)
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      turn += Math.max(-1, Math.min(1, diff)) * (b.enraged ? 2 : 0.8) * dt
    }
    const c = Math.cos(turn)
    const sn = Math.sin(turn)
    const vx = b.vx * c - b.vy * sn
    const vy = b.vx * sn + b.vy * c
    b.vx = vx
    b.vy = vy
    const speed = b.final ? (b.enraged ? C.FINAL_ENRAGED_SPEED : C.FINAL_SPEED) : b.enraged ? C.BOSS_ENRAGED_SPEED : C.BOSS_SPEED
    const px = b.x
    const py = b.y
    b.x += b.vx * speed * dt
    b.y += b.vy * speed * dt
    const m = b.r + 2
    if (b.x < m || b.x > this.w - m) {
      b.vx = -b.vx
      b.x = Math.max(m, Math.min(this.w - m, b.x))
    }
    if (b.y < m || b.y > this.h - m) {
      b.vy = -b.vy
      b.y = Math.max(m, Math.min(this.h - m, b.y))
    }
    // Keep out from under the HUD: turn away from it, and never move further in.
    const overlaps = (x: number, y: number) => this.exclusions.find((e) => x + b.r > e.x && x - b.r < e.x + e.w && y + b.r > e.y && y - b.r < e.y + e.h)
    const hud = overlaps(b.x, b.y)
    if (hud) {
      const away = Math.atan2(b.y - (hud.y + hud.h / 2), b.x - (hud.x + hud.w / 2))
      b.vx = Math.cos(away)
      b.vy = Math.sin(away)
      if (!overlaps(px, py)) {
        b.x = px
        b.y = py
      }
    }

    b.eatTimer -= dt
    if (b.eatTimer <= 0) {
      b.eatTimer = b.enraged ? C.BOSS_ENRAGED_EAT_INTERVAL : C.BOSS_EAT_INTERVAL
      if (prey && !prey.dead && Math.max(Math.abs(prey.x - b.x), Math.abs(prey.y - b.y)) <= b.r + C.BOSS_EAT_REACH) {
        prey.dead = true
        if (prey.slot) this.queueRespawn()
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * (b.final ? C.FINAL_EAT_HEAL : C.BOSS_EAT_HEAL))
        this.emit({ type: 'boss-eat', x: prey.x, y: prey.y })
        this.revision++
      }
    }
  }
}
