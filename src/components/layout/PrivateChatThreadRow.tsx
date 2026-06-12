import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'

import type { PrivateChatThreadSummary } from '../../lib/private-chat-storage'

function IconMoreVert(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  )
}

function IconPushPin(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
    </svg>
  )
}

type PrivateChatThreadRowProps = {
  thread: PrivateChatThreadSummary
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onShare: (threadId: string) => void
  onTogglePin: (threadId: string) => void
  onRename: (threadId: string, currentTitle: string) => void
  onAddToNotebook: (threadId: string) => void
  onDelete: (threadId: string) => void
  onNavigate?: () => void
}

const menuItemClass =
  'flex w-full items-center px-4 py-2.5 text-left leading-snug text-stone-800 transition hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800'

export function PrivateChatThreadRow({
  thread,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onShare,
  onTogglePin,
  onRename,
  onAddToNotebook,
  onDelete,
  onNavigate,
}: PrivateChatThreadRowProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
      return
    }

    function updatePosition() {
      const button = menuButtonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      setMenuPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null
      if (
        (menuRef.current && target && menuRef.current.contains(target)) ||
        (menuButtonRef.current && target && menuButtonRef.current.contains(target))
      ) {
        return
      }
      onCloseMenu()
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseMenu()
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [menuOpen, onCloseMenu])

  const menuPanel =
    menuOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`${thread.title} 메뉴`}
            className="private-chat-thread-menu fixed z-[200] w-[9.375rem] -translate-y-1/2 overflow-hidden rounded-xl border border-stone-200/90 bg-white py-1 shadow-xl dark:border-stone-600 dark:bg-stone-900"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onCloseMenu()
                onShare(thread.threadId)
              }}
            >
              대화 공유
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onCloseMenu()
                onTogglePin(thread.threadId)
              }}
            >
              {thread.pinned ? '고정 해제' : '고정'}
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onCloseMenu()
                onRename(thread.threadId, thread.title)
              }}
            >
              이름 변경
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                onCloseMenu()
                onAddToNotebook(thread.threadId)
              }}
            >
              노트북에 추가
            </button>
            <div
              className="my-1 border-t border-stone-200 dark:border-stone-700"
              role="separator"
            />
            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40`}
              onClick={() => {
                onCloseMenu()
                onDelete(thread.threadId)
              }}
            >
              삭제
            </button>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="group relative flex min-w-0 w-full items-center rounded-none hover:bg-white/50 dark:hover:bg-stone-800/40">
      <NavLink
        to={`/chat/${thread.threadId}`}
        title={thread.title}
        className={({ isActive }) =>
          [
            'min-w-0 flex-1 truncate rounded-none py-1.5 pl-3 text-left text-sm font-normal leading-5 transition-colors',
            thread.pinned ? 'pr-1 font-medium' : 'pr-0',
            isActive
              ? 'bg-orange-200/80 font-medium text-orange-950 dark:bg-orange-950/50 dark:text-orange-50'
              : 'text-stone-700 hover:bg-white/70 dark:text-stone-200 dark:hover:bg-stone-800/80',
          ].join(' ')
        }
        onClick={() => {
          onCloseMenu()
          onNavigate?.()
        }}
      >
        {thread.title}
      </NavLink>

      <div className="relative flex shrink-0 items-center">
        {thread.pinned ? (
          <span
            className="flex h-7 w-7 items-center justify-center text-stone-500 dark:text-stone-400"
            title="고정된 대화"
            aria-label="고정된 대화"
          >
            <IconPushPin className="h-4 w-4 shrink-0" />
          </span>
        ) : null}
        <button
          ref={menuButtonRef}
          type="button"
          className={`flex h-7 w-7 items-center justify-center rounded-none text-stone-500 transition hover:bg-white/80 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600/30 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 ${
            menuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
          aria-label={`${thread.title} 메뉴`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleMenu()
          }}
        >
          <IconMoreVert className="h-4 w-4" />
        </button>
        {menuPanel}
      </div>
    </div>
  )
}
