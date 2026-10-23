import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { REBOOT_BOSS_HP_MULT, REBOOT_PRICE_MULT, REBOOT_VALUE_MULT } from '../game/config'
import { useRuntime } from './hooks'

/** The fake "% complete" counter jumps unevenly, like the real thing. */
const PROGRESS = [0, 0, 7, 19, 19, 34, 58, 61, 85, 85, 100]
const STEP_MS = 380

/** A scrambled pixel block where the help code would go. Fixed, so it never flickers between renders. */
const CODE = (() => {
  const n = 15
  let seed = 0x50ee
  const cells: boolean[] = []
  for (let i = 0; i < n * n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const x = i % n
    const y = Math.floor(i / n)
    const finder = (fx: number, fy: number) => x >= fx && x < fx + 4 && y >= fy && y < fy + 4 && !(x > fx && x < fx + 3 && y > fy && y < fy + 3)
    cells.push(finder(0, 0) || finder(n - 4, 0) || finder(0, n - 4) || (seed >> 8) % 2 === 0)
  }
  return { n, cells }
})()

const choice = 'w-full border-2 border-white px-3 py-3 text-left hover:bg-white hover:text-[#1546c4] focus-visible:bg-white focus-visible:text-[#1546c4] outline-none'

/**
 * PIXEL ZERO is dead and the screen has crashed. A pixel-art parody of a
 * system crash screen, then the big choice: REBOOT (prestige) or CONTINUE.
 */
export function CrashScreen() {
  const rt = useRuntime()
  // Waits for PIXEL ZERO's death animation, then mounts fresh so the counter always starts from 0%.
  return rt.game.state.crashPending && rt.game.boss?.phase !== 'die' ? <Crash /> : null
}

function Crash() {
  const rt = useRuntime()
  const s = rt.game.state
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= PROGRESS.length) return
    const id = window.setTimeout(() => setStep(step + 1), STEP_MS)
    return () => window.clearTimeout(id)
  }, [step])

  const glitching = step < 2 && s.settings.flash
  const pct = PROGRESS[Math.min(step, PROGRESS.length - 1)]
  const done = step >= PROGRESS.length
  const next = s.reboots + 1

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="System crash"
      className={`fixed inset-0 z-[60] overflow-y-auto text-white ${glitching ? 'anim-crash-glitch' : ''}`}
      style={{ background: '#1546c4' }}
    >
      <div className="dots pointer-events-none fixed inset-0 opacity-30" />
      <div className="relative mx-auto flex min-h-full max-w-[760px] flex-col justify-center px-6 py-10 md:px-10">
        {/* Smiling, not sad: this crash is the player's win. */}
        <div className="font-pixel text-[56px] leading-none md:text-[88px]">:)</div>
        <h1 className="anim-pop mt-8 font-pixel text-[22px] leading-tight text-gold md:text-[34px]">
          GAME COMPLETE{s.stats.finalKills > 1 ? ` x${s.stats.finalKills}` : ''}
        </h1>
        <p className="mt-6 text-[26px] leading-tight md:text-[34px]">
          Your screen ran into a problem and needs to reboot. We&apos;re just collecting some pixel info, and then you can decide what happens next.
        </p>
        <p className="mt-6 font-pixel text-[14px] md:text-[18px]">{pct}% complete</p>

        <div className="mt-8 flex items-start gap-4">
          <div
            className="grid shrink-0 bg-white p-1"
            style={{ gridTemplateColumns: `repeat(${CODE.n}, 1fr)`, width: 84, height: 84 }}
            aria-hidden="true"
          >
            {CODE.cells.map((on, i) => (
              <span key={i} style={{ background: on ? '#1546c4' : '#fff' }} />
            ))}
          </div>
          <div className="text-[18px] leading-tight md:text-[20px]">
            <p>You destroyed the pixel that started it all.</p>
            <p className="mt-3 text-white/80">If you call a support pixel, give them this info:</p>
            <p className="text-white/80">Stop code: PIXEL_ZERO_DESTROYED</p>
          </div>
        </div>

        {done && (
          <div className="anim-pop mt-10 grid gap-3 md:grid-cols-2">
            <button type="button" autoFocus className={choice} onClick={() => rt.reboot()}>
              <div className="font-pixel text-[13px]">&gt; REBOOT #{next}</div>
              <div className="mt-2 text-[18px] leading-tight">
                Start over at level 1, keeping your feats. Prices x{REBOOT_PRICE_MULT ** next} and bosses x{(REBOOT_BOSS_HP_MULT ** next).toFixed(1)} tougher, but every pixel is worth x
                {(REBOOT_VALUE_MULT ** next).toFixed(1)} more. Forever.
              </div>
            </button>
            <button type="button" className={choice} onClick={() => rt.continueAfterCrash()}>
              <div className="font-pixel text-[13px]">&gt; CONTINUE</div>
              <div className="mt-2 text-[18px] leading-tight">
                Keep playing. The bosses keep coming, and PIXEL ZERO will return stronger. You can still reboot later from SYSTEM.
              </div>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
