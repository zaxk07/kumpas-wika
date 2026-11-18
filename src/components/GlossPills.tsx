import { ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { Token } from '../lib/grammar'
import { glossLabel, SIGNS } from '../lib/signs'
import type { Standard } from '../lib/types'

interface Props {
  tokens: Token[]
  standard: Standard
  size?: 'sm' | 'md'
  animate?: boolean
}

/** Raw sign-gloss pills, e.g. [KUMUSTA] [IKAW] or a fingerspelled word [Z·A·K·I -> ZAKI]. */
export function GlossPills({ tokens, standard, size = 'md', animate = true }: Props) {
  const base = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="gloss-pills">
      <AnimatePresence initial={false}>
        {tokens.map((t) => {
          const k = t.keys.join('-')
          const content =
            t.kind === 'word' ? (
              <span className={`inline-flex items-baseline gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 font-mono text-amber-200 ${base}`}>
                <span className="text-amber-400/70">{t.letters.join('·')}</span>
                {t.letters.length > 1 && (
                  <span className="inline-flex items-center gap-1">
                    <ArrowRight size={10} aria-hidden className="text-amber-400/70" />
                    {t.text}
                  </span>
                )}
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-md border font-mono tracking-wide ${base} ${
                  SIGNS[t.id].kind === 'dynamic' ? 'border-sky-400/30 bg-sky-400/10 text-sky-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                }`}
              >
                {glossLabel(t.id, standard)}
                {standard === 'BOTH' && SIGNS[t.id].glossASL !== SIGNS[t.id].glossFSL && (
                  <span className="text-zinc-500">/ {SIGNS[t.id].glossASL}</span>
                )}
              </span>
            )
          return animate ? (
            <motion.span
              key={k}
              layout
              initial={{ opacity: 0, scale: 0.85, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {content}
            </motion.span>
          ) : (
            <span key={k}>{content}</span>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
