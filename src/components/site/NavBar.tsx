import { ArrowUpRight, Captions, Menu, Route, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { SECTIONS } from './sections'

/** Track which anchored section currently sits under the nav. */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        setActive(SECTIONS.find((s) => seen.get(s.id))?.id ?? null)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])
  return active
}

export function NavBar({ onLaunch, onTour }: { onLaunch: () => void; onTour: () => void }) {
  const active = useActiveSection()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <nav className="sticky top-0 z-40 border-b border-white/[0.08] bg-obsidian/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Kumpas WIKA, back to top">
          <span className="grid size-7 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Captions size={15} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-fg">
            Kumpas <span className="text-signal">WIKA</span>
          </span>
        </a>

        <ul className="ml-6 hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? 'location' : undefined}
                className={`relative rounded-full px-3 py-1.5 text-[13px] transition-colors ${active === s.id ? 'text-fg' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {active === s.id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full border border-white/[0.08] bg-white/[0.04]"
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">{s.label}</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onTour}
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-zinc-300 transition-colors hover:text-fg sm:inline-flex"
          >
            <Route size={14} /> Start tutorial
          </button>
          <button
            type="button"
            onClick={onLaunch}
            className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-medium text-obsidian transition hover:bg-white active:scale-[0.97]"
          >
            <span className="sm:hidden">Launch</span>
            <span className="hidden sm:inline">Launch Live Translator</span>
            <ArrowUpRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid size-8 place-items-center rounded-full border border-white/[0.08] text-zinc-300 lg:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            id="mobile-nav"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-white/[0.08] px-4 py-2 lg:hidden"
          >
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between py-2.5 text-sm text-zinc-300"
                >
                  {s.label}
                  <span className="font-mono text-[11px] text-zinc-600">0{i + 1}</span>
                </a>
              </li>
            ))}
            <li className="sm:hidden">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onTour()
                }}
                className="flex w-full items-center gap-2 py-2.5 text-sm text-emerald-300"
              >
                <Route size={14} /> Start tutorial
              </button>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </nav>
  )
}
