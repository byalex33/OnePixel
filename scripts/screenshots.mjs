// Regenerates the README screenshots in docs/screenshots.
//
//   npm run dev            (in another terminal)
//   npm run screenshots
//
// Drives a headless Chrome/Edge over the DevTools protocol with no extra
// dependencies: it seeds save states into localStorage, lets the real game run,
// waits for the interesting moment, and captures PNGs. Uses the dev-only
// `window.op` runtime handle, so it must point at the Vite dev server.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sleep, withBrowser } from './cdp.mjs'

const URL = process.env.ONEPIXEL_URL ?? 'http://localhost:5179/'
const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots')

const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }

// ------------------------------------------------------------------ save data

const ALL_SEEN = ['respawn', 'value', 'multi', 'critChance', 'critPower', 'blue', 'combo', 'xp', 'blast', 'auto', 'golden', 'chain', 'bomb', 'rain', 'laser', 'nukeCharge', 'nukeYield', 'swarm']

const EARLY = {
  pixels: 420,
  totalPixels: 900,
  xp: 30,
  level: 4,
  upgrades: { respawn: 3, value: 3, multi: 3, critChance: 1 },
  achievements: ['first', 'shop', 'crit'],
  seenUpgrades: ['respawn', 'value', 'multi', 'critChance'],
  stats: { kills: 120, clicks: 130, manualKills: 120, crits: 4, mostOnScreen: 4 },
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
  achievements: ['first', 'shop', 'k100', 'k1k', 'clicks', 'crit', 'combo10', 'crowd', 'drone', 'multi', 'blue', 'gold', 'chain', 'bomb', 'laser', 'lvl10'],
  seenUpgrades: ALL_SEEN,
  stats: { kills: 6400, clicks: 2100, manualKills: 1900, crits: 900, goldenKills: 40, blueKills: 60, droneKills: 2500, maxCombo: 24, mostOnScreen: 14 },
  nukeCharge: 120,
  rainTimer: 40,
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

async function scenes(page) {
  console.log('desktop')
  await page.viewport(DESKTOP)

  // 1. The very first screen: one pixel and the hand-drawn hint.
  await page.load(null)
  await sleep(2600)
  await page.shoot(join(OUT, 'first-pixel.png'))

  // 2. Early game: shop open, a few pixels, combo going.
  await page.load(EARLY)
  await page.eval(PLAY(3500))
  await page.shoot(join(OUT, 'early-game.png'))

  // 3. Mid game: drones, scenery, then catch a bomb going off.
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
  await page.shoot(join(OUT, 'mid-game.png'))

  // 4. A level-up.
  await page.eval(`const g = op.game; g.grant(0, 70000); return true`)
  await sleep(650)
  await page.shoot(join(OUT, 'level-up.png'))
  await sleep(3500)

  // 5. The nuke: warning, then detonation.
  await page.eval(`op.game.state.nukeCharge = op.game.stats.nukeKills; op.launchNuke(); return true`)
  await page.eval(`
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 16))
      if (op.game.nuke && op.game.nuke.t < 0.8 && Math.floor(op.renderer.time * 8) % 2 === 0) return true
    }
    return false`)
  await page.shoot(join(OUT, 'nuke-warning.png'))
  await page.eval(`for (let i = 0; i < 200 && op.game.nuke; i++) await new Promise(r => setTimeout(r, 8)); return true`)
  await sleep(520)
  await page.shoot(join(OUT, 'nuke.png'))

  console.log('mobile')
  await page.viewport(MOBILE)
  await page.load(MID)
  await sleep(4500)
  await page.eval(`op.game.bombTimer = 0.01; for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 16)); if (op.game.bombs.length && op.game.bombs[0].fuse < 0.05) return true } return false`)
  await sleep(60)
  await page.shoot(join(OUT, 'mobile.png'))
}

// ----------------------------------------------------------------------- main

async function main() {
  mkdirSync(OUT, { recursive: true })
  await withBrowser(URL, scenes)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
