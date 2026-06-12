import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'

const EXPANDED_HEIGHT_RATIO = 0.62
const EXPANDED_HEIGHT_MAX_PX = 448
const COMPOSER_BOTTOM_OFFSET =
  'max(9.25rem, calc(env(safe-area-inset-bottom) + 9.25rem))'
const CLOSE_DRAG_THRESHOLD_PX = 72

type PromptLibraryMagnetSheetProps = {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children: ReactNode
}

function readExpandedHeightPx() {
  if (typeof window === 'undefined') return EXPANDED_HEIGHT_MAX_PX
  return Math.min(
    window.innerHeight * EXPANDED_HEIGHT_RATIO,
    EXPANDED_HEIGHT_MAX_PX,
  )
}

export function PromptLibraryMagnetSheet({
  expanded,
  onExpandedChange,
  children,
}: PromptLibraryMagnetSheetProps) {
  const draggingRef = useRef(false)
  const dragStartYRef = useRef(0)
  const dragStartHeightRef = useRef(readExpandedHeightPx())
  const expandedHeightRef = useRef(readExpandedHeightPx())
  const [heightPx, setHeightPx] = useState(expandedHeightRef.current)
  const [isDragging, setIsDragging] = useState(false)

  const close = useCallback(() => {
    onExpandedChange(false)
    setHeightPx(expandedHeightRef.current)
  }, [onExpandedChange])

  useEffect(() => {
    function onResize() {
      expandedHeightRef.current = readExpandedHeightPx()
      if (!draggingRef.current) {
        setHeightPx(expandedHeightRef.current)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (draggingRef.current) return
    if (expanded) {
      setHeightPx(expandedHeightRef.current)
    }
  }, [expanded])

  if (!expanded) return null

  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    setIsDragging(true)
    dragStartYRef.current = event.clientY
    dragStartHeightRef.current = heightPx
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const deltaY = dragStartYRef.current - event.clientY
    const next = Math.max(
      0,
      Math.min(expandedHeightRef.current, dragStartHeightRef.current + deltaY),
    )
    setHeightPx(next)
  }

  function finishDrag() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    const draggedDown =
      expandedHeightRef.current - heightPx >= CLOSE_DRAG_THRESHOLD_PX
    if (draggedDown) {
      close()
    } else {
      setHeightPx(expandedHeightRef.current)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="프롬프트 패널 닫기"
        className="fixed inset-0 z-[24] bg-stone-900/25 backdrop-blur-[1px] lg:hidden"
        onClick={close}
      />

      <div
        className="fixed inset-x-0 z-[25] flex min-h-0 flex-col overflow-hidden rounded-t-[1.35rem] border border-b-0 border-stone-300/85 bg-[#F4F1EA] shadow-[0_-10px_36px_rgba(28,25,23,0.14)] dark:border-stone-700 dark:bg-stone-900 lg:hidden"
        style={{
          bottom: COMPOSER_BOTTOM_OFFSET,
          height: heightPx,
          transition: isDragging ? 'none' : 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        aria-expanded={expanded}
      >
        <div
          className="flex shrink-0 touch-none flex-col items-center border-b border-stone-200/75 bg-[#F4F1EA]/95 px-3 pb-2.5 pt-2.5 dark:border-stone-700 dark:bg-stone-900/95"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <div
            className="h-1 w-11 rounded-full bg-stone-400/90 dark:bg-stone-500"
            aria-hidden="true"
          />
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </>
  )
}
