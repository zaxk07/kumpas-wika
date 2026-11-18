import { analyzeHand, classifyShape, dist, type V2 } from './handshape'
import { activeIn, SIGNS } from './signs'
import type { Detection, HandLandmarks, HandShape, InputFrame, SignId, Standard, UpperBody } from './types'

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
 *  4. A hold-to-lock stabilizer commits a candidate after LOCK_*_MS, then latches
 *     it. The same sign can only lock again after a hand reset (hand drops out
 *     of view / goes neutral) or a REPEAT_COOLDOWN_MS refractory period.
 */

export const WINDOW_MS = 1000
export const LOCK_DYNAMIC_MS = 450
export const LOCK_STATIC_MS = 600
export const REPEAT_COOLDOWN_MS = 1800
const RECENT_MS = 300
const DROP_GRACE_MS = 150
const SWITCH_RELEASE_MS = 200
const HAND_RESET_MS = 250
const NEUTRAL_RESET_MS = 700
const DYNAMIC_SUPPRESS_MS = 900
const MAX_FRAME_GAP_MS = 300
const STILL_SPEED = 0.9 // palm-lengths / s
const STILL_MAX_SPEED = 1.6
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
}

const OPENISH: HandShape[] = ['OPEN', 'B']
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

export class SignEngine {
  private buf: Sample[] = []
  private lastHandT = -Infinity
  private cand: SignId | null = null
  private candStart = 0
  private candSeen = 0
  private candConf = 0
  private latched: SignId | null = null
  private otherSince: number | null = null
  private nullSince: number | null = null
  private lastCommit: { id: SignId; t: number } | null = null
  private resetSinceCommit = true
  private lastDynamicT = -Infinity
  private minConf = 0.6
  private standard: Standard = 'BOTH'

  setThreshold(v: number) {
    this.minConf = clamp(v, 0.3, 0.95)
  }
  setStandard(s: Standard) {
    this.standard = s
  }

  reset() {
    this.buf = []
    this.cand = null
    this.latched = null
    this.otherSince = null
    this.nullSince = null
    this.lastCommit = null
    this.resetSinceCommit = true
    this.lastDynamicT = -Infinity
    this.lastHandT = -Infinity
  }

  private pickHand(hands: HandLandmarks[], aspect: number) {
    const prev = this.buf[this.buf.length - 1]
    let best = analyzeHand(hands[0], aspect)
    if (hands.length === 1) return best
    let bestScore = -Infinity
    for (const h of hands) {
      const g = analyzeHand(h, aspect)
      // Prefer continuity with the tracked hand, otherwise the biggest (closest) hand.
      const s = prev ? -dist(g.centre, prev.c) : g.palm
      if (s > bestScore) {
        bestScore = s
        best = g
      }
    }
    return best
  }

  private classify(f: Features, t: number, ctx: Context): Detection | null {
    for (const r of DYNAMIC_RULES) {
      if (!activeIn(r.id, this.standard)) continue
      const c = r.test(f, ctx)
      if (c != null) {
        this.lastDynamicT = t
        return { id: r.id, confidence: c }
      }
    }
    // Static signs: velocity gate + shape stability + no dynamic sign in flight.
    if (f.recentSpeed > STILL_SPEED || f.recentMaxSpeed > STILL_MAX_SPEED) return null
    if (f.recentShare < 0.7 || f.stableMs < MIN_STABLE_MS) return null
    if (t - this.lastDynamicT < DYNAMIC_SUPPRESS_MS) return null
    const m = STATIC_MAP[f.recentShape]
    if (!m) return null
    const id = typeof m === 'function' ? m(f, ctx) : m
    if (!activeIn(id, this.standard)) return null
    const tN = this.buf[this.buf.length - 1].t
    const recent = this.buf.filter((s) => s.t >= tN - RECENT_MS && s.shape === f.recentShape)
    const meanScore = recent.reduce((a, s) => a + s.score, 0) / Math.max(1, recent.length)
    const stillness = clamp(1 - f.recentSpeed / STILL_SPEED)
    return { id, confidence: clamp(meanScore * (0.85 + 0.15 * f.recentShare) * (0.92 + 0.08 * stillness), 0, 0.99) }
  }

  process(frame: InputFrame): EngineOutput {
    const { t } = frame
    const aspect = frame.width / Math.max(1, frame.height)
    let shape: HandShape = 'UNKNOWN'
    let shapeScore = 0
    const hasHand = frame.hands.length > 0
    let palmHeight = 0
    let centre: V2 | null = null

    if (hasHand) {
      const g = this.pickHand(frame.hands, aspect)
      const r = classifyShape(g)
      shape = r.shape
      shapeScore = r.score
      palmHeight = g.palm
      centre = { x: g.centre.x / aspect, y: g.centre.y }
      const last = this.buf[this.buf.length - 1]
      if (last && t - last.t > MAX_FRAME_GAP_MS) this.buf = []
      this.buf.push({ t, c: g.centre, imgY: g.centre.y, palm: g.palm, shape, score: r.score, axisUp: g.axisUp, fold: g.fold })
      this.lastHandT = t
    } else if (t - this.lastHandT > HAND_RESET_MS) {
      // Hand dropped out of view -> neutral reset.
      this.buf = []
      this.resetSinceCommit = true
      this.latched = null
      this.lastDynamicT = -Infinity
    }
    // Time-indexed window: drop samples older than WINDOW_MS.
    let cut = 0
    while (cut < this.buf.length && this.buf[cut].t < t - WINDOW_MS) cut++
    if (cut) this.buf.splice(0, cut)

    const features = hasHand ? computeFeatures(this.buf) : null
    const det = features ? this.classify(features, t, { body: frame.body }) : null
    const valid = det && det.confidence >= this.minConf ? det : null

    // ---- Candidate tracking ----
    if (valid) {
      if (valid.id !== this.cand) {
        this.cand = valid.id
        this.candStart = t
        this.candConf = valid.confidence
      }
      this.candSeen = t
      this.candConf = this.candConf * 0.6 + valid.confidence * 0.4
    } else if (this.cand && t - this.candSeen > DROP_GRACE_MS) {
      this.cand = null
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

    let committed: Detection | null = null
    let progress = 0
    let cooling = false
    if (this.cand) {
      if (this.cand === this.latched) {
        progress = 1
      } else {
        const last = this.lastCommit
        const cooled = !last || last.id !== this.cand || this.resetSinceCommit || t - last.t >= REPEAT_COOLDOWN_MS
        const lockMs = SIGNS[this.cand].motion ? LOCK_DYNAMIC_MS : LOCK_STATIC_MS
        progress = clamp((t - this.candStart) / lockMs)
        if (!cooled) {
          cooling = true
          progress = Math.min(progress, 0.99)
        } else if (progress >= 1) {
          committed = { id: this.cand, confidence: this.candConf }
          this.latched = this.cand
          this.lastCommit = { id: this.cand, t }
          this.resetSinceCommit = false
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
      samples: this.buf.length,
      windowMs: this.buf.length > 1 ? this.buf[this.buf.length - 1].t - this.buf[0].t : 0,
      palmHeight,
      centre,
    }
  }
}
