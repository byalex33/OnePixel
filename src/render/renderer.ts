import * as C from '../game/config'
import { fmt } from '../game/format'
import type { Game } from '../game/game'
import type { GameEvent } from '../game/types'
import { buildField, paintField, sceneryStage, type DotField } from './dotfield'
import { C_BLUE, C_CYAN, C_DARK, C_GOLD, C_GREEN, C_LIGHT, C_MID, C_ORANGE, C_PINK, C_RAINBOW, C_RED, C_VIOLET, C_WHITE, PAL, rainbowHue } from './palette'
import { Particles } from './particles'
import { BOMB, CURSOR, drawSprite, MUSHROOM, type Sprite } from './sprites'

interface Ring {
  x: number
  y: number
  max: number
  t: number
  dur: number
  color: string
  grid: boolean
  dotted: boolean
}

interface FloatText {
  x: number
  y: number
  text: string
  color: string
  size: number
  t: number
  dur: number
  /** Drawn instead of text, centred on x/y; `size` sets the scale as for text. */
  sprite?: { art: Sprite; colors: Record<string, string> }
}

interface Zap {
  x1: number
  y1: number
  x2: number
  y2: number
  t: number
}

/** A chain jumping between pixels: a jagged bolt, fixed when it spawns. */
interface Arc {
  pts: number[]
  t: number
}

const ARC_LIFE = 0.2

/** A pixel being pulled into PIXEL ZERO as it rises. */
interface Absorb {
  x0: number
  y0: number
  x1: number
  y1: number
  delay: number
  dur: number
  t: number
}

const FONT = '"Press Start 2P", ui-monospace, monospace'
const MAX_TEXTS = 40

/** The boss is drawn as a BOSS_CELLS x BOSS_CELLS block that cracks apart as it takes damage. */
const BOSS_CELLS = 7
const BOSS_EYES = new Set([2 * BOSS_CELLS + 2, 2 * BOSS_CELLS + 4])
const BOSS_MOUTH = new Set([4 * BOSS_CELLS + 2, 4 * BOSS_CELLS + 3, 4 * BOSS_CELLS + 4])
/** PIXEL ZERO: three sub-pixel columns of ZERO_ROWS segments each, which die in a fixed order. */
const ZERO_ROWS = 5
const ZERO_ORBIT = 12
const ZERO_DEATH_ORDER = (() => {
  const order = [...Array(3 * ZERO_ROWS).keys()]
  let seed = 11
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
})()
/** The order cells crack in: a fixed shuffle, so damage reads the same every fight. */
const BOSS_CRACK_ORDER = (() => {
  const order = [...Array(BOSS_CELLS * BOSS_CELLS).keys()].filter((i) => !BOSS_EYES.has(i) && !BOSS_MOUTH.has(i))
  let seed = 7
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
})()

const easeOutBack = (t: number) => {
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * Canvas renderer. Reads the simulation's entity arrays every frame and turns
 * one-shot game events into particles, shockwaves, floating numbers and shake.
 * Everything here is cosmetic: it never mutates game state.
 */
export class Renderer {
  scale = 1
  cssW = 1
  cssH = 1
  shakeEnabled = true
  reducedMotion = false

  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private game: Game
  private bg = document.createElement('canvas')
  private prevBg = document.createElement('canvas')
  private field: DotField | null = null
  private stage = -1
  private reveal = 1
  private particles: Particles
  private rings: Ring[] = []
  private texts: FloatText[] = []
  private zaps: Zap[] = []
  private arcs: Arc[] = []
  private absorbs: Absorb[] = []
  /** PIXEL ZERO's death: when it started, and how many of its segments have burst. */
  private zeroDeath: { at: number; burst: number } | null = null
  private flash: { t: number; dur: number; color: string; alpha: number } = { t: 1, dur: 1, color: PAL.white, alpha: 0 }
  private trauma = 0
  private freeze = 0
  /** When the boss was last hit and last ate, for its flash and its mouth. */
  private bossHitAt = -1
  private bossAteAt = -1
  private time = 0
  private lowFx: boolean
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, game: Game, lowFx: boolean) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D not supported')
    this.canvas = canvas
    this.ctx = ctx
    this.game = game
    this.lowFx = lowFx
    this.particles = new Particles(lowFx ? 900 : 2400)
  }

  setGame(game: Game): void {
    this.game = game
    this.particles.clear()
    this.rings = []
    this.texts = []
    this.zaps = []
    this.arcs = []
    this.absorbs = []
    this.zeroDeath = null
    this.stage = -1
    this.resize(this.cssW, this.cssH, this.dpr, true)
  }

  /** Size the canvas and derive the world dimensions (constant area). */
  resize(cssW: number, cssH: number, dpr: number, force = false): void {
    // A hidden or collapsed container reports ~0px; laying the world out at that
    // size would scramble positions. Keep the last size.
    if (cssW < 8 || cssH < 8) return
    if (!force && cssW === this.cssW && cssH === this.cssH && Math.min(dpr || 1, 2) === this.dpr) return
    this.cssW = Math.max(1, cssW)
    this.cssH = Math.max(1, cssH)
    this.dpr = Math.min(dpr || 1, 2)
    this.canvas.width = Math.round(this.cssW * this.dpr)
    this.canvas.height = Math.round(this.cssH * this.dpr)
    const worldW = Math.sqrt((C.WORLD_AREA * this.cssW) / this.cssH)
    const worldH = C.WORLD_AREA / worldW
    this.scale = this.cssW / worldW
    this.game.resize(worldW, worldH)
    this.game.hitRadius = Math.max(C.PIXEL_SIZE * 1.1, 24 / this.scale)
    this.rebuildBackground(false)
  }

  toWorld(cssX: number, cssY: number): { x: number; y: number } {
    return { x: cssX / this.scale, y: cssY / this.scale }
  }

  private get ps(): number {
    return Math.round(Math.min(26, Math.max(12, C.PIXEL_SIZE * this.scale)))
  }

  private get k(): number {
    return Math.min(1.5, Math.max(0.75, this.scale / 3))
  }

  private rebuildBackground(animate: boolean): void {
    if (this.cssW < 8 || this.cssH < 8) return // not laid out yet
    const stage = sceneryStage(this.game.state.level)
    if (animate) {
      this.prevBg.width = this.bg.width
      this.prevBg.height = this.bg.height
      this.prevBg.getContext('2d')?.drawImage(this.bg, 0, 0)
      this.reveal = 0
    } else {
      this.reveal = 1
    }
    this.stage = stage
    this.field = buildField(this.cssW, this.cssH, this.game.state.level)
    paintField(this.bg, this.field, this.cssW, this.cssH, this.dpr)
  }

  // ------------------------------------------------------------------ events

  handle(events: GameEvent[]): void {
    let pops = 0
    for (const e of events) if (e.type === 'pop') pops++
    const many = pops > 6
    let sum = 0
    let sx = 0
    let sy = 0
    let n = 0
    let bossDmg = 0

    for (const e of events) {
      switch (e.type) {
        case 'pop':
          this.pop(e, many)
          if (many && !e.crit) {
            sum += e.amount
            sx += e.x
            sy += e.y
            n++
          }
          break
        case 'blast':
          this.blast(e.x * this.scale, e.y * this.scale, e.r * this.scale, e.cause, e.mini)
          break
        case 'laser-fire':
          this.laserFire(e.x1, e.y1, e.x2, e.y2)
          break
        case 'chain-arc':
          this.chainArc(e.x1 * this.scale, e.y1 * this.scale, e.x2 * this.scale, e.y2 * this.scale)
          break
        case 'drone-zap':
          this.zaps.push({ x1: e.x1 * this.scale, y1: e.y1 * this.scale, x2: e.x2 * this.scale, y2: e.y2 * this.scale, t: 0 })
          break
        case 'miss': {
          const x = e.x * this.scale
          const y = e.y * this.scale
          this.particles.burst(x, y, 4, 50 * this.k, 0.3, 2, [C_MID, C_DARK])
          this.ring(x, y, this.ps * 0.9, 0.18, PAL.mid, false, true)
          break
        }
        case 'spawn':
          if (!this.lowFx || this.game.pixels.length < 6) {
            const x = e.x * this.scale
            const y = e.y * this.scale
            this.particles.burst(x, y, 4, 40 * this.k, 0.35, 2, e.kind === 'golden' ? [C_GOLD] : e.kind === 'blue' ? [C_BLUE, C_CYAN] : e.kind === 'rainbow' ? C_RAINBOW : [C_LIGHT, C_MID])
          }
          if (e.kind === 'golden') this.ring(e.x * this.scale, e.y * this.scale, this.ps * 2.5, 0.4, PAL.gold, true, true)
          if (e.kind === 'rainbow') this.ring(e.x * this.scale, e.y * this.scale, this.ps * 3, 0.5, PAL.white, true, true)
          break
        case 'rainbow-start':
          this.rainbowFx()
          break
        case 'expire':
          this.particles.burst(e.x * this.scale, e.y * this.scale, 10, 40 * this.k, 0.5, 2, [C_MID, C_DARK])
          break
        case 'bomb-drop':
          this.ring(e.x * this.scale, e.y * this.scale, this.ps * 2, 0.25, PAL.red, false, true)
          break
        case 'nuke':
          this.nukeFx(e.amount)
          break
        case 'levelup':
          this.levelFx()
          break
        case 'boss-rise':
          this.bossRiseFx(e.x * this.scale, e.y * this.scale, e.final)
          break
        case 'emp-charge':
          this.text(e.x * this.scale, (e.y - C.FINAL_RADIUS) * this.scale - this.ps * 2, 'EMP CHARGING - TAP THE CORE!', PAL.cyan, 10, 1.6)
          break
        case 'emp-blocked': {
          const x = e.x * this.scale
          const y = e.y * this.scale
          this.ring(x, y, this.ps * 6, 0.4, PAL.gold, true, false)
          this.particles.burst(x, y, this.lowFx ? 16 : 36, 260 * this.k, 0.6, 3, [C_GOLD, C_WHITE, C_CYAN], 120 * this.k)
          this.text(x, y - this.ps * 3, 'EMP BLOCKED', PAL.gold, 12, 1.2)
          break
        }
        case 'emp': {
          const x = e.x * this.scale
          const y = e.y * this.scale
          this.ring(x, y, Math.hypot(this.cssW, this.cssH), 0.9, PAL.cyan, true, false)
          this.setFlash(PAL.cyan, 0.35, 0.5)
          this.addTrauma(0.5)
          this.text(this.cssW / 2, this.cssH / 2, 'DRONES JAMMED', PAL.cyan, 14, 1.6)
          break
        }
        case 'final-absorb': {
          const s = this.scale
          for (let i = 0; i < e.points.length; i += 2) {
            const d = Math.hypot(e.points[i] - e.x, e.points[i + 1] - e.y)
            this.absorbs.push({ x0: e.points[i] * s, y0: e.points[i + 1] * s, x1: e.x * s, y1: e.y * s, delay: Math.random() * 0.5, dur: 0.8 + d / 220 + Math.random() * 0.3, t: 0 })
          }
          break
        }
        case 'final-surfaced': {
          const x = e.x * this.scale
          const y = e.y * this.scale
          const far = Math.hypot(this.cssW, this.cssH)
          this.setFlash(PAL.white, 0.9, 0.8)
          this.addTrauma(1)
          this.freeze = Math.max(this.freeze, 0.1)
          this.ring(x, y, far, 1.1, PAL.white, true, false)
          this.ring(x, y, far * 0.7, 1.4, PAL.cyan, true, false)
          this.ring(x, y, far * 0.4, 1.7, PAL.blue, true, true)
          this.particles.burst(x, y, this.lowFx ? 80 : 220, 520 * this.k, 1.3, Math.max(3, Math.round(this.ps * 0.35)), [C_WHITE, C_CYAN, C_BLUE, C_WHITE], 60 * this.k)
          this.text(this.cssW / 2, this.cssH / 2 + 40, 'NOTHING ELSE MATTERS NOW', PAL.light, 9, 2.2)
          break
        }
        case 'final-defeat':
          this.startZeroDeath(e.amount)
          break
        case 'boss-hit':
          this.bossHitAt = this.time
          if (e.source === 'click' || e.source === 'nuke') this.bossHitFx(e)
          if (e.weak) this.text(e.x * this.scale, e.y * this.scale - this.ps * 3, 'WEAK SPOT!', PAL.gold, 10, 0.8)
          else {
            bossDmg += e.dmg
            this.particles.burst(e.x * this.scale, e.y * this.scale, 2, 90 * this.k, 0.3, 2, [C_RED, C_WHITE])
          }
          break
        case 'boss-enrage': {
          const x = e.x * this.scale
          const y = e.y * this.scale
          this.ring(x, y, this.ps * 6, 0.6, PAL.red, true, false)
          this.setFlash(PAL.red, 0.18, 0.3)
          this.addTrauma(0.4)
          this.text(x, y - this.ps * 3, 'ENRAGED!', PAL.red, 12, 1.2)
          break
        }
        case 'boss-eat':
          this.bossAteAt = this.time
          this.particles.burst(e.x * this.scale, e.y * this.scale, 8, 60 * this.k, 0.35, 2, [C_WHITE, C_MID, C_RED])
          break
        case 'boss-defeat':
          this.bossDefeatFx(e.x * this.scale, e.y * this.scale, e.amount)
          break
        case 'boss-escape': {
          const x = e.x * this.scale
          const y = e.y * this.scale
          this.ring(x, y, this.ps * 5, 0.8, PAL.mid, true, true)
          this.text(this.cssW / 2, this.cssH / 2, 'IT GOT AWAY', PAL.light, 16, 2)
          this.text(this.cssW / 2, this.cssH / 2 + 24, 'BUT IT IS WOUNDED', PAL.mid, 9, 2)
          break
        }
      }
    }
    const boss = this.game.boss
    if (bossDmg > 0 && boss) {
      const bx = boss.x * this.scale + (Math.random() - 0.5) * boss.r * this.scale
      this.text(bx, (boss.y - boss.r) * this.scale - this.ps * 0.6, `-${fmt(bossDmg)}`, PAL.light, 8, 0.6)
    }
    if (many && n > 0) {
      this.text(sx / n * this.scale, (sy / n) * this.scale - this.ps, `+${fmt(sum)}`, PAL.white, 10, 0.9)
    }
  }

  private pop(e: Extract<GameEvent, { type: 'pop' }>, many: boolean): void {
    const x = e.x * this.scale
    const y = e.y * this.scale
    const ps = this.ps
    const k = this.k
    const manual = e.cause === 'click'
    let count = this.lowFx ? 10 : 16
    if (many) count = Math.max(3, Math.round(count / 2))
    if (!manual) count = Math.round(count * 0.6)

    const rainbow = e.kind === 'rainbow' || this.game.rainbow > 0
    const colors = rainbow
      ? [...C_RAINBOW]
      : e.kind === 'golden'
        ? [C_GOLD, C_GOLD, C_WHITE, C_ORANGE]
        : e.kind === 'blue'
          ? [C_BLUE, C_BLUE, C_CYAN, C_WHITE]
          : e.kind === 'rain'
          ? [C_WHITE, C_LIGHT, C_CYAN]
          : [C_WHITE, C_WHITE, C_LIGHT, C_MID]
    // Combos and crits progressively paint the explosion.
    if (e.combo >= 10) colors.push(C_CYAN)
    if (e.combo >= 20) colors.push(C_GOLD, C_RED)
    if (e.crit) colors.push(C_RED, C_GOLD, C_RED)

    const size = Math.max(2, Math.round(ps * 0.24))
    const speed = (manual ? 260 : 180) * k
    this.particles.burst(x, y, count, speed, 0.65, size, colors, 380 * k)
    // A few big chunks that read as the pixel physically breaking apart.
    if (!many) this.particles.burst(x, y, manual ? 5 : 3, speed * 0.65, 0.55, Math.max(3, Math.round(ps * 0.42)), colors.slice(0, 2), 520 * k)
    this.ring(x, y, ps * (e.crit ? 3 : manual ? 2.2 : 1.5), e.crit ? 0.32 : 0.2, e.crit ? PAL.red : PAL.white, e.crit || (manual && !many), false)
    if (e.combo >= 20 && !many) this.ring(x, y, ps * 2.8, 0.28, PAL.cyan, false, true)

    if (e.crit) {
      this.addTrauma(0.22)
      this.freeze = Math.max(this.freeze, 0.045)
      this.text(x, y - ps * 1.4, 'CRIT!', PAL.red, 10, 0.7)
      this.text(x, y - ps * 0.4, `+${fmt(e.amount)}`, PAL.gold, 14, 1.0)
    } else if (e.kind === 'golden') {
      this.addTrauma(0.18)
      this.particles.burst(x, y, this.lowFx ? 14 : 28, 240 * k, 0.9, size, [C_GOLD, C_WHITE], 200 * k)
      this.text(x, y - ps * 0.4, `+${fmt(e.amount)}`, PAL.gold, 14, 1.2)
    } else if (e.kind === 'blue') {
      this.particles.burst(x, y, this.lowFx ? 10 : 20, 200 * k, 0.8, size, [C_BLUE, C_CYAN], 160 * k)
      this.text(x, y - ps * 1.4, `+${fmt(e.xp)} XP`, PAL.blue, 12, 1.1)
      this.text(x, y - ps * 0.4, `+${fmt(e.amount)}`, rainbow ? this.hue(x, y) : PAL.white, 10, 0.85)
    } else if (e.kind === 'rainbow') {
      this.particles.burst(x, y, this.lowFx ? 18 : 36, 280 * k, 1, size, C_RAINBOW, 160 * k)
      this.text(x, y - ps * 0.4, `+${fmt(e.amount)}`, this.hue(x, y), 14, 1.2)
    } else if (!many) {
      if (manual) this.addTrauma(0.1)
      const color = rainbow ? this.hue(x, y) : manual ? PAL.white : PAL.light
      this.text(x, y - ps * 0.4, `+${fmt(e.amount)}`, color, manual ? 10 : 8, manual ? 0.85 : 0.7)
    }
  }

  private blast(x: number, y: number, r: number, cause: string, mini = false): void {
    const k = this.k
    if (cause === 'bomb' && mini) {
      this.ring(x, y, r * 1.2, 0.35, PAL.orange, true, false)
      this.ring(x, y, r * 0.5, 0.2, PAL.gold, false, false)
      this.particles.burst(x, y, this.lowFx ? 14 : 28, 220 * k, 0.55, Math.max(2, Math.round(this.ps * 0.25)), [C_RED, C_ORANGE, C_GOLD, C_WHITE], 140 * k)
      this.addTrauma(0.15)
    } else if (cause === 'click') {
      this.ring(x, y, r, 0.25, PAL.light, true, true)
    } else if (cause === 'bomb') {
      this.ring(x, y, r * 1.1, 0.45, PAL.orange, true, false)
      this.ring(x, y, r * 0.6, 0.3, PAL.white, false, false)
      this.particles.burst(x, y, this.lowFx ? 30 : 60, 320 * k, 0.8, Math.max(3, Math.round(this.ps * 0.3)), [C_RED, C_ORANGE, C_ORANGE, C_WHITE, C_DARK], 200 * k)
      this.addTrauma(0.45)
      this.setFlash(PAL.orange, 0.12, 0.15)
    } else if (cause === 'chain') {
      this.ring(x, y, r, 0.25, PAL.orange, true, true)
      this.particles.burst(x, y, 6, 120 * k, 0.4, 2, [C_ORANGE, C_WHITE])
      this.addTrauma(0.06)
    }
  }

  private laserFire(x1: number, y1: number, x2: number, y2: number): void {
    const s = this.scale
    const steps = this.lowFx ? 14 : 28
    for (let i = 0; i < steps; i++) {
      const t = Math.random()
      const x = (x1 + (x2 - x1) * t) * s
      const y = (y1 + (y2 - y1) * t) * s
      if (x < -10 || y < -10 || x > this.cssW + 10 || y > this.cssH + 10) continue
      this.particles.burst(x, y, 2, 140 * this.k, 0.4, 2, [C_CYAN, C_WHITE])
    }
    this.addTrauma(0.3)
    this.setFlash(PAL.cyan, 0.1, 0.12)
  }

  private nukeFx(amount: number): void {
    const cx = this.cssW / 2
    const cy = this.cssH / 2
    this.setFlash(PAL.white, 1, 1.2)
    this.addTrauma(1)
    this.ring(cx, cy, Math.hypot(this.cssW, this.cssH), 1.3, PAL.white, true, false)
    this.ring(cx, cy, Math.hypot(this.cssW, this.cssH) * 0.6, 0.9, PAL.orange, true, false)
    const n = this.lowFx ? 160 : 420
    for (let i = 0; i < n; i++) {
      const x = Math.random() * this.cssW
      const y = Math.random() * this.cssH
      const a = Math.atan2(y - cy, x - cx)
      const v = (150 + Math.random() * 400) * this.k
      const c = [C_WHITE, C_ORANGE, C_RED, C_GOLD, C_LIGHT][i % 5]
      this.particles.add(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 1.2, 2 + Math.random() * 4, c, 120)
    }
    this.icon(cx, cy - 58, MUSHROOM, { '1': PAL.orange, '2': PAL.gold, '3': PAL.red, '4': PAL.white }, 24, 2.2)
    this.text(cx, cy - 20, 'NUKED', PAL.red, 24, 2.2)
    this.text(cx, cy + 16, `+${fmt(amount)}`, PAL.gold, 16, 2.2)
  }

  private rainbowFx(): void {
    const cx = this.cssW / 2
    const cy = this.cssH / 2
    this.addTrauma(0.3)
    this.setFlash(PAL.white, 0.18, 0.3)
    this.ring(cx, cy, Math.hypot(this.cssW, this.cssH) * 0.6, 0.8, PAL.white, true, true)
    this.text(cx, cy - 10, 'RAINBOW MODE', this.hue(cx, cy), 18, 1.6)
    this.text(cx, cy + 16, `x${this.game.stats.rainbowMult} EVERYTHING`, PAL.white, 10, 1.6)
  }

  private hue(x: number, y: number): string {
    return `hsl(${rainbowHue(this.time, x, y)} 100% 62%)`
  }

  private levelFx(): void {
    const cx = this.cssW / 2
    const cy = this.cssH / 2
    this.ring(cx, cy, Math.hypot(this.cssW, this.cssH) * 0.7, 1.1, PAL.white, true, true)
    this.setFlash(PAL.white, 0.15, 0.35)
    const n = this.lowFx ? 30 : 70
    for (let i = 0; i < n; i++) {
      this.particles.add(Math.random() * this.cssW, -5, (Math.random() - 0.5) * 60, 60 + Math.random() * 160, 1.2 + Math.random(), 3, [C_WHITE, C_LIGHT, C_GOLD][i % 3], 60)
    }
  }

  private bossRiseFx(x: number, y: number, final: boolean): void {
    const color = final ? PAL.cyan : PAL.red
    this.addTrauma(final ? 1 : 0.6)
    this.setFlash(color, final ? 0.35 : 0.2, 0.5)
    this.ring(x, y, Math.hypot(this.cssW, this.cssH) * (final ? 0.9 : 0.5), 1.4, color, true, false)
    this.ring(x, y, this.ps * 5, 0.8, PAL.white, true, true)
    this.particles.burst(x, y, this.lowFx ? 30 : 70, 260 * this.k, 1, Math.max(3, Math.round(this.ps * 0.3)), final ? [C_DARK, C_WHITE, C_CYAN, C_CYAN] : [C_DARK, C_MID, C_RED, C_RED], 300 * this.k)
    this.text(this.cssW / 2, this.cssH / 2 - 14, final ? '!! FINAL WARNING !!' : '!! WARNING !!', color, this.cssW < 500 ? 14 : 20, final ? 2.6 : 1.8)
    this.text(this.cssW / 2, this.cssH / 2 + 14, `${final ? C.FINAL_NAME : C.BOSS_NAME} HAS SURFACED`, PAL.white, 9, final ? 2.6 : 1.8)
  }

  private bossHitFx(e: Extract<GameEvent, { type: 'boss-hit' }>): void {
    const x = e.x * this.scale
    const y = e.y * this.scale
    const size = Math.max(2, Math.round(this.ps * 0.24))
    if (e.source === 'nuke') {
      this.text(x, y - this.ps * 2, `-${fmt(e.dmg)}`, PAL.orange, 16, 1.4)
      return
    }
    this.particles.burst(x, y, this.lowFx ? 6 : 12, 220 * this.k, 0.5, size, e.crit ? [C_RED, C_GOLD, C_WHITE] : [C_RED, C_PINK, C_WHITE], 380 * this.k)
    this.ring(x, y, this.ps * (e.crit ? 2.6 : 1.6), 0.18, e.crit ? PAL.red : PAL.white, false, false)
    this.addTrauma(e.crit ? 0.16 : 0.07)
    if (e.crit) {
      this.freeze = Math.max(this.freeze, 0.035)
      this.text(x, y - this.ps * 1.4, `-${fmt(e.dmg)}`, PAL.red, 13, 0.8)
    } else {
      this.text(x, y - this.ps * 0.8, `-${fmt(e.dmg)}`, PAL.white, 9, 0.7)
    }
  }

  private bossDefeatFx(x: number, y: number, amount: number, final = false): void {
    this.setFlash(PAL.white, 0.7, 0.9)
    this.addTrauma(0.9)
    this.freeze = Math.max(this.freeze, 0.12)
    this.ring(x, y, Math.hypot(this.cssW, this.cssH) * 0.8, 1.3, PAL.white, true, false)
    this.ring(x, y, Math.hypot(this.cssW, this.cssH) * 0.45, 1, PAL.red, true, false)
    const half = (final ? C.FINAL_RADIUS : C.BOSS_RADIUS) * this.scale
    const n = this.lowFx ? 120 : 300
    for (let i = 0; i < n; i++) {
      const px = x + (Math.random() - 0.5) * half * 2
      const py = y + (Math.random() - 0.5) * half * 2
      const a = Math.atan2(py - y, px - x)
      const v = (120 + Math.random() * 420) * this.k
      const c = final ? [C_CYAN, C_BLUE, C_WHITE, C_GOLD, C_VIOLET][i % 5] : [C_RED, C_PINK, C_WHITE, C_GOLD, C_VIOLET][i % 5]
      this.particles.add(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random(), 2 + Math.random() * 5, c, 260)
    }
    this.text(x, y - 18, final ? 'SYSTEM FAILURE' : 'BOSS DOWN', final ? PAL.cyan : PAL.red, 20, 2.2)
    this.text(x, y + 14, `+${fmt(amount)}`, PAL.gold, 16, 2.2)
  }

  private ring(x: number, y: number, max: number, dur: number, color: string, grid: boolean, dotted: boolean): void {
    if (this.rings.length > 60) this.rings.shift()
    this.rings.push({ x, y, max, t: 0, dur, color, grid, dotted })
  }

  private text(x: number, y: number, text: string, color: string, size: number, dur: number): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift()
    this.texts.push({ x, y, text, color, size, t: 0, dur })
  }

  /** A floating sprite that pops, rises and fades exactly like `text`. */
  private icon(x: number, y: number, art: Sprite, colors: Record<string, string>, size: number, dur: number): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift()
    this.texts.push({ x, y, text: '', color: '', size, t: 0, dur, sprite: { art, colors } })
  }

  private setFlash(color: string, alpha: number, dur: number): void {
    if (this.flash.t < this.flash.dur && this.flash.alpha * (1 - this.flash.t / this.flash.dur) > alpha) return
    this.flash = { t: 0, dur, color, alpha: this.reducedMotion ? alpha * 0.4 : alpha }
  }

  private addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v)
  }

  // ------------------------------------------------------------------ frame

  render(dt: number): void {
    const g = this.game
    this.time += dt
    if (sceneryStage(g.state.level) !== this.stage) this.rebuildBackground(this.stage >= 0)

    let pdt = dt
    if (this.freeze > 0) {
      this.freeze -= dt
      pdt = 0
    }
    this.particles.update(pdt)
    for (const r of this.rings) r.t += dt
    this.rings = this.rings.filter((r) => r.t < r.dur)
    for (const t of this.texts) t.t += pdt
    this.texts = this.texts.filter((t) => t.t < t.dur)
    for (const z of this.zaps) z.t += dt
    this.zaps = this.zaps.filter((z) => z.t < 0.12)
    for (const a of this.arcs) a.t += dt
    for (const a of this.absorbs) {
      a.t += dt
      if (a.t >= a.delay + a.dur) this.particles.burst(a.x1, a.y1, 3, 80 * this.k, 0.3, 2, [C_CYAN, C_WHITE])
    }
    this.absorbs = this.absorbs.filter((a) => a.t < a.delay + a.dur)
    this.arcs = this.arcs.filter((a) => a.t < ARC_LIFE)
    this.flash.t += dt
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 1.6)
    if (g.nuke) this.trauma = Math.max(this.trauma, 0.25)
    this.trauma = Math.max(0, this.trauma - dt * 1.7)

    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    let ox = 0
    let oy = 0
    if (this.shakeEnabled && !this.reducedMotion && this.trauma > 0) {
      const m = this.trauma * this.trauma * 9
      ox = Math.round((Math.random() * 2 - 1) * m)
      oy = Math.round((Math.random() * 2 - 1) * m)
    }

    ctx.fillStyle = PAL.bg
    ctx.fillRect(0, 0, this.cssW, this.cssH)
    ctx.translate(ox, oy)
    this.drawBackground()
    this.drawGridRipples()
    this.drawRespawns()
    this.drawBombs()
    this.drawPixels(dt)
    this.drawBoss()
    this.drawLasers()
    this.drawDrones()
    this.drawZaps()
    this.drawArcs()
    this.particles.draw(ctx)
    this.drawRings()
    this.drawTexts()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.drawNukeWarning()
    this.drawFrenzy()
    this.drawRainbow()
    this.drawFlash()
  }

  private drawBackground(): void {
    const ctx = this.ctx
    const w = this.cssW
    const h = this.cssH
    if (this.reveal >= 1) {
      ctx.drawImage(this.bg, 0, 0, w, h)
      return
    }
    // New scenery scans in from the bottom like an old CRT redraw.
    ctx.drawImage(this.prevBg, 0, 0, w, h)
    const edge = h * (1 - this.reveal)
    const sy = edge * this.dpr
    ctx.drawImage(this.bg, 0, sy, this.bg.width, this.bg.height - sy, 0, edge, w, h - edge)
    ctx.fillStyle = PAL.light
    ctx.globalAlpha = 0.6
    ctx.fillRect(0, Math.round(edge), w, 2)
    ctx.globalAlpha = 1
  }

  private drawGridRipples(): void {
    const f = this.field
    if (!f) return
    const ctx = this.ctx
    ctx.fillStyle = PAL.light
    for (const r of this.rings) {
      if (!r.grid) continue
      const p = r.t / r.dur
      const radius = r.max * (1 - Math.pow(1 - p, 2))
      const band = Math.max(8, f.spacing * 1.6)
      const c0 = Math.max(0, Math.floor((r.x - radius - band - f.ox) / f.spacing))
      const c1 = Math.min(f.cols - 1, Math.ceil((r.x + radius + band - f.ox) / f.spacing))
      const r0 = Math.max(0, Math.floor((r.y - radius - band - f.oy) / f.spacing))
      const r1 = Math.min(f.rows - 1, Math.ceil((r.y + radius + band - f.oy) / f.spacing))
      ctx.globalAlpha = (1 - p) * 0.85
      ctx.beginPath()
      for (let row = r0; row <= r1; row++) {
        const y = f.oy + row * f.spacing
        for (let col = c0; col <= c1; col++) {
          const x = f.ox + col * f.spacing
          const d = Math.abs(Math.hypot(x - r.x, y - r.y) - radius)
          if (d > band) continue
          const rad = 0.8 + 1.6 * (1 - d / band)
          ctx.moveTo(x + rad, y)
          ctx.arc(x, y, rad, 0, Math.PI * 2)
        }
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private drawRespawns(): void {
    const ctx = this.ctx
    const ps = this.ps
    const arm = Math.max(2, Math.round(ps / 3))
    for (const r of this.game.respawns) {
      if (r.total < 0.35) continue
      const p = 1 - r.t / r.total
      const x = Math.round(r.x * this.scale - ps / 2)
      const y = Math.round(r.y * this.scale - ps / 2)
      const blink = r.t < 0.3 && Math.floor(this.time * 20) % 2 === 0
      ctx.globalAlpha = blink ? 0.9 : 0.25 + 0.35 * p
      ctx.fillStyle = blink ? PAL.white : PAL.mid
      // Corner brackets: "something will appear here".
      ctx.fillRect(x, y, arm, 1)
      ctx.fillRect(x, y, 1, arm)
      ctx.fillRect(x + ps - arm, y, arm, 1)
      ctx.fillRect(x + ps - 1, y, 1, arm)
      ctx.fillRect(x, y + ps - 1, arm, 1)
      ctx.fillRect(x, y + ps - arm, 1, arm)
      ctx.fillRect(x + ps - arm, y + ps - 1, arm, 1)
      ctx.fillRect(x + ps - 1, y + ps - arm, 1, arm)
      const inner = Math.round(ps * p * 0.6)
      if (inner > 0) {
        ctx.globalAlpha = 0.18 + 0.2 * p
        ctx.fillRect(x + Math.round((ps - inner) / 2), y + Math.round((ps - inner) / 2), inner, inner)
      }
    }
    ctx.globalAlpha = 1
  }

  private drawPixels(dt: number): void {
    const ctx = this.ctx
    const base = this.ps
    const first = this.game.state.stats.kills === 0
    for (const p of this.game.pixels) {
      if (p.dead) continue
      const x = p.x * this.scale
      const y = p.y * this.scale
      const pop = p.age < 0.18 ? easeOutBack(p.age / 0.18) : 1
      const breathe = 1 + 0.05 * Math.sin(this.time * 4 + p.id)
      const s = Math.max(2, Math.round(base * pop * breathe))
      const golden = p.kind === 'golden'
      const special = golden || p.kind === 'rainbow'
      if (special && p.life < 1.6 && Math.floor(this.time * 12) % 2 === 0) continue

      const blue = p.kind === 'blue'
      const rainbow = p.kind === 'rainbow' || this.game.rainbow > 0
      const color = rainbow ? this.hue(x, y) : golden ? PAL.gold : blue ? PAL.blue : p.kind === 'rain' ? PAL.light : PAL.white
      if (p.kind === 'rain' || p.vy > 0) {
        ctx.fillStyle = color
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 0.28 - i * 0.07
          const ts = Math.max(2, Math.round(s * (1 - i * 0.15)))
          ctx.fillRect(Math.round(x - ts / 2), Math.round(y - s / 2 - i * s * 0.9), ts, ts)
        }
      }
      const glow = Math.round(s * (special ? 2.8 : rainbow || blue ? 2.4 : 2.1))
      ctx.globalAlpha = special ? 0.16 : rainbow || blue ? 0.12 + 0.04 * Math.sin(this.time * 4 + p.id) : 0.045 + 0.025 * Math.sin(this.time * 3 + p.id)
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x - glow / 2), Math.round(y - glow / 2), glow, glow)
      ctx.globalAlpha = 1
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s)

      if (golden && Math.random() < dt * 8) {
        this.particles.add(x + (Math.random() - 0.5) * s * 2, y + (Math.random() - 0.5) * s * 2, 0, -20, 0.5, 2, C_GOLD)
      }
      if (p.kind === 'rainbow' && Math.random() < dt * 14) {
        const c = C_RAINBOW[(Math.random() * C_RAINBOW.length) | 0]
        this.particles.add(x + (Math.random() - 0.5) * s * 2.4, y + (Math.random() - 0.5) * s * 2.4, 0, -24, 0.6, 2, c)
      }
      if (first) {
        // The only "tutorial": a pulsing target bracket around the very first pixel.
        const gap = Math.round(s * 0.9 + 4 + Math.sin(this.time * 5) * 3)
        const arm = Math.max(3, Math.round(s * 0.4))
        ctx.fillStyle = PAL.light
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 5)
        const l = Math.round(x - gap)
        const r = Math.round(x + gap)
        const t = Math.round(y - gap)
        const b = Math.round(y + gap)
        ctx.fillRect(l, t, arm, 2)
        ctx.fillRect(l, t, 2, arm)
        ctx.fillRect(r - arm, t, arm, 2)
        ctx.fillRect(r - 2, t, 2, arm)
        ctx.fillRect(l, b - 2, arm, 2)
        ctx.fillRect(l, b - arm, 2, arm)
        ctx.fillRect(r - arm, b - 2, arm, 2)
        ctx.fillRect(r - 2, b - arm, 2, arm)
        ctx.globalAlpha = 1
      }
    }
    ctx.globalAlpha = 1
  }

  /** A giant stuck pixel: a block of cells that crack away as its HP falls. */
  private drawBoss(): void {
    this.drawAbsorbs()
    const b = this.game.boss
    if (!b) return
    if (b.phase === 'die') {
      this.drawZeroDeath(b)
      return
    }
    const ctx = this.ctx
    const intro = b.final && b.phase === 'rise' ? Math.sin(Math.PI * Math.min(1, b.t / C.FINAL_RISE)) : 0
    if (intro > 0) {
      // The arena dims while PIXEL ZERO tears through the grid.
      ctx.globalAlpha = 0.55 * intro
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, this.cssW, this.cssH)
      ctx.globalAlpha = 1
    }
    const s = this.scale
    const size = Math.round(b.r * 2 * s)
    const cell = size / BOSS_CELLS
    let x = Math.round(b.x * s - size / 2)
    let y = Math.round(b.y * s - size / 2)
    // Rising out of (or sinking back into) the grid: slide through the floor line at its bottom edge.
    const shown = b.phase === 'rise' ? b.t / (b.final ? C.FINAL_RISE : C.BOSS_RISE) : b.phase === 'sink' ? 1 - b.t / C.BOSS_SINK : 1
    const floor = y + size
    y += Math.round(size * (1 - Math.min(1, Math.max(0, shown))))
    if (b.enraged && b.phase === 'fight' && !this.reducedMotion) {
      x += Math.round((Math.random() - 0.5) * 3)
      y += Math.round((Math.random() - 0.5) * 3)
    }

    // Clip at the floor line only while rising or sinking; once up, nothing (rim, orbiting fragments) is cut off.
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - size, floor - size * 3, size * 3, size * (b.phase === 'fight' ? 4 : 3))
    ctx.clip()

    // Glow.
    const pulse = 0.12 + 0.05 * Math.sin(this.time * (b.enraged ? 12 : 4))
    const glow = Math.round(size * 1.6)
    ctx.globalAlpha = pulse
    ctx.fillStyle = b.final ? PAL.white : PAL.red
    ctx.fillRect(Math.round(x + size / 2 - glow / 2), Math.round(y + size / 2 - glow / 2), glow, glow)

    const hit = Math.max(0, 1 - (this.time - this.bossHitAt) / 0.08)
    if (b.final) {
      this.drawPixelZero(b, x, y, size, hit)
      if (b.phase === 'fight') this.drawFinalTargets(b, x + size / 2, y + size / 2)
      ctx.restore()
      ctx.globalAlpha = 1
      return
    }

    const cracked = Math.floor((1 - b.hp / b.maxHp) * BOSS_CRACK_ORDER.length * 0.85)
    const dead = new Set(BOSS_CRACK_ORDER.slice(0, cracked))
    const mouthOpen = this.time - this.bossAteAt < 0.25
    const gap = cell >= 6 ? 1 : 0
    const drawCells = (ox: number, oy: number, color: string, alpha: number) => {
      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      for (let i = 0; i < BOSS_CELLS * BOSS_CELLS; i++) {
        if (dead.has(i) || BOSS_EYES.has(i) || (mouthOpen && BOSS_MOUTH.has(i))) continue
        const cx = Math.round(x + ox + (i % BOSS_CELLS) * cell)
        const cy = Math.round(y + oy + Math.floor(i / BOSS_CELLS) * cell)
        ctx.fillRect(cx, cy, Math.ceil(cell) - gap, Math.ceil(cell) - gap)
      }
    }
    if (b.enraged) {
      // RGB split: the signal is breaking up.
      const o = this.reducedMotion ? 2 : 2 + Math.round(Math.random() * 2)
      drawCells(-o, 0, PAL.red, 0.5)
      drawCells(o, 0, PAL.cyan, 0.35)
    }
    drawCells(0, 0, b.enraged && Math.floor(this.time * 10) % 2 === 0 ? PAL.pink : PAL.red, 1)
    // Cracked cells leave a dim outline behind.
    ctx.globalAlpha = 0.5
    ctx.fillStyle = PAL.dark
    for (const i of dead) {
      const cx = Math.round(x + (i % BOSS_CELLS) * cell)
      const cy = Math.round(y + Math.floor(i / BOSS_CELLS) * cell)
      ctx.fillRect(cx, cy, Math.ceil(cell) - gap, 1)
      ctx.fillRect(cx, cy, 1, Math.ceil(cell) - gap)
    }
    // Eyes.
    ctx.globalAlpha = 1
    ctx.fillStyle = b.enraged ? PAL.gold : PAL.white
    for (const i of BOSS_EYES) {
      const cx = Math.round(x + (i % BOSS_CELLS) * cell + cell * 0.25)
      const cy = Math.round(y + Math.floor(i / BOSS_CELLS) * cell + cell * 0.25)
      ctx.fillRect(cx, cy, Math.max(2, Math.round(cell * 0.5)), Math.max(2, Math.round(cell * 0.5)))
    }
    if (hit > 0) drawCells(0, 0, PAL.white, hit * 0.8)
    ctx.restore()
    ctx.globalAlpha = 1
  }

  /** PIXEL ZERO is dead: freeze-frame and flash. The rest plays in `drawZeroDeath`. */
  private startZeroDeath(amount: number): void {
    this.zeroDeath = { at: this.time, burst: 0 }
    this.freeze = Math.max(this.freeze, 0.15)
    this.setFlash(PAL.white, 1, 0.5)
    this.addTrauma(1)
    this.text(this.cssW / 2, this.cssH / 2 - 60, `+${fmt(amount)}`, PAL.gold, 18, 2.2)
  }

  /**
   * The death of PIXEL ZERO, in real time while the world is frozen: it shakes and
   * shatters segment by segment, implodes back into a single pixel, flickers out,
   * and the screen switches off like an old CRT.
   */
  private drawZeroDeath(b: NonNullable<Game['boss']>): void {
    const d = this.zeroDeath
    if (!d) return
    const ctx = this.ctx
    const t = this.time - d.at
    const s = this.scale
    const size = Math.round(b.r * 2 * s)
    const cx = b.x * s
    const cy = b.y * s
    const calm = this.reducedMotion ? 0.25 : 1
    const SHATTER = 2.4
    const COLLAPSE = 3.0
    const FLICKER = 3.4
    const OFF = C.FINAL_DEATH

    // The arena drains to black.
    ctx.globalAlpha = Math.min(0.85, t / SHATTER)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, this.cssW, this.cssH)
    ctx.globalAlpha = 1

    if (t < SHATTER) {
      const p = t / SHATTER
      // Sub-pixel segments burst one by one.
      const dead = Math.floor(p * ZERO_DEATH_ORDER.length)
      while (d.burst < dead) {
        const i = ZERO_DEATH_ORDER[d.burst++]
        const col = Math.floor(i / ZERO_ROWS)
        const row = i % ZERO_ROWS
        const bx = cx - size / 2 + ((col + 0.5) / 3) * size
        const by = cy - size / 2 + ((row + 0.5) / ZERO_ROWS) * size
        this.particles.burst(bx, by, this.lowFx ? 10 : 24, 300 * this.k, 0.9, Math.max(2, Math.round(this.ps * 0.3)), [[C_RED, C_GREEN, C_BLUE][col], C_WHITE], 200 * this.k)
        this.addTrauma(0.12 * calm)
      }
      const shake = (2 + p * 12) * calm
      const x = Math.round(cx - size / 2 + (Math.random() - 0.5) * shake)
      const y = Math.round(cy - size / 2 + (Math.random() - 0.5) * shake)
      this.drawPixelZero({ ...b, hp: b.maxHp * (1 - p), enraged: true }, x, y, size, Math.random() < p * 0.3 ? 0.6 : 0)
    } else if (t < COLLAPSE) {
      // It implodes back into the single pixel it started as.
      const p = (t - SHATTER) / (COLLAPSE - SHATTER)
      const e = p * p * p
      const sz = Math.max(this.ps, Math.round(size * (1 - e)))
      ctx.fillStyle = PAL.red
      ctx.fillRect(Math.round(cx - sz / 2) - 2, Math.round(cy - sz / 2), sz, sz)
      ctx.fillStyle = PAL.blue
      ctx.fillRect(Math.round(cx - sz / 2) + 2, Math.round(cy - sz / 2), sz, sz)
      ctx.fillStyle = PAL.white
      ctx.fillRect(Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz)
    } else if (t < FLICKER) {
      // One pixel left. It flickers, and goes out.
      if (Math.floor(t * 14) % 3 !== 0) {
        const ps = Math.round(this.ps)
        ctx.fillStyle = PAL.white
        ctx.fillRect(Math.round(cx - ps / 2), Math.round(cy - ps / 2), ps, ps)
      }
    } else {
      // An old CRT switching off: the picture squeezes to a line, the line to a dot, then black.
      const p = Math.min(1, (t - FLICKER) / (OFF - FLICKER))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, this.cssW, this.cssH)
      const w = p < 0.5 ? this.cssW : Math.max(2, this.cssW * (1 - (p - 0.5) * 2))
      const h = p < 0.5 ? Math.max(2, this.cssH * 0.3 * (1 - p * 2)) : 2
      ctx.globalAlpha = 1 - Math.max(0, (p - 0.85) / 0.15)
      ctx.fillStyle = PAL.white
      ctx.fillRect(Math.round(this.cssW / 2 - w / 2), Math.round(this.cssH / 2 - h / 2), Math.round(w), Math.round(h))
      ctx.globalAlpha = 1
    }
  }

  /** Pixels streaking into PIXEL ZERO, accelerating as they go, with a short trail. */
  private drawAbsorbs(): void {
    if (this.absorbs.length === 0) return
    const ctx = this.ctx
    const size = Math.max(2, Math.round(this.ps * 0.8))
    for (const a of this.absorbs) {
      const p = Math.max(0, (a.t - a.delay) / a.dur)
      for (let i = 4; i >= 0; i--) {
        const q = Math.max(0, p - i * 0.04)
        const e = q * q * q
        const x = a.x0 + (a.x1 - a.x0) * e
        const y = a.y0 + (a.y1 - a.y0) * e
        ctx.globalAlpha = i === 0 ? 1 : 0.5 * (1 - i / 5)
        ctx.fillStyle = i === 0 ? (p > 0 ? PAL.white : PAL.light) : PAL.cyan
        const s = i === 0 ? size : Math.max(1, size - i)
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s)
      }
    }
    ctx.globalAlpha = 1
  }

  /**
   * PIXEL ZERO is one magnified screen pixel: red, green and blue sub-pixel
   * bars behind a black matrix, with a single eye. Damage kills sub-pixel
   * segments one by one; enraged, the colours glitch and split.
   */
  private drawPixelZero(b: NonNullable<Game['boss']>, x: number, y: number, size: number, hit: number): void {
    const ctx = this.ctx
    const glitch = b.enraged && !this.reducedMotion
    // Fragments orbiting it: the pixels it has swallowed.
    const cx = x + size / 2
    const cy = y + size / 2
    const bit = Math.max(2, Math.round(size * 0.05))
    for (let i = 0; i < ZERO_ORBIT; i++) {
      const a = this.time * (b.enraged ? 1.4 : 0.6) + (i / ZERO_ORBIT) * Math.PI * 2
      const r = size * (0.78 + 0.06 * Math.sin(this.time * 2 + i))
      ctx.globalAlpha = 0.85
      ctx.fillStyle = i % 3 === 0 ? PAL.red : i % 3 === 1 ? PAL.green : PAL.blue
      ctx.fillRect(Math.round(cx + Math.cos(a) * r - bit / 2), Math.round(cy + Math.sin(a) * r * 0.9 - bit / 2), bit, bit)
    }

    // The black matrix around the sub-pixels, with a bright rim.
    ctx.globalAlpha = 1
    ctx.fillStyle = PAL.light
    ctx.fillRect(x - 2, y - 2, size + 4, size + 4)
    ctx.fillStyle = '#050505'
    ctx.fillRect(x, y, size, size)

    const pad = Math.max(2, Math.round(size * 0.06))
    const colW = (size - pad * 4) / 3
    const segH = (size - pad * (ZERO_ROWS + 1)) / ZERO_ROWS
    const dead = new Set(ZERO_DEATH_ORDER.slice(0, Math.floor((1 - b.hp / b.maxHp) * ZERO_DEATH_ORDER.length * 0.85)))
    const colors = [PAL.red, PAL.green, PAL.blue]
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < ZERO_ROWS; r++) {
        const i = c * ZERO_ROWS + r
        const sx = Math.round(x + pad + c * (colW + pad) + (glitch ? (Math.random() - 0.5) * 4 : 0))
        const sy = Math.round(y + pad + r * (segH + pad))
        if (dead.has(i)) {
          ctx.globalAlpha = 1
          ctx.fillStyle = '#1c1c1c'
        } else {
          // Live segments shimmer slightly; enraged ones flash white.
          ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this.time * 5 + i)
          ctx.fillStyle = glitch && Math.random() < 0.08 ? PAL.white : colors[c]
        }
        ctx.fillRect(sx, sy, Math.ceil(colW), Math.ceil(segH))
      }
    }

    // One eye, dead centre. It looks around, and blinks now and then.
    const eye = Math.round(size * 0.3)
    const ex = Math.round(cx - eye / 2)
    const ey = Math.round(cy - eye / 2)
    const blink = (this.time % 4.3) < 0.12
    ctx.globalAlpha = 1
    ctx.fillStyle = '#050505'
    ctx.fillRect(ex - 2, ey - 2, eye + 4, eye + 4)
    ctx.fillStyle = b.enraged ? PAL.red : PAL.white
    if (blink) ctx.fillRect(ex, Math.round(cy - 1), eye, 2)
    else {
      ctx.fillRect(ex, ey, eye, eye)
      const pupil = Math.round(eye * 0.42)
      const look = (eye - pupil) / 2
      const px = Math.round(cx - pupil / 2 + Math.sin(this.time * 0.9) * look * 0.8)
      const py = Math.round(cy - pupil / 2 + Math.cos(this.time * 0.7) * look * 0.5)
      ctx.fillStyle = '#050505'
      ctx.fillRect(px, py, pupil, pupil)
    }

    if (hit > 0) {
      ctx.globalAlpha = hit * 0.6
      ctx.fillStyle = PAL.white
      ctx.fillRect(x, y, size, size)
    }
    ctx.globalAlpha = 1
  }

  /** PIXEL ZERO's tap targets: blinking gold weak spots, and the core while an EMP charges. */
  private drawFinalTargets(b: NonNullable<Game['boss']>, cx: number, cy: number): void {
    const ctx = this.ctx
    const s = this.scale
    const on = Math.floor(this.time * 6) % 2 === 0
    const spot = Math.max(4, Math.round(C.FINAL_SPOT_RADIUS * 2 * s * 0.8))
    for (const sp of b.spots) {
      const x = Math.round(cx + sp.dx * s - spot / 2)
      const y = Math.round(cy + sp.dy * s - spot / 2)
      ctx.globalAlpha = 1
      ctx.fillStyle = PAL.bg
      ctx.fillRect(x - 2, y - 2, spot + 4, spot + 4)
      ctx.fillStyle = on ? PAL.gold : PAL.orange
      ctx.fillRect(x, y, spot, spot)
    }
    if (b.empCharge > 0) {
      const p = 1 - b.empCharge / C.FINAL_EMP_CHARGE
      const core = Math.round(C.FINAL_CORE_RADIUS * 2 * s * (0.7 + 0.3 * p))
      ctx.globalAlpha = 0.35 + 0.5 * p
      ctx.fillStyle = PAL.cyan
      const halo = core + Math.round(this.ps * 2 * p)
      ctx.fillRect(Math.round(cx - halo / 2), Math.round(cy - halo / 2), halo, halo)
      ctx.globalAlpha = 1
      ctx.fillStyle = Math.floor(this.time * (6 + 18 * p)) % 2 === 0 ? PAL.white : PAL.cyan
      ctx.fillRect(Math.round(cx - core / 2), Math.round(cy - core / 2), core, core)
    }
    ctx.globalAlpha = 1
  }

  private drawBombs(): void {
    const ctx = this.ctx
    const s = this.scale
    for (const b of this.game.bombs) {
      const bit = Math.max(2, Math.round(s * (b.mini ? 0.75 : 1.15)))
      let x = b.x * s
      let y = b.y * s
      const a = b.arc
      const flying = a !== undefined && a.t < a.dur
      const urgency = flying ? 0 : 1 - b.fuse / b.total
      const blink = Math.floor(this.time * (flying ? 16 : 4 + urgency * 22)) % 2 === 0
      // Telegraph the blast radius (a bomblet's landing spot while it is still in the air).
      const tx = a ? a.x1 * s : x
      const ty = a ? a.y1 * s : y
      ctx.strokeStyle = PAL.red
      ctx.globalAlpha = flying ? 0.1 + 0.35 * (a.t / a.dur) : 0.15 + 0.25 * urgency
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.arc(tx, ty, b.r * s, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      if (flying) {
        const lift = (t: number) => Math.sin(Math.PI * t) * Math.max(22, Math.hypot(a.x1 - a.x0, a.y1 - a.y0) * 0.4) * s
        const at = (t: number) => [(a.x0 + (a.x1 - a.x0) * t) * s, (a.y0 + (a.y1 - a.y0) * t) * s - lift(t)]
        const p = a.t / a.dur
        // Shadow on the ground, shrinking as the bomblet climbs.
        const sh = Math.max(2, Math.round(bit * (3 - lift(p) / (s * 25))))
        ctx.fillStyle = PAL.dark
        ctx.fillRect(Math.round(x - sh / 2), Math.round(y - 1), sh, 2)
        // Ember trail along the arc.
        for (let i = 1; i <= 7; i++) {
          const q = p - i * 0.035
          if (q <= 0) break
          const [qx, qy] = at(q)
          ctx.globalAlpha = 0.75 * (1 - i / 8)
          ctx.fillStyle = i < 3 ? PAL.gold : PAL.orange
          const d = Math.max(1, bit - Math.floor(i / 3))
          ctx.fillRect(Math.round(qx - d / 2), Math.round(qy - d / 2), d, d)
        }
        ctx.globalAlpha = 1
        ;[x, y] = at(p)
      }
      const w = BOMB[0].length * bit
      drawSprite(ctx, BOMB, x - w / 2, y - w / 2 - bit, bit, {
        '1': blink ? PAL.red : '#4a4a4a',
        '2': PAL.light,
        '3': blink ? PAL.gold : PAL.orange,
        '4': PAL.mid,
      })
    }
  }

  private drawLasers(): void {
    const ctx = this.ctx
    const s = this.scale
    for (const l of this.game.lasers) {
      ctx.beginPath()
      ctx.moveTo(l.x1 * s, l.y1 * s)
      ctx.lineTo(l.x2 * s, l.y2 * s)
      if (l.phase === 'charge') {
        const blink = Math.floor(this.time * 24) % 2 === 0
        ctx.strokeStyle = blink ? PAL.red : PAL.cyan
        ctx.globalAlpha = 0.35 + 0.4 * (1 - l.t / C.LASER_CHARGE)
        ctx.lineWidth = 1
        ctx.setLineDash([6, 6])
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        const f = l.t / C.LASER_FIRE
        const w = Math.max(1, C.LASER_WIDTH * s * f)
        ctx.strokeStyle = PAL.cyan
        ctx.globalAlpha = 0.35 * f
        ctx.lineWidth = w * 2.4
        ctx.stroke()
        ctx.strokeStyle = PAL.white
        ctx.globalAlpha = 1
        ctx.lineWidth = w
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.lineWidth = 1
  }

  private drawDrones(): void {
    const ctx = this.ctx
    const bit = Math.max(2, Math.round(this.scale * 0.5))
    const jammed = this.game.droneJam > 0
    for (const d of this.game.drones) {
      const x = Math.round(d.x * this.scale)
      const y = Math.round(d.y * this.scale + (jammed ? 0 : Math.sin(d.phase * 3) * 1.5))
      if (jammed && Math.random() < 0.15) continue // flicker
      drawSprite(ctx, CURSOR, x, y, bit, { '1': jammed ? PAL.mid : PAL.light, '2': jammed ? PAL.dark : PAL.bg })
      if (jammed && Math.random() < 0.05) this.particles.burst(x, y, 2, 60 * this.k, 0.25, 2, [C_CYAN, C_WHITE])
    }
  }

  private drawZaps(): void {
    const ctx = this.ctx
    ctx.fillStyle = PAL.white
    for (const z of this.zaps) {
      ctx.globalAlpha = 1 - z.t / 0.12
      const s = Math.round(this.ps * 1.6 * (z.t / 0.12 + 0.3))
      ctx.fillRect(Math.round(z.x2 - s / 2), Math.round(z.y2), s, 1)
      ctx.fillRect(Math.round(z.x2), Math.round(z.y2 - s / 2), 1, s)
    }
    ctx.globalAlpha = 1
  }

  private chainArc(x1: number, y1: number, x2: number, y2: number): void {
    if (this.arcs.length > 40) this.arcs.shift()
    const len = Math.hypot(x2 - x1, y2 - y1)
    const segs = Math.max(3, Math.round(len / (this.ps * 2)))
    const nx = -(y2 - y1) / (len || 1)
    const ny = (x2 - x1) / (len || 1)
    const pts: number[] = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const j = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * this.ps * 1.6
      pts.push(x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j)
    }
    this.arcs.push({ pts, t: 0 })
  }

  private drawArcs(): void {
    if (this.arcs.length === 0) return
    const ctx = this.ctx
    ctx.lineJoin = 'miter'
    ctx.lineCap = 'square'
    for (const a of this.arcs) {
      ctx.globalAlpha = 1 - a.t / ARC_LIFE
      for (const [color, width] of [[PAL.orange, Math.max(2, this.ps * 0.5)], [PAL.white, 1]] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(a.pts[0], a.pts[1])
        for (let i = 2; i < a.pts.length; i += 2) ctx.lineTo(a.pts[i], a.pts[i + 1])
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  private drawRings(): void {
    const ctx = this.ctx
    for (const r of this.rings) {
      const p = r.t / r.dur
      const radius = r.max * (1 - Math.pow(1 - p, 3))
      ctx.globalAlpha = 1 - p
      ctx.fillStyle = r.color
      // Rings are drawn as chunky dots around the circumference.
      const dot = r.dotted ? 2 : 3
      const n = Math.min(160, Math.max(8, Math.round((2 * Math.PI * radius) / (r.dotted ? 7 : 4))))
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        ctx.fillRect(Math.round(r.x + Math.cos(a) * radius - dot / 2), Math.round(r.y + Math.sin(a) * radius - dot / 2), dot, dot)
      }
    }
    ctx.globalAlpha = 1
  }

  private drawTexts(): void {
    const ctx = this.ctx
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    // Keep the whole label on screen: numbers from pixels near an edge would otherwise be cut off.
    const pad = 4
    const inside = (x: number, width: number) => {
      const half = width / 2
      return this.cssW < width + 2 * pad ? this.cssW / 2 : Math.max(pad + half, Math.min(this.cssW - pad - half, x))
    }
    for (const t of this.texts) {
      const p = t.t / t.dur
      const pop = p < 0.12 ? 0.6 + (p / 0.12) * 0.6 : p < 0.2 ? 1.2 - ((p - 0.12) / 0.08) * 0.2 : 1
      const size = Math.round(t.size * pop)
      const rise = Math.round((1 - Math.pow(1 - p, 2)) * 28)
      ctx.globalAlpha = p > 0.8 ? 0.35 : p > 0.65 ? 0.7 : 1
      ctx.font = `${size}px ${FONT}`
      ctx.lineWidth = 4
      ctx.strokeStyle = PAL.bg
      const y = Math.round(t.y - rise)
      if (t.sprite) {
        const { art, colors } = t.sprite
        const bit = Math.max(1, Math.round((t.size * pop) / 8))
        const x = Math.round(inside(t.x, (art[0].length + 2) * bit))
        const left = x - (art[0].length * bit) / 2
        const top = y - (art.length * bit) / 2
        // Dark outline (like the text stroke) so it reads over the white flash.
        const outline = Object.fromEntries(Object.keys(colors).map((k) => [k, PAL.bg]))
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawSprite(ctx, art, left + dx * bit, top + dy * bit, bit, outline)
        drawSprite(ctx, art, left, top, bit, colors)
        continue
      }
      const x = Math.round(inside(t.x, ctx.measureText(t.text).width + ctx.lineWidth))
      ctx.strokeText(t.text, x, y)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, x, y)
    }
    ctx.globalAlpha = 1
  }

  private drawNukeWarning(): void {
    const n = this.game.nuke
    if (!n) return
    const ctx = this.ctx
    const on = Math.floor(this.time * 8) % 2 === 0
    const w = this.cssW
    const h = this.cssH
    const edge = Math.max(10, Math.round(Math.min(w, h) * 0.05))
    ctx.fillStyle = PAL.red
    ctx.globalAlpha = on ? 0.45 : 0.18
    ctx.fillRect(0, 0, w, edge)
    ctx.fillRect(0, h - edge, w, edge)
    ctx.fillRect(0, 0, edge, h)
    ctx.fillRect(w - edge, 0, edge, h)
    ctx.globalAlpha = 1
    if (on) {
      ctx.font = `${w < 500 ? 12 : 18}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 6
      ctx.strokeStyle = PAL.bg
      ctx.strokeText('!! NUKE INBOUND !!', w / 2, h / 2)
      ctx.fillStyle = PAL.red
      ctx.fillText('!! NUKE INBOUND !!', w / 2, h / 2)
    }
  }

  private drawFrenzy(): void {
    const f = this.game.frenzy
    if (f <= 0) return
    const ctx = this.ctx
    ctx.globalAlpha = Math.min(1, f) * (0.12 + 0.06 * Math.sin(this.time * 10))
    ctx.fillStyle = PAL.orange
    const e = 6
    ctx.fillRect(0, 0, this.cssW, e)
    ctx.fillRect(0, this.cssH - e, this.cssW, e)
    ctx.fillRect(0, 0, e, this.cssH)
    ctx.fillRect(this.cssW - e, 0, e, this.cssH)
    ctx.globalAlpha = 1
  }

  /** Rainbow mode: an RGB-keyboard wave running round the edge of the arena. */
  private drawRainbow(): void {
    const r = this.game.rainbow
    if (r <= 0) return
    const ctx = this.ctx
    const w = this.cssW
    const h = this.cssH
    const e = 6
    const seg = 12
    ctx.globalAlpha = Math.min(1, r * 2) * 0.55
    for (let x = 0; x < w; x += seg) {
      ctx.fillStyle = this.hue(x, 0)
      ctx.fillRect(x, 0, seg, e)
      ctx.fillStyle = this.hue(x, h)
      ctx.fillRect(x, h - e, seg, e)
    }
    for (let y = e; y < h - e; y += seg) {
      ctx.fillStyle = this.hue(0, y)
      ctx.fillRect(0, y, e, seg)
      ctx.fillStyle = this.hue(w, y)
      ctx.fillRect(w - e, y, e, seg)
    }
    ctx.globalAlpha = 1
  }

  private drawFlash(): void {
    const f = this.flash
    if (f.t >= f.dur) return
    const a = f.alpha * Math.pow(1 - f.t / f.dur, 2)
    if (a <= 0.01) return
    this.ctx.globalAlpha = a
    this.ctx.fillStyle = f.color
    this.ctx.fillRect(0, 0, this.cssW, this.cssH)
    this.ctx.globalAlpha = 1
  }
}
