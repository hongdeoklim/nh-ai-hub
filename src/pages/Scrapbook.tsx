import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import { supabase } from '../lib/supabase'
import {
  fetchMyBookmarkedChats,
  type BookmarkedChatRow,
} from '../services/scrapbook/bookmarked-chats'

function clipOneLine(text: string, max = 160): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

/** 스키마 미적용·조회 실패 시 UI 뼈대 확인용 (실데이터가 있으면 사용하지 않음) */
const MOCK_SCRAPS: BookmarkedChatRow[] = [
  {
    id: 'mock-1',
    user_id: 'mock',
    prompt: '(예시) 현장 안전 점검 시 우선 확인할 항목을 요약해 줘.',
    ai_response:
      '(예시 답변) 보호구 착용, 동선·비계 상태, 화기 작업 허가, 비상 연락망을 우선 점검하는 것이 좋습니다.',
    note: '안전교육 자료용',
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-2',
    user_id: 'mock',
    prompt: '(예시) 계약서 특약 우선순위를 어떻게 잡을까?',
    ai_response:
      '(예시 답변) 지급·하자·계약 해제·준법 조항을 상위 그룹으로 묶고, 모호한 표현은 부속합의서로 명확히 하는 편이 안전합니다.',
    note: '',
    created_at: new Date().toISOString(),
  },
]

export function Scrapbook() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<BookmarkedChatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.id) {
      setRows([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const res = await fetchMyBookmarkedChats(supabase, profile.id)
    if (!res.ok) {
      setError(res.message)
      setRows([])
    } else {
      setRows(res.rows)
    }
    setLoading(false)
  }, [profile])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const displayRows = useMemo(() => {
    if (rows.length > 0) return rows
    if (error) return MOCK_SCRAPS
    return rows
  }, [rows, error])

  const showMockBanner = Boolean(error) && rows.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#FAF9F6] dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200/90 bg-[#FAF9F6]/95 px-4 py-4 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/95 md:px-8 md:py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-900/90 dark:text-orange-300">
              Scrapbook
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 md:text-2xl">
              ⭐️ 내 스크랩북
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              대화 화면에서 AI 답변을 스크랩하면 여기에 모입니다. 마이그레이션 적용 후 실데이터가
              표시됩니다.
            </p>
          </div>
          <Link
            to="/"
            className="mt-3 shrink-0 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800 md:mt-0"
          >
            ← 대화로 돌아가기
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:gap-6 md:px-8 md:py-8">
        {showMockBanner ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
            <span className="font-semibold">데모 레이아웃입니다.</span> 목록을 불러오지 못했습니다(
            {error}). Supabase에 마이그레이션을 적용했는지 확인해 주세요.
          </div>
        ) : null}

        {!profile?.id ? (
          <p className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
            프로필을 불러온 뒤 스크랩 목록을 표시합니다.
          </p>
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl bg-stone-200/80 dark:bg-stone-800/80"
              />
            ))}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-12 text-center dark:border-stone-600 dark:bg-stone-900/40">
            <p className="text-base font-semibold text-stone-800 dark:text-stone-100">
              아직 스크랩한 대화가 없습니다
            </p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              대화 탭에서 AI 답변 아래 <span className="font-semibold">⭐️ 스크랩</span>을 눌러 저장해
              보세요.
            </p>
          </div>
        ) : (
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayRows.map((row, i) => (
              <article
                key={row.id}
                className={`flex flex-col rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 ${
                  i === 0 ? 'sm:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-900 dark:bg-orange-950/80 dark:text-orange-100">
                    Prompt
                  </span>
                  <time
                    className="shrink-0 text-[11px] tabular-nums text-stone-500 dark:text-stone-500"
                    dateTime={row.created_at}
                  >
                    {formatWhen(row.created_at)}
                  </time>
                </div>
                <p className="mt-3 text-[17px] font-medium leading-snug text-stone-900 dark:text-stone-50">
                  {clipOneLine(row.prompt, i === 0 ? 240 : 140)}
                </p>
                <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    AI 응답
                  </span>
                  <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                    {clipOneLine(row.ai_response, i === 0 ? 420 : 220)}
                  </p>
                </div>
                {row.note.trim().length > 0 ? (
                  <div className="mt-4 rounded-2xl bg-stone-50 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800/80 dark:text-stone-300">
                    <span className="font-semibold text-stone-800 dark:text-stone-100">메모 · </span>
                    {row.note}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
