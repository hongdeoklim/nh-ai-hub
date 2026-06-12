import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useChatArtifact, type ArtifactType, type ChatArtifact } from '../../store/chat-artifact'
import type { ChatCitationSource } from '../../types/chat-citations'
import { parseThinkingContent } from '../../utils/thinking-content'
import { ChatAttachmentPreviewStrip } from './ChatAttachmentPreviewStrip'
import { AssistantMessageFooter } from './AssistantMessageFooter'
import { ChatRichContent } from './ChatRichContent'
import {
  GeminiSparkleIcon,
  GeminiStreamingCursor,
} from './GeminiSparkleIcon'
import { ThinkingProcessPanel } from './ThinkingProcessPanel'
import type { ChatBubble } from './ChatArea'

export type ChatUiVariant = 'default' | 'claude' | 'gemini'

const CODE_FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g

const ARTIFACT_DOC_LANGS = new Set(['markdown', 'md', 'html', 'htm'])
const MIN_ARTIFACT_LINES = 8
const MIN_ARTIFACT_CHARS = 400
const MIN_TABLE_ROWS = 3

export type ParsedMessageSegment =
  | { kind: 'text'; value: string }
  | { kind: 'artifact'; artifact: ChatArtifact }

function inferArtifactTitle(content: string, fallback: string): string {
  const h1 = /^#\s+(.+)$/m.exec(content)
  if (h1?.[1]) return h1[1].trim().slice(0, 48)
  const first = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (first && first.length <= 48) return first
  return fallback
}

function resolveArtifactType(language: string, body: string): ArtifactType {
  const lang = language.trim().toLowerCase()
  if (lang === 'html' || lang === 'htm') return 'html'
  if (lang === 'markdown' || lang === 'md') return 'markdown'
  if (isMarkdownTableBlock(body)) return 'table'
  return 'code'
}

function shouldPromoteCodeFenceToArtifact(language: string, body: string): boolean {
  const lang = language.trim().toLowerCase()
  if (ARTIFACT_DOC_LANGS.has(lang)) return true
  const lines = body.split('\n').length
  if (lines >= MIN_ARTIFACT_LINES) return true
  if (body.length >= MIN_ARTIFACT_CHARS) return true
  return false
}

function isTableLine(line: string): boolean {
  const t = line.trim()
  return /^\|?.+\|.+/.test(t) || /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(t)
}

function isMarkdownTableBlock(block: string): boolean {
  const lines = block.trim().split('\n').filter((l) => l.trim().length > 0)
  const tableLines = lines.filter(isTableLine)
  return tableLines.length >= MIN_TABLE_ROWS
}

function buildArtifactFromFence(language: string, body: string): ChatArtifact {
  const type = resolveArtifactType(language, body)
  const defaultTitle =
    type === 'table'
      ? '표'
      : type === 'html'
        ? 'HTML 문서'
        : type === 'markdown'
          ? '문서'
          : language.trim()
            ? `${language.trim()} 코드`
            : '코드'
  return {
    title: inferArtifactTitle(body, defaultTitle),
    content: body,
    type,
  }
}

function splitTextAndTables(
  text: string,
  promoteTables: boolean,
): ParsedMessageSegment[] {
  if (!text.trim()) return []

  const lines = text.split('\n')
  const out: ParsedMessageSegment[] = []
  let textBuf: string[] = []
  let tableBuf: string[] = []

  const flushText = () => {
    if (textBuf.length === 0) return
    out.push({ kind: 'text', value: textBuf.join('\n') })
    textBuf = []
  }

  const flushTable = () => {
    if (tableBuf.length === 0) return
    if (
      promoteTables &&
      tableBuf.length >= MIN_TABLE_ROWS &&
      isMarkdownTableBlock(tableBuf.join('\n'))
    ) {
      const content = tableBuf.join('\n')
      out.push({
        kind: 'artifact',
        artifact: {
          title: inferArtifactTitle(content, '표'),
          content,
          type: 'table',
        },
      })
    } else {
      textBuf.push(...tableBuf)
    }
    tableBuf = []
  }

  for (const line of lines) {
    if (isTableLine(line)) {
      flushText()
      tableBuf.push(line)
    } else {
      flushTable()
      textBuf.push(line)
    }
  }
  flushTable()
  flushText()
  return out
}

export function parseAssistantMessageForArtifacts(
  content: string,
  options?: { promoteTables?: boolean },
): ParsedMessageSegment[] {
  const promoteTables = options?.promoteTables ?? false
  const segments: ParsedMessageSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CODE_FENCE_RE.lastIndex = 0
  while ((match = CODE_FENCE_RE.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index)
    if (before) {
      segments.push(...splitTextAndTables(before, promoteTables))
    }

    const language = match[1] ?? ''
    const body = match[2].replace(/\n$/, '')

    if (shouldPromoteCodeFenceToArtifact(language, body)) {
      segments.push({
        kind: 'artifact',
        artifact: buildArtifactFromFence(language, body),
      })
    } else {
      segments.push({ kind: 'text', value: match[0] })
    }

    lastIndex = match.index + match[0].length
  }

  const tail = content.slice(lastIndex)
  if (tail) {
    segments.push(...splitTextAndTables(tail, promoteTables))
  }

  if (segments.length === 0) {
    return [{ kind: 'text', value: content }]
  }

  return segments
}

function artifactChipIcon(type: ArtifactType): string {
  switch (type) {
    case 'table':
      return '📊'
    case 'html':
      return '🌐'
    case 'code':
      return '💻'
    default:
      return '📝'
  }
}

function ArtifactChip({
  artifact,
  isClaude,
  onOpen,
}: {
  artifact: ChatArtifact
  isClaude: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`my-2 flex w-full max-w-sm items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition hover:brightness-[0.98] ${
        isClaude
          ? 'border-orange-200/90 bg-gradient-to-r from-orange-50 to-stone-50 hover:border-orange-300 dark:border-orange-900/50 dark:from-orange-950/40 dark:to-stone-900'
          : 'border-emerald-200/90 bg-gradient-to-r from-emerald-50 to-slate-50 hover:border-emerald-300 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-slate-900'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-xl shadow-inner dark:bg-stone-950/60">
        {artifactChipIcon(artifact.type)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          아티팩트
        </span>
        <span className="block truncate text-[15px] font-semibold text-stone-900 dark:text-stone-50">
          문서 보기: {artifact.title}
        </span>
      </span>
      <span className="shrink-0 text-stone-400">›</span>
    </button>
  )
}

function AssistantMessageBody({
  content,
  variant,
  citations = [],
}: {
  content: string
  variant: ChatUiVariant
  citations?: ChatCitationSource[]
}) {
  const { openArtifact } = useChatArtifact()
  const isGemini = variant === 'gemini'
  const richVariant =
    isGemini ? 'gemini' : variant === 'claude' ? 'claude' : 'default'
  const segments = useMemo(
    () => parseAssistantMessageForArtifacts(content, { promoteTables: false }),
    [content],
  )

  return (
    <div className={isGemini ? 'gemini-prose space-y-1' : 'space-y-1'}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          if (!seg.value.trim()) return null
          return (
            <ChatRichContent
              key={`txt-${i}`}
              content={seg.value}
              variant={richVariant}
              citations={citations}
            />
          )
        }

        return (
          <ArtifactChip
            key={`art-${i}-${seg.artifact.title}`}
            artifact={seg.artifact}
            isClaude={variant === 'claude'}
            onOpen={() => openArtifact(seg.artifact)}
          />
        )
      })}
    </div>
  )
}

function UserMessageActionButtons({
  variant,
  editable,
  copied,
  onCopy,
  onStartEdit,
}: {
  variant: ChatUiVariant
  editable: boolean
  copied: boolean
  onCopy: () => void
  onStartEdit: () => void
}) {
  const isGemini = variant === 'gemini'
  const isClaude = variant === 'claude'

  const iconBtnClass = isGemini
    ? 'rounded-full p-2 text-[#444746] transition hover:bg-[#e9eef6] dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200'
    : isClaude
      ? 'rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200'
      : 'rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200'

  const copiedClass = isGemini
    ? 'text-[#0b57d0] dark:text-blue-400'
    : isClaude
      ? 'text-orange-700 dark:text-orange-400'
      : 'text-emerald-600 dark:text-emerald-400'

  return (
    <>
      <button
        type="button"
        onClick={() => void onCopy()}
        className={`${iconBtnClass} ${copied ? copiedClass : ''}`}
        aria-label={copied ? '복사됨' : '메시지 복사하기'}
        title={copied ? '복사됨!' : '복사하기'}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
      {editable ? (
        <button
          type="button"
          onClick={onStartEdit}
          className={iconBtnClass}
          aria-label="메시지 수정"
          title="수정"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      ) : null}
    </>
  )
}

export type ChatMessageEditSession = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export type ChatMessageProps = {
  msg: ChatBubble
  index: number
  variant?: ChatUiVariant
  messageType?: 'session' | 'team'
  editable: boolean
  isEditing: boolean
  editSession: ChatMessageEditSession | null
  onEditTextChange: (text: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onStartEdit: () => void
  copiedId: string | null
  onCopy: () => void
  bookmarkDoneId: string | null
  bookmarkBusy: boolean
  onBookmark?: () => void
  showBookmark: boolean
  onRegenerate?: () => void
  regenerateDisabled?: boolean
  /** 직전 사용자 질문 (공유·Gmail 등) */
  assistantUserPrompt?: string
  modelLabel?: string
  threadShareUrl?: string
}

export function ChatMessage({
  msg,
  variant = 'default',
  messageType,
  editable,
  isEditing,
  editSession,
  onEditTextChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  copiedId,
  onCopy,
  bookmarkDoneId,
  bookmarkBusy,
  onBookmark,
  showBookmark,
  onRegenerate,
  regenerateDisabled = false,
  assistantUserPrompt = '',
  modelLabel = '',
  threadShareUrl,
}: ChatMessageProps) {
  const isGemini = variant === 'gemini'
  const isClaude = variant === 'claude'

  const editPrimaryBtnClass = isGemini
    ? 'rounded-full bg-[#0b57d0] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-[#0842a0]'
    : isClaude
    ? 'rounded-lg bg-orange-700 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500'
    : 'rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-emerald-700'

  const editGhostBtnClass = isGemini
    ? 'rounded-full border border-[#c4c7c5] bg-white px-4 py-1.5 text-[13px] font-medium text-[#1f1f1f] hover:bg-[#f8fafd] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100'
    : isClaude
    ? 'rounded-lg border border-stone-300/90 bg-white px-3 py-1.5 text-[13px] font-semibold text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800'
    : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'

  const editFieldClass = isGemini
    ? 'mt-1 min-h-[5rem] w-full resize-y rounded-2xl border border-[#c4c7c5] bg-white px-4 py-3 text-[15px] leading-relaxed text-[#1f1f1f] outline-none ring-[#0b57d0]/15 focus:border-[#0b57d0] focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100'
    : isClaude
    ? 'mt-1 min-h-[5rem] w-full resize-y rounded-xl border border-stone-300/80 bg-white px-3 py-2 text-[15px] leading-relaxed text-stone-900 outline-none ring-orange-600/15 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 dark:ring-orange-400/20'
    : 'mt-1 min-h-[5rem] w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] leading-relaxed text-slate-900 outline-none ring-emerald-600/15 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

  const isAssistant = msg.role === 'assistant'

  const assistantDisplay = useMemo(() => {
    if (msg.thinkingContent !== undefined) {
      const hasThinking = msg.thinkingContent.trim().length > 0
      return {
        thinking: msg.thinkingContent,
        answer: msg.content,
        thinkingOpen: Boolean(msg.streaming && !msg.content.trim()),
        showThinkingPanel: hasThinking || Boolean(msg.streaming),
      }
    }
    const parsed = parseThinkingContent(msg.content)
    return {
      thinking: parsed.thinking,
      answer: parsed.answer,
      thinkingOpen: Boolean(msg.streaming && parsed.thinkingOpen),
      showThinkingPanel:
        parsed.hasThinking || Boolean(msg.streaming && parsed.thinkingOpen),
    }
  }, [msg.content, msg.thinkingContent, msg.streaming])

  const [userActionsPinned, setUserActionsPinned] = useState(false)
  const userRowRef = useRef<HTMLElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleUserTouchStart = useCallback(() => {
    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      setUserActionsPinned(true)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(12)
      }
    }, 480)
  }, [clearLongPressTimer])

  useEffect(() => {
    return () => clearLongPressTimer()
  }, [clearLongPressTimer])

  useEffect(() => {
    if (!userActionsPinned) return
    const dismiss = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (userRowRef.current?.contains(target)) return
      setUserActionsPinned(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('touchstart', dismiss)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('touchstart', dismiss)
    }
  }, [userActionsPinned])

  const userBubbleClass = isGemini
    ? 'max-w-[min(100%,32rem)] rounded-[24px] bg-[#f0f4f9] px-5 py-3 text-[15px] leading-relaxed text-[#1f1f1f] shadow-none dark:bg-stone-800 dark:text-stone-100 md:max-w-xl'
    : isClaude
    ? 'max-w-[min(100%,28rem)] rounded-3xl rounded-br-lg bg-[#E7DDD6] px-4 py-3 leading-relaxed text-stone-900 shadow-none dark:bg-stone-800 dark:text-stone-100 md:max-w-xl'
    : 'max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 leading-relaxed text-white shadow-sm md:max-w-xl md:py-3'

  const assistantShellClass = isGemini
    ? 'min-w-0 flex-1 py-0.5 text-actual-14 text-[#1f1f1f] dark:text-stone-100'
    : isClaude
    ? 'w-full max-w-none px-0 py-1 text-[17px] leading-relaxed text-stone-900 md:text-[18px] dark:text-stone-100'
    : 'w-full max-w-none px-0 py-1 text-sm leading-relaxed text-slate-800 md:text-[17px] dark:text-slate-100'

  if (isAssistant) {
    return (
      <article
        data-chat-role="assistant"
        className={`flex w-full justify-start ${isGemini ? 'gap-1.5 md:gap-2' : ''}`}
      >
        {isGemini ? (
          <div className="shrink-0 self-start pt-0.5">
            <GeminiSparkleIcon
              className="h-8 w-8"
              loading={Boolean(msg.streaming)}
            />
          </div>
        ) : null}
        <div className={assistantShellClass}>
          {isEditing && editSession ? (
            <>
              <label htmlFor={`edit-${msg.id}`} className="sr-only">
                메시지 수정
              </label>
              <textarea
                id={`edit-${msg.id}`}
                value={editSession.text}
                onChange={(event) => onEditTextChange(event.target.value)}
                rows={6}
                className={editFieldClass}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={editPrimaryBtnClass}
                  onClick={onCommitEdit}
                >
                  저장
                </button>
                <button
                  type="button"
                  className={editGhostBtnClass}
                  onClick={onCancelEdit}
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <div>
              {isGemini &&
              !isEditing &&
              (assistantDisplay.showThinkingPanel || msg.streaming) ? (
                <ThinkingProcessPanel
                  thinking={assistantDisplay.thinking}
                  streaming={Boolean(msg.streaming)}
                  thinkingOpen={assistantDisplay.thinkingOpen}
                />
              ) : null}

              {msg.streaming ? (
                assistantDisplay.answer.trim().length > 0 ? (
                  isGemini ? (
                    <div>
                      <AssistantMessageBody
                        content={assistantDisplay.answer}
                        variant={variant}
                        citations={msg.citations}
                      />
                      <GeminiStreamingCursor />
                    </div>
                  ) : (
                    <span className="inline-flex flex-wrap items-end gap-0.5 whitespace-pre-wrap">
                      <span>{assistantDisplay.answer}</span>
                      <span
                        className={`mb-0.5 inline-block h-3 w-1 animate-pulse rounded-sm ${
                          isClaude
                            ? 'bg-orange-700/80 dark:bg-orange-400/80'
                            : 'bg-emerald-600/80 dark:bg-emerald-400/80'
                        }`}
                        aria-hidden="true"
                      />
                    </span>
                  )
                ) : !isGemini ? (
                  <span className="inline-flex flex-wrap items-end gap-0.5 whitespace-pre-wrap">
                    <span>{assistantDisplay.answer}</span>
                    <span
                      className={`mb-0.5 inline-block h-3 w-1 animate-pulse rounded-sm ${
                        isClaude
                          ? 'bg-orange-700/80 dark:bg-orange-400/80'
                          : 'bg-emerald-600/80 dark:bg-emerald-400/80'
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                ) : null
              ) : (
                <AssistantMessageBody
                  content={assistantDisplay.answer}
                  variant={variant}
                  citations={msg.citations}
                />
              )}
            </div>
          )}

          {msg.deepResearch && !msg.streaming && !isEditing ? (
            <p className="mt-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight ${
                  isClaude
                    ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-200'
                }`}
              >
                ✅ Claude, GPT, Gemini 교차 검증 완료
              </span>
            </p>
          ) : null}

          {!msg.streaming && assistantDisplay.answer.trim().length > 0 && !isEditing ? (
            <AssistantMessageFooter
              messageId={msg.id}
              variant={variant}
              messageType={messageType}
              time={msg.time}
              answerText={assistantDisplay.answer}
              userPrompt={assistantUserPrompt}
              modelLabel={modelLabel}
              threadShareUrl={threadShareUrl}
              copied={copiedId === msg.id}
              bookmarkDone={bookmarkDoneId === msg.id}
              bookmarkBusy={bookmarkBusy}
              showBookmark={showBookmark}
              onCopy={onCopy}
              onBookmark={onBookmark}
              onRegenerate={onRegenerate}
              regenerateDisabled={regenerateDisabled}
            />
          ) : !msg.streaming && msg.content.trim().length === 0 ? (
            <p
              className={`mt-2 text-[13px] tabular-nums ${
                isClaude
                  ? 'text-stone-500 dark:text-stone-500'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {msg.time}
            </p>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <article
      ref={userRowRef}
      data-chat-role="user"
      className="group flex w-full justify-end"
      onTouchStart={handleUserTouchStart}
      onTouchEnd={clearLongPressTimer}
      onTouchMove={clearLongPressTimer}
      onTouchCancel={clearLongPressTimer}
    >
      <div className="flex max-w-full items-center gap-0.5 sm:gap-1">
        {!isEditing && msg.content.trim().length > 0 ? (
          <div
            className={`flex shrink-0 items-center transition-opacity duration-150 ${
              userActionsPinned
                ? 'opacity-100'
                : 'pointer-events-none opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100'
            }`}
          >
            <UserMessageActionButtons
              variant={variant}
              editable={editable}
              copied={copiedId === msg.id}
              onCopy={onCopy}
              onStartEdit={onStartEdit}
            />
          </div>
        ) : null}

        <div className={userBubbleClass}>
        {msg.authorDisplay ? (
          <p className="mb-1 text-[11px] font-medium text-stone-600 opacity-85 dark:text-stone-400">
            {msg.authorDisplay}
          </p>
        ) : null}

        {msg.attachmentPreviews && msg.attachmentPreviews.length > 0 ? (
          <ChatAttachmentPreviewStrip
            variant={isGemini ? 'gemini' : isClaude ? 'claude' : 'default'}
            layout="bubble"
            items={msg.attachmentPreviews.map((src, attIdx) => ({
              src,
              alt: `첨부 ${attIdx + 1}`,
            }))}
          />
        ) : null}

        {isEditing && editSession ? (
          <>
            <label htmlFor={`edit-${msg.id}`} className="sr-only">
              메시지 수정
            </label>
            <textarea
              id={`edit-${msg.id}`}
              value={editSession.text}
              onChange={(event) => onEditTextChange(event.target.value)}
              rows={6}
              className={editFieldClass}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={editPrimaryBtnClass}
                onClick={onCommitEdit}
              >
                저장
              </button>
              <button
                type="button"
                className={editGhostBtnClass}
                onClick={onCancelEdit}
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <div className="whitespace-pre-wrap" style={{ fontSize: '14px' }}>
            {msg.content}
          </div>
        )}

        <div className="mt-1.5">
          <p
            className={`text-[13px] tabular-nums ${
              isGemini
                ? 'text-[#444746] dark:text-stone-500'
                : isClaude
                  ? 'text-stone-600 dark:text-stone-400'
                  : 'text-emerald-100/90'
            }`}
          >
            {msg.time}
          </p>
        </div>
        </div>
      </div>
    </article>
  )
}
