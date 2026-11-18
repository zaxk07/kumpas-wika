import { FINGERTIPS } from './handshape'
import type { Handed, HandLandmarks, Pt, UpperBody } from './types'

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

export interface Mapper {
  (p: { x: number; y: number }): [number, number]
}

export interface MapOptions {
  /** Flip horizontally (selfie view). Must match the CSS transform on the <video>. */
  mirror: boolean
  /** Must match the CSS `object-fit` on the <video>. */
  fit: 'cover' | 'contain'
}

/** Map normalized source coords -> canvas pixels, matching the video's CSS `object-fit` and mirroring. */
export function videoMapper(cw: number, ch: number, sw: number, sh: number, { mirror, fit }: MapOptions): Mapper {
  const scale = fit === 'cover' ? Math.max(cw / sw, ch / sh) : Math.min(cw / sw, ch / sh)
  const ox = (cw - sw * scale) / 2
  const oy = (ch - sh * scale) / 2
  return mirror ? (p) => [cw - (p.x * sw * scale + ox), p.y * sh * scale + oy] : (p) => [p.x * sw * scale + ox, p.y * sh * scale + oy]
}

/** Map normalized source coords -> mirrored canvas pixels, matching CSS `object-fit: cover`. */
export function coverMapper(cw: number, ch: number, sw: number, sh: number): Mapper {
  return videoMapper(cw, ch, sw, sh, { mirror: true, fit: 'cover' })
}

export type Trails = Map<number, [number, number][]>
const TRAIL_LEN = 16

export function drawBody(ctx: CanvasRenderingContext2D, body: UpperBody | null, map: Mapper, dpr: number) {
  if (!body) return
  const seg = (a?: Pt, b?: Pt) => {
    if (!a || !b) return
    const [ax, ay] = map(a)
    const [bx, by] = map(b)
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)'
  ctx.lineWidth = 3 * dpr
  ctx.setLineDash([8 * dpr, 6 * dpr])
  seg(body.lShoulder, body.rShoulder)
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
  seg(body.lShoulder, body.lElbow)
  seg(body.lElbow, body.lWrist)
  seg(body.rShoulder, body.rElbow)
  seg(body.rElbow, body.rWrist)
  ctx.fillStyle = 'rgba(125, 211, 252, 0.9)'
  for (const p of [body.lShoulder, body.rShoulder, body.lElbow, body.rElbow, body.lWrist, body.rWrist]) {
    if (!p) continue
    const [x, y] = map(p)
    ctx.beginPath()
    ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Bone colours per hand (signer's left = sky, right = emerald). */
export const HAND_COLORS: Record<Handed, string> = { L: '#38bdf8', R: '#10b981' }

const palmCentre = (pts: [number, number][]) => {
  let x = 0
  let y = 0
  for (const i of [0, 5, 9, 13, 17]) {
    x += pts[i][0]
    y += pts[i][1]
  }
  return [x / 5, y / 5] as [number, number]
}

/**
 * Draw up to two hand skeletons. Each hand keeps its own colour (left sky, right emerald);
 * the active / two-handed sign state shows as the glow around it. When both hands are in
 * the signing space, a dashed line links the palms, brighter the closer they get.
 */
export function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: HandLandmarks[],
  handed: Handed[],
  map: Mapper,
  dpr: number,
  trails: Trails,
  accent: string,
  glowFor: (h: Handed) => boolean,
) {
  const mapped = hands.map((hand) => hand.map(map))
  const seen = new Set<number>()
  // Fingertip trails, keyed by hand identity so they survive the hands swapping order.
  mapped.forEach((pts, hi) => {
    const side = handed[hi] === 'L' ? 1 : 0
    FINGERTIPS.forEach((tip) => {
      const key = side * 100 + tip
      seen.add(key)
      const trail = trails.get(key) ?? []
      trail.push(pts[tip])
      if (trail.length > TRAIL_LEN) trail.shift()
      trails.set(key, trail)
    })
  })
  for (const [key, trail] of trails) {
    if (!seen.has(key)) {
      trail.shift()
      if (!trail.length) trails.delete(key)
    }
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length
      ctx.strokeStyle = `rgba(251, 191, 36, ${a * 0.55})`
      ctx.lineWidth = (1 + a * 3) * dpr
      ctx.beginPath()
      ctx.moveTo(trail[i - 1][0], trail[i - 1][1])
      ctx.lineTo(trail[i][0], trail[i][1])
      ctx.stroke()
    }
  }

  // Inter-hand proximity line.
  if (mapped.length === 2) {
    const [ax, ay] = palmCentre(mapped[0])
    const [bx, by] = palmCentre(mapped[1])
    const span = Math.hypot(mapped[0][0][0] - mapped[0][9][0], mapped[0][0][1] - mapped[0][9][1]) || 1
    const d = Math.hypot(ax - bx, ay - by) / span
    if (d < 5) {
      const k = 1 - d / 5
      ctx.save()
      ctx.setLineDash([6 * dpr, 6 * dpr])
      ctx.strokeStyle = `rgba(250, 250, 250, ${0.15 + 0.5 * k})`
      ctx.lineWidth = (1 + 1.5 * k) * dpr
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = `rgba(250, 250, 250, ${0.3 + 0.6 * k})`
      ctx.beginPath()
      ctx.arc((ax + bx) / 2, (ay + by) / 2, 3 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  mapped.forEach((pts, hi) => {
    const h = handed[hi] ?? 'R'
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // One path for all 21 bones; the glow is a wide translucent stroke (shadowBlur is very
    // expensive on software-rendered canvases and was the main per-frame overlay cost).
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a][0], pts[a][1])
      ctx.lineTo(pts[b][0], pts[b][1])
    }
    ctx.strokeStyle = glowFor(h) ? accent : HAND_COLORS[h]
    ctx.globalAlpha = glowFor(h) ? 0.3 : 0.14
    ctx.lineWidth = 10 * dpr
    ctx.stroke()
    ctx.strokeStyle = HAND_COLORS[h]
    ctx.globalAlpha = 1
    ctx.lineWidth = 3 * dpr
    ctx.stroke()
    pts.forEach(([x, y], i) => {
      const tip = (FINGERTIPS as readonly number[]).includes(i)
      ctx.beginPath()
      ctx.arc(x, y, (tip ? 5.5 : 3.5) * dpr, 0, Math.PI * 2)
      ctx.fillStyle = tip ? '#fbbf24' : '#f4f4f5'
      ctx.fill()
      ctx.lineWidth = 1.5 * dpr
      ctx.strokeStyle = 'rgba(9, 9, 11, 0.8)'
      ctx.stroke()
    })
    ctx.restore()
  })
}

/** Stylized stand-in for the camera image in Demo Mode. */
export function drawDemoBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, body: UpperBody | null, map: Mapper, dpr: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.max(w, h) * 0.75)
  g.addColorStop(0, '#1c1c22')
  g.addColorStop(1, '#09090b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  if (!body?.nose || !body.lShoulder || !body.rShoulder) return
  const [nx, ny] = map(body.nose)
  const [lx, ly] = map(body.lShoulder)
  const [rx] = map(body.rShoulder)
  const sw = Math.abs(rx - lx)
  ctx.save()
  ctx.fillStyle = 'rgba(63, 63, 70, 0.35)'
  ctx.beginPath()
  ctx.ellipse(nx, ny, sw * 0.26, sw * 0.33, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(Math.min(lx, rx) - sw * 0.12, h)
  ctx.quadraticCurveTo(Math.min(lx, rx) - sw * 0.1, ly - 10 * dpr, nx, ly - sw * 0.08)
  ctx.quadraticCurveTo(Math.max(lx, rx) + sw * 0.1, ly - 10 * dpr, Math.max(lx, rx) + sw * 0.12, h)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
