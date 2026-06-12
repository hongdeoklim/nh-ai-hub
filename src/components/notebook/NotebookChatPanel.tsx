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
    <section className="flex h-full min-h-0 flex-col bg-[#FAF9F6] dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200/90 px-4 py-3 dark:border-stone-800">
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">
          노트북 채팅
        </h2>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Chat
        </p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          선택된 출처 {selectedCount}건 기준으로만 답변합니다.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center dark:border-stone-700 dark:bg-stone-900/40">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              왼쪽에서 문서를 선택한 뒤 질문을 입력하세요.
            </p>
            <p className="mt-2 text-sm text-stone-500">
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
                  ? 'bg-orange-800 text-white dark:bg-orange-700'
                  : 'border border-stone-200/90 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900'
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
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-40 dark:text-orange-200 dark:hover:bg-orange-950/40"
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
          <p className="text-sm text-stone-500">답변 생성 중…</p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        className="shrink-0 border-t border-stone-200/90 p-4 dark:border-stone-800"
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
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-60 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          />
          <button
            type="submit"
            disabled={
              streaming || selectedCount === 0 || !draft.trim().length
            }
            className="shrink-0 self-end rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50 dark:bg-orange-600"
          >
            전송
          </button>
        </div>
      </form>
    </section>
  )
}
