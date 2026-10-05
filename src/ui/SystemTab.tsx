import { useState } from 'react'
import { GiMusicalNotes, GiSave, GiSpeaker, GiSpeakerOff } from 'react-icons/gi'
import { fmt, fmtTime } from '../game/format'
import { SaveError } from '../game/save'
import type { Settings } from '../game/types'
import { useRuntime } from './hooks'

const btn = 'border-2 border-line px-2 py-2 font-pixel text-[8px] text-ink hover:border-hi hover:text-hi active:bg-hi active:text-bg'

function Toggle({ k, label }: { k: keyof Settings; label: string }) {
  const rt = useRuntime()
  const on = rt.game.state.settings[k]
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => rt.setSetting(k, !on)} className="flex w-full items-center gap-3 py-1.5 text-left">
      <span className="font-pixel text-[9px] text-hi">[{on ? 'X' : ' '}]</span>
      <span className={`font-pixel text-[9px] ${on ? 'text-ink' : 'text-dim'}`}>{label}</span>
      {k === 'sound' && (on ? <GiSpeaker className="ml-auto size-4 text-dim" /> : <GiSpeakerOff className="ml-auto size-4 text-mute" />)}
      {k === 'music' && <GiMusicalNotes className={`ml-auto size-4 ${on ? 'text-dim' : 'text-mute'}`} />}
    </button>
  )
}

export function SystemTab() {
  const rt = useRuntime()
  const s = rt.game.state
  const [code, setCode] = useState('')
  const [importText, setImportText] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [confirm, setConfirm] = useState<'import' | 'reset' | null>(null)

  const doExport = async () => {
    const c = rt.exportCode()
    setCode(c)
    try {
      await navigator.clipboard.writeText(c)
      setMsg({ text: 'SAVE CODE COPIED' })
    } catch {
      setMsg({ text: 'COPY THE CODE BELOW' })
    }
  }

  const doImport = () => {
    try {
      rt.importCode(importText)
      setImportText('')
      setConfirm(null)
      setMsg({ text: 'SAVE LOADED' })
    } catch (e) {
      setConfirm(null)
      setMsg({ text: e instanceof SaveError ? e.message.toUpperCase() : 'IMPORT FAILED', bad: true })
    }
  }

  const st = s.stats
  const rows: [string, string][] = [
    ['PLAY TIME', fmtTime(st.playTime)],
    ['DESTROYED', fmt(st.kills)],
    ['TAPS', fmt(st.clicks)],
    ['EARNED', fmt(s.totalPixels)],
    ['CRITS', fmt(st.crits)],
    ['BEST COMBO', `x${st.maxCombo}`],
    ['GOLDEN', fmt(st.goldenKills)],
    ['BY DRONES', fmt(st.droneKills)],
    ['BY BOMBS', fmt(st.bombKills)],
    ['BY LASERS', fmt(st.laserKills)],
    ['BY CHAINS', fmt(st.chainKills)],
    ['NUKES', fmt(st.nukes)],
  ]

  return (
    <div className="space-y-4">
      <section className="frame p-3 pt-4">
        <span className="frame-title">OPTIONS</span>
        <Toggle k="sound" label="SOUND" />
        <Toggle k="music" label="MUSIC" />
        <Toggle k="shake" label="SCREEN SHAKE" />
        <Toggle k="haptics" label="HAPTICS" />
      </section>

      <section className="frame space-y-2 p-3 pt-4">
        <span className="frame-title">SAVE DATA</span>
        <div className="text-[17px] leading-tight text-dim">
          {rt.canPersist ? 'Autosaves every 15s on this device.' : 'Storage is blocked. Use export to keep progress.'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`${btn} flex items-center justify-center gap-1.5`} onClick={() => setMsg({ text: rt.save() ? 'SAVED' : 'SAVE FAILED', bad: !rt.canPersist })}>
            <GiSave className="size-3.5" /> SAVE
          </button>
          <button type="button" className={btn} onClick={() => void doExport()}>
            EXPORT
          </button>
        </div>
        {code && (
          <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()} className="h-16 w-full resize-none border-2 border-line bg-bg p-1 font-term text-[14px] break-all text-dim outline-none" />
        )}
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste a save code to import..."
          className="h-14 w-full resize-none border-2 border-line bg-bg p-1 font-term text-[16px] text-ink outline-none placeholder:text-mute focus:border-dim"
        />
        {confirm === 'import' ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${btn} border-red! text-red!`} onClick={doImport}>
              OVERWRITE
            </button>
            <button type="button" className={btn} onClick={() => setConfirm(null)}>
              CANCEL
            </button>
          </div>
        ) : (
          <button type="button" disabled={!importText.trim()} className={`${btn} w-full disabled:opacity-40`} onClick={() => setConfirm('import')}>
            IMPORT
          </button>
        )}
        {msg && <div className={`font-pixel text-[8px] leading-relaxed ${msg.bad ? 'text-red' : 'text-gold'}`}>&gt; {msg.text}</div>}
      </section>

      <section className="frame p-3 pt-4">
        <span className="frame-title">STATS</span>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-pixel text-[7px] leading-5 text-dim">{k}</dt>
              <dd className="text-right text-[18px] leading-5 text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="frame border-red/40 p-3 pt-4">
        <span className="frame-title text-red!">DANGER</span>
        {confirm === 'reset' ? (
          <div className="space-y-2">
            <div className="font-pixel text-[8px] leading-relaxed text-red">WIPE ALL PROGRESS? THIS CANNOT BE UNDONE.</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`${btn} border-red! text-red!`}
                onClick={() => {
                  rt.reset()
                  setConfirm(null)
                  setCode('')
                  setMsg(null)
                }}
              >
                YES, WIPE
              </button>
              <button type="button" className={btn} onClick={() => setConfirm(null)}>
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={`${btn} w-full`} onClick={() => setConfirm('reset')}>
            RESET PROGRESS
          </button>
        )}
      </section>
    </div>
  )
}
