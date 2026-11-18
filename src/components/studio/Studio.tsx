import { Camera, GraduationCap, Loader2, MonitorUp, Route, Sparkles, Square, Upload } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { displayFor, type LiveState, type Source } from '../../hooks/useDetectionLoop'
import type { ModelStatus } from '../../hooks/useLandmarkers'
import type { Practice } from '../../hooks/usePractice'
import type { Phrase } from '../../hooks/useSubtitles'
import { canCaptureScreen, VIDEO_ACCEPT, type InputKind, type InputStatus, type LoadedFile } from '../../hooks/useVideoInput'
import type { EngineOutput } from '../../lib/engine'
import { SIGNS } from '../../lib/signs'
import type { SignId, Standard, SubtitleMode } from '../../lib/types'
import { CaptionBar } from '../CaptionBar'
import { Segmented } from '../Segmented'
import { SignDiagram } from '../SignDiagram'
import { StatusBadges } from '../StatusBadges'
import { Toolbar } from '../Toolbar'
import { TranscriptPanel } from '../TranscriptPanel'
import { SectionHeader } from '../site/SectionHeader'
import { CoachChip, CoachPanel } from './CoachPanel'
import { VideoTransport } from './VideoTransport'

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
const INPUTS: { id: InputKind; label: string; short: string; Icon: typeof Camera }[] = [
  { id: 'camera', label: 'Live camera', short: 'Camera', Icon: Camera },
  { id: 'file', label: 'Upload video', short: 'Upload', Icon: Upload },
  { id: 'screen', label: 'Capture tab', short: 'Tab', Icon: MonitorUp },
]

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  source: Source
  demo: boolean
  input: { kind: InputKind | null; status: InputStatus; error: string | null; file: LoadedFile | null }
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
  onSelectInput: (k: InputKind) => void
  onLoadFile: (f: File) => void
  onStopInput: () => void
  practice: Practice
  practiceOn: boolean
  onTogglePractice: () => void
  onPracticePick: (id: SignId) => void
  onStartTour: () => void
  /** Show the hand framing guide (tutorial step or practice without a hand). */
  showGuide: boolean
}

function Tile({ label, value, unit, tone = 'zinc', meter }: { label: string; value: string; unit?: string; tone?: 'zinc' | 'emerald' | 'amber' | 'rose'; meter?: number }) {
  const color = { zinc: 'text-zinc-200', emerald: 'text-emerald-400', amber: 'text-amber-300', rose: 'text-rose-300' }[tone]
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-surface-2/70 px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-[0.14em] text-zinc-500 uppercase">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
        <span className={`text-lg leading-none font-medium ${color}`}>{value}</span>
        {unit && <span className="truncate text-[11px] text-zinc-500">{unit}</span>}
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

/** Camera / Upload / Capture switcher. Unlike a plain radio group, clicking the current option acts again (e.g. pick another file). */
function SourceSwitcher({ value, onSelect }: { value: InputKind | null; onSelect: (k: InputKind) => void }) {
  const group = useId()
  const reduced = useReducedMotion()
  return (
    <div role="radiogroup" aria-label="Video input" className="hairline flex max-w-full rounded-lg bg-obsidian/80 p-0.5">
      {INPUTS.map(({ id, label, short, Icon }) => {
        const on = value === id
        const disabled = id === 'screen' && !canCaptureScreen()
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            title={disabled ? 'Tab capture isn’t available in this browser' : label}
            onClick={() => onSelect(id)}
            className={`relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors active:scale-[0.97] disabled:opacity-35 ${
              on ? 'text-fg' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {on && (
              <motion.span
                layoutId={`src-${group}`}
                className="absolute inset-0 rounded-md border border-white/10 bg-surface-2"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <Icon size={13} className="relative" />
            <span className="relative hidden sm:inline">{label}</span>
            <span className="relative sm:hidden">{short}</span>
          </button>
        )
      })}
    </div>
  )
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="max-w-md text-center">
      <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-white/[0.08] bg-surface-2 text-zinc-300">{icon}</div>
      <h3 className="text-lg font-semibold tracking-tight text-fg">{title}</h3>
      {children}
    </div>
  )
}

const primaryBtn =
  'inline-flex items-center gap-2 rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-60'
const ghostBtn =
  'inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-400/20 active:scale-[0.97]'

export function Studio({ videoRef, canvasRef, ...p }: Props) {
  const { out, source, live, input, practice } = p
  const conf = out?.candidate?.confidence ?? 0
  const display = displayFor(source)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const reduced = useReducedMotion()

  const videoSource = source === 'camera' || source === 'video' || source === 'screen'
  const starting = input.status === 'starting'
  const pickFile = () => fileRef.current?.click()

  const selectInput = (k: InputKind) => {
    p.onSelectInput(k)
    if (k === 'file') pickFile()
  }

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e) || p.demo) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e) || p.demo) return
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) p.onLoadFile(f)
  }

  const errorBox = input.error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{input.error}</p>

  let empty: ReactNode
  if (input.kind === 'file') {
    empty = (
      <Panel icon={<Upload size={26} />} title="Drop a sign language video here">
        <p className="mt-1 text-sm text-zinc-400">
          Subtitles are generated as it plays. Works with <span className="font-mono text-zinc-300">.mp4 .webm .mov</span>; the video never leaves your device.
        </p>
        {errorBox}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={pickFile} className={primaryBtn}>
            <Upload size={15} /> Choose a video
          </button>
        </div>
      </Panel>
    )
  } else if (input.kind === 'screen') {
    empty = (
      <Panel icon={<MonitorUp size={26} />} title="Subtitle another tab">
        <p className="mt-1 text-sm text-zinc-400">
          Open a sign language video or a video call in another tab, then pick that tab here. Make the video large so the signer’s hands are clear.
        </p>
        {errorBox}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => p.onSelectInput('screen')} disabled={starting || !canCaptureScreen()} className={primaryBtn}>
            {starting ? <Loader2 size={15} className="animate-spin" /> : <MonitorUp size={15} />} Choose a tab
          </button>
        </div>
      </Panel>
    )
  } else {
    empty = (
      <Panel icon={<SignDiagram id="MAHAL_KITA" size={56} active />} title="Sign, and watch it become a sentence">
        <p className="mt-1 text-sm text-zinc-400">
          Turn on your camera, upload a video, or watch the demo to see signs like <span className="font-mono text-zinc-300">AKO · KAILANGAN · TULONG</span> turn
          into “Kailangan ko ng tulong.”
        </p>
        {errorBox}
        {p.model.status === 'error' && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Hand tracking couldn’t load ({p.model.error}). The demo still works without it.
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => p.onSelectInput('camera')} disabled={starting} className={primaryBtn}>
            {starting ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} Start camera
          </button>
          <button type="button" onClick={p.onToggleDemo} className={ghostBtn}>
            <Sparkles size={15} /> Watch the demo
          </button>
        </div>
      </Panel>
    )
  }

  const statusLabel =
    source === 'off' ? 'Idle' : source === 'demo' ? 'Demo signer' : source === 'video' ? 'Video file' : source === 'screen' ? 'Tab capture' : 'Camera live'

  return (
    <section id="studio" className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 sm:pt-16">
      <SectionHeader index="01" kicker="Studio" title="Live translator console" lede="Camera, video file or a captured tab in; skeleton overlaid, gloss tokens locked, a full sentence out. Everything runs in this tab." />

      <input
        ref={fileRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) p.onLoadFile(f)
          e.target.value = ''
        }}
      />

      <div id="studio-console" className="mt-8 rounded-[20px] border border-white/[0.08] bg-surface p-2 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.8)] sm:p-3">
        {/* Studio strip */}
        <div className="flex flex-col gap-2 px-1 pt-1 pb-3 sm:px-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto flex items-center gap-2 pr-2">
              <span className={`size-2 rounded-full ${source === 'off' ? 'bg-zinc-600' : 'animate-pulse bg-signal'}`} />
              <span className="font-mono text-[11px] tracking-[0.14em] text-zinc-400 uppercase">{statusLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-tour="source">
              <SourceSwitcher value={p.demo ? null : input.kind} onSelect={selectInput} />
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
              {videoSource && (
                <button
                  type="button"
                  onClick={p.onStopInput}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 active:scale-[0.97]"
                >
                  <Square size={11} fill="currentColor" /> Stop
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Subtitle language" value={p.mode} onChange={p.onModeChange} options={MODES} />
            <Segmented label="Sign language standard" value={p.standard} onChange={p.onStandardChange} options={STANDARDS} />
            <button
              type="button"
              aria-pressed={p.practiceOn}
              onClick={p.onTogglePractice}
              data-testid="practice-toggle"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition active:scale-[0.97] ${
                p.practiceOn ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.08] bg-obsidian/80 text-zinc-300 hover:border-white/20'
              }`}
            >
              <GraduationCap size={14} /> Practice a sign
            </button>
            <button
              type="button"
              onClick={p.onStartTour}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-obsidian/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 active:scale-[0.97]"
            >
              <Route size={14} /> Tutorial
            </button>
          </div>
          <Toolbar threshold={p.threshold} onThresholdChange={p.onThresholdChange} hint={live.hint} />
        </div>

        <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/[0.08] bg-black sm:aspect-video"
              data-tour="frame"
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full transition-opacity ${display.mirror ? '-scale-x-100' : ''} ${
                  display.fit === 'cover' ? 'object-cover' : 'object-contain'
                } ${videoSource ? 'opacity-100' : 'opacity-0'}`}
                playsInline
                muted
                autoPlay
              />
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-testid="overlay" />

              {/* Hand framing guide zone */}
              <AnimatePresence>
                {p.showGuide && (
                  <motion.div
                    aria-hidden
                    initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="pointer-events-none absolute inset-x-[16%] top-[12%] bottom-[34%] rounded-2xl border-2 border-dashed border-emerald-400/50 bg-emerald-400/[0.03] sm:bottom-[30%]"
                    data-testid="guide-zone"
                  >
                    <span className="absolute -top-2.5 left-3 rounded bg-obsidian px-1.5 font-mono text-[10px] tracking-wide text-emerald-300 uppercase">
                      Hand zone
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
                <StatusBadges
                  inferFps={live.inferFps}
                  model={p.model.status}
                  delegate={p.model.delegate}
                  thread={p.model.thread}
                  source={source}
                  shape={out?.hasHand ? out.shape : '—'}
                />
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {source !== 'off' && (
                    <div className="flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-obsidian/70 px-2 py-1 font-mono text-[10px] tracking-wide text-rose-300 uppercase">
                      <span className="size-1.5 animate-pulse rounded-full bg-rose-400" />
                      {source === 'demo' ? 'Demo' : source === 'video' ? 'File' : source === 'screen' ? 'Tab' : 'Rec'}
                    </div>
                  )}
                  {p.practiceOn && <CoachChip practice={practice} />}
                  {source === 'demo' && live.acting && (
                    <div className="rounded-md border border-amber-400/30 bg-obsidian/70 px-2 py-1 text-xs text-amber-200">
                      Now signing: {SIGNS[live.acting].kind === 'letter' ? `the letter ${live.acting}` : SIGNS[live.acting].fil}
                    </div>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {source === 'off' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center p-6 pb-40">
                    {empty}
                  </motion.div>
                )}
              </AnimatePresence>

              {dragging && (
                <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-emerald-400/70 bg-obsidian/80">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                    <Upload size={16} /> Drop to subtitle this video
                  </div>
                </div>
              )}

              {videoSource && p.model.status === 'loading' && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-sm text-zinc-300">
                    <Loader2 size={16} className="animate-spin" /> Loading hand-tracking models…
                  </div>
                </div>
              )}

              <CaptionBar
                output={out}
                phrase={p.currentPhrase}
                mode={p.mode}
                standard={p.standard}
                active={source !== 'off'}
                waitingText={source === 'video' || source === 'screen' ? 'Waiting for a signer’s hand to appear in the video…' : undefined}
              />
            </div>

            {source === 'video' && input.file && <VideoTransport videoRef={videoRef} fileName={input.file.name} onReplace={pickFile} />}

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

          <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
            <AnimatePresence initial={false}>
              {p.practiceOn && (
                <motion.div
                  initial={reduced ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                >
                  <CoachPanel practice={practice} standard={p.standard} onPick={p.onPracticePick} onClose={p.onTogglePractice} />
                </motion.div>
              )}
            </AnimatePresence>
            <TranscriptPanel
              phrases={p.phrases}
              mode={p.mode}
              standard={p.standard}
              autoSpeak={p.autoSpeak}
              onToggleSpeak={p.onToggleSpeak}
              onBackspace={p.onBackspace}
              onClear={p.onClear}
              videoName={input.file?.name ?? null}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
