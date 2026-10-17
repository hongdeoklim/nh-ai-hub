import { useEffect, useRef } from 'react'

import type { NotebookChatMessage } from '../../types/notebook'
import { NotebookAnswerContent } from './NotebookAnswerContent'

type NotebookChatPanelProps = {
  messages: NotebookChatMessage[]
  draft: string
  streaming: boolean
  selectedCount: number
  error: string | null
  onDraftChange: (value: string) => void
  onSubmit: () => void
  onPinMessage: (message: NotebookChatMessage) => void
}

export function NotebookChatPanel({
  messages,
  draft,
  streaming,
  selectedCount,
  error,
  onDraftChange,
  onSubmit,
  onPinMessage,
}: NotebookChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-border/90 px-4 py-3">
        <h2 className="text-lg font-bold text-fg">
          노트북 채팅
        </h2>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Chat
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          선택된 출처 {selectedCount}건 기준으로만 답변합니다.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface/60 px-4 py-8 text-center">
            <p className="text-sm text-fg-muted">
              왼쪽에서 문서를 선택한 뒤 질문을 입력하세요.
            </p>
            <p className="mt-2 text-sm text-fg-subtle">
              AI 답변의 [1], [2] 인용을 클릭하면 파일명·페이지·인용문을 볼 수
              있습니다.
            </p>
          </div>
        ) : null}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[min(42rem,92%)] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-brand text-brand-fg'
                  : 'border border-border/90 bg-surface shadow-sm'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.content}
                </p>
              ) : (
                <div className="relative">
                  <div className="absolute right-0 top-0 z-10">
                    <button
                      type="button"
                      onClick={() => onPinMessage(msg)}
                      disabled={!msg.content.trim()}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-40"
                    >
                      📌 노트에 추가
                    </button>
                  </div>
                  <div className="pr-24 pt-1">
                    <NotebookAnswerContent
                      content={msg.content}
                      citations={msg.citations}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {streaming ? (
          <p className="text-sm text-fg-subtle">답변 생성 중…</p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        className="shrink-0 border-t border-border/90 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={2}
            placeholder={
              selectedCount > 0
                ? '선택한 문서에 대해 질문하세요…'
                : '먼저 왼쪽에서 출처를 선택하세요'
            }
            disabled={streaming || selectedCount === 0}
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              streaming || selectedCount === 0 || !draft.trim().length
            }
            className="shrink-0 self-end rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-strong disabled:opacity-50"
          >
            전송
          </button>
        </div>
      </form>
    </section>
  )
}
