import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import UniverWorkspace from '../components/workspace/UniverWorkspace.jsx'
import { supabase } from '../lib/supabase'
import {
  invokeAiChat,
  type UniverAiDataSignal,
  type UniverOfficeActiveTab,
  type UniverOfficeNavigationState,
} from '../services/ai/invoke-chat'

function readUniverOfficeNavigationState(
  value: unknown,
): UniverOfficeNavigationState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as UniverOfficeNavigationState
  if (!candidate.aiDataSignal || typeof candidate.aiDataSignal !== 'object') {
    return null
  }
  return candidate
}

export function UniverOfficePage() {
  const { profile } = useAuth()
  const location = useLocation()
  const [prompt, setPrompt] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [univerSignal, setUniverSignal] = useState<UniverAiDataSignal | null>(
    null,
  )
  const [univerActiveTab, setUniverActiveTab] =
    useState<UniverOfficeActiveTab>('sheets')

  useEffect(() => {
    const navState = readUniverOfficeNavigationState(location.state)
    if (!navState) return
    if (navState.activeTab) {
      setUniverActiveTab(navState.activeTab)
    }
    setUniverSignal(navState.aiDataSignal)
  }, [location.state])

  const preferredAi = useMemo(() => {
    const fromProfile = profile?.preferred_ai?.trim()
    return fromProfile && fromProfile.length > 0
      ? fromProfile
      : 'gemini-2.5-flash'
  }, [profile?.preferred_ai])

  const tokenLimit = profile?.token_limit ?? 0
  const currentTokenUsage = profile?.current_token_usage ?? 0

  const runChat = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || !profile) return

    setBusy(true)
    setReply('')

    try {
      const outcome = await invokeAiChat({
        supabase,
        messages: [{ role: 'user', content: trimmed }],
        activeModel: preferredAi,
        tokenLimit,
        currentTokenUsage,
        billingUserId: profile.id,
        onTextDelta: (delta) => {
          setReply((prev) => prev + delta)
        },
        onUniverOffice: ({ activeTab, aiDataSignal }) => {
          if (activeTab) {
            setUniverActiveTab(activeTab)
          }
          setUniverSignal(aiDataSignal)
        },
      })

      if (!outcome.ok) {
        setReply((prev) =>
          prev ? `${prev}\n\n[오류] ${outcome.message}` : `[오류] ${outcome.message}`,
        )
      }
    } finally {
      setBusy(false)
    }
  }, [
    prompt,
    profile,
    preferredAi,
    tokenLimit,
    currentTokenUsage,
  ])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex max-h-[48vh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-stone-200 p-3 dark:border-stone-800 md:max-h-none md:w-[58%] md:max-w-none md:border-b-0 md:border-r md:p-4">
          <UniverWorkspace
            aiDataSignal={univerSignal}
            activeTab={univerActiveTab}
            onActiveTabChange={setUniverActiveTab}
            className="h-full min-h-[28rem]"
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-stone-200 px-4 py-3 dark:border-stone-800 md:px-6">
            <h1 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              NH-AX-HUB 통합 오피스 · AI 채팅
            </h1>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              자연어로 기획서·정산서를 요청하면{' '}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-[11px] dark:bg-stone-900">
                inject_univer_office_data
              </code>{' '}
              도구가 Univer 캔버스에 실시간 주입합니다.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap text-stone-800 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
              {reply || '채팅 응답이 여기에 스트리밍됩니다.'}
            </div>
          </div>

          <div className="shrink-0 border-t border-stone-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-stone-800 md:px-6">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              AI 명령
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="예: 정산서 A1에 제목 넣고 B1에 =SUM(B2:B10) 수식 채워줘 / 기획서 초안 작성해줘"
                className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </label>
            <button
              type="button"
              disabled={busy || !prompt.trim() || !profile}
              onClick={() => void runChat()}
              className="mt-3 w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {busy ? '스트리밍 중…' : 'AI에게 오피스 작업 요청'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
