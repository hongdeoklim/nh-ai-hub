import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'
import {
  fetchUserAiProfileMarkdown,
  upsertUserAiProfileMarkdown,
} from '../../services/user-ai-profile-context'

type UserAiProfilePanelProps = {
  userId: string | undefined
}

export function UserAiProfilePanel({ userId }: UserAiProfilePanelProps) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setMessage(null)
    try {
      const initial = await fetchUserAiProfileMarkdown(supabase, userId)
      setText(initial ?? '')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function handleSave() {
    if (!userId) {
      window.alert('로그인이 필요합니다.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const result = await upsertUserAiProfileMarkdown(supabase, userId, text)
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setMessage('저장했습니다. 이후 AI 응답은 서버에서 이 내용을 시스템 컨텍스트로 활용합니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!userId) {
    return <p className="text-[20px] text-stone-600 dark:text-stone-400">로그인 후 사용할 수 있습니다.</p>
  }

  return (
    <section className="space-y-3">
      <p className="font-semibold text-stone-900 dark:text-stone-100">
        AI 스킬 / 기억 (마크다운)
      </p>
      <p className="text-[20px] text-stone-600 dark:text-stone-400">
        자주 쓰는 용어, 문체, 업무 맥락을 간단히 적어 두면 AI가 답변에 반영합니다. 비밀번호·개인식별번호 등
        민감정보는 적지 마세요. 서버에서 길이가 길 경우 일부만 사용됩니다.
      </p>
      {loading ? (
        <p className="text-[20px] text-stone-500">불러오는 중…</p>
      ) : (
        <textarea
          value={text}
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[20px] leading-relaxed text-stone-900 shadow-inner outline-none ring-orange-700/25 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 md:text-sm"
          placeholder={`예)\n- 톤: 간결한 보고서체\n- 용어: "현장"은 건설 현장 의미`}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void handleSave()}
          className="rounded-lg bg-orange-800 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void load()}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          다시 불러오기
        </button>
      </div>
      {message ? (
        <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[20px] text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
          {message}
        </p>
      ) : null}
    </section>
  )
}
