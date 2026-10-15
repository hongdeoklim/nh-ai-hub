import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import { supabase } from '../lib/supabase'
import {
 deleteBookmarkedChat,
 fetchMyBookmarkedChats,
 updateBookmarkedChatNote,
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
 const [deletingId, setDeletingId] = useState<string | null>(null)
 const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
 const [noteDraft, setNoteDraft] = useState('')
 const [savingNote, setSavingNote] = useState(false)

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
 const isMockView = showMockBanner

 const handleDelete = useCallback(
 async (row: BookmarkedChatRow) => {
 if (!profile?.id || isMockView) return
 if (!window.confirm('이 스크랩을 삭제할까요? 되돌릴 수 없습니다.')) return
 setDeletingId(row.id)
 const prev = rows
      // 낙관적 제거 — 실패 시 롤백
 setRows((current) => current.filter((r) => r.id !== row.id))
 const res = await deleteBookmarkedChat(supabase, { id: row.id, userId: profile.id })
 if (!res.ok) {
 setRows(prev)
 setError(res.message)
      }
 setDeletingId(null)
    },
    [profile, rows, isMockView],
  )

 const startEditNote = useCallback((row: BookmarkedChatRow) => {
 setEditingNoteId(row.id)
 setNoteDraft(row.note ?? '')
  }, [])

 const cancelEditNote = useCallback(() => {
 setEditingNoteId(null)
 setNoteDraft('')
  }, [])

 const handleSaveNote = useCallback(
 async (row: BookmarkedChatRow) => {
 if (!profile?.id || isMockView) return
 const nextNote = noteDraft.trim()
 setSavingNote(true)
 const res = await updateBookmarkedChatNote(supabase, {
 id: row.id,
 userId: profile.id,
 note: nextNote,
      })
 if (res.ok) {
 setRows((current) =>
 current.map((r) => (r.id === row.id ? { ...r, note: nextNote } : r)),
        )
 setEditingNoteId(null)
 setNoteDraft('')
      } else {
 setError(res.message)
      }
 setSavingNote(false)
    },
    [profile, isMockView, noteDraft],
  )

 return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg">
      <header className="shrink-0 border-b border-border/90 bg-bg px-4 py-4 backdrop-blur-md md:px-8 md:py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
 Scrapbook
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg md:text-2xl">
              ⭐️ 내 스크랩북
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
 대화 화면에서 AI 답변을 스크랩하면 여기에 모입니다. 마이그레이션 적용 후 실데이터가
 표시됩니다.
            </p>
          </div>
          <Link
 to="/"
 className="mt-3 shrink-0 rounded-xl border border-border-strong bg-surface px-4 py-2 text-xs font-semibold text-fg shadow-sm hover:bg-surface-2 md:mt-0"
          >
            ← 대화로 돌아가기
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:gap-6 md:px-8 md:py-8">
        {showMockBanner ? (
          <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            <span className="font-semibold">데모 레이아웃입니다.</span> 목록을 불러오지 못했습니다(
            {error}). Supabase에 마이그레이션을 적용했는지 확인해 주세요.
          </div>
        ) : null}

        {!profile?.id ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
 프로필을 불러온 뒤 스크랩 목록을 표시합니다.
          </p>
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
 key={i}
 className="h-40 animate-pulse rounded-2xl bg-surface-3/80"
              />
            ))}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border-strong bg-surface/70 px-6 py-12 text-center">
            <p className="text-base font-semibold text-fg">
 아직 스크랩한 대화가 없습니다
            </p>
            <p className="mt-2 text-sm text-fg-muted">
 대화 탭에서 AI 답변 아래 <span className="font-semibold">⭐️ 스크랩</span>을 눌러 저장해
 보세요.
            </p>
          </div>
        ) : (
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayRows.map((row, i) => (
              <article
 key={row.id}
 className={`flex flex-col rounded-3xl border border-border/90 bg-surface p-5 shadow-sm ${
 i === 0 ? 'sm:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
 Prompt
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <time
 className="text-[11px] tabular-nums text-fg-subtle"
 dateTime={row.created_at}
                    >
                      {formatWhen(row.created_at)}
                    </time>
                    {!isMockView ? (
                      <button
 type="button"
 title="스크랩 삭제"
 aria-label="스크랩 삭제"
 disabled={deletingId === row.id}
 onClick={() => void handleDelete(row)}
 className="flex h-[28px] w-[28px] items-center justify-center rounded-lg text-fg-subtle transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 text-[17px] font-medium leading-snug text-fg">
                  {clipOneLine(row.prompt, i === 0 ? 240 : 140)}
                </p>
                <div className="mt-4 border-t border-border pt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
 AI 응답
                  </span>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {clipOneLine(row.ai_response, i === 0 ? 420 : 220)}
                  </p>
                </div>
                <div className="mt-4">
                  {editingNoteId === row.id ? (
                    <div className="rounded-2xl bg-bg p-2.5">
                      <textarea
 value={noteDraft}
 onChange={(e) => setNoteDraft(e.target.value)}
 rows={2}
 autoFocus
 placeholder="이 스크랩에 대한 메모를 남겨보세요."
 className="w-full resize-none rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-focus/40"
                      />
                      <div className="mt-1.5 flex items-center justify-end gap-1.5">
                        <button
 type="button"
 onClick={cancelEditNote}
 disabled={savingNote}
 className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-fg-subtle hover:bg-surface-3/60 disabled:opacity-50"
                        >
 취소
                        </button>
                        <button
 type="button"
 onClick={() => void handleSaveNote(row)}
 disabled={savingNote}
 className="rounded-lg bg-brand px-3 py-1 text-[12px] font-semibold text-brand-fg hover:bg-brand-strong disabled:opacity-50"
                        >
                          {savingNote ? '저장 중…' : '저장'}
                        </button>
                      </div>
                    </div>
                  ) : row.note.trim().length > 0 ? (
                    <button
 type="button"
 onClick={() => !isMockView && startEditNote(row)}
 className="flex w-full items-start gap-1.5 rounded-2xl bg-bg px-3 py-2 text-left text-[12px] text-fg-muted transition hover:bg-surface-2"
                    >
                      <span className="font-semibold text-fg">메모 · </span>
                      <span className="min-w-0 flex-1">{row.note}</span>
                      {!isMockView ? <span className="shrink-0 text-fg-subtle">✎</span> : null}
                    </button>
                  ) : !isMockView ? (
                    <button
 type="button"
 onClick={() => startEditNote(row)}
 className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-fg-subtle transition hover:bg-surface-2 hover:text-fg-muted"
                    >
                      ✎ 메모 추가
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
