import type { EngineOutput } from './engine'
import { SIGNS } from './signs'
import type { HandShape, SignId } from './types'

/**
 * Practice coach. Compares the recognizer's live output with one target sign and turns
 * the difference into a single, actionable hint plus a 0-1 "how close" score.
 *
 * Shape families mirror the ones the recognizer's rules use (see engine.ts), so a hand
 * the coach calls "right shape" is one the rule for that sign would also accept.
 */

const OPENISH: HandShape[] = ['OPEN', 'B']
const FISTISH: HandShape[] = ['S', 'A', 'E', 'M', 'N', 'T']
const TWO_UP: HandShape[] = ['U', 'V', 'H', 'K', 'R']

interface Target {
  /** Handshapes that count as the right shape for this sign. */
  shapes: HandShape[]
  /** Plain description of the handshape. */
  shapeTip: string
  /** What the hand has to do once the shape is right (moving signs and placed signs). */
  moveTip?: string
}

const WORDS: Partial<Record<SignId, Target>> = {
  KUMUSTA: { shapes: OPENISH, shapeTip: 'an open hand, fingers up, palm facing out', moveTip: 'Add a gentle side-to-side wave' },
  HELLO_SALUTE: { shapes: OPENISH, shapeTip: 'a flat hand at your forehead', moveTip: 'Start at your forehead and sweep out to the side' },
  PAALAM: { shapes: OPENISH, shapeTip: 'an open hand, palm facing out', moveTip: 'Fold your fingers down and back up, a few times' },
  SALAMAT: { shapes: OPENISH, shapeTip: 'a flat hand with fingers together', moveTip: 'Start at your chin, then move forward and down' },
  WALANG_ANUMAN: { shapes: OPENISH, shapeTip: 'a flat open hand at chest height', moveTip: 'Sweep it sideways in one smooth move' },
  OO: { shapes: FISTISH, shapeTip: 'a closed fist', moveTip: 'Nod your fist up and down, like a head nodding' },
  HINDI: { shapes: ['INDEX'], shapeTip: 'just your index finger up', moveTip: 'Swipe it sideways in one quick move' },
  NO_SNAP: { shapes: [...TWO_UP, 'O'], shapeTip: 'index and middle fingers out over your thumb', moveTip: 'Snap the two fingers onto your thumb, twice' },
  PAKIUSAP: { shapes: OPENISH, shapeTip: 'a flat hand on your chest', moveTip: 'Rub it in a small circle' },
  PATAWAD: { shapes: FISTISH, shapeTip: 'a fist on your chest', moveTip: 'Rub it in a small circle' },
  TULONG: { shapes: ['THUMB_UP', ...FISTISH], shapeTip: 'a thumbs-up fist turned on its side', moveTip: 'Lift it straight up' },
  MAHAL_KITA: { shapes: ['ILY'], shapeTip: 'thumb, index and pinky out, middle and ring folded' },
  MAGALING: { shapes: ['THUMB_UP'], shapeTip: 'a thumbs-up' },
  MALI: { shapes: ['THUMB_DOWN'], shapeTip: 'a thumbs-down' },
  AKO: { shapes: ['POINT_IN'], shapeTip: 'your index finger pointing back at your chest' },
  IKAW: { shapes: ['POINT_OUT'], shapeTip: 'your index finger pointing at the camera' },
  GUSTO: { shapes: ['C'], shapeTip: 'a C-shaped hand facing the camera', moveTip: 'Pull it back toward your chest' },
  KAILANGAN: { shapes: ['X'], shapeTip: 'a hooked index finger', moveTip: 'Nod the hook down and up' },
  SAAN: { shapes: ['INDEX'], shapeTip: 'your index finger up', moveTip: 'Wag it side to side' },
  ANO: { shapes: OPENISH, shapeTip: 'an open hand turned sideways', moveTip: 'Shake it gently side to side' },
  TUBIG: { shapes: ['W'], shapeTip: 'three middle fingers up (W)', moveTip: 'Hold the W up at your chin' },
  KAIN: { shapes: ['O'], shapeTip: 'fingertips touching your thumb (O)', moveTip: 'Bring the O up to your mouth' },
  NICE_MEET: { shapes: ['INDEX', 'D', 'POINT_OUT'], shapeTip: 'both index fingers up, palms facing', moveTip: 'Bring the two hands together until the fingers meet' },
  PAMILYA: { shapes: ['F'], shapeTip: 'an F with both hands: index and thumb touching', moveTip: 'Start side by side, then circle both hands outward' },
  MAGKASAMA: { shapes: [...FISTISH, 'THUMB_UP'], shapeTip: 'two fists side by side, thumbs up', moveTip: 'Move both fists together in a small circle' },
  TAPOS: { shapes: OPENISH, shapeTip: 'both open hands, palms toward you', moveTip: 'Flick both hands over so the palms face out' },
}

function targetFor(id: SignId): Target {
  const w = WORDS[id]
  if (w) return w
  if (id === 'J') return { shapes: ['I'], shapeTip: 'the letter I: only your pinky up', moveTip: 'Draw a J: drop down, then curve to the side' }
  if (id === 'Z') return { shapes: ['INDEX'], shapeTip: 'your index finger up', moveTip: 'Draw a Z in the air' }
  const t: Target = { shapes: [id as HandShape], shapeTip: `the letter ${id}` }
  if (id === 'W' || id === 'O') t.moveTip = 'Keep it at chest height, not at your chin'
  return t
}

const SHAPE_NAMES: Partial<Record<HandShape, string>> = {
  OPEN: 'an open hand',
  B: 'a flat hand',
  ILY: 'the I-love-you hand',
  INDEX: 'one finger up',
  POINT_OUT: 'pointing at the camera',
  POINT_IN: 'pointing at yourself',
  THUMB_UP: 'a thumbs-up',
  THUMB_DOWN: 'a thumbs-down',
  S: 'a fist',
}
const shapeName = (s: HandShape) => SHAPE_NAMES[s] ?? (s === 'UNKNOWN' ? 'an unclear shape' : `the letter ${s}`)

/** What another sign reads as, disambiguated when two signs share a meaning (wave vs salute). */
function readsAs(id: SignId) {
  const s = SIGNS[id]
  if (s.kind === 'letter') return `the letter ${id}`
  return s.variant ? `${s.fil} (${s.variant})` : `${s.fil} (${s.en})`
}

export type CoachState = 'nohand' | 'shape' | 'move' | 'hold' | 'locking' | 'cooling' | 'matched'

export interface CoachFeedback {
  state: CoachState
  /** One short, actionable instruction. */
  text: string
  /** 0-1 closeness, for the feedback meter. */
  score: number
}

export function assess(target: SignId, out: EngineOutput | null): CoachFeedback {
  const tgt = targetFor(target)
  const moving = SIGNS[target].motion
  if (!out || !out.hasHand) return { state: 'nohand', text: 'Raise your hand into the guide zone, at chest height', score: 0 }

  const cand = out.candidate
  if (SIGNS[target].twoHanded && out.handed.length < 2 && cand?.id !== target)
    return { state: 'shape', text: 'This sign uses both hands. Bring your other hand into the zone too', score: 0.1 }
  if (cand?.id === target) {
    if (out.latched) return { state: 'matched', text: 'Matched', score: 1 }
    if (out.cooling) return { state: 'cooling', text: 'Already counted. Lower your hand, then sign it again', score: 0.9 }
    return {
      state: 'locking',
      text: moving ? 'That’s it. Keep the movement going' : 'Hold steady to lock',
      score: 0.6 + 0.4 * out.progress,
    }
  }

  const shapeOk = tgt.shapes.includes(out.shape)
  if (!shapeOk) {
    const other = cand ? `That reads as ${readsAs(cand.id)}. ` : ''
    return {
      state: 'shape',
      text: `${other}Make ${tgt.shapeTip}${out.shape !== 'UNKNOWN' && !cand ? ` (now: ${shapeName(out.shape)})` : ''}`,
      score: 0.12 + 0.18 * out.shapeScore,
    }
  }
  // Right shape, but the movement (or placement) produced a different sign.
  if (cand) return { state: 'move', text: `Right shape, but that reads as ${readsAs(cand.id)}. ${tgt.moveTip ?? 'Hold it still'}`, score: 0.4 }
  if (tgt.moveTip) return { state: 'move', text: `Good shape. ${tgt.moveTip}`, score: 0.5 }
  return { state: 'hold', text: 'Good shape. Hold still for a moment', score: 0.5 }
}

/** The five-sign starter circuit. */
export const BEGINNER_CIRCUIT: SignId[] = ['KUMUSTA', 'SALAMAT', 'OO', 'HINDI', 'MAHAL_KITA']
