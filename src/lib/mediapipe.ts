import type { FilesetResolver, HandLandmarker, ImageSource, PoseLandmarker } from '@mediapipe/tasks-vision'

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

// Loaded lazily so the MediaPipe bundle is a separate chunk and the UI paints first.
const mp = () => import('@mediapipe/tasks-vision')

/** WASM fileset pinned to the exact installed @mediapipe/tasks-vision version (see vite.config.ts). */
export const MP_VERSION = __MP_VERSION__
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
export const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
export const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

/** Inference input size. The display stays full resolution; MediaPipe only needs a small frame. */
export const INFER_WIDTH = 640

export type Delegate = 'GPU' | 'CPU'

export interface Landmarkers {
  hand: HandLandmarker
  pose: PoseLandmarker | null
  delegate: Delegate
  /** Median hand-inference time per delegate measured at load (ms). */
  benchMs: Partial<Record<Delegate, number>>
}

/** If the GPU delegate is at least this fast, don't bother benchmarking the CPU. */
const GPU_GOOD_ENOUGH_MS = 18

async function createHand(fileset: WasmFileset, delegate: Delegate) {
  const { HandLandmarker } = await mp()
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 1, // all supported signs are one-handed; tracking one hand roughly halves landmark cost
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

async function createPose(fileset: WasmFileset, delegate: Delegate) {
  const { PoseLandmarker } = await mp()
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

/** A 640×360 frame with some structure (not a flat colour) for warm-up and benchmarking. Works in workers. */
function benchImage(): ImageSource {
  const c: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(640, 360) : Object.assign(document.createElement('canvas'), { width: 640, height: 360 })
  const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  if (g) {
    const grd = g.createLinearGradient(0, 0, 640, 360)
    grd.addColorStop(0, '#6b4f45')
    grd.addColorStop(1, '#1d1d22')
    g.fillStyle = grd
    g.fillRect(0, 0, 640, 360)
    g.fillStyle = '#c9a28f'
    g.beginPath()
    g.ellipse(330, 190, 60, 85, 0, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

/** First call warms up (shader compile / buffer allocation); returns the median of the following runs (ms). */
function bench(task: HandLandmarker, img: ImageSource, runs = 4) {
  task.detectForVideo(img, nextTimestamp())
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    task.detectForVideo(img, nextTimestamp())
    times.push(performance.now() - t0)
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)]
}

/**
 * Create the hand (+ optional pose) landmarkers and pick the faster delegate on this
 * device. Warm-up inference happens here, during loading, so the first live camera
 * frames never stall. Without a hardware GPU, WebGL falls back to software rendering
 * and the CPU (WASM/XNNPACK) delegate is often much faster.
 *
 * @param useModule load the ES-module WASM loader (required inside module Web Workers)
 */
export async function createLandmarkers(useModule = false): Promise<Landmarkers> {
  const { FilesetResolver } = await mp()
  // A fresh fileset per task. In a module worker, tasks-vision loads the WASM loader with
  // import() and clears self.ModuleFactory after each task is created; import() is cached
  // per URL, so a 2nd task would fail with "ModuleFactory not set". A unique query string
  // makes the loader module re-execute; the large .wasm binary URL is unchanged (HTTP-cached).
  let taskNo = 0
  const fileset = async () => {
    const f = await FilesetResolver.forVisionTasks(WASM_URL, useModule)
    return useModule ? { ...f, wasmLoaderPath: `${f.wasmLoaderPath}?task=${++taskNo}` } : f
  }
  const img = benchImage()

  let hand: HandLandmarker | null = null
  let delegate: Delegate = 'GPU'
  const benchMs: Landmarkers['benchMs'] = {}
  try {
    hand = await createHand(await fileset(), 'GPU')
    benchMs.GPU = bench(hand, img)
  } catch (err) {
    console.warn('[kumpas] GPU delegate unavailable, trying CPU', err)
  }
  if (!hand || (benchMs.GPU ?? Infinity) > GPU_GOOD_ENOUGH_MS) {
    try {
      const cpu = await createHand(await fileset(), 'CPU')
      benchMs.CPU = bench(cpu, img)
      if (!hand || benchMs.CPU < (benchMs.GPU ?? Infinity) * 0.85) {
        hand?.close()
        hand = cpu
        delegate = 'CPU'
      } else cpu.close()
    } catch (err) {
      if (!hand) throw err
      console.warn('[kumpas] CPU delegate benchmark failed, keeping GPU', err)
    }
  }

  // Pose is optional context (face/shoulder region + arm lines); never block on it.
  let pose: PoseLandmarker | null = null
  for (const d of delegate === 'GPU' ? (['GPU', 'CPU'] as const) : (['CPU'] as const)) {
    try {
      pose = await createPose(await fileset(), d)
      pose.detectForVideo(img, nextTimestamp()) // warm-up
      break
    } catch (err) {
      pose = null
      if (d === 'CPU') console.warn('[kumpas] pose landmarker unavailable, continuing hands-only', err)
    }
  }
  return { hand: hand!, pose, delegate, benchMs }
}

/**
 * MediaPipe VIDEO mode requires strictly increasing timestamps per task. This is
 * module-level (not per component) so StrictMode remounts can never rewind it.
 */
let lastTs = 0
export function nextTimestamp(at = performance.now()): number {
  lastTs = at > lastTs ? at : lastTs + 1
  return lastTs
}
