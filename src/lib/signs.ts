import type { Letter, SignId, Standard, SubtitleMode, WordSignId } from './types'

export type SignKind = 'dynamic' | 'static' | 'letter'

export interface SignInfo {
  id: SignId
  /** Filipino meaning (subtitle word). */
  fil: string
  /** English meaning. */
  en: string
  /** Gloss labels shown on pills per standard. */
  glossFSL: string
  glossASL: string
  kind: SignKind
  /** Letters J and Z, and all word signs that need movement. */
  motion: boolean
  /** Which standards use this variant. */
  standards: Exclude<Standard, 'BOTH'>[]
  /** How to sign it, in plain English: shape, where, then the movement. */
  steps: string[]
  /** The same cue in everyday Filipino. */
  cue?: string
  /** Optional difference between FSL and ASL usage. */
  note?: string
  /** Short label distinguishing two forms with the same meaning (e.g. wave vs salute). */
  variant?: string
}

const BOTH: SignInfo['standards'] = ['FSL', 'ASL']

const WORDS: Record<WordSignId, Omit<SignInfo, 'id'>> = {
  KUMUSTA: {
    fil: 'Kumusta', en: 'Hello', glossFSL: 'KUMUSTA', glossASL: 'HELLO (wave)', kind: 'dynamic', motion: true, standards: BOTH, variant: 'wave',
    steps: ['Hold an open palm near your shoulder, fingers relaxed and apart.', 'Give a relaxed side-to-side wave, two or three times.'],
    cue: 'Itaas ang bukas na palad malapit sa balikat at kumaway nang marahan pakaliwa’t pakanan.',
  },
  HELLO_SALUTE: {
    fil: 'Kumusta', en: 'Hello', glossFSL: 'KUMUSTA (saludo)', glossASL: 'HELLO', kind: 'dynamic', motion: true, standards: ['ASL'], variant: 'salute',
    steps: ['Keep your fingers flat and together.', 'Start with your fingertips at your forehead, then move the hand out to the side, like a small salute.'],
    cue: 'Ilapat ang dulo ng mga daliri sa noo, saka ilayo ang kamay patagilid na parang sumasaludo.',
    note: 'This is how ASL usually signs HELLO. In FSL, a friendly wave (Kumusta) is more common.',
  },
  PAALAM: {
    fil: 'Paalam', en: 'Goodbye', glossFSL: 'PAALAM', glossASL: 'GOODBYE', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Face your open palm toward the person you’re saying goodbye to.', 'Keep your wrist still and fold your fingers down and back up twice, like a little “bye-bye”.'],
    cue: 'Nakaharap ang palad sa kausap; itiklop at ibuka ang mga daliri nang dalawang beses.',
  },
  SALAMAT: {
    fil: 'Salamat', en: 'Thank you', glossFSL: 'SALAMAT', glossASL: 'THANK-YOU', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Touch the fingertips of a flat hand to your chin or lips.', 'Bring the hand forward and down toward the person, palm opening up as it goes.'],
    cue: 'Mula sa baba o labi, ilayo ang nakalapat na kamay pasulong at pababa.',
  },
  WALANG_ANUMAN: {
    fil: 'Walang anuman', en: "You're welcome", glossFSL: 'WALANG-ANUMAN', glossASL: 'YOUR-WELCOME', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Hold an open hand in front of your chest, palm up.', 'Sweep it across your body in one easy, unhurried motion.'],
    cue: 'Nakabukas ang palad sa tapat ng dibdib; iwasiwas ito patagilid nang isang beses.',
  },
  OO: {
    fil: 'Oo', en: 'Yes', glossFSL: 'OO', glossASL: 'YES', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Make a loose fist with your thumb across the front of your fingers.', 'Bob it up and down twice, the way your head nods “yes”.'],
    cue: 'Ikuyom ang kamay at itango ito pataas-pababa, parang ulong tumatango.',
  },
  HINDI: {
    fil: 'Hindi', en: 'No', glossFSL: 'HINDI', glossASL: 'NO (wag)', kind: 'dynamic', motion: true, standards: ['FSL'], variant: 'sweep',
    steps: ['Point your index finger up and tuck the other fingers in.', 'Swipe it quickly to the side, once.'],
    cue: 'Ituro pataas ang hintuturo at iwasiwas nang mabilis patagilid nang isang beses.',
    note: 'This is the FSL form. If you’ve switched to ASL, use the snap instead.',
  },
  NO_SNAP: {
    fil: 'Hindi', en: 'No', glossFSL: 'HINDI (ASL)', glossASL: 'NO', kind: 'dynamic', motion: true, standards: ['ASL'], variant: 'snap',
    steps: ['Hold your index and middle fingers out together, with your thumb ready underneath.', 'Snap the two fingers down onto your thumb, open, and snap once more.'],
    cue: 'Pagdikitin ang hintuturo at hinlalato sa hinlalaki nang dalawang beses, parang tumutuka.',
    note: 'This is how ASL usually signs NO.',
  },
  PAKIUSAP: {
    fil: 'Pakiusap', en: 'Please', glossFSL: 'PAKIUSAP', glossASL: 'PLEASE', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Rest your open palm flat on your chest.', 'Rub a slow circle on your chest.'],
    cue: 'Ilapat ang bukas na palad sa dibdib at paikutin nang marahan.',
  },
  PATAWAD: {
    fil: 'Patawad', en: "I'm sorry", glossFSL: 'PATAWAD / PASENSYA', glossASL: 'SORRY', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Make a fist and rest it on your chest.', 'Rub a slow circle over your heart.'],
    cue: 'Ikuyom ang kamay at paikutin sa tapat ng dibdib.',
  },
  TULONG: {
    fil: 'Tulong', en: 'Help', glossFSL: 'TULONG', glossASL: 'HELP', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Give a thumbs-up with your fist turned on its side.', 'Lift it straight up, as if your other hand were raising it.'],
    cue: 'Naka-thumbs up na nakatagilid ang kamao; iangat ito nang diretso.',
  },
  MAHAL_KITA: {
    fil: 'Mahal kita', en: 'I love you', glossFSL: 'MAHAL-KITA', glossASL: 'I-LOVE-YOU', kind: 'static', motion: false, standards: BOTH,
    steps: ['Stretch out your thumb, index finger and pinky.', 'Fold down your middle and ring fingers, palm facing out, and hold it.'],
    cue: 'Iunat ang hinlalaki, hintuturo at hinliliit; itiklop ang dalawang gitnang daliri.',
  },
  MAGALING: {
    fil: 'Magaling', en: 'Good / Correct', glossFSL: 'MAGALING / TAMA', glossASL: 'GOOD (thumbs-up)', kind: 'static', motion: false, standards: BOTH,
    steps: ['Turn your fist on its side and point your thumb straight up.', 'Hold it for a moment.'],
    cue: 'Naka-thumbs up at nakatagilid ang kamao; hawakan nang ilang saglit.',
  },
  MALI: {
    fil: 'Mali', en: 'Wrong', glossFSL: 'MALI', glossASL: 'WRONG (thumbs-down)', kind: 'static', motion: false, standards: BOTH,
    steps: ['Turn your fist on its side and point your thumb straight down.', 'Hold it for a moment.'],
    cue: 'Naka-thumbs down at nakatagilid ang kamao; hawakan nang ilang saglit.',
  },
  AKO: {
    fil: 'Ako', en: 'I / Me', glossFSL: 'AKO', glossASL: 'ME', kind: 'static', motion: false, standards: BOTH,
    steps: ['Point your index finger at the middle of your own chest.', 'Keep it there for a moment.'],
    cue: 'Ituro ang sariling dibdib gamit ang hintuturo.',
  },
  IKAW: {
    fil: 'Ikaw', en: 'You', glossFSL: 'IKAW', glossASL: 'YOU', kind: 'static', motion: false, standards: BOTH,
    steps: ['Point your index finger straight at the person you’re talking to (here, the camera).', 'Keep it there for a moment.'],
    cue: 'Ituro ang kausap gamit ang hintuturo; dito, ang camera.',
  },
  GUSTO: {
    fil: 'Gusto', en: 'Want / Like', glossFSL: 'GUSTO', glossASL: 'WANT', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Curve your fingers like you’re about to grab something, reaching out a little.', 'Draw the hand back toward your body.'],
    cue: 'Bahagyang ibaluktot ang mga daliri na parang may kukunin, saka hilahin palapit sa katawan.',
  },
  KAILANGAN: {
    fil: 'Kailangan', en: 'Need', glossFSL: 'KAILANGAN', glossASL: 'NEED', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Crook your index finger into a hook and fold the others in.', 'Dip your wrist down firmly, twice.'],
    cue: 'Ibaluktot ang hintuturo na parang kawit at ibaba-taas ang pulso nang dalawang beses.',
  },
  SAAN: {
    fil: 'Saan', en: 'Where', glossFSL: 'SAAN', glossASL: 'WHERE', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Point your index finger up, palm facing out.', 'Wag it side to side a few times, like you’re looking around.'],
    cue: 'Ituro pataas ang hintuturo at iwagayway pakaliwa’t pakanan.',
  },
  ANO: {
    fil: 'Ano', en: 'What', glossFSL: 'ANO', glossASL: 'WHAT', kind: 'dynamic', motion: true, standards: BOTH,
    steps: ['Hold an open hand turned on its side, fingers pointing across.', 'Give it a small, questioning shake.'],
    cue: 'Nakatagilid ang bukas na palad; iling-ilingin nang bahagya na parang nagtatanong.',
  },
  TUBIG: {
    fil: 'Tubig', en: 'Water', glossFSL: 'TUBIG', glossASL: 'WATER', kind: 'static', motion: false, standards: BOTH,
    steps: ['Make a W: index, middle and ring fingers up and apart.', 'Bring it up to your chin and hold it there.'],
    cue: 'Gawin ang W (tatlong daliri) at ilapit sa baba.',
    note: 'Where you hold it matters: the same W at chest height is read as the letter W.',
  },
  KAIN: {
    fil: 'Kain', en: 'Eat / Food', glossFSL: 'KAIN / PAGKAIN', glossASL: 'EAT / FOOD', kind: 'static', motion: false, standards: BOTH,
    steps: ['Bunch your fingertips together against your thumb.', 'Bring them to your mouth and hold them there.'],
    cue: 'Pagdikitin ang mga dulo ng daliri at hinlalaki, saka ilapit sa bibig.',
    note: 'Where you hold it matters: the same shape at chest height is read as the letter O.',
  },
}

const LETTER_STEPS: Record<Letter, string[]> = {
  A: ['Make a fist and rest your thumb straight up along the side of your index finger.'],
  B: ['Hold four fingers straight up and together.', 'Fold your thumb across your palm.'],
  C: ['Curve your fingers and thumb into a “C”, leaving a gap between them.'],
  D: ['Point your index finger up.', 'Curve the other fingers down to touch the tip of your thumb.'],
  E: ['Bend all four fingers down so the tips rest on your thumb.', 'Keep your thumb tucked low across your palm.'],
  F: ['Touch your index fingertip to your thumb to make a small circle.', 'Let the other three fingers stand up and apart.'],
  G: ['Turn your hand on its side.', 'Point your index finger and thumb sideways, parallel to each other.'],
  H: ['Turn your hand on its side.', 'Point your index and middle fingers sideways, side by side.'],
  I: ['Raise just your pinky.', 'Curl the rest, with your thumb across the front.'],
  J: ['Start with your pinky up, like an I.', 'Draw a “J” in the air: down, then hook back toward your thumb.'],
  K: ['Raise your index and middle fingers in a V.', 'Touch your thumb tip to the base of your middle finger, between the two.'],
  L: ['Point your index finger up and your thumb out to the side, making an “L”.'],
  M: ['Make a fist with your thumb tucked under your first three fingers.'],
  N: ['Make a fist with your thumb tucked under your first two fingers.'],
  O: ['Curve all your fingertips down to meet your thumb, making an “O”.'],
  P: ['Make a K, then tip your hand so the fingers point down.'],
  Q: ['Make a G, then tip your hand so the index finger and thumb point down.'],
  R: ['Cross your middle finger over your index finger, both pointing up.'],
  S: ['Make a fist with your thumb wrapped across the front of your fingers.'],
  T: ['Make a fist with your thumb tucked between your index and middle fingers.'],
  U: ['Raise your index and middle fingers, pressed together.'],
  V: ['Raise your index and middle fingers, spread apart in a V.'],
  W: ['Raise your index, middle and ring fingers, spread apart.', 'Hold your pinky down with your thumb.'],
  X: ['Raise your index finger and bend it into a little hook.', 'Curl the other fingers in.'],
  Y: ['Stretch out your thumb and pinky.', 'Curl the three middle fingers in.'],
  Z: ['Point with your index finger.', 'Draw a “Z” in the air: across, diagonally down, then across again.'],
}

export const LETTERS: Letter[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as Letter[]

export const SIGNS: Record<SignId, SignInfo> = {
  ...(Object.fromEntries(Object.entries(WORDS).map(([id, s]) => [id, { id, ...s }])) as Record<WordSignId, SignInfo>),
  ...(Object.fromEntries(
    LETTERS.map((l) => [
      l,
      {
        id: l,
        fil: l,
        en: l,
        glossFSL: l,
        glossASL: l,
        kind: 'letter',
        motion: l === 'J' || l === 'Z',
        standards: BOTH,
        steps: LETTER_STEPS[l],
      } satisfies SignInfo,
    ]),
  ) as Record<Letter, SignInfo>),
}

export const WORD_ORDER: WordSignId[] = [
  'KUMUSTA', 'HELLO_SALUTE', 'PAALAM', 'SALAMAT', 'WALANG_ANUMAN', 'OO', 'HINDI', 'NO_SNAP', 'PAKIUSAP', 'PATAWAD',
  'TULONG', 'MAHAL_KITA', 'MAGALING', 'MALI', 'AKO', 'IKAW', 'GUSTO', 'KAILANGAN', 'SAAN', 'ANO', 'TUBIG', 'KAIN',
]

export const isLetter = (id: SignId): id is Letter => id.length === 1

export function activeIn(id: SignId, standard: Standard) {
  return standard === 'BOTH' || SIGNS[id].standards.includes(standard)
}

/** Label used on the raw gloss pills. */
export function glossLabel(id: SignId, standard: Standard) {
  const s = SIGNS[id]
  if (standard === 'ASL') return s.glossASL
  return s.glossFSL
}

/** Short subtitle text for a single sign (used for the live partial line). */
export function signText(id: SignId, mode: SubtitleMode): string {
  const s = SIGNS[id]
  if (s.kind === 'letter') return `${s.fil}`
  if (mode === 'FIL') return s.fil
  if (mode === 'EN') return s.en
  return `${s.fil.toUpperCase()} (${s.en})`
}
