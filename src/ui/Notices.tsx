import { useEffect } from 'react'
import { GiTrophy } from 'react-icons/gi'
import type { Notice } from '../app/runtime'
import { ACHIEVEMENTS } from '../game/achievements'
import { MAX_OFFLINE_SECONDS, OFFLINE_EFFICIENCY } from '../game/config'
import { fmt, fmtTime } from '../game/format'
import { levelDef } from '../game/levels'
import { useRuntime } from './hooks'

function useAutoDismiss(id: number | undefined, ms: number) {
  const rt = useRuntime()
  useEffect(() => {
    if (id === undefined) return
    const t = window.setTimeout(() => rt.dismissNotice(id), ms)
    return () => window.clearTimeout(t)
  }, [id, ms, rt])
}

export function LevelUpOverlay() {
  const rt = useRuntime()
  const n = rt.notices.find((x): x is Extract<Notice, { kind: 'levelup' }> => x.kind === 'levelup')
  useAutoDismiss(n?.id, n && levelDef(n.level) ? 3600 : 2200)
  if (!n) return null
  const def = levelDef(n.level)
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
      <div key={n.id} className="anim-pop text-center">
        <div className="anim-blink font-pixel text-[9px] tracking-[0.3em] text-dim md:text-[10px]">LEVEL UP</div>
        <div className="mt-2 font-pixel text-[34px] text-hi md:text-[52px]" style={{ textShadow: '4px 4px 0 #000' }}>
          LV {n.level}
        </div>
        {def && (
          <div className="frame px-shadow mx-auto mt-5 max-w-[320px] p-3 pt-4 text-left">
            <span className="frame-title text-gold!">{def.feature === 'signal' ? 'TRANSMISSION' : 'NEW IN SHOP'}</span>
            <div className="font-pixel text-[10px] leading-relaxed text-gold md:text-[11px]">{def.title}</div>
            <div className="mt-1 text-[19px] leading-tight text-ink">{def.desc}</div>
          </div>
        )}
        <div className="mt-3 font-pixel text-[8px] text-dim" style={{ textShadow: '2px 2px 0 #000' }}>
          +5% PIXEL VALUE
        </div>
      </div>
    </div>
  )
}

function Toast({ n }: { n: Extract<Notice, { kind: 'achievement' }> }) {
  useAutoDismiss(n.id, 3200)
  const def = ACHIEVEMENTS.find((a) => a.id === n.achId)
  if (!def) return null
  return (
    <div className="frame px-shadow anim-rise flex items-center gap-3 p-2 pr-3">
      <GiTrophy className="size-6 shrink-0 text-gold" />
      <div>
        <div className="font-pixel text-[8px] text-gold">ACHIEVEMENT</div>
        <div className="mt-1 font-pixel text-[9px] text-hi">{def.name}</div>
        <div className="text-[16px] leading-none text-dim">+2% pixel value</div>
      </div>
    </div>
  )
}

export function Toasts() {
  const rt = useRuntime()
  const list = rt.notices.filter((x): x is Extract<Notice, { kind: 'achievement' }> => x.kind === 'achievement').slice(0, 3)
  // Queue behind the level-up card so the two never overlap.
  if (list.length === 0 || rt.notices.some((x) => x.kind === 'levelup' || x.kind === 'offline')) return null
  return (
    <div className="pointer-events-none absolute top-28 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 md:top-36">
      {list.map((n) => (
        <Toast key={n.id} n={n} />
      ))}
    </div>
  )
}

export function OfflineModal() {
  const rt = useRuntime()
  const n = rt.notices.find((x): x is Extract<Notice, { kind: 'offline' }> => x.kind === 'offline')
  if (!n) return null
  const g = n.gains
  return (
    <div className="dots absolute inset-0 z-10 flex items-center justify-center bg-bg/80 p-4">
      <div className="frame px-shadow anim-pop w-full max-w-[360px] p-4 pt-5">
        <span className="frame-title">SYSTEM</span>
        <div className="font-pixel text-[12px] text-hi">WELCOME BACK</div>
        <div className="mt-2 text-[19px] text-dim">
          You were away for {fmtTime(g.seconds)}
          {g.seconds >= MAX_OFFLINE_SECONDS ? ' (max)' : ''}. Your machines kept working.
        </div>
        <div className="mt-4 space-y-2 font-pixel text-[10px]">
          <div className="flex justify-between">
            <span className="text-dim">DESTROYED</span>
            <span className="text-ink">{fmt(g.kills)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">PIXELS</span>
            <span className="text-hi">+{fmt(g.pixels)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">XP</span>
            <span className="text-ink">+{fmt(g.xp)}</span>
          </div>
          {n.levels > 0 && (
            <div className="flex justify-between">
              <span className="text-dim">LEVELS</span>
              <span className="text-gold">+{n.levels}</span>
            </div>
          )}
        </div>
        <div className="mt-4 text-[16px] leading-tight text-mute">
          Offline runs at {Math.round(OFFLINE_EFFICIENCY * 100)}% automation speed, up to {MAX_OFFLINE_SECONDS / 3600}h.
        </div>
        <button
          type="button"
          onClick={() => rt.dismissNotice(n.id)}
          className="mt-4 w-full border-2 border-hi py-2 font-pixel text-[10px] text-hi hover:bg-hi hover:text-bg"
        >
          [ CONTINUE ]
        </button>
      </div>
    </div>
  )
}
