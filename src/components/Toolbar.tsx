import { CircleAlert, CircleCheck, Gauge, Info, SlidersHorizontal } from 'lucide-react'
import type { Hint } from '../hooks/useDetectionLoop'
import { TIMING, type SpeedPreset } from '../lib/engine'
import { Segmented } from './Segmented'

interface Props {
  threshold: number
  onThresholdChange: (v: number) => void
  hint: Hint
  speed: SpeedPreset
  onSpeedChange: (s: SpeedPreset) => void
}

const HINT_STYLE = {
  good: { cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', Icon: CircleCheck },
  warn: { cls: 'border-amber-500/30 bg-amber-500/10 text-amber-200', Icon: CircleAlert },
  info: { cls: 'border-white/[0.08] bg-surface-2 text-zinc-300', Icon: Info },
}

/** Studio strip, second row: confidence calibration and the hand alignment / lighting hint. */
export function Toolbar({ threshold, onThresholdChange, hint, speed, onSpeedChange }: Props) {
  const { cls, Icon } = HINT_STYLE[hint.level]
  const pct = Math.round(threshold * 100)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5" title={`How fast a sign locks in: Fluent ${TIMING.fluent.staticMs} ms, Standard ${TIMING.standard.staticMs} ms`}>
        <Gauge size={14} className="text-zinc-500" aria-hidden />
        <Segmented
          label="Signer speed"
          size="sm"
          value={speed}
          onChange={onSpeedChange}
          options={[
            { id: 'fluent', label: 'Fluent / fast video', title: `Locks in ${TIMING.fluent.staticMs} ms, for natural-speed signers and videos` },
            { id: 'standard', label: 'Standard / practice', title: `Locks in ${TIMING.standard.staticMs} ms, steadier for learners` },
          ]}
        />
      </div>
      <label
        className="hairline flex items-center gap-2 rounded-lg bg-obsidian/80 px-2.5 py-1.5"
        title="How sure the app should be before it counts a sign. Turn it down if your camera is dim and signs are being missed; turn it up if it’s picking up signs you didn’t mean."
      >
        <SlidersHorizontal size={14} className="text-zinc-400" />
        <span className="text-xs text-zinc-300">Confidence</span>
        <input
          type="range"
          min={40}
          max={90}
          step={5}
          value={pct}
          onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
          className="h-1 w-20 cursor-pointer accent-emerald-500 sm:w-28"
          aria-label="Confidence threshold"
          data-testid="confidence-slider"
        />
        <span className="w-9 text-right font-mono text-xs text-zinc-200 tabular-nums">{pct}%</span>
        <span className="hidden font-mono text-[10px] text-zinc-500 md:inline">{pct <= 50 ? 'more sensitive' : pct >= 75 ? 'more careful' : 'balanced'}</span>
      </label>

      <div className={`flex min-w-0 flex-1 basis-56 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${cls}`} role="status" data-testid="alignment-hint">
        <Icon size={14} className="shrink-0" />
        <span className="truncate">{hint.text}</span>
      </div>
    </div>
  )
}
