import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useBackCloseable } from '../../hooks/useBackCloseable'

export type OverlayVariant = 'sheet' | 'drawer' | 'dialog'

type OverlayProps = {
  open: boolean
  onClose: () => void
  /** sheet = 모바일 하단 시트 · drawer = 좌측 드로어 · dialog = 중앙 모달 */
  variant: OverlayVariant
  /** 스크린리더용 이름 */
  label: string
  children: ReactNode
  /** 패널 추가 클래스(높이 등). 폭은 widthClass 로 지정 */
  panelClassName?: string
  /**
   * 패널 폭 클래스. dialog 기본 `w-[min(520px,calc(100vw-32px))]`,
   * sheet+desktopDialog 기본 `md:w-[min(560px,calc(100vw-32px))]`
   */
  widthClass?: string
  /** dialog 세로 정렬 — center(기본) | top(명령 팔레트 등) */
  align?: 'center' | 'top'
  /** sheet 를 md 이상에서 중앙 다이얼로그로 승격 */
  desktopDialog?: boolean
  /** 브라우저/안드로이드 뒤로가기로 닫기 (앱 UX). 기본 true */
  backCloseable?: boolean
}

type PanelProps = Omit<OverlayProps, 'open' | 'backCloseable'>

const PANEL_BASE =
  'fixed z-[80] flex flex-col bg-surface text-fg shadow-pop outline-none transition-[transform,opacity] duration-200 ease-out'

function resolvePanelClass(
  variant: OverlayVariant,
  shown: boolean,
  opts: { widthClass?: string; align: 'center' | 'top'; desktopDialog: boolean },
): string {
  if (variant === 'sheet') {
    const desktopWidth = opts.widthClass ?? 'md:w-[min(560px,calc(100vw-32px))]'
    const desktop = opts.desktopDialog
      ? `md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[min(84dvh,760px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[16px] md:border md:pb-0 ${desktopWidth}`
      : ''
    return `inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[20px] border-t border-border pb-[env(safe-area-inset-bottom)] ${
      shown ? 'translate-y-0 opacity-100 md:scale-100' : 'translate-y-[24px] opacity-0 md:scale-[0.98]'
    } ${desktop}`
  }
  if (variant === 'drawer') {
    return `inset-y-0 left-0 ${opts.widthClass ?? 'w-[min(320px,86vw)]'} border-r border-border ${
      shown ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
    }`
  }
  const width = opts.widthClass ?? 'w-[min(520px,calc(100vw-32px))]'
  const position =
    opts.align === 'top'
      ? 'left-1/2 top-[max(16px,12vh)] -translate-x-1/2'
      : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
  return `${position} max-h-[min(86dvh,760px)] ${width} rounded-[16px] border border-border ${
    shown ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'
  }`
}

/**
 * 앱 공용 오버레이 셸. `.app-shell` 트리 안에서 렌더되어 폰트 보정 규칙을 그대로 상속한다
 * (body 포털을 쓰지 않는다 — :root 27px 상속 문제 회피).
 * Escape · 백드롭 클릭 · 뒤로가기로 닫히고, 열려 있는 동안 배경 스크롤을 잠근다.
 * 닫히면 자식이 언마운트되므로 자식의 로컬 상태는 열 때마다 초기화된다.
 */
export function Overlay({ open, backCloseable = true, ...panelProps }: OverlayProps) {
  useBackCloseable(open && backCloseable, panelProps.onClose)
  if (!open) return null
  return <OverlayPanel {...panelProps} />
}

function OverlayPanel({
  onClose,
  variant,
  label,
  children,
  panelClassName = '',
  widthClass,
  align = 'center',
  desktopDialog = false,
}: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    // 마운트 직후 한 프레임 뒤에 표시 상태로 전환 → 진입 트랜지션
    const frame = requestAnimationFrame(() => setShown(true))
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previouslyFocused = document.activeElement as HTMLElement | null

    queueMicrotask(() => {
      const panel = panelRef.current
      if (!panel) return
      if (!panel.contains(document.activeElement)) panel.focus()
    })

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [])

  const panelClass = resolvePanelClass(variant, shown, { widthClass, align, desktopDialog })

  return (
    <>
      <div
        className={`fixed inset-0 z-[79] bg-black/35 backdrop-blur-[2px] transition-opacity duration-200 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${PANEL_BASE} ${panelClass} ${panelClassName}`}
      >
        {children}
      </div>
    </>
  )
}

/** 시트/다이얼로그 공용 헤더 */
export function OverlayHeader({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-[12px] border-b border-border px-[16px] py-[12px]">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description ? (
          <p className="mt-[2px] text-xs text-fg-muted">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-[4px]">
        {children}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-fg-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
