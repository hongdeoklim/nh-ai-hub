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
    <div className="fixed bottom-4 left-4 right-4 z-[9999] md:left-auto md:right-8 md:bottom-8 md:w-[22rem] scale-[0.70] origin-bottom md:origin-bottom-right transition-transform">
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-stone-700/80 dark:bg-stone-900/95">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/40">
            <svg
              className="h-6 w-6 text-orange-700 dark:text-orange-400"
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
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50">
              NH-AX-HUB 앱 설치
            </h3>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              앱으로 설치하면 바탕화면에서 더 빠르고 편리하게 접속할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleInstall}
            className="w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:bg-orange-700 dark:hover:bg-orange-600"
          >
            앱 설치하기
          </button>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => hideForDays(1)}
              className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              오늘 하루 보지 않기
            </button>
            <button
              type="button"
              onClick={() => hideForDays(7)}
              className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              7일 동안 보지 않기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
