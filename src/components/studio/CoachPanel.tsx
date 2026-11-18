import { Check, ChevronLeft, ChevronRight, GraduationCap, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Practice } from '../../hooks/usePractice'
import { BEGINNER_CIRCUIT, type CoachState } from '../../lib/coach'
import { activeIn, LETTERS, SIGNS, WORD_ORDER } from '../../lib/signs'
import type { SignId, Standard } from '../../lib/types'
import { SignDiagram } from '../SignDiagram'

const TONE: Record<CoachState, { bar: string; text: string }> = {
  nohand: { bar: 'bg-zinc-600', text: 'text-zinc-400' },
  shape: { bar: 'bg-amber-400', text: 'text-amber-200' },
  move: { bar: 'bg-lime-300', text: 'text-lime-200' },
  hold: { bar: 'bg-lime-300', text: 'text-lime-200' },
  locking: { bar: 'bg-emerald-400', text: 'text-emerald-200' },
  cooling: { bar: 'bg-amber-400', text: 'text-amber-200' },
  matched: { bar: 'bg-signal', text: 'text-emerald-300' },
}

const label = (id: SignId) => (SIGNS[id].kind === 'letter' ? `Letter ${id}` : SIGNS[id].fil)

interface Props {
  practice: Practice
  standard: Standard
  onPick: (id: SignId) => void
  onClose: () => void
}

export function CoachPanel({ practice, standard, onPick, onClose }: Props) {
  const reduced = useReducedMotion()
  const { target, feedback, queue, index, matched, finished } = practice
  const s = SIGNS[target]
  const tone = TONE[feedback.state]
  const inCircuit = queue === BEGINNER_CIRCUIT || (queue.length === BEGINNER_CIRCUIT.length && queue.every((q, i) => q === BEGINNER_CIRCUIT[i]))

  return (
    <section
      aria-label="Practice coach"
      className={`rounded-2xl border bg-surface transition-colors duration-500 ${matched ? 'border-emerald-500/50' : 'border-white/[0.08]'}`}
      data-testid="coach-panel"
    >
      <header className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
        <GraduationCap size={16} className="text-emerald-400" />
        <h2 className="text-sm font-semibold tracking-tight text-fg">Practice</h2>
        <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
          {inCircuit ? `Beginner circuit · ${index + 1} / ${queue.length}` : 'Single sign'}
        </span>
        <button type="button" onClick={onClose} aria-label="Close practice" className="ml-auto rounded-md p-1 text-zinc-500 hover:text-zinc-200">
          <X size={15} />
        </button>
      </header>

      <div className="space-y-3 p-4">
        <label className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Sign</span>
          <select
            value={target}
            onChange={(e) => onPick(e.target.value as SignId)}
            className="hairline min-w-0 flex-1 rounded-lg bg-obsidian px-2 py-1.5 text-base text-zinc-200 sm:text-xs"
            aria-label="Choose a sign to practice"
          >
            <optgroup label="Beginner circuit">
              {BEGINNER_CIRCUIT.map((id) => (
                <option key={`b-${id}`} value={id}>
                  {label(id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Words and phrases">
              {WORD_ORDER.filter((id) => !BEGINNER_CIRCUIT.includes(id) && activeIn(id, standard)).map((id) => (
                <option key={id} value={id}>
                  {label(id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Alphabet">
              {LETTERS.filter((id) => activeIn(id, standard)).map((id) => (
                <option key={id} value={id}>
                  {label(id)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${index}-${target}`}
            initial={reduced ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: -12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="flex gap-3"
          >
            <div
              className={`relative grid size-24 shrink-0 place-items-center rounded-xl ring-1 transition-colors duration-500 ${
                matched ? 'bg-emerald-500/10 ring-emerald-400/40' : 'bg-obsidian ring-white/[0.06]'
              }`}
            >
              <SignDiagram id={target} size={84} active={matched} />
              <AnimatePresence>
                {matched && (
                  <motion.span
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                    className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-signal text-emerald-950"
                  >
                    <Check size={14} strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-base font-semibold tracking-tight text-fg">{label(target)}</span>
                {s.kind !== 'letter' && <span className="text-xs text-zinc-400">{s.en}</span>}
              </div>
              <div className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">{s.motion ? 'Moving sign' : 'Held sign'}</div>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-zinc-300 marker:text-zinc-600">
                {s.steps.map((st) => (
                  <li key={st}>{st}</li>
                ))}
              </ol>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Real-time feedback meter */}
        <div className="rounded-xl border border-white/[0.06] bg-obsidian/60 p-3" data-testid="coach-feedback" data-state={feedback.state}>
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-zinc-500 uppercase">
            <span>Match</span>
            <span className="tabular-nums">{Math.round(feedback.score * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(feedback.score * 100)} aria-label="How closely you match the sign">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${feedback.score * 100}%`, transition: 'width 160ms ease-out, background-color 200ms' }} />
          </div>
          <p className={`mt-2 min-h-10 text-sm leading-snug ${tone.text}`} aria-live="polite">
            {finished
              ? 'Circuit complete. Nicely done.'
              : matched
                ? index < queue.length - 1
                  ? 'Matched. Next sign coming up.'
                  : 'Matched.'
                : feedback.text}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => practice.go(index - 1)}
            disabled={index === 0}
            aria-label="Previous sign"
            className="grid size-8 place-items-center rounded-lg border border-white/[0.08] text-zinc-300 hover:border-white/20 disabled:opacity-30"
          >
            <ChevronLeft size={15} />
          </button>
          <ol className="flex flex-1 items-center justify-center gap-1.5" aria-label="Progress">
            {queue.map((id, i) => (
              <li key={`${id}-${i}`}>
                <button
                  type="button"
                  onClick={() => practice.go(i)}
                  aria-label={`${label(id)}${i === index ? ' (current)' : ''}`}
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? 'w-6 bg-signal' : i < index || (i === index && matched) ? 'w-3 bg-emerald-700' : 'w-3 bg-zinc-700'
                  }`}
                />
              </li>
            ))}
          </ol>
          {finished || (matched && index === queue.length - 1) ? (
            <button
              type="button"
              onClick={() => practice.start()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-signal px-2.5 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
            >
              <RotateCcw size={13} /> {inCircuit ? 'Again' : 'Beginner circuit'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={practice.retry}
                aria-label="Reset this sign"
                className="grid size-8 place-items-center rounded-lg border border-white/[0.08] text-zinc-300 hover:border-white/20"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={() => practice.go(index + 1)}
                disabled={index >= queue.length - 1}
                aria-label="Skip to next sign"
                className="grid size-8 place-items-center rounded-lg border border-white/[0.08] text-zinc-300 hover:border-white/20 disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/** Compact target chip shown over the video while practicing. */
export function CoachChip({ practice }: { practice: Practice }) {
  const tone = TONE[practice.feedback.state]
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border bg-obsidian/80 p-1.5 pr-3 backdrop-blur transition-colors duration-300 ${
        practice.matched ? 'border-emerald-400/60' : 'border-white/[0.08]'
      }`}
    >
      <div className="grid size-9 place-items-center rounded-lg bg-surface-2">
        <SignDiagram id={practice.target} size={32} active={practice.matched} />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[9px] tracking-[0.14em] text-zinc-500 uppercase">Target</div>
        <div className="truncate text-xs font-semibold text-fg">{label(practice.target)}</div>
        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${practice.feedback.score * 100}%`, transition: 'width 160ms ease-out' }} />
        </div>
      </div>
    </div>
  )
}
