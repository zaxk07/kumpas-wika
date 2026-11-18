import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

interface Props {
  progress: number
  locked: boolean
  cooling?: boolean
  size?: number
}

/** Circular hold-to-lock confidence ring (amber while a repeat is in cooldown); springs when a sign locks. */
export function LockRing({ progress, locked, cooling = false, size = 44 }: Props) {
  const reduced = useReducedMotion()
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const color = locked ? '#10b981' : cooling ? '#f59e0b' : '#a3e635'
  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      animate={locked && !reduced ? { scale: [1, 1.14, 1] } : { scale: 1 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {locked && !reduced && (
          <motion.span
            className="absolute inset-0 rounded-full border border-emerald-400/60"
            initial={{ opacity: 0.8, scale: 0.9 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-label={`Lock progress ${Math.round(progress * 100)}%`}>
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
          style={{ transition: 'stroke-dashoffset 80ms linear, stroke 150ms', filter: locked ? 'drop-shadow(0 0 4px rgb(16 185 129 / 0.6))' : undefined }}
        />
      </svg>
    </motion.div>
  )
}
