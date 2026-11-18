import { FINGERTIPS } from './handshape'
import type { HandLandmarks, Pt, UpperBody } from './types'

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

export function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: HandLandmarks[],
  map: Mapper,
  dpr: number,
  trails: Trails,
  accent: string,
) {
  // Fingertip trails
  hands.forEach((hand, hi) => {
    FINGERTIPS.forEach((tip) => {
      const key = hi * 100 + tip
      const trail = trails.get(key) ?? []
      trail.push(map(hand[tip]))
      if (trail.length > TRAIL_LEN) trail.shift()
      trails.set(key, trail)
    })
  })
  for (const [key, trail] of trails) {
    const hi = Math.floor(key / 100)
    if (hi >= hands.length) {
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

  for (const hand of hands) {
    const pts = hand.map(map)
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
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.22
    ctx.lineWidth = 10 * dpr
    ctx.stroke()
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
  }
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
