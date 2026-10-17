import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '../../auth/useAuth'
import { useAppUi } from '../../../contexts/AppUiContext'
import { supabase } from '../../../lib/supabase'
import { deleteRemotePrivateChatSession } from '../../../services/chat/private-chat-remote'
import {
  createPlannerSession,
  deletePlannerSession,
  fetchPlannerSessionSummaries,
  PLANNER_SESSIONS_UPDATED_EVENT,
  renamePlannerSession,
  type PlannerSessionSummary,
} from '../../../services/ai/planner-sessions'
import {
  deletePrivateChatThread,
  listPrivateChatThreads,
  loadPrivateChatState,
  PRIVATE_CHAT_STORAGE_UPDATED_EVENT,
  renamePrivateChatThread,
  searchPrivateChatThreads,
  togglePinPrivateChatThread,
} from '../../../lib/private-chat-storage'
import { ConfirmDialog, PromptDialog } from '../../common/ConfirmDialog'
import {
  IconClipboardList,
  IconPenSquare,
  IconSearch,
  IconTrash,
  IconX,
} from '../../common/icons'
import { PrivateChatThreadRow } from '../PrivateChatThreadRow'

type ConfirmState = {
  title: string
  description: string
  onConfirm: () => void
}

type PromptState = {
  title: string
  label: string
  defaultValue: string
  onSubmit: (value: string) => void
}

type ChatThreadsPanelProps = {
  /** 항목 선택 후 호출 (모바일 드로어 닫기 등) */
  onNavigate?: () => void
}

/**
 * 좌측 보조 패널 — 개인 채팅 스레드 목록 · 검색 · AI Planner 세션.
 * MainLayout 에서 분리된 자립 컴포넌트 (PC 패널 / 모바일 드로어 공용).
 */
export function ChatThreadsPanel({ onNavigate }: ChatThreadsPanelProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { requestNewChat } = useAppUi()

  const [privateThreadsTick, setPrivateThreadsTick] = useState(0)
  const [plannerSessions, setPlannerSessions] = useState<PlannerSessionSummary[]>([])
  const [plannerSessionsTick, setPlannerSessionsTick] = useState(0)
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [creatingPlanner, setCreatingPlanner] = useState(false)

  const plannerActive = location.pathname.startsWith('/ai-planner')
  const activePlannerSessionId = plannerActive
    ? location.pathname.match(/^\/ai-planner\/([^/]+)/)?.[1] ?? null
    : null

  useEffect(() => {
    function onUpdated() {
      setPrivateThreadsTick((n) => n + 1)
    }
    window.addEventListener(PRIVATE_CHAT_STORAGE_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(PRIVATE_CHAT_STORAGE_UPDATED_EVENT, onUpdated)
  }, [])

  useEffect(() => {
    function onUpdated() {
      setPlannerSessionsTick((n) => n + 1)
    }
    window.addEventListener(PLANNER_SESSIONS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(PLANNER_SESSIONS_UPDATED_EVENT, onUpdated)
  }, [])

  useEffect(() => {
    // Planner 화면에서만 세션 목록을 조회 (비활성 시 마지막 목록은 렌더에서 무시)
    if (!profile?.id || !plannerActive) return
    let cancelled = false
    void fetchPlannerSessionSummaries(supabase).then((rows) => {
      if (!cancelled) setPlannerSessions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, plannerSessionsTick, plannerActive, location.pathname])

  const visiblePlannerSessions = plannerActive && profile?.id ? plannerSessions : []

  const privateThreads = useMemo(
    () =>
      query.trim() ? searchPrivateChatThreads(query, 40) : listPrivateChatThreads(40),
    // 저장소 변경 이벤트(tick)와 경로 변경 시 재계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [privateThreadsTick, location.pathname, query],
  )

  const pinnedThreads = privateThreads.filter((t) => t.pinned)
  const recentThreads = privateThreads.filter((t) => !t.pinned)

  function handleShareThread(threadId: string) {
    const url = `${window.location.origin}/chat/${threadId}`
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success('대화 링크를 복사했습니다.'))
      .catch(() => toast.error('링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.'))
  }

  function handleTogglePinThread(threadId: string) {
    if (!togglePinPrivateChatThread(threadId)) {
      toast.error('고정 상태를 변경하지 못했습니다.')
      return
    }
    setOpenThreadMenuId(null)
    setPrivateThreadsTick((n) => n + 1)
  }

  function handleAddThreadToNotebook(threadId: string) {
    const state = loadPrivateChatState(threadId)
    const lines =
      state?.messages
        .filter((m) => !m.streaming && m.content.trim().length > 0)
        .map((m) => `[${m.role === 'user' ? '나' : 'AI'}]\n${m.content.trim()}`) ?? []

    if (lines.length > 0) {
      try {
        sessionStorage.setItem(
          'nh-ai-hub.notebook-import-from-chat',
          JSON.stringify({
            threadId,
            title: privateThreads.find((t) => t.threadId === threadId)?.title ?? '개인 채팅',
            text: lines.join('\n\n---\n\n'),
          }),
        )
      } catch {
        /* ignore */
      }
    }
    setOpenThreadMenuId(null)
    onNavigate?.()
    navigate('/notebook')
  }

  function handleRenameThread(threadId: string, currentTitle: string) {
    setPrompt({
      title: '대화 이름 변경',
      label: '대화 이름',
      defaultValue: currentTitle,
      onSubmit: (next) => {
        setPrompt(null)
        if (!renamePrivateChatThread(threadId, next)) {
          toast.error('이름을 저장하지 못했습니다.')
          return
        }
        setPrivateThreadsTick((n) => n + 1)
      },
    })
  }

  function handleDeleteThread(threadId: string) {
    setConfirm({
      title: '대화를 삭제할까요?',
      description: '목록과 서버 동기화 기록에서 함께 삭제되며 되돌릴 수 없습니다.',
      onConfirm: () => {
        setConfirm(null)
        if (!deletePrivateChatThread(threadId)) {
          toast.error('대화를 삭제하지 못했습니다.')
          return
        }
        if (profile?.id) void deleteRemotePrivateChatSession(supabase, threadId)
        setOpenThreadMenuId(null)
        setPrivateThreadsTick((n) => n + 1)
        toast.success('대화를 삭제했습니다.')
        if (location.pathname === `/chat/${threadId}`) requestNewChat()
      },
    })
  }

  function handleDeletePlannerSession(sessionId: string) {
    setConfirm({
      title: '기획 세션을 삭제할까요?',
      description: '세션의 대화와 생성된 기획서가 함께 삭제되며 되돌릴 수 없습니다.',
      onConfirm: () => {
        setConfirm(null)
        void deletePlannerSession(supabase, sessionId).then((res) => {
          if (!res.ok) {
            toast.error(`삭제하지 못했습니다: ${res.message}`)
            return
          }
          setPlannerSessionsTick((n) => n + 1)
          if (activePlannerSessionId === sessionId) navigate('/ai-planner')
        })
      },
    })
  }

  function handleRenamePlannerSession(sessionId: string, currentTitle: string) {
    setPrompt({
      title: '기획 세션 이름 변경',
      label: '세션 이름',
      defaultValue: currentTitle,
      onSubmit: (next) => {
        setPrompt(null)
        void renamePlannerSession(supabase, sessionId, next).then((res) => {
          if (!res.ok) {
            toast.error(`이름을 저장하지 못했습니다: ${res.message}`)
            return
          }
          setPlannerSessionsTick((n) => n + 1)
        })
      },
    })
  }

  async function handleNewPlannerSession() {
    setCreatingPlanner(true)
    try {
      const created = await createPlannerSession(supabase)
      if (!created.ok) {
        toast.error(created.message)
        return
      }
      onNavigate?.()
      navigate(`/ai-planner/${created.id}`)
    } finally {
      setCreatingPlanner(false)
    }
  }

  function handlePrimaryAction() {
    if (plannerActive) {
      void handleNewPlannerSession()
      return
    }
    requestNewChat()
    onNavigate?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-[12px] pt-[12px]">
        <button
          type="button"
          disabled={creatingPlanner}
          onClick={handlePrimaryAction}
          className="flex h-[40px] w-full items-center gap-[10px] rounded-[12px] bg-brand px-[12px] text-sm font-semibold text-brand-fg shadow-card transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-60"
        >
          <IconPenSquare className="h-[18px] w-[18px] shrink-0" />
          <span>{plannerActive ? '새 기획 세션' : '새 채팅'}</span>
        </button>

        {!plannerActive ? (
          <div className="relative mt-[10px]">
            <IconSearch className="pointer-events-none absolute left-[10px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-fg-subtle" />
            <label htmlFor="thread-search-field" className="sr-only">
              대화 검색
            </label>
            <input
              id="thread-search-field"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="대화 검색"
              className="h-[36px] w-full rounded-[10px] border border-border bg-surface-2/60 pl-[32px] pr-[30px] text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-brand focus:bg-surface focus:ring-2 focus:ring-focus/25"
            />
            {query ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => setQuery('')}
                className="absolute right-[6px] top-1/2 inline-flex h-[24px] w-[24px] -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
              >
                <IconX className="h-[14px] w-[14px]" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[8px] pb-[12px] pt-[10px]">
        {plannerActive ? (
          <section aria-label="기획 세션 목록">
            <p className="mb-[6px] px-[8px] text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              AI Planner · 기획 세션
            </p>
            {visiblePlannerSessions.length === 0 ? (
              <p className="px-[8px] py-[10px] text-sm leading-snug text-fg-muted">
                저장된 기획 세션이 여기에 표시됩니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-[2px]">
                {visiblePlannerSessions.map((session) => {
                  const isActive = activePlannerSessionId === session.id
                  return (
                    <li key={session.id} className="group relative flex items-center">
                      <Link
                        to={`/ai-planner/${session.id}`}
                        title={session.title}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onNavigate?.()}
                        className={`flex min-w-0 flex-1 items-center gap-[8px] rounded-[8px] py-[7px] pl-[8px] pr-[60px] text-left text-sm leading-snug transition-colors ${
                          isActive
                            ? 'bg-brand-soft font-medium text-fg'
                            : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                        }`}
                      >
                        <IconClipboardList className="h-[16px] w-[16px] shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 truncate">{session.title}</span>
                        {session.has_plan ? (
                          <span className="shrink-0 rounded-full bg-success-soft px-[6px] py-[1px] text-[10px] font-semibold text-success">
                            PRD
                          </span>
                        ) : null}
                      </Link>
                      <div className="absolute right-[4px] flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-fg-subtle hover:bg-surface-3 hover:text-fg"
                          title="이름 변경"
                          aria-label="기획 세션 이름 변경"
                          onClick={() => handleRenamePlannerSession(session.id, session.title)}
                        >
                          <IconPenSquare className="h-[14px] w-[14px]" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-fg-subtle hover:bg-danger-soft hover:text-danger"
                          title="삭제"
                          aria-label="기획 세션 삭제"
                          onClick={() => handleDeletePlannerSession(session.id)}
                        >
                          <IconTrash className="h-[14px] w-[14px]" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : (
          <section aria-label="개인 채팅 목록">
            {privateThreads.length === 0 ? (
              <p className="px-[8px] py-[10px] text-sm leading-snug text-fg-muted">
                {query.trim() ? '검색 결과가 없습니다.' : '저장된 대화가 여기에 표시됩니다.'}
              </p>
            ) : (
              <>
                {pinnedThreads.length > 0 ? (
                  <>
                    <p className="mb-[4px] px-[8px] text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                      고정
                    </p>
                    <ThreadList
                      threads={pinnedThreads}
                      openThreadMenuId={openThreadMenuId}
                      setOpenThreadMenuId={setOpenThreadMenuId}
                      onShare={handleShareThread}
                      onTogglePin={handleTogglePinThread}
                      onRename={handleRenameThread}
                      onAddToNotebook={handleAddThreadToNotebook}
                      onDelete={handleDeleteThread}
                      onNavigate={onNavigate}
                    />
                  </>
                ) : null}
                <p className="mb-[4px] mt-[6px] px-[8px] text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  {query.trim() ? '검색 결과' : '최근 대화'}
                </p>
                <ThreadList
                  threads={recentThreads}
                  openThreadMenuId={openThreadMenuId}
                  setOpenThreadMenuId={setOpenThreadMenuId}
                  onShare={handleShareThread}
                  onTogglePin={handleTogglePinThread}
                  onRename={handleRenameThread}
                  onAddToNotebook={handleAddThreadToNotebook}
                  onDelete={handleDeleteThread}
                  onNavigate={onNavigate}
                />
              </>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="삭제"
        tone="danger"
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
      <PromptDialog
        open={prompt !== null}
        title={prompt?.title ?? ''}
        label={prompt?.label ?? ''}
        defaultValue={prompt?.defaultValue ?? ''}
        onSubmit={(value) => prompt?.onSubmit(value)}
        onCancel={() => setPrompt(null)}
      />
    </div>
  )
}

type ThreadListProps = {
  threads: ReturnType<typeof listPrivateChatThreads>
  openThreadMenuId: string | null
  setOpenThreadMenuId: (updater: (current: string | null) => string | null) => void
  onShare: (id: string) => void
  onTogglePin: (id: string) => void
  onRename: (id: string, title: string) => void
  onAddToNotebook: (id: string) => void
  onDelete: (id: string) => void
  onNavigate?: () => void
}

function ThreadList({
  threads,
  openThreadMenuId,
  setOpenThreadMenuId,
  onShare,
  onTogglePin,
  onRename,
  onAddToNotebook,
  onDelete,
  onNavigate,
}: ThreadListProps) {
  if (threads.length === 0) return null
  return (
    <ul className="flex flex-col gap-[2px]">
      {threads.map((t) => (
        <li key={t.threadId}>
          <PrivateChatThreadRow
            thread={t}
            menuOpen={openThreadMenuId === t.threadId}
            onToggleMenu={() =>
              setOpenThreadMenuId((current) => (current === t.threadId ? null : t.threadId))
            }
            onCloseMenu={() => setOpenThreadMenuId(() => null)}
            onShare={onShare}
            onTogglePin={onTogglePin}
            onRename={onRename}
            onAddToNotebook={onAddToNotebook}
            onDelete={onDelete}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  )
}
