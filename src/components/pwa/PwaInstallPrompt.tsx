import { useEffect, useState } from 'react'

const HIDE_PWA_PROMPT_KEY = 'nh_ai_hub_hide_pwa_prompt_until'

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e)

      // Check if we should show it
      const hideUntilStr = localStorage.getItem(HIDE_PWA_PROMPT_KEY)
      if (hideUntilStr) {
        const hideUntil = parseInt(hideUntilStr, 10)
        if (Date.now() < hideUntil) {
          return // Still hidden
        }
      }

      // Show the prompt
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const hideForDays = (days: number) => {
    const hideUntil = Date.now() + days * 24 * 60 * 60 * 1000
    localStorage.setItem(HIDE_PWA_PROMPT_KEY, hideUntil.toString())
    setShowPrompt(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return

    // Show the install prompt
    deferredPrompt.prompt()
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt')
    } else {
      console.log('User dismissed the install prompt')
    }
    
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div className="app-shell fixed inset-x-[12px] bottom-[calc(var(--app-bottom-nav,0px)+12px)] z-[90] md:inset-x-auto md:bottom-[24px] md:right-[24px] md:w-[352px]">
      <div className="flex flex-col gap-[12px] rounded-[16px] border border-border bg-surface/95 p-[16px] shadow-pop backdrop-blur-md">
        <div className="flex items-start gap-[12px]">
          <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] bg-brand-soft">
            <svg
              className="h-[22px] w-[22px] text-brand"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-fg">
              NH-AX-HUB 앱 설치
            </h3>
            <p className="mt-[4px] text-xs text-fg-muted">
              앱으로 설치하면 바탕화면에서 더 빠르고 편리하게 접속할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-[8px]">
          <button
            type="button"
            onClick={handleInstall}
            className="h-[40px] w-full rounded-[10px] bg-brand px-[14px] text-sm font-semibold text-brand-fg shadow-card transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
          >
            앱 설치하기
          </button>
          
          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={() => hideForDays(1)}
              className="h-[34px] flex-1 rounded-[10px] bg-surface-2 px-[10px] text-xs font-medium text-fg-muted transition hover:bg-surface-3 hover:text-fg"
            >
              오늘 하루 보지 않기
            </button>
            <button
              type="button"
              onClick={() => hideForDays(7)}
              className="h-[34px] flex-1 rounded-[10px] bg-surface-2 px-[10px] text-xs font-medium text-fg-muted transition hover:bg-surface-3 hover:text-fg"
            >
              7일 동안 보지 않기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
