/**
 * Offline verification (`npm run verify`):
 *  1. Every synthetic handshape is classified correctly (left/right hand, tilt, size).
 *  2. Every supported sign, performed once by the simulator, is committed exactly
 *     once and in order — at webcam frame rates from 10 to 60 fps.
 *  3. The Demo Mode showcase phrases commit exactly the scripted glosses.
 *  4. Anti-spam: a long static hold (with tracking dropouts) locks once; a repeat
 *     after a hand reset locks again; the velocity gate blocks stray static letters.
 *  5. Gloss -> natural sentence grammar.
 *  6. Fluent preset, peak-hold commit, two-handed signs and switching hands.
 */
import { buildHand, COVERAGE_SCRIPT, DEMO_SCRIPT, demoFrame, POSES, scriptLength, SHOWCASE, type DemoShape, type Segment } from '../src/lib/demo'
import { FINALIZE_MS } from '../src/hooks/useSubtitles'
import { SignEngine, type SpeedPreset } from '../src/lib/engine'
import { glossToSentence, groupGlosses } from '../src/lib/grammar'
import { analyzeHand, classifyShape } from '../src/lib/handshape'
import type { InputFrame, SignId } from '../src/lib/types'

let failures = 0
const verbose = process.argv.includes('-v')
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`)
  if (!ok) failures++
}

// ---- 1. Handshapes --------------------------------------------------------
const alias: Partial<Record<DemoShape, string[]>> = { BENT: ['OPEN'], TWO_OUT: ['U', 'V'], PINCH2: ['O'] }
const shapeErrors: string[] = []
for (const shape of Object.keys(POSES) as DemoShape[]) {
  const want = alias[shape] ?? [shape]
  for (const mirror of [false, true])
    for (const rot of [-12, 0, 12])
      for (const palm of [0.12, 0.2]) {
        const r = classifyShape(analyzeHand(buildHand(shape, { wx: 0.55, wy: 0.6, palm, rot, mirror }, rot + palm), 16 / 9))
        if (!want.includes(r.shape)) shapeErrors.push(`${shape}(${mirror ? 'L' : 'R'} ${rot}° ${palm})->${r.shape}`)
      }
}
check(`handshapes: ${Object.keys(POSES).length} poses × 12 variants`, shapeErrors.length === 0, shapeErrors.slice(0, 12).join(', '))

// ---- 2/3. Scripted performances ------------------------------------------
function run(script: Segment[], fps: number, loops = 1, speed: SpeedPreset = 'standard') {
  const engine = new SignEngine()
  engine.setSpeed(speed)
  const committed: SignId[] = []
  const times: number[] = []
  const total = scriptLength(script)
  for (let i = 0; i < total * fps * loops; i++) {
    const t = (i * 1000) / fps
    const f = demoFrame(t / 1000, t, script)
    const out = engine.process(f)
    if (out.committed) {
      committed.push(out.committed.id)
      times.push(t)
      if (verbose) console.log(`    ${(t / 1000).toFixed(2)}s ${out.committed.id} (acting ${f.acting}) ${out.committed.confidence.toFixed(2)}`)
    }
  }
  const expected = Array.from({ length: loops }, () => script.filter((s) => s.sign).map((s) => s.sign as SignId)).flat()
  // Group commits into phrases exactly like useSubtitles: a ≥ FINALIZE_MS pause closes the phrase.
  const phrases: SignId[][] = []
  let maxGap = 0
  committed.forEach((id, i) => {
    const gap = i ? times[i] - times[i - 1] : Infinity
    if (gap >= FINALIZE_MS) phrases.push([id])
    else {
      phrases[phrases.length - 1].push(id)
      maxGap = Math.max(maxGap, gap)
    }
  })
  return { committed, expected, phrases, maxGap }
}
function diff(expected: SignId[], committed: SignId[]) {
  const missing = expected.filter((s) => !committed.includes(s))
  const extra = committed.filter((s) => !expected.includes(s))
  return `missing [${missing.join(' ')}] extra [${extra.join(' ')}]\n    got: ${committed.join(' ')}`
}

for (const fps of [10, 15, 24, 30, 60]) {
  const { committed, expected } = run(COVERAGE_SCRIPT, fps)
  check(`coverage @${fps}fps: ${expected.length} signs, each once, in order`, committed.join() === expected.join(), diff(expected, committed))
}
for (const fps of [10, 15, 30, 60]) {
  const { committed, expected } = run(COVERAGE_SCRIPT, fps, 1, 'fluent')
  check(`fluent preset coverage @${fps}fps: ${expected.length} signs, each once, in order`, committed.join() === expected.join(), diff(expected, committed))
}
for (const fps of [15, 30, 60]) {
  const { committed, expected, phrases, maxGap } = run(DEMO_SCRIPT, fps, 2)
  check(`showcase @${fps}fps (2 loops)`, committed.join() === expected.join(), diff(expected, committed))
  const want = [...SHOWCASE, ...SHOWCASE].map((p) => p.join(' '))
  const got = phrases.map((p) => p.join(' '))
  check(
    `showcase @${fps}fps groups into ${SHOWCASE.length} phrases per loop (2.0 s pause rule; longest in-phrase gap ${(maxGap / 1000).toFixed(2)} s)`,
    got.join(' | ') === want.join(' | ') && maxGap < FINALIZE_MS - 300,
    `got: ${got.join(' | ')}`,
  )
}

// ---- 4. Anti-spam ---------------------------------------------------------
function holdScenario(segments: { shape: DemoShape | null; dur: number; dropouts?: boolean }[], fps = 30) {
  const engine = new SignEngine()
  const commits: SignId[] = []
  let t = 0
  for (const seg of segments) {
    for (let k = 0; k < seg.dur * fps; k++, t += 1000 / fps) {
      // Simulated tracking dropouts: lose the hand for 2 frames every ~0.8 s.
      const drop = seg.dropouts && k % 24 >= 22
      const hands = seg.shape && !drop ? [buildHand(seg.shape, { wx: 0.58, wy: 0.6, palm: 0.17 }, t / 1000)] : []
      const frame: InputFrame = { t, hands, body: null, width: 1280, height: 720 }
      const out = engine.process(frame)
      if (out.committed) commits.push(out.committed.id)
    }
  }
  return commits
}
const longHold = holdScenario([{ shape: 'ILY', dur: 6, dropouts: true }])
check('anti-spam: 6 s MAHAL KITA hold with dropouts locks once', longHold.join() === 'MAHAL_KITA', longHold.join(' '))
const resetRepeat = holdScenario([{ shape: 'ILY', dur: 1.5 }, { shape: null, dur: 0.6 }, { shape: 'ILY', dur: 1.5 }])
check('anti-spam: repeat after hand reset locks twice', resetRepeat.join() === 'MAHAL_KITA,MAHAL_KITA', resetRepeat.join(' '))
const quickSwap = holdScenario([{ shape: 'ILY', dur: 1.0 }, { shape: 'L', dur: 0.45 }, { shape: 'ILY', dur: 0.9 }])
check('anti-spam: same sign again inside the 1.8 s cooldown (no reset) is blocked', quickSwap.join() === 'MAHAL_KITA', quickSwap.join(' '))
const afterCooldown = holdScenario([{ shape: 'ILY', dur: 1.0 }, { shape: 'L', dur: 0.45 }, { shape: 'ILY', dur: 1.6 }])
check('anti-spam: same sign held past the cooldown locks again', afterCooldown.join() === 'MAHAL_KITA,MAHAL_KITA', afterCooldown.join(' '))
// Raise a flat hand into position, settle briefly, then sign — no gap in between.
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
for (const [target, shape, base] of [
  ['SALAMAT', 'B', [0.55, 0.3]],
  ['KUMUSTA', 'OPEN', [0.6, 0.36]],
] as const) {
  const raise: Segment = { sign: 'B', shape, dur: 0.8, base: [base[0], base[1]], motion: (s) => ({ dy: 0.3 * (1 - ease(s / 0.5)) }) }
  const perf = COVERAGE_SCRIPT.find((g) => g.sign === target)!
  const script: Segment[] = [{ sign: null, dur: 0.5 }, raise, perf, { sign: null, dur: 0.8 }]
  for (const fps of [15, 30]) {
    const { committed } = run(script, fps)
    check(`velocity gate: raise + settle + ${target} @${fps}fps commits only ${target}`, committed.join() === target, committed.join(' '))
  }
}

// ---- 5. Gloss -> sentence ---------------------------------------------------
const CASES: [string, string, string][] = [
  ['AKO KAILANGAN TULONG', 'Kailangan ko ng tulong.', 'I need help.'],
  ['KUMUSTA IKAW', 'Kumusta ka?', 'How are you?'],
  ['SALAMAT TULONG', 'Salamat sa tulong.', 'Thank you for the help.'],
  ['GUSTO TUBIG', 'Gusto ko ng tubig.', 'I want water.'],
  ['MAHAL_KITA', 'Mahal kita.', 'I love you.'],
  ['IKAW GUSTO KAIN', 'Gusto mo bang kumain?', 'Do you want to eat?'],
  ['AKO GUSTO KAIN', 'Gusto kong kumain.', 'I want to eat.'],
  ['AKO HINDI GUSTO TUBIG', 'Ayaw ko ng tubig.', "I don't want water."],
  ['IKAW KAILANGAN TULONG', 'Kailangan mo ba ng tulong?', 'Do you need help?'],
  ['SAAN TUBIG', 'Nasaan ang tubig?', 'Where is the water?'],
  ['SAAN IKAW', 'Nasaan ka?', 'Where are you?'],
  ['ANO IKAW GUSTO', 'Ano ang gusto mo?', 'What do you want?'],
  ['AKO Z A K I', 'Ako si Zaki.', "I'm Zaki."],
  ['KUMUSTA Z A K I', 'Kumusta, Zaki!', 'Hello, Zaki!'],
  ['OO AKO GUSTO TUBIG', 'Oo, gusto ko ng tubig.', 'Yes, I want water.'],
  ['PAKIUSAP AKO TULONG', 'Pakiusap, tulungan mo ako.', 'Please help me.'],
  ['PAKIUSAP GUSTO TUBIG', 'Pakiusap, gusto ko ng tubig.', 'I want water, please.'],
  ['IKAW MAGALING', 'Magaling ka!', "You're great!"],
  ['IKAW KAIN', 'Kumain ka na ba?', 'Have you eaten?'],
  ['SALAMAT PAALAM', 'Salamat! Paalam!', 'Thank you! Goodbye!'],
  ['NO_SNAP', 'Hindi.', 'No.'],
  ['HELLO_SALUTE IKAW', 'Kumusta ka?', 'How are you?'],
  ['L O L A', 'Lola.', 'Lola.'],
  ['NICE_MEET', 'Ikinagagalak kitang makilala!', 'Nice to meet you!'],
  ['KUMUSTA NICE_MEET', 'Kumusta! Ikinagagalak kitang makilala!', 'Hello! Nice to meet you!'],
  ['TAPOS', 'Tapos na.', "It's finished."],
]
let key = 0
for (const [gloss, fil, en] of CASES) {
  const s = glossToSentence(groupGlosses(gloss.split(' ').map((id) => ({ id: id as SignId, key: key++ }))))
  check(`grammar: ${gloss} -> "${fil}" / "${en}"`, s.fil === fil && s.en === en, `got "${s.fil}" / "${s.en}" [${s.rules.join(', ')}]`)
}

// ---- 6. Fast signers, two hands -------------------------------------------
// Peak-hold: a sign recognized clearly but held for less than the lock time, then straight into the next one.
const peak = holdScenario([{ shape: 'ILY', dur: 0.55 }, { shape: 'L', dur: 0.7 }])
check('peak-hold: brief MAHAL KITA straight into L commits both', peak.join() === 'MAHAL_KITA,L', peak.join(' '))
const tooBrief = holdScenario([{ shape: 'ILY', dur: 0.3 }, { shape: null, dur: 0.6 }])
check('peak-hold: a flash shorter than the peak window does not commit', tooBrief.join() === '', tooBrief.join(' '))

const ease2 = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
const twoHand: [string, Segment][] = [
  [
    'TULONG',
    {
      sign: 'TULONG',
      shape: 'THUMB_UP',
      dur: 1.4,
      base: [0.52, 0.62],
      motion: (s) => ({ dy: -0.25 * ease2(s / 1.0) }),
      pair: { shape: 'B', base: [0.5, 0.74], motion: (s) => ({ dy: -0.25 * ease2(s / 1.0), rot: 80 }) },
    },
  ],
  [
    'ANO',
    {
      sign: 'ANO',
      shape: 'OPEN',
      dur: 1.6,
      base: [0.64, 0.55],
      motion: (s) => ({ dx: 0.02 * Math.sin(2 * Math.PI * 2.5 * s), rot: 80 }),
      pair: { shape: 'OPEN', base: [0.36, 0.55], motion: (s) => ({ dx: -0.02 * Math.sin(2 * Math.PI * 2.5 * s), rot: 80 }) },
    },
  ],
]
for (const [want, seg] of twoHand)
  for (const fps of [15, 30]) {
    const { committed } = run([{ sign: null, dur: 0.5 }, seg, { sign: null, dur: 0.8 }], fps)
    check(`two-handed ${want} @${fps}fps`, committed.join() === want, committed.join(' '))
  }

// Irregular frame timing (a throttled tab, a busy device): the showcase must still commit each sign once.
for (const speed of ['standard', 'fluent'] as const)
  for (const [lo, hi] of [
    [30, 150],
    [60, 250],
  ]) {
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const engine = new SignEngine()
    engine.setSpeed(speed)
    const got: SignId[] = []
    for (let t = 0; t < scriptLength(DEMO_SCRIPT) * 1000; t += Math.min(150, lo + rnd() * (hi - lo))) {
      const out = engine.process(demoFrame(t / 1000, t))
      if (out.committed) got.push(out.committed.id)
    }
    const want = SHOWCASE.flat()
    check(`jittery frames ${lo}-${hi} ms (${speed}): showcase commits each sign once`, got.join() === want.join(), diff(want, got))
  }

// Switching hands: the right hand signs, drops to rest (still in view, low), then the left hand
// signs. Each hand keeps its own window, so neither sign is lost or doubled.
{
  const engine = new SignEngine()
  const commits: SignId[] = []
  const fps = 30
  let t = 0
  const restR = (k: number) => buildHand('OPEN', { wx: 0.62, wy: 0.98, palm: 0.15 }, k)
  const phases: [number, (k: number) => InputFrame['hands'], InputFrame['handed']][] = [
    [1.2, (k) => [buildHand('ILY', { wx: 0.6, wy: 0.62, palm: 0.17 }, k)], ['R']],
    [1.4, (k) => [restR(k), buildHand('POINT_OUT', { wx: 0.4, wy: 0.62, palm: 0.17, mirror: true }, k)], ['R', 'L']],
  ]
  for (const [dur, hands, handed] of phases)
    for (let k = 0; k < dur * fps; k++, t += 1000 / fps) {
      const out = engine.process({ t, hands: hands(t / 1000), handed, body: null, width: 1280, height: 720 })
      if (out.committed) commits.push(out.committed.id)
    }
  check('hand switch: right hand MAHAL KITA, then left hand IKAW', commits.join() === 'MAHAL_KITA,IKAW', commits.join(' '))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
