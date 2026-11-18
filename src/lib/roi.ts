/** A crop region in normalized video coordinates (0-1, un-mirrored). */
export interface Roi {
  x: number
  y: number
  w: number
  h: number
}

export const FULL_FRAME: Roi = { x: 0, y: 0, w: 1, h: 1 }
const MIN_SIZE = 0.08
/** Luminance change that counts as "this pixel changed": above rounding, below any real change. */
const CHANGE_LEVELS = 3

export function clampRoi(r: Roi): Roi {
  const w = Math.min(1, Math.max(MIN_SIZE, r.w))
  const h = Math.min(1, Math.max(MIN_SIZE, r.h))
  return { x: Math.min(1 - w, Math.max(0, r.x)), y: Math.min(1 - h, Math.max(0, r.y)), w, h }
}

export const isFullFrame = (r: Roi | null) => !r || (r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999)

/**
 * Find the playing video inside a captured tab. Rendered page chrome, sidebars and
 * thumbnails are pixel-exact from frame to frame, while anything inside a playing video
 * changes at least a little (motion, lighting, even compression noise on a still
 * background). Samples a small copy of the frame for ~1 s, marks pixels that changed
 * repeatedly, and returns the bounding box of that area (trimmed with percentiles, so a
 * stray animated badge doesn't stretch it).
 * Resolves null when too little is moving (e.g. the video is paused).
 */
export async function detectMotionRegion(video: HTMLVideoElement, durationMs = 1200): Promise<Roi | null> {
  const W = 160
  const H = Math.max(1, Math.round((W * video.videoHeight) / Math.max(1, video.videoWidth)))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx || !video.videoWidth) return null
  const changes = new Uint8Array(W * H)
  let prev: Float32Array | null = null
  const steps = Math.max(4, Math.round(durationMs / 100))
  for (let k = 0; k < steps; k++) {
    ctx.drawImage(video, 0, 0, W, H)
    const d = ctx.getImageData(0, 0, W, H).data
    const lum = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
    if (prev) for (let i = 0; i < W * H; i++) if (Math.abs(lum[i] - prev[i]) > CHANGE_LEVELS) changes[i]++
    prev = lum
    await new Promise((r) => setTimeout(r, durationMs / steps))
  }
  const xs: number[] = []
  const ys: number[] = []
  // Changed in at least three sample intervals: a one-off full-frame flash (scroll, scene cut,
  // loop restart) can't stretch the box over the whole tab.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (changes[y * W + x] >= 3) {
        xs.push(x)
        ys.push(y)
      }
  if (xs.length < W * H * 0.01) return null
  const pct = (v: number[], q: number) => {
    const s = [...v].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(q * s.length))]
  }
  const pad = 0.015
  const x0 = pct(xs, 0.01) / W - pad
  const x1 = (pct(xs, 0.99) + 1) / W + pad
  const y0 = pct(ys, 0.01) / H - pad
  const y1 = (pct(ys, 0.99) + 1) / H + pad
  return clampRoi({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
}
