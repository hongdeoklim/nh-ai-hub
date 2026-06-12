import { useRef } from 'react'

type AddMyTemplateCardProps = {
  onAdd: (file: File) => void
  disabled?: boolean
}

export function AddMyTemplateCard({ onAdd, disabled }: AddMyTemplateCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <article className="break-inside-avoid">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300/90 bg-white/80 px-4 py-6 text-center transition hover:border-orange-400/80 hover:bg-orange-50/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900/60 dark:hover:border-orange-600/60 dark:hover:bg-orange-950/20"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-[13px] text-stone-500 dark:bg-stone-800 dark:text-stone-300">
          +
        </span>
        <span className="font-semibold text-stone-800 dark:text-stone-100">
          Add My Template
        </span>
        <span className="text-stone-500 dark:text-stone-400">
          PNG·JPG 슬라이드 썸네일 업로드
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onAdd(file)
          e.target.value = ''
        }}
      />
    </article>
  )
}
