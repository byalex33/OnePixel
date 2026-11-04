import { useState } from 'react'
import type { IconType } from 'react-icons'
import { GiCircuitry, GiCog, GiTrophy, GiUpgrade } from 'react-icons/gi'
import { ACHIEVEMENTS } from '../game/achievements'
import { canInstall, KERNEL } from '../game/kernel'
import { costOf, isMaxed, isUnlocked, UPGRADES } from '../game/upgrades'
import { useRuntime } from './hooks'
import { KernelBoard } from './KernelBoard'
import { AchievementsTab } from './ProgressTabs'
import { SystemTab } from './SystemTab'
import { UpgradesTab } from './UpgradesTab'

type Tab = 'upg' | 'ach' | 'ker' | 'sys'

const TABS: { id: Tab; label: string; icon: IconType }[] = [
  { id: 'upg', label: 'UPGRADES', icon: GiUpgrade },
  { id: 'ach', label: 'FEATS', icon: GiTrophy },
  { id: 'ker', label: 'KERNEL', icon: GiCircuitry },
  { id: 'sys', label: 'SYSTEM', icon: GiCog },
]

export function Panel({ desktop }: { desktop: boolean }) {
  const rt = useRuntime()
  const [tab, setTab] = useState<Tab>('upg')
  const [open, setOpen] = useState(true)
  const s = rt.game.state
  // The KERNEL tab appears once there is something in it: bits to spend or a reboot behind you.
  const kernelShown = s.reboots > 0 || s.bits > 0
  const tabs = TABS.filter((t) => t.id !== 'ker' || kernelShown)
  const spendable = KERNEL.some((d) => canInstall(s, d.id))
  const affordable = UPGRADES.filter((u) => isUnlocked(s, u.id) && !isMaxed(s, u.id) && s.pixels >= costOf(u.id, s.upgrades[u.id], s.reboots)).length

  const select = (t: Tab) => {
    if (!desktop && t === tab) setOpen((o) => !o)
    else {
      setTab(t)
      setOpen(true)
    }
  }

  return (
    <aside
      className={`dots relative z-10 flex shrink-0 flex-col ${
        desktop ? 'anim-slide-left h-full w-[316px] border-r-2 border-line lg:w-[348px]' : 'anim-slide-up w-full border-t-2 border-line'
      }`}
      style={desktop ? undefined : { height: open ? '44dvh' : 'auto' }}
    >
      {desktop && (
        <div className="flex items-center justify-between border-b-2 border-line bg-bg px-4 py-3">
          <h1 className="font-pixel text-[12px] tracking-widest text-hi">OnePixel</h1>
          <span className="font-pixel text-[8px] text-mute">{tab === 'ach' ? `${s.achievements.length}/${ACHIEVEMENTS.length}` : `LV ${s.level}`}</span>
        </div>
      )}
      <nav className="flex border-b-2 border-line bg-bg" role="tablist">
        {tabs.map((t) => {
          const active = t.id === tab
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 font-pixel text-[7px] tracking-wider md:text-[8px] ${
                active ? 'bg-hi text-bg' : 'text-dim hover:text-hi'
              }`}
            >
              <Icon className="size-4" />
              <span className={desktop ? 'hidden lg:inline' : 'inline'}>{t.label}</span>
              {t.id === 'upg' && affordable > 0 && !active && (
                <span className="absolute top-1 right-1 min-w-3 bg-gold px-0.5 text-[6px] leading-[10px] text-bg">{affordable}</span>
              )}
              {t.id === 'ker' && spendable && !active && <span className="absolute top-1 right-1 size-2 bg-cyan" aria-label="Bits to spend" />}
            </button>
          )
        })}
        {!desktop && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-10 border-l-2 border-line font-pixel text-[9px] text-dim"
            aria-label={open ? 'Collapse panel' : 'Expand panel'}
          >
            {open ? 'v' : '^'}
          </button>
        )}
      </nav>
      {(desktop || open) && (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {tab === 'upg' && <UpgradesTab />}
          {tab === 'ach' && <AchievementsTab />}
          {tab === 'ker' && kernelShown && <KernelBoard />}
          {tab === 'sys' && <SystemTab />}
        </div>
      )}
    </aside>
  )
}
