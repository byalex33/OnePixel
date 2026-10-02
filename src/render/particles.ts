import { PARTICLE_COLORS } from './palette'

/**
 * Fixed-capacity, struct-of-arrays particle pool. No allocation per particle,
 * drawn in one batch per colour. When full, new particles overwrite the oldest.
 */
export class Particles {
  readonly max: number
  count = 0
  private x: Float32Array
  private y: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private life: Float32Array
  private total: Float32Array
  private size: Float32Array
  private grav: Float32Array
  private color: Uint8Array
  private cursor = 0

  constructor(max: number) {
    this.max = max
    this.x = new Float32Array(max)
    this.y = new Float32Array(max)
    this.vx = new Float32Array(max)
    this.vy = new Float32Array(max)
    this.life = new Float32Array(max)
    this.total = new Float32Array(max)
    this.size = new Float32Array(max)
    this.grav = new Float32Array(max)
    this.color = new Uint8Array(max)
  }

  add(x: number, y: number, vx: number, vy: number, life: number, size: number, color: number, gravity = 0): void {
    let i: number
    if (this.count < this.max) {
      i = this.count++
    } else {
      i = this.cursor
      this.cursor = (this.cursor + 1) % this.max
    }
    this.x[i] = x
    this.y[i] = y
    this.vx[i] = vx
    this.vy[i] = vy
    this.life[i] = life
    this.total[i] = life
    this.size[i] = size
    this.grav[i] = gravity
    this.color[i] = color
  }

  /** Radial burst. Speeds are in CSS px / second. */
  burst(x: number, y: number, n: number, speed: number, life: number, size: number, colors: number[], gravity = 0): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.35 + Math.random() * 0.9)
      const c = colors[(Math.random() * colors.length) | 0]
      const s = size * (Math.random() < 0.3 ? 1.6 : 1)
      this.add(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), s, c, gravity)
    }
  }

  update(dt: number): void {
    const drag = Math.pow(0.06, dt)
    let i = 0
    while (i < this.count) {
      this.life[i] -= dt
      if (this.life[i] <= 0) {
        this.kill(i)
        continue
      }
      this.vx[i] *= drag
      this.vy[i] = this.vy[i] * drag + this.grav[i] * dt
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      i++
    }
  }

  private kill(i: number): void {
    const last = --this.count
    if (i !== last) {
      this.x[i] = this.x[last]
      this.y[i] = this.y[last]
      this.vx[i] = this.vx[last]
      this.vy[i] = this.vy[last]
      this.life[i] = this.life[last]
      this.total[i] = this.total[last]
      this.size[i] = this.size[last]
      this.grav[i] = this.grav[last]
      this.color[i] = this.color[last]
    }
    if (this.cursor >= this.count) this.cursor = 0
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let c = 0; c < PARTICLE_COLORS.length; c++) {
      ctx.fillStyle = PARTICLE_COLORS[c]
      for (let i = 0; i < this.count; i++) {
        if (this.color[i] !== c) continue
        // Shrink in hard steps rather than fading: reads as chunky pixels.
        const f = this.life[i] / this.total[i]
        const step = f > 0.66 ? 1 : f > 0.33 ? 0.66 : 0.4
        const s = Math.max(1, Math.round(this.size[i] * step))
        ctx.fillRect(Math.round(this.x[i] - s / 2), Math.round(this.y[i] - s / 2), s, s)
      }
    }
  }

  clear(): void {
    this.count = 0
    this.cursor = 0
  }
}
