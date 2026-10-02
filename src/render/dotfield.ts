import { Rng } from '../game/rng'
import { PAL } from './palette'

/**
 * The arena backdrop: an LED dot-matrix field. As the player levels up, a
 * dot-matrix landscape grows out of it (ground, mountains, a tree, clouds,
 * a moon). Purely cosmetic and pre-rendered to an offscreen canvas.
 */
export interface DotField {
  spacing: number
  cols: number
  rows: number
  ox: number
  oy: number
  /** 0..1 brightness per dot, row-major. */
  v: Float32Array
  /** Grid row of the ground line, once the ground exists (the fox walks along it). */
  ground: number | null
}

export const SCENERY_LEVELS = [3, 6, 9, 12, 15, 18]

export function sceneryStage(level: number): number {
  return SCENERY_LEVELS.filter((l) => level >= l).length
}

export function buildField(cssW: number, cssH: number, level: number, seed = 1337): DotField {
  const rng = new Rng(seed)
  const spacing = cssW < 700 ? 8 : 10
  const cols = Math.floor(cssW / spacing) + 1
  const rows = Math.floor(cssH / spacing) + 1
  const ox = (cssW - (cols - 1) * spacing) / 2
  const oy = (cssH - (rows - 1) * spacing) / 2
  const v = new Float32Array(cols * rows)
  const ph = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)]
  const horizon = Math.round(rows * 0.8)
  const stage = sceneryStage(level)

  // Feature geometry in grid units.
  const ridge = (c: number) => rows * (0.2 + 0.09 * Math.sin(c * 0.06 + ph[0]) + 0.06 * Math.sin(c * 0.17 + ph[1]) + 0.025 * Math.sin(c * 0.43 + ph[2]))
  const farRidge = (c: number) => rows * (0.3 + 0.05 * Math.sin(c * 0.035 + ph[3]) + 0.03 * Math.sin(c * 0.11 + ph[0]))
  const trees = [Math.round(cols * 0.16), Math.round(cols * 0.74)]
  const canopyR = Math.max(3, rows * 0.09)
  const moon = { c: cols * 0.84, r: rows * 0.17, rad: Math.max(3, rows * 0.07) }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = rng.next()
      let d = roll < 0.08 ? 0.2 + rng.next() * 0.22 : 0.06 + rng.next() * 0.08

      if (stage >= 1 && r >= horizon) {
        const ground = r === horizon ? 0.55 : 0.26 + rng.next() * 0.2 + (rng.next() < 0.08 ? 0.22 : 0)
        d = Math.max(d, ground)
      }
      if (stage >= 6 && r < horizon) {
        const top = horizon - farRidge(c)
        if (r >= top && rng.next() < 0.3) d = Math.max(d, 0.14 + rng.next() * 0.1)
      }
      if (stage >= 2 && r < horizon) {
        const top = horizon - ridge(c)
        if (r >= top) {
          const depth = r - top
          if (depth < 1.2) d = Math.max(d, 0.62)
          else if (rng.next() < 0.5 - depth * 0.02) d = Math.max(d, 0.2 + rng.next() * 0.25)
        }
      }
      if (stage >= 3) {
        const treeCount = stage >= 6 ? 2 : 1
        for (let t = 0; t < treeCount; t++) {
          const tc = trees[t]
          const trunkTop = horizon - rows * 0.2
          if (Math.abs(c - tc) <= (r > horizon - 3 ? 1 : 0) && r >= trunkTop && r < horizon) d = Math.max(d, 0.6)
          const dist = Math.hypot(c - tc, (r - (trunkTop - canopyR * 0.5)) * 1.15)
          if (dist < canopyR && rng.next() < 0.78) d = Math.max(d, dist > canopyR - 1 ? 0.65 : 0.38 + rng.next() * 0.3)
        }
      }
      if (stage >= 4) {
        const band = r >= rows * 0.05 && r <= rows * 0.05 + 3 + Math.sin(c * 0.3 + ph[1]) * 1.2
        if (band && c > cols * 0.28 && c < cols * 0.66 && rng.next() < 0.62) d = Math.max(d, 0.3 + rng.next() * 0.25)
      }
      if (stage >= 5) {
        const dist = Math.hypot(c - moon.c, r - moon.r)
        if (dist < moon.rad) d = Math.max(d, dist > moon.rad - 1 ? 0.8 : 0.45 + rng.next() * 0.15)
      }
      v[r * cols + c] = d
    }
  }
  return { spacing, cols, rows, ox, oy, v, ground: stage >= 1 ? horizon : null }
}

const BUCKETS = 8

/** Paint the field to a canvas sized in device pixels. Dots are batched by brightness. */
export function paintField(target: HTMLCanvasElement, f: DotField, cssW: number, cssH: number, dpr: number): void {
  target.width = Math.max(1, Math.round(cssW * dpr))
  target.height = Math.max(1, Math.round(cssH * dpr))
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = PAL.bg
  ctx.fillRect(0, 0, cssW, cssH)
  for (let b = 0; b < BUCKETS; b++) {
    const lv = (b + 0.5) / BUCKETS
    const rad = 0.7 + lv * 1.5
    ctx.fillStyle = `rgba(${PAL.dot},${(0.3 + lv * 0.7).toFixed(3)})`
    ctx.beginPath()
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.cols; c++) {
        const val = f.v[r * f.cols + c]
        if (Math.min(BUCKETS - 1, Math.floor(val * BUCKETS)) !== b) continue
        const x = f.ox + c * f.spacing
        const y = f.oy + r * f.spacing
        ctx.moveTo(x + rad, y)
        ctx.arc(x, y, rad, 0, Math.PI * 2)
      }
    }
    ctx.fill()
  }
}
