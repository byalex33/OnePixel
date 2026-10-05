import { GiPadlock, GiTrophy } from 'react-icons/gi'
import { ACHIEVEMENTS } from '../game/achievements'
import { useRuntime } from './hooks'
import { Segments } from './Segments'

export function AchievementsTab() {
  const rt = useRuntime()
  const owned = new Set(rt.game.state.achievements)
  const shown = ACHIEVEMENTS.filter((a) => !a.hidden || owned.has(a.id))
  const secret = ACHIEVEMENTS.length - shown.length
  return (
    <div className="space-y-3">
      <div className="frame p-3 pt-4">
        <span className="frame-title">FEATS</span>
        <div className="flex items-baseline justify-between">
          <span className="font-pixel text-[14px] text-hi">
            {owned.size}/{ACHIEVEMENTS.length}
          </span>
          <span className="font-pixel text-[8px] text-gold">+{owned.size * 2}% VALUE</span>
        </div>
        <Segments value={owned.size / ACHIEVEMENTS.length} count={ACHIEVEMENTS.length} className="mt-2 h-2" fill="var(--color-gold)" />
      </div>
      <ul className="space-y-2">
        {shown.map((a) => {
          const got = owned.has(a.id)
          return (
            <li key={a.id} className={`frame flex items-start gap-3 p-2.5 ${got ? '' : 'opacity-55'}`}>
              {got ? <GiTrophy className="size-5 shrink-0 text-gold" /> : <GiPadlock className="size-5 shrink-0 text-mute" />}
              <div>
                <div className={`font-pixel text-[9px] ${got ? 'text-hi' : 'text-mute'}`}>{got ? a.name : '???'}</div>
                <div className="mt-0.5 text-[17px] leading-tight text-dim">{a.desc}</div>
              </div>
            </li>
          )
        })}
        {secret > 0 && (
          <li className="frame flex items-center gap-3 border-dashed p-2.5 opacity-55">
            <GiPadlock className="size-5 shrink-0 text-mute" />
            <div>
              <div className="font-pixel text-[9px] text-mute">+{secret} HIDDEN FEAT{secret === 1 ? '' : 'S'}</div>
              <div className="mt-0.5 text-[17px] leading-tight text-dim">Keep playing to discover {secret === 1 ? 'it' : 'them'}.</div>
            </div>
          </li>
        )}
      </ul>
    </div>
  )
}
