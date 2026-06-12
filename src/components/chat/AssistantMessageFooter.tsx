import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatUiVariant } from './ChatMessage'
import {
  getMessageFeedback,
  saveFeedbackToDb,
  getDbFeedbackDetail,
  type MessageFeedbackRating,
} from '../../lib/chat-message-feedback'
import {
  exportAssistantToGoogleDocs,
  openGmailDraft,
  reportAssistantLegalIssue,
  shareAssistantMessage,
  speakAssistantAnswer,
  stopAssistantSpeech,
} from '../../utils/assistant-message-actions'

type AssistantMessageFooterProps = {
  messageId: string
  variant: ChatUiVariant
  messageType?: 'session' | 'team'
  time: string
  answerText: string
  userPrompt: string
  modelLabel: string
  threadShareUrl?: string
  copied: boolean
  bookmarkDone: boolean
  bookmarkBusy: boolean
  showBookmark: boolean
  onCopy: () => void
  onBookmark?: () => void
  onRegenerate?: () => void
  regenerateDisabled?: boolean
}

function iconBtnClass(variant: ChatUiVariant): string {
  const isGemini = variant === 'gemini'
  const isClaude = variant === 'claude'
  if (isGemini) {
    return 'rounded-full p-2 transition text-[#444746] hover:bg-[#e9eef6] dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200'
  }
  if (isClaude) {
    return 'rounded-full p-2 transition text-stone-400 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200'
  }
  return 'rounded-full p-2 transition text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200'
}

function feedbackBtnClass(variant: ChatUiVariant, active: boolean): string {
  const base = iconBtnClass(variant)
  if (!active) return base
  if (variant === 'gemini') {
    return `${base} bg-[#e9eef6] text-[#0b57d0] dark:bg-stone-800 dark:text-blue-400`
  }
  if (variant === 'claude') {
    return `${base} bg-stone-100 text-orange-700 dark:bg-stone-800 dark:text-orange-400`
  }
  return `${base} bg-slate-100 text-emerald-600 dark:bg-slate-700 dark:text-emerald-400`
}

function ThumbsUpIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14 9V5a3 3 0 00-5.176-1.832l-4 9A3 3 0 006 16h11.28a2 2 0 002-1.7l1.38-9A2 2 0 0017.18 3H14z" />
        <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3v11z" />
      </svg>
    )
  }
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
      />
    </svg>
  )
}

function ThumbsDownIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
        <path d="M17 2h2.86a2 2 0 012 2v7.5a2 2 0 01-2 2H17" />
      </svg>
    )
  }
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M17 2h2.86a2 2 0 012 2v7.5a2 2 0 01-2 2H17"
      />
    </svg>
  )
}

export function AssistantMessageFooter({
  messageId,
  variant,
  messageType = 'session',
  time,
  answerText,
  userPrompt,
  modelLabel,
  threadShareUrl,
  copied,
  bookmarkDone,
  bookmarkBusy,
  showBookmark,
  onCopy,
  onBookmark,
  onRegenerate,
  regenerateDisabled = false,
}: AssistantMessageFooterProps) {
  const isGemini = variant === 'gemini'
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareDone, setShareDone] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [feedback, setFeedback] = useState<MessageFeedbackRating | null>(() =>
    getMessageFeedback(messageId),
  )
  const menuRef = useRef<HTMLDivElement>(null)

  // 상세 피드백 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [isFetchingDetail, setIsFetchingDetail] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setFeedback(getMessageFeedback(messageId))
  }, [messageId])

  const handleFeedback = useCallback(
    async (target: MessageFeedbackRating) => {
      if (target === 'up') {
        if (feedback === 'up') {
          setFeedback(null)
          await saveFeedbackToDb(messageId, messageType, null)
        } else {
          setFeedback('up')
          await saveFeedbackToDb(messageId, messageType, 'up', null)
        }
      } else {
        // 'down'
        if (feedback === 'down') {
          setFeedback(null)
          await saveFeedbackToDb(messageId, messageType, null)
          setIsModalOpen(false)
        } else {
          setFeedback('down')
          // Optimistic UI로 일단 down으로 저장
          await saveFeedbackToDb(messageId, messageType, 'down', '')
          setIsModalOpen(true)
          setIsFetchingDetail(true)
          try {
            const detail = await getDbFeedbackDetail(messageId)
            if (detail) {
              setFeedbackText(detail.text ?? '')
            } else {
              setFeedbackText('')
            }
          } catch (err) {
            console.error('기존 피드백 조회 실패:', err)
          } finally {
            setIsFetchingDetail(false)
          }
        }
      }
    },
    [messageId, messageType, feedback],
  )

  const handleSubmitFeedback = useCallback(async () => {
    setIsSubmitting(true)
    try {
      await saveFeedbackToDb(messageId, messageType, 'down', feedbackText)
      setIsModalOpen(false)
    } catch (err) {
      console.error(err)
      window.alert('피드백 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }, [messageId, messageType, feedbackText])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  useEffect(() => {
    return () => stopAssistantSpeech()
  }, [])

  const handleShare = useCallback(async () => {
    try {
      const result = await shareAssistantMessage({
        userPrompt,
        assistantAnswer: answerText,
        threadUrl: threadShareUrl,
      })
      setShareDone(true)
      window.setTimeout(() => setShareDone(false), 1600)
      if (result === 'copied') {
        window.alert('대화 내용이 클립보드에 복사되었습니다.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      window.alert('공유에 실패했습니다.')
    }
  }, [answerText, threadShareUrl, userPrompt])

  const handleListen = useCallback(() => {
    if (speaking) {
      stopAssistantSpeech()
      setSpeaking(false)
      return
    }
    const started = speakAssistantAnswer(answerText)
    if (started) {
      setSpeaking(true)
      window.setTimeout(() => setSpeaking(false), 8000)
    }
  }, [answerText, speaking])

  const timeCls = isGemini
    ? 'text-[#444746] dark:text-stone-500'
    : variant === 'claude'
      ? 'text-stone-500 dark:text-stone-500'
      : 'text-slate-400 dark:text-slate-500'

  const menuItemCls =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-actual-11 text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800'

  return (
    <div
      className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${
        isGemini ? 'pt-1' : 'border-t border-stone-200/70 pt-2 dark:border-stone-800'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-0.5">
        {shareDone ? (
          <span className="px-1 text-[13px] font-medium text-[#0b57d0] dark:text-blue-400">
            공유됨!
          </span>
        ) : null}
        {copied ? (
          <span
            className={`px-1 text-[13px] font-medium ${
              isGemini
                ? 'text-[#0b57d0] dark:text-blue-400'
                : variant === 'claude'
                  ? 'text-orange-700 dark:text-orange-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            복사됨!
          </span>
        ) : null}
        {bookmarkDone ? (
          <span
            className={`px-1 text-[13px] font-medium ${
              isGemini
                ? 'text-[#0b57d0] dark:text-blue-400'
                : variant === 'claude'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            스크랩 완료!
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => handleFeedback('up')}
          className={feedbackBtnClass(variant, feedback === 'up')}
          aria-label={feedback === 'up' ? '좋은 응답 선택됨' : '좋은 응답'}
          aria-pressed={feedback === 'up'}
          title="좋은 응답"
        >
          <ThumbsUpIcon filled={feedback === 'up'} />
        </button>

        <button
          type="button"
          onClick={() => handleFeedback('down')}
          className={feedbackBtnClass(variant, feedback === 'down')}
          aria-label={feedback === 'down' ? '별로인 응답 선택됨' : '별로인 응답'}
          aria-pressed={feedback === 'down'}
          title="별로인 응답"
        >
          <ThumbsDownIcon filled={feedback === 'down'} />
        </button>

        <button
          type="button"
          onClick={() => void handleShare()}
          className={iconBtnClass(variant)}
          aria-label="대화 공유"
          title="공유"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
        </button>

        {onRegenerate ? (
          <button
            type="button"
            disabled={regenerateDisabled}
            onClick={() => onRegenerate()}
            className={`${iconBtnClass(variant)} disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label="다시 실행"
            title="다시 실행"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        ) : null}

        {showBookmark && onBookmark ? (
          <button
            type="button"
            disabled={bookmarkBusy}
            onClick={() => void onBookmark()}
            className={`${iconBtnClass(variant)} disabled:opacity-50`}
            aria-label="이 답변 스크랩(저장)"
            title="스크랩(저장)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void onCopy()}
          className={iconBtnClass(variant)}
          aria-label="답변 복사하기"
          title="복사하기"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={iconBtnClass(variant)}
            aria-label="더보기"
            aria-expanded={menuOpen}
            title="더보기"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="12" cy="19" r="1.75" />
            </svg>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute bottom-full right-0 z-50 mb-1 min-w-[11rem] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
            >
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => {
                  handleListen()
                  setMenuOpen(false)
                }}
              >
                {speaking ? '읽기 중지' : '듣기'}
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => {
                  void exportAssistantToGoogleDocs(
                    userPrompt.slice(0, 48) || 'AI 답변',
                    answerText,
                  )
                  setMenuOpen(false)
                }}
              >
                Docs로 내보내기
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => {
                  openGmailDraft({
                    subject: userPrompt.slice(0, 80) || 'AI 답변 공유',
                    body: answerText,
                  })
                  setMenuOpen(false)
                }}
              >
                Gmail 초안 작성
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => {
                  reportAssistantLegalIssue({
                    modelLabel,
                    threadUrl: threadShareUrl,
                    answerPreview: answerText,
                  })
                  setMenuOpen(false)
                }}
              >
                법적 문제 신고
              </button>
              <div className="mx-3 my-1 border-t border-stone-200 dark:border-stone-700" />
              <p className="px-3 py-2 text-actual-11 text-stone-500 dark:text-stone-400">
                모델: {modelLabel}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <p className={`ml-auto shrink-0 text-[12px] tabular-nums ${timeCls}`}>{time}</p>

      {/* 싫어요(👎) 클릭 시 상세 피드백 입력 팝업 모달 */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl transition-all dark:border-stone-800 dark:bg-stone-900 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-50">
                답변 피드백 보내기
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                aria-label="닫기"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="mb-4">
              <p className="mb-3 text-[13px] text-stone-500 dark:text-stone-400">
                어떤 점이 아쉬웠는지 알려주시면 NH-AX-HUB 시스템이 더욱 정확하게 학습하고 답변을 고도화하는 데 반영됩니다.
              </p>
              {isFetchingDetail ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-[#0b57d0] dark:border-stone-700 dark:border-t-blue-400" />
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    rows={4}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value.slice(0, 1000))}
                    placeholder="답변의 오류나 아쉬운 부분에 대해 자유롭게 적어주세요. (선택사항, 최대 1000자)"
                    className="w-full resize-none rounded-xl border border-stone-200 bg-white p-3 text-[14px] leading-relaxed text-stone-800 outline-none ring-[#0b57d0]/10 transition focus:border-[#0b57d0] focus:ring-4 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:ring-blue-400/10"
                    maxLength={1000}
                    autoFocus
                  />
                  <div className="mt-1 text-right text-[11px] text-stone-400 dark:text-stone-500">
                    {feedbackText.length} / 1000자
                  </div>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmitting || isFetchingDetail}
                onClick={() => void handleSubmitFeedback()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b57d0] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#0842a0] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                    저장 중...
                  </>
                ) : (
                  '제출하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
