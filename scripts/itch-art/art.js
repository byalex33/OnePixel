// Drawing helpers for the itch.io cover and banner. Served by the Vite dev
// server, so it borrows the game's own fonts, palette, sprites and dot field.

import '@fontsource/press-start-2p'
import '@fontsource/vt323'
import '@fontsource/caveat/600.css'
import { Rng } from '/src/game/rng.ts'
import { buildField, paintField } from '/src/render/dotfield.ts'
import { PAL } from '/src/render/palette.ts'
import { CURSOR, drawSprite } from '/src/render/sprites.ts'

export { PAL }

/** The coral of the opening screen's hand-drawn hint (--color-coral in index.css). */
export const CORAL = '#ff6f61'

export const FONT = {
  pixel: '"Press Start 2P"',
  term: 'VT323',
  hand: 'Caveat',
}

/** A canvas filling the page at device resolution, drawn in CSS pixels. */
export async function setup() {
  await Promise.all([
    document.fonts.load(`16px ${FONT.pixel}`),
    document.fonts.load(`16px ${FONT.term}`),
    document.fonts.load(`600 16px ${FONT.hand}`),
  ])
  const w = window.innerWidth
  const h = window.innerHeight
  const dpr = window.devicePixelRatio || 1
  const canvas = document.querySelector('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  return { ctx, w, h, dpr, rng: new Rng(7) }
}

/** The arena's dot-matrix field, with scenery as it looks at `level`. */
export function field(ctx, w, h, dpr, level, seed) {
  const f = buildField(w, h, level, seed)
  const off = document.createElement('canvas')
  paintField(off, f, w, h, dpr)
  ctx.drawImage(off, 0, 0, w, h)
}

/** A pixel as the game draws it: a solid square in a faint halo of its own colour. */
export function pixel(ctx, x, y, s, color = PAL.white, halo = 0.07) {
  const g = Math.round(s * 2.1)
  ctx.fillStyle = color
  ctx.globalAlpha = halo
  ctx.fillRect(Math.round(x - g / 2), Math.round(y - g / 2), g, g)
  ctx.globalAlpha = 1
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s)
}

/** The target bracket the game draws round the very first pixel. */
export function bracket(ctx, x, y, gap, arm, t = 2, color = PAL.light) {
  ctx.fillStyle = color
  const l = Math.round(x - gap)
  const r = Math.round(x + gap)
  const top = Math.round(y - gap)
  const b = Math.round(y + gap)
  for (const [px, py, sx, sy] of [
    [l, top, 1, 1],
    [r, top, -1, 1],
    [l, b, 1, -1],
    [r, b, -1, -1],
  ]) {
    ctx.fillRect(sx > 0 ? px : px - arm, sy > 0 ? py : py - t, arm, t)
    ctx.fillRect(sx > 0 ? px : px - t, sy > 0 ? py : py - arm, t, arm)
  }
}

/** A drone: the game's little mouse-cursor sprite. */
export function cursor(ctx, x, y, bit, color = PAL.light) {
  drawSprite(ctx, CURSOR, x, y, bit, { 1: color, 2: PAL.bg })
}

/** An orbital laser mid-fire: a white core in a cyan glow. */
export function laser(ctx, x1, y1, x2, y2, w) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = PAL.cyan
  ctx.globalAlpha = 0.3
  ctx.lineWidth = w * 2.4
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.strokeStyle = PAL.white
  ctx.lineWidth = w
  ctx.stroke()
}

/** A pixel bursting: square chips flung out from (x, y), plus a dotted shockwave ring. */
export function burst(ctx, rng, x, y, r, n, colors, chip = 4) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2)
    const d = r * Math.sqrt(rng.next())
    const s = Math.max(2, Math.round(chip * rng.range(0.5, 1.3)))
    ctx.fillStyle = colors[rng.int(0, colors.length - 1)]
    ctx.globalAlpha = rng.range(0.6, 1)
    ctx.fillRect(Math.round(x + Math.cos(a) * d - s / 2), Math.round(y + Math.sin(a) * d - s / 2), s, s)
  }
  ctx.globalAlpha = 1
}

export function ring(ctx, x, y, r, color, alpha = 0.6, dot = 2) {
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  const steps = Math.round((Math.PI * 2 * r) / (dot * 3))
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    ctx.fillRect(Math.round(x + Math.cos(a) * r - dot / 2), Math.round(y + Math.sin(a) * r - dot / 2), dot, dot)
  }
  ctx.globalAlpha = 1
}

/** Text with a hard 1-bit drop shadow, like the game's floating numbers. */
export function text(ctx, str, x, y, { font, size, color, align = 'center', shadow = PAL.bg, offset = Math.max(1, Math.round(size / 12)), weight = '', spacing = 0 }) {
  ctx.font = `${weight} ${size}px ${font}`.trim()
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = `${spacing}px`
  if (shadow) {
    ctx.fillStyle = shadow
    ctx.fillText(str, x + offset, y + offset)
  }
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
  ctx.letterSpacing = '0px'
}

/** The hand-drawn "click me!" arrow from the opening screen, tip at (x, y). */
export function clickMe(ctx, x, y, scale = 1) {
  ctx.save()
  // The SVG in ClickMeHint has its tip at (6, 14).
  ctx.translate(x - 6 * scale, y - 14 * scale)
  ctx.scale(scale, scale)
  ctx.strokeStyle = CORAL
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M52 45 C 38 53, 14 42, 6 14'))
  ctx.stroke(new Path2D('M5 25 L6 14 L15 19'))
  ctx.translate(58, 40)
  ctx.rotate((-7 * Math.PI) / 180)
  ctx.font = `600 28px ${FONT.hand}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = CORAL
  ctx.fillText('click me!', 0, 0)
  ctx.restore()
}

export function done() {
  window.artReady = true
}
