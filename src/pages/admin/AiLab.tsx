import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../components/auth/useAuth'
import { supabase } from '../../lib/supabase'
import {
  invokeAiChat,
  type AiToolTraceEntry,
} from '../../services/ai/invoke-chat'

const MODEL_PRESETS = [
  { id: 'auto', label: '자동 라우팅' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

type ActivePluginChip = {
  tool_function_name: string
  name: string
  is_active: boolean
}

export function AiLab() {
  const { profile } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [preferredAi, setPreferredAi] = useState(MODEL_PRESETS[1].id)
  const [labMode, setLabMode] = useState<'append' | 'replace'>('append')
  const [labSystem, setLabSystem] = useState(
    '당신은 관리자 실험실에서 동작하는 테스트 어시스턴트입니다. 사용자가 날씨·환율을 물으면 활성화된 도구를 사용하세요.',
  )
  const [toolTraces, setToolTraces] = useState<AiToolTraceEntry[]>([])
  const [activePlugins, setActivePlugins] = useState<ActivePluginChip[]>([])

  const loadActivePlugins = useCallback(async () => {
    const { data, error } = await supabase
      .from('plugins')
      .select('name, tool_function_name, is_active')
      .order('name', { ascending: true })

    if (error) {
      console.error('[AiLab] plugins 조회 실패', error)
      setActivePlugins([])
      return
    }

    setActivePlugins(
      (data ?? []) as ActivePluginChip[],
    )
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadActivePlugins())
  }, [loadActivePlugins])

  const enabledToolNames = useMemo(
    () =>
      activePlugins
        .filter((p) => p.is_active)
        .map((p) => p.tool_function_name)
        .filter(Boolean),
    [activePlugins],
  )

  const run = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || !profile) return
    setBusy(true)
    setReply('')
    setToolTraces([])
    try {
      const res = await invokeAiChat({
        supabase,
        messages: [{ role: 'user', content: trimmed }],
        activeModel: preferredAi,
        tokenLimit: profile.token_limit,
        currentTokenUsage: profile.current_token_usage,
        billingUserId: profile.id,
        experimental_lab: {
          system_prompt: labSystem.trim(),
          system_prompt_mode: labMode,
          tool_debug: true,
        },
        onTextDelta: (d) => {
          setReply((prev) => prev + d)
        },
        onToolTrace: (entry) => {
          setToolTraces((prev) => [...prev, entry])
        },
      })
      if (!res.ok) {
        setReply((prev) =>
          prev ? `${prev}\n\n[오류] ${res.message}` : `[오류] ${res.message}`,
        )
        setToolTraces((prev) => [
          ...prev,
          {
            at: new Date().toISOString(),
            phase: 'error',
            message: res.message,
          },
        ])
      }
    } finally {
      setBusy(false)
      void loadActivePlugins()
    }
  }, [
    prompt,
    profile,
    preferredAi,
    labMode,
    labSystem,
    loadActivePlugins,
  ])

  const debugJson = useMemo(
    () => JSON.stringify(toolTraces, null, 2),
    [toolTraces],
  )

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            AI 실험실
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            운영 채팅과 분리된 샌드박스 · Edge `ai-chat` 경로 · 플러그인 ON/OFF 반영 · Tool
            Calling 디버그
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadActivePlugins()}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          플러그인 상태 새로고침
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {activePlugins.length === 0 ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            등록된 플러그인 없음
          </span>
        ) : (
          activePlugins.map((p) => (
            <span
              key={p.tool_function_name}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                p.is_active
                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  p.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              {p.name}{' '}
              <code className="font-mono text-[15px] opacity-80">
                {p.tool_function_name}
              </code>
            </span>
          ))
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            모델
            <select
              value={preferredAi}
              onChange={(e) => setPreferredAi(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {MODEL_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              시스템 프롬프트 덮어쓰기
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setLabMode('append')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
                  labMode === 'append'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                덧붙이기
              </button>
              <button
                type="button"
                onClick={() => setLabMode('replace')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
                  labMode === 'replace'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                교체
              </button>
            </div>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            시스템 프롬프트
            <textarea
              value={labSystem}
              onChange={(e) => setLabSystem(e.target.value)}
              rows={10}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            테스트 메시지
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="예: 서울 날씨 알려줘 / USD 환율은?"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <button
            type="button"
            disabled={busy || !prompt.trim() || !profile}
            onClick={() => void run()}
            className="w-full rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {busy ? '스트리밍 중…' : '실험 실행'}
          </button>

          <p className="text-[17px] leading-relaxed text-slate-500 dark:text-slate-400">
            현재 Edge 에 노출 중인 활성 도구:{' '}
            {enabledToolNames.length > 0
              ? enabledToolNames.join(', ')
              : '(없음 — 플러그인 관리에서 ON 하세요)'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-5">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            모델 출력
          </h2>
          <div className="mt-3 min-h-[420px] rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100">
            {reply || '여기에 스트리밍 결과가 표시됩니다.'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Debug Log · Tool Calling
            </h2>
            <button
              type="button"
              disabled={toolTraces.length === 0}
              onClick={() => setToolTraces([])}
              className="rounded-md px-2 py-1 text-[15px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
            >
              비우기
            </button>
          </div>
          <p className="mt-1 text-[17px] text-slate-500 dark:text-slate-400">
            `call` → 모델이 도구를 호출할 때 · `result` → execute 결과 · NDJSON 실시간 수신
          </p>
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-[17px] leading-relaxed text-emerald-300 dark:border-slate-700">
            {toolTraces.length > 0
              ? debugJson
              : '{\n  "info": "도구 호출 이벤트가 여기에 JSON 으로 쌓입니다."\n}'}
          </pre>
        </div>
      </div>
    </div>
  )
}
