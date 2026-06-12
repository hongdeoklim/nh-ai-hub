import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react'

import type { ChatCitationSource } from '../../types/chat-citations'
import { ChatMessage } from './ChatMessage'

export type ChatBubble = {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: string
  /** DB 동기화·정렬용 ISO 타임스탬프 (time 은 UI 표시용) */
  createdAt?: string
  streaming?: boolean
  /** 공유 채팅 등: 발신자 표시 텍스트 */
  authorDisplay?: string
  /** 사용자 메시지에 첨부했던 이미지 미리보기(Data URL) */
  attachmentPreviews?: string[]
  /** RAG search_similar_cases 등에서 수집된 출처 목록 */
  citations?: ChatCitationSource[]
  /** `<thinking>` 태그에서 분리된 AI 사고 과정 (Gemini 스타일 UI) */
  thinkingContent?: string
  /** 심층 연구(AI 앙상블) 모드로 생성된 답변 */
  deepResearch?: boolean
}

function IconArrowDown(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 14l-7 7m0 0l-7-7m7 7V3"
      />
    </svg>
  )
}

type ChatAreaProps = {
  messages: ChatBubble[]
  className?: string
  /** 대화 말풍선 스타일 프리셋 */
  variant?: 'default' | 'claude' | 'gemini'
  /** 대화 종류 ('session' | 'team') */
  messageType?: 'session' | 'team'
  /**
   * 설정 시 완료된 AI 말풍선에 스크랩 버튼을 표시합니다.
   * 직전 사용자 메시지를 prompt로 사용합니다(없으면 빈 문자열).
   */
  onBookmarkAssistant?: (detail: {
    prompt: string
    aiResponse: string
  }) => Promise<{ ok: boolean; message?: string }>
  /** 설정 시 사용자·어시스턴트 말풍선 내용을 수정할 수 있습니다(스트리밍·환영 메시지 제외). */
  onCommitMessageEdit?: (detail: {
    messageId: string
    role: 'user' | 'assistant'
    nextContent: string
  }) => void
  /** 어시스턴트 답변 재생성(다시 실행) */
  onRegenerateAssistant?: (assistantIndex: number) => void
  regenerateDisabled?: boolean
  /** 현재 선택 모델 표시명 (더보기 메뉴) */
  activeModelLabel?: string
  /** 대화 공유 URL */
  threadShareUrl?: string
  /** 대화 영역 상단(스크롤 내부)에 표시할 패널 — 전사 프롬프트 갤러리 등 */
  topPanel?: ReactNode
}

function promptBeforeAssistant(
  list: ChatBubble[],
  assistantIndex: number,
): string {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    const m = list[i]
    if (m?.role === 'user') return m.content
  }
  return ''
}

function messageEditable(
  msg: ChatBubble,
  onCommitMessageEdit: ChatAreaProps['onCommitMessageEdit'],
): boolean {
  if (!onCommitMessageEdit) return false
  if (msg.streaming) return false
  if (msg.role === 'assistant' && msg.id.startsWith('welcome-assistant')) {
    return false
  }
  return msg.role === 'user' || msg.role === 'assistant'
}

export const ChatArea = forwardRef<HTMLElement, ChatAreaProps>(
  function ChatArea(
    {
      messages,
      className = '',
      variant = 'default',
      messageType,
      onBookmarkAssistant,
      onCommitMessageEdit,
      onRegenerateAssistant,
      regenerateDisabled = false,
      activeModelLabel = '',
      threadShareUrl,
      topPanel,
    }: ChatAreaProps,
    ref,
  ) {
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [bookmarkDoneId, setBookmarkDoneId] = useState<string | null>(null)
    const bookmarkResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [bookmarkBusyId, setBookmarkBusyId] = useState<string | null>(null)
    const [editSession, setEditSession] = useState<{
      id: string
      role: 'user' | 'assistant'
      text: string
    } | null>(null)
    const [showScrollBottom, setShowScrollBottom] = useState(false)
    const scrollContainerRef = useRef<HTMLElement | null>(null)

    const setRefs = useCallback(
      (node: HTMLElement | null) => {
        scrollContainerRef.current = node
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref],
    )

    const handleScroll = useCallback((e: UIEvent<HTMLElement>) => {
      const target = e.currentTarget
      const isAtBottom =
        target.scrollHeight - target.scrollTop <= target.clientHeight + 80
      setShowScrollBottom(!isAtBottom)
    }, [])

    const scrollToBottom = useCallback(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }
    }, [])

    const handleCopy = useCallback(async (messageId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      try {
        await navigator.clipboard.writeText(trimmed)
        if (copyResetRef.current) clearTimeout(copyResetRef.current)
        setCopiedId(messageId)
        copyResetRef.current = setTimeout(() => {
          setCopiedId((current) => (current === messageId ? null : current))
          copyResetRef.current = null
        }, 2000)
      } catch (err) {
        console.error('[ChatArea] 클립보드 복사 실패', err)
        window.alert('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.')
      }
    }, [])

    const handleBookmark = useCallback(
      async (assistantIndex: number, msg: ChatBubble) => {
        if (!onBookmarkAssistant || msg.role !== 'assistant') return
        const trimmed = msg.content.trim()
        if (!trimmed || msg.streaming) return

        const prompt = promptBeforeAssistant(messages, assistantIndex)
        setBookmarkBusyId(msg.id)
        try {
          const result = await onBookmarkAssistant({
            prompt,
            aiResponse: msg.content,
          })
          if (result.ok) {
            if (bookmarkResetRef.current) clearTimeout(bookmarkResetRef.current)
            setBookmarkDoneId(msg.id)
            bookmarkResetRef.current = setTimeout(() => {
              setBookmarkDoneId((current) =>
                current === msg.id ? null : current,
              )
              bookmarkResetRef.current = null
            }, 2200)
          } else {
            window.alert(result.message ?? '스크랩 저장에 실패했습니다.')
          }
        } catch (err) {
          console.error('[ChatArea] 스크랩 저장 예외', err)
          window.alert('스크랩 저장 중 오류가 발생했습니다.')
        } finally {
          setBookmarkBusyId(null)
        }
      },
      [messages, onBookmarkAssistant],
    )

    useEffect(() => {
      return () => {
        if (copyResetRef.current) clearTimeout(copyResetRef.current)
        if (bookmarkResetRef.current) clearTimeout(bookmarkResetRef.current)
      }
    }, [])

    useEffect(() => {
      if (!editSession) return
      if (!messages.some((m) => m.id === editSession.id)) {
        setEditSession(null)
      }
    }, [messages, editSession])

    const isGemini = variant === 'gemini'
    const isClaude = variant === 'claude'

    return (
      <section
        ref={setRefs}
        onScroll={handleScroll}
        className={`relative flex flex-1 flex-col overflow-y-auto px-3 py-4 md:px-6 md:py-6 ${
          isGemini
            ? 'bg-transparent gemini-zero-dark-bg text-stone-900 dark:text-stone-100'
            : isClaude
            ? 'bg-[#FAF9F6] dark:bg-stone-950'
            : 'bg-slate-50/80 dark:bg-slate-900/40'
        } ${className}`}
        aria-label="대화 영역"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 md:gap-6">
          {topPanel ? <div className="w-full">{topPanel}</div> : null}
          {messages.map((msg, index) => {
            const editable = messageEditable(msg, onCommitMessageEdit)
            const isEditing = editSession?.id === msg.id

            return (
              <ChatMessage
                key={msg.id}
                msg={msg}
                index={index}
                variant={variant}
                messageType={messageType}
                editable={editable}
                isEditing={isEditing}
                editSession={isEditing ? editSession : null}
                onEditTextChange={(text) =>
                  setEditSession((prev) =>
                    prev && prev.id === msg.id ? { ...prev, text } : prev,
                  )
                }
                onCommitEdit={() => {
                  if (!onCommitMessageEdit || !editSession) return
                  const next = editSession.text.trim()
                  if (!next) return
                  onCommitMessageEdit({
                    messageId: editSession.id,
                    role: editSession.role,
                    nextContent: next,
                  })
                  setEditSession(null)
                }}
                onCancelEdit={() => setEditSession(null)}
                onStartEdit={() =>
                  setEditSession({
                    id: msg.id,
                    role: msg.role,
                    text: msg.content,
                  })
                }
                copiedId={copiedId}
                onCopy={() => void handleCopy(msg.id, msg.content)}
                bookmarkDoneId={bookmarkDoneId}
                bookmarkBusy={bookmarkBusyId === msg.id}
                onBookmark={
                  onBookmarkAssistant
                    ? () => void handleBookmark(index, msg)
                    : undefined
                }
                showBookmark={
                  Boolean(onBookmarkAssistant) &&
                  !msg.id.startsWith('welcome-assistant')
                }
                onRegenerate={
                  onRegenerateAssistant &&
                  msg.role === 'assistant' &&
                  !msg.id.startsWith('welcome-assistant')
                    ? () => onRegenerateAssistant(index)
                    : undefined
                }
                regenerateDisabled={regenerateDisabled}
                assistantUserPrompt={
                  msg.role === 'assistant'
                    ? promptBeforeAssistant(messages, index)
                    : undefined
                }
                modelLabel={activeModelLabel}
                threadShareUrl={threadShareUrl}
              />
            )
          })}
        </div>

        {showScrollBottom ? (
          <div className="sticky bottom-6 mt-4 flex justify-center pointer-events-none z-10 w-full">
            <button
              type="button"
              aria-label="맨 아래로 스크롤"
              onClick={scrollToBottom}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-600 shadow-md backdrop-blur transition hover:bg-white hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50 dark:border-stone-700 dark:bg-stone-800/90 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-50"
            >
              <IconArrowDown className="h-5 w-5" />
            </button>
          </div>
        ) : null}
      </section>
    )
  },
)

ChatArea.displayName = 'ChatArea'
