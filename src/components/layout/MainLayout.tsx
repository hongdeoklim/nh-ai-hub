import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FocusEvent,
} from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { useAppUi } from '../../contexts/AppUiContext'
import { useIsDesktop, useIsStandaloneApp } from '../../hooks/useDisplayMode'
import { useTheme } from '../../hooks/useTheme'
import { isAdminProfile } from '../../lib/admin-access'
import {
  findActiveGroup,
  NAV_GROUPS,
  resolvePageTitle,
  type NavGroupId,
} from '../../lib/app-navigation'
import { rememberLastPrivateThread } from '../../lib/private-chat-storage'
import { supabase } from '../../lib/supabase'
import { Overlay, OverlayHeader } from '../common/Overlay'
import {
  IconLogOut,
  IconMoon,
  IconPanelLeft,
  IconPenSquare,
  IconSettings,
  IconShield,
  IconSun,
  IconX,
} from '../common/icons'
import { SettingsDialog, type SettingsTab } from '../settings/SettingsDialog'
import { TokenRequestModal } from '../settings/TokenRequestModal'
import { tokenRemainingPct } from '../../lib/token-budget'
import { AiUsageGuideDialog } from './AiUsageGuideDialog'
import { NotificationsAndTodos } from './NotificationsAndTodos'
import { AccountMenu } from './shell/AccountMenu'
import { AppHeader } from './shell/AppHeader'
import { AppLauncher } from './shell/AppLauncher'
import { BottomTabBar } from './shell/BottomTabBar'
import { ChatThreadsPanel } from './shell/ChatThreadsPanel'
import { CommandPalette, type PaletteAction } from './shell/CommandPalette'
import { GroupPanel } from './shell/GroupPanel'
import { NavRail } from './shell/NavRail'

const PANEL_OPEN_KEY = 'nh_ui_panel_open'

function readPanelOpen(): boolean {
  try {
    const raw = localStorage.getItem(PANEL_OPEN_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    /* ignore */
  }
  // 기본: 넓은 화면은 펼침, 태블릿 가로(768~1023)는 접힘
  return typeof window === 'undefined' ? true : window.innerWidth >= 1024
}

/**
 * 앱 셸 v2 (2026-10 개편)
 *
 *  PC(≥768px)  : 아이콘 레일(68px) + 보조 패널(280px, 접기 가능) + 상단 헤더
 *  모바일      : 상단 헤더 + 하단 탭 바(56px) + 좌측 드로어(대화 목록) + 앱 런처 시트
 *  앱(PWA)     : standalone 감지 → data-standalone, 뒤로가기로 오버레이 닫기
 *
 *  하단 탭 바 높이는 CSS 변수 --app-bottom-nav 로 노출되어 고정 컴포저(Dashboard)가 참조한다.
 */
export function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const standalone = useIsStandaloneApp()
  const { isDark, toggle: toggleTheme } = useTheme()
  const { profile, signOut } = useAuth()
  const { requestNewChat, promptPanel, registerOpenSettingsHandler, registerNewChatFallback } =
    useAppUi()
  const isAdmin = isAdminProfile(profile)

  // ----- 보조 패널 -----
  const routeGroupId: NavGroupId = findActiveGroup(location.pathname)?.id ?? 'chat'
  const [panelOpen, setPanelOpen] = useState<boolean>(readPanelOpen)
  const [panelGroupId, setPanelGroupId] = useState<NavGroupId>(routeGroupId)
  const [lastRouteGroupId, setLastRouteGroupId] = useState<NavGroupId>(routeGroupId)

  // 경로의 그룹이 바뀌면 패널도 그 그룹으로 (렌더 중 상태 보정 패턴 — effect 불필요)
  if (routeGroupId !== lastRouteGroupId) {
    setLastRouteGroupId(routeGroupId)
    setPanelGroupId(routeGroupId)
  }

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_OPEN_KEY, panelOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [panelOpen])

  // ----- 오버레이 상태 -----
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('mypage')
  const [tokenRequestOpen, setTokenRequestOpen] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [lastPathname, setLastPathname] = useState(location.pathname)

  // 경로 이동 시 열려 있던 오버레이를 모두 닫는다 (렌더 중 상태 보정 패턴)
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setDrawerOpen(false)
    setLauncherOpen(false)
    setAccountOpen(false)
    setPaletteOpen(false)
  }

  // ----- 전역 핸들러 등록 (설정 열기 · 새 채팅 폴백) -----
  useEffect(() => {
    registerOpenSettingsHandler((tab) => {
      if (typeof tab === 'string') setSettingsTab(tab as SettingsTab)
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

  // ----- 단축키: Ctrl/⌘+K 팔레트 -----
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ----- 문서 제목 -----
  const pageTitle = resolvePageTitle(location.pathname)
  useEffect(() => {
    document.title = pageTitle === 'NH-AX-HUB' ? 'NH-AX-HUB' : `${pageTitle} · NH-AX-HUB`
  }, [pageTitle])

  // ----- 모바일: 컴포저 포커스 시 하단 탭 숨김 -----
  const onMainFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof HTMLTextAreaElement) setComposerFocused(true)
  }, [])
  const onMainBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof HTMLTextAreaElement) setComposerFocused(false)
  }, [])

  // ----- 파생 값 -----
  const displayName =
    profile?.display_name?.trim() ||
    (profile?.email ? profile.email.split('@')[0] ?? profile.email : '') ||
    '프로필 로드 중'
  const tokenPct = profile ? tokenRemainingPct(profile.current_token_usage, profile.token_limit) : null
  const activeGroup = findActiveGroup(location.pathname)
  const panelGroup = NAV_GROUPS.find((g) => g.id === panelGroupId) ?? NAV_GROUPS[0]
  const showBottomNav = !composerFocused

  function handleSelectGroup(id: NavGroupId) {
    if (id === 'chat' && !(location.pathname === '/' || location.pathname.startsWith('/chat/'))) {
      navigate('/')
      setPanelGroupId('chat')
      setPanelOpen(true)
      return
    }
    if (panelOpen && panelGroupId === id) {
      setPanelOpen(false)
      return
    }
    setPanelGroupId(id)
    setPanelOpen(true)
  }

  function handleNewChat() {
    requestNewChat()
    setDrawerOpen(false)
  }

  const openSettings = useCallback((tab?: SettingsTab) => {
    if (tab) setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])

  const paletteActions = useMemo<PaletteAction[]>(() => {
    const actions: PaletteAction[] = [
      {
        id: 'new-chat',
        label: '새 채팅',
        description: '새 대화 스레드를 시작합니다',
        icon: IconPenSquare,
        keywords: ['new', 'chat', '대화'],
        run: () => requestNewChat(),
      },
      {
        id: 'toggle-theme',
        label: isDark ? '라이트 모드로 전환' : '다크 모드로 전환',
        description: '화면 테마 변경',
        icon: isDark ? IconSun : IconMoon,
        keywords: ['theme', 'dark', 'light', '테마', '다크'],
        run: () => toggleTheme(),
      },
      {
        id: 'settings',
        label: '설정 열기',
        description: '프로필 · 연동 · 예약 작업',
        icon: IconSettings,
        keywords: ['settings', 'preferences', '설정'],
        run: () => openSettings('mypage'),
      },
      {
        id: 'toggle-panel',
        label: panelOpen ? '보조 패널 접기' : '보조 패널 펼치기',
        icon: IconPanelLeft,
        keywords: ['panel', 'sidebar', '사이드바'],
        run: () => setPanelOpen((v) => !v),
      },
    ]
    if (isAdmin) {
      actions.push({
        id: 'admin',
        label: '관리자 콘솔',
        description: '직원 · 모델 · 감사 · 운영 지표',
        icon: IconShield,
        keywords: ['admin', '관리자'],
        run: () => navigate('/admin'),
      })
    }
    actions.push({
      id: 'logout',
      label: '로그아웃',
      icon: IconLogOut,
      keywords: ['logout', 'sign out'],
      run: () => void signOut(),
    })
    return actions
  }, [isDark, toggleTheme, openSettings, panelOpen, isAdmin, navigate, requestNewChat, signOut])

  const panelContent =
    panelGroup.id === 'chat' ? (
      <ChatThreadsPanel onNavigate={() => setDrawerOpen(false)} />
    ) : (
      <GroupPanel group={panelGroup} onNavigate={() => setDrawerOpen(false)} />
    )

  const accountMenu = (
    <AccountMenu
      profile={profile}
      displayName={displayName}
      isAdmin={isAdmin}
      onClose={() => setAccountOpen(false)}
      onOpenSettings={() => openSettings('mypage')}
      onOpenTokenRequest={() => setTokenRequestOpen(true)}
      onOpenHelp={() => setHelpOpen(true)}
      onSignOut={() => void signOut()}
    />
  )

  const bottomNavVar = showBottomNav
    ? '[--app-bottom-nav:calc(56px_+_env(safe-area-inset-bottom))] md:[--app-bottom-nav:0px]'
    : '[--app-bottom-nav:0px]'

  return (
    <div
      data-standalone={standalone ? 'true' : undefined}
      className={`app-shell flex h-dvh w-full bg-bg text-fg ${bottomNavVar}`}
    >
      {/* 키보드 사용자용 본문 건너뛰기 — 포커스될 때만 표시 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-[12px] focus:top-[12px] focus:z-[100] focus:rounded-[8px] focus:bg-brand focus:px-[12px] focus:py-[8px] focus:text-sm focus:font-semibold focus:text-brand-fg focus:shadow-pop"
      >
        본문으로 건너뛰기
      </a>
      <NavRail
        activeGroupId={activeGroup?.id ?? null}
        panelOpen={panelOpen}
        panelGroupId={panelGroupId}
        onSelectGroup={handleSelectGroup}
        onNewChat={handleNewChat}
        isAdmin={isAdmin}
        profileName={displayName}
        accountOpen={accountOpen}
        onToggleAccount={() => setAccountOpen((v) => !v)}
        onOpenSettings={() => openSettings('mypage')}
      />

      {isDesktop && panelOpen ? (
        <aside
          aria-label={`${panelGroup.label} 패널`}
          className="fixed inset-y-0 left-[68px] z-30 flex w-[280px] flex-col border-r border-border bg-surface"
        >
          <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-[16px]">
            <p className="text-sm font-semibold text-fg">
              {panelGroup.id === 'chat' ? '대화' : panelGroup.label}
            </p>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="패널 접기"
              title="패널 접기"
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
            >
              <IconX className="h-[16px] w-[16px]" />
            </button>
          </div>
          <div className="min-h-0 flex-1">{panelContent}</div>
        </aside>
      ) : null}

      <div
        className={`flex h-dvh min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out ${
          isDesktop && panelOpen ? 'md:pl-[348px]' : 'md:pl-[68px]'
        }`}
      >
        <AppHeader
          title={pageTitle}
          subtitle={activeGroup?.description}
          onOpenDrawer={() => setDrawerOpen(true)}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          promptPanel={promptPanel}
          notifications={<NotificationsAndTodos />}
          tokenPct={tokenPct}
          profileName={displayName}
          accountOpen={accountOpen}
          onToggleAccount={() => setAccountOpen((v) => !v)}
          accountPopover={
            isDesktop && accountOpen ? (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  aria-hidden="true"
                  onClick={() => setAccountOpen(false)}
                />
                <div
                  role="dialog"
                  aria-label="내 계정"
                  className="absolute right-0 top-[46px] z-[61] w-[320px] overflow-hidden rounded-[16px] border border-border bg-surface pb-[4px] shadow-pop"
                >
                  {accountMenu}
                </div>
              </>
            ) : null
          }
        />

        <main
          id="main-content"
          tabIndex={-1}
          onFocus={onMainFocus}
          onBlur={onMainBlur}
          className="flex min-h-0 flex-1 flex-col pb-[var(--app-bottom-nav,0px)] outline-none transition-[padding] duration-200"
        >
          <Outlet />
        </main>
      </div>

      <BottomTabBar
        hidden={!showBottomNav}
        launcherOpen={launcherOpen}
        accountOpen={accountOpen && !isDesktop}
        onOpenLauncher={() => setLauncherOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
      />

      {/* 모바일 드로어 — 대화 목록 */}
      <Overlay
        open={!isDesktop && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="drawer"
        label="대화 목록"
        panelClassName="pt-[env(safe-area-inset-top)]"
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-[16px]">
          <p className="text-sm font-semibold text-fg">대화</p>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="닫기"
            className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <IconX className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatThreadsPanel onNavigate={() => setDrawerOpen(false)} />
        </div>
      </Overlay>

      {/* 앱 런처 (모바일 시트 · PC 다이얼로그) */}
      <Overlay
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        variant="sheet"
        desktopDialog
        label="모든 앱"
        panelClassName="h-[88dvh] md:h-auto"
      >
        <OverlayHeader
          title="모든 앱"
          description="지식 · 자동화 · AI 앱 · 팀 — 필요한 화면을 찾아 이동하세요."
          onClose={() => setLauncherOpen(false)}
        />
        <AppLauncher
          isAdmin={isAdmin}
          onNavigate={() => setLauncherOpen(false)}
          onOpenSettings={() => openSettings('mypage')}
          onOpenTokenRequest={() => setTokenRequestOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
      </Overlay>

      {/* 계정 (모바일 시트) */}
      <Overlay
        open={!isDesktop && accountOpen}
        onClose={() => setAccountOpen(false)}
        variant="sheet"
        label="내 계정"
      >
        <OverlayHeader title="내 정보" onClose={() => setAccountOpen(false)} />
        <div className="min-h-0 flex-1 overflow-y-auto">{accountMenu}</div>
      </Overlay>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />

      <AiUsageGuideDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

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
