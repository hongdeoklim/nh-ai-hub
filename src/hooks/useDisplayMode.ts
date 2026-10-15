import { useCallback, useSyncExternalStore } from 'react'

/**
 * 미디어 쿼리 구독 훅 (SSR 안전). Tailwind 브레이크포인트와 동일한 px 기준을 쓴다.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = useCallback(() => false, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** 768px 이상 — 데스크톱/태블릿 가로 (Tailwind `md:`) */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}

/**
 * PWA 설치(standalone) 여부 — 앱 버전 전용 UX 분기에 사용한다.
 * iOS Safari 는 `navigator.standalone`, 그 외는 display-mode 미디어 쿼리.
 */
export function useIsStandaloneApp(): boolean {
  const displayMode = useMediaQuery(
    '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)',
  )
  const iosStandalone =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return displayMode || iosStandalone
}
