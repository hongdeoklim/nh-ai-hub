import { useEffect, useRef } from 'react'

const STATE_KEY = '__nhOverlay'

/**
 * 오버레이(시트·드로어·팔레트)가 열리면 history 엔트리를 하나 push 해서
 * Android 뒤로가기 / 브라우저 뒤로가기 / iOS 스와이프 백으로 닫히게 한다 (앱 UX).
 * 프로그램적으로 닫힐 때 우리 엔트리가 최상단이면 되감는다.
 */
export function useBackCloseable(open: boolean, onClose: () => void) {
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) {
      if (pushedRef.current) {
        pushedRef.current = false
        const state = window.history.state as Record<string, unknown> | null
        if (state && state[STATE_KEY]) window.history.back()
      }
      return
    }

    // StrictMode 의 effect 재실행에도 엔트리를 한 번만 push 한다
    if (!pushedRef.current) {
      window.history.pushState({ ...(window.history.state ?? {}), [STATE_KEY]: true }, '')
      pushedRef.current = true
    }

    function onPopState() {
      if (!pushedRef.current) return
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [open])
}
