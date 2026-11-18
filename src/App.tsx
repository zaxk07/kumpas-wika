import { Camera, CameraOff, Captions, Loader2, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptionBar } from './components/CaptionBar'
import { GridBackground } from './components/GridBackground'
import { Segmented } from './components/Segmented'
import { SignGuide } from './components/SignGuide'
import { StatusBadges } from './components/StatusBadges'
import { Toolbar } from './components/Toolbar'
import { TranscriptPanel } from './components/TranscriptPanel'
import { useCamera } from './hooks/useCamera'
import { useDetectionLoop, type Source } from './hooks/useDetectionLoop'
import { useLandmarkers } from './hooks/useLandmarkers'
import { usePersistentState } from './hooks/usePersistentState'
import { useSubtitles } from './hooks/useSubtitles'
import { SignDiagram } from './components/SignDiagram'
import { SIGNS } from './lib/signs'
import type { Standard, SubtitleMode } from './lib/types'

const isStandard = (v: unknown): v is Standard => v === 'FSL' || v === 'ASL' || v === 'BOTH'
const isMode = (v: unknown): v is SubtitleMode => v === 'FIL' || v === 'EN' || v === 'BI'
const isThreshold = (v: unknown): v is number => typeof v === 'number' && v >= 0.4 && v <= 0.9

const STANDARDS = [
  { id: 'FSL' as const, label: 'FSL', title: 'Filipino Sign Language' },
  { id: 'ASL' as const, label: 'ASL', title: 'American Sign Language' },
  { id: 'BOTH' as const, label: 'FSL + ASL', title: 'Recognize both variants' },
]

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { videoRef, status: cameraStatus, error: cameraError, start: startCam, stop: stopCam } = useCamera()
  const models = useLandmarkers()
  const [demo, setDemo] = useState(false)
  const [mode, setMode] = usePersistentState<SubtitleMode>('kw.mode', 'BI', isMode)
  const [standard, setStandard] = usePersistentState<Standard>('kw.standard', 'BOTH', isStandard)
  const [threshold, setThreshold] = usePersistentState<number>('kw.threshold', 0.6, isThreshold)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const subs = useSubtitles(mode, autoSpeak)

  const source: Source = demo ? 'demo' : cameraStatus === 'live' ? 'camera' : 'off'
  const live = useDetectionLoop({ source, videoRef, canvasRef, inference: models.client, onCommit: subs.push, onTick: subs.tick, threshold, standard })

  const toggleDemo = useCallback(() => {
    if (!demo) stopCam()
    setDemo(!demo)
  }, [demo, stopCam])

  const startCamera = useCallback(() => {
    setDemo(false)
    void startCam()
  }, [startCam])

  // When the signer stops (camera off / demo off), finish the phrase that was being composed.
  const { flush } = subs
  useEffect(() => {
    if (source === 'off') flush()
  }, [source, flush])

  const toggleSpeak = useCallback(() => setAutoSpeak((s) => !s), [])

  const out = live.output
  const cameraLive = cameraStatus === 'live'
  const currentPhrase = subs.phrases[subs.phrases.length - 1] ?? null

  return (
    <div className="relative min-h-screen">
      <GridBackground />

      <header className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 pt-5 pb-3 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Captions size={20} />
          </div>
          <div>
            <h1 className="text-lg leading-tight font-semibold tracking-tight text-zinc-50">
              Kumpas <span className="text-emerald-300">WIKA</span>
            </h1>
            <p className="text-xs text-zinc-500">Filipino Sign Language, turned into live subtitles</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented label="Sign language standard" value={standard} onChange={setStandard} options={STANDARDS} />

          <button
            type="button"
            role="switch"
            aria-checked={demo}
            onClick={toggleDemo}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition active:scale-[0.97] ${
              demo ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-zinc-950/80 text-zinc-300 hover:border-white/20'
            }`}
          >
            <Sparkles size={14} />
            Demo mode (no camera)
            <span className={`relative h-4 w-7 rounded-full transition ${demo ? 'bg-amber-400/70' : 'bg-zinc-700'}`}>
              <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${demo ? 'left-3.5' : 'left-0.5'}`} />
            </span>
          </button>

          {cameraLive ? (
            <button
              type="button"
              onClick={stopCam}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 active:scale-[0.97]"
            >
              <CameraOff size={14} /> Stop camera
            </button>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraStatus === 'starting'}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300 active:scale-[0.97] disabled:opacity-60"
            >
              {cameraStatus === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              Start camera
            </button>
          )}
        </div>
      </header>

      <Toolbar mode={mode} onModeChange={setMode} threshold={threshold} onThresholdChange={setThreshold} hint={live.hint} />

      <main className="mx-auto grid max-w-[1400px] gap-4 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl sm:aspect-video">
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity ${cameraLive && !demo ? 'opacity-100' : 'opacity-0'}`}
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-testid="overlay" />

          <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
            <StatusBadges
              renderFps={live.renderFps}
              inferFps={live.inferFps}
              latency={live.latency}
              e2e={live.e2e}
              windowMs={out?.windowMs ?? 0}
              samples={out?.samples ?? 0}
              model={models.status}
              delegate={models.delegate}
              thread={models.thread}
              source={source}
              shape={out?.hasHand ? out.shape : '—'}
            />
            {source !== 'off' && (
              <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-rose-500/30 bg-black/60 px-2 py-1 text-xs font-medium text-rose-300">
                <span className="size-1.5 animate-pulse rounded-full bg-rose-400" />
                {source === 'demo' ? 'Demo' : 'Live'}
              </div>
            )}
          </div>

          {source === 'demo' && live.acting && (
            <div className="absolute top-14 right-3 rounded-md border border-amber-400/30 bg-black/60 px-2 py-1 text-xs text-amber-200 sm:top-[3.25rem]">
              Now signing: {SIGNS[live.acting].kind === 'letter' ? `the letter ${live.acting}` : SIGNS[live.acting].fil}
            </div>
          )}

          <AnimatePresence>
            {source === 'off' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 grid place-items-center p-6 pb-40"
              >
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-white/10 bg-zinc-900">
                    <SignDiagram id="MAHAL_KITA" size={56} active />
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-100">Sign, and watch it become a sentence</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Turn on your camera and start signing, or watch the demo to see signs like <span className="font-mono text-zinc-300">AKO · KAILANGAN · TULONG</span> turn into
                    “Kailangan ko ng tulong.”
                  </p>
                  {cameraError && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{cameraError}</p>}
                  {models.status === 'error' && (
                    <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      Hand tracking couldn’t load ({models.error}). The demo still works without it.
                    </p>
                  )}
                  <div className="pointer-events-auto mt-4 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 active:scale-[0.97]"
                    >
                      <Camera size={15} /> Start camera
                    </button>
                    <button
                      type="button"
                      onClick={toggleDemo}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-400/20 active:scale-[0.97]"
                    >
                      <Sparkles size={15} /> Watch the demo
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {cameraLive && !demo && models.status === 'loading' && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-sm text-zinc-300">
                <Loader2 size={16} className="animate-spin" /> Loading hand-tracking models…
              </div>
            </div>
          )}

          <CaptionBar output={out} phrase={currentPhrase} mode={mode} standard={standard} active={source !== 'off'} />
        </section>

        <TranscriptPanel
          phrases={subs.phrases}
          mode={mode}
          standard={standard}
          autoSpeak={autoSpeak}
          onToggleSpeak={toggleSpeak}
          onBackspace={subs.backspace}
          onClear={subs.clear}
        />

        <div className="lg:col-span-2">
          <SignGuide highlight={out?.candidate?.id ?? null} standard={standard} onStandardChange={setStandard} />
        </div>
      </main>

      <footer className="mx-auto max-w-[1400px] px-4 pb-8 font-mono text-[11px] text-zinc-600 sm:px-6">
        Everything runs on your device. Your camera feed never leaves this browser.
      </footer>
    </div>
  )
}
