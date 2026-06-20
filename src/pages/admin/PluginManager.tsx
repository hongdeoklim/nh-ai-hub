import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react'

import { supabase } from '../../lib/supabase'

type PluginRow = {
  id: string
  name: string
  description: string
  endpoint_url: string | null
  tool_function_name: string
  is_active: boolean
  created_at: string
  updated_at: string
  auth_type: 'none' | 'bearer' | 'api_key'
  auth_header_name: string
  connection_mode: 'per_user' | 'workspace_install' | 'admin_shared' | 'hybrid'
  setup_url: string | null
  docs_url: string | null
}

type ToggleSwitchProps = {
  checked: boolean
  disabled?: boolean
  busy?: boolean
  onToggle: (next: boolean) => void
  labelledBy?: string
}

function ToggleSwitch({
  checked,
  disabled,
  busy,
  onToggle,
  labelledBy,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-busy={busy ?? false}
      disabled={disabled || busy}
      onClick={() => onToggle(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
        checked
          ? 'bg-emerald-500 shadow-inner shadow-emerald-900/20'
          : 'bg-slate-300 dark:bg-slate-600',
        disabled || busy ? 'cursor-not-allowed opacity-60' : 'hover:brightness-105',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-out',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
      <span className="sr-only">{checked ? '활성' : '비활성'}</span>
    </button>
  )
}

export function PluginManager() {
  const [rows, setRows] = useState<PluginRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formToolFn, setFormToolFn] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formAuthType, setFormAuthType] = useState<PluginRow['auth_type']>('none')
  const [formAuthHeader, setFormAuthHeader] = useState('Authorization')
  const [formConnectionMode, setFormConnectionMode] = useState<PluginRow['connection_mode']>('admin_shared')
  const [formSetupUrl, setFormSetupUrl] = useState('')
  const [formDocsUrl, setFormDocsUrl] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    const { data, error: qErr } = await supabase
      .from('plugins')
      .select(
        'id, name, description, endpoint_url, tool_function_name, is_active, created_at, updated_at, auth_type, auth_header_name, connection_mode, setup_url, docs_url',
      )
      .order('updated_at', { ascending: false })

    if (qErr) {
      setError(qErr.message)
      setRows([])
    } else {
      startTransition(() => setRows((data ?? []) as PluginRow[]))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function setPluginActive(row: PluginRow, next: boolean) {
    const builtinNames = new Set(['get_weather', 'get_exchange_rate', 'search_web_news'])
    if (next && !(row.endpoint_url ?? '').trim() && !builtinNames.has(row.tool_function_name)) {
      window.alert('외부 플러그인을 활성화하려면 HTTPS 호출 URL이 필요합니다.')
      return
    }
    setSavingId(row.id)
    try {
      const { error: uErr } = await supabase
        .from('plugins')
        .update({ is_active: next })
        .eq('id', row.id)
      if (uErr) {
        window.alert(uErr.message)
        return
      }
      await load()
    } finally {
      setSavingId(null)
    }
  }

  async function addPlugin(e: FormEvent) {
    e.preventDefault()
    const name = formName.trim()
    const tool_function_name = formToolFn.trim().replace(/\s+/g, '_')
    const endpoint_url = formUrl.trim()
    if (!name.length || !tool_function_name.length) {
      window.alert('이름과 도구 함수명(tool_function_name)은 필수입니다.')
      return
    }
    if (endpoint_url && !endpoint_url.startsWith('https://')) {
      window.alert('플러그인 호출 URL은 HTTPS 주소만 사용할 수 있습니다.')
      return
    }

    setFormBusy(true)
    try {
      const { error: insErr } = await supabase.from('plugins').insert({
        name,
        description: formDesc.trim(),
        tool_function_name,
        endpoint_url,
        auth_type: formAuthType,
        auth_header_name: formAuthHeader.trim() || 'Authorization',
        connection_mode: formConnectionMode,
        setup_url: formSetupUrl.trim() || null,
        docs_url: formDocsUrl.trim() || null,
        is_active: false,
      })
      if (insErr) {
        window.alert(insErr.message)
        return
      }
      setFormName('')
      setFormDesc('')
      setFormToolFn('')
      setFormUrl('')
      setFormAuthType('none')
      setFormAuthHeader('Authorization')
      setFormConnectionMode('admin_shared')
      setFormSetupUrl('')
      setFormDocsUrl('')
      await load()
    } finally {
      setFormBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          플러그인 관리
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          활성화된 플러그인만 Edge AI 호출 시 동적 도구로 로드됩니다. 비활성 행은 모델에 노출되지
          않습니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={addPlugin}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-4"
        >
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            새 플러그인 등록
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            등록 직후에는 비활성 상태입니다. 호출 URL 을 연결한 뒤 목록에서 ON 할 수 있습니다.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              표시 이름
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="예: 내부 견적 API"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              도구 함수명{' '}
              <span className="font-normal normal-case text-slate-400">
                (tool_function_name)
              </span>
              <input
                value={formToolFn}
                onChange={(e) => setFormToolFn(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="get_internal_quote"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              설명
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="모델에게 노출될 도구 설명"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              호출 URL{' '}
              <span className="font-normal normal-case text-slate-400">(선택)</span>
              <input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="https://… 비우면 Edge 에서 호출 스킵"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              인증 방식
              <select value={formAuthType} onChange={(e) => setFormAuthType(e.target.value as PluginRow['auth_type'])} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="none">인증 없음</option><option value="bearer">Bearer Token</option><option value="api_key">API Key Header</option>
              </select>
            </label>
            {formAuthType !== 'none' && <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">인증 헤더 이름<input value={formAuthHeader} onChange={(e) => setFormAuthHeader(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950" placeholder={formAuthType === 'bearer' ? 'Authorization' : 'X-API-Key'} /></label>}
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">연결 방식<select value={formConnectionMode} onChange={(e) => setFormConnectionMode(e.target.value as PluginRow['connection_mode'])} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="admin_shared">관리자 공용</option><option value="per_user">사용자별</option><option value="workspace_install">관리자 설치형</option><option value="hybrid">개인/공용 선택</option></select></label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">키 발급 URL<input type="url" value={formSetupUrl} onChange={(e) => setFormSetupUrl(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">공식 문서 URL<input type="url" value={formDocsUrl} onChange={(e) => setFormDocsUrl(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
          </div>
          <button
            type="submit"
            disabled={formBusy}
            className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            등록
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              레지스트리
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              행 우측 스위치로 즉시 활성/비활성을 전환합니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/80 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3">플러그인</th>
                  <th className="px-6 py-3">함수명</th>
                  <th className="px-6 py-3">엔드포인트</th>
                  <th className="px-6 py-3 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      불러오는 중…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      등록된 플러그인이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="max-w-[14rem] px-6 py-4 align-middle">
                        <p
                          id={`plug-${p.id}-title`}
                          className="font-semibold text-slate-900 dark:text-slate-50"
                        >
                          {p.name}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {p.description?.trim() ? p.description : '설명 없음'}
                        </p>
                      </td>
                      <td className="px-6 py-4 align-middle">
                        <code className="rounded-md bg-slate-100 px-2 py-1 text-[17px] font-semibold text-indigo-800 dark:bg-slate-800 dark:text-indigo-300">
                          {p.tool_function_name?.trim() || '—'}
                        </code>
                      </td>
                      <td className="max-w-[12rem] px-6 py-4 align-middle">
                        <p className="truncate font-mono text-[17px] text-slate-600 dark:text-slate-300">
                          {(p.endpoint_url ?? '').trim()
                            ? p.endpoint_url
                            : '— (미설정)'}
                        </p>
                        <p className="mt-1 text-[15px] text-slate-400">
                          {p.auth_type === 'none' ? '인증 없음' : `${p.auth_type} · ${p.connection_mode}`}
                        </p>
                      </td>
                      <td className="px-6 py-4 align-middle">
                        <div className="flex flex-col items-center gap-2">
                          <ToggleSwitch
                            labelledBy={`plug-${p.id}-title`}
                            checked={p.is_active}
                            busy={savingId === p.id}
                            disabled={savingId !== null && savingId !== p.id}
                            onToggle={(next) => void setPluginActive(p, next)}
                          />
                          <span
                            className={[
                              'text-xs font-semibold uppercase tracking-wide',
                              p.is_active
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400',
                            ].join(' ')}
                          >
                            {p.is_active ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
