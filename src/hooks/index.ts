import { useEffect, useMemo, useState } from 'react'
import { APP_CONFIG, isDemoMode } from '@/config/app'

/** "Now" — fixed in demo mode so the storyline dates stay stable; real clock in live mode. */
export function useNow(): Date {
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (isDemoMode()) return
    const t = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => (isDemoMode() ? new Date(APP_CONFIG.demoToday) : new Date(tick)), [tick])
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const fullKey = `${APP_CONFIG.storagePrefix}.${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [fullKey, value])
  return [value, setValue]
}

/** Simple client-side pagination helper */
export function usePagination<T>(items: T[], pageSize = 15) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const slice = useMemo(() => items.slice((safePage - 1) * pageSize, safePage * pageSize), [items, safePage, pageSize])
  useEffect(() => {
    setPage(1)
  }, [items.length])
  return { page: safePage, setPage, pageCount, slice, total: items.length, pageSize }
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} · INSIGHT360`
    return () => {
      document.title = prev
    }
  }, [title])
}
