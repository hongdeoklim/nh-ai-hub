import { useCallback, useEffect } from 'react'

export type ChatMediaLightboxItem = {
  src: string
  alt?: string
}

type ChatMediaLightboxProps = {
  open: boolean
  items: ChatMediaLightboxItem[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
}

export function ChatMediaLightbox({
  open,
  items,
  index,
  onClose,
  onIndexChange,
}: ChatMediaLightboxProps) {
  const hasItems = items.length > 0
  const safeIndex = hasItems
    ? Math.min(Math.max(0, index), items.length - 1)
    : 0
  const current = hasItems ? items[safeIndex] : null

  const goPrev = useCallback(() => {
    if (items.length <= 1) return
    onIndexChange(safeIndex <= 0 ? items.length - 1 : safeIndex - 1)
  }, [items.length, onIndexChange, safeIndex])

  const goNext = useCallback(() => {
    if (items.length <= 1) return
    onIndexChange(safeIndex >= items.length - 1 ? 0 : safeIndex + 1)
  }, [items.length, onIndexChange, safeIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, goPrev, goNext])

  if (!open || !current) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 미리보기"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(92dvh,56rem)] w-full max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="truncate text-sm font-medium text-white/90">
            {current.alt?.trim() || `이미지 ${safeIndex + 1} / ${items.length}`}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
          >
            닫기
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10">
          <img
            src={current.src}
            alt={current.alt ?? '첨부 이미지'}
            className="max-h-[min(80dvh,52rem)] max-w-full object-contain"
          />

          {items.length > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-white hover:bg-black/70"
                aria-label="이전 이미지"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-lg text-white hover:bg-black/70"
                aria-label="다음 이미지"
              >
                ›
              </button>
            </>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className="mt-3 flex justify-center gap-2 overflow-x-auto pb-1">
            {items.map((item, i) => (
              <button
                key={`${item.src}-${i}`}
                type="button"
                onClick={() => onIndexChange(i)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  i === safeIndex
                    ? 'border-white ring-2 ring-white/40'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={item.src}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
