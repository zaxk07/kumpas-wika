import { ArrowLeft, ArrowRight, GraduationCap, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { TOUR_STEPS } from './steps'

interface Props {
  step: number | null
  onStep: (i: number) => void
  onClose: () => void
  onPractice: () => void
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8
const CARD_W = 360

/**
 * Spotlight walkthrough over the live studio. Dims the page, cuts a rounded window
 * around the control being explained, and anchors a card next to it. Keyboard: arrows
 * to move, Escape to close. Focus moves into the card and returns afterwards.
 */
export function Tour({ step, onStep, onClose, onPractice }: Props) {
  const reduced = useReducedMotion()
  const open = step != null
  const i = step ?? 0
  const s = open ? TOUR_STEPS[i] : null
  const [box, setBox] = useState<Box | null>(null)
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardH, setCardH] = useState(220)
  const returnFocus = useRef<HTMLElement | null>(null)

  // Bring the target into view on each step.
  useEffect(() => {
    if (!s) return
    const el = document.querySelector<HTMLElement>(s.target)
    el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [s, reduced])

  // Track the target's position while open (scrolling, layout shifts, live content).
  useEffect(() => {
    if (!s) return
    let raf = 0
    let last = ''
    const measure = () => {
      const el = document.querySelector<HTMLElement>(s.target)
      if (el) {
        const r = el.getBoundingClientRect()
        const key = `${r.top|0},${r.left|0},${r.width|0},${r.height|0},${window.innerWidth},${window.innerHeight}`
        if (key !== last) {
          last = key
          setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
          setVw(window.innerWidth)
          setVh(window.innerHeight)
        }
      }
      raf = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(raf)
  }, [s])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [step, vw])

  // Focus management + keyboard.
  useEffect(() => {
    if (!open) return
    returnFocus.current ??= document.activeElement as HTMLElement | null
    cardRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && i < TOUR_STEPS.length - 1) onStep(i + 1)
      else if (e.key === 'ArrowLeft' && i > 0) onStep(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, i, onStep, onClose])

  useEffect(() => {
    if (open) return
    returnFocus.current?.focus?.()
    returnFocus.current = null
  }, [open])

  const mobile = vw < 640
  let cardStyle: CSSProperties = {}
  if (!mobile && box) {
    const left = Math.min(Math.max(16, box.left), vw - CARD_W - 16)
    const below = box.top + box.height + 12
    const above = box.top - cardH - 12
    const top = below + cardH < vh - 16 ? below : above > 16 ? above : vh - cardH - 24
    cardStyle = { left, top, width: CARD_W }
  }

  const last = i === TOUR_STEPS.length - 1
  const spring = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 38 }

  return (
    <AnimatePresence>
      {open && s && (
        <motion.div
          key="tour"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Click-catcher: the walkthrough is modal, clicks outside the card do nothing. */}
          <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
          {box && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute rounded-2xl"
              style={{ boxShadow: '0 0 0 9999px rgb(9 9 11 / 0.72)', outline: '2px solid rgb(52 211 153 / 0.7)' }}
              initial={false}
              animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
              transition={spring}
            />
          )}

          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            tabIndex={-1}
            className={`absolute rounded-2xl border border-white/[0.1] bg-surface p-5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] outline-none ${
              mobile ? 'inset-x-3 bottom-3' : ''
            }`}
            style={cardStyle}
            initial={false}
            animate={mobile ? {} : { top: cardStyle.top, left: cardStyle.left }}
            transition={spring}
            data-testid="tour-card"
          >
            <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
              <span>
                Step <span className="text-signal">0{i + 1}</span> / 0{TOUR_STEPS.length}
              </span>
              <button type="button" onClick={onClose} aria-label="Close tutorial" className="-mr-1 rounded-md p-1 text-zinc-500 hover:text-zinc-200">
                <X size={15} />
              </button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <h2 id="tour-title" className="mt-3 text-lg font-semibold tracking-tight text-fg">
                  {s.title}
                </h2>
                <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  {s.body}
                </p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-5 flex items-center gap-2">
              <div className="mr-auto flex gap-1.5" aria-hidden>
                {TOUR_STEPS.map((_, k) => (
                  <span key={k} className={`h-1 rounded-full transition-all duration-300 ${k === i ? 'w-5 bg-signal' : 'w-2 bg-zinc-700'}`} />
                ))}
              </div>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => onStep(i - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20"
                >
                  <ArrowLeft size={13} /> Back
                </button>
              )}
              {last ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={onPractice}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-signal px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
                  >
                    <GraduationCap size={13} /> Start practicing
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onStep(i + 1)}
                  className="inline-flex items-center gap-1 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-obsidian hover:bg-white"
                >
                  Next <ArrowRight size={13} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
