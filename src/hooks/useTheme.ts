import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'nh_theme'
const CHANGE_EVENT = 'nh:theme-change'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return 'system'
}

function subscribePreference(onChange: () => void) {
  window.addEventListener('storage', onChange)
  // 같은 탭의 다른 useTheme 인스턴스와 동기화
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function subscribeSystemDark(onChange: () => void) {
  const mql = window.matchMedia(DARK_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSystemDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
  if (meta) meta.content = dark ? '#0e1211' : '#f5f7f4'
}

/**
 * 테마 상태 — `index.html` 부트 스크립트와 동일한 `nh_theme` 키를 공유한다.
 * `.dark` 클래스가 단일 진실 공급원이며, 시스템 설정 변경을 실시간 반영한다.
 */
export function useTheme() {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    () => 'system' as ThemePreference,
  )
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false)
  const isDark = preference === 'dark' || (preference === 'system' && systemDark)

  useEffect(() => {
    applyTheme(isDark)
  }, [isDark])

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const toggle = useCallback(() => {
    setPreference(isDark ? 'light' : 'dark')
  }, [isDark, setPreference])

  return { preference, isDark, setPreference, toggle }
}
