/**
 * Ambient background music, synthesised with WebAudio (no assets). A slow
 * Am-F-C-G pad with a soft bass root and sparse pentatonic notes through an
 * echo. Notes are picked at random each bar so it never loops audibly.
 * Shares the Sfx AudioContext so one user gesture unlocks both.
 */

const VOLUME = 0.35
const BAR = 6.4 // seconds per chord
const STEPS = 8 // melody slots per bar
const LOOKAHEAD = 0.6 // seconds scheduled ahead of the clock
const TICK_MS = 200

// MIDI notes: Am, F, C, G voiced around A3
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [52, 55, 60],
  [50, 55, 59],
]
const ROOTS = [45, 41, 36, 43]
const MELODY = [69, 72, 74, 76, 79, 81] // A minor pentatonic, A4-A5

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export class Music {
  private enabled = true
  private paused = false
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private echo: GainNode | null = null
  private timer = 0
  private nextAt = 0
  private step = 0
  private lastNote = -1

  /** Hand over the (unlocked) AudioContext. Safe to call repeatedly. */
  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return
    this.ctx = ctx
    this.bus = ctx.createGain()
    this.bus.gain.value = 0
    this.bus.connect(ctx.destination)

    // Feedback delay for the melody, darkened so repeats sit back in the mix.
    const delay = ctx.createDelay(2)
    delay.delayTime.value = (BAR / STEPS) * 1.5
    const feedback = ctx.createGain()
    feedback.gain.value = 0.35
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 1800
    this.echo = ctx.createGain()
    this.echo.gain.value = 0.5
    this.echo.connect(delay)
    delay.connect(tone).connect(feedback).connect(delay)
    tone.connect(this.bus)
    this.update()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.update()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.update()
  }

  private update(): void {
    const ctx = this.ctx
    if (!ctx || !this.bus) return
    const g = this.bus.gain
    const now = ctx.currentTime
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    if (this.enabled && !this.paused) {
      g.linearRampToValueAtTime(VOLUME, now + 3)
      if (!this.timer) {
        this.nextAt = now + 0.1
        this.step = 0
        this.timer = window.setInterval(this.schedule, TICK_MS)
        this.schedule()
      }
    } else {
      g.linearRampToValueAtTime(0, now + 0.6)
      window.clearInterval(this.timer)
      this.timer = 0
    }
  }

  private schedule = (): void => {
    const ctx = this.ctx!
    // A throttled or resumed tab can leave us behind; skip ahead, don't burst.
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05
    while (this.nextAt < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextAt)
      this.nextAt += BAR / STEPS
      this.step = (this.step + 1) % (STEPS * CHORDS.length)
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / STEPS)
    const slot = step % STEPS
    if (slot === 0) {
      for (const n of CHORDS[bar]) this.pad(freq(n), t)
      this.voice('sine', freq(ROOTS[bar]), t, 0.4, BAR * 0.9, 0.11)
    }
    // Sparse melody: mostly on even slots, never on the downbeat.
    const chance = slot === 0 ? 0 : slot % 2 ? 0.12 : 0.3
    if (Math.random() < chance) {
      let n = MELODY[Math.floor(Math.random() * MELODY.length)]
      if (n === this.lastNote) n = MELODY[(MELODY.indexOf(n) + 1) % MELODY.length]
      this.lastNote = n
      this.voice('triangle', freq(n), t, 0.01, 1.4, 0.05, true)
    }
  }

  /** Two slightly detuned triangles through a low-pass, swelling in and out. */
  private pad(f: number, t: number): void {
    const ctx = this.ctx!
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    const g = ctx.createGain()
    const peak = 0.045
    const end = t + BAR + 1.5
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 1.8)
    g.gain.setValueAtTime(peak, t + BAR - 0.5)
    g.gain.linearRampToValueAtTime(0, end)
    filter.connect(g).connect(this.bus!)
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = f
      osc.detune.value = detune
      osc.connect(filter)
      osc.start(t)
      osc.stop(end + 0.05)
    }
  }

  private voice(type: OscillatorType, f: number, t: number, attack: number, dur: number, vol: number, echo = false): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = f
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.bus!)
    if (echo) g.connect(this.echo!)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }
}
