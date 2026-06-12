import type { AppUserProfile } from '../components/auth/auth-context'

/** role 텍스트 또는 is_admin 플래그로 관리자 여부 판별 */
export function isAdminProfile(profile: AppUserProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.is_admin) return true
  const r = profile.role?.trim().toLowerCase()
  return r === 'admin'
}
