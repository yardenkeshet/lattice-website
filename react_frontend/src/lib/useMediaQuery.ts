import { useCallback, useSyncExternalStore } from 'react'

/** Returns whether `query` currently matches; re-renders when it changes.
 *  Returns false where `matchMedia` is unavailable (e.g. jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  const getSnapshot = () =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
