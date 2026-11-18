/// <reference lib="webworker" />
/**
 * MediaPipe inference worker. Keeps hand/pose landmark inference off the main
 * thread so the UI and overlay render at display rate regardless of model cost.
 *
 * in:  { type: 'init' } | { type: 'detect', id, bitmap, ts, pose }
 * out: { type: 'ready', delegate, benchMs, hasPose } | { type: 'error', message }
 *    | { type: 'result', id, hands, pose, ms }
 */
import { createLandmarkers, nextTimestamp, type Landmarkers } from './mediapipe'
import type { WorkerIn, WorkerOut } from './inference'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let lm: Landmarkers | null = null

const post = (msg: WorkerOut) => ctx.postMessage(msg)

ctx.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  if (msg.type === 'init') {
    try {
      lm = await createLandmarkers(true)
      post({ type: 'ready', delegate: lm.delegate, benchMs: lm.benchMs, hasPose: !!lm.pose })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  if (msg.type === 'detect') {
    const { id, bitmap } = msg
    if (!lm) {
      bitmap.close()
      post({ type: 'result', id, hands: [], pose: null, ms: 0 })
      return
    }
    try {
      const ts = nextTimestamp(msg.ts) // strictly monotonic per task
      const t0 = performance.now()
      const hands = lm.hand.detectForVideo(bitmap, ts).landmarks
      const pose = msg.pose && lm.pose ? (lm.pose.detectForVideo(bitmap, ts).landmarks[0] ?? null) : null
      post({ type: 'result', id, hands, pose, ms: performance.now() - t0 })
    } catch (err) {
      post({ type: 'result', id, hands: [], pose: null, ms: 0, error: err instanceof Error ? err.message : String(err) })
    } finally {
      bitmap.close()
    }
  }
}
