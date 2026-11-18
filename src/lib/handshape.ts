import type { HandLandmarks, HandShape } from './types'

/**
 * Hand geometry + static handshape classifier.
 *
 * Every frame is converted into a hand-local frame:
 *   y -> from the wrist toward the middle-finger knuckle (finger direction)
 *   x -> across the palm, oriented so the index/thumb side is always negative
 * and scaled so the palm length (wrist -> middle MCP) = 1. That makes the rules
 * independent of distance to camera, in-plane rotation, left vs right hand and
 * mirroring. Finger extension is measured in 3D (MediaPipe's z) so a finger
 * pointing at the camera still reads as extended.
 */

export const FINGERTIPS = [4, 8, 12, 16, 20] as const
const INDEX = [5, 6, 7, 8] as const
const MIDDLE = [9, 10, 11, 12] as const
const RING = [13, 14, 15, 16] as const
const PINKY = [17, 18, 19, 20] as const

export interface V2 {
  x: number
  y: number
}
interface V3 extends V2 {
  z: number
}

const sub2 = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y })
const len2 = (a: V2) => Math.hypot(a.x, a.y)
const dot2 = (a: V2, b: V2) => a.x * b.x + a.y * b.y
export const dist = (a: V2, b: V2) => len2(sub2(a, b))
const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z)
const cos3 = (a: V3, b: V3) => {
  const d = len3(a) * len3(b)
  return d === 0 ? 1 : (a.x * b.x + a.y * b.y + a.z * b.z) / d
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export interface Extension {
  index: number
  middle: number
  ring: number
  pinky: number
  thumb: number
}

export interface HandGeo {
  /** Local 2D coordinates (palm units). */
  l: V2[]
  /** Aspect-corrected image coordinates. */
  img: V2[]
  /** Palm length in aspect-corrected image units (3D, robust to tilt). */
  palm: number
  /** Palm centre in aspect-corrected image units. */
  centre: V2
  ext: Extension
  /** +1 fingers point straight up on screen, -1 straight down, ~0 sideways. */
  axisUp: number
  /** 2D finger openness (1 = fingers fully visible/extended in the image plane, ~0 folded toward camera). */
  fold: number
  /** Index MCP->tip length in the image plane (palm units). Short = pointing at/away from the camera. */
  idxLen2D: number
  /** Index tip depth minus MCP depth (palm units). Negative = toward the camera. */
  idxDz: number
  /** On-screen downward component of the index direction (+1 = pointing straight down). */
  idxDown: number
  /** On-screen upward component of the thumb direction (+1 = thumb straight up). */
  thumbUp: number
  /** 3D thumb-tip distance to the index / middle fingertip (palm units). */
  pinchI: number
  pinchM: number
}

/** 0 -> fully curled, 1 -> fully extended (3D joint straightness + reach past the PIP). */
function fingerExtension(p: V3[], [mcp, pip, , tip]: readonly number[]) {
  const straight = cos3(sub3(p[pip], p[mcp]), sub3(p[tip], p[pip]))
  const reach = len3(sub3(p[tip], p[0])) / Math.max(1e-6, len3(sub3(p[pip], p[0])))
  return clamp01((straight - 0.1) / 0.75) * 0.45 + clamp01((reach - 0.95) / 0.3) * 0.55
}

const FOLD_REF = [0.87, 0.95, 0.85, 0.67]

export function analyzeHand(lm: HandLandmarks, aspect: number): HandGeo {
  const p3: V3[] = lm.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }))
  const img: V2[] = p3.map((p) => ({ x: p.x, y: p.y }))
  const palm2 = Math.max(1e-6, dist(img[0], img[9]))
  const palm = Math.max(palm2, len3(sub3(p3[9], p3[0])))

  const ay = { x: (img[9].x - img[0].x) / palm2, y: (img[9].y - img[0].y) / palm2 }
  let ax = { x: -ay.y, y: ay.x }
  if (dot2(sub2(img[5], img[0]), ax) > 0) ax = { x: -ax.x, y: -ax.y }
  const l = img.map((q) => {
    const d = sub2(q, img[0])
    return { x: dot2(d, ax) / palm2, y: dot2(d, ay) / palm2 }
  })

  const thumbStraight = cos3(sub3(p3[3], p3[2]), sub3(p3[4], p3[3]))
  const thumbSpread = dist(l[4], l[9])
  const ext: Extension = {
    index: fingerExtension(p3, INDEX),
    middle: fingerExtension(p3, MIDDLE),
    ring: fingerExtension(p3, RING),
    pinky: fingerExtension(p3, PINKY),
    thumb: clamp01((thumbSpread - 0.55) / 0.3) * 0.75 + clamp01((thumbStraight - 0.3) / 0.6) * 0.25,
  }

  const fold =
    [INDEX, MIDDLE, RING, PINKY].reduce((a, f, i) => a + Math.min(1.2, dist(l[f[0]], l[f[3]]) / FOLD_REF[i]), 0) / 4

  const idxV = sub2(img[8], img[5])
  const thV = sub2(img[4], img[2])
  let cx = 0
  let cy = 0
  for (const i of [0, 5, 9, 13, 17]) {
    cx += img[i].x
    cy += img[i].y
  }
  return {
    l,
    img,
    palm,
    centre: { x: cx / 5, y: cy / 5 },
    ext,
    axisUp: -ay.y,
    fold,
    idxLen2D: dist(l[5], l[8]),
    idxDz: (p3[8].z - p3[5].z) / palm,
    idxDown: idxV.y / Math.max(1e-6, len2(idxV)),
    thumbUp: -thV.y / Math.max(1e-6, len2(thV)),
    pinchI: len3(sub3(p3[4], p3[8])) / palm,
    pinchM: len3(sub3(p3[4], p3[12])) / palm,
  }
}

export interface ShapeResult {
  shape: HandShape
  score: number
}

const ON = 0.6
const OFF = 0.4

export function classifyShape(g: HandGeo): ShapeResult {
  const { l, ext } = g
  const four = [ext.index, ext.middle, ext.ring, ext.pinky]
  const up = (v: number) => v >= ON
  const down = (v: number) => v <= OFF
  const [I, M, R, P] = four.map(up)
  const [iD, mD, rD, pD] = four.map(down)
  const thumbOut = up(ext.thumb)
  const tip = l[4]
  const { pinchI, pinchM } = g
  const side = Math.abs(g.axisUp) < 0.6
  const pointsDown = g.axisUp < -0.6

  // How decisive the finger states are -> base confidence.
  const clarity = four.reduce((a, v) => a + Math.abs(v - 0.5) * 2, 0) / 4
  const conf = (k = 1) => ({ score: Math.min(0.99, (0.55 + 0.45 * clarity) * k) })
  const out = (shape: HandShape, k = 1): ShapeResult => ({ shape, ...conf(k) })

  if (I && M && R && P) return thumbOut ? out('OPEN') : out('B')
  if (M && R && P && !I && pinchI < 0.4) return out('F', 0.95)
  if (I && M && R && pD) return out('W')
  if (I && P && mD && rD && thumbOut) return out('ILY')

  if (I && M && rD && pD) {
    const between = tip.y > 1.05 && tip.x > l[5].x - 0.12 && tip.x < l[9].x + 0.12
    if (between) return out(pointsDown ? 'P' : 'K', 0.92)
    if (side) return out('H', 0.95)
    if (l[8].x > l[12].x + 0.02) return out('R', 0.92)
    // Compare fingertip spread with knuckle spacing: U ≈ 1×, V ≈ 2×.
    return out(dist(l[8], l[12]) / Math.max(1e-6, dist(l[5], l[9])) > 1.5 ? 'V' : 'U')
  }

  if (I && !M && !R && !P && pinchM < 0.4 && l[12].y > 0.95) return out('D', 0.9)

  if (I && mD && rD && pD) {
    if (thumbOut) return out(pointsDown ? 'Q' : side ? 'G' : 'L', side || pointsDown ? 0.92 : 1)
    if (g.idxLen2D < 0.5) {
      if (g.idxDz < -0.15) return out('POINT_OUT', 0.95)
      if (g.idxDz > 0.15) return out('POINT_IN', 0.95)
    }
    if (g.idxDown > 0.6) return out('POINT_IN', 0.9)
    return out('INDEX')
  }

  if (P && iD && mD && rD) return out(thumbOut ? 'Y' : 'I')

  const notUp = !I && !M && !R && !P
  const meanTipY = (l[8].y + l[12].y + l[16].y) / 3
  if (notUp && pinchI < 0.38 && l[8].y > 0.95) return out('O', 0.92)
  if (notUp && l[6].y > 1.25 && l[8].y > Math.max(l[12].y, l[16].y) + 0.25 && mD && rD && pD) return out('X', 0.9)

  const mean = four.reduce((a, b) => a + b, 0) / 4
  if (notUp && mean >= 0.3 && tip.x < -0.2 && pinchI >= 0.3 && pinchI <= 1.2 && l[8].y > 0.95) {
    return { shape: 'C', score: 0.82 }
  }

  if (iD && mD && rD && pD) {
    if (thumbOut) {
      if (side && g.thumbUp > 0.6) return out('THUMB_UP', 0.8 + 0.2 * g.thumbUp)
      if (side && g.thumbUp < -0.6) return out('THUMB_DOWN', 0.8 - 0.2 * g.thumbUp)
      return out('A', 0.8)
    }
    if (tip.x < l[5].x - 0.02) return out('A', 0.95)
    if (tip.y >= 0.92) return out(tip.x < -0.02 ? 'T' : tip.x < 0.2 ? 'N' : 'M', 0.85)
    if (tip.y < meanTipY - 0.2) return out('E', 0.85)
    return out('S', 0.95)
  }

  return { shape: 'UNKNOWN', score: 0 }
}
