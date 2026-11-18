import type { Sentence } from './grammar'
import type { SubtitleMode } from './types'

export interface CueSource {
  /** Sign lock times: media seconds for uploaded video, else epoch ms. */
  entries: { at: number; media?: number }[]
  sentence: Sentence
}

/** Minimum time a cue stays on screen, and how long it lingers after the last sign. */
const MIN_CUE_S = 1.2
const TAIL_S = 1.5
const GAP_S = 0.05

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function srtTime(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`
}

function cueText(s: Sentence, mode: SubtitleMode) {
  if (mode === 'FIL') return s.fil
  if (mode === 'EN') return s.en
  return `${s.fil}\n${s.en}`
}

/**
 * Build a SubRip (.srt) file from transcript phrases.
 *
 * When every phrase came from an uploaded video, cues use that video's playback time,
 * so the file lines up with the original clip. Otherwise (camera, captured tab, demo) the
 * cues are timed from the first sign of the session.
 */
export function buildSrt(phrases: CueSource[], mode: SubtitleMode): string {
  const usable = phrases.filter((p) => p.entries.length && p.sentence.fil)
  if (!usable.length) return ''
  const media = usable.every((p) => p.entries.every((e) => e.media != null))
  const origin = Math.min(...usable.map((p) => p.entries[0].at))
  const time = (e: { at: number; media?: number }) => (media ? e.media! : (e.at - origin) / 1000)

  const cues = usable
    .map((p) => {
      const times = p.entries.map(time)
      const start = Math.min(...times)
      const end = Math.max(start + MIN_CUE_S, Math.max(...times) + TAIL_S)
      return { start, end, text: cueText(p.sentence, mode) }
    })
    // A looped video produces repeated timestamps; keep the file in playback order.
    .sort((a, b) => a.start - b.start)

  // Never let a cue run into the next one.
  for (let i = 0; i < cues.length - 1; i++) {
    const next = cues[i + 1].start - GAP_S
    if (cues[i].end > next) cues[i].end = Math.max(cues[i].start + 0.3, next)
  }

  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n')
}

export function downloadText(filename: string, text: string, type = 'application/x-subrip') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function srtFilename(videoName: string | null) {
  if (videoName) return `${videoName.replace(/\.[^.]+$/, '') || 'video'}.srt`
  const d = new Date()
  return `kumpas-wika-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.srt`
}
