import { useRegisterSW } from 'virtual:pwa-register/react'

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('[PWA] Service Worker 등록 실패:', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] flex justify-end md:inset-x-auto md:right-4 md:bottom-4 scale-[0.70] origin-bottom md:origin-bottom-right transition-transform"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-stone-200/90 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-stone-800 dark:text-stone-100">
          새로운 버전이 출시되었습니다.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="rounded-lg bg-orange-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500"
          >
            업데이트
          </button>
        </div>
      </div>
    </div>
  )
}
