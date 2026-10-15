import { toast } from 'sonner'
import { startTransition, useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'

type EmployeeRow = {
 id: string
 email: string
 display_name: string | null
 department: string | null
 token_limit: number
 current_token_usage: number
}

export function UserTokenManager() {
 const [rows, setRows] = useState<EmployeeRow[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [busyId] = useState<string | null>(null)
 const [modalUser, setModalUser] = useState<EmployeeRow | null>(null)
 const [grantAmount, setGrantAmount] = useState('')
 const [grantBusy, setGrantBusy] = useState(false)

 const load = useCallback(async () => {
 setError(null)
 setLoading(true)
 const { data, error: qErr } = await supabase
      .from('users')
      .select(
        'id, email, display_name, department, token_limit, current_token_usage',
      )
      .order('display_name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true })

 if (qErr) {
 setError(qErr.message)
 setRows([])
    } else {
 startTransition(() => setRows((data ?? []) as EmployeeRow[]))
    }
 setLoading(false)
  }, [])

 useEffect(() => {
 queueMicrotask(() => void load())
  }, [load])

 function openGrantModal(user: EmployeeRow) {
 setModalUser(user)
 setGrantAmount('100000')
  }

 function closeModal() {
 if (grantBusy) return
 setModalUser(null)
 setGrantAmount('')
  }

 async function submitGrant() {
 if (!modalUser) return
 const delta = Number(grantAmount.trim())
 if (!Number.isFinite(delta) || delta <= 0 || !Number.isInteger(delta)) {
 toast.error('양의 정수만 입력해 주세요.')
 return
    }

 setGrantBusy(true)
 try {
 const { data, error: rpcErr } = await supabase.rpc(
        'admin_increment_user_token_limit',
        { p_user_id: modalUser.id, p_delta: delta },
      )
 if (rpcErr) {
 toast.error(rpcErr.message)
 return
      }
 const payload = data as { ok?: boolean; error?: string } | null
 if (!payload?.ok) {
 toast.error(payload?.error ?? '업데이트 실패')
 return
      }
 closeModal()
 await load()
    } finally {
 setGrantBusy(false)
    }
  }

 function displayName(row: EmployeeRow): string {
 const n = row.display_name?.trim()
 if (n && n.length > 0) return n
 return row.email
  }

 const pct = (used: number, limit: number) => {
 if (!limit || limit <= 0) return 0
 return Math.min(100, Math.round((used / limit) * 100))
  }

 return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">
 직원·토큰 관리
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
 전 직원의 월간 한도와 사용량을 확인하고, 필요 시 추가 한도를 부여합니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="border-b border-border bg-bg text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">부서</th>
                <th className="px-4 py-3">사용량 / 한도</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-fg-subtle">
 불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-fg-subtle">
 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
 rows.map((u) => {
 const used = Number(u.current_token_usage)
 const limit = Number(u.token_limit)
 const p = pct(used, limit)
 return (
                    <tr
 key={u.id}
 className="hover:bg-surface-2/80"
                    >
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate font-semibold text-fg">
                          {displayName(u)}
                        </p>
                        <p className="truncate text-xs text-fg-subtle">
                          {u.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-fg-muted">
                        {(u.department ?? '').trim() || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 sm:max-w-xs">
                          <div className="flex justify-between text-xs tabular-nums text-fg-muted">
                            <span>
                              {used.toLocaleString('ko-KR')} /{' '}
                              {limit.toLocaleString('ko-KR')}
                            </span>
                            <span className="font-semibold text-fg">
                              {p}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
 className={`h-full rounded-full transition-[width] ${
 p >= 90
                                  ? 'bg-rose-500'
                                  : p >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                              }`}
 style={{ width: `${p}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
 type="button"
 disabled={busyId === u.id}
 onClick={() => openGrantModal(u)}
 className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent disabled:opacity-50"
                        >
                          + 토큰 부여
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalUser ? (
        <div
 className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
 role="presentation"
 onClick={() => closeModal()}
        >
          <div
 role="dialog"
 aria-modal="true"
 aria-labelledby="grant-modal-title"
 className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
 onClick={(e) => e.stopPropagation()}
          >
            <h2
 id="grant-modal-title"
 className="text-lg font-bold text-fg"
            >
 토큰 한도 부여
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              <span className="font-semibold text-fg">
                {displayName(modalUser)}
              </span>
 님의{' '}
              <span className="font-mono text-xs font-semibold text-accent">
 token_limit
              </span>
 을 증가시킵니다.
            </p>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
 추가 할당량 (토큰)
              <input
 type="number"
 min={1}
 step={1}
 value={grantAmount}
 onChange={(e) => setGrantAmount(e.target.value)}
 className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm tabular-nums"
              />
            </label>

            <p className="mt-3 text-[17px] leading-relaxed text-fg-subtle">
 현재 한도:{' '}
              <span className="font-semibold tabular-nums text-fg-muted">
                {Number(modalUser.token_limit).toLocaleString('ko-KR')}
              </span>{' '}
              · RPC{' '}
              <span className="font-mono text-[15px]">
 admin_increment_user_token_limit
              </span>
 로 반영됩니다.
            </p>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
 type="button"
 disabled={grantBusy}
 onClick={() => closeModal()}
 className="rounded-xl px-4 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
              >
 취소
              </button>
              <button
 type="button"
 disabled={grantBusy}
 onClick={() => void submitGrant()}
 className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent disabled:opacity-60"
              >
                {grantBusy ? '처리 중…' : '부여하기'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
