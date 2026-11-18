import { useCallback, useEffect, useRef, useState } from 'react'
import { SignGuide } from './components/SignGuide'
import { ArchitectureSpreads } from './components/site/ArchitectureSpreads'
import { CapabilityStack } from './components/site/CapabilityStack'
import { Footer } from './components/site/Footer'
import { Hero } from './components/site/Hero'
import { NavBar } from './components/site/NavBar'
import { TutorialSection } from './components/site/TutorialSection'
import { Studio } from './components/studio/Studio'
import { TOUR_STEPS } from './components/tour/steps'
import { Tour } from './components/tour/Tour'
import { useDetectionLoop, type Source } from './hooks/useDetectionLoop'
import { useLandmarkers } from './hooks/useLandmarkers'
import { usePersistentState } from './hooks/usePersistentState'
import { usePractice } from './hooks/usePractice'
import { useSubtitles } from './hooks/useSubtitles'
import { useVideoInput, type InputKind } from './hooks/useVideoInput'
import { activeIn } from './lib/signs'
import type { SignId, Standard, SubtitleMode } from './lib/types'

const isStandard = (v: unknown): v is Standard => v === 'FSL' || v === 'ASL' || v === 'BOTH'
const isMode = (v: unknown): v is SubtitleMode => v === 'FIL' || v === 'EN' || v === 'BI'
const isThreshold = (v: unknown): v is number => typeof v === 'number' && v >= 0.4 && v <= 0.9

const scrollToStudio = () => document.getElementById('studio-console')?.scrollIntoView({ block: 'start' })

const SOURCE_OF: Record<InputKind, Source> = { camera: 'camera', file: 'video', screen: 'screen' }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const input = useVideoInput()
  const { videoRef, startCamera: startCam, startScreen, chooseFile, loadFile, stop: stopInput } = input
  const models = useLandmarkers()
  const [demo, setDemo] = useState(false)
  const [mode, setMode] = usePersistentState<SubtitleMode>('kw.mode', 'BI', isMode)
  const [standard, setStandard] = usePersistentState<Standard>('kw.standard', 'BOTH', isStandard)
  const [threshold, setThreshold] = usePersistentState<number>('kw.threshold', 0.6, isThreshold)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [practiceOn, setPracticeOn] = useState(false)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const subs = useSubtitles(mode, autoSpeak)

  const source: Source = demo ? 'demo' : input.status === 'live' && input.kind ? SOURCE_OF[input.kind] : 'off'
  const live = useDetectionLoop({ source, videoRef, canvasRef, inference: models.client, onCommit: subs.push, onTick: subs.tick, threshold, standard })
  const practice = usePractice(live.output, practiceOn)

  const toggleDemo = useCallback(() => {
    if (!demo) stopInput()
    setDemo(!demo)
  }, [demo, stopInput])

  const startCamera = useCallback(() => {
    setDemo(false)
    void startCam()
  }, [startCam])

  const selectInput = useCallback(
    (k: InputKind) => {
      setDemo(false)
      if (k === 'camera') void startCam()
      else if (k === 'screen') void startScreen()
      else chooseFile()
    },
    [startCam, startScreen, chooseFile],
  )

  const onLoadFile = useCallback(
    (f: File) => {
      setDemo(false)
      void loadFile(f)
    },
    [loadFile],
  )

  const launch = useCallback(() => {
    scrollToStudio()
    if (!(input.kind === 'camera' && (input.status === 'live' || input.status === 'starting'))) startCamera()
  }, [input.kind, input.status, startCamera])

  const watchDemo = useCallback(() => {
    scrollToStudio()
    if (!demo) toggleDemo()
  }, [demo, toggleDemo])

  // When the signer stops (input off / demo off), finish the phrase that was being composed.
  const { flush } = subs
  useEffect(() => {
    if (source === 'off') flush()
  }, [source, flush])

  // An uploaded video that plays to the end (without Loop) finishes its last sentence too.
  useEffect(() => {
    const v = videoRef.current
    if (source !== 'video' || !v) return
    v.addEventListener('ended', flush)
    return () => v.removeEventListener('ended', flush)
  }, [source, videoRef, flush])

  const toggleSpeak = useCallback(() => setAutoSpeak((s) => !s), [])

  const practiceSign = useCallback(
    (id: SignId) => {
      if (!activeIn(id, standard)) setStandard('BOTH')
      practice.pick(id)
      setPracticeOn(true)
    },
    [practice, standard, setStandard],
  )

  const practiceFromGuide = useCallback(
    (id: SignId) => {
      practiceSign(id)
      scrollToStudio()
    },
    [practiceSign],
  )

  const startCircuit = useCallback(() => {
    practice.start()
    setPracticeOn(true)
    scrollToStudio()
  }, [practice])

  const startTour = useCallback(() => setTourStep(0), [])
  const closeTour = useCallback(() => setTourStep(null), [])
  const tourToPractice = useCallback(() => {
    setTourStep(null)
    startCircuit()
  }, [startCircuit])

  const out = live.output
  const currentPhrase = subs.phrases[subs.phrases.length - 1] ?? null
  const showGuide = (tourStep != null && !!TOUR_STEPS[tourStep].guide) || (practiceOn && source !== 'off' && !out?.hasHand)

  return (
    <div className="relative min-h-screen">
      <NavBar onLaunch={launch} onTour={startTour} />
      <main>
        {/* The glyph field stops while tracking runs: the iGPU is needed for MediaPipe. */}
        <Hero paused={source !== 'off'} model={models.status} delegate={models.delegate} onLaunch={launch} onDemo={watchDemo} />
        <Studio
          videoRef={videoRef}
          canvasRef={canvasRef}
          source={source}
          demo={demo}
          input={{ kind: input.kind, status: input.status, error: input.error, file: input.file }}
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
          onSelectInput={selectInput}
          onLoadFile={onLoadFile}
          onStopInput={stopInput}
          practice={practice}
          practiceOn={practiceOn}
          onTogglePractice={() => setPracticeOn((v) => !v)}
          onPracticePick={practiceSign}
          onStartTour={startTour}
          showGuide={showGuide}
        />
        <TutorialSection onStartTour={startTour} onStartCircuit={startCircuit} />
        <ArchitectureSpreads />
        <CapabilityStack />
        <SignGuide highlight={out?.candidate?.id ?? null} standard={standard} onStandardChange={setStandard} onPractice={practiceFromGuide} />
      </main>
      <Footer />
      <Tour step={tourStep} onStep={setTourStep} onClose={closeTour} onPractice={tourToPractice} />
    </div>
  )
}
