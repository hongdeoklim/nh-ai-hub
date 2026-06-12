import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { logAdminActivity } from '../../services/admin/activity-log'
import {
  PROMPT_TEMPLATE_DEPARTMENTS,
  type PromptTemplateDepartment,
  type PromptTemplateRow,
} from '../../types/prompt-templates'

type ModalMode = 'create' | 'edit'

type FormState = {
  title: string
  target_department: PromptTemplateDepartment
  prompt_content: string
  is_active: boolean
}

const INITIAL_FORM: FormState = {
  title: '',
  target_department: '공통',
  prompt_content: '',
  is_active: true,
}

export function TemplateManager() {
  const [rows, setRows] = useState<PromptTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filterDept, setFilterDept] = useState<'전체' | PromptTemplateDepartment>('전체')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [saveBusy, setSaveBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    const { data, error: qErr } = await supabase
      .from('prompt_templates')
      .select(
        'id, target_department, title, prompt_content, is_active, created_at, updated_at',
      )
      .order('target_department', { ascending: true })
      .order('title', { ascending: true })

    if (qErr) {
      setError(qErr.message)
      setRows([])
    } else {
      startTransition(() => setRows((data ?? []) as PromptTemplateRow[]))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const filteredRows = useMemo(() => {
    if (filterDept === '전체') return rows
    return rows.filter((r) => r.target_department === filterDept)
  }, [rows, filterDept])

  function openCreate() {
    setModalMode('create')
    setEditingId(null)
    setForm(INITIAL_FORM)
    setModalOpen(true)
  }

  function openEdit(row: PromptTemplateRow) {
    setModalMode('edit')
    setEditingId(row.id)
    setForm({
      title: row.title,
      target_department: row.target_department,
      prompt_content: row.prompt_content,
      is_active: row.is_active,
    })
    setModalOpen(true)
  }

  async function submitModal() {
    const title = form.title.trim()
    const body = form.prompt_content.trim()
    if (!title.length || !body.length) {
      window.alert('제목과 프롬프트 본문을 입력해 주세요.')
      return
    }

    setSaveBusy(true)
    try {
      if (modalMode === 'create') {
        const { error: insErr } = await supabase.from('prompt_templates').insert({
          title,
          target_department: form.target_department,
          prompt_content: body,
          is_active: form.is_active,
        })
        if (insErr) {
          window.alert(insErr.message)
          return
        }
        await logAdminActivity(
          'admin_prompt_create',
          `[${form.target_department}] ${title}`,
        )
      } else if (editingId) {
        const { error: updErr } = await supabase
          .from('prompt_templates')
          .update({
            title,
            target_department: form.target_department,
            prompt_content: body,
            is_active: form.is_active,
          })
          .eq('id', editingId)
        if (updErr) {
          window.alert(updErr.message)
          return
        }
        await logAdminActivity(
          'admin_prompt_edit',
          `[${form.target_department}] ${title} (id: ${editingId})`,
        )
      }
      setModalOpen(false)
      await load()
    } finally {
      setSaveBusy(false)
    }
  }

  async function toggleActive(row: PromptTemplateRow) {
    setBusyId(row.id)
    try {
      const next = !row.is_active
      const { error: updErr } = await supabase
        .from('prompt_templates')
        .update({ is_active: next })
        .eq('id', row.id)
      if (updErr) {
        window.alert(updErr.message)
        return
      }
      await logAdminActivity(
        'admin_prompt_edit',
        `${row.title} → ${next ? '활성' : '비활성'}`,
      )
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function removeRow(row: PromptTemplateRow) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`「${row.title}」템플릿을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)
    ) {
      return
    }
    setBusyId(row.id)
    try {
      const { error: delErr } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', row.id)
      if (delErr) {
        window.alert(delErr.message)
        return
      }
      await logAdminActivity(
        'admin_prompt_delete',
        `[${row.target_department}] ${row.title}`,
      )
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-base">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            프롬프트 템플릿
          </h1>
          <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
            전사(공통) 및 부서별 템플릿 CRUD. 저장 즉시 일반 직원 대시보드 갤러리에 Realtime
            반영됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          + 템플릿 추가
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          부서
          <select
            value={filterDept}
            onChange={(e) =>
              setFilterDept(e.target.value as '전체' | PromptTemplateDepartment)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="전체">전체</option>
            {PROMPT_TEMPLATE_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          새로고침
        </button>
        <span className="text-sm text-slate-500">{filteredRows.length}건</span>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">부서</th>
                <th className="px-4 py-2.5">제목 · 미리보기</th>
                <th className="px-4 py-2.5">상태</th>
                <th className="px-4 py-2.5">수정</th>
                <th className="px-4 py-2.5 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    표시할 템플릿이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                      {row.target_department}
                    </td>
                    <td className="max-w-md px-4 py-2.5">
                      <p className="font-medium text-slate-900 dark:text-slate-50">
                        {row.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {row.prompt_content.replace(/\s+/g, ' ')}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.is_active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {row.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(row.updated_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void toggleActive(row)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {row.is_active ? '비활성' : '활성'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openEdit(row)}
                          className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void removeRow(row)}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => !saveBusy && setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tm-modal-title"
            className="max-h-[min(92dvh,44rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="tm-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {modalMode === 'create' ? '템플릿 추가' : '템플릿 수정'}
            </h2>

            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                대상 부서
                <select
                  value={form.target_department}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      target_department: e.target.value as PromptTemplateDepartment,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {PROMPT_TEMPLATE_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d === '공통' ? '공통 (전사)' : d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                제목
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="예: 공사현장 균열 분석"
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                프롬프트 본문
                <textarea
                  value={form.prompt_content}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, prompt_content: e.target.value }))
                  }
                  rows={8}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="채팅 입력창에 채워질 전체 프롬프트 문안입니다."
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                활성화 (비활성 시 일반 사용자에게 숨김)
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void submitModal()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {saveBusy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
