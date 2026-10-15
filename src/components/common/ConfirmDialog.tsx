import { useState, type FormEvent } from 'react'

import { Overlay } from './Overlay'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const secondaryBtn =
  'inline-flex h-[38px] items-center justify-center rounded-[10px] border border-border bg-surface px-[14px] text-sm font-medium text-fg transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-50'

/**
 * window.confirm 대체. 위험 동작은 tone="danger".
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Overlay open={open} onClose={onCancel} variant="dialog" label={title} backCloseable={false}>
      <div className="px-[20px] pb-[16px] pt-[20px]">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description ? (
          <p className="mt-[6px] text-sm leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-[8px] border-t border-border px-[16px] py-[12px]">
        <button type="button" onClick={onCancel} disabled={busy} className={secondaryBtn}>
          {cancelLabel}
        </button>
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onConfirm}
          className={`inline-flex h-[38px] items-center justify-center rounded-[10px] px-[14px] text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-50 ${
            tone === 'danger'
              ? 'bg-danger text-white hover:brightness-110'
              : 'bg-brand text-brand-fg hover:bg-brand-strong'
          }`}
        >
          {busy ? '처리 중…' : confirmLabel}
        </button>
      </div>
    </Overlay>
  )
}

export type PromptDialogProps = {
  open: boolean
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

/**
 * window.prompt 대체 (이름 변경 등 한 줄 입력).
 * Overlay 가 닫히면 폼이 언마운트되므로 열 때마다 defaultValue 로 초기화된다.
 */
export function PromptDialog({ open, title, onCancel, ...formProps }: PromptDialogProps) {
  return (
    <Overlay open={open} onClose={onCancel} variant="dialog" label={title} backCloseable={false}>
      <PromptForm title={title} onCancel={onCancel} {...formProps} />
    </Overlay>
  )
}

function PromptForm({
  title,
  label,
  defaultValue = '',
  placeholder,
  submitLabel = '저장',
  onSubmit,
  onCancel,
}: Omit<PromptDialogProps, 'open'>) {
  const [value, setValue] = useState(defaultValue)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next = value.trim()
    if (!next) return
    onSubmit(next)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-[20px] pb-[16px] pt-[20px]">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        <label className="mt-[12px] block text-xs font-medium text-fg-muted">
          {label}
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            maxLength={120}
            className="mt-[6px] h-[40px] w-full rounded-[10px] border border-border bg-surface px-[12px] text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-brand focus:ring-2 focus:ring-focus/30"
          />
        </label>
      </div>
      <div className="flex justify-end gap-[8px] border-t border-border px-[16px] py-[12px]">
        <button type="button" onClick={onCancel} className={secondaryBtn}>
          취소
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex h-[38px] items-center justify-center rounded-[10px] bg-brand px-[14px] text-sm font-semibold text-brand-fg transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
