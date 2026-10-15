import { Link } from 'react-router-dom'

import { NAV_GROUPS, type NavGroupId, type NavIcon } from '../../../lib/app-navigation'
import { Avatar } from '../../common/Avatar'
import { IconPenSquare, IconSettings, IconShield } from '../../common/icons'

type NavRailProps = {
  /** 현재 경로가 속한 그룹 (활성 표시) */
  activeGroupId: NavGroupId | null
  /** 보조 패널이 열려 있고 표시 중인 그룹 */
  panelOpen: boolean
  panelGroupId: NavGroupId
  onSelectGroup: (id: NavGroupId) => void
  onNewChat: () => void
  isAdmin: boolean
  profileName: string
  accountOpen: boolean
  onToggleAccount: () => void
  onOpenSettings: () => void
}

function RailButton({
  label,
  icon: Icon,
  active,
  expanded,
  onClick,
}: {
  label: string
  icon: NavIcon
  active: boolean
  expanded?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-expanded={expanded}
      title={label}
      className={`relative flex h-[56px] w-[56px] flex-col items-center justify-center gap-[4px] rounded-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 ${
        active
          ? 'bg-brand-soft text-brand before:absolute before:-left-[6px] before:top-[14px] before:h-[28px] before:w-[3px] before:rounded-full before:bg-brand'
          : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
      }`}
    >
      <Icon className="h-[22px] w-[22px]" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  )
}

/**
 * PC 좌측 아이콘 레일 (68px). 그룹 단위 내비게이션 + 새 채팅 + 계정.
 * 그룹을 누르면 우측 보조 패널에 해당 그룹의 항목(또는 채팅 목록)이 열린다.
 */
export function NavRail({
  activeGroupId,
  panelOpen,
  panelGroupId,
  onSelectGroup,
  onNewChat,
  isAdmin,
  profileName,
  accountOpen,
  onToggleAccount,
  onOpenSettings,
}: NavRailProps) {
  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col items-center border-r border-border bg-surface py-[10px] md:flex"
    >
      <Link
        to="/"
        aria-label="NH-AX-HUB 홈"
        title="NH-AX-HUB"
        className="mb-[8px] inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-gradient-to-br from-brand to-accent text-[13px] font-extrabold tracking-tight text-white shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
      >
        NH
      </Link>

      <button
        type="button"
        onClick={onNewChat}
        title="새 채팅"
        aria-label="새 채팅"
        className="mb-[10px] inline-flex h-[40px] w-[40px] items-center justify-center rounded-full bg-brand text-brand-fg shadow-card transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
      >
        <IconPenSquare className="h-[18px] w-[18px]" />
      </button>

      <div className="flex flex-1 flex-col items-center gap-[4px]">
        {NAV_GROUPS.map((group) => (
          <RailButton
            key={group.id}
            label={group.short}
            icon={group.icon}
            active={activeGroupId === group.id}
            expanded={panelOpen && panelGroupId === group.id}
            onClick={() => onSelectGroup(group.id)}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-[4px] pb-[env(safe-area-inset-bottom)]">
        {isAdmin ? (
          <Link
            to="/admin"
            title="관리자 콘솔"
            aria-label="관리자 콘솔"
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] text-warning transition hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
          >
            <IconShield className="h-[20px] w-[20px]" />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onOpenSettings}
          title="설정"
          aria-label="설정"
          className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] text-fg-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
        >
          <IconSettings className="h-[20px] w-[20px]" />
        </button>
        <button
          type="button"
          onClick={onToggleAccount}
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
          title={profileName}
          aria-label="내 계정"
          className="mt-[4px] inline-flex h-[44px] w-[44px] items-center justify-center rounded-full transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
        >
          <Avatar name={profileName} size={32} />
        </button>
      </div>
    </nav>
  )
}
