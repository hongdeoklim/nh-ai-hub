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
      className="app-shell fixed inset-x-[12px] bottom-[calc(var(--app-bottom-nav,0px)+12px)] z-[100] flex justify-end md:inset-x-auto md:bottom-[24px] md:right-[24px]"
    >
      <div className="flex w-full max-w-[420px] items-center gap-[12px] rounded-[16px] border border-border bg-surface/95 px-[16px] py-[12px] shadow-pop backdrop-blur-md">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-fg">
          새로운 버전이 출시되었습니다.
        </p>
        <div className="flex shrink-0 items-center gap-[8px]">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="h-[34px] rounded-[10px] px-[10px] text-xs font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="h-[34px] rounded-[10px] bg-brand px-[12px] text-xs font-semibold text-brand-fg shadow-card transition hover:bg-brand-strong"
          >
            업데이트
          </button>
        </div>
      </div>
    </div>
  )
}
