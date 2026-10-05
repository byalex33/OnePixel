import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * A single line that, when it doesn't fit, periodically slides across to reveal
 * the hidden end and then slides back. Fits normally when there's room.
 */
export function Marquee({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const measure = () => setShift(Math.max(0, Math.ceil(i.scrollWidth - o.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(o)
    ro.observe(i)
    return () => ro.disconnect()
  }, [])

  const style = shift > 0 ? ({ '--marquee-shift': `-${shift}px` } as CSSProperties) : undefined
  return (
    <span ref={outer} title={shift > 0 ? title : undefined} className={`block min-w-0 overflow-hidden whitespace-nowrap ${className}`}>
      <span ref={inner} style={style} className={`inline-block ${shift > 0 ? 'anim-marquee' : ''}`}>
        {children}
      </span>
    </span>
  )
}
