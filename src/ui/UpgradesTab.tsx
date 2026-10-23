import { memo, useCallback, useEffect, useRef } from 'react'
import { GiPadlock } from 'react-icons/gi'
import type { Runtime } from '../app/runtime'
import { fmt } from '../game/format'
import { xpToNext } from '../game/formulas'
import { upcomingUnlocks } from '../game/levels'
import type { UpgradeId } from '../game/types'
import { costOf, isMaxed, isUnlocked, maxPurchase, unlockLevelOf, UPGRADES, type UpgradeDef } from '../game/upgrades'
import { useRuntime, useRuntimeSelector } from './hooks'
import { Marquee } from './Marquee'
import { UPGRADE_ICONS } from './icons'
import { Segments } from './Segments'

/** Tap to buy once; press and hold to keep buying until it runs out of pixels. */
function useHoldToBuy(buy: () => boolean, canBuy: () => boolean) {
  const timer = useRef<number | null>(null)
  const repeated = useRef(false)
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => stop, [stop])
  return {
    onPointerDown: () => {
      repeated.current = false
      stop()
      // Stop quietly when the money runs out; only a plain tap that fails plays the "denied" sound.
      const step = () => {
        timer.current = null
        if (!canBuy()) return
        repeated.current = true
        if (buy()) timer.current = window.setTimeout(step, 85)
      }
      timer.current = window.setTimeout(step, 380)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick: () => {
      if (repeated.current) {
        repeated.current = false
        return
      }
      buy()
    },
  }
}

/** Everything a row shows. The row only re-renders when this changes, not on every UI refresh. */
function rowKey(rt: Runtime, id: UpgradeId): string {
  const s = rt.game.state
  return `${s.upgrades[id]}|${s.reboots}|${s.pixels >= costOf(id, s.upgrades[id], s.reboots)}|${s.seenUpgrades.includes(id)}|${maxPurchase(s, id).count}`
}

const UpgradeRow = memo(function UpgradeRow({ def }: { def: UpgradeDef }) {
  const rt = useRuntimeSelector((r) => rowKey(r, def.id))
  const s = rt.game.state
  const lvl = s.upgrades[def.id]
  const maxed = isMaxed(s, def.id)
  const cost = costOf(def.id, lvl, s.reboots)
  const afford = !maxed && s.pixels >= cost
  const isNew = lvl === 0 && !s.seenUpgrades.includes(def.id)
  const Icon = UPGRADE_ICONS[def.id]
  const handlers = useHoldToBuy(
    () => rt.buy(def.id),
    () => rt.game.canBuy(def.id),
  )
  const bulk = maxPurchase(s, def.id)
  const showMax = !maxed && def.max > 1

  // The row is a div (not a <button>) so the MAX button can live inside it.
  return (
    <div
      role="button"
      tabIndex={maxed ? -1 : 0}
      aria-disabled={maxed}
      aria-label={`Buy ${def.name}`}
      {...(maxed ? {} : handlers)}
      onKeyDown={(e) => {
        if (maxed || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        rt.buy(def.id)
      }}
      className={`frame group flex w-full items-start gap-3 p-2.5 text-left outline-none focus-visible:border-hi ${
        maxed ? 'opacity-50' : 'cursor-pointer'
      } ${afford ? 'border-dim hover:border-hi active:translate-x-px active:translate-y-px' : maxed ? '' : 'opacity-70'} ${isNew ? 'anim-pop' : ''}`}
    >
      <Icon className={`mt-0.5 size-7 shrink-0 ${afford ? 'text-hi' : 'text-dim'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-pixel text-[9px] leading-snug ${afford ? 'text-hi' : 'text-ink'}`}>{def.name}</span>
          <span className="shrink-0 font-pixel text-[7px] text-dim">{maxed ? 'MAX' : `${lvl}/${def.max}`}</span>
        </div>
        <div className="mt-0.5 text-[17px] leading-tight text-dim">{def.desc}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Marquee className="flex-1 text-[18px] leading-none" title={maxed ? def.show(lvl) : `${def.show(lvl)} > ${def.show(lvl + 1)}`}>
            <span className="text-ink">{def.show(lvl)}</span>
            {!maxed && (
              <>
                <span className="text-mute"> &gt; </span>
                <span className={afford ? 'text-hi' : 'text-dim'}>{def.show(lvl + 1)}</span>
              </>
            )}
          </Marquee>
          {!maxed && (
            <div className="flex shrink-0 items-center gap-1.5">
              {showMax && (
                <button
                  type="button"
                  disabled={bulk.count === 0}
                  title={bulk.count > 0 ? `Buy ${bulk.count} level${bulk.count === 1 ? '' : 's'} for ${fmt(bulk.cost)}` : 'Not enough pixels'}
                  // Keep the press from also triggering the row's buy / hold-to-buy.
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    rt.buyMax(def.id)
                  }}
                  className={`border-2 px-1.5 py-1 font-pixel text-[8px] leading-none ${
                    bulk.count > 0 ? 'border-gold text-gold hover:bg-gold hover:text-bg' : 'cursor-default border-line text-mute'
                  }`}
                >
                  MAX{bulk.count > 1 ? ` x${bulk.count}` : ''}
                </button>
              )}
              <span
                className={`flex items-center gap-1.5 border-2 px-1.5 py-1 font-pixel text-[8px] leading-none ${
                  afford ? 'border-hi bg-hi text-bg' : 'border-line text-mute'
                }`}
              >
                <span className={`inline-block size-1.5 ${afford ? 'bg-bg' : 'bg-mute'}`} />
                {fmt(cost)}
              </span>
            </div>
          )}
        </div>
      </div>
      {isNew && <span className="anim-blink absolute -top-2 right-2 bg-gold px-1 font-pixel text-[7px] leading-3 text-bg">NEW</span>}
    </div>
  )
})

export function UpgradesTab() {
  const rt = useRuntime()
  const s = rt.game.state
  const unlocked = UPGRADES.filter((u) => isUnlocked(s, u.id))
  const next = upcomingUnlocks(s.level, 1)[0]
  const locked = UPGRADES.filter((u) => !isUnlocked(s, u.id))
  const nextLockedLevel = locked.length ? Math.min(...locked.map(unlockLevelOf)) : null

  return (
    <div className="space-y-3">
      {next && (
        <div className="frame p-2.5 pt-3.5">
          <span className="frame-title">NEXT UNLOCK</span>
          <div className="flex items-baseline justify-between font-pixel text-[8px]">
            <span className="text-ink">LV {next.def.level}</span>
            <span className="text-gold">{next.def.title}</span>
          </div>
          {next.def.level === s.level + 1 && <Segments value={s.xp / xpToNext(s.level)} count={20} className="mt-2 h-1.5" fill="var(--color-gold)" />}
        </div>
      )}
      {unlocked.map((def) => (
        <UpgradeRow key={def.id} def={def} />
      ))}
      {nextLockedLevel !== null && (
        <div className="frame flex items-center gap-3 border-dashed p-2.5 opacity-60">
          <GiPadlock className="size-6 shrink-0 text-mute" />
          <div>
            <div className="font-pixel text-[9px] text-mute">???</div>
            <div className="text-[17px] text-mute">More upgrades at level {nextLockedLevel}</div>
          </div>
        </div>
      )}
    </div>
  )
}
