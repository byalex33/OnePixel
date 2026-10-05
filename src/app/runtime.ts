import { Music } from '../audio/music'
import { Sfx } from '../audio/sfx'
import { AUTOSAVE_SECONDS, DT, MIN_OFFLINE_SECONDS, MAX_OFFLINE_SECONDS } from '../game/config'
import { Game, type Rect } from '../game/game'
import { offlineGains, offlineSeconds, type OfflineGains } from '../game/offline'
import { exportSave, importSave, loadFrom, makeSaveFile, writeTo, type KeyValueStore } from '../game/save'
import { SAVE_KEY } from '../game/config'
import type { GameEvent, Settings, UpgradeId } from '../game/types'
import { Renderer } from '../render/renderer'

export type Notice =
  | { id: number; kind: 'levelup'; level: number }
  | { id: number; kind: 'achievement'; achId: string }
  | { id: number; kind: 'offline'; gains: OfflineGains; levels: number }

const MAX_STEPS_PER_FRAME = 15
const UI_INTERVAL = 0.1
// Events browsers accept as a user gesture for starting audio (pointerdown only counts for mice).
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const

function safeStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage
    const k = '__onepixel_probe'
    s.setItem(k, '1')
    s.removeItem(k)
    return s
  } catch {
    return null
  }
}

/**
 * Owns the simulation and everything around it that isn't React: the fixed
 * timestep loop, rendering, audio, haptics, autosave and offline progress.
 * React subscribes to a version counter and reads state directly.
 */
export class Runtime {
  game: Game
  readonly sfx = new Sfx()
  readonly music = new Music()
  renderer: Renderer | null = null
  notices: Notice[] = []

  private listeners = new Set<() => void>()
  private version = 0
  private raf = 0
  private last = 0
  private acc = 0
  private uiTimer = 0
  private saveTimer = 0
  private seenRevision = -1
  private maxSeenAt = 0
  private hiddenAt: number | null = null
  private noticeId = 1
  private lastBuzz = 0
  private store = safeStorage()
  private reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor() {
    const file = this.store ? loadFrom(this.store) : null
    this.game = new Game(file?.state)
    if (file) {
      this.maxSeenAt = file.maxSeenAt
      const secs = offlineSeconds(Date.now(), file.savedAt, file.maxSeenAt)
      if (secs >= MIN_OFFLINE_SECONDS) this.applyOffline(secs)
    }
    this.applySettings()
  }

  // ---------------------------------------------------------- subscriptions

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = (): number => this.version

  private bump(): void {
    this.version++
    this.seenRevision = this.game.revision
    for (const l of this.listeners) l()
  }

  // ------------------------------------------------------------- lifecycle

  attachCanvas(canvas: HTMLCanvasElement): Renderer {
    const lowFx = matchMedia('(pointer: coarse)').matches || window.innerWidth < 700
    this.renderer = new Renderer(canvas, this.game, lowFx)
    this.applySettings()
    return this.renderer
  }

  detachCanvas(): void {
    this.renderer = null
  }

  start(): void {
    if (this.raf) return
    this.last = performance.now()
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('pagehide', this.onPageHide)
    for (const e of GESTURES) window.addEventListener(e, this.unlockAudio, { capture: true, passive: true })
    this.raf = requestAnimationFrame(this.frame)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('pagehide', this.onPageHide)
    for (const e of GESTURES) window.removeEventListener(e, this.unlockAudio, { capture: true })
  }

  private onPageHide = () => this.save()

  private onVisibility = () => {
    this.music.setPaused(document.hidden)
    if (document.hidden) {
      this.hiddenAt = performance.now()
      this.save()
      return
    }
    if (this.hiddenAt !== null) {
      // performance.now() is monotonic, so changing the system clock while
      // the tab is in the background cannot inflate this.
      const gap = (performance.now() - this.hiddenAt) / 1000
      this.hiddenAt = null
      if (gap >= MIN_OFFLINE_SECONDS) this.applyOffline(Math.min(gap, MAX_OFFLINE_SECONDS))
    }
    this.last = performance.now()
    this.acc = 0
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000))
    this.last = now

    this.acc += dt
    let steps = 0
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      this.game.tick(DT)
      this.acc -= DT
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0

    const events = this.game.drainEvents()
    if (events.length) {
      this.renderer?.handle(events)
      this.sfx.handle(events)
      this.handleEvents(events)
    }
    this.renderer?.render(dt)

    this.uiTimer += dt
    if (this.uiTimer >= UI_INTERVAL) {
      this.uiTimer = 0
      if (this.game.revision !== this.seenRevision) this.bump()
    }
    this.saveTimer += dt
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0
      this.save()
    }
  }

  private handleEvents(events: GameEvent[]): void {
    let urgent = false
    for (const e of events) {
      switch (e.type) {
        case 'levelup':
          this.notices = [...this.notices, { id: this.noticeId++, kind: 'levelup', level: e.level }]
          this.buzz([20, 40, 30])
          urgent = true
          break
        case 'achievement':
          this.notices = [...this.notices, { id: this.noticeId++, kind: 'achievement', achId: e.id }]
          urgent = true
          break
        case 'buy':
        case 'nuke-warn':
        case 'rain-start':
        case 'rain-end':
        case 'rainbow-end':
          urgent = true
          break
        case 'rainbow-start':
          this.buzz([15, 30, 15, 30, 15])
          urgent = true
          break
        case 'nuke':
          this.buzz([80, 40, 160])
          urgent = true
          break
        case 'boss-rise':
          this.buzz([60, 40, 60, 40, 120])
          urgent = true
          break
        case 'boss-defeat':
          this.buzz([40, 30, 40, 30, 200])
          urgent = true
          break
        case 'boss-enrage':
          this.buzz([30, 20, 30])
          urgent = true
          break
        case 'boss-escape':
          urgent = true
          break
        case 'blast':
          if (e.cause === 'bomb') this.buzz(25)
          break
        case 'pop':
          if (e.crit || e.kind === 'golden' || e.kind === 'rainbow') this.buzz(12)
          break
      }
    }
    if (events.some(isSaveWorthy)) this.save()
    if (urgent) this.bump()
  }

  private buzz(pattern: number | number[]): void {
    if (!this.game.state.settings.haptics || typeof navigator.vibrate !== 'function') return
    // Browsers reject vibration before the first user gesture.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
    const now = performance.now()
    if (now - this.lastBuzz < 90) return
    this.lastBuzz = now
    try {
      navigator.vibrate(pattern)
    } catch {
      /* some browsers throw without user activation */
    }
  }

  private applyOffline(seconds: number): void {
    const before = this.game.state.level
    const gains = offlineGains(this.game.state, seconds)
    if (gains.kills <= 0) return
    this.game.grant(gains.pixels, gains.xp)
    this.game.drainEvents() // level-ups are summarised in the modal instead
    this.notices = [...this.notices, { id: this.noticeId++, kind: 'offline', gains, levels: this.game.state.level - before }]
    this.bump()
  }

  // ---------------------------------------------------------------- actions

  /** Any gesture on the page starts (or resumes) audio, not just taps on the arena. */
  private unlockAudio = (): void => {
    this.sfx.unlock()
    this.music.attach(this.sfx.context)
  }

  pointer(cssX: number, cssY: number): void {
    if (!this.renderer) return
    const { x, y } = this.renderer.toWorld(cssX, cssY)
    this.game.pointerDown(x, y)
  }

  buy(id: UpgradeId): boolean {
    const ok = this.game.buy(id)
    this.bump()
    return ok
  }

  buyMax(id: UpgradeId): number {
    const n = this.game.buyMax(id)
    this.bump()
    return n
  }

  launchNuke(): void {
    if (this.game.launchNuke()) this.bump()
  }

  setExclusions(rects: Rect[]): void {
    this.game.setExclusions(rects)
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.game.state.settings[key] = value
    this.applySettings()
    this.save()
    this.bump()
  }

  private applySettings(): void {
    const s = this.game.state.settings
    this.sfx.enabled = s.sound
    this.music.setEnabled(s.music)
    if (this.renderer) {
      this.renderer.shakeEnabled = s.shake
      this.renderer.reducedMotion = this.reducedMotion
    }
  }

  dismissNotice(id: number): void {
    this.notices = this.notices.filter((n) => n.id !== id)
    this.bump()
  }

  // ------------------------------------------------------------------ saves

  save(): boolean {
    const file = makeSaveFile(this.game.state, Date.now(), this.maxSeenAt)
    this.maxSeenAt = file.maxSeenAt
    return this.store ? writeTo(this.store, file) : false
  }

  get canPersist(): boolean {
    return this.store !== null
  }

  exportCode(): string {
    this.save()
    return exportSave(makeSaveFile(this.game.state, Date.now(), this.maxSeenAt))
  }

  /** Throws SaveError on bad input. Imported timestamps are ignored. */
  importCode(text: string): void {
    const file = importSave(text)
    this.replaceGame(new Game(file.state))
    this.save()
  }

  reset(): void {
    try {
      this.store?.removeItem(SAVE_KEY)
    } catch {
      /* ignore */
    }
    this.replaceGame(new Game())
    this.save()
  }

  private replaceGame(game: Game): void {
    const exclusions = this.game.exclusions
    this.game = game
    this.notices = []
    this.renderer?.setGame(game)
    // After setGame so the new world has its real size before anything is moved.
    this.game.setExclusions(exclusions)
    this.applySettings()
    this.bump()
  }
}

function isSaveWorthy(e: GameEvent): boolean {
  return e.type === 'levelup' || e.type === 'nuke' || e.type === 'boss-defeat' || e.type === 'boss-escape'
}
