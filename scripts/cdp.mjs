// Shared headless Chrome/Edge plumbing for the capture scripts (screenshots,
// itch.io art). Talks to the browser over the DevTools protocol, so there are
// no extra dependencies.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const PORT = 9333

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

/** A save file in the shape the game writes to localStorage. */
export function saveFile(state) {
  const now = Date.now()
  return JSON.stringify({ v: 1, savedAt: now, maxSeenAt: now, state })
}

export class Page {
  constructor(ws, url) {
    this.ws = ws
    this.url = url
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
    await this.send('Page.navigate', { url: this.url })
    await this.eval(`for (let i = 0; i < 100 && !window.op; i++) await new Promise(r => setTimeout(r, 50)); return true`)
    await this.eval(`window.op.stop(); localStorage.clear(); ${state ? `localStorage.setItem('onepixel.save', ${JSON.stringify(saveFile(state))});` : ''} return true`)
    // Navigate again: the runtime saves on pagehide, so reload via navigate after stopping.
    await this.send('Page.navigate', { url: this.url })
    await this.eval(`for (let i = 0; i < 100 && !window.op; i++) await new Promise(r => setTimeout(r, 50)); await document.fonts.ready; return true`)
    await sleep(400)
  }

  /** Save a PNG of the viewport (or a clip of it) to `path`. */
  async shoot(path, clip) {
    const params = { format: 'png', captureBeyondViewport: false }
    if (clip) params.clip = { ...clip, scale: clip.scale ?? 1 }
    const { data } = await this.send('Page.captureScreenshot', params)
    writeFileSync(path, Buffer.from(data, 'base64'))
    console.log(`  saved ${path}`)
  }
}

/** Check the dev server is up, launch a headless browser, and hand `fn` a Page pointed at `url`. */
export async function withBrowser(url, fn) {
  try {
    await fetch(url)
  } catch {
    throw new Error(`Dev server not reachable at ${url}. Run "npm run dev" first.`)
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
    const page = new Page(ws, url)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await fn(page)
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
