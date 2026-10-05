import { GiNuclearBomb } from 'react-icons/gi'
import { COMBO_WINDOW, RAINBOW_MULT } from '../game/config'
import { fmt, fmtTime } from '../game/format'
import { comboMult, xpToNext } from '../game/formulas'
import { useRuntime } from './hooks'
import { Segments } from './Segments'

export function BalanceBox({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  const rt = useRuntime()
  const s = rt.game.state
  if (!s.reveal.hud) return null
  const need = xpToNext(s.level)
  const rate = rt.game.incomeRate
  const rainbow = rt.game.rainbow > 0
  return (
    <div ref={ref} className="frame px-shadow anim-boot absolute top-3 right-3 w-[176px] p-2.5 pt-3.5 md:w-[244px] md:p-3 md:pt-4">
      {rainbow && <span className="rainbow-ring" aria-hidden="true" />}
      <span className="frame-title">BALANCE</span>
      {rainbow && <span className="frame-title rainbow-text right-2 left-auto">x{RAINBOW_MULT} RAINBOW</span>}
      <div className="flex items-center gap-2">
        <span className="inline-block size-2.5 shrink-0 bg-hi md:size-3" />
        <span className="truncate font-pixel text-[14px] text-hi md:text-[20px]">{fmt(s.pixels)}</span>
      </div>
      <div className="mt-1 text-[17px] leading-none text-dim md:text-[19px]">{rate > 0 ? `+${fmt(rate)}/s` : 'pixels'}</div>
      <div className="mt-2 flex items-baseline justify-between gap-2 font-pixel text-[7px] whitespace-nowrap text-dim md:text-[8px]">
        <span className="text-ink">LV {s.level}</span>
        <span className="truncate">
          {fmt(s.xp)}/{fmt(need)} XP
        </span>
      </div>
      <Segments value={s.xp / need} count={16} className="mt-1.5 h-2" />
    </div>
  )
}

export function ComboMeter() {
  const rt = useRuntime()
  const g = rt.game
  const cap = g.stats.comboCap
  const count = g.combo.count
  if (cap === 0 || count < 2) return null
  const mult = comboMult(count, cap)
  const color = count >= 30 ? 'var(--color-gold)' : count >= 20 ? 'var(--color-red)' : count >= 10 ? 'var(--color-cyan)' : 'var(--color-hi)'
  return (
    <div className="pointer-events-none absolute top-3 left-3">
      <div key={count} className="anim-jolt origin-left font-pixel text-[16px] md:text-[22px]" style={{ color, textShadow: '3px 3px 0 #000' }}>
        x{count}
      </div>
      <div className="mt-1 font-pixel text-[8px] text-dim">
        COMBO +{Math.round((mult - 1) * 100)}%{count >= cap ? ' MAX' : ''}
      </div>
      <div className="mt-1.5 h-1 w-24 bg-line">
        <div key={`d${count}`} className="h-full origin-left bg-hi" style={{ animation: `drain ${COMBO_WINDOW}s linear both` }} />
      </div>
    </div>
  )
}

export function NukeControl() {
  const rt = useRuntime()
  const g = rt.game
  if (!g.stats.nukeEnabled) return null
  const need = g.stats.nukeKills
  const frac = Math.min(1, g.state.nukeCharge / need)
  const ready = g.nukeReady
  const arming = g.nuke !== null
  return (
    <button
      type="button"
      onClick={() => rt.launchNuke()}
      disabled={!ready}
      className={`frame px-shadow pointer-events-auto anim-pop flex w-[176px] items-center gap-2 p-2 pt-3 text-left md:w-[210px] ${
        ready ? 'border-red' : ''
      } disabled:cursor-default`}
    >
      <span className={`frame-title ${ready || arming ? 'text-red' : ''}`}>NUKE</span>
      <GiNuclearBomb className={`size-6 shrink-0 ${ready ? 'anim-blink-fast text-red' : arming ? 'text-red' : 'text-dim'}`} />
      {ready ? (
        <span className="font-pixel text-[9px] text-red">LAUNCH!</span>
      ) : arming ? (
        <span className="anim-blink-fast font-pixel text-[9px] text-red">ARMING</span>
      ) : (
        <div className="min-w-0 flex-1">
          <Segments value={frac} count={10} className="h-2" fill="var(--color-orange)" />
          <div className="mt-1 font-pixel text-[7px] text-dim">
            {g.state.nukeCharge}/{need} KILLS
          </div>
        </div>
      )}
    </button>
  )
}

export function StormStatus() {
  const rt = useRuntime()
  const g = rt.game
  if (!g.stats.rainEnabled) return null
  if (g.rain.active) {
    return (
      <div className="anim-blink font-pixel text-[9px] text-cyan" style={{ textShadow: '2px 2px 0 #000' }}>
        PIXEL RAIN {Math.ceil(g.rain.remaining)}s
      </div>
    )
  }
  return (
    <div className="font-pixel text-[8px] text-dim" style={{ textShadow: '2px 2px 0 #000' }}>
      STORM IN {fmtTime(g.state.rainTimer)}
    </div>
  )
}
