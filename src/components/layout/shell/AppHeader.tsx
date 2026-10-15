import type { ReactNode } from 'react'

import type { PromptPanelRegistration } from '../../../contexts/AppUiContext'
import { Avatar } from '../../common/Avatar'
import {
  IconChevronLeft,
  IconChevronRight,
  IconHelpCircle,
  IconMenu,
  IconPanelLeft,
  IconSearch,
} from '../../common/icons'

type AppHeaderProps = {
  title: string
  subtitle?: string
  /** 모바일: 대화 목록 드로어 열기 */
  onOpenDrawer: () => void
  /** PC: 보조 패널 접기/펼치기 */
  panelOpen: boolean
  onTogglePanel: () => void
  onOpenSearch: () => void
  onOpenHelp: () => void
  promptPanel: PromptPanelRegistration | null
  /** 알림 벨 등 우측 슬롯 */
  notifications?: ReactNode
  tokenPct: number | null
  profileName: string
  accountOpen: boolean
  onToggleAccount: () => void
  /** PC 계정 팝오버 (아바타 아래 렌더) */
  accountPopover?: ReactNode
}

// display 유틸은 포함하지 않는다 — `hidden md:inline-flex` 같은 반응형 표시 제어와 충돌 방지
const iconBtn =
  'h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] text-fg-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50'

/**
 * 상단 앱 헤더 (PC/모바일 공용). 제목 · 전역 검색/명령 · 알림 · 계정.
 */
export function AppHeader({
  title,
  subtitle,
  onOpenDrawer,
  panelOpen,
  onTogglePanel,
  onOpenSearch,
  onOpenHelp,
  promptPanel,
  notifications,
  tokenPct,
  profileName,
  accountOpen,
  onToggleAccount,
  accountPopover,
}: AppHeaderProps) {
  const tokenTone =
    tokenPct === null
      ? 'bg-surface-2 text-fg-muted'
      : tokenPct <= 15
        ? 'bg-danger-soft text-danger'
        : tokenPct <= 35
          ? 'bg-warning-soft text-warning'
          : 'bg-brand-soft text-brand'

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface/92 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-[52px] items-center gap-[6px] px-[8px] md:gap-[8px] md:px-[12px]">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="대화 목록 열기"
          className={`inline-flex ${iconBtn} md:hidden`}
        >
          <IconMenu className="h-[22px] w-[22px]" />
        </button>
        <button
          type="button"
          onClick={onTogglePanel}
          aria-label={panelOpen ? '보조 패널 접기' : '보조 패널 펼치기'}
          aria-pressed={panelOpen}
          title={panelOpen ? '패널 접기' : '패널 펼치기'}
          className={`hidden md:inline-flex ${iconBtn}`}
        >
          <IconPanelLeft className="h-[20px] w-[20px]" />
        </button>

        <div className="min-w-0 flex-1 md:flex-none md:max-w-[32%]">
          <h1 className="truncate text-base font-semibold leading-tight text-fg">{title}</h1>
          {subtitle ? (
            <p className="hidden truncate text-[11px]! leading-tight text-fg-subtle md:block">{subtitle}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onOpenSearch}
          className="mx-auto hidden h-[36px] w-[min(420px,34vw)] items-center gap-[8px] rounded-[10px] border border-border bg-surface-2/60 px-[12px] text-sm text-fg-muted transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 md:flex"
          aria-label="검색 또는 명령 (Ctrl+K)"
        >
          <IconSearch className="h-[16px] w-[16px] shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">검색 · 이동 · 명령</span>
          <kbd className="hidden shrink-0 rounded-[6px] border border-border bg-surface px-[6px] py-[2px] font-sans text-[11px]! text-fg-subtle lg:inline-block">
            Ctrl K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-[2px] md:gap-[4px]">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="검색"
            className={`inline-flex ${iconBtn} md:hidden`}
          >
            <IconSearch className="h-[20px] w-[20px]" />
          </button>

          {promptPanel ? (
            <button
              type="button"
              onClick={promptPanel.toggle}
              aria-expanded={promptPanel.expanded}
              aria-controls={promptPanel.regionId}
              aria-label={promptPanel.expanded ? '프롬프트 보관함 닫기' : '프롬프트 보관함 열기'}
              title="프롬프트 보관함"
              className={`inline-flex ${iconBtn} ${promptPanel.expanded ? 'bg-brand-soft text-brand' : ''}`}
            >
              {promptPanel.expanded ? (
                <IconChevronLeft className="h-[20px] w-[20px]" />
              ) : (
                <IconChevronRight className="h-[20px] w-[20px]" />
              )}
            </button>
          ) : null}

          {notifications}

          <button
            type="button"
            onClick={onOpenHelp}
            aria-label="도움말"
            title="AI 사용 가이드"
            className={`hidden md:inline-flex ${iconBtn}`}
          >
            <IconHelpCircle className="h-[20px] w-[20px]" />
          </button>

          <span
            className={`hidden h-[28px] items-center rounded-full px-[10px] text-xs font-semibold tabular-nums md:inline-flex ${tokenTone}`}
            title="이번 달 남은 토큰 비율"
          >
            토큰 {tokenPct === null ? '—' : `${tokenPct}%`}
          </span>

          <div className="relative ml-[2px]">
            <button
              type="button"
              onClick={onToggleAccount}
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              aria-label="내 계정"
              title={profileName}
              className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-full transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
            >
              <Avatar name={profileName} size={32} />
            </button>
            {accountPopover}
          </div>
        </div>
      </div>
    </header>
  )
}
