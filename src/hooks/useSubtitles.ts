import { useCallback, useEffect, useRef, useState } from 'react'
import { glossToSentence, groupGlosses, type Sentence } from '../lib/grammar'
import type { Detection, SignId, SubtitleMode } from '../lib/types'

/** Pause after the last locked sign before the phrase is finalized into a sentence. */
export const FINALIZE_MS = 2000

export interface GlossEntry {
  key: number
  id: SignId
  at: number // epoch ms
  confidence: number
}

export interface Phrase {
  key: number
  entries: GlossEntry[]
  closed: boolean
  /** Natural sentence, set when the phrase is finalized. */
  final?: Sentence
}

let keySeq = 1

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  const voices = speechSynthesis.getVoices()
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase())
  if (exact) return exact
  // Filipino voices may be tagged fil-PH, fil or tl-PH; never fall back to "fi" (Finnish).
  if (lang.startsWith('fil')) return voices.find((v) => /^(fil|tl)\b/i.test(v.lang)) ?? null
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) ?? null
}

function say(text: string, lang: string) {
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(lang)
  u.lang = voice?.lang ?? lang
  if (voice) u.voice = voice
  speechSynthesis.speak(u)
}

/** Speak a finalized natural sentence (not the individual choppy glosses). */
export function speakSentence(s: Sentence, mode: SubtitleMode) {
  if (typeof speechSynthesis === 'undefined' || !s.fil) return
  if (mode !== 'EN') say(s.fil, 'fil-PH')
  if (mode !== 'FIL') say(s.en, 'en-US')
}

export function phraseSentence(p: Phrase): Sentence {
  return p.final ?? glossToSentence(groupGlosses(p.entries))
}

export function useSubtitles(mode: SubtitleMode, autoSpeak: boolean) {
  const [phrases, setPhrases] = useState<Phrase[]>([])
  // Logic reads/writes the ref; React renders from state. Keeps side effects (speech) out of updaters.
  const ref = useRef<Phrase[]>([])
  /**
   * Phrase timing runs on the *source* clock (camera performance.now() or the
   * simulated demo clock) so a slow device can't split a phrase just because
   * frames arrive late. When the source stops, the caller flushes the phrase.
   */
  const srcLast = useRef<number | null>(null) // source time of the last locked sign
  const srcNow = useRef(0) // latest source tick
  const settings = useRef({ mode, autoSpeak })
  useEffect(() => {
    settings.current = { mode, autoSpeak }
  }, [mode, autoSpeak])

  const commit = useCallback((next: Phrase[]) => {
    ref.current = next.slice(-200)
    setPhrases(ref.current)
  }, [])

  const finalizeOpen = useCallback(() => {
    const cur = ref.current
    const last = cur[cur.length - 1]
    if (!last || last.closed) return
    const final = glossToSentence(groupGlosses(last.entries))
    commit([...cur.slice(0, -1), { ...last, closed: true, final }])
    if (settings.current.autoSpeak) speakSentence(final, settings.current.mode)
  }, [commit])

  /** Called by the detection loop on every processed frame with the source clock. */
  const tick = useCallback(
    (t: number) => {
      srcNow.current = t
      const last = srcLast.current
      if (last == null) return
      // Finalize (punctuate + speak) after a FINALIZE_MS pause; a clock restart (source switch) also closes the phrase.
      if (t - last >= FINALIZE_MS || t < last) {
        srcLast.current = null
        finalizeOpen()
      }
    },
    [finalizeOpen],
  )

  /** Close the open phrase now (e.g. the camera was stopped or Demo Mode turned off). */
  const flush = useCallback(() => {
    srcLast.current = null
    finalizeOpen()
  }, [finalizeOpen])

  const push = useCallback(
    (d: Detection, t: number) => {
      const now = Date.now()
      const prevT = srcLast.current
      if (prevT != null && (t - prevT >= FINALIZE_MS || t < prevT)) finalizeOpen()
      srcLast.current = t
      srcNow.current = t
      const entry: GlossEntry = { key: keySeq++, id: d.id, at: now, confidence: d.confidence }
      const cur = ref.current
      const last = cur[cur.length - 1]
      if (!last || last.closed) commit([...cur, { key: keySeq++, entries: [entry], closed: false }])
      else commit([...cur.slice(0, -1), { ...last, entries: [...last.entries, entry] }])
    },
    [commit, finalizeOpen],
  )

  const backspace = useCallback(() => {
    const cur = ref.current
    const last = cur[cur.length - 1]
    if (!last) return
    const entries = last.entries.slice(0, -1)
    // Reopen the phrase and restart its pause timer.
    srcLast.current = entries.length ? srcNow.current : null
    commit(entries.length ? [...cur.slice(0, -1), { ...last, entries, closed: false, final: undefined }] : cur.slice(0, -1))
  }, [commit])

  const clear = useCallback(() => {
    commit([])
    srcLast.current = null
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }, [commit])

  return { phrases, push, tick, flush, backspace, clear }
}
