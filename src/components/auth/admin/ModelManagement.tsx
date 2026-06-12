import { startTransition, useCallback, useEffect, useState, type FormEvent } from 'react'

import { AdminPageHeader } from './AdminPageHeader'
import { supabase } from '../../../lib/supabase'
import {
  createAiModelAdmin,
  deleteAiModelAdmin,
  listAiModelsAdmin,
  sortAiModelRows,
  updateAiModelAdmin,
} from '../../../services/admin/ai-models-admin'
import {
  AI_MODELS_SYNC_MODEL_ID,
  catalogEntryToFormState,
  LATEST_AI_MODELS_CATALOG,
  syncLatestAiModelsCatalog,
} from '../../../services/admin/ai-models-catalog-sync'
import { logAdminActivity } from '../../../services/admin/activity-log'
import { useAuth } from '../useAuth'
import {
  AI_MODEL_PROVIDER_LABELS,
  type AiModelProvider,
  type AiModelRow,
  type AiModelType,
} from '../../../types/ai-models'

type ModalMode = 'create' | 'edit'

type FormState = {
  provider: AiModelProvider
  display_name: string
  api_id: string
  model_type: AiModelType
  hint: string
  cost_info: string
  description: string
  is_active: boolean
  sort_order: number
}

const INITIAL_FORM: FormState = {
  provider: 'google',
  display_name: '',
  api_id: '',
  model_type: 'text',
  hint: '',
  cost_info: '보통',
  description: '',
  is_active: true,
  sort_order: 500,
}

function costBadgeClass(costInfo: string): string {
  const level = costInfo.trim()
  if (level === '저렴' || level === '초저가') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
  }
  if (level === '높음' || level === '프리미엄') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
  }
  return 'bg-stone-200/90 text-stone-700 dark:bg-stone-700/80 dark:text-stone-200'
}

function providerBadgeClass(provider: AiModelProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200'
    case 'openai':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
    default:
      return 'bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200'
  }
}

function typeBadgeClass(type: AiModelType): string {
  if (type === 'image') {
    return 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200'
  }
  if (type === 'video') {
    return 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'
  }
  return 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
}

function modelTypeLabel(type: AiModelType): string {
  if (type === 'image') return '이미지'
  if (type === 'video') return '동영상'
  return '텍스트'
}

export function ModelManagement() {
  const { profile, session } = useAuth()
  const [rows, setRows] = useState<AiModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aiSyncBusy, setAiSyncBusy] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const data = await listAiModelsAdmin()
      startTransition(() => setRows(data))
    } catch (qErr) {
      const message =
        qErr instanceof Error ? qErr.message : '모델 목록을 불러오지 못했습니다.'
      setError(message)
      setRows([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('ai_models_admin_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_models' },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  function openCreate() {
    setModalMode('create')
    setEditingId(null)
    setForm(INITIAL_FORM)
    setSaveError(null)
    setModalOpen(true)
  }

  function openEdit(row: AiModelRow) {
    setModalMode('edit')
    setEditingId(row.id)
    setForm({
      provider: row.provider,
      display_name: row.display_name,
      api_id: row.api_id,
      model_type: row.model_type,
      hint: row.hint ?? '',
      cost_info: row.cost_info ?? '보통',
      description: row.description ?? '',
      is_active: row.is_active,
      sort_order: row.sort_order,
    })
    setSaveError(null)
    setModalOpen(true)
  }

  async function handleToggleActive(row: AiModelRow) {
    setBusyId(row.id)
    setError(null)
    const next = !row.is_active
    const { error: uErr } = await supabase
      .from('ai_models')
      .update({ is_active: next })
      .eq('id', row.id)

    if (uErr) {
      setError(uErr.message)
    } else {
      await logAdminActivity(
        next ? 'ai_model_activate' : 'ai_model_deactivate',
        `${row.display_name} (${row.api_id})`,
      )
      await load()
    }
    setBusyId(null)
  }

  async function handleDelete(row: AiModelRow) {
    const confirmed = window.confirm(
      `「${row.display_name}」(${row.api_id}) 모델을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`,
    )
    if (!confirmed) return

    setBusyId(row.id)
    setError(null)
    setSuccessMessage(null)
    try {
      await deleteAiModelAdmin(row.id)
      await logAdminActivity('ai_model_update', `삭제: ${row.display_name} (${row.api_id})`)
      setRows((prev) => prev.filter((item) => item.id !== row.id))
      setSuccessMessage(`「${row.display_name}」 모델을 삭제했습니다.`)
      void load()
    } catch (deleteErr) {
      const message =
        deleteErr instanceof Error ? deleteErr.message : '모델 삭제에 실패했습니다.'
      setError(message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    const display_name = form.display_name.trim()
    const api_id = form.api_id.trim()
    const hint = form.hint.trim()
    const cost_info = form.cost_info.trim() || '보통'
    const description = form.description.trim()

    if (!display_name || !api_id) {
      setSaveError('모델 이름과 API ID는 필수입니다.')
      return
    }

    setSaveBusy(true)
    setSaveError(null)
    setError(null)

    const writeInput = {
      provider: form.provider,
      display_name,
      api_id,
      model_type: form.model_type,
      hint: hint.length > 0 ? hint : null,
      cost_info,
      description: description.length > 0 ? description : null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    }

    try {
      const saved =
        modalMode === 'create'
          ? await createAiModelAdmin(writeInput)
          : editingId
            ? await updateAiModelAdmin(editingId, writeInput)
            : null

      if (!saved) {
        setSaveError('수정할 모델을 찾지 못했습니다.')
        return
      }

      await logAdminActivity(
        modalMode === 'create' ? 'ai_model_create' : 'ai_model_update',
        `${display_name} (${api_id})`,
      )

      setRows((prev) =>
        sortAiModelRows(
          modalMode === 'create'
            ? [...prev, saved]
            : prev.map((row) => (row.id === saved.id ? saved : row)),
        ),
      )
      setSuccessMessage(
        modalMode === 'create'
          ? `「${saved.display_name}」 모델을 추가했습니다.`
          : `「${saved.display_name}」 모델을 저장했습니다.`,
      )
      setModalOpen(false)
      void load()
    } catch (saveErr) {
      const message =
        saveErr instanceof Error ? saveErr.message : 'AI 모델 저장에 실패했습니다.'
      setSaveError(message)
      setError(message)
    } finally {
      setSaveBusy(false)
    }
  }

  async function handleAiSync() {
    if (!profile?.id) {
      setError('로그인 프로필이 필요합니다.')
      return
    }

    setAiSyncBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await syncLatestAiModelsCatalog(supabase, {
        userId: profile.id,
        accessToken: session?.access_token,
        tokenLimit: profile.token_limit,
        currentTokenUsage: profile.current_token_usage,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }

      const engineLabel =
        result.source === 'gemini'
          ? `Gemini 3.5 Flash(${AI_MODELS_SYNC_MODEL_ID})`
          : '공식 검증 카탈로그'

      await logAdminActivity(
        'ai_model_update',
        `AI 공식 카탈로그 동기화 (${result.upserted}건 · ${engineLabel}${result.liveGoogleChecked ? ' · Google live 검증' : ''})`,
      )
      await load()

      const deactivatedNote =
        result.deactivated > 0
          ? ` 미운영/구버전 ${result.deactivated}건은 비활성화했습니다.`
          : ''

      setSuccessMessage(
        result.source === 'gemini'
          ? `공식 운영 모델 ${result.upserted}건을 반영했습니다.${deactivatedNote}`
          : `공식 검증 카탈로그 ${result.upserted}건을 반영했습니다.${deactivatedNote}`,
      )

      if (modalOpen && modalMode === 'create' && !form.display_name.trim()) {
        const firstEntry = LATEST_AI_MODELS_CATALOG[0]
        if (firstEntry) {
          setForm(catalogEntryToFormState(firstEntry))
        }
      }
    } catch (syncErr) {
      const message =
        syncErr instanceof Error
          ? syncErr.message
          : 'AI 모델 동기화에 실패했습니다.'
      setError(message)
    } finally {
      setAiSyncBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
      <AdminPageHeader
        title="AI 모델 관리"
        description="채팅 드롭다운과 Edge Function 라우팅에 사용되는 모델 레지스트리를 관리합니다."
        actions={
          <>
            <button
              type="button"
              onClick={() => void handleAiSync()}
              disabled={aiSyncBusy || loading || !profile?.id}
              title={`${AI_MODELS_SYNC_MODEL_ID}로 최신 모델 카탈로그 갱신`}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 active:bg-violet-200/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/60"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
              {aiSyncBusy ? 'Gemini 3.5 Flash 동기화 중…' : 'AI 최신 동기화'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            새로운 AI 모델 추가
            </button>
          </>
        }
      />

      {successMessage ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          {successMessage}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  공급사
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  모델 이름
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  비용 등급
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  상세 업무 가이드
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  API ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  타입
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  활성
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    모델 목록을 불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    <p>등록된 AI 모델이 없습니다.</p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      「새로운 AI 모델 추가」로 저장하거나 「AI 최신 동기화」로 카탈로그를
                      불러오세요.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${providerBadgeClass(row.provider)}`}
                      >
                        {AI_MODEL_PROVIDER_LABELS[row.provider]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                        {row.display_name}
                      </p>
                      {row.hint ? (
                        <p className="mt-0.5 max-w-xs text-xs leading-snug text-slate-500 dark:text-slate-400">
                          {row.hint}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${costBadgeClass(row.cost_info?.trim() || '보통')}`}
                      >
                        {row.cost_info?.trim() || '보통'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-sm text-xs leading-snug text-slate-600 dark:text-slate-300">
                        {row.description?.trim() || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        {row.api_id}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeBadgeClass(row.model_type)}`}
                      >
                        {modelTypeLabel(row.model_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.is_active}
                        aria-label={`${row.display_name} ${row.is_active ? '비활성화' : '활성화'}`}
                        disabled={busyId === row.id}
                        onClick={() => void handleToggleActive(row)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                          row.is_active
                            ? 'bg-indigo-600 dark:bg-indigo-500'
                            : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            row.is_active ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void handleDelete(row)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
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
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={() => !saveBusy && setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-model-modal-title"
            className="flex max-h-[min(85vh,34rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2
                id="ai-model-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-50"
              >
                {modalMode === 'create' ? '새로운 AI 모델 추가' : 'AI 모델 수정'}
              </h2>
            </div>

            <form
              onSubmit={(event) => void handleSave(event)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-3">
              {saveError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
                >
                  {saveError}
                </div>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  공급사
                </span>
                <select
                  value={form.provider}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      provider: event.target.value as AiModelProvider,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="google">Google (Gemini)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  모델 이름
                </span>
                <input
                  type="text"
                  required
                  value={form.display_name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, display_name: event.target.value }))
                  }
                  placeholder="예: Gemini 2.5 Flash"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  API ID
                </span>
                <input
                  type="text"
                  required
                  value={form.api_id}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, api_id: event.target.value }))
                  }
                  placeholder="예: gemini-2.5-flash"
                  disabled={modalMode === 'edit'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  타입
                </span>
                <select
                  value={form.model_type}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      model_type: event.target.value as AiModelType,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="text">텍스트</option>
                  <option value="image">이미지</option>
                  <option value="video">동영상</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  짧은 안내 (컴포저, 선택)
                </span>
                <textarea
                  rows={2}
                  value={form.hint}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, hint: event.target.value }))
                  }
                  placeholder="컴포저 하단에 표시되는 한 줄 안내"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  비용 등급
                </span>
                <select
                  value={form.cost_info}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cost_info: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="저렴">저렴</option>
                  <option value="보통">보통</option>
                  <option value="높음">높음</option>
                  <option value="프리미엄">프리미엄</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  상세 업무 가이드
                </span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="모델 드롭다운 호버·관리자 테이블에 표시되는 업무 가이드"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <div className="flex flex-wrap items-center gap-4 pb-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, is_active: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  활성화
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <span>정렬</span>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        sort_order: Number(event.target.value) || 0,
                      }))
                    }
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saveBusy}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  {saveBusy ? '저장 중…' : modalMode === 'create' ? '추가' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
