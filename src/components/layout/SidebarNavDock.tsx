import { Link } from 'react-router-dom'

import { IconSettings, IconLogout } from './AccountHeaderActions'
import {
  IconAutomationStudio,
  IconBookmark,
  IconDesigner,
  IconFolder,
  IconKnowledgeHub,
  IconLink,
  IconMarketplace,
  IconNotebook,
  IconPlanner,
  IconSheets,
  IconSlides,
  IconTeams,
  IconTokenRequest,
  IconWorkflows,
} from './main-layout-icons'

const sidebarIconDockClass =
  'flex h-[30px] w-full items-center justify-center text-stone-700 transition hover:bg-stone-100/90 dark:text-stone-200 dark:hover:bg-stone-800/80'

const sidebarIconDockLabelClass =
  'hidden text-sm font-medium leading-snug'

const sidebarIconDockAdminClass =
  `${sidebarIconDockClass} font-bold text-amber-950 hover:bg-amber-50/90 dark:text-amber-100 dark:hover:bg-amber-950/40`

type SidebarNavDockProps = {
  sidebarCollapsed: boolean
  isAppFolderOpen: boolean
  setIsAppFolderOpen: (open: boolean) => void
  setIsMobileMenuOpen: (open: boolean) => void
  plannerActive: boolean
  marketplaceActive: boolean
  isAdmin: boolean
  onOpenTokenRequest: () => void
  onOpenSettings: () => void
  onSignOut: () => void
}

/**
 * 사이드바 하단 앱 독 — 접힘 시 서랍 팝업, 펼침 시 5개 그룹(지식/자동화/AI 앱/팀·현장/계정) 링크.
 * 3단계 모놀리스 분해로 MainLayout.tsx에서 분리.
 */
export function SidebarNavDock({
  sidebarCollapsed,
  isAppFolderOpen,
  setIsAppFolderOpen,
  setIsMobileMenuOpen,
  plannerActive,
  marketplaceActive,
  isAdmin,
  onOpenTokenRequest,
  onOpenSettings,
  onSignOut,
}: SidebarNavDockProps) {
  return (
            <div
              className="relative w-full overflow-visible rounded-none border-x-0 border-stone-400/50 bg-white/70 shadow-none dark:border-stone-600 dark:bg-stone-900/55"
              role="toolbar"
              aria-label="바로가기 및 계정"
            >
              {isAppFolderOpen && sidebarCollapsed ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAppFolderOpen(false)} />
                  <div className="absolute bottom-0 left-[76px] z-50 w-[240px] rounded-xl border border-stone-200 bg-[#F4F1EA] p-2 shadow-2xl dark:border-stone-700 dark:bg-stone-900">
                    <div className="flex flex-col gap-0.5">
                      {/* 3단계 IA: 데스크톱 독과 동일한 5개 그룹 (데이터 기반 렌더링) */}
                      {[
                        {
                          label: '지식',
                          items: [
                            { to: '/reference-room', title: '사내 자료실', text: '자료실', icon: <IconFolder className="h-5 w-5" /> },
                            { to: '/knowledge-hub', title: '지식 허브', text: '지식 허브', icon: <IconKnowledgeHub className="h-5 w-5" /> },
                            { to: '/notebook', title: '노트북 워크스페이스', text: '노트북', icon: <IconNotebook className="h-5 w-5" /> },
                            { to: '/scrapbook', title: '내 스크랩북', text: '스크랩북', icon: <IconBookmark className="h-5 w-5" /> },
                          ],
                        },
                        {
                          label: '자동화',
                          items: [
                            { to: '/automation-studio', title: '자동화 스튜디오', text: '자동화', icon: <IconAutomationStudio className="h-5 w-5" /> },
                            { to: '/workflows', title: 'Workflows', text: 'Workflows', icon: <IconWorkflows className="h-5 w-5" /> },
                            { to: '/marketplace', title: 'Marketplace', text: 'Market', icon: <IconMarketplace className="h-5 w-5" /> },
                            { to: '/workspace-tools', title: '워크스페이스 연동', text: '연동', icon: <IconLink className="h-5 w-5" /> },
                          ],
                        },
                        {
                          label: 'AI 앱',
                          items: [
                            { to: '/ai-planner', title: 'AI Planner', text: 'Planner', icon: <IconPlanner className="h-5 w-5" /> },
                            { to: '/ai-designer', title: 'AI Designer', text: 'Designer', icon: <IconDesigner className="h-5 w-5" /> },
                            { to: '/ai-slides', title: 'AI Slides', text: 'Slides', icon: <IconSlides className="h-5 w-5" /> },
                            { to: '/ai-sheets', title: 'AI Sheets', text: 'Sheets', icon: <IconSheets className="h-5 w-5" /> },
                          ],
                        },
                        {
                          label: '팀 · 현장',
                          items: [
                            { to: '/teams', title: '팀 · 공유 채팅', text: '팀 채팅', icon: <IconTeams className="h-5 w-5" /> },
                            { to: '/site-assessment', title: '현장 AI 평가', text: '현장평가', icon: <span className="text-lg leading-none">🦺</span> },
                          ],
                        },
                      ].map((group) => (
                        <div key={group.label}>
                          <p className="px-1 pb-0.5 pt-1 text-[9px] font-semibold tracking-wider text-stone-400 dark:text-stone-500">
                            {group.label}
                          </p>
                          <div className="grid grid-cols-3 gap-1">
                            {group.items.map((item) => (
                              <Link
                                key={item.to}
                                to={item.to}
                                title={item.title}
                                className={`flex flex-col items-center justify-center rounded-lg py-2 hover:bg-white/80 dark:hover:bg-stone-800 ${
                                  item.to === '/ai-planner' && plannerActive
                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                                    : 'text-stone-600 dark:text-stone-300'
                                }`}
                                onClick={() => { setIsAppFolderOpen(false); setIsMobileMenuOpen(false); }}
                              >
                                {item.icon}
                                <span className="mt-1 text-[10px] leading-tight">{item.text}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                      <p className="px-1 pb-0.5 pt-1 text-[9px] font-semibold tracking-wider text-stone-400 dark:text-stone-500">
                        계정
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {isAdmin ? (
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
                              onOpenTokenRequest()
                            }}
                          >
                            <IconTokenRequest className="h-5 w-5" />
                            <span className="mt-1 text-[10px] leading-tight">토큰 요청</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              <div className="flex w-full flex-col">
                {sidebarCollapsed ? (
                  <>
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
                {/* 3단계 IA: 평면 나열 → 5개 영역 그룹 (기능 변경 없음, 재배치만) */}
                <p className="px-3 pb-0.5 pt-1 text-[9px] font-semibold leading-none tracking-wider text-stone-400 dark:text-stone-500">
                  지식
                </p>
                <div className="grid w-full grid-cols-4 divide-x divide-y divide-stone-300/65 dark:divide-stone-700/80">
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
                  to="/knowledge-hub"
                  title="지식 허브"
                  aria-label="지식 허브"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconKnowledgeHub className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>지식 허브</span>
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
                  to="/scrapbook"
                  title="내 스크랩북"
                  aria-label="내 스크랩북"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconBookmark className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>내 스크랩북</span>
                </Link>
                </div>

                <p className="px-3 pb-0.5 pt-1 text-[9px] font-semibold leading-none tracking-wider text-stone-400 dark:text-stone-500">
                  자동화
                </p>
                <div className="grid w-full grid-cols-4 divide-x divide-y divide-stone-300/65 dark:divide-stone-700/80">
                <Link
                  to="/automation-studio"
                  title="자동화 스튜디오"
                  aria-label="자동화 스튜디오"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconAutomationStudio className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>자동화 스튜디오</span>
                </Link>
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
                  to="/marketplace"
                  title="Marketplace"
                  aria-label="Marketplace"
                  aria-current={marketplaceActive ? 'page' : undefined}
                  className={`${sidebarIconDockClass} ${marketplaceActive ? 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconMarketplace className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>Marketplace</span>
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
                </div>

                <p className="px-3 pb-0.5 pt-1 text-[9px] font-semibold leading-none tracking-wider text-stone-400 dark:text-stone-500">
                  AI 앱
                </p>
                <div className="grid w-full grid-cols-4 divide-x divide-y divide-stone-300/65 dark:divide-stone-700/80">
                <Link
                  to="/ai-planner"
                  title="AI Planner"
                  aria-label="AI Planner"
                  aria-current={plannerActive ? 'page' : undefined}
                  className={`${sidebarIconDockClass} ${
                    plannerActive
                      ? 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      : ''
                  }`}
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
                  to="/ai-sheets"
                  title="AI Sheets"
                  aria-label="AI Sheets"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <IconSheets className="h-3.5 w-3.5 shrink-0" />
                  <span className={sidebarIconDockLabelClass}>AI Sheets</span>
                </Link>
                </div>

                <p className="px-3 pb-0.5 pt-1 text-[9px] font-semibold leading-none tracking-wider text-stone-400 dark:text-stone-500">
                  팀 · 현장
                </p>
                <div className="grid w-full grid-cols-4 divide-x divide-y divide-stone-300/65 dark:divide-stone-700/80">
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
                <Link
                  to="/site-assessment"
                  title="현장 AI 평가"
                  aria-label="현장 AI 평가"
                  className={sidebarIconDockClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-sm leading-none">🦺</span>
                  <span className={sidebarIconDockLabelClass}>현장 AI 평가</span>
                </Link>
                </div>

                <p className="px-3 pb-0.5 pt-1 text-[9px] font-semibold leading-none tracking-wider text-stone-400 dark:text-stone-500">
                  계정
                </p>
                <div className="grid w-full grid-cols-4 divide-x divide-y divide-stone-300/65 dark:divide-stone-700/80">
                {isAdmin ? (
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
                      onOpenTokenRequest()
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
                      onOpenSettings()
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
                      onSignOut()
                    }}
                  >
                    <IconLogout className="h-3.5 w-3.5 shrink-0" />
                    <span className={sidebarIconDockLabelClass}>로그아웃</span>
                  </button>
                </div>
                  </>
                )}
              </div>
            </div>
  )
}
