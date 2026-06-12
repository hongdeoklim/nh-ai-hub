import { useState, type CSSProperties } from 'react'

import { AiUsageGuideDialog } from './AiUsageGuideDialog'

type AccountHeaderActionsProps = {
  onOpenSettings: () => void
  onSignOut: () => void
  size?: 'compact' | 'touch'
  className?: string
}

function IconHelp(props: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={props.className}
      style={props.style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

export function IconSettings(props: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={props.className}
      style={props.style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  )
}

export function IconLogout(props: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={props.className}
      style={props.style}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  )
}

const compactBtnClass =
  'flex h-8 w-8 items-center justify-center rounded-md text-stone-600 transition hover:bg-stone-200/80 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100'

const touchBtnClass =
  'flex h-11 w-11 items-center justify-center rounded-lg text-stone-800 transition hover:bg-stone-200/80 dark:text-stone-200 dark:hover:bg-stone-800'

const compactIconStyle = { width: 14, height: 14 } as const

export function AccountHeaderActions({
  onOpenSettings,
  onSignOut,
  size = 'compact',
  className = 'ml-auto flex shrink-0 items-center gap-0.5',
}: AccountHeaderActionsProps) {
  const [guideOpen, setGuideOpen] = useState(false)
  const btnClass = size === 'touch' ? touchBtnClass : compactBtnClass
  const iconClass = size === 'touch' ? 'h-6 w-6 shrink-0' : 'shrink-0'
  const iconStyle = size === 'touch' ? undefined : compactIconStyle

  return (
    <>
      <div className={className}>
        <button
          type="button"
          title="도움말"
          aria-label="도움말"
          className={btnClass}
          onClick={() => setGuideOpen(true)}
        >
          <IconHelp className={iconClass} style={iconStyle} />
        </button>
        <button
          type="button"
          title="설정"
          aria-label="설정"
          className={btnClass}
          onClick={onOpenSettings}
        >
          <IconSettings className={iconClass} style={iconStyle} />
        </button>
        <button
          type="button"
          title="로그아웃"
          aria-label="로그아웃"
          className={btnClass}
          onClick={() => void onSignOut()}
        >
          <IconLogout className={iconClass} style={iconStyle} />
        </button>
      </div>
      <AiUsageGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}
