import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { AccountHeaderActions, IconSettings, IconLogout } from './AccountHeaderActions'
import { SettingsDialog, type SettingsTab } from '../settings/SettingsDialog'
import { TokenRequestModal } from '../settings/TokenRequestModal'
import { PrivateChatThreadRow } from './PrivateChatThreadRow'
import { useAppUi } from '../../contexts/AppUiContext'
import { isAdminProfile } from '../../lib/admin-access'
import { supabase } from '../../lib/supabase'
import { deleteRemotePrivateChatSession } from '../../services/chat/private-chat-remote'
import {
  createPlannerSession,
  deletePlannerSession,
  fetchPlannerSessionSummaries,
  PLANNER_SESSIONS_UPDATED_EVENT,
  renamePlannerSession,
  type PlannerSessionSummary,
} from '../../services/ai/planner-sessions'
import {
  deletePrivateChatThread,
  listPrivateChatThreads,
  loadPrivateChatState,
  PRIVATE_CHAT_STORAGE_UPDATED_EVENT,
  rememberLastPrivateThread,
  renamePrivateChatThread,
  searchPrivateChatThreads,
  togglePinPrivateChatThread,
} from '../../lib/private-chat-storage'

function IconPromptChevronsLeft(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m15 18-6-6 6-6M21 18l-6-6 6-6"
      />
    </svg>
  )
}

function IconPromptChevronsRight(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m9 18 6-6-6-6"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m15 18 6-6-6-6"
      />
    </svg>
  )
}

function IconTeams(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      />
    </svg>
  )
}

function IconSlides(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 4h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 16v2M8 20h8"
      />
    </svg>
  )
}

function IconSheets(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
      <path
        strokeLinecap="round"
        strokeWidth={2}
        d="M3 9h18M3 15h18M9 3v18"
      />
    </svg>
  )
}

function IconWorkflows(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h6v6H4V6zM14 6h6v6h-6V6zM9 14h6v6H9v-6z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 9h4M12 12v5"
      />
    </svg>
  )
}
function IconPlanner(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  )
}

function IconDesigner(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 19h14M8 16h8"
      />
    </svg>
  )
}

function IconBookmark(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  )
}

function IconFolder(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  )
}

function IconLink(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.828 10.172a4 4 0 010 5.656l-1.414 1.414a4 4 0 01-5.656-5.656l1.414-1.414M10.172 13.828a4 4 0 010-5.656l1.414-1.414a4 4 0 015.656 5.656l-1.414 1.414"
      />
    </svg>
  )
}

function IconNotebook(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  )
}

function IconTokenRequest(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6c-3.866 0-7 1.343-7 3s3.134 3 7 3 7-1.343 7-3-3.134-3-7-3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 9v3c0 1.657 3.134 3 7 3s7-1.343 7-3V9"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3"
      />
    </svg>
  )
}

function IconSearch(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}

function IconLibrary(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M4 6h16M4 10h16M4 14h10M4 18h14"
      />
      <rect x="15" y="14" width="5" height="5" rx="1" strokeWidth={1.75} />
    </svg>
  )
}

function IconGeminiNewChat(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 20h9"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
      />
    </svg>
  )
}

const SIDEBAR_WIDTH_MOBILE = 'min(308px, 100vw)'

const sidebarIconDockClass =
  'flex h-9 w-full items-center justify-center text-stone-700 transition hover:bg-stone-100/90 dark:text-stone-200 dark:hover:bg-stone-800/80'

const sidebarIconDockLabelClass =
  'hidden text-sm font-medium leading-snug'

const sidebarIconDockAdminClass =
  `${sidebarIconDockClass} font-bold text-amber-950 hover:bg-amber-50/90 dark:text-amber-100 dark:hover:bg-amber-950/40`

const sidebarIconDockEmptyClass =
  'block h-9 w-full bg-stone-50/40 dark:bg-stone-950/20'

const sidebarNewChatClass =
  'flex h-[1.8rem] min-h-[1.8rem] w-full shrink-0 items-center rounded-full text-left transition-colors hover:bg-stone-200/60 active:bg-stone-200/80 dark:hover:bg-stone-800/45 dark:active:bg-stone-800/60'

export function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('mypage')
  const [tokenRequestOpen, setTokenRequestOpen] = useState(false)
  const [privateThreadsTick, setPrivateThreadsTick] = useState(0)
  const [plannerSessions, setPlannerSessions] = useState<PlannerSessionSummary[]>([])
  const [plannerSessionsTick, setPlannerSessionsTick] = useState(0)
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null)
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  const [threadSearchQuery, setThreadSearchQuery] = useState('')

  const [isAppFolderOpen, setIsAppFolderOpen] = useState(false)
  const threadSearchInputRef = useRef<HTMLInputElement>(null)
  const showExpandedSidebarContent = !sidebarCollapsed || isMobileMenuOpen
  const showExpandedSidebarDock = !sidebarCollapsed
  const { profile, profileError, signOut } = useAuth()
  const {
    requestNewChat,
    promptPanel,
    registerOpenSettingsHandler,
    registerNewChatFallback,
  } = useAppUi()

  useEffect(() => {
    registerOpenSettingsHandler((tab) => {
      if (tab) setSettingsTab(tab as SettingsTab)
      setSettingsOpen(true)
    })
    return () => registerOpenSettingsHandler(null)
  }, [registerOpenSettingsHandler])

  useEffect(() => {
    function startNewChatFallback() {
      const nid = crypto.randomUUID()
      rememberLastPrivateThread(nid)
      navigate(`/chat/${nid}`)
    }
    registerNewChatFallback(startNewChatFallback)
    return () => registerNewChatFallback(null)
  }, [registerNewChatFallback, navigate])

  useEffect(() => {
    function onPrivateChatStorageUpdated() {
      setPrivateThreadsTick((n) => n + 1)
    }
    window.addEventListener(
      PRIVATE_CHAT_STORAGE_UPDATED_EVENT,
      onPrivateChatStorageUpdated,
    )
    return () => {
      window.removeEventListener(
        PRIVATE_CHAT_STORAGE_UPDATED_EVENT,
        onPrivateChatStorageUpdated,
      )
    }
  }, [])

  useEffect(() => {
    function onPlannerSessionsUpdated() {
      setPlannerSessionsTick((n) => n + 1)
    }
    window.addEventListener(PLANNER_SESSIONS_UPDATED_EVENT, onPlannerSessionsUpdated)
    return () => {
      window.removeEventListener(PLANNER_SESSIONS_UPDATED_EVENT, onPlannerSessionsUpdated)
    }
  }, [])

  useEffect(() => {
    if (!profile?.id) {
      setPlannerSessions([])
      return
    }
    let cancelled = false
    void fetchPlannerSessionSummaries(supabase).then((rows) => {
      if (!cancelled) setPlannerSessions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [profile?.id, plannerSessionsTick, location.pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onEscape)
    }
  }, [isMobileMenuOpen])

  const privateThreads = useMemo(
    () =>
      threadSearchQuery.trim()
        ? searchPrivateChatThreads(threadSearchQuery, 35)
        : listPrivateChatThreads(35),
    [privateThreadsTick, location.pathname, threadSearchQuery],
  )

  useEffect(() => {
    if (!threadSearchOpen) return
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setThreadSearchOpen(false)
        setThreadSearchQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [threadSearchOpen])

  useEffect(() => {
    if (sidebarCollapsed) {
      setThreadSearchOpen(false)
      setThreadSearchQuery('')
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (threadSearchOpen && showExpandedSidebarContent) {
      queueMicrotask(() => threadSearchInputRef.current?.focus())
    }
  }, [threadSearchOpen, showExpandedSidebarContent])

  function openThreadSearch() {
    if (sidebarCollapsed) setSidebarCollapsed(false)
    setIsMobileMenuOpen(true)
    setThreadSearchOpen(true)
  }

  function closeThreadSearch() {
    setThreadSearchOpen(false)
    setThreadSearchQuery('')
  }

  const libraryActive = location.pathname === '/library'
  const plannerActive = location.pathname.startsWith('/ai-planner')
  const activePlannerSessionId = plannerActive
    ? location.pathname.match(/^\/ai-planner\/([^/]+)/)?.[1] ?? null
    : null

  const displayName =
    profile?.display_name?.trim() ||
    (profile?.email ? profile.email.split('@')[0] ?? profile.email : '') ||
    '프로필 로드 중'
  const department = profile?.department?.trim() || '부서 미등록'
  const rankTitleLine = [profile?.job_rank?.trim(), profile?.job_title?.trim()]
    .filter(Boolean)
    .join(' · ')
  const tokenLimit = profile?.token_limit ?? 0
  const currentUsage = profile?.current_token_usage ?? 0
  const remaining = Math.max(0, tokenLimit - currentUsage)
  const remainingPct =
    tokenLimit > 0 ? Math.round((remaining / tokenLimit) * 100) : 0

  const initial = displayName.slice(0, 1).toUpperCase()

  function handleShareThread(threadId: string) {
    const url = `${window.location.origin}/chat/${threadId}`
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        window.alert('대화 링크가 클립보드에 복사되었습니다.')
      })
      .catch(() => {
        window.prompt('아래 링크를 복사하세요.', url)
      })
  }

  function handleTogglePinThread(threadId: string) {
    if (!togglePinPrivateChatThread(threadId)) {
      window.alert('고정 상태를 변경하지 못했습니다.')
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
        .map((m) => {
          const role = m.role === 'user' ? '나' : 'AI'
          return `[${role}]\n${m.content.trim()}`
        }) ?? []

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
    setIsMobileMenuOpen(false)
    navigate('/notebook')
  }

  function handleRenameThread(threadId: string, currentTitle: string) {
    const next = window.prompt('대화 이름', currentTitle)
    if (next === null) return
    if (!renamePrivateChatThread(threadId, next)) {
      window.alert('이름을 저장하지 못했습니다.')
      return
    }
    setPrivateThreadsTick((n) => n + 1)
  }

  function handleDeleteThread(threadId: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('이 대화를 목록에서 삭제할까요? 되돌릴 수 없습니다.')
    ) {
      return
    }
    if (!deletePrivateChatThread(threadId)) {
      window.alert('대화를 삭제하지 못했습니다.')
      return
    }
    if (profile?.id) {
      void deleteRemotePrivateChatSession(supabase, threadId)
    }
    setOpenThreadMenuId(null)
    setPrivateThreadsTick((n) => n + 1)
    if (location.pathname === `/chat/${threadId}`) {
      requestNewChat()
    }
  }

  function handleDeletePlannerSession(sessionId: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('이 기획 세션을 삭제할까요? 되돌릴 수 없습니다.')
    ) {
      return
    }
    void deletePlannerSession(supabase, sessionId).then((res) => {
      if (!res.ok) {
        window.alert(`삭제하지 못했습니다: ${res.message}`)
        return
      }
      setPlannerSessionsTick((n) => n + 1)
      if (activePlannerSessionId === sessionId) {
        navigate('/ai-planner')
      }
    })
  }

  function handleRenamePlannerSession(sessionId: string, currentTitle: string) {
    const next = window.prompt('기획 세션 이름', currentTitle)
    if (next === null) return
    void renamePlannerSession(supabase, sessionId, next).then((res) => {
      if (!res.ok) {
        window.alert(`이름을 저장하지 못했습니다: ${res.message}`)
        return
      }
      setPlannerSessionsTick((n) => n + 1)
    })
  }

  async function handleNewPlannerSession() {
    const created = await createPlannerSession(supabase)
    if (!created.ok) {
      window.alert(created.message)
      return
    }
    setIsMobileMenuOpen(false)
    navigate(`/ai-planner/${created.id}`)
  }

  return (
    <div className="app-shell flex h-dvh w-full bg-[#EBE9E4] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* 모바일 오버레이 백드롭 */}
      {isMobileMenuOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      {/* 모바일 플로팅 폴더 버튼 삭제됨 */}

      {/* 사이드바 */}
      <aside
        id="app-sidebar"
        aria-label="앱 메뉴"
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-stone-300/80 bg-[#F4F1EA] shadow-xl transition-all duration-300 ease-out dark:border-stone-700 dark:bg-stone-900 ${
          isMobileMenuOpen ? 'translate-x-0' : 'max-md:-translate-x-full'
        } ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[72px] md:w-[308px] max-md:w-[min(308px,100vw)]'
        } md:translate-x-0 md:shadow-none`}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 px-0 pt-2">
          <div
            className={`flex w-full shrink-0 ${
              sidebarCollapsed
                ? 'flex-col items-center gap-1'
                : `flex-row items-center gap-2 ${
                    promptPanel ? 'justify-between' : 'justify-start'
                  }`
            }`}
          >
            <button
              type="button"
              className="rounded-lg p-2 text-stone-800 hover:bg-stone-200/80 dark:text-stone-200 dark:hover:bg-stone-800"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-expanded={!sidebarCollapsed}
              aria-controls="app-sidebar"
              aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                {sidebarCollapsed ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h13M14 9l3 3-3 3M4 18h16"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
            {promptPanel ? (
              <div
                className={`flex items-center gap-0.5 ${
                  sidebarCollapsed ? 'flex-col' : 'ml-auto'
                }`}
              >
                <button
                  type="button"
                  className={`rounded-lg p-2 transition hover:bg-stone-200/80 dark:hover:bg-stone-800 ${
                    threadSearchOpen
                      ? 'bg-stone-200/80 text-stone-900 dark:bg-stone-800 dark:text-stone-50'
                      : 'text-stone-700 dark:text-stone-200'
                  }`}
                  aria-expanded={threadSearchOpen}
                  aria-controls="sidebar-thread-search"
                  aria-label={threadSearchOpen ? '채팅 검색 닫기' : '채팅 검색'}
                  title={threadSearchOpen ? '채팅 검색 닫기' : '채팅 검색'}
                  onClick={() => {
                    if (sidebarCollapsed) setSidebarCollapsed(false)
                    if (threadSearchOpen) closeThreadSearch()
                    else openThreadSearch()
                  }}
                >
                  <IconSearch className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-stone-700 hover:bg-stone-200/80 dark:text-stone-200 dark:hover:bg-stone-800"
                  aria-expanded={promptPanel.expanded}
                  aria-controls={promptPanel.regionId}
                  aria-label={promptPanel.expanded ? '프롬프트 보관함 닫기' : '프롬프트 보관함 열기'}
                  title="프롬프트 보관함"
                  onClick={() => {
                    if (!promptPanel.expanded) {
                      setIsMobileMenuOpen(false)
                    }
                    promptPanel.toggle()
                  }}
                >
                  {promptPanel.expanded ? (
                    <IconPromptChevronsLeft className="h-6 w-6" />
                  ) : (
                    <IconPromptChevronsRight className="h-6 w-6" />
                  )}
                </button>
              </div>
            ) : null}
          </div>

          {threadSearchOpen && showExpandedSidebarContent ? (
            <div id="sidebar-thread-search" className="shrink-0 px-3 pb-2">
              <label htmlFor="sidebar-thread-search-field" className="sr-only">
                채팅 검색
              </label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  ref={threadSearchInputRef}
                  id="sidebar-thread-search-field"
                  type="search"
                  value={threadSearchQuery}
                  onChange={(event) => setThreadSearchQuery(event.target.value)}
                  placeholder="채팅 검색"
                  style={{ fontSize: '14px' }}
                  className="w-full rounded-full border border-stone-300/90 bg-white py-2 pl-9 pr-9 text-stone-900 outline-none ring-orange-600/25 placeholder:text-stone-400 focus:border-orange-500/60 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
                />
                {threadSearchQuery ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    aria-label="검색어 지우기"
                    onClick={() => setThreadSearchQuery('')}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
          <div
            className={`rounded-none border-x-0 border-stone-300/70 bg-white/80 dark:border-stone-700 dark:bg-stone-800/60 ${sidebarCollapsed ? 'border-y p-2 md:flex md:flex-col md:items-center' : 'border-y p-2'}`}
          >
            <div
              className={
                sidebarCollapsed
                  ? 'flex justify-center max-md:items-start max-md:justify-start max-md:gap-2 md:block'
                  : 'flex items-start gap-2'
              }
            >
              <div
                className={`flex shrink-0 items-center justify-center rounded-full bg-orange-800 font-bold text-white ${sidebarCollapsed ? 'h-10 w-10 text-base md:h-10 md:w-10' : 'h-10 w-10 text-sm'}`}
                title={showExpandedSidebarContent ? undefined : displayName}
              >
                {initial}
              </div>
              {showExpandedSidebarContent ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight text-stone-900 dark:text-white">
                    {displayName}
                  </p>
                  <p className="truncate text-[11px] leading-snug text-stone-600 dark:text-stone-400">
                    {[department, rankTitleLine].filter(Boolean).join(' · ') ||
                      '—'}
                  </p>
                </div>
              ) : null}
            </div>

            {showExpandedSidebarContent && profileError ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {profileError}
              </p>
            ) : null}

            {showExpandedSidebarContent ? (
              <div className="mt-2">
                <div className="mb-0.5 flex items-center justify-between text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  <span>토큰</span>
                  <span className="tabular-nums text-orange-900 dark:text-orange-300">
                    {profile ? `${remainingPct}%` : '—'}
                  </span>
                </div>
                <svg
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                  className="h-1.5 w-full overflow-hidden rounded-full bg-stone-300 dark:bg-stone-700"
                  role="img"
                  aria-label={
                    profile
                      ? `남은 토큰 비율 ${remainingPct}퍼센트`
                      : '토큰 비율 로딩'
                  }
                >
                  {profile ? (
                    <rect
                      x="0"
                      y="0"
                      width={Math.min(100, Math.max(0, remainingPct))}
                      height="8"
                      className={
                        remainingPct <= 15
                          ? 'fill-amber-500'
                          : remainingPct <= 35
                            ? 'fill-yellow-600'
                            : 'fill-orange-700 dark:fill-orange-600'
                      }
                    />
                  ) : null}
                </svg>
                <p className="mt-0.5 truncate text-[11px] leading-snug text-stone-600 dark:text-stone-400">
                  {profile ? (
                    <>
                      {currentUsage.toLocaleString()} /{' '}
                      {tokenLimit.toLocaleString()}
                    </>
                  ) : (
                    '프로필 로딩 중'
                  )}
                </p>
              </div>
            ) : null}
            {(!showExpandedSidebarContent) ? (
              <div className="mt-2 flex flex-col items-center justify-center">
                <IconTokenRequest className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                <span className="mt-0.5 text-[10px] font-semibold text-orange-800 dark:text-orange-300">
                  {profile ? `${remainingPct}%` : '-'}
                </span>
              </div>
            ) : null}
          </div>

          <Link
            to="/library"
            title="라이브러리"
            aria-label="라이브러리"
            aria-current={libraryActive ? 'page' : undefined}
            className={`${sidebarNewChatClass} ${
              libraryActive
                ? 'bg-stone-200/80 dark:bg-stone-800/60'
                : ''
            } ${
              showExpandedSidebarContent
                ? 'justify-start gap-3 pl-3 pr-2 text-sm font-normal leading-5 text-stone-800 dark:text-stone-100'
                : 'justify-center px-0'
            }`}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center text-stone-700 dark:text-stone-300"
              aria-hidden="true"
            >
              <IconLibrary className="h-6 w-6" />
            </span>
            {showExpandedSidebarContent ? (
              <span className="min-w-0 truncate text-left">라이브러리</span>
            ) : null}
          </Link>

          <button
            type="button"
            title={plannerActive ? '새 기획' : '새 채팅'}
            aria-label={plannerActive ? '새 기획' : '새 채팅'}
            className={`${sidebarNewChatClass} sticky top-0 z-20 bg-[#F4F1EA] dark:bg-stone-900 ${
              showExpandedSidebarContent
                ? 'justify-start gap-3 pl-3 pr-2 text-sm font-normal leading-5 text-stone-800 dark:text-stone-100'
                : 'justify-center px-0'
            }`}
            onClick={() => {
              if (plannerActive) {
                void handleNewPlannerSession()
              } else {
                requestNewChat()
                setIsMobileMenuOpen(false)
              }
            }}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center text-stone-700 dark:text-stone-300"
              aria-hidden="true"
            >
              {plannerActive ? (
                <IconPlanner className="h-6 w-6" />
              ) : (
                <IconGeminiNewChat className="h-6 w-6" />
              )}
            </span>
            {showExpandedSidebarContent ? (
              <span className="min-w-0 truncate text-left">
                {plannerActive ? '새 기획' : '새 채팅'}
              </span>
            ) : null}
          </button>

          {plannerActive ? (
            <section
              aria-label="기획 세션 목록"
              className={`pb-1 ${sidebarCollapsed ? 'hidden' : ''}`}
            >
              {showExpandedSidebarContent ? (
                <p className="mb-1 shrink-0 pl-3 text-left text-sm font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  기획 세션
                </p>
              ) : null}
              {plannerSessions.length === 0 ? (
                showExpandedSidebarContent ? (
                  <p className="py-2 pl-3 text-sm leading-snug text-stone-500 dark:text-stone-400">
                    저장된 기획 대화가 여기에 표시됩니다.
                  </p>
                ) : null
              ) : (
                <ul className="flex flex-col gap-0 pb-1">
                  {plannerSessions.map((session) => {
                    const isActive = activePlannerSessionId === session.id
                    return (
                      <li key={session.id}>
                        <div className="group relative flex items-center">
                          <Link
                            to={`/ai-planner/${session.id}`}
                            title={session.title}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-full py-2 pl-3 pr-10 text-left text-sm leading-snug transition-colors ${
                              isActive
                                ? 'bg-stone-200/80 font-medium text-stone-900 dark:bg-stone-800/70 dark:text-stone-50'
                                : 'text-stone-700 hover:bg-stone-200/50 dark:text-stone-300 dark:hover:bg-stone-800/45'
                            }`}
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            <span className="min-w-0 flex-1 truncate">{session.title}</span>
                            {session.has_plan ? (
                              <span className="shrink-0 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                                PRD
                              </span>
                            ) : null}
                          </Link>
                          <div className="absolute right-1 flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                              type="button"
                              className="rounded-full p-1.5 text-stone-500 hover:bg-stone-200/80 hover:text-stone-800 dark:hover:bg-stone-700 dark:hover:text-stone-100"
                              title="이름 변경"
                              aria-label="기획 세션 이름 변경"
                              onClick={() => handleRenamePlannerSession(session.id, session.title)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="rounded-full p-1.5 text-stone-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                              title="삭제"
                              aria-label="기획 세션 삭제"
                              onClick={() => handleDeletePlannerSession(session.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : (
          <section
            aria-label="개인 채팅 목록"
            className={`pb-1 ${sidebarCollapsed ? 'hidden' : ''}`}
          >
            {showExpandedSidebarContent ? (
              <p className="mb-1 shrink-0 pl-3 text-left text-sm font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                {threadSearchQuery.trim() ? '검색 결과' : '최근 대화'}
              </p>
            ) : null}
              {privateThreads.length === 0 ? (
                showExpandedSidebarContent ? (
                  <p className="py-2 pl-3 text-sm leading-snug text-stone-500 dark:text-stone-400">
                    {threadSearchQuery.trim()
                      ? '검색 결과가 없습니다.'
                      : '저장된 대화가 여기에 표시됩니다.'}
                  </p>
                ) : null
              ) : (
                <ul className="flex flex-col gap-0 pb-1">
                  {privateThreads.map((t) => (
                    <li key={t.threadId}>
                      <PrivateChatThreadRow
                        thread={t}
                        menuOpen={openThreadMenuId === t.threadId}
                        onToggleMenu={() =>
                          setOpenThreadMenuId((current) =>
                            current === t.threadId ? null : t.threadId,
                          )
                        }
                        onCloseMenu={() => setOpenThreadMenuId(null)}
                        onShare={handleShareThread}
                        onTogglePin={handleTogglePinThread}
                        onRename={handleRenameThread}
                        onAddToNotebook={handleAddThreadToNotebook}
                        onDelete={handleDeleteThread}
                        onNavigate={() => {
                          setIsMobileMenuOpen(false)
                          closeThreadSearch()
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
          </section>
          )}
          </div>

          <div
            className={`mt-auto shrink-0 border-t border-stone-300/70 px-0 pt-1.5 dark:border-stone-700 ${
              sidebarCollapsed
                ? 'pb-[max(0.35rem,env(safe-area-inset-bottom))]'
                : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            }`}
          >
            <div
              className="relative w-full overflow-visible rounded-none border-x-0 border-stone-400/50 bg-white/70 shadow-none dark:border-stone-600 dark:bg-stone-900/55"
              role="toolbar"
              aria-label="바로가기 및 계정"
            >
              {isAppFolderOpen && sidebarCollapsed ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAppFolderOpen(false)} />
                  <div className="absolute bottom-0 left-[76px] z-50 w-[240px] rounded-xl border border-stone-200 bg-[#F4F1EA] p-2 shadow-2xl dark:border-stone-700 dark:bg-stone-900">
                    <div className="grid grid-cols-3 gap-1">
                      <Link
                        to="/workflows"
                        title="Workflows"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconWorkflows className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">Workflows</span>
                      </Link>
                      <Link
                        to="/ai-designer"
                        title="AI Designer"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconDesigner className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">Designer</span>
                      </Link>
                      <Link
                        to="/ai-sheets"
                        title="AI Sheets"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconSheets className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">Sheets</span>
                      </Link>
                      <Link
                        to="/ai-slides"
                        title="AI Slides"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconSlides className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">Slides</span>
                      </Link>
                      <Link
                        to="/scrapbook"
                        title="내 스크랩북"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconBookmark className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">스크랩북</span>
                      </Link>
                      <Link
                        to="/reference-room"
                        title="사내 자료실"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconFolder className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">자료실</span>
                      </Link>
                      <Link
                        to="/workspace-tools"
                        title="워크스페이스 연동"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconLink className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">연동</span>
                      </Link>
                      <Link
                        to="/notebook"
                        title="노트북 워크스페이스"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconNotebook className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">노트북</span>
                      </Link>
                      <Link
                        to="/teams"
                        title="팀 · 공유 채팅"
                        className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                        onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                      >
                        <IconTeams className="h-5 w-5" />
                        <span className="mt-1 text-[10px] leading-tight">팀 채팅</span>
                      </Link>
                      {isAdminProfile(profile) ? (
                        <Link
                          to="/admin/token-requests"
                          title="토큰 요청 관리"
                          className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                          onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                        >
                          <IconTokenRequest className="h-5 w-5" />
                          <span className="mt-1 text-[10px] leading-tight">토큰 관리</span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          title="토큰 요청하기"
                          className="flex flex-col items-center justify-center rounded-lg py-2 text-stone-600 hover:bg-white/80 dark:text-stone-300 dark:hover:bg-stone-800"
                          onClick={() => {
                            setIsAppFolderOpen(false)
                            setIsMobileMenuOpen(false)
                            setTokenRequestOpen(true)
                          }}
                        >
                          <IconTokenRequest className="h-5 w-5" />
                          <span className="mt-1 text-[10px] leading-tight">토큰 요청</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              <div
                className={`grid w-full divide-stone-300/65 dark:divide-stone-700/80 ${
                  showExpandedSidebarDock
                    ? 'grid-cols-3 grid-rows-4 divide-x divide-y'
                    : 'grid-cols-1 grid-rows-2 divide-y'
                }`}
              >
                {sidebarCollapsed ? (
                  <>
                    <Link
                      to="/ai-planner"
                      title="AI Planner"
                      aria-label="AI Planner"
                      className={`flex items-center justify-center py-3 transition ${
                        plannerActive
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                          : 'text-stone-500 hover:bg-stone-200/50 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
                      }`}
                      onClick={() => {
                        setIsAppFolderOpen(false)
                        setIsMobileMenuOpen(false)
                      }}
                    >
                      <IconPlanner className="h-5 w-5" />
                    </Link>
                    <button
                      type="button"
                      title="기타 앱 메뉴"
                      aria-label="기타 앱 메뉴"
                      className="flex items-center justify-center py-3 text-stone-500 transition hover:bg-stone-200/50 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                      onClick={() => setIsAppFolderOpen(!isAppFolderOpen)}
                    >
                      <svg
                        className="h-5 w-5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6a2 2 0 012-2h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.586a2 2 0 012 2v2M4 6v12a2 2 0 002 2h12a2 2 0 002-2v-4M4 10h16"
                        />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                <Link
                  to="/workflows"
                  title="Workflows"
                  aria-label="Workflows"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconWorkflows className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>Workflows</span>
                </Link>
                <Link
                  to="/ai-planner"
                  title="AI Planner"
                  aria-label="AI Planner"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconPlanner className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>AI Planner</span>
                </Link>
                <Link
                  to="/ai-designer"
                  title="AI Designer"
                  aria-label="AI Designer"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconDesigner className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>AI Designer</span>
                </Link>
                <Link
                  to="/ai-sheets"
                  title="AI Sheets"
                  aria-label="AI Sheets"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconSheets className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>AI Sheets</span>
                </Link>
                <Link
                  to="/ai-slides"
                  title="AI Slides"
                  aria-label="AI Slides"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconSlides className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>AI Slides</span>
                </Link>
                <Link
                  to="/scrapbook"
                  title="내 스크랩북"
                  aria-label="내 스크랩북"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconBookmark className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>내 스크랩북</span>
                </Link>
                <Link
                  to="/reference-room"
                  title="사내 자료실"
                  aria-label="사내 자료실"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconFolder className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>사내 자료실</span>
                </Link>
                <Link
                  to="/workspace-tools"
                  title="워크스페이스 연동"
                  aria-label="워크스페이스 연동"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconLink className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>워크스페이스 연동</span>
                </Link>
                <Link
                  to="/notebook"
                  title="노트북 워크스페이스"
                  aria-label="노트북 워크스페이스"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconNotebook className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>노트북</span>
                </Link>
                <Link
                  to="/teams"
                  title="팀 · 공유 채팅"
                  aria-label="팀 · 공유 채팅"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconTeams className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>팀 · 공유 채팅</span>
                </Link>
                {isAdminProfile(profile) ? (
                  <Link
                    to="/admin/token-requests"
                    title="토큰 요청 관리"
                    aria-label="토큰 요청 관리"
                    className={sidebarIconDockAdminClass}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <IconTokenRequest className="h-3.5 w-3.5 shrink-0" />
                    <span className={sidebarIconDockLabelClass}>토큰 요청 관리</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    title="토큰 요청하기"
                    aria-label="토큰 요청하기"
                    className={sidebarIconDockClass}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      setTokenRequestOpen(true)
                    }}
                  >
                    <IconTokenRequest className="h-3.5 w-3.5 shrink-0" />
                    <span className={sidebarIconDockLabelClass}>토큰 요청하기</span>
                  </button>
                )}
                  <button
                    type="button"
                    title="설정"
                    aria-label="설정"
                    className={sidebarIconDockClass}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      setSettingsOpen(true)
                    }}
                  >
                    <IconSettings className="h-3.5 w-3.5 shrink-0" />
                    <span className={sidebarIconDockLabelClass}>설정</span>
                  </button>
                  <button
                    type="button"
                    title="로그아웃"
                    aria-label="로그아웃"
                    className={sidebarIconDockClass}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      void signOut()
                    }}
                  >
                    <IconLogout className="h-3.5 w-3.5 shrink-0" />
                    <span className={sidebarIconDockLabelClass}>로그아웃</span>
                  </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 메인 영역 — 사이드바 폭에 맞춘 여백 (모바일은 오버레이이므로 여백 0) */}
      <div
        className={`relative flex h-dvh min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-out ${
          sidebarCollapsed ? 'md:pl-[72px]' : 'md:pl-[308px]'
        }`}
      >
        {/* 모바일 상단 바 */}
        <header className="flex items-center gap-2 border-b border-stone-300/80 bg-[#FAF9F6] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-top))] dark:border-stone-800 dark:bg-stone-900 md:hidden">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-800 transition hover:bg-stone-200/80 dark:text-stone-200 dark:hover:bg-stone-800"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="메뉴 열기"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <Link to="/" className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-orange-950 dark:text-orange-300">
            NH-AX-HUB
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
          setSettingsTab('mypage')
        }}
        userId={profile?.id}
        initialTab={settingsTab}
      />

      <TokenRequestModal
        open={tokenRequestOpen}
        onClose={() => setTokenRequestOpen(false)}
        supabase={supabase}
        userId={profile?.id}
      />
    </div>
  )
}
