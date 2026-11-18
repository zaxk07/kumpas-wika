import { useEffect, useRef, useState, type RefObject } from 'react'
import { demoFrame } from '../lib/demo'
import { coverMapper, drawBody, drawDemoBackdrop, drawHands, type Trails } from '../lib/draw'
import { SignEngine, type EngineOutput } from '../lib/engine'
import type { InferenceClient } from '../lib/inference'
import { INFER_WIDTH } from '../lib/mediapipe'
import type { Detection, HandLandmarks, InputFrame, SignId, Standard, UpperBody } from '../lib/types'

export type Source = 'camera' | 'demo' | 'off'

export interface Hint {
  level: 'good' | 'warn' | 'info'
  text: string
}

export interface LiveState {
  output: EngineOutput | null
  /** Overlay render rate (rAF). */
  renderFps: number
  /** Landmark inference / simulation rate. */
  inferFps: number
  /** Median MediaPipe model time per frame over the last 30 frames (ms). */
  latency: number
  /** Median capture -> result time over the last 30 frames (ms), including frame transfer. */
  e2e: number
  acting: SignId | null
  hint: Hint
}

/** Cap inference at ~30 Hz. Frames are sent to the worker one at a time (no queue build-up). */
const INFER_INTERVAL_MS = 1000 / 30 - 3
/** Pose only provides context (face/shoulder height, arm lines) that changes slowly, so it runs on every 5th
 * inference (~6 Hz) and leaves the GPU to the hand model. */
const POSE_EVERY = 5
const DEMO_FRAME_MS = 1000 / 30
/** Larger steps (main-thread stalls) are capped so the scripted performance pauses instead of skipping. */
const MAX_DEMO_STEP_MS = 150
/** React state updates are throttled; the canvas is drawn imperatively every frame. */
const UI_INTERVAL_MS = 80
const HINT_INTERVAL_MS = 500

interface Options {
  source: Source
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  inference: InferenceClient | null
  /** A sign locked. `t` is the source clock (camera performance.now() or simulated demo time). */
  onCommit: (d: Detection, t: number) => void
  /** Called for every processed frame with the source clock (drives phrase finalization). */
  onTick: (t: number) => void
  threshold: number
  standard: Standard
}

function bodyFromPose(lms: { x: number; y: number; z: number; visibility?: number }[] | null | undefined): UpperBody | null {
  if (!lms || lms.length < 17) return null
  const pick = (i: number) => (lms[i] && (lms[i].visibility ?? 1) > 0.5 ? { x: lms[i].x, y: lms[i].y, z: lms[i].z } : undefined)
  return { nose: pick(0), lShoulder: pick(11), rShoulder: pick(12), lElbow: pick(13), rElbow: pick(14), lWrist: pick(15), rWrist: pick(16) }
}

function computeHint(source: Source, out: EngineOutput | null, lum: number | null, latency: number, modelsReady: boolean): Hint {
  if (source === 'demo') return { level: 'info', text: 'The demo signer is running, so no camera is needed' }
  if (source === 'off') return { level: 'info', text: 'Turn on your camera or try the demo to begin' }
  if (!modelsReady) return { level: 'info', text: 'Getting hand tracking ready…' }
  if (lum != null && lum < 55) return { level: 'warn', text: 'It’s a little dark. Try facing a window or a lamp' }
  if (lum != null && lum > 215) return { level: 'warn', text: 'Too much light behind you. Try turning away from the window' }
  if (!out?.hasHand) return { level: 'info', text: 'Raise your hand to about chest height' }
  if (out.palmHeight < 0.07) return { level: 'warn', text: 'Come a little closer to the camera' }
  if (out.palmHeight > 0.32) return { level: 'warn', text: 'Lean back a little. Your hand is too close' }
  const c = out.centre
  if (c && (c.x < 0.12 || c.x > 0.88 || c.y < 0.08 || c.y > 0.92)) return { level: 'warn', text: 'Bring your hand toward the middle of the frame' }
  if (latency > 45) return { level: 'warn', text: `This device is running a bit slow (${latency.toFixed(0)} ms a frame)` }
  return { level: 'good', text: 'Lighting looks good and your hand is in frame' }
}

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0)

export function useDetectionLoop({ source, videoRef, canvasRef, inference, onCommit, onTick, threshold, standard }: Options): LiveState {
  const idle: LiveState = {
    output: null,
    renderFps: 0,
    inferFps: 0,
    latency: 0,
    e2e: 0,
    acting: null,
    hint: computeHint(source, null, null, 0, !!inference),
  }
  const [live, setLive] = useState<LiveState>(idle)
  const [engine] = useState(() => new SignEngine())
  const onCommitRef = useRef(onCommit)
  const onTickRef = useRef(onTick)
  useEffect(() => {
    onCommitRef.current = onCommit
    onTickRef.current = onTick
  }, [onCommit, onTick])
  useEffect(() => engine.setThreshold(threshold), [engine, threshold])
  useEffect(() => engine.setStandard(standard), [engine, standard])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || source === 'off') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    engine.reset()
    const trails: Trails = new Map()
    const lumCanvas = document.createElement('canvas')
    lumCanvas.width = 32
    lumCanvas.height = 18
    const lumCtx = lumCanvas.getContext('2d', { willReadFrequently: true })

    let raf = 0
    let cancelled = false
    let inFlight = false
    let lastVideoTime = -1
    let lastStep = 0
    let demoClock = 0
    let inferCount = 0
    const latencies: number[] = []
    const e2es: number[] = []
    let lum: number | null = null
    let lastLum = 0
    let lastUi = 0
    let lastHintT = 0
    let hint = computeHint(source, null, null, 0, !!inference)
    let lastCandId: string | null = null
    let urgent = false
    const renderTimes: number[] = []
    const stepTimes: number[] = []

    let latestHands: HandLandmarks[] = []
    let shownHands: HandLandmarks[] = []
    let latestBody: UpperBody | null = null
    let size = { w: 1280, h: 720 }
    let out: EngineOutput | null = null
    let acting: SignId | null = null
    let lastRender = performance.now()

    /** Feed one frame (demo or camera result) through the recognizer. */
    const processFrame = (frame: InputFrame) => {
      out = engine.process(frame)
      if (out.committed) onCommitRef.current(out.committed, frame.t)
      onTickRef.current(frame.t)
      latestHands = frame.hands
      latestBody = frame.body
      size = { w: frame.width, h: frame.height }
      stepTimes.push(performance.now())
      const candId = out.candidate?.id ?? null
      if (out.committed || candId !== lastCandId) urgent = true
    }

    const stepDemo = (now: number) => {
      if (now - lastStep < DEMO_FRAME_MS - 2) return
      demoClock += lastStep ? Math.min(now - lastStep, MAX_DEMO_STEP_MS) : 0
      lastStep = now
      const d = demoFrame(demoClock / 1000, demoClock)
      acting = d.acting
      processFrame(d)
    }

    /** Send the newest video frame to the inference worker (never more than one in flight). */
    const stepCamera = (now: number) => {
      const video = videoRef.current
      if (!video || !inference || inFlight || video.readyState < 2 || video.videoWidth === 0) return
      if (video.currentTime === lastVideoTime || now - lastStep < INFER_INTERVAL_MS) return
      lastVideoTime = video.currentTime
      lastStep = now
      inFlight = true
      const vw = video.videoWidth
      const vh = video.videoHeight
      const captured = now
      const withPose = inferCount++ % POSE_EVERY === 0
      createImageBitmap(video, { resizeWidth: INFER_WIDTH, resizeHeight: Math.round((INFER_WIDTH * vh) / vw), resizeQuality: 'low' })
        .then((bmp) => {
          if (cancelled) {
            bmp.close()
            return null
          }
          return inference.detect(bmp, withPose)
        })
        .then((res) => {
          inFlight = false
          if (!res || cancelled) return
          latencies.push(res.ms)
          e2es.push(performance.now() - captured)
          if (latencies.length > 30) latencies.shift()
          if (e2es.length > 30) e2es.shift()
          if (withPose) latestBody = bodyFromPose(res.pose)
          processFrame({ t: captured, hands: res.hands, body: latestBody, width: vw, height: vh })
        })
        .catch((err) => {
          inFlight = false
          console.warn('[kumpas] detection frame skipped', err)
        })

      // Cheap brightness probe for the lighting hint (~1 Hz).
      if (lumCtx && now - lastLum > 1000) {
        lastLum = now
        lumCtx.drawImage(video, 0, 0, 32, 18)
        const d = lumCtx.getImageData(0, 0, 32, 18).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        lum = sum / (d.length / 4)
      }
    }

    const render = (now: number) => {
      const dt = now - lastRender
      lastRender = now
      // Ease displayed landmarks toward the latest inference so ~30 Hz tracking renders smoothly at display rate.
      const k = 1 - Math.exp(-dt / 35)
      if (shownHands.length !== latestHands.length) shownHands = latestHands.map((h) => h.map((p) => ({ ...p })))
      else
        shownHands = shownHands.map((h, hi) =>
          h.map((p, i) => {
            const q = latestHands[hi][i]
            return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: q.z }
          }),
        )

      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const cw = Math.round(canvas.clientWidth * dpr)
      const ch = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      const map = coverMapper(cw, ch, size.w, size.h)
      if (source === 'demo') drawDemoBackdrop(ctx, cw, ch, latestBody, map, dpr)
      else ctx.clearRect(0, 0, cw, ch)
      drawBody(ctx, latestBody, map, dpr)
      const accent = out?.latched ? '#34d399' : out?.cooling ? '#f59e0b' : out?.candidate ? '#a3e635' : '#e4e4e7'
      drawHands(ctx, shownHands, map, dpr, trails, accent)
      renderTimes.push(now)
    }

    const loop = () => {
      if (cancelled) return
      raf = requestAnimationFrame(loop)
      const now = performance.now()
      if (source === 'demo') stepDemo(now)
      else stepCamera(now)
      render(now)

      while (renderTimes.length && now - renderTimes[0] > 1000) renderTimes.shift()
      while (stepTimes.length && now - stepTimes[0] > 1000) stepTimes.shift()
      const lat = median(latencies)
      if (now - lastHintT > HINT_INTERVAL_MS) {
        lastHintT = now
        hint = computeHint(source, out, lum, lat, !!inference)
      }
      if (urgent || now - lastUi > UI_INTERVAL_MS) {
        urgent = false
        lastUi = now
        lastCandId = out?.candidate?.id ?? null
        setLive({ output: out, renderFps: renderTimes.length, inferFps: stepTimes.length, latency: lat, e2e: median(e2es), acting, hint })
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [source, inference, videoRef, canvasRef, engine])

  return source === 'off' ? idle : live
}
