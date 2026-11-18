import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assess, BEGINNER_CIRCUIT, type CoachFeedback } from '../lib/coach'
import type { EngineOutput } from '../lib/engine'
import type { SignId } from '../lib/types'

/** How long the emerald "matched" state shows before moving on to the next sign. */
const ADVANCE_MS = 1600

export interface Practice {
  queue: SignId[]
  index: number
  target: SignId
  feedback: CoachFeedback
  matched: boolean
  /** Signs matched in this queue. */
  completed: number
  finished: boolean
  start: (queue?: SignId[], index?: number) => void
  pick: (id: SignId) => void
  go: (index: number) => void
  retry: () => void
}

/**
 * Practice-mode state: a queue of target signs, live feedback on the current one, and
 * automatic advance once the recognizer locks the target.
 *
 * A match only counts once the coach is "armed", i.e. it has seen at least one frame
 * where the target was *not* latched. Otherwise a sign still held from the previous
 * target (or a retry of the same sign) would match instantly.
 */
export function usePractice(out: EngineOutput | null, enabled: boolean): Practice {
  const [queue, setQueue] = useState<SignId[]>(BEGINNER_CIRCUIT)
  const [index, setIndex] = useState(0)
  const [matchedKey, setMatchedKey] = useState<string | null>(null)
  const [completed, setCompleted] = useState<Set<SignId>>(() => new Set())
  const armed = useRef(false)
  const target = queue[index]
  const key = `${index}:${target}`
  const matched = matchedKey === key

  const reset = useCallback(() => {
    armed.current = false
    setMatchedKey(null)
  }, [])

  useEffect(() => {
    if (!enabled || matched) return
    const hit = out?.committed?.id === target || (out?.latched && out.candidate?.id === target)
    if (!hit) {
      armed.current = true
      return
    }
    if (!armed.current) return
    setMatchedKey(key)
    setCompleted((c) => new Set(c).add(target))
  }, [out, enabled, matched, target, key])

  useEffect(() => {
    if (!matched || index >= queue.length - 1) return
    const id = window.setTimeout(() => {
      reset()
      setIndex((i) => i + 1)
    }, ADVANCE_MS)
    return () => window.clearTimeout(id)
  }, [matched, index, queue.length, reset])

  const start = useCallback(
    (q: SignId[] = BEGINNER_CIRCUIT, i = 0) => {
      reset()
      setQueue(q)
      setIndex(i)
      setCompleted(new Set())
    },
    [reset],
  )

  const pick = useCallback(
    (id: SignId) => {
      const i = BEGINNER_CIRCUIT.indexOf(id)
      // Signs in the starter circuit open inside it; anything else is practiced on its own.
      start(i >= 0 ? BEGINNER_CIRCUIT : [id], Math.max(0, i))
    },
    [start],
  )

  const go = useCallback(
    (i: number) => {
      reset()
      setIndex(Math.max(0, Math.min(queue.length - 1, i)))
    },
    [queue.length, reset],
  )

  const feedback = useMemo<CoachFeedback>(
    () => (matched ? { state: 'matched', text: 'Matched', score: 1 } : assess(target, out)),
    [matched, target, out],
  )

  return {
    queue,
    index,
    target,
    feedback,
    matched,
    completed: queue.filter((id) => completed.has(id)).length,
    finished: matched && index === queue.length - 1,
    start,
    pick,
    go,
    retry: reset,
  }
}
