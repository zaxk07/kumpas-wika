import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown } from 'lucide-react'
import type { EngineOutput } from '../lib/engine'
import { groupGlosses, previewSentence } from '../lib/grammar'
import { SIGNS, signText } from '../lib/signs'
import type { Standard, SubtitleMode } from '../lib/types'
import { phraseSentence, type Phrase } from '../hooks/useSubtitles'
import { GlossPills } from './GlossPills'
import { LockRing } from './LockRing'

interface Props {
  output: EngineOutput | null
  phrase: Phrase | null
  mode: SubtitleMode
  standard: Standard
  active: boolean
}

export function CaptionBar({ output, phrase, mode, standard, active }: Props) {
  const cand = output?.candidate
  const tokens = phrase ? groupGlosses(phrase.entries) : []
  const sentence = phrase ? (phrase.closed ? phraseSentence(phrase) : previewSentence(tokens)) : null
  const live = phrase && !phrase.closed
  const primary = sentence ? (mode === 'EN' ? sentence.en : sentence.fil) : ''
  const secondary = sentence && mode === 'BI' ? sentence.en : ''
  const state = output?.latched
    ? 'Got it'
    : output?.cooling
      ? 'Already added. Lower your hand to sign it again'
      : cand && SIGNS[cand.id].motion
        ? 'Watching the movement'
        : 'Hold it steady'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 sm:p-4">
      <div className="mx-auto max-w-4xl rounded-xl border border-white/[0.08] bg-obsidian/80 px-3 py-2 shadow-2xl backdrop-blur-md sm:px-4 sm:py-3">
        {/* Line 1: live partial detection */}
        <div className="flex min-h-9 items-center gap-3" data-testid="caption-partial">
          {cand ? (
            <>
              <LockRing progress={output?.progress ?? 0} locked={!!output?.latched} cooling={!!output?.cooling} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`truncate text-base font-semibold tracking-wide sm:text-lg ${
                      output?.latched ? 'text-emerald-400' : output?.cooling ? 'text-amber-300' : 'text-lime-200'
                    }`}
                  >
                    {signText(cand.id, mode)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">{Math.round(cand.confidence * 100)}%</span>
                  <span className="ml-auto truncate text-[11px] text-zinc-400">{state}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${output?.latched ? 'bg-signal' : output?.cooling ? 'bg-amber-400' : 'bg-lime-300'}`}
                    style={{ width: `${(output?.progress ?? 0) * 100}%`, transition: 'width 80ms linear' }}
                  />
                </div>
              </div>
            </>
          ) : (
            <span className="text-sm text-zinc-400">
              {!active
                ? 'Captions will show up here once the camera or the demo is on.'
                : output?.hasHand
                  ? 'I can see your hand. Go ahead and sign…'
                  : 'Raise your hand into the frame to start signing.'}
            </span>
          )}
        </div>

        {/* Line 2: gloss buffer -> natural sentence */}
        <div className="mt-1.5 border-t border-white/10 pt-1.5" data-testid="caption-committed">
          {tokens.length > 0 ? (
            <div className="mb-1 flex items-center gap-1.5">
              <GlossPills tokens={tokens} standard={standard} size="sm" />
              <ArrowDown size={12} className="shrink-0 text-zinc-600" />
            </div>
          ) : null}
          <div className="min-h-7" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${phrase?.key ?? 'none'}-${phrase?.closed ? 'final' : 'live'}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              >
                {primary ? (
                  <p
                    className={`line-clamp-2 text-base leading-snug font-medium sm:text-lg xl:text-2xl ${live ? 'text-zinc-300 italic' : 'text-white'}`}
                    data-testid="caption-sentence"
                  >
                    {primary}
                    {live && <span className="ml-0.5 inline-block h-5 w-[2px] translate-y-0.5 animate-pulse bg-emerald-400/80" />}
                  </p>
                ) : (
                  <p className="text-zinc-600">…</p>
                )}
                {secondary && <p className={`text-sm leading-snug sm:text-base ${live ? 'text-zinc-500 italic' : 'text-zinc-400'}`}>{secondary}</p>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
