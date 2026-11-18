import { memo, useId } from 'react'
import { buildHand, DEMO_H, DEMO_W, PERFORM, POSES, type DemoShape } from '../lib/demo'
import type { SignId } from '../lib/types'

/**
 * Minimal line-art hand diagram for a sign.
 *
 * The skeleton comes from the same joint-angle hand model the Demo Mode signer and
 * the classifier tests use, so each diagram shows the handshape the recognizer
 * actually expects. Extended fingers are drawn in emerald, curved/hooked fingers and
 * a shape-defining thumb in amber, everything else in muted slate. An overlay shows
 * the movement (wave, nod, circle, sweep, lift…) or where the hand goes (chin).
 */

type Motion =
  | 'wave' | 'salute' | 'fold' | 'forward-down' | 'sweep' | 'nod' | 'snap' | 'circle' | 'lift'
  | 'pull' | 'wag' | 'shake' | 'j' | 'z' | 'chin' | 'at-viewer' | 'at-self'

const MOTION: Partial<Record<SignId, Motion>> = {
  KUMUSTA: 'wave', HELLO_SALUTE: 'salute', PAALAM: 'fold', SALAMAT: 'forward-down', WALANG_ANUMAN: 'sweep',
  OO: 'nod', HINDI: 'sweep', NO_SNAP: 'snap', PAKIUSAP: 'circle', PATAWAD: 'circle', TULONG: 'lift',
  GUSTO: 'pull', KAILANGAN: 'nod', SAAN: 'wag', ANO: 'shake', TUBIG: 'chin', KAIN: 'chin',
  IKAW: 'at-viewer', AKO: 'at-self', J: 'j', Z: 'z',
}

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
const FINGER_OF = (i: number) => (i <= 4 ? 0 : Math.floor((i - 5) / 4) + 1) // 0 thumb, 1 index … 4 pinky
const PALM = [0, 1, 5, 9, 13, 17]

const VIEW = 48
const PAD = 8

type Tone = 'base' | 'on' | 'accent'
interface Geometry {
  pts: [number, number][]
  tone: Tone[] // per finger 0..4
  box: { l: number; t: number; r: number; b: number; cx: number; cy: number }
  motion?: Motion
}

const cache = new Map<SignId, Geometry>()

function fingerTone(shape: DemoShape): Tone[] {
  const def = POSES[shape]
  const tones: Tone[] = def.f.map((f) => {
    const [m, p, d] = f.a
    if (p + d < 30) return 'on' // straight beyond the knuckle (incl. pointing at/away from camera)
    if (p + d <= 170 && m < 60) return 'accent' // curved or hooked: C, O, E, X
    return 'base'
  })
  const anyOn = tones.includes('on')
  const thumbDefines = !Array.isArray(def.thumb) || def.thumb[0] < -0.5 || !anyOn
  return [thumbDefines ? 'accent' : 'base', ...tones]
}

function geometry(id: SignId): Geometry {
  const hit = cache.get(id)
  if (hit) return hit
  const perf = PERFORM[id]
  const rot = id === 'ANO' ? 80 : 0
  const lm = buildHand(perf.shape, { wx: 0.5, wy: 0.5, palm: 0.2, rot }, 0)
  // Mirror to match the on-screen selfie view; aspect-correct x.
  const raw = lm.map((p) => [(1 - p.x) * (DEMO_W / DEMO_H), p.y] as [number, number])
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const k = (VIEW - PAD * 2) / span
  const ox = (VIEW - (maxX - minX) * k) / 2
  const oy = (VIEW - (maxY - minY) * k) / 2
  const pts = raw.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k] as [number, number])
  const l = ox
  const t = oy
  const r = ox + (maxX - minX) * k
  const b = oy + (maxY - minY) * k
  const g: Geometry = { pts, tone: fingerTone(perf.shape), box: { l, t, r, b, cx: (l + r) / 2, cy: (t + b) / 2 }, motion: MOTION[id] }
  cache.set(id, g)
  return g
}

const COLORS = {
  base: '#71717a', // zinc-500
  on: '#34d399', // emerald-400
  accent: '#fbbf24', // amber-400
  motion: '#a1a1aa', // zinc-400
}

function MotionOverlay({ g, markerId }: { g: Geometry; markerId: string }) {
  const { l, t, r, b, cx, cy } = g.box
  const p = g.pts
  const end = `url(#${markerId})`
  const common = { fill: 'none', stroke: COLORS.motion, strokeWidth: 1.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const top = Math.max(2.5, t - 3.5)
  switch (g.motion) {
    case 'wave':
      return <path d={`M ${cx - 9} ${top + 1.5} Q ${cx} ${top - 3} ${cx + 9} ${top + 1.5}`} {...common} markerStart={end} markerEnd={end} />
    case 'wag':
      return <path d={`M ${p[8][0] - 6} ${top} Q ${p[8][0]} ${top - 3} ${p[8][0] + 6} ${top}`} {...common} markerStart={end} markerEnd={end} />
    case 'shake':
      return <path d={`M ${cx - 7} ${Math.min(VIEW - 2.5, b + 4)} L ${cx + 7} ${Math.min(VIEW - 2.5, b + 4)}`} {...common} markerStart={end} markerEnd={end} />
    case 'salute':
      return <path d={`M ${cx - 2} ${top} Q ${r + 2} ${top - 1} ${Math.min(VIEW - 2, r + 4)} ${t + 6}`} {...common} markerEnd={end} />
    case 'fold':
      return <path d={`M ${cx - 7} ${top + 1} Q ${cx} ${top - 3} ${cx + 6} ${top + 4}`} {...common} markerEnd={end} />
    case 'forward-down':
      return <path d={`M ${Math.max(2.5, l - 3)} ${t + 2} Q ${Math.max(2.5, l - 4)} ${cy + 6} ${l + 4} ${Math.min(VIEW - 2.5, b + 3)}`} {...common} markerEnd={end} />
    case 'sweep': {
      const y = Math.min(VIEW - 2.5, b + 4)
      return <path d={`M ${l} ${y} L ${r} ${y}`} {...common} markerEnd={end} />
    }
    case 'nod': {
      const x = Math.min(VIEW - 3, r + 4)
      return <path d={`M ${x} ${cy - 7} L ${x} ${cy + 7}`} {...common} markerStart={end} markerEnd={end} />
    }
    case 'lift': {
      const x = Math.min(VIEW - 3, r + 4)
      return <path d={`M ${x} ${b} L ${x} ${t}`} {...common} markerEnd={end} />
    }
    case 'circle': {
      const x = Math.min(VIEW - 7, r + 2)
      return <path d={`M ${x + 4} ${cy} A 4.5 4.5 0 1 1 ${x} ${cy - 4.5}`} {...common} markerEnd={end} />
    }
    case 'snap':
      return <path d={`M ${p[8][0] + 1} ${p[8][1] - 3} Q ${p[8][0] + 6} ${p[8][1] + 1} ${p[4][0] + 3} ${p[4][1] + 1}`} {...common} markerEnd={end} />
    case 'pull': {
      // Drawn beside the hand: reach out, then draw back toward the body (dashed line).
      const x = Math.min(VIEW - 3.5, r + 4)
      const bodyY = Math.min(VIEW - 1.5, b + 3)
      return (
        <g>
          <path d={`M ${x} ${t + 2} L ${x} ${bodyY - 2.5}`} {...common} markerEnd={end} />
          <path d={`M ${x - 4} ${bodyY} L ${x + 3} ${bodyY}`} {...common} strokeDasharray="1.5 2" />
        </g>
      )
    }
    case 'j': {
      // Trace beside the pinky: straight down, then hook toward the thumb side (right in this mirrored view).
      const [x, y] = p[20]
      const sx = Math.max(2.5, x - 3.5)
      return <path d={`M ${sx} ${y + 1} L ${sx} ${y + 10} Q ${sx} ${y + 14} ${sx + 5} ${y + 13.5}`} {...common} markerEnd={end} />
    }
    case 'z': {
      const [x, y] = p[8]
      const s = 5
      return <path d={`M ${x - s} ${y - 6} L ${x + s} ${y - 6} L ${x - s} ${y - 6 + s * 1.3} L ${x + s} ${y - 6 + s * 1.3}`} {...common} markerEnd={end} />
    }
    case 'chin':
      return <path d={`M ${cx - 8} ${top + 1} Q ${cx} ${top + 5} ${cx + 8} ${top + 1}`} {...common} strokeDasharray="1.5 2" />
    case 'at-viewer': {
      const [x, y] = p[8]
      return (
        <g {...common}>
          <circle cx={x} cy={y} r={3.2} />
          <circle cx={x} cy={y} r={0.9} fill={COLORS.motion} stroke="none" />
        </g>
      )
    }
    case 'at-self': {
      const [x, y] = p[8]
      return (
        <g {...common}>
          <circle cx={x} cy={y} r={3.2} />
          <path d={`M ${x - 2.2} ${y - 2.2} L ${x + 2.2} ${y + 2.2} M ${x + 2.2} ${y - 2.2} L ${x - 2.2} ${y + 2.2}`} />
        </g>
      )
    }
    default:
      return null
  }
}

interface Props {
  id: SignId
  size?: number
  /** Brighten the drawing (e.g. while this sign is being detected). */
  active?: boolean
  className?: string
  title?: string
}

export const SignDiagram = memo(function SignDiagram({ id, size = 44, active = false, className = '', title }: Props) {
  const g = geometry(id)
  const markerId = `arrow-${useId().replace(/:/g, '')}`
  const tone = (finger: number) => COLORS[g.tone[finger]]
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <marker id={markerId} viewBox="0 0 6 6" refX="4.5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0.5 0.5 L 5 3 L 0.5 5.5" fill="none" stroke={COLORS.motion} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      <g opacity={active ? 1 : 0.92}>
        <polygon points={PALM.map((i) => g.pts[i].join(',')).join(' ')} fill={active ? 'rgb(52 211 153 / 0.1)' : 'rgb(161 161 170 / 0.06)'} />
        {BONES.map(([a, b2]) => {
          const finger = FINGER_OF(b2)
          const palmEdge = a === 0 && b2 !== 1 ? true : a === 5 && b2 === 9 ? true : a === 9 && b2 === 13 ? true : a === 13 && b2 === 17
          return (
            <line
              key={`${a}-${b2}`}
              x1={g.pts[a][0]}
              y1={g.pts[a][1]}
              x2={g.pts[b2][0]}
              y2={g.pts[b2][1]}
              stroke={palmEdge ? COLORS.base : tone(finger)}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )
        })}
        {g.pts.map(([x, y], i) => {
          const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20
          const t = g.tone[FINGER_OF(i)]
          return <circle key={i} cx={x} cy={y} r={tip ? 1.25 : 0.8} fill={tip && t !== 'base' ? COLORS[t] : '#a1a1aa'} />
        })}
      </g>
      <MotionOverlay g={g} markerId={markerId} />
    </svg>
  )
})
