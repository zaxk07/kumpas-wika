import { motion, useReducedMotion } from 'motion/react'
import { useId, useRef, type KeyboardEvent } from 'react'

interface Props<T extends string> {
  label: string
  value: T
  options: { id: T; label: string; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}

/** Tactile segmented control: a sliding thumb follows the selection, arrow keys move it. */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md' }: Props<T>) {
  const group = useId()
  const reduced = useReducedMotion()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = options.findIndex((o) => o.id === value)
    const next = (i + dir + options.length) % options.length
    onChange(options[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className="hairline flex max-w-full rounded-lg bg-obsidian/80 p-0.5">
      {options.map((o, i) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`relative rounded-md font-medium whitespace-nowrap transition-colors active:scale-[0.97] ${
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
            } ${on ? 'text-fg' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-md border border-white/10 bg-surface-2 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
