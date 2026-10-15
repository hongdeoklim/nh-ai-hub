import { Link } from 'react-router-dom'

import type { AppUserProfile } from '../../auth/auth-context'
import { useTheme, type ThemePreference } from '../../../hooks/useTheme'
import { Avatar } from '../../common/Avatar'
import { TokenMeter } from '../../common/TokenMeter'
import {
  IconCoins,
  IconHelpCircle,
  IconLogOut,
  IconMonitor,
  IconMoon,
  IconSettings,
  IconShield,
  IconSun,
} from '../../common/icons'

type AccountMenuProps = {
  profile: AppUserProfile | null
  displayName: string
  isAdmin: boolean
  onClose: () => void
  onOpenSettings: () => void
  onOpenTokenRequest: () => void
  onOpenHelp: () => void
  onSignOut: () => void
}

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; icon: typeof IconSun }> = [
  { id: 'system', label: '시스템', icon: IconMonitor },
  { id: 'light', label: '라이트', icon: IconSun },
  { id: 'dark', label: '다크', icon: IconMoon },
]

const rowClass =
  'flex w-full items-center gap-[10px] rounded-[10px] px-[10px] py-[9px] text-left text-sm text-fg transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50'

/**
 * 계정 메뉴 내용 — PC 팝오버 / 모바일 시트 공용.
 */
export function AccountMenu({
  profile,
  displayName,
  isAdmin,
  onClose,
  onOpenSettings,
  onOpenTokenRequest,
  onOpenHelp,
  onSignOut,
}: AccountMenuProps) {
  const { preference, setPreference } = useTheme()
  const department = profile?.department?.trim() || '부서 미등록'
  const rankTitle = [profile?.job_rank?.trim(), profile?.job_title?.trim()].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-[12px] px-[16px] pt-[16px]">
        <Avatar name={displayName} size={48} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-fg">{displayName}</p>
          <p className="truncate text-xs text-fg-muted">
            {[department, rankTitle].filter(Boolean).join(' · ')}
          </p>
          {profile?.email ? (
            <p className="truncate text-[11px] text-fg-subtle">{profile.email}</p>
          ) : null}
        </div>
      </div>

      <div className="mx-[16px] mt-[14px] rounded-[12px] border border-border bg-surface-2/50 p-[12px]">
        <TokenMeter
          used={profile?.current_token_usage ?? 0}
          limit={profile?.token_limit ?? 0}
          loading={!profile}
        />
        {!isAdmin ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenTokenRequest()
            }}
            className="mt-[10px] inline-flex h-[32px] items-center gap-[6px] rounded-[8px] border border-border bg-surface px-[10px] text-xs font-semibold text-fg transition hover:bg-surface-2"
          >
            <IconCoins className="h-[14px] w-[14px]" />
            토큰 증액 요청
          </button>
        ) : null}
      </div>

      <div className="px-[16px] pt-[14px]">
        <p className="mb-[6px] text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          화면 테마
        </p>
        <div role="radiogroup" aria-label="화면 테마" className="grid grid-cols-3 gap-[4px] rounded-[10px] bg-surface-2 p-[4px]">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = preference === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(opt.id)}
                className={`inline-flex h-[32px] items-center justify-center gap-[6px] rounded-[8px] text-xs font-medium transition ${
                  active ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <Icon className="h-[14px] w-[14px]" />
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-[10px] flex flex-col gap-[2px] px-[8px] pb-[10px]">
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            onClose()
            onOpenSettings()
          }}
        >
          <IconSettings className="h-[18px] w-[18px] text-fg-muted" />
          설정
          <span className="ml-auto text-[11px] text-fg-subtle">프로필 · 연동 · 예약</span>
        </button>
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            onClose()
            onOpenHelp()
          }}
        >
          <IconHelpCircle className="h-[18px] w-[18px] text-fg-muted" />
          AI 사용 가이드
        </button>
        {isAdmin ? (
          <>
            <Link to="/admin/token-requests" onClick={onClose} className={rowClass}>
              <IconCoins className="h-[18px] w-[18px] text-fg-muted" />
              토큰 요청 관리
            </Link>
            <Link to="/admin" onClick={onClose} className={`${rowClass} text-warning`}>
              <IconShield className="h-[18px] w-[18px]" />
              관리자 콘솔
            </Link>
          </>
        ) : null}
        <div className="my-[4px] border-t border-border" role="separator" />
        <button
          type="button"
          className={`${rowClass} text-danger hover:bg-danger-soft`}
          onClick={() => {
            onClose()
            onSignOut()
          }}
        >
          <IconLogOut className="h-[18px] w-[18px]" />
          로그아웃
        </button>
      </div>
    </div>
  )
}
