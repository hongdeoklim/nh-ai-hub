import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { ConfirmDialog, PromptDialog } from './ConfirmDialog'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

export type PromptOptions = {
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  submitLabel?: string
}

type DialogsValue = {
  /** window.confirm 대체 — 확인하면 true */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** window.prompt 대체 — 취소하면 null */
  prompt: (options: PromptOptions) => Promise<string | null>
}

const DialogsContext = createContext<DialogsValue | null>(null)

type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void }
type PromptState = PromptOptions & { resolve: (value: string | null) => void }

/**
 * 앱 전역 확인/입력 다이얼로그. `const { confirm, prompt } = useDialogs()` 로 가져와
 * `if (!(await confirm({ title: '삭제할까요?', tone: 'danger' }))) return` 처럼
 * 기존 window.confirm 흐름을 그대로 유지한 채 교체할 수 있다.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  // 열려 있는 다이얼로그가 교체될 때 이전 Promise 를 취소로 정리
  const confirmRef = useRef<ConfirmState | null>(null)
  const promptRef = useRef<PromptState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    confirmRef.current?.resolve(false)
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve }
      confirmRef.current = next
      setConfirmState(next)
    })
  }, [])

  const prompt = useCallback((options: PromptOptions) => {
    promptRef.current?.resolve(null)
    return new Promise<string | null>((resolve) => {
      const next = { ...options, resolve }
      promptRef.current = next
      setPromptState(next)
    })
  }, [])

  const settleConfirm = useCallback((ok: boolean) => {
    const current = confirmRef.current
    confirmRef.current = null
    setConfirmState(null)
    current?.resolve(ok)
  }, [])

  const settlePrompt = useCallback((value: string | null) => {
    const current = promptRef.current
    promptRef.current = null
    setPromptState(null)
    current?.resolve(value)
  }, [])

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  return (
    <DialogsContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        tone={confirmState?.tone}
        onConfirm={() => settleConfirm(true)}
        onCancel={() => settleConfirm(false)}
      />
      <PromptDialog
        open={promptState !== null}
        title={promptState?.title ?? ''}
        label={promptState?.label ?? ''}
        defaultValue={promptState?.defaultValue}
        placeholder={promptState?.placeholder}
        submitLabel={promptState?.submitLabel}
        onSubmit={(v) => settlePrompt(v)}
        onCancel={() => settlePrompt(null)}
      />
    </DialogsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- 컨텍스트 표준 패턴
export function useDialogs(): DialogsValue {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useDialogs 는 DialogProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
