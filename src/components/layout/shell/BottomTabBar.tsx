import { NavLink, useLocation } from 'react-router-dom'

import type { NavIcon } from '../../../lib/app-navigation'
import { IconChat, IconFolder, IconGrid, IconUser, IconZap } from '../../common/icons'

type BottomTabBarProps = {
  /** 컴포저 포커스 등으로 숨김 */
  hidden: boolean
  launcherOpen: boolean
  accountOpen: boolean
  onOpenLauncher: () => void
  onOpenAccount: () => void
}

const tabBase =
  'relative flex h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/50'

function tabClass(active: boolean) {
  return `${tabBase} ${active ? 'text-brand' : 'text-fg-muted active:text-fg'}`
}

function TabIcon({ icon: Icon, active }: { icon: NavIcon; active: boolean }) {
  return (
    <span
      className={`inline-flex h-[28px] w-[44px] items-center justify-center rounded-full transition-colors ${
        active ? 'bg-brand-soft' : ''
      }`}
      aria-hidden="true"
    >
      <Icon className="h-[22px] w-[22px]" />
    </span>
  )
}

function RouteTab({
  to,
  label,
  icon,
  active,
}: {
  to: string
  label: string
  icon: NavIcon
  active: boolean
}) {
  return (
    <NavLink to={to} className={tabClass(active)} aria-label={label} aria-current={active ? 'page' : undefined}>
      <TabIcon icon={icon} active={active} />
      {label}
    </NavLink>
  )
}

/**
 * 모바일 하단 탭 바 (5탭). md 이상에서는 렌더되지 않는다.
 * 높이 56px + safe-area. 셸 루트의 --app-bottom-nav 변수와 짝을 이룬다.
 */
export function BottomTabBar({
  hidden,
  launcherOpen,
  accountOpen,
  onOpenLauncher,
  onOpenAccount,
}: BottomTabBarProps) {
  const { pathname } = useLocation()
  const overlayActive = launcherOpen || accountOpen
  const chatActive = !overlayActive && (pathname === '/' || pathname.startsWith('/chat/'))
  const referenceActive = !overlayActive && pathname.startsWith('/reference-room')
  const automationActive = !overlayActive && pathname.startsWith('/automation-studio')

  return (
    <nav
      aria-label="하단 탭"
      aria-hidden={hidden || undefined}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md transition-transform duration-200 md:hidden ${
        hidden ? 'pointer-events-none translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="flex items-stretch px-[4px]">
        <RouteTab to="/" label="채팅" icon={IconChat} active={chatActive} />
        <RouteTab to="/reference-room" label="자료실" icon={IconFolder} active={referenceActive} />
        <button
          type="button"
          onClick={onOpenLauncher}
          aria-haspopup="dialog"
          aria-expanded={launcherOpen}
          className={tabClass(launcherOpen)}
          aria-label="모든 앱"
        >
          <TabIcon icon={IconGrid} active={launcherOpen} />
          앱
        </button>
        <RouteTab to="/automation-studio" label="자동화" icon={IconZap} active={automationActive} />
        <button
          type="button"
          onClick={onOpenAccount}
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
          className={tabClass(accountOpen)}
          aria-label="내 정보"
        >
          <TabIcon icon={IconUser} active={accountOpen} />
          내 정보
        </button>
      </div>
    </nav>
  )
}
