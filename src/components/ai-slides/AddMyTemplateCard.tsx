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
 className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong/90 bg-surface/80 px-4 py-6 text-center transition hover:border-orange-400/80 hover:bg-brand-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[13px] text-fg-subtle">
          +
        </span>
        <span className="font-semibold text-fg">
 Add My Template
        </span>
        <span className="text-fg-subtle">
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
