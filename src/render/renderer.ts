import * as C from '../game/config'
import { fmt } from '../game/format'
import type { Game } from '../game/game'
import type { GameEvent } from '../game/types'
import { buildField, paintField, sceneryStage, type DotField } from './dotfield'
import { C_CYAN, C_DARK, C_GOLD, C_LIGHT, C_MID, C_ORANGE, C_RED, C_WHITE, PAL } from './palette'
import { Particles } from './particles'
import { BOMB, CURSOR, drawSprite, FOX_EYE, FOX_TAIL_DOWN, FOX_TAIL_UP, FOX_WALK_A, FOX_WALK_B, FOX_WALK_EYE, HEART, type Sprite } from './sprites'

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
}

interface Zap {
  x1: number
  y1: number
  x2: number
  y2: number
  t: number
}

const FONT = '"Press Start 2P", ui-monospace, monospace'
const MAX_TEXTS = 40
const FOX_HOP = 0.4

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
  private flash: { t: number; dur: number; color: string; alpha: number } = { t: 1, dur: 1, color: PAL.white, alpha: 0 }
  private trauma = 0
  private freeze = 0
  private time = 0
  private lowFx: boolean
  /** Seconds left in the fox's current hop. */
  private foxHop = 0
  /** Little hearts that float up when the fox catches a pixel. */
  private hearts: { x: number; y: number; t: number }[] = []
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
    this.stage = -1
    this.resize(this.cssW, this.cssH, this.dpr, true)
  }

  /** Size the canvas and derive the world dimensions (constant area). */
  resize(cssW: number, cssH: number, dpr: number, force = false): void {
    // A hidden or collapsed container reports ~0px; laying the world out at that
    // size would scramble positions (e.g. the fox's walkable span). Keep the last size.
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
    // Tell the simulation where the ground is so the fox walks along the scenery.
    const f = this.field
    if (f.ground !== null) {
      const groundY = f.oy + (f.ground - 1) * f.spacing
      this.game.setFoxGround(groundY / this.scale, (f.ox + 7 * f.spacing) / this.scale, (f.ox + (f.cols - 8) * f.spacing) / this.scale)
    }
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

    for (const e of events) {
      switch (e.type) {
        case 'pop':
          this.pop(e, many)
          if (e.cause === 'click' && this.foxHop <= 0 && this.nearFox(e.x * this.scale, e.y * this.scale)) this.foxHop = FOX_HOP
          if (e.cause === 'fox' && this.hearts.length < 8) this.hearts.push({ x: e.x * this.scale + this.ps * 1.8, y: e.y * this.scale - this.ps, t: 0 })
          if (many && !e.crit) {
            sum += e.amount
            sx += e.x
            sy += e.y
            n++
          }
          break
        case 'blast':
          this.blast(e.x * this.scale, e.y * this.scale, e.r * this.scale, e.cause)
          break
        case 'laser-fire':
          this.laserFire(e.x1, e.y1, e.x2, e.y2)
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
            this.particles.burst(x, y, 4, 40 * this.k, 0.35, 2, e.kind === 'golden' ? [C_GOLD] : [C_LIGHT, C_MID])
          }
          if (e.kind === 'golden') this.ring(e.x * this.scale, e.y * this.scale, this.ps * 2.5, 0.4, PAL.gold, true, true)
          break
        case 'golden-expire':
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
          this.foxHop = FOX_HOP
          break
      }
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

    const colors =
      e.kind === 'golden' ? [C_GOLD, C_GOLD, C_WHITE, C_ORANGE] : e.kind === 'rain' ? [C_WHITE, C_LIGHT, C_CYAN] : [C_WHITE, C_WHITE, C_LIGHT, C_MID]
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
    } else if (!many) {
      if (manual) this.addTrauma(0.1)
      this.text(x, y - ps * 0.4, `+${fmt(e.amount)}`, manual ? PAL.white : PAL.light, manual ? 10 : 8, manual ? 0.85 : 0.7)
    }
  }

  private blast(x: number, y: number, r: number, cause: string): void {
    const k = this.k
    if (cause === 'click') {
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
    this.text(cx, cy - 20, 'NUKED', PAL.red, 24, 2.2)
    this.text(cx, cy + 16, `+${fmt(amount)}`, PAL.gold, 16, 2.2)
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

  private ring(x: number, y: number, max: number, dur: number, color: string, grid: boolean, dotted: boolean): void {
    if (this.rings.length > 60) this.rings.shift()
    this.rings.push({ x, y, max, t: 0, dur, color, grid, dotted })
  }

  private text(x: number, y: number, text: string, color: string, size: number, dur: number): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift()
    this.texts.push({ x, y, text, color, size, t: 0, dur })
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
    this.flash.t += dt
    if (this.foxHop > 0) this.foxHop = Math.max(0, this.foxHop - dt)
    for (const h of this.hearts) h.t += dt
    this.hearts = this.hearts.filter((h) => h.t < 0.9)
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
    this.drawFox()
    this.drawGridRipples()
    this.drawRespawns()
    this.drawBombs()
    this.drawPixels(dt)
    this.drawLasers()
    this.drawDrones()
    this.drawZaps()
    this.particles.draw(ctx)
    this.drawRings()
    this.drawTexts()
    this.drawHearts()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.drawNukeWarning()
    this.drawFrenzy()
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

  /** Is a CSS-space point close enough to the fox to startle it? */
  private nearFox(x: number, y: number): boolean {
    const f = this.field
    if (!f || f.ground === null) return false
    const fox = this.game.fox
    return Math.hypot(x - fox.x * this.scale, y - (fox.y * this.scale - f.spacing * 4)) < f.spacing * 12
  }

  /**
   * The fox: strolls along the ground with a two-frame walk, sits and wags its
   * tail between strolls, hops when startled or on level-up, and leaps after
   * pixels when FOX FRIEND sends it hunting. Position comes from the simulation.
   */
  private drawFox(): void {
    const f = this.field
    if (!f || f.ground === null) return
    const ctx = this.ctx
    const t = this.time
    const sp = f.spacing
    const sim = this.game.fox
    const leaping = sim.phase === 'out' || sim.phase === 'back'
    const walking = sim.phase === 'walk'
    let sprite: Sprite
    let eye: { r: number; c: number }
    if (leaping) {
      sprite = FOX_WALK_A
      eye = FOX_WALK_EYE
    } else if (walking) {
      // Step the legs in time with the distance walked, so feet don't skate.
      sprite = Math.floor(sim.x * this.scale / (sp * 1.5)) % 2 === 0 ? FOX_WALK_A : FOX_WALK_B
      eye = FOX_WALK_EYE
    } else {
      sprite = Math.floor(t * 2.2) % 2 === 0 ? FOX_TAIL_UP : FOX_TAIL_DOWN
      eye = FOX_EYE
    }
    const blink = !leaping && t % 3.7 < 0.14
    const hopP = !leaping && this.foxHop > 0 ? 1 - this.foxHop / FOX_HOP : 0
    const lift = Math.sin(hopP * Math.PI) * sp * 1.6
    const bob = walking ? (Math.floor(sim.x * this.scale / (sp * 1.5)) % 2) * 1 : 0
    const edge = this.reveal < 1 ? this.cssH * (1 - this.reveal) : -Infinity
    const w = sprite[0].length
    const h = sprite.length
    // On the ground the fox snaps to dot columns so it moves in crisp
    // dot-matrix steps; mid-leap it flies freely.
    const rawX = sim.x * this.scale
    const ax = leaping ? rawX : f.ox + Math.round((rawX - f.ox) / sp) * sp + (w % 2 === 0 ? sp / 2 : 0)
    const ay = sim.y * this.scale - lift - bob

    for (const [key, color, rad, alpha] of [
      ['o', PAL.orange, 1.9, 0.9],
      ['w', PAL.white, 1.7, 0.85],
    ] as const) {
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      ctx.beginPath()
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ch = blink && y === eye.r && x === eye.c ? 'o' : sprite[y][x]
          if (ch !== key) continue
          const gx = sim.facing === 1 ? x : w - 1 - x
          const px = ax + (gx - (w - 1) / 2) * sp
          const py = ay - (h - 1 - y) * sp
          if (py < edge) continue
          ctx.moveTo(px + rad, py)
          ctx.arc(px, py, rad, 0, Math.PI * 2)
        }
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Drawn after floating numbers so the catch reward never hides them. */
  private drawHearts(): void {
    const f = this.field
    if (!f || this.hearts.length === 0) return
    const ctx = this.ctx
    const bit = Math.max(3, Math.round(f.spacing * 0.45))
    for (const heart of this.hearts) {
      const p = heart.t / 0.9
      const pop = p < 0.15 ? 0.5 + p / 0.3 : 1
      const b = Math.max(2, Math.round(bit * pop))
      ctx.globalAlpha = p > 0.7 ? 0.5 : 1
      drawSprite(ctx, HEART, heart.x - b * 2.5, heart.y - b * 2.5 - p * 30, b, { '1': PAL.pink })
    }
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
      if (golden && p.life < 1.6 && Math.floor(this.time * 12) % 2 === 0) continue

      const color = golden ? PAL.gold : p.kind === 'rain' ? PAL.light : PAL.white
      if (p.kind === 'rain' || p.vy > 0) {
        ctx.fillStyle = color
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 0.28 - i * 0.07
          const ts = Math.max(2, Math.round(s * (1 - i * 0.15)))
          ctx.fillRect(Math.round(x - ts / 2), Math.round(y - s / 2 - i * s * 0.9), ts, ts)
        }
      }
      const glow = Math.round(s * (golden ? 2.8 : 2.1))
      ctx.globalAlpha = golden ? 0.16 : 0.045 + 0.025 * Math.sin(this.time * 3 + p.id)
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x - glow / 2), Math.round(y - glow / 2), glow, glow)
      ctx.globalAlpha = 1
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s)

      if (golden && Math.random() < dt * 8) {
        this.particles.add(x + (Math.random() - 0.5) * s * 2, y + (Math.random() - 0.5) * s * 2, 0, -20, 0.5, 2, C_GOLD)
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

  private drawBombs(): void {
    const ctx = this.ctx
    for (const b of this.game.bombs) {
      const bit = Math.max(2, Math.round(this.scale * (b.mini ? 0.75 : 1.15)))
      const x = b.x * this.scale
      const y = b.y * this.scale
      const urgency = 1 - b.fuse / b.total
      const blink = Math.floor(this.time * (4 + urgency * 22)) % 2 === 0
      if (!b.mini) {
        // Telegraph the blast radius.
        ctx.strokeStyle = PAL.red
        ctx.globalAlpha = 0.15 + 0.25 * urgency
        ctx.setLineDash([2, 4])
        ctx.beginPath()
        ctx.arc(x, y, b.r * this.scale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
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
    for (const d of this.game.drones) {
      const x = Math.round(d.x * this.scale)
      const y = Math.round(d.y * this.scale + Math.sin(d.phase * 3) * 1.5)
      drawSprite(ctx, CURSOR, x, y, bit, { '1': PAL.light, '2': PAL.bg })
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
    for (const t of this.texts) {
      const p = t.t / t.dur
      const pop = p < 0.12 ? 0.6 + (p / 0.12) * 0.6 : p < 0.2 ? 1.2 - ((p - 0.12) / 0.08) * 0.2 : 1
      const size = Math.round(t.size * pop)
      const rise = Math.round((1 - Math.pow(1 - p, 2)) * 28)
      ctx.globalAlpha = p > 0.8 ? 0.35 : p > 0.65 ? 0.7 : 1
      ctx.font = `${size}px ${FONT}`
      ctx.lineWidth = 4
      ctx.strokeStyle = PAL.bg
      const x = Math.round(t.x)
      const y = Math.round(t.y - rise)
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
