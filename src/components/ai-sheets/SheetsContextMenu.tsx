import { useEffect, useRef } from 'react'

export type ContextMenuActionId =
  | 'send-to-chat'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'paste-options'
  | 'insert'
  | 'delete'
  | 'clear'
  | 'filter'
  | 'sort-asc'
  | 'sort-desc'
  | 'note'
  | 'format-cells'
  | 'convert-value'
  | 'link'
  | 'rich-text'
  | 'define-name'
  | 'tags'
  | 'default'

type MenuItem = {
  id: ContextMenuActionId
  label: string
  separatorBefore?: boolean
  disabled?: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'send-to-chat', label: 'Send to Chat' },
  { id: 'cut', label: '잘라내기' },
  { id: 'copy', label: '복사' },
  { id: 'paste', label: '붙여넣기' },
  { id: 'paste-options', label: '옵션: 붙여넣기', separatorBefore: true },
  { id: 'insert', label: '삽입...' },
  { id: 'delete', label: '삭제...' },
  { id: 'clear', label: '내용 지우기', separatorBefore: true },
  { id: 'filter', label: '필터' },
  { id: 'sort-asc', label: '정렬 (오름차순)' },
  { id: 'sort-desc', label: '정렬 (내림차순)' },
  { id: 'note', label: '새 노트', separatorBefore: true },
  { id: 'format-cells', label: '셀 서식...' },
  { id: 'convert-value', label: '셀 값 변환...' },
  { id: 'link', label: '링크' },
  { id: 'rich-text', label: '서식 있는 텍스트...' },
  { id: 'define-name', label: '이름 정의...', separatorBefore: true },
  { id: 'tags', label: '태그...' },
  { id: 'default', label: '기본값...' },
]

type SheetsContextMenuProps = {
  x: number
  y: number
  onAction: (action: ContextMenuActionId) => void
  onClose: () => void
}

export function SheetsContextMenu({
  x,
  y,
  onAction,
  onClose,
}: SheetsContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return
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

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 8
    const maxY = window.innerHeight - rect.height - 8
    el.style.left = `${Math.min(x, maxX)}px`
    el.style.top = `${Math.min(y, maxY)}px`
  }, [x, y])

  return (
    <div className="gc-context-menu-host" role="presentation">
      <div
        ref={ref}
        className="gc-ui-contextmenu-container ui-widget"
        style={{ left: x, top: y }}
        role="menu"
      >
        <div className="gc-ui-contextmenu-scroll-wrapper">
          {MENU_ITEMS.map((item) => (
            <div key={item.id}>
              {item.separatorBefore ? (
                <div className="gc-context-menu-separator" role="separator" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className="gc-context-menu-item"
                onClick={() => {
                  onAction(item.id)
                  onClose()
                }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
