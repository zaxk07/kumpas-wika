import { Check, Copy, Delete, FileDown, Trash2, Volume2, VolumeX } from 'lucide-react'
import { memo, useState } from 'react'
import { groupGlosses, previewSentence } from '../lib/grammar'
import type { Standard, SubtitleMode } from '../lib/types'
import { phraseSentence, speakSentence, type Phrase } from '../hooks/useSubtitles'
import { buildSrt, downloadText, srtFilename } from '../lib/srt'
import { GlossPills } from './GlossPills'

interface Props {
  phrases: Phrase[]
  mode: SubtitleMode
  standard: Standard
  autoSpeak: boolean
  onToggleSpeak: () => void
  onBackspace: () => void
  onClear: () => void
  /** Name of the uploaded video, used for the .srt filename. */
  videoName?: string | null
}

const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-zinc-800 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40'

export const TranscriptPanel = memo(function TranscriptPanel({ phrases, mode, standard, autoSpeak, onToggleSpeak, onBackspace, onClear, videoName = null }: Props) {
  const [copied, setCopied] = useState(false)
  const filled = phrases.filter((p) => p.entries.length)
  const signCount = filled.reduce((a, p) => a + p.entries.length, 0)

  const copy = async () => {
    const lines = filled.map((p) => {
      const s = phraseSentence(p)
      const text = mode === 'FIL' ? s.fil : mode === 'EN' ? s.en : `${s.fil} / ${s.en}`
      return `[${fmt(p.entries[0].at)}] ${text}`
    })
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked by browser permissions */
    }
  }

  const downloadSrt = () => {
    const srt = buildSrt(
      filled.map((p) => ({ entries: p.entries, sentence: p.closed ? phraseSentence(p) : previewSentence(groupGlosses(p.entries)) })),
      mode,
    )
    if (srt) downloadText(srtFilename(videoName), srt)
  }

  return (
    <aside data-tour="transcript" className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/[0.08] bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-fg">Transcript</h2>
          <p className="font-mono text-[11px] text-zinc-500">
            {filled.length} sentences · {signCount} signs
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleSpeak}
          className={`${btn} ${autoSpeak ? 'border-emerald-500/40 text-emerald-300' : ''}`}
          aria-pressed={autoSpeak}
          title="Read each finished sentence out loud"
        >
          {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
          Read aloud
        </button>
      </div>

      <ol className="scrollbar-thin max-h-[28rem] min-h-48 flex-1 space-y-3 overflow-y-auto px-4 py-3 lg:max-h-none" data-testid="transcript">
        {filled.length === 0 && (
          <li className="py-10 text-center text-sm text-zinc-500">
            As you sign, your words gather here. Pause for a couple of seconds and they’re written out as a proper sentence in Filipino and English.
          </li>
        )}
        {[...filled].reverse().map((p) => {
          // Open phrases show the live, unpunctuated preview; closed ones the finalized sentence.
          const s = p.closed ? phraseSentence(p) : previewSentence(groupGlosses(p.entries))
          return (
            <li key={p.key} className="rounded-xl border border-white/[0.06] bg-surface-2/60 p-2.5" data-testid="transcript-item">
              <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                {fmt(p.entries[0].at)}
                {!p.closed && (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    writing…
                  </span>
                )}
                {p.closed && (
                  <button
                    type="button"
                    onClick={() => speakSentence(s, mode)}
                    className="ml-auto rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                    aria-label="Speak this sentence"
                  >
                    <Volume2 size={12} />
                  </button>
                )}
              </div>
              <GlossPills tokens={groupGlosses(p.entries)} standard={standard} size="sm" animate={false} />
              <p className={`mt-1.5 text-sm leading-snug ${p.closed ? 'text-zinc-50' : 'text-zinc-400 italic'}`} data-testid="transcript-sentence">
                {mode === 'EN' ? s.en : s.fil}
              </p>
              {mode === 'BI' && <p className="text-xs leading-snug text-zinc-400">{s.en}</p>}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.08] px-4 py-3">
        <button type="button" className={btn} onClick={copy} disabled={!filled.length}>
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy subtitles'}
        </button>
        <button type="button" className={btn} onClick={downloadSrt} disabled={!filled.length} data-testid="download-srt">
          <FileDown size={14} />
          Download .SRT
        </button>
        <button type="button" className={btn} onClick={onBackspace} disabled={!filled.length}>
          <Delete size={14} />
          Undo last sign
        </button>
        <button type="button" className={`${btn} hover:text-rose-300`} onClick={onClear} disabled={!filled.length}>
          <Trash2 size={14} />
          Clear
        </button>
      </div>
    </aside>
  )
})
