import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { searchNavItems, type NavIcon } from '../../../lib/app-navigation'
import {
  listPrivateChatThreads,
  searchPrivateChatThreads,
} from '../../../lib/private-chat-storage'
import { Overlay } from '../../common/Overlay'
import { IconChat, IconCornerDownLeft, IconSearch } from '../../common/icons'

export type PaletteAction = {
  id: string
  label: string
  description?: string
  icon: NavIcon
  keywords?: string[]
  run: () => void
}

type PaletteEntry = {
  key: string
  section: '이동' | '최근 대화' | '작업'
  label: string
  description?: string
  icon: NavIcon
  run: () => void
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  actions: PaletteAction[]
}

/**
 * 전역 검색/명령 팔레트 (Ctrl/⌘ + K). 화면 이동 · 최근 대화 · 작업을 한 입력창에서.
 * Overlay 가 닫히면 본문이 언마운트되어 검색어·선택 상태가 초기화된다.
 */
export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="dialog"
      align="top"
      widthClass="w-[min(640px,calc(100vw-24px))]"
      label="검색 및 명령"
      backCloseable={false}
    >
      <PaletteBody onClose={onClose} actions={actions} />
    </Overlay>
  )
}

function PaletteBody({ onClose, actions }: Omit<CommandPaletteProps, 'open'>) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim()
    const nav = searchNavItems(q, true).slice(0, q ? 8 : 6)
    const threads = (q ? searchPrivateChatThreads(q, 6) : listPrivateChatThreads(5)).map(
      (t) => ({
        key: `thread:${t.threadId}`,
        section: '최근 대화' as const,
        label: t.title,
        description: t.pinned ? '고정된 대화' : undefined,
        icon: IconChat,
        run: () => navigate(`/chat/${t.threadId}`),
      }),
    )
    const lower = q.toLowerCase()
    const acts = actions
      .filter((a) =>
        !lower
          ? true
          : [a.label, a.description ?? '', ...(a.keywords ?? [])]
              .join(' ')
              .toLowerCase()
              .includes(lower),
      )
      .map((a) => ({
        key: `action:${a.id}`,
        section: '작업' as const,
        label: a.label,
        description: a.description,
        icon: a.icon,
        run: a.run,
      }))

    return [
      ...nav.map((item) => ({
        key: `nav:${item.to}`,
        section: '이동' as const,
        label: item.label,
        description: item.description,
        icon: item.icon,
        run: () => navigate(item.to),
      })),
      ...threads,
      ...acts,
    ]
  }, [query, actions, navigate])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function runEntry(entry: PaletteEntry | undefined) {
    if (!entry) return
    entry.run()
    onClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (entries.length ? (i + 1) % entries.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runEntry(entries[activeIndex])
    }
  }

  let lastSection: PaletteEntry['section'] | null = null

  return (
    <>
      <div className="flex items-center gap-[10px] border-b border-border px-[14px]">
        <IconSearch className="h-[18px] w-[18px] shrink-0 text-fg-subtle" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={entries[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          aria-label="검색어 또는 명령 입력"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="화면 이름, 대화 제목, 작업을 입력하세요"
          className="h-[52px] min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
        />
        <kbd className="hidden shrink-0 rounded-[6px] border border-border bg-surface-2 px-[6px] py-[2px] font-sans text-[11px]! text-fg-subtle md:inline-block">
          Esc
        </kbd>
      </div>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="결과"
        className="max-h-[min(56dvh,480px)] overflow-y-auto overscroll-contain px-[8px] py-[8px]"
      >
        {entries.length === 0 ? (
          <li className="px-[12px] py-[20px] text-center text-sm text-fg-muted">
            일치하는 항목이 없습니다.
          </li>
        ) : (
          entries.map((entry, index) => {
            const Icon = entry.icon
            const showHeader = entry.section !== lastSection
            lastSection = entry.section
            const active = index === activeIndex
            return (
              <li key={entry.key} role="presentation">
                {showHeader ? (
                  <p className="px-[10px] pb-[4px] pt-[8px] text-[11px]! font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    {entry.section}
                  </p>
                ) : null}
                <button
                  type="button"
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={active}
                  data-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runEntry(entry)}
                  className={`flex w-full items-center gap-[10px] rounded-[10px] px-[10px] py-[8px] text-left transition-colors ${
                    active ? 'bg-brand-soft text-fg' : 'text-fg-muted hover:bg-surface-2'
                  }`}
                >
                  <span
                    className={`inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] ${
                      active ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-fg-muted'
                    }`}
                    aria-hidden="true"
                  >
                    <Icon className="h-[16px] w-[16px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{entry.label}</span>
                    {entry.description ? (
                      <span className="block truncate text-[11px]! text-fg-subtle">{entry.description}</span>
                    ) : null}
                  </span>
                  {active ? (
                    <IconCornerDownLeft className="h-[14px] w-[14px] shrink-0 text-fg-subtle" />
                  ) : null}
                </button>
              </li>
            )
          })
        )}
      </ul>
      <div className="hidden items-center gap-[12px] border-t border-border px-[14px] py-[8px] text-[11px]! text-fg-subtle md:flex">
        <span>↑↓ 이동</span>
        <span>Enter 실행</span>
        <span>Esc 닫기</span>
      </div>
    </>
  )
}
