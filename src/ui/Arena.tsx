import { useEffect, useRef } from 'react'
import { FaGithub, FaStar } from 'react-icons/fa'
import { REPO_URL } from '../app/links'
import type { Rect } from '../game/game'
import { useRuntime } from './hooks'
import { ClickMeHint } from './ClickMeHint'
import { BalanceBox, ComboMeter, NukeControl, StormStatus } from './Hud'
import { LevelUpOverlay, OfflineModal, Toasts } from './Notices'

export function Arena() {
  const rt = useRuntime()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const balanceRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const starRef = useRef<HTMLAnchorElement>(null)
  const measureRef = useRef<() => void>(() => {})
  const hud = rt.game.state.reveal.hud
  const level = rt.game.state.level
  const { nukeEnabled, rainEnabled } = rt.game.stats

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const renderer = rt.attachCanvas(canvas)

    const measureExclusions = () => {
      const box = wrap.getBoundingClientRect()
      // Keep pixels from spawning underneath HUD overlays.
      const rects: Rect[] = []
      for (const el of [balanceRef.current, bottomRef.current, starRef.current]) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        const a = renderer.toWorld(r.left - box.left, r.top - box.top)
        const b = renderer.toWorld(r.right - box.left, r.bottom - box.top)
        rects.push({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
      }
      rt.setExclusions(rects)
    }
    const measure = () => {
      const box = wrap.getBoundingClientRect()
      renderer.resize(box.width, box.height, window.devicePixelRatio || 1)
      measureExclusions()
    }
    measureRef.current = measureExclusions
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    measure()
    rt.start()
    return () => {
      ro.disconnect()
      rt.stop()
      rt.detachCanvas()
    }
  }, [rt])

  // HUD overlays appear as the player progresses; re-measure spawn exclusions.
  useEffect(() => {
    measureRef.current()
  }, [hud, level, nukeEnabled, rainEnabled])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    rt.pointer(e.clientX - r.left, e.clientY - r.top)
  }

  return (
    <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          className="block h-full w-full cursor-crosshair touch-none"
          aria-label="Arena. Tap the pixels."
        />
      </div>
      <ClickMeHint />
      <ComboMeter />
      <BalanceBox ref={balanceRef} />
      <div ref={bottomRef} className="pointer-events-none absolute bottom-3 left-3 flex flex-col items-start gap-3">
        <StormStatus />
        <NukeControl />
      </div>
      <Toasts />
      <LevelUpOverlay />
      <OfflineModal />
      <a
        ref={starRef}
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="frame px-shadow absolute right-3 bottom-3 flex items-center gap-2 px-2.5 py-2 font-pixel text-[8px] tracking-wider text-dim hover:border-hi hover:text-hi"
      >
        <FaGithub className="size-3.5" aria-hidden="true" />
        <FaStar className="size-3 text-gold" aria-hidden="true" />
        STAR ON GITHUB
      </a>
    </main>
  )
}
