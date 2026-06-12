import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { StaticOrgPromptItem } from '../../data/org-static-prompts'
import type { ModelSelectVersionRow } from '../../types/ai-models'
import {
  OrgPromptGallery,
  OrgPromptGallerySkeleton,
} from '../prompts/OrgPromptGallery'

function IconChevronDown(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m6 9 6 6 6-6"
      />
    </svg>
  )
}

function costBadgeClass(costInfo: string): string {
  const level = costInfo.trim()
  if (level === '저렴' || level === '초저가') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
  }
  if (level === '높음' || level === '프리미엄') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
  }
  return 'bg-stone-200/90 text-stone-700 dark:bg-stone-700/80 dark:text-stone-200'
}

export { costBadgeClass as modelCostBadgeClass }

export type ModelSelectRowProps = {
  selectedModel: string
  modelVersionSelectId: string
  versionRows: readonly ModelSelectVersionRow[]
  modelSaving: boolean
  profileReady: boolean
  onModelChange: (id: string) => void
}

export function ModelSelectRow({
  selectedModel,
  modelVersionSelectId,
  versionRows,
  modelSaving,
  profileReady,
  onModelChange,
}: ModelSelectRowProps) {
  const safeVersionRows = Array.isArray(versionRows) ? versionRows : []
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number
    left: number
    maxHeight: number
  } | null>(null)

  const disabled = !profileReady || modelSaving
  const selected =
    safeVersionRows.find((row) => row.id === selectedModel) ?? safeVersionRows[0]
  const selectedCost = selected?.costInfo?.trim() || '보통'
  const tooltipSource =
    safeVersionRows.find((row) => row.id === (hoveredId ?? selectedModel)) ??
    selected
  const tooltipText =
    tooltipSource?.description?.trim() ||
    tooltipSource?.hint?.trim() ||
    '안내 준비 중'

  useLayoutEffect(() => {
    if (!open) {
      setMenuAnchor(null)
      return
    }

    function updatePosition() {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const gap = 6
      const maxHeight = Math.min(256, Math.max(120, rect.top - gap - 8))
      const menuWidth = Math.min(352, window.innerWidth - 16)
      let left = rect.left
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuWidth - 8)
      }
      setMenuAnchor({ top: rect.top, left, maxHeight })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        rootRef.current?.contains(target) ||
        listboxRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
      setHoveredId(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setHoveredId(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function selectModel(id: string) {
    onModelChange(id)
    setOpen(false)
    setHoveredId(null)
  }

  return (
    <ModelSelectDropdown
      rootRef={rootRef}
      buttonRef={buttonRef}
      listboxRef={listboxRef}
      menuAnchor={menuAnchor}
      open={open}
      disabled={disabled}
      modelVersionSelectId={modelVersionSelectId}
      listboxId={listboxId}
      selected={selected}
      selectedCost={selectedCost}
      tooltipText={tooltipText}
      versionRows={safeVersionRows}
      selectedModel={selectedModel}
      hoveredId={hoveredId}
      onOpenToggle={() => !disabled && setOpen((prev) => !prev)}
      onHover={setHoveredId}
      onSelect={selectModel}
    />
  )
}

type ModelSelectDropdownProps = {
  rootRef: React.RefObject<HTMLDivElement | null>
  buttonRef: React.RefObject<HTMLButtonElement | null>
  listboxRef: React.RefObject<HTMLUListElement | null>
  menuAnchor: { top: number; left: number; maxHeight: number } | null
  open: boolean
  disabled: boolean
  modelVersionSelectId: string
  listboxId: string
  selected: ModelSelectVersionRow | undefined
  selectedCost: string
  tooltipText: string
  versionRows: readonly ModelSelectVersionRow[]
  selectedModel: string
  hoveredId: string | null
  onOpenToggle: () => void
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

function ModelSelectDropdown({
  rootRef,
  buttonRef,
  listboxRef,
  menuAnchor,
  open,
  disabled,
  modelVersionSelectId,
  listboxId,
  selected,
  selectedCost,
  tooltipText,
  versionRows,
  selectedModel,
  hoveredId,
  onOpenToggle,
  onHover,
  onSelect,
}: ModelSelectDropdownProps) {
  const safeVersionRows = Array.isArray(versionRows) ? versionRows : []

  return (
    <div ref={rootRef} className="relative inline-flex min-w-0 max-w-full shrink">
      <button
        ref={buttonRef}
        type="button"
        id={modelVersionSelectId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={onOpenToggle}
        onMouseEnter={() => onHover(selectedModel)}
        onMouseLeave={() => onHover(null)}
        className="inline-flex h-8 max-w-[min(52vw,14rem)] min-w-0 shrink items-center gap-1.5 rounded-full border-0 bg-stone-100/95 py-0 pl-3 pr-2 font-medium leading-none text-stone-700 outline-none ring-orange-600/20 transition hover:bg-stone-200/90 focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-800/95 dark:text-stone-200 dark:hover:bg-stone-700/90"
        style={{ fontSize: '12.5px' }}
      >
        <span className="min-w-0 truncate">{selected?.label ?? '모델 선택'}</span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${costBadgeClass(selectedCost)}`}
        >
          {selectedCost}
        </span>
        <IconChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-stone-500 transition dark:text-stone-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {tooltipText ? (
        <p
          className={`pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 max-w-[min(18rem,70vw)] rounded-lg border border-stone-200/90 bg-white px-2.5 py-1.5 text-[11px] leading-snug text-stone-600 shadow-md dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 ${
            open || hoveredId ? 'opacity-100' : 'opacity-0'
          } transition-opacity duration-150`}
          role="tooltip"
        >
          {tooltipText}
        </p>
      ) : null}

      {open && menuAnchor
        ? createPortal(
            <ul
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={modelVersionSelectId}
              className="model-select-dropdown fixed z-[200] min-w-[min(100%,18rem)] w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-y-[calc(100%+0.375rem)] overflow-y-auto overscroll-contain rounded-xl border border-stone-200/90 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
              style={{
                top: menuAnchor.top,
                left: menuAnchor.left,
                maxHeight: menuAnchor.maxHeight,
              }}
            >
              {safeVersionRows?.map((option) => {
                if (!option?.id) return null
                const cost = option?.costInfo?.trim() || '보통'
                const subtext =
                  option?.description?.trim() ||
                  option?.hint?.trim() ||
                  '안내 준비 중'
                const isSelected = option.id === selectedModel
                const isHovered = option.id === hoveredId
                return (
                  <li key={option.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => onHover(option.id)}
                      onMouseLeave={() => onHover(null)}
                      onClick={() => onSelect(option.id)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                        isSelected
                          ? 'bg-orange-50/90 dark:bg-orange-950/30'
                          : isHovered
                            ? 'bg-stone-50 dark:bg-stone-800/80'
                            : 'hover:bg-stone-50 dark:hover:bg-stone-800/80'
                      }`}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[12.5px] font-medium text-stone-800 dark:text-stone-100">
                          {option.label}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${costBadgeClass(cost)}`}
                        >
                          {cost}
                        </span>
                      </span>
                      {subtext ? (
                        <span className="line-clamp-2 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                          {subtext}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}

export type ChatStartHubProps = {
  loading: boolean
  showPromptCards: boolean
  prompts: StaticOrgPromptItem[]
  disabled?: boolean
  userGreetingName?: string
  onApplyToInput: (item: StaticOrgPromptItem) => void
  onRemoveFromGallery: (promptId: string) => void | Promise<void>
  onDismissSection?: () => void
}

/** 전사 프롬프트 갤러리 패널 */
export function ChatStartHub({
  loading,
  showPromptCards,
  prompts,
  disabled,
  userGreetingName,
  onApplyToInput,
  onRemoveFromGallery,
  onDismissSection,
}: ChatStartHubProps) {
  if (loading) {
    return (
      <OrgPromptGallerySkeleton
        disabled={disabled}
        onDismissSection={onDismissSection}
        userGreetingName={userGreetingName}
      />
    )
  }

  if (showPromptCards && prompts.length > 0) {
    return (
      <OrgPromptGallery
        prompts={prompts}
        disabled={disabled}
        userGreetingName={userGreetingName}
        onApplyToInput={onApplyToInput}
        onRemoveFromGallery={onRemoveFromGallery}
        onDismissSection={onDismissSection}
      />
    )
  }

  return null
}
