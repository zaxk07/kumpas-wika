import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { clampRoi, type Roi } from '../../lib/roi'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  roi: Roi
  onChange: (r: Roi) => void
  /** Editable (handles + drag) or just showing the applied crop. */
  editing: boolean
}

type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number; start: Roi }

/**
 * Crop selector drawn over a letterboxed (object-contain) video. The region is stored in
 * normalized video coordinates, so it maps 1:1 onto the frames sent to the recognizer.
 * Drag the box to move it, the corners to resize; arrow keys nudge it (Shift resizes).
 */
export function RoiCropper({ videoRef, roi, onChange, editing }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState({ ox: 0, oy: 0, cw: 1, ch: 1 })
  const drag = useRef<Drag | null>(null)

  // Where the video content actually sits inside the element (object-fit: contain).
  useEffect(() => {
    const el = boxRef.current
    const video = videoRef.current
    if (!el || !video) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const vw = video.videoWidth || 16
      const vh = video.videoHeight || 9
      const s = Math.min(w / vw, h / vh)
      setRect({ ox: (w - vw * s) / 2, oy: (h - vh * s) / 2, cw: vw * s, ch: vh * s })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    video.addEventListener('resize', measure)
    video.addEventListener('loadedmetadata', measure)
    return () => {
      ro.disconnect()
      video.removeEventListener('resize', measure)
      video.removeEventListener('loadedmetadata', measure)
    }
  }, [videoRef])

  const begin = (mode: Drag['mode']) => (e: RPointerEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, start: roi }
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / rect.cw
    const dy = (e.clientY - d.y) / rect.ch
    const s = d.start
    let r: Roi
    if (d.mode === 'move') r = { ...s, x: s.x + dx, y: s.y + dy }
    else {
      const left = d.mode === 'nw' || d.mode === 'sw'
      const top = d.mode === 'nw' || d.mode === 'ne'
      const x0 = left ? Math.min(s.x + dx, s.x + s.w - 0.08) : s.x
      const y0 = top ? Math.min(s.y + dy, s.y + s.h - 0.08) : s.y
      const x1 = left ? s.x + s.w : s.x + s.w + dx
      const y1 = top ? s.y + s.h : s.y + s.h + dy
      r = { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(1, x1) - Math.max(0, x0), h: Math.min(1, y1) - Math.max(0, y0) }
    }
    onChange(clampRoi(r))
  }
  const end = () => {
    drag.current = null
  }
  const onKey = (e: KeyboardEvent) => {
    const step = 0.01
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!k) return
    e.preventDefault()
    onChange(clampRoi(e.shiftKey ? { ...roi, w: roi.w + k[0], h: roi.h + k[1] } : { ...roi, x: roi.x + k[0], y: roi.y + k[1] }))
  }

  const left = rect.ox + roi.x * rect.cw
  const top = rect.oy + roi.y * rect.ch
  const width = roi.w * rect.cw
  const height = roi.h * rect.ch
  const handle = 'absolute size-3.5 rounded-sm border-2 border-emerald-300 bg-obsidian'

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0" data-testid="roi-cropper">
      <div
        role={editing ? 'group' : undefined}
        aria-label={editing ? 'Crop region. Drag to move, drag corners to resize, arrow keys nudge, Shift plus arrows resizes.' : undefined}
        tabIndex={editing ? 0 : -1}
        onKeyDown={editing ? onKey : undefined}
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className={`absolute rounded-md outline-none ${editing ? 'pointer-events-auto cursor-move touch-none border-2 border-emerald-400 focus-visible:border-emerald-200' : 'border border-emerald-400/50'}`}
        style={{ left, top, width, height, boxShadow: `0 0 0 9999px rgb(9 9 11 / ${editing ? 0.6 : 0.35})` }}
      >
        <span className="absolute -top-6 left-0 rounded bg-obsidian/90 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-emerald-300 uppercase">
          {editing ? 'Drag to fit the video player' : 'Reading this area only'}
        </span>
        {editing &&
          (['nw', 'ne', 'sw', 'se'] as const).map((c) => (
            <span
              key={c}
              onPointerDown={begin(c)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className={`${handle} ${c[0] === 'n' ? '-top-2' : '-bottom-2'} ${c[1] === 'w' ? '-left-2' : '-right-2'} ${
                c === 'nw' || c === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
              }`}
            />
          ))}
      </div>
    </div>
  )
}
