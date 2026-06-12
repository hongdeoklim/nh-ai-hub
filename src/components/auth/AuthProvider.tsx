import type { Session } from '@supabase/supabase-js'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { supabase } from '../../lib/supabase'
import { setChatMessageFeedbackUser } from '../../lib/chat-message-feedback'
import { setPrivateChatStorageUser } from '../../lib/private-chat-storage'
import {
  ensurePrivateChatsHydrated,
  resetPrivateChatHydrationCache,
} from '../../services/chat/private-chat-remote'
import type { AppUserProfile } from './auth-context'
import { AuthContext } from './auth-context'

async function fetchProfileRow(userId: string): Promise<AppUserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, email, display_name, department, job_rank, job_title, phone, role, preferred_ai, token_limit, current_token_usage, is_admin',
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[AuthProvider] users 조회 실패', error)
    return null
  }
  if (!data) {
    return null
  }

  const row = data as AppUserProfile & { is_admin?: boolean }
  return {
    ...row,
    is_admin: Boolean(row.is_admin),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AppUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const hydrateProfile = useCallback(async (userId: string) => {
    setProfileError(null)
    let row = await fetchProfileRow(userId)
    if (!row) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      row = await fetchProfileRow(userId)
    }
    if (!row) {
      setProfileError(
        '직원 프로필(public.users)을 불러오지 못했습니다. 방금 가입했다면 잠시 후 다시 시도하거나 관리자에게 문의하세요.',
      )
      setProfile(null)
      setPrivateChatStorageUser(null)
      setChatMessageFeedbackUser(null)
      resetPrivateChatHydrationCache(userId)
      return
    }
    setProfile(row)
    setPrivateChatStorageUser(userId)
    setChatMessageFeedbackUser(userId)
    void ensurePrivateChatsHydrated(supabase, userId)
  }, [])

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) {
      setProfile(null)
      setProfileError(null)
      return
    }
    await hydrateProfile(uid)
  }, [session?.user?.id, hydrateProfile])

  useEffect(() => {
    let cancelled = false

    async function applySession(next: Session | null) {
      if (cancelled) return
      setSession(next)
      if (!next?.user?.id) {
        setProfile(null)
        setProfileError(null)
        setPrivateChatStorageUser(null)
        setChatMessageFeedbackUser(null)
        resetPrivateChatHydrationCache()
        return
      }
      await hydrateProfile(next.user.id)
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      void applySession(data.session ?? null).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void applySession(newSession)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [hydrateProfile])

  const signOut = useCallback(async () => {
    const uid = session?.user?.id
    await supabase.auth.signOut()
    setProfile(null)
    setProfileError(null)
    setPrivateChatStorageUser(null)
    setChatMessageFeedbackUser(null)
    if (uid) resetPrivateChatHydrationCache(uid)
  }, [session?.user?.id])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      profileError,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, profileError, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
