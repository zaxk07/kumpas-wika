import { AudioLines, Cpu, Languages, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { LETTERS, SIGNS, WORD_ORDER } from '../../lib/signs'
import type { SignId } from '../../lib/types'
import { SignDiagram } from '../SignDiagram'
import { SectionHeader } from './SectionHeader'

interface Cap {
  icon: LucideIcon
  kicker: string
  title: string
  stat: string
  statLabel: string
  body: string
  visual: ReactNode
}

function PipelineVisual() {
  const steps = ['Webcam frame', 'Web Worker · WASM', 'GPU delegate · WebGL', 'Sign engine', 'Captions']
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600 tabular-nums">0{i + 1}</span>
          <span className="flex-1 rounded-lg border border-white/[0.06] bg-obsidian/70 px-3 py-2 font-mono text-[11px] text-zinc-300">{s}</span>
        </li>
      ))}
      <li className="flex items-center gap-3 pt-1">
        <span className="font-mono text-[10px] text-zinc-600">--</span>
        <span className="flex-1 rounded-lg border border-dashed border-rose-400/25 px-3 py-2 font-mono text-[11px] text-zinc-500 line-through decoration-rose-400/50">
          Upload to server
        </span>
      </li>
    </ol>
  )
}

const SHOWCASE: SignId[] = ['KUMUSTA', 'SALAMAT', 'MAHAL_KITA', 'TULONG', 'OO', 'HINDI', 'A', 'W']

function CoverageVisual() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {SHOWCASE.map((id) => (
        <div key={id} className="flex flex-col items-center gap-1 rounded-lg border border-white/[0.06] bg-obsidian/70 p-2">
          <SignDiagram id={id} size={40} active={id === 'MAHAL_KITA'} />
          <span className="max-w-full truncate font-mono text-[9px] text-zinc-500">{SIGNS[id].kind === 'letter' ? id : SIGNS[id].glossFSL}</span>
        </div>
      ))}
    </div>
  )
}

function CaptionVisual() {
  const rows = [
    ['14:02:11', 'Kumusta ka?', 'How are you?'],
    ['14:02:16', 'Kailangan ko ng tulong.', 'I need help.'],
    ['14:02:23', 'Salamat.', 'Thank you.'],
  ]
  return (
    <div className="space-y-2">
      {rows.map(([t, fil, en]) => (
        <div key={t} className="rounded-lg border border-white/[0.06] bg-obsidian/70 px-3 py-2">
          <div className="font-mono text-[10px] text-zinc-600">{t}</div>
          <div className="text-sm text-fg">{fil}</div>
          <div className="text-xs text-zinc-500">{en}</div>
        </div>
      ))}
      <div className="flex h-6 items-end gap-0.5 pt-1" aria-hidden>
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="w-1 rounded-full bg-signal/60" style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%` }} />
        ))}
      </div>
    </div>
  )
}

const CAPS: Cap[] = [
  {
    icon: Cpu,
    kicker: 'Privacy',
    title: 'Zero-Server Edge Inference',
    stat: '0',
    statLabel: 'frames uploaded',
    body: 'MediaPipe runs as WebAssembly inside a Web Worker, on the GPU through WebGL when it is available. Classification, the temporal engine and the grammar all run in the page. No video, landmarks or text ever leave the device, and there is no network round-trip to wait for.',
    visual: <PipelineVisual />,
  },
  {
    icon: Languages,
    kicker: 'Coverage',
    title: 'Bilingual FSL and ASL Coverage',
    stat: `${WORD_ORDER.length} + ${LETTERS.length}`,
    statLabel: 'conversational signs + A–Z fingerspelling',
    body: 'Switch between Filipino Sign Language, American Sign Language, or both at once. Where the two differ, each variant is recognized and labelled. Every sign ships with a vector hand diagram generated from the same hand model the recognizer is tested against.',
    visual: <CoverageVisual />,
  },
  {
    icon: AudioLines,
    kicker: 'Output',
    title: 'Accessible Voice and Caption Output',
    stat: 'FIL / EN',
    statLabel: 'captions, transcript, speech',
    body: 'Live closed captions show the forming sentence as you sign. Finished sentences land in a timestamped transcript you can copy out in one click, and Web Speech synthesis can read each one aloud for hearing participants.',
    visual: <CaptionVisual />,
  },
]

function StackCard({ cap, i, n, progress, reduced }: { cap: Cap; i: number; n: number; progress: MotionValue<number>; reduced: boolean }) {
  const start = i / n
  const scale = useTransform(progress, [start, 1], [1, 1 - (n - 1 - i) * 0.045])
  const dim = useTransform(progress, [start, 1], [0, (n - 1 - i) * 0.25])
  const Icon = cap.icon
  return (
    <div className="sticky top-0 flex h-[100svh] items-start justify-center" style={{ paddingTop: `calc(88px + ${i * 22}px)` }}>
      <motion.article
        style={reduced ? undefined : { scale }}
        className="relative w-full origin-top overflow-hidden rounded-[20px] border border-white/[0.08] bg-surface shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.8)]"
      >
        <div className="grid gap-6 p-6 sm:p-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                <Icon size={17} />
              </span>
              <span className="font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
                0{i + 1} · {cap.kicker}
              </span>
            </div>
            <h3 className="mt-6 text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-fg sm:text-3xl">{cap.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-pretty text-zinc-400 sm:text-[15px]">{cap.body}</p>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/[0.06] pt-5 md:mt-auto">
              <span className="font-mono text-3xl font-medium whitespace-nowrap text-fg tabular-nums sm:text-4xl">{cap.stat}</span>
              <span className="text-xs text-zinc-500">{cap.statLabel}</span>
            </div>
          </div>
          <div className="hidden min-w-0 rounded-2xl border border-white/[0.06] bg-surface-2/60 p-4 sm:block sm:p-5">{cap.visual}</div>
        </div>
        {!reduced && i < n - 1 && <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-obsidian" style={{ opacity: dim }} />}
      </motion.article>
    </div>
  )
}

export function CapabilityStack() {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() ?? false
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  return (
    <section id="capabilities" className="mx-auto max-w-[1400px] px-4 pt-24 sm:px-6 sm:pt-32">
      <SectionHeader index="04" kicker="Capabilities" title="Built to run anywhere a browser does" lede="What the pipeline buys you in practice." />
      <div ref={ref} className="relative mt-4">
        {CAPS.map((c, i) => (
          <StackCard key={c.title} cap={c} i={i} n={CAPS.length} progress={scrollYProgress} reduced={reduced} />
        ))}
      </div>
    </section>
  )
}
