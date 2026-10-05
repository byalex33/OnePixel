import { useEffect } from 'react'
import { createPortal } from 'react-dom'

const link = 'text-ink underline decoration-dim underline-offset-2 hover:text-hi'

const HEART = ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...']

/** A tiny pixel-art heart, drawn square by square like the game's sprites. */
function PixelHeart({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 7 6" shapeRendering="crispEdges" aria-label="love" role="img" className={`inline-block h-[0.7em] w-auto fill-current ${className}`}>
      {HEART.flatMap((row, y) => [...row].map((c, x) => (c === '1' ? <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-pixel text-[8px] tracking-widest text-gold">&gt; {title}</h3>
      <div className="mt-1 text-[18px] leading-tight text-dim">{children}</div>
    </section>
  )
}

/** Full-screen credits, including the attributions the asset licences require. */
export function Credits({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Portalled to <body>: the side panel animates with transforms, which would trap a fixed overlay.
  return createPortal(
    <div className="dots fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Credits"
        onClick={(e) => e.stopPropagation()}
        className="frame px-shadow anim-pop flex max-h-full w-full max-w-[420px] flex-col p-4 pt-5"
      >
        <span className="frame-title">CREDITS</span>
        {/* Scroll inside the frame so the title on its top edge isn't clipped. */}
        <div className="min-h-0 overflow-y-auto">
          <div className="text-center font-pixel text-[16px] text-hi">OnePixel</div>

          <div className="mt-5 space-y-4">
            <Row title="SOUND & MUSIC">Synthesised live in your browser with Web Audio. No recordings.</Row>
            <Row title="FONTS">
              Press Start 2P by CodeMan38, VT323 by Peter Hull and Caveat by Impallari Type, all under the{' '}
              <a className={link} href="https://openfontlicense.org" target="_blank" rel="noreferrer">
                SIL Open Font License 1.1
              </a>
              .
            </Row>
            <Row title="ICONS">
              From{' '}
              <a className={link} href="https://game-icons.net" target="_blank" rel="noreferrer">
                game-icons.net
              </a>{' '}
              by Lorc, Delapouite and contributors, under{' '}
              <a className={link} href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
                CC BY 3.0
              </a>
              , via react-icons.
            </Row>
          </div>

          <div className="mt-5 text-center text-[20px] text-dim">
            Built with <PixelHeart className="mx-0.5 align-baseline text-red" /> by{' '}
            <a className={link} href="https://alex.codes" target="_blank" rel="noreferrer">
              Alex
            </a>
          </div>
          <div className="mt-3 text-center font-pixel text-[8px] text-mute">THANKS FOR PLAYING</div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="mt-4 w-full border-2 border-hi py-2 font-pixel text-[10px] text-hi hover:bg-hi hover:text-bg"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
