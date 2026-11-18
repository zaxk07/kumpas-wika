import { memo, useEffect, useRef } from 'react'

interface Props {
  /** Stop drawing entirely (the studio is running hand tracking and needs the GPU). */
  paused: boolean
}

const CELL = 30
const GLYPHS = '+·+·+·ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const FRAME_MS = 1000 / 30
const RIPPLE = 140

/**
 * Low-opacity glyph lattice with drifting emerald / cyan signal glows and a cursor ripple.
 *
 * Cost control: renders at <= 30 fps, DPR capped at 1.5, only while on screen, the tab
 * is visible, and `paused` is false. Under reduced motion it draws a single still frame.
 */
export const GlyphBackground = memo(function GlyphBackground({ paused }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const pausedRef = useRef(paused)
  const wakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    pausedRef.current = paused
    wakeRef.current()
  }, [paused])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let cols = 0
    let rows = 0
    let seeds: number[] = []
    let raf = 0
    let last = 0
    let onScreen = true
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 }
    const t0 = performance.now()

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = r.width
      h = r.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / CELL) + 1
      rows = Math.ceil(h / CELL) + 1
      seeds = Array.from({ length: cols * rows }, (_, i) => {
        const s = Math.sin(i * 12.9898) * 43758.5453
        return s - Math.floor(s)
      })
    }

    const draw = (now: number) => {
      const t = (now - t0) / 1000
      ctx.clearRect(0, 0, w, h)

      // Signal glows: two emerald, one cyan, slow Lissajous drift.
      const glows: [number, number, number, string][] = [
        [w * (0.3 + 0.12 * Math.sin(t * 0.07)), h * (0.35 + 0.1 * Math.cos(t * 0.09)), Math.max(w, h) * 0.45, '16 185 129'],
        [w * (0.78 + 0.08 * Math.cos(t * 0.05)), h * (0.25 + 0.12 * Math.sin(t * 0.06)), Math.max(w, h) * 0.35, '34 211 238'],
        [w * (0.6 + 0.15 * Math.sin(t * 0.04 + 2)), h * (0.75 + 0.08 * Math.cos(t * 0.08)), Math.max(w, h) * 0.3, '16 185 129'],
      ]
      for (const [x, y, r, c] of glows) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgb(${c} / 0.07)`)
        g.addColorStop(1, `rgb(${c} / 0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }

      mouse.x += (mouse.tx - mouse.x) * 0.18
      mouse.y += (mouse.ty - mouse.y) * 0.18

      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i
          const seed = seeds[k]
          let x = i * CELL
          let y = j * CELL
          // Glow proximity lifts opacity.
          let lift = 0
          for (const [gx, gy, gr] of glows) {
            const d = Math.hypot(x - gx, y - gy) / gr
            if (d < 1) lift = Math.max(lift, 1 - d)
          }
          const dx = x - mouse.x
          const dy = y - mouse.y
          const dist = Math.hypot(dx, dy)
          let ripple = 0
          if (dist < RIPPLE) {
            const f = 1 - dist / RIPPLE
            ripple = f * f
            const push = ripple * 6 * Math.sin(dist * 0.09 - t * 4)
            x += (dx / (dist || 1)) * push
            y += (dy / (dist || 1)) * push
          }
          const twinkle = 0.5 + 0.5 * Math.sin(t * 0.6 + seed * 20)
          const alpha = 0.04 + lift * 0.09 * twinkle + ripple * 0.35
          // Rare letter glyphs, otherwise lattice marks; letters rotate slowly over time.
          const g = seed > 0.93 ? GLYPHS[6 + Math.floor((seed * 1000 + t * 0.3) % 36)] : GLYPHS[k % 6]
          ctx.fillStyle = ripple > 0.05 || lift > 0.6 ? `rgb(110 231 183 / ${alpha})` : `rgb(250 250 250 / ${alpha})`
          ctx.fillText(g, x, y)
        }
      }
    }

    const running = () => !reduced && onScreen && !pausedRef.current && document.visibilityState === 'visible'

    const loop = (now: number) => {
      raf = 0
      if (!running()) return
      if (now - last >= FRAME_MS) {
        last = now
        draw(now)
      }
      raf = requestAnimationFrame(loop)
    }

    const wake = () => {
      if (!raf && running()) raf = requestAnimationFrame(loop)
    }
    wakeRef.current = wake

    const ro = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
    ro.observe(canvas)

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      wake()
    })
    io.observe(canvas)

    const onVis = () => wake()
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      mouse.tx = e.clientX - r.left
      mouse.ty = e.clientY - r.top
      if (mouse.x < -1000) {
        mouse.x = mouse.tx
        mouse.y = mouse.ty
      }
    }
    const onLeave = () => {
      mouse.tx = -9999
      mouse.ty = -9999
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    resize()
    draw(performance.now())
    wake()

    return () => {
      cancelAnimationFrame(raf)
      wakeRef.current = () => {}
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div aria-hidden className="glyph-mask pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas ref={ref} className="h-full w-full" />
    </div>
  )
})
