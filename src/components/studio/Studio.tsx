import { Camera, CameraOff, Loader2, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { RefObject } from 'react'
import type { LiveState, Source } from '../../hooks/useDetectionLoop'
import type { ModelStatus } from '../../hooks/useLandmarkers'
import type { Phrase } from '../../hooks/useSubtitles'
import type { EngineOutput } from '../../lib/engine'
import { SIGNS } from '../../lib/signs'
import type { Standard, SubtitleMode } from '../../lib/types'
import { CaptionBar } from '../CaptionBar'
import { Segmented } from '../Segmented'
import { SignDiagram } from '../SignDiagram'
import { StatusBadges } from '../StatusBadges'
import { Toolbar } from '../Toolbar'
import { TranscriptPanel } from '../TranscriptPanel'
import { SectionHeader } from '../site/SectionHeader'

const STANDARDS = [
  { id: 'FSL' as const, label: 'FSL', title: 'Filipino Sign Language' },
  { id: 'ASL' as const, label: 'ASL', title: 'American Sign Language' },
  { id: 'BOTH' as const, label: 'FSL+ASL', title: 'Recognize both variants' },
]
const MODES = [
  { id: 'FIL' as const, label: 'Filipino' },
  { id: 'EN' as const, label: 'English' },
  { id: 'BI' as const, label: 'FIL+EN' },
]

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  source: Source
  demo: boolean
  cameraLive: boolean
  cameraStarting: boolean
  cameraError: string | null
  model: { status: ModelStatus; error?: string; delegate?: string; thread?: string }
  live: LiveState
  out: EngineOutput | null
  phrases: Phrase[]
  currentPhrase: Phrase | null
  mode: SubtitleMode
  onModeChange: (m: SubtitleMode) => void
  standard: Standard
  onStandardChange: (s: Standard) => void
  threshold: number
  onThresholdChange: (v: number) => void
  autoSpeak: boolean
  onToggleSpeak: () => void
  onBackspace: () => void
  onClear: () => void
  onToggleDemo: () => void
  onStartCamera: () => void
  onStopCamera: () => void
}

function Tile({ label, value, unit, tone = 'zinc', meter }: { label: string; value: string; unit?: string; tone?: 'zinc' | 'emerald' | 'amber' | 'rose'; meter?: number }) {
  const color = { zinc: 'text-zinc-200', emerald: 'text-emerald-400', amber: 'text-amber-300', rose: 'text-rose-300' }[tone]
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-surface-2/70 px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-[0.14em] text-zinc-500 uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
        <span className={`text-lg leading-none font-medium ${color}`}>{value}</span>
        {unit && <span className="text-[11px] text-zinc-500">{unit}</span>}
      </div>
      {meter !== undefined && (
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-signal" style={{ width: `${Math.round(meter * 100)}%`, transition: 'width 120ms linear' }} />
        </div>
      )}
    </div>
  )
}

const fpsTone = (v: number) => (v >= 24 ? 'emerald' : v >= 12 ? 'amber' : v > 0 ? 'rose' : 'zinc') as 'emerald' | 'amber' | 'rose' | 'zinc'

export function Studio({ videoRef, canvasRef, ...p }: Props) {
  const { out, source, live } = p
  const conf = out?.candidate?.confidence ?? 0

  return (
    <section id="studio" className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 sm:pt-16">
      <SectionHeader index="01" kicker="Studio" title="Live translator console" lede="Camera in, skeleton overlaid, gloss tokens locked, a full sentence out. Everything below runs in this tab." />

      <div id="studio-console" className="mt-8 rounded-[20px] border border-white/[0.08] bg-surface p-2 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.8)] sm:p-3">
        {/* Studio strip */}
        <div className="flex flex-col gap-2 px-1 pt-1 pb-3 sm:px-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto flex items-center gap-2 pr-2">
              <span className={`size-2 rounded-full ${source === 'off' ? 'bg-zinc-600' : 'animate-pulse bg-signal'}`} />
              <span className="font-mono text-[11px] tracking-[0.14em] text-zinc-400 uppercase">
                {source === 'off' ? 'Idle' : source === 'demo' ? 'Demo signer' : 'Camera live'}
              </span>
            </div>
            <Segmented label="Subtitle language" value={p.mode} onChange={p.onModeChange} options={MODES} />
            <Segmented label="Sign language standard" value={p.standard} onChange={p.onStandardChange} options={STANDARDS} />
            <button
              type="button"
              role="switch"
              aria-checked={p.demo}
              onClick={p.onToggleDemo}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97] ${
                p.demo ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/[0.08] bg-obsidian/80 text-zinc-300 hover:border-white/20'
              }`}
            >
              <Sparkles size={14} />
              Demo
              <span className={`relative h-4 w-7 rounded-full transition ${p.demo ? 'bg-amber-400/70' : 'bg-zinc-700'}`}>
                <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${p.demo ? 'left-3.5' : 'left-0.5'}`} />
              </span>
            </button>
            {p.cameraLive ? (
              <button
                type="button"
                onClick={p.onStopCamera}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 active:scale-[0.97]"
              >
                <CameraOff size={14} /> Stop camera
              </button>
            ) : (
              <button
                type="button"
                onClick={p.onStartCamera}
                disabled={p.cameraStarting}
                className="inline-flex items-center gap-2 rounded-lg bg-signal px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-60"
              >
                {p.cameraStarting ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                Start camera
              </button>
            )}
          </div>
          <Toolbar threshold={p.threshold} onThresholdChange={p.onThresholdChange} hint={live.hint} />
        </div>

        <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/[0.08] bg-black sm:aspect-video">
              <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity ${p.cameraLive && !p.demo ? 'opacity-100' : 'opacity-0'}`}
                playsInline
                muted
                autoPlay
              />
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-testid="overlay" />

              <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
                <StatusBadges
                  inferFps={live.inferFps}
                  model={p.model.status}
                  delegate={p.model.delegate}
                  thread={p.model.thread}
                  source={source}
                  shape={out?.hasHand ? out.shape : '—'}
                />
                {source !== 'off' && (
                  <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-rose-500/30 bg-obsidian/70 px-2 py-1 font-mono text-[10px] tracking-wide text-rose-300 uppercase">
                    <span className="size-1.5 animate-pulse rounded-full bg-rose-400" />
                    {source === 'demo' ? 'Demo' : 'Rec'}
                  </div>
                )}
              </div>

              {source === 'demo' && live.acting && (
                <div className="absolute top-14 right-3 rounded-md border border-amber-400/30 bg-obsidian/70 px-2 py-1 text-xs text-amber-200 sm:top-[3.25rem]">
                  Now signing: {SIGNS[live.acting].kind === 'letter' ? `the letter ${live.acting}` : SIGNS[live.acting].fil}
                </div>
              )}

              <AnimatePresence>
                {source === 'off' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center p-6 pb-40">
                    <div className="max-w-md text-center">
                      <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-white/[0.08] bg-surface-2">
                        <SignDiagram id="MAHAL_KITA" size={56} active />
                      </div>
                      <h3 className="text-lg font-semibold tracking-tight text-fg">Sign, and watch it become a sentence</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        Turn on your camera and start signing, or watch the demo to see signs like{' '}
                        <span className="font-mono text-zinc-300">AKO · KAILANGAN · TULONG</span> turn into “Kailangan ko ng tulong.”
                      </p>
                      {p.cameraError && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{p.cameraError}</p>}
                      {p.model.status === 'error' && (
                        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                          Hand tracking couldn’t load ({p.model.error}). The demo still works without it.
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={p.onStartCamera}
                          className="inline-flex items-center gap-2 rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 active:scale-[0.97]"
                        >
                          <Camera size={15} /> Start camera
                        </button>
                        <button
                          type="button"
                          onClick={p.onToggleDemo}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-400/20 active:scale-[0.97]"
                        >
                          <Sparkles size={15} /> Watch the demo
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {p.cameraLive && !p.demo && p.model.status === 'loading' && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-sm text-zinc-300">
                    <Loader2 size={16} className="animate-spin" /> Loading hand-tracking models…
                  </div>
                </div>
              )}

              <CaptionBar output={out} phrase={p.currentPhrase} mode={p.mode} standard={p.standard} active={source !== 'off'} />
            </div>

            {/* Telemetry */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Live telemetry">
              <Tile label="FPS" value={String(live.renderFps).padStart(2, '0')} unit="draw" tone={fpsTone(live.renderFps)} />
              <Tile
                label="Latency"
                value={source === 'demo' ? 'sim' : live.latency.toFixed(1)}
                unit={source === 'demo' ? undefined : 'ms'}
                tone={source === 'demo' || live.latency === 0 ? 'zinc' : live.latency < 45 ? 'emerald' : 'amber'}
              />
              <Tile label="Window" value={((out?.windowMs ?? 0) / 1000).toFixed(2)} unit={`s · ${out?.samples ?? 0} snaps`} />
              <Tile label="Confidence" value={out?.candidate ? String(Math.round(conf * 100)) : '--'} unit="%" tone={out?.latched ? 'emerald' : 'zinc'} meter={conf} />
            </div>
          </div>

          <TranscriptPanel
            phrases={p.phrases}
            mode={p.mode}
            standard={p.standard}
            autoSpeak={p.autoSpeak}
            onToggleSpeak={p.onToggleSpeak}
            onBackspace={p.onBackspace}
            onClear={p.onClear}
          />
        </div>
      </div>
    </section>
  )
}
