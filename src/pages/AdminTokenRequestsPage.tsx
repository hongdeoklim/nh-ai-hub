import { startTransition, useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { AdminPageHeader } from '../components/auth/admin/AdminPageHeader'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminPageRoot,
  adminTableWrap,
} from '../components/auth/admin/admin-ui'
import { useAuth } from '../components/auth/useAuth'
import { isAdminProfile } from '../lib/admin-access'
import { supabase } from '../lib/supabase'
import { logAdminActivity } from '../services/admin/activity-log'
import {
  fetchPendingTokenAllocationRequestsAdmin,
  updateTokenAllocationRequestAdmin,
  type TokenAllocationRequestRow,
} from '../services/token-allocation-requests'

function requesterLabel(row: TokenAllocationRequestRow): string {
  const name = row.users?.display_name?.trim()
  const email = row.users?.email?.trim()
  if (name && email) return `${name} (${email})`
  if (name) return name
  if (email) return email
  return row.user_id
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function AdminTokenRequestsPage() {
  const { profile, loading } = useAuth()
  const [rows, setRows] = useState<TokenAllocationRequestRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({})
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoadError(null)
    const res = await fetchPendingTokenAllocationRequestsAdmin(supabase)
    if (!res.ok) {
      setLoadError(res.message)
      setRows([])
      return
    }
    startTransition(() => {
      setRows(res.rows)
      setGrantAmounts((prev) => {
        const next = { ...prev }
        for (const row of res.rows) {
          if (next[row.id] == null) next[row.id] = '100000'
        }
        return next
      })
    })
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  if (loading && !profile) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        불러오는 중…
      </div>
    )
  }

  if (!isAdminProfile(profile)) {
    return <Navigate to="/" replace />
  }

  async function grantTokens(userId: string, delta: number): Promise<string | null> {
    const { data, error: rpcErr } = await supabase.rpc('admin_increment_user_token_limit', {
      p_user_id: userId,
      p_delta: delta,
    })
    if (rpcErr) return rpcErr.message
    const payload = data as { ok?: boolean; error?: string } | null
    if (!payload?.ok) return payload?.error ?? '토큰 부여에 실패했습니다.'
    return null
  }

  async function approve(row: TokenAllocationRequestRow) {
    const trimmed = (grantAmounts[row.id] ?? '').trim()
    if (!trimmed) {
      window.alert('승인 시 부여할 토큰량을 입력해 주세요.')
      return
    }
    const delta = Number(trimmed)
    if (!Number.isFinite(delta) || delta <= 0 || !Number.isInteger(delta)) {
      window.alert('토큰량은 1 이상의 정수만 입력할 수 있습니다.')
      return
    }

    const notes = adminNotes[row.id]?.trim() ?? ''

    setBusyId(row.id)
    try {
      const grantErr = await grantTokens(row.user_id, delta)
      if (grantErr) {
        window.alert(grantErr)
        return
      }
      await logAdminActivity(
        'token_grant',
        `${requesterLabel(row)} — 할당 요청 승인 · 토큰 ${delta.toLocaleString('ko-KR')} 부여`,
      )

      const res = await updateTokenAllocationRequestAdmin(supabase, {
        id: row.id,
        status: 'approved',
        admin_notes: notes,
      })
      if (!res.ok) {
        window.alert(res.message)
        return
      }
      setGrantAmounts((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      setAdminNotes((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function reject(row: TokenAllocationRequestRow) {
    const notes = adminNotes[row.id]?.trim() ?? ''
    setBusyId(row.id)
    try {
      const res = await updateTokenAllocationRequestAdmin(supabase, {
        id: row.id,
        status: 'rejected',
        admin_notes: notes,
      })
      if (!res.ok) {
        window.alert(res.message)
        return
      }
      setAdminNotes((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={adminPageRoot}>
      <AdminPageHeader
        title="토큰 할당 요청"
        description="직원이 추가 토큰을 요청하면 여기서 검토합니다. 승인 시 토큰량을 입력하면 한도에 바로 반영됩니다."
        actions={
          <button type="button" onClick={() => void load()} className={adminBtnSecondary}>
            새로고침
          </button>
        }
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <p>
          승인 시 입력한 토큰량이 요청자의{' '}
          <span className="font-medium text-slate-800 dark:text-slate-100">token_limit</span>
          에 즉시 더해집니다.{' '}
          <Link
            to="/admin/employees"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
          >
            직원 관리
          </Link>
          에서도 일괄 부여할 수 있습니다.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            대기 중인 요청이 없습니다
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            직원이 토큰 부족 시 요청을 보내면 이 목록에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className={adminTableWrap}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {requesterLabel(row)}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatWhen(row.created_at)}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {row.message}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:max-w-xs">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      부여 토큰량
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={grantAmounts[row.id] ?? '100000'}
                        disabled={busyId === row.id}
                        onChange={(e) =>
                          setGrantAmounts((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      관리자 메모 (선택)
                      <input
                        type="text"
                        value={adminNotes[row.id] ?? ''}
                        disabled={busyId === row.id}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }))
                        }
                        placeholder="승인·거부 사유"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void approve(row)}
                        className={adminBtnPrimary}
                      >
                        {busyId === row.id ? '처리 중…' : '승인'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void reject(row)}
                        className={adminBtnSecondary}
                      >
                        거부
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
