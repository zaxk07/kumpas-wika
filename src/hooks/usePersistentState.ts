import { useEffect, useState } from 'react'

/** useState that remembers a per-viewer preference in localStorage (silently skipped when storage is unavailable). */
export function usePersistentState<T>(key: string, initial: T, valid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial
      const parsed: unknown = JSON.parse(raw)
      return !valid || valid(parsed) ? (parsed as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage blocked */
    }
  }, [key, value])
  return [value, setValue] as const
}
