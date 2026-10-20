// Renders the itch.io page art into docs/itch: gameplay screenshots, the cover
// image, the page banner and the theme backgrounds.
//
//   npm run dev            (in another terminal)
//   npm run itch-art                  (everything)
//   npm run itch-art -- boss cover    (just the named shots)
//
// Gameplay shots seed a save, let the real game run and wait for the moment,
// like scripts/screenshots.mjs. The cover and banner are pages in
// scripts/itch-art/, served by the dev server so they can use the game's own
// fonts, palette and dot-matrix field.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sleep, withBrowser } from './cdp.mjs'

const URL = process.env.ONEPIXEL_URL ?? 'http://localhost:5173/'
const OUT = join(import.meta.dirname, '..', 'docs', 'itch')
const ONLY = process.argv.slice(2)

const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false }

// ------------------------------------------------------------------ save data

const ALL_UPGRADES = [
  'respawn', 'value', 'multi', 'critChance', 'critPower', 'blue', 'combo', 'xp', 'blast', 'auto', 'golden', 'chain',
  'bomb', 'rain', 'laser', 'nukeCharge', 'nukeYield', 'swarm', 'cluster', 'twin', 'goldRain', 'rainbow', 'overclock', 'pierce',
]

// Every achievement up to the bosses, so no unlock toasts pop up mid-shot.
const ACHIEVEMENTS = [
  'first', 'shop', 'k100', 'k1k', 'k10k', 'clicks', 'crit', 'combo10', 'combo30', 'crowd', 'drone', 'multi', 'blue',
  'gold', 'gold25', 'chain', 'bomb', 'storm', 'laser', 'nuke', 'rich', 'lvl10', 'lvl15', 'lvl20', 'boss', 'boss5',
]

const MID = {
  pixels: 2.4e6,
  totalPixels: 4.1e7,
  xp: 30000,
  level: 13,
  upgrades: {
    respawn: 10, value: 18, multi: 10, critChance: 8, critPower: 6, blue: 4, combo: 5, xp: 8,
    blast: 6, auto: 7, golden: 5, chain: 5, bomb: 5, rain: 3, laser: 4, nukeCharge: 2, nukeYield: 2, swarm: 1,
  },
  achievements: ACHIEVEMENTS,
  seenUpgrades: ALL_UPGRADES.slice(0, 18),
  stats: { kills: 6400, clicks: 2100, manualKills: 1900, crits: 900, goldenKills: 40, blueKills: 60, droneKills: 2500, maxCombo: 24, mostOnScreen: 14 },
  nukeCharge: 120,
  rainTimer: 40,
  bossTimer: 9999,
  reveal: { hud: true, panel: true },
}

const LATE = {
  pixels: 6.2e10,
  totalPixels: 9.4e11,
  xp: 1.1e6,
  level: 21,
  upgrades: {
    respawn: 13, value: 34, multi: 16, critChance: 11, critPower: 13, blue: 7, combo: 10, xp: 14,
    blast: 11, auto: 13, golden: 9, chain: 8, bomb: 11, rain: 9, laser: 11, nukeCharge: 6, nukeYield: 9,
    swarm: 1, cluster: 1, twin: 1, goldRain: 1, rainbow: 3, overclock: 1, pierce: 4,
  },
  achievements: ACHIEVEMENTS,
  seenUpgrades: ALL_UPGRADES,
  stats: { kills: 210000, clicks: 9100, manualKills: 8200, crits: 30000, goldenKills: 400, blueKills: 600, droneKills: 90000, maxCombo: 40, mostOnScreen: 24, bossKills: 2 },
  nukeCharge: 60,
  rainTimer: 60,
  bossTimer: 9999,
  reveal: { hud: true, panel: true },
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

/** Poll `cond` (a JS expression) every frame for up to `ms`. */
const UNTIL = (cond, ms = 4000) => `
  const end = performance.now() + ${ms}
  while (performance.now() < end) {
    if (${cond}) return true
    await new Promise(r => setTimeout(r, 16))
  }
  return false`

/** Keep firing lasers until one fires near the middle of the arena, so the beam crosses the shot. */
const LASER_THROUGH_MIDDLE = `
  for (let tries = 0; tries < 12; tries++) {
    const g = op.game
    g.laserTimer = 0.01
    ${UNTIL(`op.game.lasers.some(l => l.phase === 'fire')`).replace('return true', 'break').replace('return false', '')}
    const l = g.lasers.find(l => l.phase === 'fire')
    if (l && Math.abs((l.x1 + l.x2) / 2 - g.w / 2) < g.w * 0.2 && Math.abs((l.y1 + l.y2) / 2 - g.h / 2) < g.h * 0.2) return true
    await new Promise(r => setTimeout(r, 400))
  }
  return false`

const SHOTS = {
  /** The very first screen: one pixel and the hand-drawn hint. */
  async 'first-pixel'(page) {
    await page.load(null)
    await sleep(2600)
  },

  /** Mid game: drones and scenery, caught as a laser fires. */
  async lasers(page) {
    await page.load(MID)
    await sleep(5000)
    await page.eval(`op.game.bombTimer = 0.01; return true`)
    await page.eval(LASER_THROUGH_MIDDLE)
    await sleep(40)
  },

  /** Late game rainbow mode with twin lasers. */
  async rainbow(page) {
    await page.load(LATE)
    await sleep(4000)
    await page.eval(`op.game.startRainbow(); return true`)
    await page.eval(PLAY(1800))
    await page.eval(LASER_THROUGH_MIDDLE)
    await sleep(30)
  },

  /** A regular boss, mid-fight, with drones and bombs on it. */
  async boss(page) {
    await page.load(LATE)
    await sleep(3000)
    await page.eval(`op.game.spawnBoss(); ${UNTIL(`op.game.boss && op.game.boss.phase === 'fight'`)}`)
    await page.eval(PLAY(2500))
    await page.eval(`op.game.bombTimer = 0.01; ${UNTIL(`op.game.bombs.length && op.game.bombs[0].fuse < 0.05`)}`)
    await sleep(60)
  },

  /** PIXEL ZERO, the final boss. */
  async 'pixel-zero'(page) {
    await page.load({ ...LATE, stats: { ...LATE.stats, bossKills: 5 } })
    await sleep(2000)
    // Centre it in the arena and hold the lasers so it is just the player, the drones and the boss.
    await page.eval(`const g = op.game, b = g.spawnBoss(); b.x = g.w * 0.5; b.y = g.h * 0.55; g.laserTimer = 99; g.bombTimer = 99; ${UNTIL(`op.game.boss && op.game.boss.phase === 'fight'`, 8000)}`)
    // Wait out the arrival caption, which sits on the middle of the screen.
    await sleep(2600)
  },

  /** The nuke going off. */
  async nuke(page) {
    await page.load(MID)
    await sleep(5000)
    await page.eval(`op.game.state.nukeCharge = op.game.stats.nukeKills; op.launchNuke(); return true`)
    await page.eval(`for (let i = 0; i < 200 && op.game.nuke; i++) await new Promise(r => setTimeout(r, 8)); return true`)
    await sleep(520)
  },
}

/** Designed pieces rendered from scripts/itch-art/*.html at their final size. */
const PAGES = {
  cover: { width: 630, height: 500 },
  banner: { width: 960, height: 240 },
  // Theme backgrounds are shown at their pixel size, so they render at 1x.
  'page-bg': { width: 200, height: 200, deviceScaleFactor: 1 },
  'embed-bg': { width: 960, height: 600, deviceScaleFactor: 1 },
}

async function run(page) {
  for (const [name, scene] of Object.entries(SHOTS)) {
    if (ONLY.length && !ONLY.includes(name)) continue
    await page.viewport(DESKTOP)
    await scene(page)
    await page.shoot(join(OUT, `${name}.png`))
  }
  for (const [name, size] of Object.entries(PAGES)) {
    if (ONLY.length && !ONLY.includes(name)) continue
    await page.viewport({ deviceScaleFactor: 2, ...size, mobile: false })
    await page.send('Page.navigate', { url: new globalThis.URL(`scripts/itch-art/${name}.html`, URL).href })
    await page.eval(`for (let i = 0; i < 200 && !window.artReady; i++) await new Promise(r => setTimeout(r, 50)); return true`)
    await page.shoot(join(OUT, `${name}.png`))
  }
}

mkdirSync(OUT, { recursive: true })
withBrowser(URL, run).catch((err) => {
  console.error(err)
  process.exit(1)
})
