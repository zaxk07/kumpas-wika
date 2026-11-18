import type { ModelStatus } from '../hooks/useLandmarkers'

interface Props {
  renderFps: number
  inferFps: number
  latency: number
  e2e: number
  windowMs: number
  samples: number
  model: ModelStatus
  delegate?: string
  thread?: string
  source: string
  shape: string
}

type Tone = 'zinc' | 'emerald' | 'amber' | 'rose'
const TONES: Record<Tone, string> = {
  zinc: 'text-zinc-200',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
}

function Badge({ label, value, tone = 'zinc', wide = false, title }: { label: string; value: string; tone?: Tone; wide?: boolean; title?: string }) {
  return (
    <div
      title={title}
      className={`${wide ? 'hidden sm:flex' : 'flex'} items-center gap-1.5 rounded-md border border-white/10 bg-black/55 px-2 py-1 font-mono text-[11px] backdrop-blur`}
    >
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${TONES[tone]}`}>{value}</span>
    </div>
  )
}

const fpsTone = (v: number): Tone => (v >= 24 ? 'emerald' : v >= 12 ? 'amber' : v > 0 ? 'rose' : 'zinc')

export function StatusBadges({ renderFps, inferFps, latency, e2e, windowMs, samples, model, delegate, thread, source, shape }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge label="source" value={source} tone={source === 'off' ? 'zinc' : 'emerald'} />
      <Badge label="fps" value={String(renderFps).padStart(2, '0')} tone={fpsTone(renderFps)} title="How smoothly the video overlay is being drawn, in frames per second" />
      <Badge label="reads/s" value={String(inferFps).padStart(2, '0')} tone={fpsTone(inferFps)} title="How many times per second your hand is being read" />
      <Badge
        wide
        label="latency"
        value={source === 'demo' ? 'sim' : `${latency.toFixed(1)}ms`}
        tone={source === 'demo' || latency === 0 ? 'zinc' : latency < 45 ? 'emerald' : 'amber'}
        title={`How long hand tracking takes on each frame. From camera to result it’s about ${e2e.toFixed(0)} ms.`}
      />
      <Badge wide label="window" value={`${(windowMs / 1000).toFixed(1)}s`} title={`The last second of movement used to read moving signs (${samples} snapshots)`} />
      <Badge wide label="shape" value={shape} />
      <Badge
        label="tracking"
        value={model === 'ready' ? `${delegate ?? ''}·${thread ?? ''}` : model}
        title={
          thread === 'worker'
            ? 'Hand tracking runs in the background, so the video stays smooth'
            : thread === 'main'
              ? 'Hand tracking shares the page with the video (background mode isn’t available in this browser)'
              : undefined
        }
        tone={model === 'ready' ? 'emerald' : model === 'error' ? 'rose' : 'amber'}
      />
    </div>
  )
}
