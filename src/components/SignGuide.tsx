import { BookOpen, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useState } from 'react'
import { activeIn, LETTERS, SIGNS, WORD_ORDER, type SignInfo } from '../lib/signs'
import type { SignId, Standard } from '../lib/types'
import { Segmented } from './Segmented'
import { SignDiagram } from './SignDiagram'

/** Plain, sentence-case description of how the sign is made. */
function kindLabel(s: SignInfo) {
  if (s.motion) return 'Moving sign'
  return s.kind === 'letter' ? 'Held letter' : 'Held sign'
}

type Filter = 'words' | 'letters'

interface Props {
  highlight?: SignId | null
  standard: Standard
  onStandardChange: (s: Standard) => void
}

function Card({ s, standard, active }: { s: SignInfo; standard: Standard; active: boolean }) {
  const gloss = standard === 'ASL' ? s.glossASL : s.glossFSL
  return (
    <li
      className={`flex gap-3 rounded-xl border p-3 transition-colors duration-300 ${
        active ? 'border-emerald-400/50 bg-emerald-500/[0.07]' : 'border-white/10 bg-zinc-900/50'
      }`}
    >
      <div
        className={`relative grid size-14 shrink-0 place-items-center rounded-lg ring-1 transition-colors duration-300 ${
          active ? 'bg-emerald-500/10 ring-emerald-400/30' : 'bg-zinc-950 ring-white/5'
        }`}
      >
        <SignDiagram id={s.id} size={50} active={active} />
        {s.kind === 'letter' && (
          <span className="absolute right-1 bottom-0.5 font-mono text-[10px] font-medium text-zinc-500">{s.fil}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-semibold text-zinc-100">
            {s.kind === 'letter' ? `Letter ${s.fil}` : s.fil}
            {s.variant && <span className="font-normal text-zinc-400"> ({s.variant})</span>}
          </span>
          {s.kind !== 'letter' && <span className="text-xs text-zinc-400">{s.en}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
          <span>{kindLabel(s)}</span>
          <span aria-hidden className="text-zinc-700">/</span>
          <span>{s.standards.length === 2 ? 'FSL and ASL' : `${s.standards[0]} only`}</span>
          {s.kind !== 'letter' && gloss.toUpperCase() !== s.fil.toUpperCase() && (
            <>
              <span aria-hidden className="text-zinc-700">/</span>
              <span>
                Gloss <span className="font-mono text-zinc-400">{gloss}</span>
              </span>
            </>
          )}
        </div>
        <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-zinc-300 marker:text-zinc-600">
          {s.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {s.cue && (
          <p lang="fil" className="mt-1.5 text-xs leading-relaxed text-zinc-500 italic">
            {s.cue}
          </p>
        )}
        {s.note && <p className="mt-1.5 text-[11px] leading-snug text-amber-200/70">{s.note}</p>}
      </div>
    </li>
  )
}

export const SignGuide = memo(function SignGuide({ highlight, standard, onStandardChange }: Props) {
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState<Filter>('words')
  const ids: SignId[] = (filter === 'words' ? WORD_ORDER : LETTERS).filter((id) => activeIn(id, standard))

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 text-left" aria-expanded={open}>
          <BookOpen size={16} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-100">Sign Guide</span>
          <span className="text-xs text-zinc-500">
            {WORD_ORDER.filter((id) => activeIn(id, standard)).length} words and the full alphabet
          </span>
          <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            label="Sign Guide category"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'words', label: 'Words and phrases' },
              { id: 'letters', label: 'Alphabet A–Z' },
            ]}
          />
          <Segmented
            label="Sign language standard (guide)"
            size="sm"
            value={standard}
            onChange={onStandardChange}
            options={[
              { id: 'FSL', label: 'FSL' },
              { id: 'ASL', label: 'ASL' },
              { id: 'BOTH', label: 'FSL + ASL' },
            ]}
          />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {filter === 'letters' && (
              <p className="border-t border-white/10 px-4 pt-3 text-xs text-zinc-500">
                Spell names and words one letter at a time, and they’ll join up into a single word: Z, A, K, I becomes ZAKI. Keep your hand at chest
                height while you spell, because a W or O held up at your chin is read as TUBIG or KAIN instead.
              </p>
            )}
            <ul className="grid gap-2 border-t border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ids.map((id) => (
                <Card key={id} s={SIGNS[id]} standard={standard} active={highlight === id} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
})
