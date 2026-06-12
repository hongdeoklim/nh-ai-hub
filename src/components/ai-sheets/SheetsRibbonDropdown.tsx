import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import type { RibbonActionId } from './SheetsDesignerRibbon'

export type RibbonDropdownItem = {
  id: string
  label: string
  action?: RibbonActionId
  separatorBefore?: boolean
  disabled?: boolean
  children?: RibbonDropdownItem[]
}

type RibbonDropdownProps = {
  items: RibbonDropdownItem[]
  anchorRect: DOMRect | null
  onAction: (action: RibbonActionId) => void
  onClose: () => void
  wide?: boolean
  maxWidth?: number
}

export function RibbonDropdown({
  items,
  anchorRect,
  onAction,
  onClose,
  wide = false,
  maxWidth,
}: RibbonDropdownProps) {
  const menuId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [submenu, setSubmenu] = useState<{
    items: RibbonDropdownItem[]
    rect: DOMRect
  } | null>(null)

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.gc-designer-ribbon-dropdown')) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointer, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!anchorRect) return null

  const left = anchorRect.left
  const top = anchorRect.bottom + 2

  return createPortal(
    <>
      <div
        ref={ref}
        id={menuId}
        role="listbox"
        tabIndex={-1}
        className="gc-designer-root ko gc-designer-ribbon-dropdown gc-designer-dropdown-slide-in"
        style={{
          left,
          top,
          maxWidth: maxWidth ?? (wide ? 560 : 280),
          pointerEvents: 'auto',
        }}
      >
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore ? (
              <div className="gc-ribbon-dropdown-separator" role="separator" />
            ) : null}
            <button
              type="button"
              role="option"
              disabled={item.disabled}
              className={`gc-ribbon-dropdown-item ${item.children?.length ? 'has-submenu' : ''}`}
              onMouseEnter={(e) => {
                if (item.children?.length) {
                  setSubmenu({
                    items: item.children,
                    rect: e.currentTarget.getBoundingClientRect(),
                  })
                } else {
                  setSubmenu(null)
                }
              }}
              onClick={() => {
                if (item.children?.length) return
                if (item.action) onAction(item.action)
                onClose()
              }}
            >
              <span>{item.label}</span>
              {item.children?.length ? (
                <span className="gc-ribbon-dropdown-chevron" aria-hidden>
                  ›
                </span>
              ) : null}
            </button>
          </div>
        ))}
      </div>
      {submenu ? (
        <RibbonDropdown
          items={submenu.items}
          anchorRect={
            new DOMRect(submenu.rect.right, submenu.rect.top, 0, submenu.rect.height)
          }
          onAction={onAction}
          onClose={onClose}
          maxWidth={maxWidth}
        />
      ) : null}
    </>,
    document.body,
  )
}

type RibbonDropdownTriggerProps = {
  label: string
  icon?: ReactNode
  ariaLabel: string
  open: boolean
  onToggle: (rect: DOMRect) => void
  large?: boolean
  split?: boolean
  onPrimaryClick?: () => void
}

export function RibbonDropdownTrigger({
  label,
  icon,
  ariaLabel,
  open,
  onToggle,
  large = false,
  split = false,
  onPrimaryClick,
}: RibbonDropdownTriggerProps) {
  const btnRef = useRef<HTMLDivElement>(null)

  const openMenu = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) onToggle(rect)
  }, [onToggle])

  return (
    <div
      ref={btnRef}
      className={`gc-designer-ribbon-list ${large ? 'gc-designer-ribbon-list-large' : ''} ${split ? 'is-split' : ''}`}
      data-buttontype="dropdown"
      aria-label={ariaLabel}
      aria-haspopup="true"
      aria-expanded={open}
      role="button"
    >
      <button
        type="button"
        className="gc-designer-ribbon-button"
        onClick={() => {
          if (split && onPrimaryClick) onPrimaryClick()
          else openMenu()
        }}
      >
        {icon ? <span className="gc-designer-ribbon-button-icon">{icon}</span> : null}
        <span className="gc-designer-ribbon-button-label">{label}</span>
      </button>
      {split ? (
        <button
          type="button"
          className="gc-designer-ribbon-split-trigger"
          aria-label={`${ariaLabel} 메뉴`}
          onClick={openMenu}
        >
          ▾
        </button>
      ) : null}
    </div>
  )
}

export function RibbonIconButton({
  title,
  pressed,
  onClick,
  children,
  size = 'md',
}: {
  title: string
  pressed?: boolean
  onClick?: () => void
  children: ReactNode
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      title={title}
      className={`gc-designer-ribbon-icon-button ${size === 'sm' ? 'is-sm' : ''} ${pressed ? 'is-pressed' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function RibbonGroupShell({
  label,
  children,
  variant = 'default',
}: {
  label: string
  children: ReactNode
  variant?: 'default' | 'compact'
}) {
  const cls =
    variant === 'compact' ? 'gcd-ribbon-group' : 'gc-designer-ribbon-group'
  return (
    <div className={cls} aria-label={label}>
      <div className="gc-designer-ribbon-group-content">{children}</div>
      <div className="gc-designer-ribbon-group-label">{label}</div>
    </div>
  )
}
