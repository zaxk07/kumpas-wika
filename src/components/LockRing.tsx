interface Props {
  progress: number
  locked: boolean
  cooling?: boolean
  size?: number
}

/** Circular hold-to-lock indicator (amber while a repeat is in cooldown). */
export function LockRing({ progress, locked, cooling = false, size = 44 }: Props) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const color = locked ? '#34d399' : cooling ? '#f59e0b' : '#a3e635'
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      aria-label={`Lock progress ${Math.round(progress * 100)}%`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(63 63 70 / 0.7)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        style={{ transition: 'stroke-dashoffset 80ms linear, stroke 150ms' }}
      />
    </svg>
  )
}
