import { useEffect, useRef } from 'react'

/** Run `fn` once `value` has been stable for `ms`. Flushes the pending call on unmount. */
export function useDebouncedEffect<T>(value: T, ms: number, fn: (v: T) => void): void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const pending = useRef<{ v: T } | null>(null)
  useEffect(() => {
    pending.current = { v: value }
    const t = window.setTimeout(() => {
      pending.current = null
      fnRef.current(value)
    }, ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  useEffect(
    () => () => {
      if (pending.current) fnRef.current(pending.current.v)
    },
    []
  )
}
