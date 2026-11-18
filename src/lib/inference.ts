import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { createLandmarkers, nextTimestamp, type Delegate, type Landmarkers } from './mediapipe'

/**
 * Inference client. Runs MediaPipe in a module Web Worker (preferred) so inference
 * never blocks rendering; falls back to the main thread if the worker can't start.
 * A single shared instance survives React StrictMode remounts.
 */

export type WorkerIn = { type: 'init' } | { type: 'detect'; id: number; bitmap: ImageBitmap; ts: number; pose: boolean }
export type WorkerOut =
  | { type: 'ready'; delegate: Delegate; benchMs: Partial<Record<Delegate, number>>; hasPose: boolean }
  | { type: 'error'; message: string }
  | { type: 'result'; id: number; hands: NormalizedLandmark[][]; pose: NormalizedLandmark[] | null; ms: number; error?: string }

export interface InferenceResult {
  hands: NormalizedLandmark[][]
  pose: NormalizedLandmark[] | null
  /** Model time for this frame (ms). */
  ms: number
}

export interface InferenceStatus {
  status: 'loading' | 'ready' | 'error'
  delegate?: Delegate
  /** Where inference runs. */
  thread?: 'worker' | 'main'
  benchMs?: Partial<Record<Delegate, number>>
  error?: string
}

type Listener = (s: InferenceStatus) => void

export class InferenceClient {
  status: InferenceStatus = { status: 'loading' }
  private listeners = new Set<Listener>()
  private worker: Worker | null = null
  private main: Landmarkers | null = null
  private seq = 0
  private pending = new Map<number, (r: InferenceResult) => void>()

  constructor() {
    void this.init()
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn(this.status)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private set(s: InferenceStatus) {
    this.status = s
    for (const fn of this.listeners) fn(s)
  }

  private async init() {
    try {
      await this.initWorker()
    } catch (err) {
      console.warn('[kumpas] inference worker unavailable, running MediaPipe on the main thread', err)
      this.worker?.terminate()
      this.worker = null
      try {
        this.main = await createLandmarkers(false)
        console.info(`[kumpas] hand landmarker: main thread · ${this.main.delegate}`, this.main.benchMs)
        this.set({ status: 'ready', delegate: this.main.delegate, thread: 'main', benchMs: this.main.benchMs })
      } catch (e) {
        console.error('[kumpas] failed to load MediaPipe models', e)
        this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  private initWorker() {
    return new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' })
      this.worker = w
      w.onerror = (e) => reject(new Error(e.message || 'worker failed to start'))
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        if (m.type === 'ready') {
          console.info(`[kumpas] hand landmarker: web worker · ${m.delegate}`, m.benchMs)
          this.set({ status: 'ready', delegate: m.delegate, thread: 'worker', benchMs: m.benchMs })
          resolve()
        } else if (m.type === 'error') reject(new Error(m.message))
        else if (m.type === 'result') {
          if (m.error) console.warn('[kumpas] detection frame skipped', m.error)
          this.pending.get(m.id)?.({ hands: m.hands, pose: m.pose, ms: m.ms })
          this.pending.delete(m.id)
        }
      }
      w.postMessage({ type: 'init' } satisfies WorkerIn)
    })
  }

  /** Run hand (and optionally pose) inference on a frame. Takes ownership of the bitmap. */
  detect(bitmap: ImageBitmap, pose: boolean): Promise<InferenceResult> {
    const ts = performance.now()
    if (this.worker && this.status.status === 'ready') {
      const id = ++this.seq
      return new Promise((resolve) => {
        this.pending.set(id, resolve)
        this.worker!.postMessage({ type: 'detect', id, bitmap, ts, pose } satisfies WorkerIn, [bitmap])
      })
    }
    if (this.main) {
      try {
        const t = nextTimestamp(ts)
        const t0 = performance.now()
        const hands = this.main.hand.detectForVideo(bitmap, t).landmarks
        const p = pose && this.main.pose ? (this.main.pose.detectForVideo(bitmap, t).landmarks[0] ?? null) : null
        return Promise.resolve({ hands, pose: p, ms: performance.now() - t0 })
      } finally {
        bitmap.close()
      }
    }
    bitmap.close()
    return Promise.resolve({ hands: [], pose: null, ms: 0 })
  }
}

let client: InferenceClient | null = null
export function getInference() {
  client ??= new InferenceClient()
  return client
}
