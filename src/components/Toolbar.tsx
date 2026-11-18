import { CircleAlert, CircleCheck, Info, SlidersHorizontal } from 'lucide-react'
import type { Hint } from '../hooks/useDetectionLoop'
import type { SubtitleMode } from '../lib/types'
import { Segmented } from './Segmented'

interface Props {
  mode: SubtitleMode
  onModeChange: (m: SubtitleMode) => void
  threshold: number
  onThresholdChange: (v: number) => void
  hint: Hint
}

const HINT_STYLE = {
  good: { cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', Icon: CircleCheck },
  warn: { cls: 'border-amber-500/30 bg-amber-500/10 text-amber-200', Icon: CircleAlert },
  info: { cls: 'border-white/10 bg-zinc-900/80 text-zinc-300', Icon: Info },
}

/** Studio toolbar: subtitle language, confidence calibration and the hand alignment / lighting hint. */
export function Toolbar({ mode, onModeChange, threshold, onThresholdChange, hint }: Props) {
  const { cls, Icon } = HINT_STYLE[hint.level]
  const pct = Math.round(threshold * 100)
  return (
    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 pb-3 sm:gap-3 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Subtitles in</span>
        <Segmented
          label="Subtitle language"
          value={mode}
          onChange={onModeChange}
          options={[
            { id: 'FIL', label: 'Filipino' },
            { id: 'EN', label: 'English' },
            { id: 'BI', label: 'FIL / EN' },
          ]}
        />
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/80 px-2.5 py-1.5" title="How sure the app should be before it counts a sign. Turn it down if your camera is dim and signs are being missed; turn it up if it’s picking up signs you didn’t mean.">
        <SlidersHorizontal size={14} className="text-zinc-400" />
        <span className="text-xs text-zinc-300">Confidence</span>
        <input
          type="range"
          min={40}
          max={90}
          step={5}
          value={pct}
          onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
          className="h-1 w-24 cursor-pointer accent-emerald-400 sm:w-32"
          aria-label="Confidence threshold"
          data-testid="confidence-slider"
        />
        <span className="w-9 text-right font-mono text-xs text-zinc-200 tabular-nums">{pct}%</span>
        <span className="hidden font-mono text-[10px] text-zinc-500 md:inline">{pct <= 50 ? 'more sensitive' : pct >= 75 ? 'more careful' : 'balanced'}</span>
      </label>

      <div className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${cls}`} role="status" data-testid="alignment-hint">
        <Icon size={14} className="shrink-0" />
        <span className="truncate">{hint.text}</span>
      </div>
    </div>
  )
}
