import type { GameEvent } from '../game/types'

/**
 * Sound layer. Game events are mapped to named cues in `cueFor`; cues are
 * synthesised with WebAudio (no assets). To swap in sampled audio later,
 * replace `play()` with a buffer lookup - the event mapping stays the same.
 */
export type Cue =
  | 'pop'
  | 'pop-auto'
  | 'crit'
  | 'gold'
  | 'blue'
  | 'miss'
  | 'bomb'
  | 'chain'
  | 'laser'
  | 'nuke-warn'
  | 'nuke'
  | 'levelup'
  | 'achievement'
  | 'buy'
  | 'denied'
  | 'rain'
  | 'rainbow'
  | 'boss-rise'
  | 'boss-hit'
  | 'boss-eat'
  | 'boss-defeat'
  | 'boss-escape'

interface CueOpts {
  pitch?: number
}

const MIN_GAP: Partial<Record<Cue, number>> = { pop: 0.025, 'pop-auto': 0.06, chain: 0.05, miss: 0.08, 'boss-hit': 0.05 }

export class Sfx {
  enabled = true
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private last = new Map<Cue, number>()
  private budget = 0

  get context(): AudioContext | null {
    return this.ctx
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.22
    this.master.connect(this.ctx.destination)
    const len = this.ctx.sampleRate
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  handle(events: GameEvent[]): void {
    if (!this.enabled || !this.ctx) return
    this.budget = 6
    for (const e of events) {
      const c = cueFor(e)
      if (c) this.play(c.cue, c.opts)
    }
  }

  play(cue: Cue, opts: CueOpts = {}): void {
    const ctx = this.ctx
    if (!this.enabled || !ctx || this.budget <= 0) return
    const now = ctx.currentTime
    const gap = MIN_GAP[cue] ?? 0.04
    if (now - (this.last.get(cue) ?? -1) < gap) return
    this.last.set(cue, now)
    this.budget--
    const p = opts.pitch ?? 1
    switch (cue) {
      case 'pop':
        this.tone('square', 660 * p, 1320 * p, 0.06, 0.5)
        break
      case 'pop-auto':
        this.tone('triangle', 990 * p, 1500 * p, 0.04, 0.25)
        break
      case 'crit':
        this.tone('square', 880, 1760, 0.08, 0.5)
        this.tone('square', 1320, 2200, 0.1, 0.35, 0.05)
        break
      case 'gold':
        ;[1047, 1319, 1568, 2093].forEach((f, i) => this.tone('square', f, f, 0.07, 0.3, i * 0.05))
        break
      case 'blue':
        ;[880, 1319, 1760].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.09, 0.32, i * 0.05))
        break
      case 'miss':
        this.tone('triangle', 180, 120, 0.05, 0.2)
        break
      case 'bomb':
        this.noise(0.45, 0.9, 900)
        this.tone('sine', 110, 40, 0.4, 0.9)
        break
      case 'chain':
        this.noise(0.12, 0.35, 2400)
        break
      case 'laser':
        this.tone('sawtooth', 1800, 160, 0.28, 0.35)
        break
      case 'nuke-warn':
        for (let i = 0; i < 4; i++) this.tone('square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.14, 0.3, i * 0.16)
        break
      case 'nuke':
        this.noise(1.8, 1.2, 600)
        this.tone('sine', 90, 25, 1.6, 1.2)
        break
      case 'levelup':
        ;[523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.1, 0.4, i * 0.07))
        break
      case 'achievement':
        ;[784, 988, 1175].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.45, i * 0.08))
        break
      case 'buy':
        this.tone('square', 440, 880, 0.07, 0.35)
        break
      case 'denied':
        this.tone('square', 150, 110, 0.1, 0.3)
        break
      case 'rain':
        ;[1568, 1319, 1047, 784].forEach((f, i) => this.tone('triangle', f, f, 0.1, 0.25, i * 0.09))
        break
      case 'rainbow':
        ;[523, 659, 784, 988, 1175, 1319, 1568, 2093].forEach((f, i) => this.tone('square', f, f * 1.02, 0.08, 0.28, i * 0.04))
        break
      case 'boss-rise':
        this.noise(1.6, 0.8, 400)
        this.tone('sine', 70, 35, 1.5, 1)
        for (let i = 0; i < 3; i++) this.tone('square', 220, 180, 0.18, 0.25, 0.3 + i * 0.3)
        break
      case 'boss-hit':
        this.tone('square', 140 * p, 70 * p, 0.07, 0.45)
        break
      case 'boss-eat':
        this.tone('sawtooth', 300, 60, 0.18, 0.35)
        break
      case 'boss-defeat':
        this.noise(1.2, 1, 1200)
        ;[392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone('square', f, f, 0.12, 0.4, 0.15 + i * 0.07))
        break
      case 'boss-escape':
        ;[392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.16, 0.35, i * 0.12))
        break
    }
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g).connect(this.master!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noise(dur: number, vol: number, cutoff: number): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, t)
    filter.frequency.exponentialRampToValueAtTime(60, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filter).connect(g).connect(this.master!)
    src.start(t)
    src.stop(t + dur)
  }
}

export function cueFor(e: GameEvent): { cue: Cue; opts?: CueOpts } | null {
  switch (e.type) {
    case 'pop':
      if (e.kind === 'golden') return { cue: 'gold' }
      if (e.kind === 'blue') return { cue: 'blue' }
      if (e.crit) return { cue: 'crit' }
      if (e.cause === 'click') return { cue: 'pop', opts: { pitch: 1 + Math.min(e.combo, 30) * 0.03 } }
      if (e.cause === 'drone' || e.cause === 'laser') return { cue: 'pop-auto', opts: { pitch: 0.9 + Math.random() * 0.3 } }
      return null
    case 'miss':
      return { cue: 'miss' }
    case 'blast':
      if (e.cause === 'bomb') return { cue: 'bomb' }
      if (e.cause === 'chain') return { cue: 'chain' }
      return null
    case 'laser-fire':
      return { cue: 'laser' }
    case 'nuke-warn':
      return { cue: 'nuke-warn' }
    case 'nuke':
      return { cue: 'nuke' }
    case 'levelup':
      return { cue: 'levelup' }
    case 'achievement':
      return { cue: 'achievement' }
    case 'buy':
      return { cue: 'buy' }
    case 'denied':
      return { cue: 'denied' }
    case 'rain-start':
      return { cue: 'rain' }
    case 'rainbow-start':
      return { cue: 'rainbow' }
    case 'boss-rise':
      return { cue: 'boss-rise' }
    case 'boss-hit':
      if (e.source === 'click') return { cue: e.crit ? 'crit' : 'boss-hit', opts: { pitch: 0.9 + Math.random() * 0.25 } }
      if (e.source === 'nuke') return null
      return { cue: 'boss-hit', opts: { pitch: 0.7 } }
    case 'boss-eat':
      return { cue: 'boss-eat' }
    case 'boss-defeat':
      return { cue: 'boss-defeat' }
    case 'boss-escape':
      return { cue: 'boss-escape' }
    default:
      return null
  }
}
