import { SECTIONS } from './sections'

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
        <p className="font-mono text-[11px] text-zinc-500">
          Kumpas <span className="text-signal">WIKA</span> · Everything runs on your device. Your camera feed never leaves this browser.
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-xs text-zinc-500 transition-colors hover:text-zinc-200">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
