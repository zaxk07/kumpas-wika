import { ChevronLeft, ChevronRight } from 'lucide-react'
import { animate, motion, useMotionValue, useReducedMotion, type PanInfo } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { buildHand, DEMO_H, DEMO_W } from '../../lib/demo'
import { LOCK_DYNAMIC_MS, LOCK_STATIC_MS, REPEAT_COOLDOWN_MS, WINDOW_MS } from '../../lib/engine'
import { glossToSentence, groupGlosses } from '../../lib/grammar'
import type { SignId } from '../../lib/types'
import { GlossPills } from '../GlossPills'
import { SectionHeader } from './SectionHeader'

/* ---------- Spread 01: landmark extraction ---------- */

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const HAND = (() => {
  const lm = buildHand('OPEN', { wx: 0.5, wy: 0.5, palm: 0.2 }, 0)
  const raw = lm.map((p) => [(1 - p.x) * (DEMO_W / DEMO_H), p.y] as const)
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY)
  const k = 220 / span
  return raw.map(([x, y]) => [150 + (x - minX) * k - ((Math.max(...xs) - minX) * k) / 2, 30 + (y - minY) * k] as const)
})()

function LandmarkVisual({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const [wx, wy] = HAND[0]
  return (
    <svg viewBox="0 0 300 290" className="h-full w-full" role="img" aria-label="Hand skeleton with 21 numbered landmarks, normalized to the wrist">
      <defs>
        <pattern id="arch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="rgb(255 255 255 / 0.05)" />
        </pattern>
      </defs>
      <rect width="300" height="290" fill="url(#arch-grid)" />
      {/* mirror axis */}
      <line x1="150" y1="6" x2="150" y2="284" stroke="rgb(34 211 238 / 0.35)" strokeDasharray="3 4" />
      <text x="156" y="16" className="fill-cyan-300/70 font-mono" fontSize="8">
        x' = 1 - x
      </text>
      {/* wrist-origin axes */}
      <line x1={wx - 60} y1={wy} x2={wx + 60} y2={wy} stroke="rgb(16 185 129 / 0.4)" />
      <line x1={wx} y1={wy - 230} x2={wx} y2={wy + 10} stroke="rgb(16 185 129 / 0.15)" />
      <text x={wx + 8} y={wy + 14} className="fill-emerald-300/80 font-mono" fontSize="8">
        origin = wrist[0]
      </text>
      {BONES.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={HAND[a][0]}
          y1={HAND[a][1]}
          x2={HAND[b][0]}
          y2={HAND[b][1]}
          stroke="rgb(250 250 250 / 0.35)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: active || reduced ? 1 : 0 }}
          transition={{ duration: 0.5, delay: reduced ? 0 : i * 0.02 }}
        />
      ))}
      {HAND.map(([x, y], i) => (
        <motion.g key={i} initial={false} animate={{ opacity: active || reduced ? 1 : 0 }} transition={{ delay: reduced ? 0 : 0.2 + i * 0.025 }}>
          <circle cx={x} cy={y} r={i === 0 ? 4.5 : 3} className={i === 0 ? 'fill-emerald-400' : i % 4 === 0 ? 'fill-cyan-300' : 'fill-zinc-200'} />
          <text x={x + 5} y={y - 4} fontSize="7" className="fill-zinc-500 font-mono">
            {i}
          </text>
        </motion.g>
      ))}
    </svg>
  )
}

/* ---------- Spread 02: temporal window ---------- */

const envelope = (t: number) => Math.exp(-(((t - 0.45) / 0.22) ** 2))

const TRACE = (() => {
  const pts: [number, number][] = []
  for (let i = 0; i <= 120; i++) {
    const t = i / 120
    pts.push([20 + t * 260, 90 - Math.sin(t * Math.PI * 9) * 46 * envelope(t)])
  }
  return pts
})()
// sin(9πt) crosses zero at t = k/9; mark the ones inside the active part of the gesture.
const ZERO_X = Array.from({ length: 10 }, (_, k) => k / 9)
  .filter((t) => envelope(t) > 0.12)
  .map((t) => 20 + t * 260)

function TemporalVisual({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const span = 260 // 2.6 s across the axis
  const winW = (WINDOW_MS / 2600) * span
  const lockX = 20 + 0.72 * span
  const coolW = (REPEAT_COOLDOWN_MS / 2600) * span
  return (
    <svg viewBox="0 0 300 200" className="h-full w-full" role="img" aria-label="A one second window slides over the horizontal velocity of the hand; zero crossings mark oscillation, followed by a refractory cooldown">
      <line x1="20" y1="90" x2="280" y2="90" stroke="rgb(255 255 255 / 0.12)" />
      <text x="20" y="20" fontSize="8" className="fill-zinc-500 font-mono">
        dx/dt (palm-lengths / s)
      </text>
      <rect x={lockX} y="30" width={Math.min(coolW, 280 - lockX)} height="120" className="fill-amber-400/[0.07]" />
      <line x1={lockX} y1="30" x2={lockX} y2="150" stroke="rgb(16 185 129 / 0.8)" strokeDasharray="2 3" />
      <text x={lockX + 4} y="40" fontSize="7.5" className="fill-amber-300/80 font-mono">
        refractory {REPEAT_COOLDOWN_MS} ms
      </text>
      <text x={lockX + 4} y="160" fontSize="7.5" className="fill-emerald-300/80 font-mono">
        lock
      </text>
      <motion.path
        d={`M${TRACE.map((p) => p.join(' ')).join(' L')}`}
        fill="none"
        stroke="#10b981"
        strokeWidth="1.6"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: active || reduced ? 1 : 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      {ZERO_X.map((x) => (
        <line key={x} x1={x} y1="86" x2={x} y2="94" stroke="rgb(34 211 238 / 0.9)" />
      ))}
      <motion.g
        initial={false}
        animate={active && !reduced ? { x: [0, span - winW, 0] } : { x: 0.5 * (span - winW) }}
        transition={active && !reduced ? { duration: 6, ease: 'easeInOut', repeat: Infinity } : { duration: 0 }}
      >
        <rect x="20" y="26" width={winW} height="128" rx="3" fill="rgb(255 255 255 / 0.03)" stroke="rgb(250 250 250 / 0.35)" />
        <text x="24" y="148" fontSize="7.5" className="fill-zinc-300 font-mono">
          window {(WINDOW_MS / 1000).toFixed(1)} s
        </text>
      </motion.g>
      <g fontSize="7.5" className="fill-zinc-500 font-mono">
        <text x="20" y="185">
          zero-crossings
        </text>
        <line x1="86" y1="182" x2="86" y2="188" stroke="rgb(34 211 238 / 0.9)" />
        <text x="100" y="185">
          static lock {LOCK_STATIC_MS} ms · moving lock {LOCK_DYNAMIC_MS} ms
        </text>
      </g>
    </svg>
  )
}

/* ---------- Spread 03: gloss to sentence ---------- */

const EXAMPLES: SignId[][] = [
  ['AKO', 'KAILANGAN', 'TULONG'],
  ['KUMUSTA', 'IKAW'],
  ['Z', 'A', 'K', 'I'],
]
const SAMPLES = EXAMPLES.map((ids) => {
  const tokens = groupGlosses(ids.map((id, key) => ({ id, key })))
  return { tokens, sentence: glossToSentence(tokens) }
})

function GlossVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {SAMPLES.map(({ tokens, sentence }, i) => (
        <div key={i} className="rounded-xl border border-white/[0.06] bg-obsidian/60 p-3">
          <GlossPills tokens={tokens} standard="FSL" size="sm" animate={false} />
          <div className="mt-2 flex items-start gap-2">
            <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-zinc-600">FIL</span>
            <p className="text-sm text-fg">{sentence.fil}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-zinc-600">EN</span>
            <p className="text-sm text-zinc-400">{sentence.en}</p>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-emerald-500/70">{sentence.rules.join(', ')}</span>
          </div>
        </div>
      ))}
      <p className="font-mono text-[10px] text-zinc-600">Live output of the in-app grammar engine.</p>
    </div>
  )
}

/* ---------- carousel ---------- */

interface Spread {
  title: string
  kicker: string
  body: ReactNode
  points: string[]
  visual: (active: boolean) => ReactNode
}

const SPREADS: Spread[] = [
  {
    kicker: 'Spatial',
    title: '21-Point Spatial Landmark Extraction',
    body: 'MediaPipe Hand Landmarker returns 21 joints per hand on every frame. Each frame is mirrored to match the selfie view, re-centred on the wrist, rotated so the fingers point along one axis, and scaled so the palm length is 1. The same handshape reads the same near or far, tilted or level, left hand or right.',
    points: ['Finger extension measured in 3D, so a finger pointing at the camera still counts', 'Wrist-relative, palm-normalized geometry', 'Upper-body pose anchors chin and chest signs'],
    visual: (a) => <LandmarkVisual active={a} />,
  },
  {
    kicker: 'Temporal',
    title: 'Sliding-Window Temporal Motion Analysis',
    body: `Every reading is time-stamped into a ${(WINDOW_MS / 1000).toFixed(1)} s ring buffer. From that window the engine derives velocity vectors (dx, dy), net displacement, path length and oscillation zero-crossings, which separate a wave from a nod from a circle.`,
    points: [
      `Static signs lock after ${LOCK_STATIC_MS} ms of a still, stable shape`,
      `Moving signs lock after ${LOCK_DYNAMIC_MS} ms of matching motion`,
      `${REPEAT_COOLDOWN_MS} ms refractory gate stops repeat spam`,
    ],
    visual: (a) => <TemporalVisual active={a} />,
  },
  {
    kicker: 'Language',
    title: 'Gloss-to-Natural-Sentence Engine',
    body: 'Locked signs arrive as raw gloss tokens in signing order. Fingerspelled letters fuse into words, then phrase rules rewrite the gloss into natural Filipino and English. The sentence is closed and punctuated after a two-second pause.',
    points: ['Fingerspelling runs merge into one word', 'Filipino verb-first order with ko and ng', 'English rewritten as subject, verb, object'],
    visual: () => <GlossVisual />,
  },
]

export function ArchitectureSpreads() {
  const reduced = useReducedMotion()
  const viewport = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const x = useMotionValue(0)

  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const target = -index * width
    if (reduced) {
      x.set(target)
      return
    }
    const ctl = animate(x, target, { type: 'spring', stiffness: 320, damping: 36 })
    return () => ctl.stop()
  }, [index, width, reduced, x])

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(SPREADS.length - 1, i))), [])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2
    if (swipe < -width * 0.18) go(index + 1)
    else if (swipe > width * 0.18) go(index - 1)
    else animate(x, -index * width, { type: 'spring', stiffness: 320, damping: 36 })
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    }
  }

  return (
    <section id="architecture" className="mx-auto max-w-[1400px] px-4 pt-24 sm:px-6 sm:pt-32">
      <SectionHeader
        index="02"
        kicker="Architecture"
        title="How a gesture becomes a sentence"
        lede="Three stages, all running locally. Drag, flick, or use the arrow keys to turn the page."
      />

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Kumpas WIKA pipeline"
        tabIndex={0}
        onKeyDown={onKey}
        className="mt-10 rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
      >
        <div ref={viewport} className="overflow-hidden rounded-[20px]">
          <motion.div
            className="flex cursor-grab touch-pan-y active:cursor-grabbing"
            style={{ x }}
            drag="x"
            dragConstraints={{ left: -(SPREADS.length - 1) * width, right: 0 }}
            dragElastic={0.12}
            dragMomentum={false}
            onDragEnd={onDragEnd}
          >
            {SPREADS.map((s, i) => (
              <article
                key={s.title}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SPREADS.length}: ${s.title}`}
                aria-hidden={i !== index}
                className="w-full shrink-0 select-none"
                style={{ width: width || '100%' }}
              >
                <div className="relative grid overflow-hidden rounded-[20px] border border-white/[0.08] bg-surface md:grid-cols-2">
                  {/* gutter shadow */}
                  <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-12 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgb(0_0_0/0.35),transparent)] md:block" />
                  <div className="flex flex-col p-6 sm:p-10">
                    <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
                      <span>
                        Spread <span className="text-signal">0{i + 1}</span>
                      </span>
                      <span>{s.kicker}</span>
                    </div>
                    <h3 className="mt-8 text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-fg sm:text-3xl">{s.title}</h3>
                    <p className="mt-4 text-sm leading-relaxed text-pretty text-zinc-400 sm:text-[15px]">{s.body}</p>
                    <ul className="mt-6 space-y-2 border-t border-white/[0.06] pt-5">
                      {s.points.map((pt) => (
                        <li key={pt} className="flex gap-3 text-sm text-zinc-300">
                          <span className="mt-2 h-px w-3 shrink-0 bg-signal" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-8 font-mono text-[10px] text-zinc-600">p. {String(i * 2 + 1).padStart(2, '0')}</div>
                  </div>
                  <div className="flex flex-col justify-center border-t border-white/[0.06] bg-surface-2/50 p-6 sm:p-10 md:border-t-0 md:border-l">
                    <div className="min-h-[280px] sm:h-[340px]">{s.visual(i === index)}</div>
                    <div className="pt-4 text-right font-mono text-[10px] text-zinc-600">p. {String(i * 2 + 2).padStart(2, '0')}</div>
                  </div>
                </div>
              </article>
            ))}
          </motion.div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2" role="tablist" aria-label="Choose spread">
            {SPREADS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Spread ${i + 1}: ${s.title}`}
                onClick={() => go(i)}
                className="group grid h-6 place-items-center"
              >
                <span className={`block h-1 rounded-full transition-all duration-300 ${i === index ? 'w-8 bg-signal' : 'w-3 bg-zinc-700 group-hover:bg-zinc-500'}`} />
              </button>
            ))}
            <span className="ml-2 font-mono text-[11px] text-zinc-500 tabular-nums">
              0{index + 1} / 0{SPREADS.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous spread"
              className="grid size-9 place-items-center rounded-full border border-white/[0.08] text-zinc-300 transition hover:border-white/20 active:scale-[0.95] disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === SPREADS.length - 1}
              aria-label="Next spread"
              className="grid size-9 place-items-center rounded-full border border-white/[0.08] text-zinc-300 transition hover:border-white/20 active:scale-[0.95] disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
