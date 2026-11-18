import { ArrowRight, Captions, Crosshair, GraduationCap, MonitorUp, Route } from 'lucide-react'
import { BEGINNER_CIRCUIT } from '../../lib/coach'
import { SIGNS } from '../../lib/signs'
import { SignDiagram } from '../SignDiagram'
import { SectionHeader } from './SectionHeader'

const STEPS = [
  { Icon: MonitorUp, title: 'Choose an input', body: 'Live camera, an uploaded .mp4/.webm/.mov, a captured tab, or the built-in demo signer.' },
  { Icon: Crosshair, title: 'Frame your hand', body: 'Keep the signing hand inside the hand zone at chest height, lit from the front.' },
  { Icon: () => <span className="block size-3.5 rounded-full border-2 border-emerald-400 border-r-transparent" />, title: 'Hold to lock', body: 'The ring fills while a sign is recognized. When it closes, the sign is committed.' },
  { Icon: Captions, title: 'Build a sentence', body: 'Locked signs become natural Filipino and English. Pause two seconds to finish the line.' },
]

interface Props {
  onStartTour: () => void
  onStartCircuit: () => void
}

export function TutorialSection({ onStartTour, onStartCircuit }: Props) {
  return (
    <section id="tutorial" className="mx-auto max-w-[1400px] px-4 pt-24 sm:px-6 sm:pt-32">
      <SectionHeader
        index="02"
        kicker="Tutorial"
        title="Learn the studio, then practice"
        lede="A four-step walkthrough of the controls, and a coach that checks your handshape and movement live, sign by sign."
      />

      <div className="mt-10 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-[20px] border border-white/[0.08] bg-surface p-5 sm:p-8">
          <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {STEPS.map(({ Icon, title, body }, i) => (
              <li key={title} className="flex gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                    <Icon size={16} />
                  </span>
                  <span className="font-mono text-[10px] text-zinc-600">0{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onStartTour}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-medium text-obsidian transition hover:bg-white active:scale-[0.97]"
          >
            <Route size={15} /> Start the walkthrough
          </button>
        </div>

        <div className="flex flex-col rounded-[20px] border border-white/[0.08] bg-surface p-5 sm:p-8">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
            <GraduationCap size={14} className="text-emerald-400" /> Beginner circuit
          </div>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-fg">Five signs to start with</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            The coach shows each sign, tells you what to fix, and moves on once the recognizer locks it.
          </p>
          <ol className="mt-5 grid grid-cols-5 gap-2">
            {BEGINNER_CIRCUIT.map((id, i) => (
              <li key={id} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-white/[0.06] bg-surface-2/60 px-1 py-2.5">
                <SignDiagram id={id} size={40} />
                <span className="w-full truncate text-center text-[11px] font-medium text-zinc-300">{SIGNS[id].fil}</span>
                <span className="font-mono text-[9px] text-zinc-600">0{i + 1}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onStartCircuit}
            className="mt-auto inline-flex items-center gap-2 self-start rounded-full bg-signal px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 active:scale-[0.97] max-lg:mt-6"
          >
            Start practicing <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}
