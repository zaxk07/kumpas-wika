interface Props {
  index: string
  kicker: string
  title: string
  lede?: string
}

/** Editorial section opener: mono index, title, lede. */
export function SectionHeader({ index, kicker, title, lede }: Props) {
  return (
    <header className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase md:pt-2">
        <span className="text-signal">{index}</span>
        <span className="h-px w-6 bg-zinc-700" />
        {kicker}
      </div>
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-balance text-fg sm:text-[2rem] sm:leading-tight">{title}</h2>
        {lede && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-zinc-400 sm:text-base">{lede}</p>}
      </div>
    </header>
  )
}
