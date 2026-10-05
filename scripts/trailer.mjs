// Renders the OnePixel trailer to docs/trailer/onepixel-trailer.mp4.
//
//   npm run dev            (in another terminal)
//   npm run trailer
//
// Drives a headless Chrome over the DevTools protocol, like screenshots.mjs,
// but steps the real game one video frame at a time instead of letting it run
// in real time: the simulation, renderer, CSS animations and UI timers all run
// on a virtual clock, so every frame is exact however slow capture is. A
// scripted cursor plays each scene. The soundtrack is the game's own
// synthesised sound effects (replayed from the recorded events in an
// OfflineAudioContext) plus a small chiptune score. Needs ffmpeg on PATH.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.ONEPIXEL_URL ?? 'http://localhost:5173/'
const OUT = join(import.meta.dirname, '..', 'docs', 'trailer')
const PORT = 9334
const FPS = 30
const VIEW = { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false }
const SITE = 'onepixel.alex.codes'

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

// ------------------------------------------------------------------ save data

const saveFile = (state) => {
  const now = Date.now()
  return JSON.stringify({ v: 1, savedAt: now, maxSeenAt: now, state })
}

const EARLY = {
  pixels: 2600,
  totalPixels: 5000,
  xp: 0,
  level: 4,
  upgrades: { respawn: 4, value: 3, multi: 2, critChance: 2, blue: 1, combo: 1 },
  seenUpgrades: ['respawn', 'value', 'multi', 'critChance', 'critPower', 'blue', 'combo', 'xp'],
  stats: { kills: 160, clicks: 170, manualKills: 160, crits: 6, mostOnScreen: 3 },
  reveal: { hud: true, panel: true },
}

const MID = {
  pixels: 2.4e6,
  totalPixels: 4.1e7,
  xp: 30000,
  level: 13,
  upgrades: {
    respawn: 10, value: 18, multi: 10, critChance: 8, critPower: 6, blue: 4, combo: 5, xp: 8,
    blast: 6, auto: 7, golden: 5, chain: 5, bomb: 5, rain: 3, laser: 4, nukeCharge: 2, nukeYield: 2, swarm: 1,
  },
  seenUpgrades: ['respawn', 'value', 'multi', 'critChance', 'critPower', 'blue', 'combo', 'xp', 'blast', 'auto', 'golden', 'chain', 'bomb', 'rain', 'laser', 'nukeCharge', 'nukeYield', 'swarm'],
  stats: { kills: 6400, clicks: 2100, manualKills: 1900, crits: 900, goldenKills: 40, blueKills: 60, droneKills: 2500, maxCombo: 24, mostOnScreen: 14 },
  nukeCharge: 120,
  rainTimer: 120,
  reveal: { hud: true, panel: true },
}

const LATE = {
  pixels: 4.2e10,
  totalPixels: 9e11,
  xp: 600000,
  level: 18,
  upgrades: {
    respawn: 12, value: 30, multi: 15, critChance: 10, critPower: 12, blue: 8, combo: 8, xp: 12,
    blast: 10, auto: 12, golden: 9, chain: 7, bomb: 10, rain: 8, laser: 10, nukeCharge: 6, nukeYield: 8,
    swarm: 1, cluster: 1, twin: 1, goldRain: 1, rainbow: 9, overclock: 1,
  },
  seenUpgrades: [
    'respawn', 'value', 'multi', 'critChance', 'critPower', 'blue', 'combo', 'xp', 'blast', 'auto', 'golden', 'chain', 'bomb',
    'rain', 'laser', 'nukeCharge', 'nukeYield', 'swarm', 'cluster', 'twin', 'goldRain', 'rainbow', 'overclock',
  ],
  stats: { kills: 90000, clicks: 9000, manualKills: 8000, crits: 9000, goldenKills: 400, blueKills: 500, droneKills: 40000, maxCombo: 40, mostOnScreen: 20, nukes: 6 },
  nukeCharge: 40,
  rainTimer: 120,
  reveal: { hud: true, panel: true },
}

// --------------------------------------------------------------------- scenes
// Each scene is a generator run inside the page, one step per video frame.
// `a` is the director API defined in `director()` below.

function* sceneOpen(a) {
  a.cursorAt(innerWidth * 0.88, innerHeight * 1.1)
  a.fade(0, 0.9, 1)
  yield* a.wait(0.9)
  a.caption('THERE IS ONE PIXEL.', 2.4)
  yield* a.wait(0.9)
  yield* a.moveTo(a.at(a.pixels()[0]), 1.4)
  yield* a.until(3.6)
  a.caption('CLICK IT.', 1.4)
  yield* a.until(4.1)
  a.click()
  yield* a.wait(0.5)
  const away = { x: a.cursor.x + 90, y: a.cursor.y + 60 }
  yield* a.moveTo(() => away, 0.7)
  a.caption('IT COMES BACK.', 2.2)
  yield* a.waitFor(() => a.pixels().some((p) => p.age > 0.3), 3)
  yield* a.moveTo(a.at(a.pixels()[0]), 0.35)
  a.click()
  yield* a.until(8)
}

function* sceneEarly(a) {
  const g = a.g()
  a.cursorAt(innerWidth * 0.62, innerHeight * 0.55)
  g.forceBlue = true
  a.caption('UPGRADE.', 1.8)
  yield* a.tapUntil(1.5, { move: 0.2 })
  const row = document.querySelector('[aria-label="Buy EXTRA PIXEL"]')
  const max = row && [...row.querySelectorAll('button')].find((b) => b.textContent.startsWith('MAX'))
  if (max) {
    yield* a.moveTo(a.atEl(max), 0.55)
    yield* a.wait(0.12)
    a.clickEl(max)
    yield* a.wait(0.3)
  }
  a.caption('MORE PIXELS. MORE CLICKS.', 2.3)
  yield* a.tapUntil(5.0, { move: 0.15, gap: 0.04, prefer: ['blue'] })
  const s = g.state
  g.grant(0, Math.max(1, 10 * 2 ** (s.level - 1) - s.xp))
  yield* a.tapUntil(7.8, { move: 0.22, gap: 0.08 })
  yield* a.until(8)
}

function* sceneMid(a) {
  const g = a.g()
  a.cursorAt(innerWidth * 0.7, innerHeight * 0.45)
  g.bombTimer = 1.2
  g.laserTimer = 3
  a.caption('AUTOMATE.', 1.8)
  yield* a.tapUntil(2.2, { move: 0.2 })
  a.caption('DRONES. BOMBS. LASERS.', 2.6)
  const gold = a.pixels().find((p) => p.slot && p.age > 0.5)
  if (gold) {
    gold.kind = 'golden'
    gold.life = 5
  }
  yield* a.tapUntil(4.8, { move: 0.2, prefer: ['golden', 'blue'] })
  g.state.rainTimer = 0.01
  g.bombTimer = 2.4
  yield* a.tapUntil(5.1, { move: 0.2 })
  a.caption('PIXEL STORMS.', 2.4)
  yield* a.tapUntil(11.8, { move: 0.12, gap: 0.03, prefer: ['golden'] })
  yield* a.until(12)
}

function* sceneLate(a) {
  const g = a.g()
  a.cursorAt(innerWidth * 0.66, innerHeight * 0.5)
  g.rainbowTimer = 0.8
  g.bombTimer = 0.6
  a.caption('CATCH THE RAINBOW.', 1.9)
  // Rainbow pixels are preferred, so the cursor jumps on it as soon as it shows.
  yield* a.tapUntil(4.9, { move: 0.14, gap: 0.03, prefer: ['rainbow'] })
  g.state.nukeCharge = g.stats.nukeKills
  a.caption('AND WHEN IT ALL GETS TOO MUCH...', 2.2)
  yield* a.tapUntil(6.1, { move: 0.22, gap: 0.08 })
  yield* a.waitFor(() => a.find('LAUNCH'), 1)
  const btn = a.find('LAUNCH')
  yield* a.until(6.3)
  if (btn) {
    yield* a.moveTo(a.atEl(btn), 0.7)
    a.mark('nuke')
    a.clickEl(btn)
  }
  yield* a.wait(0.4)
  const rest = { x: innerWidth * 0.8, y: innerHeight * 0.7 }
  yield* a.moveTo(() => rest, 0.8)
  yield* a.until(10.2)
  a.fade(1, 0.8)
  yield* a.until(11)
}

function* sceneEnd(a) {
  a.showCursor(false)
  a.card()
  a.fade(0, 0.5, 1)
  yield* a.until(1)
  a.mark('pixel')
  yield* a.until(7)
}

/** Scenes in order. `state` reloads the page with that save; omit it to continue in the same page. */
const SCENES = [
  { name: 'open', state: 'fresh', run: sceneOpen },
  { name: 'early', state: EARLY, run: sceneEarly },
  { name: 'mid', state: MID, run: sceneMid },
  { name: 'late', state: LATE, run: sceneLate },
  { name: 'end', run: sceneEnd },
]
const POSTER = { scene: 'late', t: 2.9 }

// ------------------------------------------------------------ in-page director

/**
 * Installed into the page after each load. Stops the game's own loop and
 * exposes `T.frame()`, which advances everything by exactly one video frame.
 */
function director(FPS, SITE) {
  const rt = window.op
  rt.stop()
  const g = () => rt.game
  const realTimeout = window.setTimeout.bind(window)
  let frame = 0
  let vt = 0
  let acc = 0
  let lastRev = -1
  let gen = null
  let sceneStart = 0
  const log = []
  const marks = []
  const animStart = new WeakMap()

  // UI timers (notice auto-dismiss etc.) run on the virtual clock too.
  const timers = new Map()
  let nextTimer = 1
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextTimer++
    timers.set(id, { at: vt + (Number(ms) || 0) / 1000, fn: typeof fn === 'function' ? () => fn(...args) : () => {} })
    return id
  }
  window.clearTimeout = (id) => timers.delete(id)

  // ------------------------------------------------------------- overlay
  const layer = document.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden'
  document.body.appendChild(layer)

  const caption = document.createElement('div')
  caption.style.cssText =
    "position:absolute;bottom:10%;text-align:center;font-family:'Press Start 2P',monospace;font-size:24px;line-height:1.6;" +
    'color:#f2f2f2;letter-spacing:0.04em;white-space:pre;text-shadow:4px 4px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000'
  layer.appendChild(caption)

  const card = document.createElement('div')
  card.style.cssText =
    'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background-color:#171717;' +
    'background-image:radial-gradient(rgb(122 122 122 / 0.16) 1px, transparent 1.2px);background-size:8px 8px'
  card.innerHTML = `
    <div data-k="pixel" style="width:28px;height:28px;background:#f2f2f2;box-shadow:0 0 40px rgb(242 242 242 / 0.35)"></div>
    <div data-k="title" style="margin-top:46px;font-family:'Press Start 2P',monospace;font-size:60px;color:#f2f2f2;text-shadow:6px 6px 0 #000;white-space:pre"></div>
    <div data-k="tag" style="margin-top:26px;font-family:VT323,monospace;font-size:42px;color:#bdbdbd">There is one pixel. Click it.</div>
    <div data-k="url" style="margin-top:44px;padding:14px 20px;border:2px solid #ffcc33;font-family:'Press Start 2P',monospace;font-size:18px;color:#ffcc33;box-shadow:4px 4px 0 #0c0c0c">${SITE}</div>
    <div data-k="foot" style="margin-top:20px;font-family:'Press Start 2P',monospace;font-size:9px;letter-spacing:0.2em;color:#7a7a7a">PLAY FREE IN YOUR BROWSER</div>`
  layer.appendChild(card)
  const part = (k) => card.querySelector(`[data-k="${k}"]`)

  const CURSOR = ['1......', '11.....', '121....', '1221...', '12221..', '122221.', '1222111', '1221...', '11.21..', '1..121.', '....11.']
  const cell = 4
  let rects = ''
  CURSOR.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${ch === '1' ? '#0c0c0c' : '#f2f2f2'}"/>`
  }))
  const cursorEl = document.createElement('div')
  cursorEl.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;filter:drop-shadow(0 0 3px rgb(255 255 255 / 0.7)) drop-shadow(4px 4px 0 rgb(0 0 0 / 0.6))'
  cursorEl.innerHTML = `<svg width="${7 * cell}" height="${11 * cell}" shape-rendering="crispEdges">${rects}</svg>`
  const ripple = document.createElement('div')
  ripple.style.cssText = 'position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid #f2f2f2;opacity:0'
  layer.appendChild(ripple)
  layer.appendChild(cursorEl)

  const fadeEl = document.createElement('div')
  fadeEl.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0'
  layer.appendChild(fadeEl)

  const cursor = { x: -100, y: -100, visible: true, press: -1, pressX: 0, pressY: 0 }
  let cap = null
  let fadeT = { from: 0, to: 0, t0: 0, dur: 0 }
  let cardT0 = null

  const canvasRect = () => document.querySelector('canvas').getBoundingClientRect()
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
  const easeOut = (p) => 1 - Math.pow(1 - p, 3)
  const clamp01 = (v) => Math.max(0, Math.min(1, v))

  function drawOverlay() {
    const pressed = vt - cursor.press < 0.1
    cursorEl.style.display = cursor.visible ? 'block' : 'none'
    cursorEl.style.transform = `translate(${cursor.x}px, ${cursor.y}px) scale(${pressed ? 0.82 : 1})`
    const rp = (vt - cursor.press) / 0.28
    ripple.style.opacity = cursor.visible && rp >= 0 && rp < 1 ? String(0.8 * (1 - rp)) : '0'
    ripple.style.transform = `translate(${cursor.pressX}px, ${cursor.pressY}px) scale(${0.3 + rp * 0.9})`

    if (cap) {
      const e = vt - cap.t0
      if (e > cap.dur) {
        cap = null
        caption.textContent = ''
      } else {
        const r = canvasRect()
        caption.style.left = `${r.left}px`
        caption.style.width = `${r.width}px`
        const n = Math.min(cap.text.length, Math.floor(e * 40) + 1)
        caption.innerHTML = `${cap.text.slice(0, n)}<span style="opacity:0">${cap.text.slice(n)}</span>`
        caption.style.opacity = String(clamp01((cap.dur - e) / 0.2))
      }
    }

    const fp = fadeT.dur > 0 ? clamp01((vt - fadeT.t0) / fadeT.dur) : 1
    fadeEl.style.opacity = String(fadeT.from + (fadeT.to - fadeT.from) * fp)

    if (cardT0 !== null) {
      const t = vt - cardT0
      card.style.display = 'flex'
      const pp = clamp01((t - 1) / 0.25)
      const back = 1 + 2.7 * Math.pow(pp - 1, 3) + 1.7 * Math.pow(pp - 1, 2)
      part('pixel').style.opacity = t >= 1 ? '1' : '0'
      part('pixel').style.transform = `scale(${t >= 1 ? back * (1 + 0.05 * Math.sin((t - 1) * 5)) : 0})`
      const title = 'ONEPIXEL'
      const n = t < 1.5 ? 0 : Math.min(title.length, Math.floor((t - 1.5) * 14) + 1)
      part('title').innerHTML = `${title.slice(0, n)}<span style="opacity:0">${title.slice(n)}</span>`
      part('tag').style.opacity = String(clamp01((t - 2.3) / 0.4))
      const u = clamp01((t - 3) / 0.4)
      part('url').style.opacity = String(u)
      part('url').style.transform = `translateY(${(1 - easeOut(u)) * 14}px)`
      part('foot').style.opacity = String(clamp01((t - 3.6) / 0.4))
    }
  }

  // -------------------------------------------------------------- the API
  const a = {
    rt,
    g,
    cursor,
    get t() {
      return vt - sceneStart
    },
    *wait(s) {
      const end = vt + s - 1e-6
      while (vt < end) yield
    },
    *until(t) {
      while (vt - sceneStart < t - 1e-6) yield
    },
    *waitFor(fn, max = 5) {
      const end = vt + max
      while (!fn() && vt < end) yield
    },
    pixels: () => g().pixels.filter((p) => !p.dead),
    at: (p) => () => {
      if (!p || p.dead) return null
      const r = canvasRect()
      const s = rt.renderer.scale
      return { x: r.left + p.x * s, y: r.top + p.y * s }
    },
    atEl: (el) => () => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.6 }
    },
    *moveTo(get, dur) {
      const sx = cursor.x
      const sy = cursor.y
      const t0 = vt
      const ease = dur > 0.4 ? easeInOut : easeOut
      for (;;) {
        const target = get()
        if (!target) return false
        const p = clamp01((vt - t0) / dur)
        cursor.x = sx + (target.x - sx) * ease(p)
        cursor.y = sy + (target.y - sy) * ease(p)
        if (p >= 1) return true
        yield
      }
    },
    click() {
      cursor.press = vt
      cursor.pressX = cursor.x
      cursor.pressY = cursor.y
      const r = canvasRect()
      if (cursor.x >= r.left && cursor.x <= r.right && cursor.y >= r.top && cursor.y <= r.bottom) rt.pointer(cursor.x - r.left, cursor.y - r.top)
    },
    clickEl(el) {
      cursor.press = vt
      cursor.pressX = cursor.x
      cursor.pressY = cursor.y
      el.click()
    },
    pick(prefer = []) {
      const game = g()
      const r = canvasRect()
      const s = rt.renderer.scale
      const live = a.pixels().filter((p) => p.age > 0.2 && p.y > 6 && p.y < game.h - 6)
      for (const kind of prefer) {
        const k = live.filter((p) => p.kind === kind)
        if (k.length) live.splice(0, live.length, ...k)
      }
      let best = null
      let bestD = Infinity
      for (const p of live) {
        const d = Math.hypot(r.left + p.x * s - cursor.x, r.top + p.y * s - cursor.y)
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      return best
    },
    /** Tap pixels like a player for `sec` seconds. */
    *tap(sec, o = {}) {
      const end = vt + sec - 1e-6
      const move = o.move ?? 0.2
      // Never start a move that would run past the end, so scenes stay on time.
      while (vt + move < end) {
        const p = a.pick(o.prefer)
        if (!p) {
          yield
          continue
        }
        if (yield* a.moveTo(a.at(p), move)) a.click()
        yield* a.wait(Math.min(o.gap ?? 0.06, end - vt))
      }
      while (vt < end) yield
    },
    *tapUntil(t, o = {}) {
      yield* a.tap(t - (vt - sceneStart), o)
    },
    find: (text) => [...document.querySelectorAll('button,[role=button]')].find((b) => b.textContent.includes(text)),
    caption(text, dur) {
      cap = { text, dur, t0: vt }
    },
    cursorAt(x, y) {
      cursor.x = x
      cursor.y = y
    },
    showCursor(v) {
      cursor.visible = v
    },
    fade(to, dur, from) {
      const cur = parseFloat(fadeEl.style.opacity) || 0
      fadeT = { from: from ?? cur, to, t0: vt, dur }
    },
    card() {
      cardT0 = vt
    },
    mark(name) {
      marks.push({ name, t: vt })
    },
  }

  const AUDIBLE = new Set(['pop', 'miss', 'blast', 'laser-fire', 'nuke-warn', 'nuke', 'levelup', 'achievement', 'buy', 'denied', 'rain-start', 'rainbow-start'])

  window.T = {
    run(fn) {
      sceneStart = vt
      gen = fn(a)
    },
    async frame() {
      const dt = 1 / FPS
      if (gen && gen.next().done) {
        gen = null
        return 'end'
      }
      const game = g()
      acc += dt
      while (acc >= 1 / 60 - 1e-9) {
        game.tick(1 / 60)
        acc -= 1 / 60
      }
      const events = game.drainEvents()
      if (events.length) {
        rt.renderer.handle(events)
        rt.handleEvents(events)
        const keep = events.filter((e) => AUDIBLE.has(e.type)).map((e) => (e.type === 'pop' ? { type: 'pop', kind: e.kind, crit: e.crit, cause: e.cause, combo: e.combo } : e))
        if (keep.length) log.push([vt, keep])
      }
      rt.renderer.render(dt)
      if (game.revision !== lastRev) {
        lastRev = game.revision
        rt.bump()
      }
      for (const [id, t] of [...timers]) {
        if (t.at <= vt) {
          timers.delete(id)
          t.fn()
        }
      }
      await new Promise((r) => realTimeout(r, 0)) // let React commit
      drawOverlay()
      for (const anim of document.getAnimations()) {
        if (!animStart.has(anim)) animStart.set(anim, vt)
        anim.pause()
        anim.currentTime = Math.max(0, (vt - animStart.get(anim)) * 1000)
      }
      frame++
      vt = frame / FPS
      return 'frame'
    },
    takeLog() {
      const out = { log: log.splice(0), marks: marks.splice(0), vt }
      return out
    },
  }
  // Achievements the seeded save already qualifies for should not toast mid-scene.
  g().checkAchievements()
  g().drainEvents()
  rt.notices = []
  rt.bump()
}

// --------------------------------------------------------------------- music

const NOTE = { A2: 110, F2: 87.31, C3: 130.81, G2: 98, A3: 220, C4: 261.63, E4: 329.63, A4: 440, C5: 523.25, E5: 659.25, F4: 349.23, G4: 392, B4: 493.88, D5: 587.33, G5: 783.99 }

/** A small chiptune score timed to the scene cuts. */
function score(starts, marks) {
  const n = []
  const beat = 0.5
  const stop = marks.nuke ?? starts.end
  // Opening: a lone heartbeat under the single pixel.
  for (let t = 1; t < starts.early - 0.01; t += 1) n.push({ t, type: 'sine', f: 70, f2: 38, dur: 0.3, vol: 0.55 })
  n.push({ t: starts.early - 1, type: 'noise', f: 400, f2: 6000, filter: 'bandpass', dur: 1, vol: 0.18, attack: 0.95 })

  const chords = [
    { root: NOTE.A2, arp: [NOTE.A4, NOTE.C5, NOTE.E5] },
    { root: NOTE.F2, arp: [NOTE.F4, NOTE.A4, NOTE.C5] },
    { root: NOTE.C3, arp: [NOTE.C5, NOTE.E5, NOTE.G5] },
    { root: NOTE.G2, arp: [NOTE.G4, NOTE.B4, NOTE.D5] },
  ]
  const bassPattern = [1, 1, 2, 1, 1, 2, 1, 1.5]
  const arpOrder = [0, 1, 2, 1]
  for (let bar = 0; ; bar++) {
    const bt = starts.early + bar * 4 * beat
    if (bt >= stop) break
    const c = chords[bar % 4]
    const full = bt >= starts.mid - 0.01
    const sparkle = bt >= starts.late - 0.01
    for (let i = 0; i < 8; i++) {
      const t = bt + i * beat * 0.5
      if (t >= stop) break
      n.push({ t, type: 'square', f: c.root * bassPattern[i], dur: 0.2, vol: 0.2 })
      if (i % 2 === 1) n.push({ t, type: 'noise', f: 7000, filter: 'highpass', dur: 0.04, vol: 0.22 })
      if (i % 2 === 0 && (full || i % 4 === 0)) n.push({ t, type: 'sine', f: 150, f2: 42, dur: 0.18, vol: 0.9 })
      if (full && i % 4 === 2) n.push({ t, type: 'noise', f: 1800, filter: 'bandpass', dur: 0.12, vol: 0.55 })
    }
    if (full) {
      for (let i = 0; i < 16; i++) {
        const t = bt + i * beat * 0.25
        if (t >= stop) break
        const f = c.arp[arpOrder[i % 4]] * (sparkle ? 2 : 1)
        n.push({ t, type: 'triangle', f, dur: 0.11, vol: sparkle ? 0.1 : 0.12 })
      }
    }
  }
  // Ending: a pop as the pixel appears, then a held A minor chord.
  if (marks.pixel !== undefined) {
    const t = marks.pixel
    n.push({ t, type: 'square', f: 660, f2: 1320, dur: 0.06, vol: 0.5 })
    for (const f of [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4]) {
      n.push({ t: t + 0.45, type: 'triangle', f, dur: 4.5, vol: 0.14, attack: 0.4 })
      n.push({ t: t + 0.45, type: 'square', f: f / 2, dur: 4.5, vol: 0.03, attack: 0.6 })
    }
  }
  return n
}

/** Runs in the page: renders recorded game events + score to a WAV (base64). */
async function renderAudio(log, notes, duration) {
  const rate = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * rate), rate)
  let cursor = 0
  Object.defineProperty(ctx, 'currentTime', { get: () => cursor, configurable: true })

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 4
  comp.connect(ctx.destination)
  const music = ctx.createGain()
  music.gain.value = 0.35
  music.connect(comp)

  const noise = ctx.createBuffer(1, rate, rate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

  // The game's own Sfx class, pointed at the offline context.
  const sfx = new window.op.sfx.constructor()
  sfx.ctx = ctx
  sfx.master = ctx.createGain()
  sfx.master.gain.value = 0.22
  sfx.master.connect(comp)
  sfx.noiseBuf = noise
  sfx.enabled = true
  for (const [t, events] of log) {
    cursor = t
    sfx.handle(events)
  }

  for (const nt of notes) {
    const g = ctx.createGain()
    const attack = nt.attack ?? 0.003
    g.gain.setValueAtTime(0.0001, nt.t)
    g.gain.linearRampToValueAtTime(nt.vol, nt.t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, nt.t + nt.dur)
    g.connect(music)
    let src
    if (nt.type === 'noise') {
      src = ctx.createBufferSource()
      src.buffer = noise
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = nt.filter
      f.frequency.setValueAtTime(nt.f, nt.t)
      if (nt.f2) f.frequency.exponentialRampToValueAtTime(nt.f2, nt.t + nt.dur)
      src.connect(f).connect(g)
    } else {
      src = ctx.createOscillator()
      src.type = nt.type
      src.frequency.setValueAtTime(nt.f, nt.t)
      if (nt.f2) src.frequency.exponentialRampToValueAtTime(nt.f2, nt.t + nt.dur)
      src.connect(g)
    }
    src.start(nt.t)
    src.stop(nt.t + nt.dur + 0.05)
  }

  const buf = await ctx.startRendering()
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  let peak = 0
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  const gain = peak > 0 ? 0.89 / peak : 1
  const bytes = new Uint8Array(44 + L.length * 4)
  const v = new DataView(bytes.buffer)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + L.length * 4, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 2, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 4, true)
  v.setUint16(32, 4, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, L.length * 4, true)
  for (let i = 0, o = 44; i < L.length; i++, o += 4) {
    v.setInt16(o, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true)
    v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true)
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// ------------------------------------------------------------- CDP plumbing

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForJson(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      /* not up yet */
    }
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class Page {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
    return res.result.value
  }

  /** Load the game with a given save (or a fresh game) and install the director. */
  async load(state) {
    await this.send('Page.navigate', { url: URL })
    await this.eval(`for (let i = 0; i < 100 && !window.op; i++) await new Promise(r => setTimeout(r, 50)); return true`)
    await this.eval(`window.op.stop(); localStorage.clear(); ${state !== 'fresh' ? `localStorage.setItem('onepixel.save', ${JSON.stringify(saveFile(state))});` : ''} return true`)
    await this.send('Page.navigate', { url: URL })
    await this.eval(`for (let i = 0; i < 100 && !window.op; i++) await new Promise(r => setTimeout(r, 50)); await document.fonts.ready; return true`)
    await sleep(500)
    await this.eval(`(${director.toString()})(${FPS}, ${JSON.stringify(SITE)}); return true`)
  }

  async capture(format = 'jpeg') {
    const params = format === 'jpeg' ? { format, quality: 92, optimizeForSpeed: true } : { format }
    const { data } = await this.send('Page.captureScreenshot', params)
    return Buffer.from(data, 'base64')
  }
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))))
    if (input) input(p.stdin)
  })
}

// ----------------------------------------------------------------------- main

async function main() {
  const browserPath = BROWSERS.find((p) => existsSync(p))
  if (!browserPath) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')
  try {
    await fetch(URL)
  } catch {
    throw new Error(`Dev server not reachable at ${URL}. Run "npm run dev" first (or set ONEPIXEL_URL).`)
  }
  mkdirSync(OUT, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'onepixel-trailer-'))
  const videoOnly = join(work, 'video.mp4')
  const audioWav = join(work, 'audio.wav')

  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(work, 'profile')}`,
    '--hide-scrollbars',
    '--mute-audio',
    `--window-size=${VIEW.width},${VIEW.height}`,
    'about:blank',
  ])

  // Frames stream straight into ffmpeg; nothing is written per frame.
  let ffIn
  const encoded = run(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), videoOnly],
    (stdin) => (ffIn = stdin),
  )
  const writeFrame = (buf) => new Promise((resolve) => (ffIn.write(buf) ? resolve() : ffIn.once('drain', resolve)))

  try {
    const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`)
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    const page = new Page(ws)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Emulation.setDeviceMetricsOverride', VIEW)

    let frames = 0
    const starts = {}
    const marks = {}
    const log = []
    for (const scene of SCENES) {
      if (scene.state) await page.load(scene.state)
      const start = frames / FPS
      starts[scene.name] = start
      // The page clock keeps running across same-page scenes; convert its times to video time.
      const { vt: pageStart } = await page.eval('return T.takeLog()')
      await page.eval(`T.run(${scene.run.toString()}); return true`)
      process.stdout.write(`${scene.name} `)
      for (;;) {
        const res = await page.send('Runtime.evaluate', { expression: 'T.frame()', awaitPromise: true, returnByValue: true })
        if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
        if (res.result.value === 'end') break
        const buf = await page.capture()
        await writeFrame(buf)
        frames++
        if (POSTER.scene === scene.name && Math.abs(frames / FPS - start - POSTER.t) < 0.5 / FPS) {
          writeFileSync(join(OUT, 'poster.png'), await page.capture('png'))
        }
      }
      const taken = await page.eval('return T.takeLog()')
      for (const [t, events] of taken.log) log.push([t - pageStart + start, events])
      for (const m of taken.marks) marks[m.name] = m.t - pageStart + start
      console.log(`${((frames / FPS) - start).toFixed(1)}s`)
    }
    ffIn.end()
    await encoded

    const duration = frames / FPS
    console.log(`rendering audio (${duration.toFixed(1)}s)`)
    const wav = await page.eval(`return await (${renderAudio.toString()})(${JSON.stringify(log)}, ${JSON.stringify(score(starts, marks))}, ${duration})`)
    writeFileSync(audioWav, Buffer.from(wav, 'base64'))
    ws.close()

    const out = join(OUT, 'onepixel-trailer.mp4')
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoOnly, '-i', audioWav, '-c:v', 'copy', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out])
    console.log(`saved ${out} (${frames} frames, ${duration.toFixed(1)}s)`)
    console.log(`working files left in ${work}`)
  } finally {
    browser.kill()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
