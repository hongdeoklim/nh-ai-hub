import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { LAUNCHER_GROUPS, type NavItem } from '../../../lib/app-navigation'
import {
  IconCoins,
  IconHelpCircle,
  IconSearch,
  IconSettings,
  IconShield,
} from '../../common/icons'

type AppLauncherProps = {
  isAdmin: boolean
  onNavigate: () => void
  onOpenSettings: () => void
  onOpenTokenRequest: () => void
  onOpenHelp: () => void
}

function LauncherTile({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className="flex items-start gap-[12px] rounded-[14px] border border-border bg-surface p-[12px] transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 active:bg-surface-2"
    >
      <span
        className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand"
        aria-hidden="true"
      >
        <Icon className="h-[20px] w-[20px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-fg">{item.label}</span>
        <span className="mt-[2px] line-clamp-2 block text-[11px] leading-snug text-fg-muted">
          {item.description}
        </span>
      </span>
    </Link>
  )
}

function ActionTile({
  icon: Icon,
  label,
  description,
  onClick,
  to,
  tone = 'default',
}: {
  icon: typeof IconSettings
  label: string
  description: string
  onClick?: () => void
  to?: string
  tone?: 'default' | 'warning'
}) {
  const cls =
    'flex items-start gap-[12px] rounded-[14px] border border-border bg-surface p-[12px] text-left transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 active:bg-surface-2'
  const iconCls = `inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] ${
    tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-fg-muted'
  }`
  const body = (
    <>
      <span className={iconCls} aria-hidden="true">
        <Icon className="h-[20px] w-[20px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-fg">{label}</span>
        <span className="mt-[2px] line-clamp-2 block text-[11px] leading-snug text-fg-muted">
          {description}
        </span>
      </span>
    </>
  )
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={cls}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

/**
 * 앱 런처 — 모든 화면을 그룹·레이블·설명과 함께 보여준다 (모바일 "앱" 탭 / PC 명령 팔레트 보조).
 */
export function AppLauncher({
  isAdmin,
  onNavigate,
  onOpenSettings,
  onOpenTokenRequest,
  onOpenHelp,
}: AppLauncherProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return LAUNCHER_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.hidden) return false
        if (!q) return true
        return [item.label, item.short, item.description, ...(item.keywords ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(q)
      }),
    })).filter((group) => group.items.length > 0)
  }, [query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-[16px] pb-[8px]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-[12px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-fg-subtle" />
          <label htmlFor="app-launcher-search" className="sr-only">
            앱 검색
          </label>
          <input
            id="app-launcher-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="앱 검색 (예: 자료실, 슬라이드, CAD)"
            className="h-[40px] w-full rounded-[12px] border border-border bg-surface-2/60 pl-[36px] pr-[12px] text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-brand focus:bg-surface focus:ring-2 focus:ring-focus/25"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[16px] pb-[20px]">
        {groups.length === 0 ? (
          <p className="py-[24px] text-center text-sm text-fg-muted">검색 결과가 없습니다.</p>
        ) : (
          groups.map((group) => {
            const GroupIcon = group.icon
            return (
              <section key={group.id} aria-labelledby={`launcher-${group.id}`} className="mt-[12px]">
                <h3
                  id={`launcher-${group.id}`}
                  className="mb-[8px] flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                >
                  <GroupIcon className="h-[14px] w-[14px]" />
                  {group.label}
                </h3>
                <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
                  {group.items.map((item) => (
                    <LauncherTile key={item.to} item={item} onNavigate={onNavigate} />
                  ))}
                </div>
              </section>
            )
          })
        )}

        {!query.trim() ? (
          <section aria-labelledby="launcher-account" className="mt-[12px]">
            <h3
              id="launcher-account"
              className="mb-[8px] text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
            >
              계정 · 지원
            </h3>
            <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
              <ActionTile
                icon={IconSettings}
                label="설정"
                description="프로필 · 테마 · 연동 · 예약 작업"
                onClick={() => {
                  onNavigate()
                  onOpenSettings()
                }}
              />
              {isAdmin ? (
                <ActionTile
                  icon={IconCoins}
                  label="토큰 요청 관리"
                  description="직원 토큰 증액 요청 승인"
                  to="/admin/token-requests"
                  onClick={onNavigate}
                />
              ) : (
                <ActionTile
                  icon={IconCoins}
                  label="토큰 요청"
                  description="월간 토큰 한도 증액 요청"
                  onClick={() => {
                    onNavigate()
                    onOpenTokenRequest()
                  }}
                />
              )}
              <ActionTile
                icon={IconHelpCircle}
                label="AI 사용 가이드"
                description="처음 사용자를 위한 빠른 안내"
                onClick={() => {
                  onNavigate()
                  onOpenHelp()
                }}
              />
              {isAdmin ? (
                <ActionTile
                  icon={IconShield}
                  label="관리자 콘솔"
                  description="직원 · 모델 · 감사 · 운영 지표"
                  to="/admin"
                  onClick={onNavigate}
                  tone="warning"
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
