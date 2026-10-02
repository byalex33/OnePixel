import { useRuntime } from './hooks'

/**
 * Hand-drawn "click me!" arrow pointing at the very first pixel. It is the only
 * onboarding in the game and disappears for good after the first pop. The first
 * pixel always spawns at the centre of the arena, so the hint anchors there.
 */
export function ClickMeHint() {
  const rt = useRuntime()
  if (rt.game.state.stats.kills > 0) return null
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2" aria-hidden="true">
      {/* SVG origin is offset so the arrow tip (6,14) lands just right of the pixel. */}
      <div className="hint-bob absolute" style={{ left: 26, top: -8 }}>
        <svg width="84" height="60" viewBox="0 0 84 60" fill="none" className="block overflow-visible">
          <path
            className="hint-draw"
            pathLength={1}
            d="M52 45 C 38 53, 14 42, 6 14"
            stroke="var(--color-coral)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            className="hint-draw hint-draw-late"
            pathLength={1}
            d="M5 25 L6 14 L15 19"
            stroke="var(--color-coral)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="hint-fade absolute font-hand text-[24px] leading-none whitespace-nowrap text-coral md:text-[28px]"
          style={{ left: 58, top: 33, transform: 'rotate(-7deg)' }}
        >
          click me!
        </span>
      </div>
    </div>
  )
}
