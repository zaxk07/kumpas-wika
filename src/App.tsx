import { useCallback, useEffect, useRef, useState } from 'react'
import { SignGuide } from './components/SignGuide'
import { ArchitectureSpreads } from './components/site/ArchitectureSpreads'
import { CapabilityStack } from './components/site/CapabilityStack'
import { Footer } from './components/site/Footer'
import { Hero } from './components/site/Hero'
import { NavBar } from './components/site/NavBar'
import { Studio } from './components/studio/Studio'
import { useCamera } from './hooks/useCamera'
import { useDetectionLoop, type Source } from './hooks/useDetectionLoop'
import { useLandmarkers } from './hooks/useLandmarkers'
import { usePersistentState } from './hooks/usePersistentState'
import { useSubtitles } from './hooks/useSubtitles'
import type { Standard, SubtitleMode } from './lib/types'

const isStandard = (v: unknown): v is Standard => v === 'FSL' || v === 'ASL' || v === 'BOTH'
const isMode = (v: unknown): v is SubtitleMode => v === 'FIL' || v === 'EN' || v === 'BI'
const isThreshold = (v: unknown): v is number => typeof v === 'number' && v >= 0.4 && v <= 0.9

const scrollToStudio = () => document.getElementById('studio-console')?.scrollIntoView({ block: 'start' })

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

  const launch = useCallback(() => {
    scrollToStudio()
    if (cameraStatus !== 'live' && cameraStatus !== 'starting') startCamera()
  }, [cameraStatus, startCamera])

  const watchDemo = useCallback(() => {
    scrollToStudio()
    if (!demo) toggleDemo()
  }, [demo, toggleDemo])

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
      <NavBar onLaunch={launch} />
      <main>
        {/* The glyph field stops while tracking runs: the iGPU is needed for MediaPipe. */}
        <Hero paused={source !== 'off'} model={models.status} delegate={models.delegate} onLaunch={launch} onDemo={watchDemo} />
        <Studio
          videoRef={videoRef}
          canvasRef={canvasRef}
          source={source}
          demo={demo}
          cameraLive={cameraLive}
          cameraStarting={cameraStatus === 'starting'}
          cameraError={cameraError}
          model={models}
          live={live}
          out={out}
          phrases={subs.phrases}
          currentPhrase={currentPhrase}
          mode={mode}
          onModeChange={setMode}
          standard={standard}
          onStandardChange={setStandard}
          threshold={threshold}
          onThresholdChange={setThreshold}
          autoSpeak={autoSpeak}
          onToggleSpeak={toggleSpeak}
          onBackspace={subs.backspace}
          onClear={subs.clear}
          onToggleDemo={toggleDemo}
          onStartCamera={startCamera}
          onStopCamera={stopCam}
        />
        <ArchitectureSpreads />
        <CapabilityStack />
        <SignGuide highlight={out?.candidate?.id ?? null} standard={standard} onStandardChange={setStandard} />
      </main>
      <Footer />
    </div>
  )
}
