import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import {
  adminBulkGrantTokenLimit,
  adminBulkResetTokenUsage,
  adminSetTokenResetDay,
  dateInputFromResetDay,
  dayOfMonthFromDateInput,
  fetchOrgTokenPolicy,
  formatNextResetLabel,
  runAutoTokenUsageResetIfDue,
  type OrgTokenPolicy,
  type TokenBulkScope,
} from '../../services/admin/token-admin'
import { logAdminActivity } from '../../services/admin/activity-log'
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  type AppUserRole,
} from '../../services/admin/admin-user-action'
import {
  EMPLOYEE_DEPARTMENTS,
  EMPLOYEE_JOB_TITLES,
} from '../../types/employee-org'

type EmployeeRow = {
  id: string
  email: string
  display_name: string | null
  department: string | null
  job_title: string | null
  role: string | null
  token_limit: number
  current_token_usage: number
}

type ModalKind = 'create' | 'edit' | 'delete' | 'grant' | 'reset' | null

type EmployeeForm = {
  email: string
  display_name: string
  department: string
  job_title: string
  role: AppUserRole
}

const EMPTY_FORM: EmployeeForm = {
  email: '',
  display_name: '',
  department: '',
  job_title: '',
  role: 'user',
}

function displayName(row: Pick<EmployeeRow, 'display_name' | 'email'>): string {
  const n = row.display_name?.trim()
  if (n && n.length > 0) return n
  return row.email
}

function roleBadgeClass(role: string | null): string {
  return role === 'admin'
    ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function usageTone(used: number, limit: number): string {
  if (!limit || limit <= 0) return '[&::-webkit-progress-value]:bg-slate-400'
  const p = (used / limit) * 100
  if (p >= 90) return '[&::-webkit-progress-value]:bg-rose-500'
  if (p >= 70) return '[&::-webkit-progress-value]:bg-amber-500'
  return '[&::-webkit-progress-value]:bg-emerald-500'
}

export function EmployeeCRUD() {
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalKind>(null)
  const [target, setTarget] = useState<EmployeeRow | null>(null)
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM)
  const [formBusy, setFormBusy] = useState(false)
  const [grantAmount, setGrantAmount] = useState('100000')
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [grantScope, setGrantScope] = useState<TokenBulkScope>('selected')
  const [grantDepartment, setGrantDepartment] = useState('')
  const [resetScope, setResetScope] = useState<TokenBulkScope>('selected')
  const [resetDepartment, setResetDepartment] = useState('')
  const [tokenPolicy, setTokenPolicy] = useState<OrgTokenPolicy | null>(null)
  const [resetDayInput, setResetDayInput] = useState('')
  const [policyBusy, setPolicyBusy] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    setSuccessMessage(null)
    await runAutoTokenUsageResetIfDue(supabase)
    const policy = await fetchOrgTokenPolicy(supabase)
    startTransition(() => {
      setTokenPolicy(policy)
      setResetDayInput(dateInputFromResetDay(policy?.reset_day_of_month ?? null))
    })

    const { data, error: qErr } = await supabase
      .from('users')
      .select(
        'id, email, display_name, department, job_title, role, token_limit, current_token_usage',
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.email,
        r.display_name ?? '',
        r.department ?? '',
        r.job_title ?? '',
        r.role ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const departmentOptions = useMemo(() => {
    const fromRows = rows
      .map((r) => (r.department ?? '').trim())
      .filter((d) => d.length > 0)
    return [...new Set([...EMPLOYEE_DEPARTMENTS, ...fromRows])].sort((a, b) =>
      a.localeCompare(b, 'ko'),
    )
  }, [rows])

  const selectedCount = selectedIds.size
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id))

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const row of filteredRows) next.delete(row.id)
      } else {
        for (const row of filteredRows) next.add(row.id)
      }
      return next
    })
  }

  function openCreate() {
    setTarget(null)
    setForm(EMPTY_FORM)
    setTempPassword(null)
    setModal('create')
  }

  function openEdit(row: EmployeeRow) {
    setTarget(row)
    setForm({
      email: row.email,
      display_name: row.display_name?.trim() ?? '',
      department: row.department?.trim() ?? '',
      job_title: row.job_title?.trim() ?? '',
      role: row.role === 'admin' ? 'admin' : 'user',
    })
    setModal('edit')
  }

  function openDelete(row: EmployeeRow) {
    setTarget(row)
    setModal('delete')
  }

  function openGrant(row: EmployeeRow) {
    setTarget(row)
    setGrantAmount('100000')
    setGrantScope('selected')
    setGrantDepartment(row.department?.trim() ?? '')
    setSelectedIds(new Set([row.id]))
    setModal('grant')
  }

  function openBulkGrant(scope: TokenBulkScope = 'selected') {
    setTarget(null)
    setGrantAmount('100000')
    setGrantScope(scope)
    setGrantDepartment(departmentOptions[0] ?? '')
    setModal('grant')
  }

  function openBulkReset(scope: TokenBulkScope = 'selected') {
    setTarget(null)
    setResetScope(scope)
    setResetDepartment(departmentOptions[0] ?? '')
    setModal('reset')
  }

  function closeModal() {
    if (formBusy) return
    setModal(null)
    setTarget(null)
    setTempPassword(null)
  }

  async function submitCreate() {
    const email = form.email.trim()
    const name = form.display_name.trim()
    if (!email || !name) {
      window.alert('이메일과 이름을 입력해 주세요.')
      return
    }

    setFormBusy(true)
    try {
      const result = await adminCreateUser({
        email,
        display_name: name,
        department: form.department.trim() || null,
        job_title: form.job_title.trim() || null,
        role: form.role,
      })
      if (!result.ok) {
        window.alert(result.error)
        return
      }
      if (result.temporary_password) {
        setTempPassword(result.temporary_password)
      } else {
        closeModal()
      }
      await load()
    } finally {
      setFormBusy(false)
    }
  }

  async function submitEdit() {
    if (!target) return
    const email = form.email.trim()
    const name = form.display_name.trim()
    if (!email || !name) {
      window.alert('이메일과 이름을 입력해 주세요.')
      return
    }

    setFormBusy(true)
    try {
      const result = await adminUpdateUser({
        user_id: target.id,
        email,
        display_name: name,
        department: form.department.trim() || null,
        job_title: form.job_title.trim() || null,
        role: form.role,
      })
      if (!result.ok) {
        window.alert(result.error)
        return
      }
      closeModal()
      await load()
    } finally {
      setFormBusy(false)
    }
  }

  async function submitDelete() {
    if (!target) return
    setFormBusy(true)
    setBusyId(target.id)
    try {
      const result = await adminDeleteUser(target.id)
      if (!result.ok) {
        window.alert(result.error)
        return
      }
      closeModal()
      await load()
    } finally {
      setFormBusy(false)
      setBusyId(null)
    }
  }

  async function submitGrant() {
    const delta = Number(grantAmount.trim())
    if (!Number.isFinite(delta) || delta <= 0 || !Number.isInteger(delta)) {
      window.alert('양의 정수만 입력해 주세요.')
      return
    }

    const scope = grantScope
    if (scope === 'selected' && selectedIds.size === 0) {
      window.alert('토큰을 부여할 직원을 선택해 주세요.')
      return
    }
    if (scope === 'department' && !grantDepartment.trim()) {
      window.alert('부서를 선택해 주세요.')
      return
    }

    setFormBusy(true)
    try {
      const result = await adminBulkGrantTokenLimit(supabase, {
        delta,
        scope,
        userIds: scope === 'selected' ? [...selectedIds] : undefined,
        department: scope === 'department' ? grantDepartment : null,
      })
      if (!result.ok) {
        window.alert(result.message)
        return
      }

      const scopeLabel =
        scope === 'all'
          ? '전체'
          : scope === 'department'
            ? `부서(${grantDepartment})`
            : `선택 ${result.updatedCount}명`
      await logAdminActivity(
        'token_grant',
        `${scopeLabel}에게 토큰 ${delta.toLocaleString('ko-KR')} 부여 (${result.updatedCount}명)`,
      )
      setSuccessMessage(
        `${result.updatedCount}명에게 토큰 ${delta.toLocaleString('ko-KR')}을 부여했습니다.`,
      )
      closeModal()
      await load()
    } finally {
      setFormBusy(false)
    }
  }

  async function submitResetUsage() {
    const scope = resetScope
    if (scope === 'selected' && selectedIds.size === 0) {
      window.alert('초기화할 직원을 선택해 주세요.')
      return
    }
    if (scope === 'department' && !resetDepartment.trim()) {
      window.alert('부서를 선택해 주세요.')
      return
    }

    const scopeLabel =
      scope === 'all'
        ? '전체 직원'
        : scope === 'department'
          ? `${resetDepartment} 부서`
          : `선택 ${selectedIds.size}명`

    if (
      !window.confirm(
        `${scopeLabel}의 토큰 사용량(current_token_usage)을 0으로 초기화합니다. 계속할까요?`,
      )
    ) {
      return
    }

    setFormBusy(true)
    try {
      const result = await adminBulkResetTokenUsage(supabase, {
        scope,
        userIds: scope === 'selected' ? [...selectedIds] : undefined,
        department: scope === 'department' ? resetDepartment : null,
      })
      if (!result.ok) {
        window.alert(result.message)
        return
      }
      await logAdminActivity(
        'token_grant',
        `${scopeLabel} 토큰 사용량 초기화 (${result.updatedCount}명)`,
      )
      setSuccessMessage(`${result.updatedCount}명의 토큰 사용량을 초기화했습니다.`)
      closeModal()
      await load()
    } finally {
      setFormBusy(false)
    }
  }

  async function submitSaveResetPolicy() {
    const day = resetDayInput.trim()
      ? dayOfMonthFromDateInput(resetDayInput)
      : null
    if (resetDayInput.trim() && day == null) {
      window.alert('초기화일은 1~28일 사이로 선택해 주세요. (29~31일은 월별 일관성을 위해 제외)')
      return
    }

    setPolicyBusy(true)
    setError(null)
    try {
      const result = await adminSetTokenResetDay(supabase, day)
      if (!result.ok) {
        setError(result.message)
        return
      }
      await logAdminActivity(
        'token_grant',
        day
          ? `매월 ${day}일 토큰 사용량 자동 초기화 정책 저장`
          : '토큰 사용량 자동 초기화 정책 해제',
      )
      setSuccessMessage(
        day
          ? `매월 ${day}일(KST)에 토큰 사용량이 자동 초기화되도록 설정했습니다.`
          : '토큰 사용량 자동 초기화를 해제했습니다.',
      )
      await load()
    } finally {
      setPolicyBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-base">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            직원 관리
          </h1>
          <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
            전 직원 계정·권한·토큰 한도를 한 화면에서 운영합니다. Auth 계정 생성/수정/삭제는
            Edge Function으로 안전하게 처리됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          + 직원 등록
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름·이메일·부서·직책 검색"
          className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          새로고침
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {filteredRows.length}명 · 선택 {selectedCount}명
        </span>
      </div>

      {successMessage ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          {successMessage}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              토큰 자동 초기화
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatNextResetLabel(tokenPolicy?.reset_day_of_month ?? null)}
              {tokenPolicy?.last_auto_reset_at
                ? ` · 최근 실행: ${new Date(tokenPolicy.last_auto_reset_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
              매월 초기화일 (1~28일)
              <input
                type="date"
                value={resetDayInput}
                onChange={(e) => setResetDayInput(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              disabled={policyBusy}
              onClick={() => void submitSaveResetPolicy()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {policyBusy ? '저장 중…' : '정책 저장'}
            </button>
            <button
              type="button"
              disabled={policyBusy}
              onClick={async () => {
                setResetDayInput('')
                setPolicyBusy(true)
                setError(null)
                try {
                  const result = await adminSetTokenResetDay(supabase, null)
                  if (!result.ok) {
                    setError(result.message)
                    return
                  }
                  setSuccessMessage('토큰 사용량 자동 초기화를 해제했습니다.')
                  await load()
                } finally {
                  setPolicyBusy(false)
                }
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              해제
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 dark:border-indigo-950 dark:bg-indigo-950/20">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">
          일괄 토큰
        </span>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => openBulkGrant('selected')}
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-40 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
        >
          선택 부여
        </button>
        <button
          type="button"
          onClick={() => openBulkGrant('all')}
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
        >
          전체 부여
        </button>
        <button
          type="button"
          onClick={() => openBulkGrant('department')}
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
        >
          부서별 부여
        </button>
        <span className="mx-1 h-4 w-px bg-indigo-200 dark:bg-indigo-800" aria-hidden="true" />
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => openBulkReset('selected')}
          className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-40 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950/30"
        >
          선택 초기화
        </button>
        <button
          type="button"
          onClick={() => openBulkReset('all')}
          className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950/30"
        >
          전체 초기화
        </button>
        <button
          type="button"
          onClick={() => openBulkReset('department')}
          className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950/30"
        >
          부서별 초기화
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => toggleSelectAllVisible()}
                    aria-label="현재 목록 전체 선택"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-2.5">직원</th>
                <th className="px-4 py-2.5">부서</th>
                <th className="px-4 py-2.5">직책</th>
                <th className="px-4 py-2.5">권한</th>
                <th className="px-4 py-2.5">토큰 사용</th>
                <th className="px-4 py-2.5 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    표시할 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((u) => {
                  const used = Number(u.current_token_usage)
                  const limit = Number(u.token_limit)
                  const pct =
                    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
                  const isSelected = selectedIds.has(u.id)
                  return (
                    <tr
                      key={u.id}
                      className={`transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelected(u.id)}
                          aria-label={`${displayName(u)} 선택`}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="max-w-[240px] px-4 py-2.5">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-50">
                          {displayName(u)}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {u.email}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {(u.department ?? '').trim() || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {(u.job_title ?? '').trim() || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(u.role)}`}
                        >
                          {u.role === 'admin' ? '관리자' : '일반'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex max-w-xs flex-col gap-1">
                          <div className="flex justify-between text-xs tabular-nums text-slate-600 dark:text-slate-300">
                            <span>
                              {used.toLocaleString('ko-KR')} /{' '}
                              {limit.toLocaleString('ko-KR')}
                            </span>
                            <span className="font-medium">{pct}%</span>
                          </div>
                          <progress
                            className={`h-1.5 w-full appearance-none overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 dark:[&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:rounded-full ${usageTone(used, limit)}`}
                            value={used}
                            max={limit > 0 ? limit : 1}
                            aria-label={`토큰 사용 ${pct}%`}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => openGrant(u)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            토큰
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => openEdit(u)}
                            className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => openDelete(u)}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'create' || modal === 'edit' ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => closeModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-form-title"
            className="max-h-[min(92dvh,40rem)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="employee-form-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {modal === 'create' ? '직원 등록' : '직원 수정'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {modal === 'create'
                ? '등록 후 임시 비밀번호가 생성됩니다. 직원에게 안전하게 전달하세요.'
                : '변경 사항은 Edge Function을 통해 Auth·프로필에 반영됩니다.'}
            </p>

            {tempPassword ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  등록 완료 — 임시 비밀번호
                </p>
                <p className="mt-2 break-all font-mono text-sm text-amber-800 dark:text-amber-200">
                  {tempPassword}
                </p>
                <button
                  type="button"
                  onClick={() => closeModal()}
                  className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    이메일
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    이름
                    <input
                      value={form.display_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, display_name: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    부서
                    <select
                      value={form.department}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, department: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="">(미지정)</option>
                      {EMPLOYEE_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                      {form.department &&
                      !EMPLOYEE_DEPARTMENTS.includes(
                        form.department as (typeof EMPLOYEE_DEPARTMENTS)[number],
                      ) ? (
                        <option value={form.department}>{form.department}</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    직책
                    <select
                      value={form.job_title}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, job_title: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="">(미지정)</option>
                      {EMPLOYEE_JOB_TITLES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      {form.job_title &&
                      !EMPLOYEE_JOB_TITLES.includes(
                        form.job_title as (typeof EMPLOYEE_JOB_TITLES)[number],
                      ) ? (
                        <option value={form.job_title}>{form.job_title}</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    권한
                    <select
                      value={form.role}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          role: e.target.value as AppUserRole,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="user">일반 (user)</option>
                      <option value="admin">관리자 (admin)</option>
                    </select>
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={formBusy}
                    onClick={() => closeModal()}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={formBusy}
                    onClick={() =>
                      void (modal === 'create' ? submitCreate() : submitEdit())
                    }
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {formBusy ? '처리 중…' : modal === 'create' ? '등록' : '저장'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {modal === 'delete' && target ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => closeModal()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              직원 삭제
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {displayName(target)}
              </span>
              님의 Auth 계정과 프로필을 영구 삭제합니다. 되돌릴 수 없습니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={formBusy}
                onClick={() => closeModal()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={formBusy}
                onClick={() => void submitDelete()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {formBusy ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal === 'grant' ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => closeModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grant-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="grant-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              토큰 한도 부여
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {grantScope === 'all'
                ? '전체 직원의 월간 token_limit를 증가시킵니다.'
                : grantScope === 'department'
                  ? `「${grantDepartment || '—'}」 부서 직원의 한도를 증가시킵니다.`
                  : target
                    ? `${displayName(target)}님 포함 선택 ${selectedCount}명`
                    : `선택 ${selectedCount}명`}
            </p>

            <div className="mt-5 space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  대상
                </legend>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="grant-scope"
                    checked={grantScope === 'selected'}
                    onChange={() => setGrantScope('selected')}
                  />
                  선택한 직원 ({selectedCount}명)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="grant-scope"
                    checked={grantScope === 'all'}
                    onChange={() => setGrantScope('all')}
                  />
                  전체 직원
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="grant-scope"
                    checked={grantScope === 'department'}
                    onChange={() => setGrantScope('department')}
                  />
                  부서별
                </label>
              </fieldset>

              {grantScope === 'department' ? (
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  부서
                  <select
                    value={grantDepartment}
                    onChange={(e) => setGrantDepartment(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">부서 선택</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                추가 할당량 (token_limit +N)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={formBusy}
                onClick={() => closeModal()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={formBusy}
                onClick={() => void submitGrant()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {formBusy ? '처리 중…' : '부여하기'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal === 'reset' ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => closeModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="reset-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              토큰 사용량 초기화
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              current_token_usage를 0으로 되돌립니다. token_limit(한도)는 변경되지 않습니다.
            </p>

            <div className="mt-5 space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  대상
                </legend>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="reset-scope"
                    checked={resetScope === 'selected'}
                    onChange={() => setResetScope('selected')}
                  />
                  선택한 직원 ({selectedCount}명)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="reset-scope"
                    checked={resetScope === 'all'}
                    onChange={() => setResetScope('all')}
                  />
                  전체 직원
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="reset-scope"
                    checked={resetScope === 'department'}
                    onChange={() => setResetScope('department')}
                  />
                  부서별
                </label>
              </fieldset>

              {resetScope === 'department' ? (
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  부서
                  <select
                    value={resetDepartment}
                    onChange={(e) => setResetDepartment(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">부서 선택</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={formBusy}
                onClick={() => closeModal()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={formBusy}
                onClick={() => void submitResetUsage()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
              >
                {formBusy ? '처리 중…' : '초기화'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
