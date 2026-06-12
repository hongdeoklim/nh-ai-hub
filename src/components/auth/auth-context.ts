import type { Session } from '@supabase/supabase-js'
import { createContext } from 'react'

export type AppUserProfile = {
  id: string
  email: string
  display_name: string | null
  department: string | null
  job_rank: string | null
  job_title: string | null
  phone: string | null
  role: string | null
  preferred_ai: string | null
  token_limit: number
  current_token_usage: number
  is_admin: boolean
}

export type AuthContextValue = {
  session: Session | null
  profile: AppUserProfile | null
  loading: boolean
  profileError: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
