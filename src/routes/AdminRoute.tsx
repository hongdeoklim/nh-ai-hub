import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import { isAdminProfile } from '../lib/admin-access'

function AdminBootSpinner() {
  return (
    <div className="admin-shell flex min-h-dvh w-full items-center justify-center bg-bg">
      <p className="text-sm font-medium text-fg-muted">
        관리자 콘솔을 불러오는 중…
      </p>
    </div>
  )
}

export function AdminRoute() {
  const { profile, loading } = useAuth()

  if (loading && !profile) {
    return <AdminBootSpinner />
  }

  if (!isAdminProfile(profile)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
