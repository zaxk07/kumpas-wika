import { analyzeHand, classifyShape, dist, type HandGeo, type V2 } from './handshape'
import { activeIn, SIGNS } from './signs'
import type { Detection, Handed, HandShape, InputFrame, SignId, Standard, UpperBody } from './types'

/**
 * Hybrid static + dynamic sign recognizer.
 *
 *  1. Each frame, the dominant hand's static handshape is classified geometrically.
 *  2. A time-indexed sliding window (WINDOW_MS of performance.now() timestamps)
 *     keeps palm position, size, orientation, finger fold and handshape. Motion
 *     features — velocity, displacement, oscillation (zero-crossings), path —
 *     are measured in palm-lengths, so they don't depend on camera distance or
 *     on the webcam's frame rate.
 *  3. Dynamic rules run first. Static signs are only considered when the hand
 *     has been still (velocity gate) and no dynamic sign was in progress.
 *  4. A hold-to-lock stabilizer commits a candidate after the preset's lock time
 *     (or a few consecutive high-confidence frames in Fluent mode), then latches it.
 *     A sign that was clearly recognized (peak confidence held briefly) is also
 *     committed when the signer moves straight on to the next sign before the ring
 *     closes. The same sign can only lock again after a hand reset (hand drops out
 *     of view / goes neutral) or a REPEAT_COOLDOWN_MS refractory period.
 *  5. Both hands are tracked, each with its own time window, so one-handed signs
 *     follow whichever hand is active without a buffer reset when the signer
 *     switches hands, and two-handed signs are read from the relation between them
 *     (distance, symmetric or parallel motion, palm orientation).
 */

export const WINDOW_MS = 1000
export const REPEAT_COOLDOWN_MS = 1800

/** Lock-in speed. Fluent is for natural-speed signing and video, where signs are held ~250-350 ms. */
export type SpeedPreset = 'fluent' | 'standard'
export interface LockTiming {
  /** Hold time before a still sign locks. */
  staticMs: number
  /** Time a moving sign must keep matching before it locks. */
  dynamicMs: number
  /** Lock early after this many consecutive frames at >= fastConf (0 = off). */
  fastFrames: number
  fastConf: number
  /** Commit a sign the signer moved away from if it held >= peakConf for >= peakMs. */
  peakConf: number
  peakMs: number
}
export const TIMING: Record<SpeedPreset, LockTiming> = {
  fluent: { staticMs: 260, dynamicMs: 260, fastFrames: 2, fastConf: 0.78, peakConf: 0.75, peakMs: 180 },
  standard: { staticMs: 380, dynamicMs: 380, fastFrames: 0, fastConf: 1, peakConf: 0.75, peakMs: 180 },
}
export const LOCK_STATIC_MS = TIMING.standard.staticMs
export const LOCK_DYNAMIC_MS = TIMING.standard.dynamicMs
export const FLUENT_LOCK_MS = TIMING.fluent.staticMs
const RECENT_MS = 300
const DROP_GRACE_MS = 150
const SWITCH_RELEASE_MS = 200
const HAND_RESET_MS = 250
const NEUTRAL_RESET_MS = 700
const DYNAMIC_SUPPRESS_MS = 900
const MAX_FRAME_GAP_MS = 300
/** How long another hand must out-score the active one before tracking switches to it. */
const HAND_SWITCH_MS = 180
/**
 * Static handshapes that are also the starting shape of a moving sign (B -> SALAMAT, fist -> OO,
 * C -> GUSTO, X -> KAILANGAN, I -> J, thumbs-up -> TULONG, F -> PAMILYA). Holding one briefly is
 * often just the onset of the moving sign, so these need a little more hold to lock as a static
 * sign and never take the fast-frames shortcut.
 */
const ONSET_SHAPES = new Set<SignId>(['B', 'S', 'A', 'E', 'M', 'N', 'T', 'C', 'X', 'I', 'F', 'MAGALING'])
const ONSET_EXTRA_MS = 200
const STILL_SPEED = 0.9 // palm-lengths / s
const STILL_MAX_SPEED = 1.6
/** Palm growing / shrinking faster than this (|ln| per s) means the hand is moving in depth, not held. */
const STILL_DEPTH_RATE = 0.3
const MIN_STABLE_MS = 250

interface Sample {
  t: number
  c: V2
  imgY: number
  palm: number
  shape: HandShape
  score: number
  axisUp: number
  fold: number
  /** Index-knuckle vs pinky-knuckle horizontal order (palm units); flips sign when the palm turns over. */
  side: number
}

export interface Features {
  n: number
  spanMs: number
  xRange: number
  yRange: number
  dx: number
  dy: number
  dy1: number // first half of the window
  dx2: number // second half of the window
  xCross: number
  yCross: number
  foldCross: number
  snapCross: number
  peakVx: number
  pathLen: number
  recentSpeed: number
  recentMaxSpeed: number
  /** Rate of palm-size change over the recent window (|ln| per second): depth motion, toward or away from the camera. */
  recentDepthRate: number
  scaleRatio: number
  startImgY: number
  imgY: number
  meanAxisUp: number
  recentShape: HandShape
  recentShare: number
  stableMs: number
  share: (family: HandShape[]) => number
}

export interface EngineOutput {
  hasHand: boolean
  shape: HandShape
  shapeScore: number
  candidate: Detection | null
  /** 0–1 hold-to-lock progress for the current candidate. */
  progress: number
  /** True while the current candidate is the sign that was just committed. */
  latched: boolean
  /** True when the candidate repeats the last commit and is waiting for a reset/cooldown. */
  cooling: boolean
  committed: Detection | null
  samples: number
  windowMs: number
  /** Palm length as a fraction of frame height (for alignment hints). */
  palmHeight: number
  /** Palm centre in normalized image coords. */
  centre: V2 | null
  /** Signer's left/right for each hand in the input frame (same order). */
  handed: Handed[]
  /** The hand one-handed signs are being read from. */
  activeHand: Handed | null
  /** The current candidate is being read from both hands. */
  twoHanded: boolean
  /** Distance between the two hands in palm lengths (both in view). */
  handDistance: number | null
}

const OPENISH: HandShape[] = ['OPEN', 'B']
const INDEXISH: HandShape[] = ['INDEX', 'D', 'POINT_OUT']
const FISTISH: HandShape[] = ['S', 'A', 'E', 'M', 'N', 'T']
const TWO_UP: HandShape[] = ['U', 'V', 'H', 'K', 'R']
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

/** Direction changes with hysteresis so jitter doesn't count. */
function crossings(v: number[], thr: number) {
  let dir = 0
  let n = 0
  for (const x of v) {
    if (x > thr) {
      if (dir === -1) n++
      dir = 1
    } else if (x < -thr) {
      if (dir === 1) n++
      dir = -1
    }
  }
  return n
}

/** Transitions of a signal between a low and a high band (e.g. fingers open <-> folded). */
function bandCrossings(v: number[], lo: number, hi: number) {
  let state = 0
  let n = 0
  for (const x of v) {
    const s = x > hi ? 1 : x < lo ? -1 : 0
    if (s !== 0 && state !== 0 && s !== state) n++
    if (s !== 0) state = s
  }
  return n
}

function smooth(v: number[]) {
  return v.map((_, i) => {
    let s = 0
    let n = 0
    for (let k = i - 1; k <= i + 1; k++) {
      if (k >= 0 && k < v.length) {
        s += v[k]
        n++
      }
    }
    return s / n
  })
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]

export function computeFeatures(buf: Sample[]): Features | null {
  const n = buf.length
  if (n < 4) return null
  const t0 = buf[0].t
  const tN = buf[n - 1].t
  const palm = median(buf.map((s) => s.palm))
  const xs = buf.map((s) => s.c.x / palm)
  const ys = buf.map((s) => s.c.y / palm)
  const vx: number[] = []
  const vy: number[] = []
  let pathLen = 0
  for (let i = 1; i < n; i++) {
    const dt = Math.max(1, buf[i].t - buf[i - 1].t) / 1000
    vx.push((xs[i] - xs[i - 1]) / dt)
    vy.push((ys[i] - ys[i - 1]) / dt)
    pathLen += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
  }
  // Smooth velocities only when sampling is dense; at ≤15 fps smoothing would erase real oscillations.
  const meanDt = (tN - t0) / Math.max(1, n - 1)
  const svx = meanDt < 50 ? smooth(vx) : vx
  const svy = meanDt < 50 ? smooth(vy) : vy
  const speeds = svx.map((x, i) => Math.hypot(x, svy[i])) // speeds[i] is between sample i and i+1

  const recentIdx = Math.min(buf.findIndex((s) => s.t >= tN - RECENT_MS), n - 2)
  const recent = buf.slice(recentIdx)
  const recentSpeeds = speeds.slice(Math.max(0, recentIdx))
  const maxIdx = buf.findIndex((s) => s.t >= tN - 400)
  const counts = new Map<HandShape, number>()
  for (const s of recent) counts.set(s.shape, (counts.get(s.shape) ?? 0) + 1)
  let recentShape: HandShape = 'UNKNOWN'
  let best = 0
  for (const [s, c] of counts) {
    if (c > best) {
      recentShape = s
      best = c
    }
  }
  let stableFrom = tN
  for (let i = n - 1; i >= 0 && buf[i].shape === recentShape; i--) stableFrom = buf[i].t

  const midT = t0 + (tN - t0) / 2
  const mid = Math.max(0, buf.findIndex((s) => s.t >= midT))
  const snapSeq = buf.map((s) => (TWO_UP.includes(s.shape) ? 1 : s.shape === 'O' ? -1 : 0))
  const firstPalms = buf.slice(0, 3).map((s) => s.palm)
  const lastPalms = buf.slice(-3).map((s) => s.palm)

  return {
    n,
    spanMs: tN - t0,
    xRange: Math.max(...xs) - Math.min(...xs),
    yRange: Math.max(...ys) - Math.min(...ys),
    dx: xs[n - 1] - xs[0],
    dy: ys[n - 1] - ys[0],
    dy1: ys[mid] - ys[0],
    dx2: xs[n - 1] - xs[mid],
    xCross: crossings(svx, 0.9),
    yCross: crossings(svy, 0.9),
    foldCross: bandCrossings(buf.map((s) => s.fold), 0.45, 0.75),
    snapCross: bandCrossings(snapSeq, -0.5, 0.5),
    peakVx: Math.max(...svx.map(Math.abs)),
    pathLen,
    recentSpeed: recentSpeeds.reduce((a, b) => a + b, 0) / Math.max(1, recentSpeeds.length),
    recentMaxSpeed: Math.max(0, ...speeds.slice(Math.max(0, maxIdx))),
    recentDepthRate:
      recent.length >= 3 && recent[recent.length - 1].t > recent[0].t
        ? Math.abs(Math.log(median(recent.slice(-2).map((q) => q.palm)) / Math.max(1e-6, median(recent.slice(0, 2).map((q) => q.palm))))) /
          ((recent[recent.length - 1].t - recent[0].t) / 1000)
        : 0,
    scaleRatio: median(lastPalms) / Math.max(1e-6, median(firstPalms)),
    startImgY: buf[0].imgY,
    imgY: buf[n - 1].imgY,
    meanAxisUp: buf.reduce((a, s) => a + s.axisUp, 0) / n,
    recentShape,
    recentShare: best / Math.max(1, recent.length),
    stableMs: tN - stableFrom,
    share: (family) => buf.filter((s) => family.includes(s.shape)).length / n,
  }
}

interface Context {
  body: UpperBody | null
}

function shoulderY(body: UpperBody | null) {
  return body?.lShoulder && body?.rShoulder ? (body.lShoulder.y + body.rShoulder.y) / 2 : null
}
/** Hand held at face/chin height (well above the shoulder line). */
function atFace(imgY: number, ctx: Context) {
  const sy = shoulderY(ctx.body)
  return sy != null ? imgY < sy - 0.12 : imgY < 0.36
}
/** Hand starting above the shoulders (chin/face region). */
function startsHigh(imgY: number, ctx: Context) {
  const sy = shoulderY(ctx.body)
  return sy != null ? imgY < sy : imgY < 0.47
}

type Rule = { id: SignId; test: (f: Features, ctx: Context) => number | null }

const isCircle = (f: Features) =>
  f.xCross >= 1 && f.yCross >= 1 && f.xRange > 0.3 && f.yRange > 0.3 && f.xRange / f.yRange > 0.55 && f.xRange / f.yRange < 1.8

/** Dynamic (motion) rules, evaluated in order. Each returns a confidence or null. */
const DYNAMIC_RULES: Rule[] = [
  { id: 'NO_SNAP', test: (f) => (f.snapCross >= 2 && f.share([...TWO_UP, 'O']) > 0.7 ? clamp(0.7 + 0.08 * f.snapCross, 0, 0.97) : null) },
  {
    id: 'PAALAM',
    test: (f) =>
      f.foldCross >= 2 && f.share(OPENISH) > 0.6 && f.xRange < 0.6 && f.yRange < 0.6 ? clamp(0.68 + 0.08 * f.foldCross, 0, 0.97) : null,
  },
  { id: 'PAKIUSAP', test: (f) => (f.share(OPENISH) > 0.6 && isCircle(f) ? clamp(0.7 + 0.1 * Math.min(f.xCross, f.yCross), 0, 0.95) : null) },
  { id: 'PATAWAD', test: (f) => (f.share(FISTISH) > 0.6 && isCircle(f) ? clamp(0.7 + 0.1 * Math.min(f.xCross, f.yCross), 0, 0.95) : null) },
  {
    id: 'KUMUSTA',
    test: (f) =>
      f.share(OPENISH) > 0.6 && f.xCross >= 2 && f.xRange > 0.45 && f.xRange > f.yRange * 1.6 && f.meanAxisUp > 0.55
        ? clamp(0.62 + 0.08 * f.xCross + 0.1 * clamp(f.xRange - 0.45), 0, 0.99)
        : null,
  },
  {
    id: 'ANO',
    test: (f) =>
      f.share(OPENISH) > 0.6 && Math.abs(f.meanAxisUp) < 0.5 && f.xCross >= 2 && f.xRange > 0.25 ? clamp(0.66 + 0.07 * f.xCross, 0, 0.95) : null,
  },
  {
    id: 'OO',
    test: (f) =>
      f.share(FISTISH) > 0.6 && f.yCross >= 2 && f.yRange > 0.18 && f.yRange > f.xRange * 1.6 ? clamp(0.62 + 0.08 * f.yCross, 0, 0.98) : null,
  },
  {
    id: 'KAILANGAN',
    test: (f) =>
      f.share(['X']) > 0.5 && f.yCross >= 2 && f.yRange > 0.15 && f.yRange > f.xRange * 1.3 ? clamp(0.66 + 0.08 * f.yCross, 0, 0.96) : null,
  },
  {
    id: 'SAAN',
    test: (f) =>
      f.share(['INDEX']) > 0.55 && f.xCross >= 2 && f.xRange > 0.3 && Math.abs(f.dy) < 0.4 && f.yRange < f.xRange * 0.7
        ? clamp(0.64 + 0.07 * f.xCross, 0, 0.96)
        : null,
  },
  {
    id: 'Z',
    test: (f) => (f.share(['INDEX']) > 0.5 && f.xCross >= 2 && f.dy > 0.45 && f.xRange > 0.5 ? clamp(0.7 + 0.1 * clamp(f.dy - 0.45), 0, 0.95) : null),
  },
  {
    id: 'HINDI',
    test: (f) =>
      f.share(['INDEX']) > 0.55 && f.xCross <= 1 && f.xRange > 1.1 && f.peakVx > 3 && f.xRange > f.yRange * 1.8 && Math.abs(f.dy) < 0.4
        ? clamp(0.68 + 0.1 * clamp(f.xRange - 1.1) + 0.1 * clamp((f.peakVx - 3) / 4), 0, 0.97)
        : null,
  },
  {
    id: 'HELLO_SALUTE',
    test: (f, ctx) =>
      f.share(OPENISH) > 0.6 && atFace(f.startImgY, ctx) && f.xCross <= 1 && f.xRange > 0.8 && f.peakVx > 2 && f.xRange > f.yRange * 1.2
        ? clamp(0.68 + 0.1 * clamp(f.xRange - 0.8), 0, 0.95)
        : null,
  },
  {
    id: 'WALANG_ANUMAN',
    test: (f, ctx) =>
      f.share(OPENISH) > 0.6 && !startsHigh(f.startImgY, ctx) && f.xCross <= 1 && f.xRange > 1.0 && f.peakVx > 2.5 && f.xRange > f.yRange * 1.5
        ? clamp(0.68 + 0.1 * clamp(f.xRange - 1.0), 0, 0.95)
        : null,
  },
  {
    id: 'TULONG',
    test: (f) =>
      f.share(['THUMB_UP', ...FISTISH]) > 0.6 && f.dy < -0.9 && f.yCross <= 1 && -f.dy > Math.abs(f.dx) * 1.3
        ? clamp(0.64 + 0.15 * clamp(-f.dy - 0.9) + 0.15 * f.share(['THUMB_UP']), 0, 0.97)
        : null,
  },
  {
    id: 'SALAMAT',
    test: (f, ctx) =>
      f.share(OPENISH) > 0.6 && startsHigh(f.startImgY, ctx) && f.dy > 0.6 && f.dy > Math.abs(f.dx) * 1.2 && f.yCross <= 1
        ? clamp(0.64 + 0.12 * clamp(f.dy - 0.6) + 0.12 * clamp((f.scaleRatio - 1) / 0.2), 0, 0.97)
        : null,
  },
  { id: 'GUSTO', test: (f) => (f.share(['C']) > 0.5 && f.scaleRatio < 0.84 ? clamp(0.68 + 0.6 * (0.84 - f.scaleRatio), 0, 0.95) : null) },
  {
    id: 'J',
    test: (f) =>
      f.share(['I']) > 0.5 && f.pathLen > 0.6 && f.dy1 > 0.2 && Math.abs(f.dx2) > 0.25 && f.xCross <= 1
        ? clamp(0.68 + 0.1 * clamp(f.pathLen - 0.6), 0, 0.93)
        : null,
  },
]

const STATIC_MAP: Partial<Record<HandShape, SignId | ((f: Features, ctx: Context) => SignId)>> = {
  ILY: 'MAHAL_KITA',
  THUMB_UP: 'MAGALING',
  THUMB_DOWN: 'MALI',
  POINT_IN: 'AKO',
  POINT_OUT: 'IKAW',
  W: (f, ctx) => (atFace(f.imgY, ctx) ? 'TUBIG' : 'W'),
  O: (f, ctx) => (atFace(f.imgY, ctx) ? 'KAIN' : 'O'),
  A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', H: 'H', I: 'I', K: 'K', L: 'L',
  M: 'M', N: 'N', P: 'P', Q: 'Q', R: 'R', S: 'S', T: 'T', U: 'U', V: 'V', X: 'X', Y: 'Y',
}

// ---------------------------------------------------------------------------
// Two-handed signs
// ---------------------------------------------------------------------------

interface PairSample {
  t: number
  L: Sample
  R: Sample
}

export interface PairFeatures {
  n: number
  spanMs: number
  /** Inter-hand distance in palm lengths. */
  dStart: number
  dEnd: number
  dMin: number
  dMax: number
  /** Velocity correlation: +1 hands move the same way, -1 mirror-image (toward / away from each other). */
  corr: number
  L: Features
  R: Features
  /** Palm turned over (index/pinky knuckle order flipped) during the window. */
  flipL: number
  flipR: number
}

function computePair(buf: PairSample[], fL: Features | null, fR: Features | null): PairFeatures | null {
  const n = buf.length
  if (n < 5 || !fL || !fR) return null
  const palm = median(buf.flatMap((q) => [q.L.palm, q.R.palm]))
  const d = buf.map((q) => dist(q.L.c, q.R.c) / palm)
  let dot = 0
  let nl = 0
  let nr = 0
  for (let i = 1; i < n; i++) {
    const lx = buf[i].L.c.x - buf[i - 1].L.c.x
    const ly = buf[i].L.c.y - buf[i - 1].L.c.y
    const rx = buf[i].R.c.x - buf[i - 1].R.c.x
    const ry = buf[i].R.c.y - buf[i - 1].R.c.y
    dot += lx * rx + ly * ry
    nl += lx * lx + ly * ly
    nr += rx * rx + ry * ry
  }
  return {
    n,
    spanMs: buf[n - 1].t - buf[0].t,
    dStart: median(d.slice(0, 3)),
    dEnd: median(d.slice(-3)),
    dMin: Math.min(...d),
    dMax: Math.max(...d),
    corr: nl > 1e-12 && nr > 1e-12 ? dot / Math.sqrt(nl * nr) : 0,
    L: fL,
    R: fR,
    flipL: bandCrossings(buf.map((q) => q.L.side), -0.25, 0.25),
    flipR: bandCrossings(buf.map((q) => q.R.side), -0.25, 0.25),
  }
}

const both = (f: PairFeatures, fam: HandShape[], min: number) => f.L.share(fam) > min && f.R.share(fam) > min
const FISTS: HandShape[] = [...FISTISH, 'THUMB_UP']

type PairRule = { id: SignId; test: (f: PairFeatures) => number | null }

/** Two-handed rules, evaluated before the one-handed ones whenever both hands are in view. */
const PAIR_RULES: PairRule[] = [
  {
    // MEET (the core of "nice to meet you"): two index fingers come together.
    id: 'NICE_MEET',
    test: (f) =>
      both(f, INDEXISH, 0.5) && f.dStart - f.dEnd > 1.2 && f.dEnd < 1.8 && f.corr < -0.2
        ? clamp(0.7 + 0.12 * clamp((f.dStart - f.dEnd - 1.2) / 1.5), 0, 0.96)
        : null,
  },
  {
    // FAMILY: two F hands start together and circle outward.
    id: 'PAMILYA',
    test: (f) =>
      both(f, ['F'], 0.5) && f.dStart < 2.2 && f.dMax - f.dStart > 0.8 && f.corr < -0.2
        ? clamp(0.72 + 0.12 * clamp((f.dMax - f.dStart - 0.8) / 1.5), 0, 0.96)
        : null,
  },
  {
    // FINISH: two open hands turn over (palms in -> palms out).
    id: 'TAPOS',
    test: (f) => (both(f, OPENISH, 0.5) && f.flipL >= 1 && f.flipR >= 1 && f.dMin > 0.8 ? clamp(0.74 + 0.06 * Math.min(f.flipL, f.flipR), 0, 0.95) : null),
  },
  {
    // HELP (two-handed): thumbs-up fist resting on the other flat palm, both lift together.
    id: 'TULONG',
    test: (f) => {
      const lFist = f.L.share(FISTS) > 0.5 && f.R.share(OPENISH) > 0.5
      const rFist = f.R.share(FISTS) > 0.5 && f.L.share(OPENISH) > 0.5
      if (!lFist && !rFist) return null
      const fist = lFist ? f.L : f.R
      const open = lFist ? f.R : f.L
      return open.imgY > fist.imgY && f.dMax < 2.4 && fist.dy < -0.6 && open.dy < -0.4 && f.corr > 0.5
        ? clamp(0.72 + 0.12 * clamp(-fist.dy - 0.6), 0, 0.97)
        : null
    },
  },
  {
    // TOGETHER / WITH: two fists side by side move together.
    id: 'MAGKASAMA',
    test: (f) =>
      both(f, FISTS, 0.5) && f.dMax < 2.2 && f.corr > 0.6 && f.L.pathLen > 0.6 && f.R.pathLen > 0.6
        ? clamp(0.7 + 0.15 * clamp((f.corr - 0.6) / 0.4) + 0.05 * clamp(f.L.pathLen - 0.6), 0, 0.95)
        : null,
  },
  {
    // WHAT (two-handed): both open hands, palms up, apart, shaking side to side.
    id: 'ANO',
    test: (f) =>
      both(f, OPENISH, 0.6) && Math.abs(f.L.meanAxisUp) < 0.5 && Math.abs(f.R.meanAxisUp) < 0.5 && f.dMin > 1.5 && f.L.xCross + f.R.xCross >= 2
        ? clamp(0.7 + 0.05 * (f.L.xCross + f.R.xCross), 0, 0.95)
        : null,
  },
]
const PAIR_IDS = new Set(PAIR_RULES.map((r) => r.id))

type Track = { buf: Sample[]; lastT: number }
const freshTracks = (): Record<Handed, Track> => ({ L: { buf: [], lastT: -Infinity }, R: { buf: [], lastT: -Infinity } })

export class SignEngine {
  private tracks = freshTracks()
  private pair: PairSample[] = []
  private lastPairT = -Infinity
  private active: Handed | null = null
  private switchSince: number | null = null
  private lastHandT = -Infinity
  private cand: SignId | null = null
  private candStart = 0
  private candSeen = 0
  private candConf = 0
  /** Peak-hold tracking for the current candidate. */
  private highSince: number | null = null
  private highLast = 0
  private highFrames = 0
  private candTwo = false
  private latched: SignId | null = null
  private otherSince: number | null = null
  private nullSince: number | null = null
  private lastCommit: { id: SignId; t: number } | null = null
  private resetSinceCommit = true
  private lastDynamicT = -Infinity
  private minConf = 0.6
  private standard: Standard = 'BOTH'
  private timing: LockTiming = TIMING.standard

  setThreshold(v: number) {
    this.minConf = clamp(v, 0.3, 0.95)
  }
  setStandard(s: Standard) {
    this.standard = s
  }
  setSpeed(p: SpeedPreset) {
    this.timing = TIMING[p]
  }

  reset() {
    this.tracks = freshTracks()
    this.pair = []
    this.lastPairT = -Infinity
    this.active = null
    this.switchSince = null
    this.cand = null
    this.highSince = null
    this.highFrames = 0
    this.latched = null
    this.otherSince = null
    this.nullSince = null
    this.lastCommit = null
    this.resetSinceCommit = true
    this.lastDynamicT = -Infinity
    this.lastHandT = -Infinity
  }

  /**
   * Decide which of the signer's hands each detection is. Two hands: MediaPipe's labels when
   * they disagree, else image position (in an un-mirrored frame the signer's right hand is on
   * the image's left). One hand: its label, unless that would jump to a stale track while the
   * other track is fresh and right there (a flickering label on the same hand).
   */
  private identify(frame: InputFrame, geos: HandGeo[]): Handed[] {
    const labels = frame.handed
    if (geos.length >= 2) {
      if (labels?.[0] && labels[1] && labels[0] !== labels[1]) return [labels[0], labels[1]]
      return geos[0].centre.x <= geos[1].centre.x ? ['R', 'L'] : ['L', 'R']
    }
    const g = geos[0]
    const fresh = (h: Handed) => frame.t - this.tracks[h].lastT < MAX_FRAME_GAP_MS
    const near = (h: Handed) => {
      const b = this.tracks[h].buf
      const last = b[b.length - 1]
      return last ? dist(last.c, g.centre) < last.palm * 1.5 : false
    }
    let h: Handed = labels?.[0] ?? (fresh('L') && !fresh('R') ? 'L' : 'R')
    const o: Handed = h === 'L' ? 'R' : 'L'
    if (!fresh(h) && fresh(o) && near(o)) h = o
    return [h]
  }

  /** Hand activity: raised hands and moving hands are the ones signing. */
  private score(h: Handed, t: number) {
    const buf = this.tracks[h].buf
    const last = buf[buf.length - 1]
    if (!last) return -Infinity
    let path = 0
    let from = last.t
    for (let i = buf.length - 1; i > 0 && buf[i - 1].t >= t - RECENT_MS; i--) {
      path += dist(buf[i].c, buf[i - 1].c) / last.palm
      from = buf[i - 1].t
    }
    const speed = last.t > from ? path / ((last.t - from) / 1000) : 0
    return 1 - last.imgY + 0.12 * Math.min(speed, 6)
  }

  private pickActive(present: Handed[], t: number) {
    if (!present.length) return
    if (!this.active || !present.includes(this.active)) {
      this.active = present.reduce((a, b) => (this.score(b, t) > this.score(a, t) ? b : a))
      this.switchSince = null
      return
    }
    const other = present.find((h) => h !== this.active)
    if (other && this.score(other, t) > this.score(this.active, t) + 0.3) {
      this.switchSince ??= t
      if (t - this.switchSince > HAND_SWITCH_MS) {
        this.active = other
        this.switchSince = null
      }
    } else this.switchSince = null
  }

  private classify(f: Features, t: number, ctx: Context, pf: PairFeatures | null): Detection | null {
    if (pf) {
      for (const r of PAIR_RULES) {
        if (!activeIn(r.id, this.standard)) continue
        const c = r.test(pf)
        if (c != null) {
          this.lastDynamicT = t
          return { id: r.id, confidence: c }
        }
      }
      // Both hands moving near each other is a two-handed sign in progress: don't read one
      // hand's half of it as a one-handed sign.
      const other = this.active === 'L' ? pf.R : pf.L
      if (other.pathLen > 0.8 && pf.dMin < 3) return null
    }
    for (const r of DYNAMIC_RULES) {
      if (!activeIn(r.id, this.standard)) continue
      const c = r.test(f, ctx)
      if (c != null) {
        this.lastDynamicT = t
        return { id: r.id, confidence: c }
      }
    }
    // Static signs: velocity gate + shape stability + no dynamic sign in flight.
    if (f.recentSpeed > STILL_SPEED || f.recentMaxSpeed > STILL_MAX_SPEED || f.recentDepthRate > STILL_DEPTH_RATE) return null
    if (f.recentShare < 0.7 || f.stableMs < MIN_STABLE_MS) return null
    if (t - this.lastDynamicT < DYNAMIC_SUPPRESS_MS) return null
    const m = STATIC_MAP[f.recentShape]
    if (!m) return null
    const id = typeof m === 'function' ? m(f, ctx) : m
    if (!activeIn(id, this.standard)) return null
    const buf = this.tracks[this.active!].buf
    const tN = buf[buf.length - 1].t
    const recent = buf.filter((s) => s.t >= tN - RECENT_MS && s.shape === f.recentShape)
    const meanScore = recent.reduce((a, s) => a + s.score, 0) / Math.max(1, recent.length)
    const stillness = clamp(1 - f.recentSpeed / STILL_SPEED)
    return { id, confidence: clamp(meanScore * (0.85 + 0.15 * f.recentShare) * (0.92 + 0.08 * stillness), 0, 0.99) }
  }

  private cooled(id: SignId, t: number) {
    const last = this.lastCommit
    return !last || last.id !== id || this.resetSinceCommit || t - last.t >= REPEAT_COOLDOWN_MS
  }

  private commit(id: SignId, t: number, latch: boolean): Detection {
    this.lastCommit = { id, t }
    this.resetSinceCommit = false
    this.latched = latch ? id : null
    return { id, confidence: this.candConf }
  }

  /**
   * Peak-hold commit: the candidate is about to be dropped or replaced before its ring
   * closed. If it was recognized with high confidence for long enough, it was a real sign
   * signed at natural speed: commit it rather than throwing the progress away.
   */
  private peakCommit(t: number, next: SignId | null, moving: boolean): Detection | null {
    const c = this.cand
    if (!c || c === this.latched || this.highSince == null) return null
    // Already committed during this candidate's run (the latch may have been cleared since by a hand reset).
    if (this.lastCommit && this.lastCommit.id === c && this.lastCommit.t >= this.candStart) return null
    // An onset shape that turned into a moving sign (or whose whole hand just started moving) was
    // the start of that sign, not a sign of its own.
    if (ONSET_SHAPES.has(c) && (moving || (next && SIGNS[next].motion))) return null
    if (this.highLast - this.highSince < this.timing.peakMs || !this.cooled(c, t)) return null
    return this.commit(c, t, false)
  }

  process(frame: InputFrame): EngineOutput {
    const { t } = frame
    const aspect = frame.width / Math.max(1, frame.height)
    let shape: HandShape = 'UNKNOWN'
    let shapeScore = 0
    const hasHand = frame.hands.length > 0
    let palmHeight = 0
    let centre: V2 | null = null
    let handed: Handed[] = []

    if (hasHand) {
      const geos = frame.hands.slice(0, 2).map((h) => analyzeHand(h, aspect))
      handed = this.identify(frame, geos)
      const shapes = geos.map((g) => classifyShape(g))
      const samples: Partial<Record<Handed, Sample>> = {}
      geos.forEach((g, i) => {
        const h = handed[i]
        const tr = this.tracks[h]
        const last = tr.buf[tr.buf.length - 1]
        if (last && t - last.t > MAX_FRAME_GAP_MS) tr.buf = []
        const smp: Sample = {
          t,
          c: g.centre,
          imgY: g.centre.y,
          palm: g.palm,
          shape: shapes[i].shape,
          score: shapes[i].score,
          axisUp: g.axisUp,
          fold: g.fold,
          side: (g.img[5].x - g.img[17].x) / Math.max(1e-6, g.palm),
        }
        tr.buf.push(smp)
        tr.lastT = t
        samples[h] = smp
      })
      this.pickActive(handed, t)
      const ai = Math.max(0, handed.indexOf(this.active!))
      const g = geos[ai]
      shape = shapes[ai].shape
      shapeScore = shapes[ai].score
      palmHeight = g.palm
      centre = { x: g.centre.x / aspect, y: g.centre.y }
      if (samples.L && samples.R) {
        if (t - this.lastPairT > MAX_FRAME_GAP_MS) this.pair = []
        this.pair.push({ t, L: samples.L, R: samples.R })
        this.lastPairT = t
      }
      this.lastHandT = t
    } else if (t - this.lastHandT > HAND_RESET_MS) {
      // Hands dropped out of view -> neutral reset.
      this.tracks = freshTracks()
      this.pair = []
      this.active = null
      this.resetSinceCommit = true
      this.latched = null
      this.lastDynamicT = -Infinity
    }
    // Time-indexed windows: drop samples older than WINDOW_MS (and tracks that went stale).
    for (const h of ['L', 'R'] as const) {
      const tr = this.tracks[h]
      if (t - tr.lastT > MAX_FRAME_GAP_MS) tr.buf = []
      let cut = 0
      while (cut < tr.buf.length && tr.buf[cut].t < t - WINDOW_MS) cut++
      if (cut) tr.buf.splice(0, cut)
    }
    if (t - this.lastPairT > MAX_FRAME_GAP_MS) this.pair = []
    let pc = 0
    while (pc < this.pair.length && this.pair[pc].t < t - WINDOW_MS) pc++
    if (pc) this.pair.splice(0, pc)

    const activeBuf = this.active ? this.tracks[this.active].buf : []
    const features = hasHand && this.active ? computeFeatures(activeBuf) : null
    const pf = hasHand && this.pair.length >= 5 ? computePair(this.pair, computeFeatures(this.tracks.L.buf), computeFeatures(this.tracks.R.buf)) : null
    const det = features ? this.classify(features, t, { body: frame.body }, pf) : null
    const valid = det && det.confidence >= this.minConf ? det : null

    let committed: Detection | null = null
    const moving = !!features && (features.recentSpeed > STILL_SPEED || features.recentMaxSpeed > STILL_MAX_SPEED || features.recentDepthRate > STILL_DEPTH_RATE)

    // ---- Candidate tracking ----
    if (valid) {
      if (valid.id !== this.cand) {
        committed = this.peakCommit(t, valid.id, moving)
        this.cand = valid.id
        this.candStart = t
        this.candConf = valid.confidence
        this.highSince = null
        this.highFrames = 0
      }
      this.candTwo = pf != null && PAIR_IDS.has(valid.id) && this.lastDynamicT === t
      this.candSeen = t
      this.candConf = this.candConf * 0.6 + valid.confidence * 0.4
      if (valid.confidence >= this.timing.peakConf) {
        this.highSince ??= t
        this.highLast = t
      } else this.highSince = null
      this.highFrames = valid.confidence >= this.timing.fastConf ? this.highFrames + 1 : 0
    } else if (this.cand && t - this.candSeen > DROP_GRACE_MS) {
      committed = this.peakCommit(t, null, moving)
      this.cand = null
      this.candTwo = false
      this.highSince = null
      this.highFrames = 0
    }

    // ---- Neutral reset: no candidate for a while ----
    if (this.cand == null) {
      if (this.nullSince == null) this.nullSince = t
      if (t - this.nullSince > NEUTRAL_RESET_MS) {
        this.resetSinceCommit = true
        this.latched = null
      }
    } else {
      this.nullSince = null
    }

    // The latch only releases when a *different* sign is held briefly — short null flickers don't release it.
    if (this.latched && this.cand && this.cand !== this.latched) {
      if (this.otherSince == null) this.otherSince = t
      if (t - this.otherSince > SWITCH_RELEASE_MS) this.latched = null
    } else {
      this.otherSince = null
    }

    let progress = 0
    let cooling = false
    if (this.cand && !committed) {
      if (this.cand === this.latched) {
        progress = 1
      } else {
        const onset = ONSET_SHAPES.has(this.cand)
        const lockMs = SIGNS[this.cand].motion ? this.timing.dynamicMs : this.timing.staticMs + (onset ? ONSET_EXTRA_MS : 0)
        progress = clamp((t - this.candStart) / lockMs)
        const fast = !onset && this.timing.fastFrames > 0 && this.highFrames >= this.timing.fastFrames
        if (!this.cooled(this.cand, t)) {
          cooling = true
          progress = Math.min(progress, 0.99)
        } else if (progress >= 1 || fast) {
          progress = 1
          committed = this.commit(this.cand, t, true)
        }
      }
    }

    return {
      hasHand,
      shape,
      shapeScore,
      candidate: this.cand ? { id: this.cand, confidence: this.candConf } : null,
      progress,
      latched: this.cand != null && this.cand === this.latched,
      cooling,
      committed,
      samples: activeBuf.length,
      windowMs: activeBuf.length > 1 ? activeBuf[activeBuf.length - 1].t - activeBuf[0].t : 0,
      palmHeight,
      centre,
      handed,
      activeHand: this.active,
      twoHanded: this.cand != null && this.candTwo,
      handDistance: pf ? pf.dEnd : null,
    }
  }
}
