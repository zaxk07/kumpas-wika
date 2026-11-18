import { Search } from 'lucide-react'
import { memo, useState } from 'react'
import { activeIn, LETTERS, SIGNS, WORD_ORDER, type SignInfo } from '../lib/signs'
import type { SignId, Standard } from '../lib/types'
import { Segmented } from './Segmented'
import { SignDiagram } from './SignDiagram'
import { SectionHeader } from './site/SectionHeader'

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
      className={`flex gap-3 rounded-xl border p-3 transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 ${
        active ? 'border-emerald-400/50 bg-emerald-500/[0.07]' : 'border-white/[0.06] bg-surface-2/60 hover:border-white/[0.14]'
      }`}
    >
      <div
        className={`relative grid size-14 shrink-0 place-items-center rounded-lg ring-1 transition-colors duration-300 ${
          active ? 'bg-emerald-500/10 ring-emerald-400/30' : 'bg-obsidian ring-white/5'
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
  const [filter, setFilter] = useState<Filter>('words')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const ids: SignId[] = (filter === 'words' ? WORD_ORDER : LETTERS)
    .filter((id) => activeIn(id, standard))
    .filter((id) => {
      if (!q) return true
      const s = SIGNS[id]
      return [s.fil, s.en, s.glossFSL, s.glossASL, s.id].some((v) => v.toLowerCase().includes(q))
    })
  const wordCount = WORD_ORDER.filter((id) => activeIn(id, standard)).length

  return (
    <section id="dictionary" className="mx-auto max-w-[1400px] px-4 pt-24 pb-24 sm:px-6 sm:pt-32">
      <SectionHeader
        index="04"
        kicker="Dictionary"
        title="Sign guide"
        lede={`${wordCount} words and the full alphabet, each with a hand diagram drawn from the recognizer's own hand model. The sign being read right now lights up.`}
      />
      <div className="mt-8 rounded-[20px] border border-white/[0.08] bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] p-3 sm:p-4">
          <label className="hairline flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg bg-obsidian/80 px-3 py-1.5 focus-within:border-emerald-500/50">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search signs: salamat, help, B…"
              aria-label="Search signs"
              className="w-full min-w-0 bg-transparent text-base text-fg placeholder:text-zinc-600 focus:outline-none focus-visible:outline-none sm:text-sm"
            />
          </label>
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
              { id: 'BOTH', label: 'FSL+ASL' },
            ]}
          />
        </div>
        {filter === 'letters' && (
          <p className="px-4 pt-3 text-xs leading-relaxed text-zinc-500">
            Spell names and words one letter at a time, and they’ll join up into a single word: Z, A, K, I becomes ZAKI. Keep your hand at chest
            height while you spell, because a W or O held up at your chin is read as TUBIG or KAIN instead.
          </p>
        )}
        {ids.length ? (
          <ul className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
            {ids.map((id) => (
              <Card key={id} s={SIGNS[id]} standard={standard} active={highlight === id} />
            ))}
          </ul>
        ) : (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-zinc-300">No signs match “{query.trim()}”.</p>
            <p className="mt-1 text-xs text-zinc-500">Try the Filipino or English word, or switch between words and the alphabet.</p>
          </div>
        )}
      </div>
    </section>
  )
})
