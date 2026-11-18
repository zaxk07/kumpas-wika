import { LETTERS, WORD_ORDER } from './signs'
import type { HandLandmarks, InputFrame, SignId, UpperBody } from './types'

/**
 * Demo Mode: synthesizes realistic 21-point hand landmark trajectories (plus a
 * simple upper body) that sign whole phrases. Frames go through the *same*
 * SignEngine as the webcam, so this exercises the real classifier end-to-end.
 *
 * Hands are built from joint angles (MCP/PIP/DIP flexion per finger, a thumb tip
 * target, whole-hand rotation) so shapes can morph smoothly for signs like
 * PAALAM (finger fold) and ASL NO (snap).
 */

export const DEMO_W = 1280
export const DEMO_H = 720
const ASPECT = DEMO_W / DEMO_H
const DEG = Math.PI / 180

type Flex = [number, number, number] // degrees at MCP, PIP, DIP (+ = toward camera)
interface Finger {
  a: Flex
  spread?: number // extra lateral angle, degrees (+ = toward pinky side)
}
type Vec3 = [number, number, number]
type Thumb = Vec3 | 'touchIndex' | 'touchMiddle'
interface PoseDef {
  f: [Finger, Finger, Finger, Finger]
  thumb: Thumb
  rot?: number // degrees, + = clockwise on screen
}

const S: Flex = [0, 0, 0]
const CURL: Flex = [85, 100, 55]
const HALF: Flex = [35, 50, 35]
const HOOK: Flex = [0, 95, 70]
const EBEND: Flex = [20, 100, 70]
const OCURVE: Flex = [40, 60, 45]
const KNUCKLE: Flex = [80, 0, 0]
const FWD: Flex = [75, 0, 0]
const BACK: Flex = [-75, 0, 0]

const T_OUT: Vec3 = [-0.95, 0.8, 0]
const T_ALONG: Vec3 = [-0.42, 0.85, -0.1]
const T_ACROSS: Vec3 = [0.05, 0.75, -0.35]
const T_LOW: Vec3 = [0, 0.5, -0.2]
const T_K: Vec3 = [-0.13, 1.35, -0.15]
const T_C: Vec3 = [-0.6, 0.8, -0.35]

const f = (a: Flex, spread = 0): Finger => ({ a, spread })
const curled4 = (): [Finger, Finger, Finger, Finger] => [f(CURL), f(CURL), f(CURL), f(CURL)]

export type DemoShape =
  | 'OPEN' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R'
  | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'A' | 'ILY' | 'INDEX' | 'POINT_OUT' | 'POINT_IN'
  | 'THUMB_UP' | 'THUMB_DOWN' | 'BENT' | 'TWO_OUT' | 'PINCH2'

export const POSES: Record<DemoShape, PoseDef> = {
  OPEN: { f: [f(S, -6), f(S), f(S, 5), f(S, 9)], thumb: T_OUT },
  B: { f: [f(S, 3), f(S), f(S, -2), f(S, -5)], thumb: T_ACROSS },
  C: { f: [f(HALF), f(HALF), f(HALF), f(HALF)], thumb: T_C },
  D: { f: [f(S), f(OCURVE), f(OCURVE), f(OCURVE)], thumb: 'touchMiddle' },
  E: { f: [f(EBEND), f(EBEND), f(EBEND), f(EBEND)], thumb: T_LOW },
  F: { f: [f(OCURVE), f(S), f(S, 6), f(S, 10)], thumb: 'touchIndex' },
  G: { f: [f(S), f(CURL), f(CURL), f(CURL)], thumb: T_OUT, rot: 90 },
  H: { f: [f(S, 3), f(S, -2), f(CURL), f(CURL)], thumb: T_ACROSS, rot: 90 },
  I: { f: [f(CURL), f(CURL), f(CURL), f(S)], thumb: T_ACROSS },
  K: { f: [f(S, -6), f(S, 8), f(CURL), f(CURL)], thumb: T_K },
  L: { f: [f(S), f(CURL), f(CURL), f(CURL)], thumb: T_OUT },
  M: { f: curled4(), thumb: [0.3, 0.95, -0.3] },
  N: { f: curled4(), thumb: [0.1, 1.0, -0.3] },
  O: { f: [f(OCURVE), f(OCURVE), f(OCURVE), f(OCURVE)], thumb: 'touchIndex' },
  P: { f: [f(S, -6), f(S, 8), f(CURL), f(CURL)], thumb: T_K, rot: 150 },
  Q: { f: [f(S), f(CURL), f(CURL), f(CURL)], thumb: T_OUT, rot: 150 },
  R: { f: [f(S, 22), f(S, -8), f(CURL), f(CURL)], thumb: T_ACROSS },
  S: { f: curled4(), thumb: T_ACROSS },
  T: { f: curled4(), thumb: [-0.15, 1.02, -0.3] },
  U: { f: [f(S, 3), f(S, -2), f(CURL), f(CURL)], thumb: T_ACROSS },
  V: { f: [f(S, -12), f(S, 10), f(CURL), f(CURL)], thumb: T_ACROSS },
  W: { f: [f(S, -10), f(S), f(S, 10), f(CURL)], thumb: T_ACROSS },
  X: { f: [f(HOOK), f(CURL), f(CURL), f(CURL)], thumb: T_ACROSS },
  Y: { f: [f(CURL), f(CURL), f(CURL), f(S, 10)], thumb: T_OUT },
  A: { f: curled4(), thumb: T_ALONG },
  ILY: { f: [f(S), f(CURL), f(CURL), f(S, 8)], thumb: T_OUT },
  INDEX: { f: [f(S), f(CURL), f(CURL), f(CURL)], thumb: T_ACROSS },
  POINT_OUT: { f: [f(FWD), f(CURL), f(CURL), f(CURL)], thumb: T_ACROSS },
  POINT_IN: { f: [f(BACK), f(CURL), f(CURL), f(CURL)], thumb: T_ACROSS },
  THUMB_UP: { f: curled4(), thumb: T_OUT, rot: 70 },
  THUMB_DOWN: { f: curled4(), thumb: T_OUT, rot: -110 },
  BENT: { f: [f(KNUCKLE, -6), f(KNUCKLE), f(KNUCKLE, 5), f(KNUCKLE, 9)], thumb: T_OUT },
  TWO_OUT: { f: [f(S, 2), f(S, -2), f(CURL), f(CURL)], thumb: T_OUT },
  PINCH2: { f: [f([45, 50, 30]), f([45, 55, 30]), f(CURL), f(CURL)], thumb: 'touchIndex' },
}

// Local frame: wrist at origin, palm length = 1, +y toward fingers, -x = index/thumb side, -z = toward camera.
const MCP: [number, number][] = [[-0.3, 0.95], [0, 1], [0.22, 0.95], [0.4, 0.85]]
const SEG = [[0.4, 0.25, 0.22], [0.45, 0.27, 0.23], [0.4, 0.25, 0.2], [0.3, 0.2, 0.17]]
const BASE_ANGLE = [-6, 0, 6, 14]
const CMC: Vec3 = [-0.25, 0.2, 0]

function fingerJoints(fi: number, fg: Finger): Vec3[] {
  const [mx, my] = MCP[fi]
  const alpha = (BASE_ANGLE[fi] + (fg.spread ?? 0)) * DEG
  const pts: Vec3[] = [[mx, my, 0]]
  let phi = 0
  let [x, y, z] = [mx, my, 0]
  for (let j = 0; j < 3; j++) {
    phi += fg.a[j] * DEG
    const L = SEG[fi][j]
    x += L * Math.sin(alpha) * Math.cos(phi)
    y += L * Math.cos(alpha) * Math.cos(phi)
    z += -L * Math.sin(phi)
    pts.push([x, y, z])
  }
  return pts
}

interface Resolved {
  fingers: Vec3[][]
  thumbTip: Vec3
  rot: number
}

function resolve(def: PoseDef): Resolved {
  const fingers = def.f.map((fg, i) => fingerJoints(i, fg))
  let thumbTip: Vec3
  if (def.thumb === 'touchIndex') {
    const t = fingers[0][3]
    thumbTip = [t[0] - 0.04, t[1] - 0.04, t[2] + 0.02]
  } else if (def.thumb === 'touchMiddle') {
    const t = fingers[1][3]
    thumbTip = [t[0] - 0.04, t[1] - 0.04, t[2] + 0.02]
  } else thumbTip = def.thumb
  return { fingers, thumbTip, rot: def.rot ?? 0 }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]

function noise(seed: number) {
  const s = Math.sin(seed * 12.9898) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 2
}

export interface HandPlacement {
  wx: number // wrist x (image 0–1)
  wy: number // wrist y
  palm: number // palm length in image-height units
  rot?: number // extra rotation, degrees
  mirror?: boolean // mirror the hand in image space around the wrist (left hand)
}

/** Build 21 landmarks for a (possibly morphing) pose. */
export function buildHand(a: DemoShape, place: HandPlacement, t = 0, b?: DemoShape, k = 0): HandLandmarks {
  const ra = resolve(POSES[a])
  const r = b ? resolve(POSES[b]) : ra
  const kk = b ? k : 0
  const fingers = ra.fingers.map((fj, i) => fj.map((p, j) => lerp3(p, r.fingers[i][j], kk)))
  const tip = lerp3(ra.thumbTip, r.thumbTip, kk)
  const rot = (lerp(ra.rot, r.rot, kk) + (place.rot ?? 0)) * DEG
  const bow: Vec3 = [-0.08, 0, 0]
  const tj = (s: number, w: number): Vec3 => [
    CMC[0] + (tip[0] - CMC[0]) * s + bow[0] * w,
    CMC[1] + (tip[1] - CMC[1]) * s,
    CMC[2] + (tip[2] - CMC[2]) * s,
  ]
  const local: Vec3[] = [[0, 0, 0], CMC, tj(0.4, 1), tj(0.72, 0.6), tip, ...fingers.flat()]

  const u = { x: Math.sin(rot), y: -Math.cos(rot) }
  const v = { x: Math.cos(rot), y: Math.sin(rot) }
  const sx = place.mirror ? -1 : 1
  const ax = place.wx * ASPECT
  const jitter = 0.0012
  return local.map(([x, y, z], i) => ({
    x: (ax + sx * (x * v.x + y * u.x) * place.palm) / ASPECT + noise(t * 0.37 + i * 7.1) * jitter,
    y: place.wy + (x * v.y + y * u.y) * place.palm + noise(t * 0.53 + i * 3.3) * jitter,
    z: (z * place.palm) / ASPECT,
  }))
}

// ---------------------------------------------------------------------------
// Scripted performances
// ---------------------------------------------------------------------------

interface MotionOut {
  dx?: number
  dy?: number
  scale?: number
  rot?: number
  morph?: number
}
type Motion = (s: number) => MotionOut

export interface Segment {
  sign: SignId | null // null = pause (hand lowered out of view)
  shape?: DemoShape
  morphTo?: DemoShape
  dur: number
  base?: [number, number]
  motion?: Motion
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
const still: Motion = (s) => ({ dx: 0.003 * Math.sin(s * 2.1), dy: 0.002 * Math.sin(s * 1.7) })
const osc = (hz: number, s: number) => Math.sin(2 * Math.PI * hz * s)

const CHEST: [number, number] = [0.58, 0.5]
const FACE: [number, number] = [0.53, 0.2]
const HIGH: [number, number] = [0.6, 0.36]

interface SignScript {
  shape: DemoShape
  dur: number
  base?: [number, number]
  motion?: Motion
  morphTo?: DemoShape
}

/** How the simulator performs each sign. */
export const PERFORM: Record<SignId, SignScript> = {
  KUMUSTA: { shape: 'OPEN', dur: 1.5, base: HIGH, motion: (s) => ({ dx: 0.06 * osc(2.2, s) }) },
  HELLO_SALUTE: { shape: 'B', dur: 1.4, base: [0.5, 0.17], motion: (s) => ({ dx: 0.16 * ease((s - 0.1) / 0.5), dy: 0.02 * ease(s / 0.6) }) },
  PAALAM: { shape: 'OPEN', morphTo: 'BENT', dur: 1.7, base: HIGH, motion: (s) => ({ morph: (1 - Math.cos(2 * Math.PI * 2.2 * s)) / 2 }) },
  SALAMAT: { shape: 'B', dur: 1.4, base: [0.55, 0.3], motion: (s) => ({ dy: 0.22 * ease(s / 0.9), scale: 1 + 0.25 * ease(s / 0.9) }) },
  WALANG_ANUMAN: { shape: 'OPEN', dur: 1.4, base: [0.58, 0.55], motion: (s) => ({ dx: -0.13 + 0.26 * ease((s - 0.15) / 0.5) }) },
  OO: { shape: 'S', dur: 1.6, motion: (s) => ({ dy: 0.035 * osc(2.4, s) }) },
  HINDI: { shape: 'INDEX', dur: 1.4, motion: (s) => ({ dx: -0.13 + 0.26 * ease((s - 0.15) / 0.38) }) },
  NO_SNAP: { shape: 'TWO_OUT', morphTo: 'PINCH2', dur: 1.7, motion: (s) => ({ morph: (1 - Math.cos(2 * Math.PI * 2 * s)) / 2 }) },
  PAKIUSAP: { shape: 'OPEN', dur: 1.7, base: [0.55, 0.58], motion: (s) => ({ dx: 0.02 * Math.sin(2 * Math.PI * 1.5 * s), dy: 0.035 * Math.cos(2 * Math.PI * 1.5 * s) }) },
  PATAWAD: { shape: 'S', dur: 1.7, base: [0.55, 0.58], motion: (s) => ({ dx: 0.02 * Math.sin(2 * Math.PI * 1.5 * s), dy: 0.035 * Math.cos(2 * Math.PI * 1.5 * s) }) },
  TULONG: { shape: 'THUMB_UP', dur: 1.45, base: [0.6, 0.7], motion: (s) => ({ dy: -0.32 * ease(s / 1.0) }) },
  MAHAL_KITA: { shape: 'ILY', dur: 1.2 },
  MAGALING: { shape: 'THUMB_UP', dur: 1.2 },
  MALI: { shape: 'THUMB_DOWN', dur: 1.2 },
  AKO: { shape: 'POINT_IN', dur: 1.2, base: [0.53, 0.55] },
  IKAW: { shape: 'POINT_OUT', dur: 1.2 },
  GUSTO: { shape: 'C', dur: 1.3, motion: (s) => ({ scale: 1 - 0.3 * ease((s - 0.1) / 0.7), dy: 0.03 * ease((s - 0.1) / 0.7) }) },
  KAILANGAN: { shape: 'X', dur: 1.6, motion: (s) => ({ dy: 0.03 * osc(2.2, s) }) },
  SAAN: { shape: 'INDEX', dur: 1.5, base: HIGH, motion: (s) => ({ dx: 0.025 * osc(2.5, s) }) },
  ANO: { shape: 'OPEN', dur: 1.6, motion: (s) => ({ dx: 0.02 * osc(2.5, s), rot: 80 }) },
  TUBIG: { shape: 'W', dur: 1.2, base: FACE },
  KAIN: { shape: 'O', dur: 1.2, base: FACE },
  A: { shape: 'A', dur: 1.3 }, B: { shape: 'B', dur: 1.3 }, C: { shape: 'C', dur: 1.3 }, D: { shape: 'D', dur: 1.3 },
  E: { shape: 'E', dur: 1.3 }, F: { shape: 'F', dur: 1.3 }, G: { shape: 'G', dur: 1.3 }, H: { shape: 'H', dur: 1.3 },
  I: { shape: 'I', dur: 1.3 },
  J: { shape: 'I', dur: 1.4, motion: (s) => ({ dy: 0.06 * ease(s / 0.35), dx: -0.05 * ease((s - 0.35) / 0.35), rot: -35 * ease((s - 0.35) / 0.35) }) },
  K: { shape: 'K', dur: 1.3 }, L: { shape: 'L', dur: 1.3 }, M: { shape: 'M', dur: 1.3 }, N: { shape: 'N', dur: 1.3 },
  O: { shape: 'O', dur: 1.3 }, P: { shape: 'P', dur: 1.3 }, Q: { shape: 'Q', dur: 1.3 }, R: { shape: 'R', dur: 1.3 },
  S: { shape: 'S', dur: 1.3 }, T: { shape: 'T', dur: 1.3 }, U: { shape: 'U', dur: 1.3 }, V: { shape: 'V', dur: 1.3 },
  W: { shape: 'W', dur: 1.3 }, X: { shape: 'X', dur: 1.3 }, Y: { shape: 'Y', dur: 1.3 },
  Z: {
    shape: 'INDEX',
    dur: 1.5,
    base: [0.58, 0.42],
    motion: (s) => {
      const pts: [number, number][] = [[-0.05, -0.06], [0.05, -0.06], [-0.05, 0.06], [0.05, 0.06]]
      const k = Math.min(2.999, Math.max(0, s / 0.24))
      const i = Math.floor(k)
      const e = ease(k - i)
      return { dx: lerp(pts[i][0], pts[i + 1][0], e), dy: lerp(pts[i][1], pts[i + 1][1], e) }
    },
  },
}

// Hand drop between signs inside a phrase (longer than the engine's 250 ms hand reset).
const GAP = 0.3
const PAUSE = 2.8
const IN_PHRASE_MAX = 1.25

function phrase(signs: SignId[]): Segment[] {
  const out: Segment[] = []
  signs.forEach((sign, i) => {
    const p = PERFORM[sign]
    // Inside a phrase, move on soon after the sign locks (all signs lock by ~1.15 s) so the
    // gap to the next sign stays well under the 2 s sentence-break pause.
    const dur = i < signs.length - 1 ? Math.min(p.dur, IN_PHRASE_MAX) : p.dur
    out.push({ sign, shape: p.shape, morphTo: p.morphTo, dur, base: p.base, motion: p.motion })
    out.push({ sign: null, dur: i === signs.length - 1 ? PAUSE : GAP })
  })
  return out
}

/** Showcase loop: short phrases that exercise the sentence builder. */
export const SHOWCASE: SignId[][] = [
  ['KUMUSTA', 'IKAW'],
  ['AKO', 'KAILANGAN', 'TULONG'],
  ['GUSTO', 'TUBIG'],
  ['AKO', 'Z', 'A', 'K', 'I'],
  ['SALAMAT', 'TULONG'],
  ['MAHAL_KITA'],
]
export const DEMO_SCRIPT: Segment[] = [{ sign: null, dur: 0.8 }, ...SHOWCASE.flatMap(phrase)]

/** Every supported sign once, used by `npm run verify`. */
export const COVERAGE_SCRIPT: Segment[] = [
  { sign: null, dur: 0.8 },
  ...([...WORD_ORDER, ...LETTERS] as SignId[]).flatMap((s) => phrase([s]).map((seg) => (seg.sign ? seg : { ...seg, dur: 0.7 }))),
]

export const scriptLength = (script: Segment[]) => script.reduce((a, s) => a + s.dur, 0)
export const DEMO_LENGTH = scriptLength(DEMO_SCRIPT)

export interface DemoFrame extends InputFrame {
  /** What the simulator is currently signing (for the UI), null during pauses. */
  acting: SignId | null
}

/** Sample a scripted performance at `elapsed` seconds. */
export function demoFrame(elapsed: number, t: number, script: Segment[] = DEMO_SCRIPT): DemoFrame {
  const total = scriptLength(script)
  let s = ((elapsed % total) + total) % total
  let seg = script[0]
  for (const g of script) {
    if (s < g.dur) {
      seg = g
      break
    }
    s -= g.dur
  }
  const nose = { x: 0.5, y: 0.22, z: 0 }
  const lShoulder = { x: 0.36, y: 0.5, z: 0 }
  const rShoulder = { x: 0.64, y: 0.5, z: 0 }
  const body: UpperBody = { nose, lShoulder, rShoulder, lElbow: { x: 0.3, y: 0.82, z: 0 }, lWrist: { x: 0.33, y: 1.02, z: 0 } }

  if (!seg.sign || !seg.shape) {
    body.rElbow = { x: 0.7, y: 0.82, z: 0 }
    body.rWrist = { x: 0.67, y: 1.02, z: 0 }
    return { t, hands: [], body, width: DEMO_W, height: DEMO_H, acting: null }
  }

  const m = (seg.motion ?? still)(s)
  const [bx, by] = seg.base ?? CHEST
  const palm = 0.17 * (m.scale ?? 1)
  const rot = m.rot ?? 0
  // `base` is roughly the palm centre; place the wrist below it along the hand axis.
  const totalRot = ((POSES[seg.shape].rot ?? 0) + rot) * DEG
  const wx = bx + (m.dx ?? 0) - (Math.sin(totalRot) * palm * 0.5) / ASPECT
  const wy = by + (m.dy ?? 0) + Math.cos(totalRot) * palm * 0.5
  const hand = buildHand(seg.shape, { wx, wy, palm, rot }, elapsed, seg.morphTo, m.morph ?? 0)
  body.rWrist = { x: hand[0].x, y: hand[0].y, z: 0 }
  body.rElbow = { x: (rShoulder.x + hand[0].x) / 2 + 0.07, y: Math.max(rShoulder.y, hand[0].y) + 0.12, z: 0 }
  return { t, hands: [hand], body, width: DEMO_W, height: DEMO_H, acting: seg.sign }
}
