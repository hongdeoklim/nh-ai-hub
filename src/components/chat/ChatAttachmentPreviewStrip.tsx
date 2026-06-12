import { useMemo, useState } from 'react'

import {
  ChatMediaLightbox,
  type ChatMediaLightboxItem,
} from './ChatMediaLightbox'

export type AttachmentPreviewItem = {
  src: string
  alt?: string
  /** 입력창 전용: 제거 버튼 */
  onRemove?: () => void
}

type ChatAttachmentPreviewStripProps = {
  items: AttachmentPreviewItem[]
  /** composer = 입력창, bubble = 말풍선 */
  layout?: 'composer' | 'bubble'
  variant?: 'default' | 'claude' | 'gemini'
  disabled?: boolean
}

export function ChatAttachmentPreviewStrip({
  items,
  layout = 'bubble',
  variant = 'claude',
  disabled = false,
}: ChatAttachmentPreviewStripProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const lightboxItems: ChatMediaLightboxItem[] = useMemo(
    () => items.map((i) => ({ src: i.src, alt: i.alt })),
    [items],
  )

  if (items.length === 0) return null

  const isComposer = layout === 'composer'
  const thumbClass = isComposer
    ? 'h-16 w-16'
    : 'h-28 w-full max-w-[14rem] sm:h-32'

  const gridClass = isComposer
    ? 'flex flex-wrap gap-2'
    : items.length === 1
      ? 'grid grid-cols-1'
      : 'grid grid-cols-2 gap-2'

  const borderClass =
    variant === 'claude'
      ? 'border-stone-300/80 dark:border-stone-600'
      : 'border-white/30'

  return (
    <>
      <div className={`mb-2 ${isComposer ? 'max-h-20 overflow-y-auto' : ''}`}>
        <div className={gridClass}>
        {items.map((item, idx) => (
          <div
            key={`${item.src}-${idx}`}
            className={`group relative shrink-0 overflow-hidden rounded-xl border bg-stone-100/80 shadow-sm dark:bg-stone-900/60 ${borderClass} ${
              isComposer ? '' : 'justify-self-end'
            }`}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => setLightboxIndex(idx)}
              className={`block ${thumbClass} disabled:cursor-not-allowed`}
              aria-label={`${item.alt ?? '첨부 이미지'} 크게 보기`}
            >
              <img
                src={item.src}
                alt={item.alt ?? `첨부 ${idx + 1}`}
                className="h-full w-full object-cover transition group-hover:brightness-95"
              />
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/45 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white">
                  크게 보기
                </span>
              </span>
            </button>
            {item.onRemove ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  item.onRemove?.()
                }}
                disabled={disabled}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-sm font-bold text-white hover:bg-black/85 disabled:opacity-40"
                aria-label={`${item.alt ?? '첨부'} 삭제`}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        </div>
      </div>

      <ChatMediaLightbox
        open={lightboxIndex !== null}
        items={lightboxItems}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  )
}
