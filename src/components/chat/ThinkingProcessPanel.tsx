import { useState } from 'react'

import { GeminiThinkingDots } from './GeminiSparkleIcon'

type ThinkingProcessPanelProps = {
  thinking: string
  streaming: boolean
  thinkingOpen: boolean
}

export function ThinkingProcessPanel({
  thinking,
  streaming,
  thinkingOpen,
}: ThinkingProcessPanelProps) {
  const showThinkingPhase =
    streaming && (thinkingOpen || thinking.trim().length === 0)
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)
  // 새 스트리밍이 시작되면 수동 펼침 상태를 초기화 (렌더 중 조정 — effect 연쇄 렌더 방지)
  const [prevStreaming, setPrevStreaming] = useState(streaming)
  if (streaming !== prevStreaming) {
    setPrevStreaming(streaming)
    if (streaming) setManualExpanded(null)
  }

  const expanded = manualExpanded ?? showThinkingPhase

  const label = expanded ? '생각하는 과정 숨기기' : '생각하는 과정 표시'

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setManualExpanded((prev) => !(prev ?? showThinkingPhase))}
        className="inline-flex h-9 max-w-full items-center gap-2 rounded-full px-2 py-1 text-left text-[13px] font-medium text-[#444746] transition hover:bg-[#e9eef6]"
        aria-expanded={expanded}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center text-[#4285F4]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M12 2.5 14.6 9.4 21.5 12 14.6 14.6 12 21.5 9.4 14.6 2.5 12 9.4 9.4Z" />
          </svg>
        </span>
        <span className="truncate text-[13px]">{label}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-[#5f6368] transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded ? (
        <div className="mt-1 rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] px-4 py-3 text-[13px] leading-relaxed text-[#444746]">
          {thinking.trim().length > 0 ? (
            <p className="whitespace-pre-wrap">{thinking}</p>
          ) : streaming ? (
            <GeminiThinkingDots />
          ) : (
            <p className="text-[#5f6368]">
              표시할 사고 과정이 없습니다.
            </p>
          )}
          {streaming && thinkingOpen && thinking.trim().length > 0 ? (
            <span
              className="mt-1 inline-block h-[1em] w-[2px] animate-pulse rounded-full bg-gradient-to-b from-[#4285F4] via-[#9B72CB] to-[#D96570]"
              aria-hidden="true"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
