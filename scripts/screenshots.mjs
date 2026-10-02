// Regenerates the README screenshots in docs/screenshots.
//
//   npm run dev            (in another terminal)
//   npm run screenshots
//
// Drives a headless Chrome/Edge over the DevTools protocol with no extra
// dependencies: it seeds save states into localStorage, lets the real game run,
// waits for the interesting moment, and captures PNGs. Uses the dev-only
// `window.op` runtime handle, so it must point at the Vite dev server.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.ONEPIXEL_URL ?? 'http://localhost:5179/'
const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots')
const PORT = 9333

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }

// ------------------------------------------------------------------ save data

const ALL_SEEN = ['respawn', 'value', 'multi', 'critChance', 'critPower', 'fox', 'combo', 'xp', 'blast', 'auto', 'golden', 'chain', 'bomb', 'rain', 'laser', 'nukeCharge', 'nukeYield', 'swarm']

function saveFile(state) {
  const now = Date.now()
  return JSON.stringify({ v: 1, savedAt: now, maxSeenAt: now, state })
}

const EARLY = {
  pixels: 420,
  totalPixels: 900,
  xp: 30,
  level: 4,
  upgrades: { respawn: 3, value: 3, multi: 3, critChance: 1, fox: 1 },
  achievements: ['first', 'shop', 'crit'],
  seenUpgrades: ['respawn', 'value', 'multi', 'critChance', 'fox'],
  stats: { kills: 120, clicks: 130, manualKills: 120, crits: 4, mostOnScreen: 4 },
  reveal: { hud: true, panel: true },
}

const MID = {
  pixels: 2.4e6,
  totalPixels: 4.1e7,
  xp: 30000,
  level: 13,
  upgrades: {
    respawn: 10, value: 18, multi: 10, critChance: 8, critPower: 6, fox: 4, combo: 5, xp: 8,
    blast: 6, auto: 7, golden: 5, chain: 5, bomb: 5, rain: 3, laser: 4, nukeCharge: 2, nukeYield: 2, swarm: 1,
  },
  achievements: ['first', 'shop', 'k100', 'k1k', 'clicks', 'crit', 'combo10', 'crowd', 'drone', 'multi', 'fox', 'gold', 'chain', 'bomb', 'laser', 'lvl10'],
  seenUpgrades: ALL_SEEN,
  stats: { kills: 6400, clicks: 2100, manualKills: 1900, crits: 900, goldenKills: 40, droneKills: 2500, foxKills: 300, maxCombo: 24, mostOnScreen: 14 },
  nukeCharge: 120,
  rainTimer: 40,
  reveal: { hud: true, panel: true },
}

// ------------------------------------------------------------- CDP plumbing

function findBrowser() {
  const path = BROWSERS.find((p) => existsSync(p))
  if (!path) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')
  return path
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

  async viewport(v) {
    await this.send('Emulation.setDeviceMetricsOverride', v)
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: v.mobile })
  }

  /** Load the game with a given save (or a fresh game) and wait for the runtime. */
  async load(state) {
    await this.send('Page.navigate', { url: URL })
    await this.eval(`for (let i = 0; i < 100 && !window.op; i++) await new Promise(r => setTimeout(r, 50)); return true`)
    await this.eval(`window.op.stop(); localStorage.clear(); ${state ? `localStorage.setItem('onepixel.save', ${JSON.stringify(saveFile(state))});` : ''} return true`)
    // Navigate again: the runtime saves on pagehide, so reload via navigate after stopping.
    await this.send('Page.navigate', { url: URL })
    await this.eval(`for (let i = 0; i < 100 && !window.op; i++) await new Promise(r => setTimeout(r, 50)); await document.fonts.ready; return true`)
    await sleep(400)
  }

  async shoot(name, clip) {
    const params = { format: 'png', captureBeyondViewport: false }
    if (clip) params.clip = { ...clip, scale: clip.scale ?? 1 }
    const { data } = await this.send('Page.captureScreenshot', params)
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`  saved ${name}.png`)
  }
}

// --------------------------------------------------------------------- scenes

/** Tap whichever pixels are on screen for a while, like a player would. */
const PLAY = (ms) => `
  const end = performance.now() + ${ms}
  while (performance.now() < end) {
    const g = op.game, s = op.renderer.scale
    const p = g.pixels.find(p => !p.dead && p.age > 0.15 && p.y > 0)
    if (p) op.pointer(p.x * s, p.y * s)
    await new Promise(r => setTimeout(r, 140))
  }
  return true`

async function scenes(page) {
  console.log('desktop')
  await page.viewport(DESKTOP)

  // 1. The very first screen: one pixel and the hand-drawn hint.
  await page.load(null)
  await sleep(2600)
  await page.shoot('first-pixel')

  // 2. Early game: shop open, a few pixels, combo going.
  await page.load(EARLY)
  await page.eval(PLAY(3500))
  await page.shoot('early-game')

  // 3. Mid game: drones, fox, scenery, then catch a bomb going off.
  await page.load(MID)
  await sleep(5000)
  await page.eval(`
    op.game.bombTimer = 0.01
    op.game.laserTimer = 0.75
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 16))
      if (op.game.lasers.some(l => l.phase === 'fire')) return true
    }
    return false`)
  await sleep(40)
  await page.shoot('mid-game')

  // 4. The levels tab, with upcoming unlocks hidden behind ???.
  await page.eval(`document.querySelectorAll('[role=tab]')[1].click(); return true`)
  await sleep(300)
  await page.shoot('levels-tab', { x: 0, y: 0, width: 348, height: 800 })
  await page.eval(`document.querySelectorAll('[role=tab]')[0].click(); return true`)

  // 5. A level-up.
  await page.eval(`const g = op.game; g.grant(0, 70000); return true`)
  await sleep(650)
  await page.shoot('level-up')
  await sleep(3500)

  // 6. The fox mid-leap, then the catch with its little heart.
  await page.eval(`
    const g = op.game, f = g.fox
    for (let i = 0; i < 400 && f.phase !== 'sit' && f.phase !== 'walk'; i++) await new Promise(r => setTimeout(r, 16))
    g.pixels.push({ id: 999999, x: f.x + 28, y: f.groundY - 32, vy: 0, kind: 'golden', slot: false, age: 1, life: 99, dead: false })
    f.cooldown = 0
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 8))
      if (f.phase === 'out' && f.t > f.dur * 0.55) break
    }
    return true`)
  const foxClip = await page.eval(`
    const f = op.game.fox, s = op.renderer.scale, main = document.querySelector('main').getBoundingClientRect()
    return { x: Math.max(0, Math.min(innerWidth - 340, main.left + f.x * s - 170)), y: Math.max(0, main.top + f.groundY * s - 210), width: 340, height: 240 }`)
  if (process.env.DEBUG_SHOTS) console.log('  fox clip', foxClip, await page.eval(`const f = op.game.fox; return { x: f.x, y: f.y, g: f.groundY, phase: f.phase, s: op.renderer.scale }`))
  await page.shoot('fox-leap', { ...foxClip, scale: 2 })

  // 7. The nuke: warning, then detonation.
  await page.eval(`op.game.state.nukeCharge = op.game.stats.nukeKills; op.launchNuke(); return true`)
  await page.eval(`
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 16))
      if (op.game.nuke && op.game.nuke.t < 0.8 && Math.floor(op.renderer.time * 8) % 2 === 0) return true
    }
    return false`)
  await page.shoot('nuke-warning')
  await page.eval(`for (let i = 0; i < 200 && op.game.nuke; i++) await new Promise(r => setTimeout(r, 8)); return true`)
  await sleep(520)
  await page.shoot('nuke')

  console.log('mobile')
  await page.viewport(MOBILE)
  await page.load(MID)
  await sleep(4500)
  await page.eval(`op.game.bombTimer = 0.01; for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 16)); if (op.game.bombs.length && op.game.bombs[0].fuse < 0.05) return true } return false`)
  await sleep(60)
  await page.shoot('mobile')
}

// ----------------------------------------------------------------------- main

async function main() {
  mkdirSync(OUT, { recursive: true })
  try {
    await fetch(URL)
  } catch {
    throw new Error(`Dev server not reachable at ${URL}. Run "npm run dev" first.`)
  }
  const profile = mkdtempSync(join(tmpdir(), 'onepixel-shots-'))
  const browser = spawn(findBrowser(), [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
    'about:blank',
  ])
  try {
    const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`)
    const target = targets.find((t) => t.type === 'page')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    const page = new Page(ws)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await scenes(page)
    ws.close()
  } finally {
    browser.kill()
    await sleep(300)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      /* the browser may still hold a lock on Windows */
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
