import { GiCheckMark, GiPadlock, GiTrophy } from 'react-icons/gi'
import { ACHIEVEMENTS } from '../game/achievements'
import { fmt } from '../game/format'
import { xpToNext } from '../game/formulas'
import { LEVELS, upcomingUnlocks } from '../game/levels'
import { useRuntime } from './hooks'
import { Segments } from './Segments'

export function LevelsTab() {
  const rt = useRuntime()
  const s = rt.game.state
  const need = xpToNext(s.level)
  const done = LEVELS.filter((l) => l.level <= s.level)
  const upcoming = upcomingUnlocks(s.level, 2)

  return (
    <div className="space-y-4">
      <div className="frame p-3 pt-4">
        <span className="frame-title">LEVEL</span>
        <div className="flex items-baseline justify-between">
          <span className="font-pixel text-[18px] text-hi">{s.level}</span>
          <span className="font-pixel text-[8px] text-dim">
            {fmt(s.xp)} / {fmt(need)} XP
          </span>
        </div>
        <Segments value={s.xp / need} count={20} className="mt-2 h-2" />
        <div className="mt-2 text-[17px] text-dim">Each level: +5% pixel value. Total +{(s.level - 1) * 5}%.</div>
      </div>

      <section>
        <h2 className="mb-2 font-pixel text-[8px] tracking-widest text-dim">&gt; COMING UP</h2>
        <ul className="space-y-2">
          {upcoming.map(({ def, hidden }) => (
            <li key={def.level} className={`frame flex items-start gap-3 p-2.5 ${hidden ? 'border-dashed opacity-50' : ''}`}>
              <span className="w-10 shrink-0 font-pixel text-[8px] text-dim">LV{def.level}</span>
              {hidden ? (
                <div className="flex items-center gap-2">
                  <GiPadlock className="size-4 text-mute" />
                  <span className="font-pixel text-[9px] text-mute">???</span>
                </div>
              ) : (
                <div>
                  <div className="font-pixel text-[9px] leading-snug text-gold">{def.title}</div>
                  <div className="mt-0.5 text-[17px] leading-tight text-dim">{def.desc}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 font-pixel text-[8px] tracking-widest text-dim">&gt; UNLOCKED</h2>
          <ul className="space-y-1.5">
            {[...done].reverse().map((def) => (
              <li key={def.level} className="flex items-start gap-3 px-1">
                <span className="w-10 shrink-0 font-pixel text-[8px] text-mute">LV{def.level}</span>
                <GiCheckMark className="mt-0.5 size-3.5 shrink-0 text-dim" />
                <span className="font-pixel text-[8px] leading-snug text-ink">{def.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function AchievementsTab() {
  const rt = useRuntime()
  const owned = new Set(rt.game.state.achievements)
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
        {ACHIEVEMENTS.map((a) => {
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
      </ul>
    </div>
  )
}
