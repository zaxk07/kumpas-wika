import { FileVideo, Pause, Play, Repeat, Upload } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'
import { Segmented } from '../Segmented'

const RATES = [
  { id: '0.5', label: '0.5x', title: 'Half speed, for fast signers' },
  { id: '0.75', label: '0.75x' },
  { id: '1', label: '1x' },
] as const
type Rate = (typeof RATES)[number]['id']

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  fileName: string
  onReplace: () => void
}

/** Play / pause, scrubber, speed and loop for an uploaded video. Reads its state from the <video> element itself. */
export function VideoTransport({ videoRef, fileName, onReplace }: Props) {
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [rate, setRate] = useState<Rate>('1')
  const [loop, setLoop] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let raf = 0
    const sync = () => {
      setTime(v.currentTime)
      setDuration(Number.isFinite(v.duration) ? v.duration : 0)
      setPaused(v.paused)
      setLoop(v.loop)
      const r = String(v.playbackRate)
      if (r === '0.5' || r === '0.75' || r === '1') setRate(r)
    }
    // Smooth scrubber while playing; events cover everything else.
    const tick = () => {
      setTime(v.currentTime)
      raf = v.paused ? 0 : requestAnimationFrame(tick)
    }
    const onPlay = () => {
      sync()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const events = ['loadedmetadata', 'durationchange', 'pause', 'seeked', 'ratechange', 'ended', 'emptied'] as const
    events.forEach((e) => v.addEventListener(e, sync))
    v.addEventListener('play', onPlay)
    sync()
    if (!v.paused) raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      events.forEach((e) => v.removeEventListener(e, sync))
      v.removeEventListener('play', onPlay)
    }
  }, [videoRef])

  const v = () => videoRef.current
  const toggle = () => {
    const el = v()
    if (!el) return
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-surface-2/70 px-3 py-2.5" data-testid="video-transport">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? 'Play' : 'Pause'}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-fg text-obsidian transition hover:bg-white active:scale-[0.95]"
        >
          {paused ? <Play size={15} className="translate-x-px" fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
        </button>
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-zinc-300 tabular-nums">{fmt(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const el = v()
            if (el) el.currentTime = Number(e.target.value)
            setTime(Number(e.target.value))
          }}
          aria-label="Seek"
          aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-500"
        />
        <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums">{fmt(duration)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-xs text-zinc-400">
          <FileVideo size={13} className="shrink-0 text-zinc-500" />
          <span className="truncate" title={fileName}>
            {fileName}
          </span>
        </span>
        <Segmented
          label="Playback speed"
          size="sm"
          value={rate}
          options={[...RATES]}
          onChange={(r) => {
            const el = v()
            if (el) el.playbackRate = Number(r)
            setRate(r)
          }}
        />
        <button
          type="button"
          role="switch"
          aria-checked={loop}
          onClick={() => {
            const el = v()
            if (el) el.loop = !el.loop
            setLoop((l) => !l)
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition active:scale-[0.97] ${
            loop ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.08] text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Repeat size={12} /> Loop
        </button>
        <button
          type="button"
          onClick={onReplace}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.97]"
        >
          <Upload size={12} /> Replace
        </button>
      </div>
    </div>
  )
}
