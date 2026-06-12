import { useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import {
  getLastPrivateThreadId,
  isValidPrivateChatThreadId,
} from '../lib/private-chat-storage'
import { supabase } from '../lib/supabase'
import { ensurePrivateChatsHydrated } from '../services/chat/private-chat-remote'

/**
 * `/` 접근 시 마지막 개인 채팅 스레드로 보내거나, 없으면 새 UUID 스레드를 만듭니다.
 */
export function PrivateChatHomeRedirect() {
  const navigate = useNavigate()
  const { profile, loading } = useAuth()

  useLayoutEffect(() => {
    if (loading) return

    let cancelled = false

    void (async () => {
      if (profile?.id) {
        await ensurePrivateChatsHydrated(supabase, profile.id)
      }
      if (cancelled) return

      try {
        const last = getLastPrivateThreadId()?.trim()
        if (last && isValidPrivateChatThreadId(last)) {
          navigate(`/chat/${last}`, { replace: true })
          return
        }
      } catch {
        /* ignore */
      }
      navigate(`/chat/${crypto.randomUUID()}`, { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [navigate, profile?.id, loading])

  return (
    <div className="flex min-h-[40vh] flex-1 items-center justify-center bg-[#FAF9F6] px-4 dark:bg-stone-950">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        대화 화면으로 이동하는 중…
      </p>
    </div>
  )
}
