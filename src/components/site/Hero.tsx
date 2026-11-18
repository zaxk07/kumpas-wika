import { ArrowDown, ArrowUpRight, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ModelStatus } from '../../hooks/useLandmarkers'
import { WINDOW_MS } from '../../lib/engine'
import { GlyphBackground } from './GlyphBackground'

interface Props {
  paused: boolean
  model: ModelStatus
  delegate?: string
  onLaunch: () => void
  onDemo: () => void
}

function Pill({ label, state }: { label: string; state: 'ok' | 'wait' | 'err' }) {
  const dot = state === 'ok' ? 'bg-signal' : state === 'wait' ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <li className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-surface/80 px-3 py-1.5 font-mono text-[11px] text-zinc-300 backdrop-blur">
      <span className="relative flex size-1.5">
        {state === 'ok' && <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${dot}`} />}
        <span className={`relative size-1.5 rounded-full ${dot}`} />
      </span>
      {label}
    </li>
  )
}

export function Hero({ paused, model, delegate, onLaunch, onDemo }: Props) {
  const reduced = useReducedMotion()
  const rise = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
          animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
          transition: { duration: 0.7, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] as const },
        }

  const modelState = model === 'ready' ? 'ok' : model === 'loading' ? 'wait' : 'err'
  const modelLabel = model === 'ready' ? `MediaPipe WASM/${delegate === 'CPU' ? 'CPU' : 'WebGL'}` : model === 'loading' ? 'MediaPipe WASM/WebGL loading' : 'MediaPipe unavailable'

  return (
    <section id="top" className="relative isolate overflow-hidden border-b border-white/[0.06]">
      <GlyphBackground paused={paused} />
      <div className="mx-auto flex min-h-[min(72vh,720px)] max-w-[1400px] flex-col justify-end px-4 pt-20 pb-12 sm:px-6 sm:pt-28 sm:pb-16">
        <motion.p {...rise(0)} className="font-mono text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
          <span className="text-signal">FSL / ASL</span> · Real-time · On-device
        </motion.p>
        <motion.h1
          {...rise(1)}
          className="mt-5 max-w-4xl text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-fg sm:text-6xl lg:text-7xl"
        >
          From a held handshape to a moving sentence.
        </motion.h1>
        <motion.p {...rise(2)} className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-zinc-400 sm:text-lg">
          Kumpas WIKA reads Filipino and American Sign Language from your webcam. Static handshapes are classified frame by frame; moving signs are read from a{' '}
          {(WINDOW_MS / 1000).toFixed(1)}-second window of motion. Both are then written out as natural Filipino and English subtitles.
        </motion.p>

        <motion.ul {...rise(3)} className="mt-7 flex flex-wrap gap-2" aria-label="System status">
          <Pill label={modelLabel} state={modelState} />
          <Pill label={`Time-Indexed ${(WINDOW_MS / 1000).toFixed(1)}s Sequence Buffer`} state="ok" />
          <Pill label="FSL + ASL Bilingual NLP" state="ok" />
        </motion.ul>

        <motion.div {...rise(4)} className="mt-9 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLaunch}
            className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-[0_0_0_1px_rgb(16_185_129/0.4),0_10px_40px_-10px_rgb(16_185_129/0.6)] transition hover:bg-emerald-400 active:scale-[0.97]"
          >
            Launch Live Translator <ArrowUpRight size={16} />
          </button>
          <button
            type="button"
            onClick={onDemo}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-surface/70 px-5 py-2.5 text-sm font-medium text-zinc-200 backdrop-blur transition hover:border-white/20 active:scale-[0.97]"
          >
            <Sparkles size={15} /> Watch the demo
          </button>
          <a href="#architecture" className="ml-1 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300">
            How it works <ArrowDown size={14} />
          </a>
        </motion.div>
      </div>
    </section>
  )
}
