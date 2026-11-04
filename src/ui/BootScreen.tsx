import { createPortal } from 'react-dom'
import { GiPowerButton } from 'react-icons/gi'
import { REBOOT_BOSS_HP_MULT, REBOOT_PRICE_MULT, REBOOT_VALUE_MULT } from '../game/config'
import { bitsForRun, FAST_BOOT_LEVELS } from '../game/kernel'
import { useRuntime } from './hooks'
import { KernelBoard } from './KernelBoard'

/**
 * Between REBOOT and the next run: a dark BIOS-style screen with this run's CORE BITS
 * tallied up and the KERNEL to spend them in. Nothing moves until BOOT.
 */
export function BootScreen() {
  const rt = useRuntime()
  const s = rt.game.state
  if (!s.bootPending) return null
  // The run's stats are only reset on BOOT, so the payout can still be shown line by line.
  const pay = bitsForRun(s)
  const next = s.reboots + 1
  const startLevel = FAST_BOOT_LEVELS[s.kernel.fastBoot] ?? 1
  const lines: [string, string][] = [
    [`PIXEL ZERO x${s.stats.finalKills}`, `+${pay.zero}`],
    [`BOSSES x${s.stats.bossKills}`, `+${pay.bosses}`],
    ['SPEED BONUS', `+${pay.speed}`],
  ]
  if (pay.mult > 1) lines.push(['BIT MINER', `x${pay.mult}`])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="KERNEL boot screen" className="fixed inset-0 z-[60] overflow-y-auto bg-[#0c0c0c] text-ink">
      <div className="dots pointer-events-none fixed inset-0 opacity-40" />
      <div className="relative mx-auto max-w-[760px] px-4 py-8 md:px-8 md:py-10">
        <div className="anim-boot font-pixel text-[10px] leading-relaxed text-dim md:text-[12px]">
          <div className="text-cyan">ONEPIXEL KERNEL v{next}.0</div>
          <div>MEMORY CHECK ......... OK</div>
          <div>PIXEL ZERO ........... DESTROYED</div>
          <div className="anim-blink">AWAITING BOOT_</div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <section className="frame p-3 pt-4">
            <span className="frame-title text-cyan!">CORE BITS RECEIVED</span>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              {lines.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-pixel text-[7px] leading-5 text-dim">{k}</dt>
                  <dd className="text-right text-[18px] leading-5 text-ink">{v}</dd>
                </div>
              ))}
              <dt className="mt-1 border-t-2 border-line pt-1 font-pixel text-[8px] leading-5 text-hi">TOTAL</dt>
              <dd className="mt-1 border-t-2 border-line pt-1 text-right text-[20px] leading-5 text-cyan">+{pay.total}</dd>
            </dl>
            <p className="mt-3 text-[17px] leading-tight text-dim">
              Bits are yours for good. Spend them in the KERNEL now, or later from its tab.
            </p>
          </section>

          <section className="frame p-3 pt-4">
            <span className="frame-title">NEXT RUN</span>
            <ul className="space-y-1 text-[18px] leading-tight">
              <li>
                <span className="text-dim">Starts at </span>
                <span className="text-hi">LV {startLevel}</span>
              </li>
              <li>
                <span className="text-dim">Every pixel worth </span>
                <span className="text-gold">x{(REBOOT_VALUE_MULT ** next).toFixed(1)}</span>
              </li>
              <li>
                <span className="text-dim">Prices </span>
                <span className="text-ink">x{REBOOT_PRICE_MULT ** next}</span>
                <span className="text-dim">, bosses </span>
                <span className="text-ink">x{+(REBOOT_BOSS_HP_MULT ** next).toFixed(2)}</span>
                <span className="text-dim"> tougher</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => rt.boot()}
              className="mt-4 flex w-full items-center justify-center gap-2 border-2 border-white px-3 py-3 font-pixel text-[12px] text-white outline-none hover:bg-white hover:text-bg focus-visible:bg-white focus-visible:text-bg"
            >
              <GiPowerButton className="size-5" /> BOOT #{next}
            </button>
          </section>
        </div>

        <div className="mt-6">
          <h2 className="mb-3 font-pixel text-[10px] text-hi">INSTALL NODES</h2>
          <KernelBoard />
        </div>
      </div>
    </div>,
    document.body,
  )
}
