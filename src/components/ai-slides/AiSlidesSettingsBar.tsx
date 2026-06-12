import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import {
  AI_SLIDES_ASPECT_RATIOS,
  AI_SLIDES_GUIDE_MODES,
  AI_SLIDES_IMAGE_ENGINES,
  AI_SLIDES_STYLE_MODES,
  type AiSlidesAspectRatio,
  type AiSlidesGuideMode,
  type AiSlidesImageEngine,
  type AiSlidesStyleMode,
} from '../../data/ai-slides-catalog'

type AiSlidesSettingsBarProps = {
  styleMode: AiSlidesStyleMode
  onStyleModeChange: (mode: AiSlidesStyleMode) => void
  imageEngine: AiSlidesImageEngine
  onImageEngineChange: (engine: AiSlidesImageEngine) => void
  aspectRatio: AiSlidesAspectRatio
  onAspectRatioChange: (ratio: AiSlidesAspectRatio) => void
  guideMode: AiSlidesGuideMode
  onGuideModeChange: (mode: AiSlidesGuideMode) => void
}

type OpenMenu = 'image' | 'ratio' | 'guide' | null

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Genspark `.slides-settings-bar` 트리거 — 라벨만, chevron 없음 */
const barTriggerCls =
  'inline-flex h-7 max-h-7 shrink-0 cursor-pointer select-none items-center whitespace-nowrap rounded-md border-0 bg-transparent px-2 text-[13px] font-medium leading-none text-[#0D0D0D] outline-none transition hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-orange-500/25 dark:text-stone-100 dark:hover:bg-white/5'

type BarDropdownProps = {
  menuId: string
  triggerLabel: string
  ariaLabel: string
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
  menuWidth?: number
  wrapperClassName?: string
}

function BarDropdown({
  menuId,
  triggerLabel,
  ariaLabel,
  open,
  onToggle,
  onClose,
  children,
  menuWidth = 200,
  wrapperClassName = '',
}: BarDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setAnchor(null)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    setAnchor({ top: rect.bottom + 4, left: rect.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }
      onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return (
    <div className={`dropdown-selector shrink-0 ${wrapperClassName}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={barTriggerCls}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={onToggle}
      >
        {triggerLabel}
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="listbox"
              aria-label={ariaLabel}
              className="dropdown-menu fixed z-[200] overflow-hidden rounded-xl border border-[#E8E8E8] bg-white shadow-[0px_8px_24px_rgba(0,0,0,0.12)] dark:border-stone-700 dark:bg-[#2A2A2A]"
              style={{
                top: anchor.top,
                left: anchor.left,
                width: menuWidth,
              }}
            >
              <div className="dropdown-menu-inner max-h-[360px] overflow-y-auto overscroll-contain py-1">
                {children}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function BarDivider() {
  return (
    <span
      className="mx-0.5 h-4 w-px shrink-0 self-center bg-[#E0E0E0] dark:bg-stone-600"
      aria-hidden="true"
    />
  )
}

/** Genspark `.slides-settings-bar` — h-9(36px) 컴팩트 한 줄 */
export function AiSlidesSettingsBar({
  styleMode,
  onStyleModeChange,
  imageEngine,
  onImageEngineChange,
  aspectRatio,
  onAspectRatioChange,
  guideMode,
  onGuideModeChange,
}: AiSlidesSettingsBarProps) {
  const baseId = useId()
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)

  const imageLabel =
    AI_SLIDES_IMAGE_ENGINES.find((e) => e.id === imageEngine)?.label ??
    'Gemini Image'
  const ratioLabel =
    AI_SLIDES_ASPECT_RATIOS.find((r) => r.id === aspectRatio)?.label ??
    'Auto Ratio'

  function toggleMenu(menu: OpenMenu) {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function closeMenu() {
    setOpenMenu(null)
  }

  return (
    <div
      className="slides-settings-bar inline-flex h-9 max-h-9 w-fit max-w-full flex-nowrap items-center gap-0 overflow-visible rounded-lg bg-[#F5F5F5] p-1 text-[13px] leading-none dark:bg-stone-800/90"
      role="toolbar"
      aria-label="슬라이드 생성 설정"
    >
      <div className="style-mode-toggle inline-flex h-7 max-h-7 shrink-0 items-center rounded-md bg-white p-0.5 shadow-sm dark:bg-stone-900">
        {AI_SLIDES_STYLE_MODES.map((mode) => {
          const active = styleMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onStyleModeChange(mode.id)}
              className={`h-6 whitespace-nowrap rounded px-2.5 text-[13px] font-medium leading-none transition ${
                active
                  ? 'bg-[#0D0D0D] text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'text-[#525252] hover:text-[#0D0D0D] dark:text-stone-400 dark:hover:text-stone-100'
              }`}
            >
              {mode.label}
            </button>
          )
        })}
      </div>

      <BarDivider />

      <BarDropdown
        menuId={`${baseId}-image`}
        triggerLabel={imageLabel}
        ariaLabel="Image engine"
        open={openMenu === 'image'}
        onToggle={() => toggleMenu('image')}
        onClose={closeMenu}
        menuWidth={220}
        wrapperClassName="image-engine-selector"
      >
        {AI_SLIDES_IMAGE_ENGINES.map((engine) => {
          const selected = imageEngine === engine.id
          return (
            <button
              key={engine.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                selected
                  ? 'bg-[#F5F5F5] dark:bg-stone-700/60'
                  : 'hover:bg-[#F5F5F5]/80 dark:hover:bg-stone-700/40'
              }`}
              onClick={() => {
                onImageEngineChange(engine.id)
                closeMenu()
              }}
            >
              <span className="text-[13px] font-medium text-[#0D0D0D] dark:text-stone-50">
                {engine.label}
              </span>
              {selected ? (
                <IconCheck className="shrink-0 text-[#0D0D0D] dark:text-stone-200" />
              ) : null}
            </button>
          )
        })}
      </BarDropdown>

      <BarDivider />

      <BarDropdown
        menuId={`${baseId}-ratio`}
        triggerLabel={ratioLabel}
        ariaLabel="Aspect ratio"
        open={openMenu === 'ratio'}
        onToggle={() => toggleMenu('ratio')}
        onClose={closeMenu}
        menuWidth={320}
        wrapperClassName="aspect-ratio-selector"
      >
        {AI_SLIDES_ASPECT_RATIOS.map((ratio) => {
          const selected = aspectRatio === ratio.id
          return (
            <button
              key={ratio.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition ${
                selected
                  ? 'bg-[#F5F5F5] dark:bg-stone-700/60'
                  : 'hover:bg-[#F5F5F5]/80 dark:hover:bg-stone-700/40'
              }`}
              onClick={() => {
                onAspectRatioChange(ratio.id)
                closeMenu()
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug text-[#0D0D0D] dark:text-stone-50">
                  {ratio.label}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[#737373] dark:text-stone-400">
                  {ratio.hint}
                </span>
              </span>
              {selected ? (
                <IconCheck className="mt-0.5 shrink-0 text-[#0D0D0D] dark:text-stone-200" />
              ) : null}
            </button>
          )
        })}
      </BarDropdown>

      <BarDivider />

      <BarDropdown
        menuId={`${baseId}-guide`}
        triggerLabel="Guide Mode"
        ariaLabel="Guide Mode"
        open={openMenu === 'guide'}
        onToggle={() => toggleMenu('guide')}
        onClose={closeMenu}
        menuWidth={280}
        wrapperClassName="guide-mode-selector"
      >
        {AI_SLIDES_GUIDE_MODES.map((mode) => {
          const selected = guideMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition ${
                selected
                  ? 'bg-[#F5F5F5] dark:bg-stone-700/60'
                  : 'hover:bg-[#F5F5F5]/80 dark:hover:bg-stone-700/40'
              }`}
              onClick={() => {
                onGuideModeChange(mode.id)
                closeMenu()
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug text-[#0D0D0D] dark:text-stone-50">
                  {mode.label}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[#737373] dark:text-stone-400">
                  {mode.hint}
                </span>
              </span>
              {selected ? (
                <IconCheck className="mt-0.5 shrink-0 text-[#0D0D0D] dark:text-stone-200" />
              ) : null}
            </button>
          )
        })}
      </BarDropdown>
    </div>
  )
}
