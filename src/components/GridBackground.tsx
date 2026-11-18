import { memo } from 'react'

const GLYPHS = ['K', 'W', 'A', 'B', 'L', 'I', 'Y', 'S', 'V', 'O']

export const GridBackground = memo(function GridBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="studio-grid-mask absolute inset-0 overflow-hidden">
        <div className="studio-grid absolute" />
      </div>
      <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-3xl" />
      {GLYPHS.map((g, i) => (
        <span
          key={i}
          className="glyph-float absolute font-mono text-5xl text-zinc-100 select-none"
          style={{
            left: `${(i * 37) % 95}%`,
            top: `${(i * 53 + 11) % 90}%`,
            animationDelay: `${-i * 1.9}s`,
          }}
        >
          {g}
        </span>
      ))}
    </div>
  )
})
