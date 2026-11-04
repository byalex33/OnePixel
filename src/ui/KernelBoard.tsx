import { useState } from 'react'
import { GiPadlock, GiProcessor } from 'react-icons/gi'
import { fmt } from '../game/format'
import { BRANCHES, canInstall, installedCount, KERNEL, KERNEL_MAP, kernelCost, kernelReachable, type KernelDef } from '../game/kernel'
import type { KernelId } from '../game/types'
import { useRuntime } from './hooks'
import { KERNEL_ICONS } from './icons'
import { Segments } from './Segments'


/** The CORE BITS counter, as a small chip. */
export function BitsChip({ bits, className = '' }: { bits: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-pixel text-cyan ${className}`}>
      <GiProcessor className="size-[1.4em]" aria-hidden="true" />
      {fmt(bits)} BITS
    </span>
  )
}

/** Level pips under a node: one square per level. */
function Pips({ level, max }: { level: number; max: number }) {
  return (
    <span className="flex justify-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`size-[5px] ${i < level ? 'bg-cyan' : 'bg-line'}`} />
      ))}
    </span>
  )
}

/** A short copper trace between two nodes, lit once the node above is installed. */
function Trace({ lit }: { lit: boolean }) {
  return <span className={`mx-auto block h-3 w-[2px] ${lit ? 'bg-cyan shadow-[0_0_6px_var(--color-cyan)]' : 'bg-line'}`} aria-hidden="true" />
}

function Node({ def, selected, onSelect }: { def: KernelDef; selected: boolean; onSelect: () => void }) {
  const rt = useRuntime()
  const s = rt.game.state
  const lvl = s.kernel[def.id]
  const max = def.costs.length
  const reachable = kernelReachable(s, def.id)
  const affordable = canInstall(s, def.id)
  const Icon = reachable ? KERNEL_ICONS[def.id] : GiPadlock
  const tone = lvl >= max ? 'border-cyan bg-cyan/15 text-cyan' : lvl > 0 ? 'border-cyan text-cyan' : affordable ? 'border-gold text-gold' : reachable ? 'border-dim text-dim' : 'border-dashed border-line text-mute'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${def.name}, level ${lvl} of ${max}${reachable ? '' : ', locked'}`}
      className={`relative flex w-full flex-col items-center gap-1.5 border-2 bg-bg px-1 py-2 outline-none ${tone} ${
        selected ? 'outline-2 outline-offset-2 outline-hi' : 'hover:border-hi focus-visible:border-hi'
      }`}
    >
      <Icon className="size-6" />
      <Pips level={lvl} max={max} />
      {affordable && lvl < max && <span className="anim-blink absolute -top-1.5 -right-1.5 size-2.5 bg-gold" aria-hidden="true" />}
    </button>
  )
}

/** What the selected node does, and the button to install its next level. */
function Detail({ def }: { def: KernelDef }) {
  const rt = useRuntime()
  const s = rt.game.state
  const lvl = s.kernel[def.id]
  const max = def.costs.length
  const maxed = lvl >= max
  const cost = kernelCost(s, def.id)
  const reachable = kernelReachable(s, def.id)
  const affordable = canInstall(s, def.id)
  const branch = BRANCHES.find((b) => b.id === def.branch)!
  const Icon = KERNEL_ICONS[def.id]
  return (
    <div className="frame p-3 pt-4" aria-live="polite">
      <span className="frame-title text-cyan!">{branch.name}</span>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-7 shrink-0 ${lvl > 0 ? 'text-cyan' : 'text-dim'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-pixel text-[9px] leading-snug text-hi">{def.name}</span>
            <span className="shrink-0 font-pixel text-[7px] text-dim">{maxed ? 'MAX' : `${lvl}/${max}`}</span>
          </div>
          <div className="mt-0.5 text-[17px] leading-tight text-dim">{def.desc}</div>
          <div className="mt-1.5 text-[18px] leading-none">
            <span className="text-ink">{def.show(lvl)}</span>
            {!maxed && (
              <>
                <span className="text-mute"> &gt; </span>
                <span className="text-hi">{def.show(lvl + 1)}</span>
              </>
            )}
          </div>
          {def.atBoot && !maxed && <div className="mt-1 font-pixel text-[7px] leading-relaxed text-gold">APPLIES FROM YOUR NEXT BOOT</div>}
        </div>
      </div>
      {!maxed && (
        <button
          type="button"
          disabled={!affordable}
          onClick={() => rt.installKernel(def.id)}
          className={`mt-3 flex w-full items-center justify-center gap-2 border-2 px-2 py-2 font-pixel text-[8px] ${
            affordable ? 'border-cyan text-cyan hover:bg-cyan hover:text-bg active:bg-cyan active:text-bg' : 'cursor-default border-line text-mute'
          }`}
        >
          {!reachable ? (
            <>
              <GiPadlock className="size-3.5" /> NEEDS {KERNEL_MAP[def.requires!].name}
            </>
          ) : (
            <>
              <GiProcessor className="size-3.5" /> INSTALL FOR {cost} BITS
            </>
          )}
        </button>
      )}
    </div>
  )
}

/**
 * The KERNEL as a circuit board: three branches of nodes joined by traces that light
 * up as they're installed, and a detail card for the selected node underneath.
 */
export function KernelBoard() {
  const rt = useRuntime()
  const s = rt.game.state
  // Start on something worth looking at: the first node you can afford, else the first you can reach.
  const [picked, setPicked] = useState<KernelId | null>(null)
  const fallback = KERNEL.find((d) => canInstall(s, d.id)) ?? KERNEL.find((d) => kernelReachable(s, d.id) && s.kernel[d.id] < d.costs.length) ?? KERNEL[0]
  const selected = KERNEL_MAP[picked ?? fallback.id]
  const installed = installedCount(s)

  return (
    <div className="space-y-3">
      <div className="frame p-3 pt-4">
        <span className="frame-title">KERNEL</span>
        <div className="flex items-baseline justify-between gap-2">
          <BitsChip bits={s.bits} className="text-[12px]" />
          <span className="font-pixel text-[7px] text-dim">
            {installed}/{KERNEL.length} NODES
          </span>
        </div>
        <Segments value={installed / KERNEL.length} count={KERNEL.length} className="mt-2 h-2" fill="var(--color-cyan)" />
      </div>

      <div className="dots relative border-2 border-line p-3" role="group" aria-label="KERNEL nodes">
        {/* The bus every branch hangs off. */}
        <span className="absolute top-3 right-[16.6%] left-[16.6%] h-[2px] bg-cyan/60" aria-hidden="true" />
        <div className="grid grid-cols-3 gap-3">
          {BRANCHES.map((b) => {
            const nodes = KERNEL.filter((d) => d.branch === b.id)
            return (
              <div key={b.id} className="flex flex-col">
                <span className="mx-auto block h-3 w-[2px] bg-cyan/60" aria-hidden="true" />
                <div className="mb-2 bg-bg text-center font-pixel text-[7px] leading-relaxed text-ink">
                  {b.name}
                  <div className="text-[6px] text-mute">{b.desc.toUpperCase()}</div>
                </div>
                {nodes.map((d, i) => (
                  <div key={d.id}>
                    {i > 0 && <Trace lit={s.kernel[nodes[i - 1].id] > 0} />}
                    <Node def={d} selected={d.id === selected.id} onSelect={() => setPicked(d.id)} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <Detail def={selected} />
    </div>
  )
}
