import { useState } from 'react'

import { ChatArea, type ChatBubble } from '../components/chat/ChatArea'
import { ChatInput } from '../components/chat/ChatInput'
import { SidebarNavDock } from '../components/layout/SidebarNavDock'

/**
 * DEV 전용 UI 검수 페이지 (/__ui-check) — 프로덕션 라우트에는 등록되지 않습니다.
 * 로그인 없이 채팅 말풍선 상태(라우팅 칩·이어서 생성·스트리밍)를 눈으로 확인하는 용도입니다.
 */
const MOCK_MESSAGES: ChatBubble[] = [
  {
    id: 'user-1',
    role: 'user',
    content: '출장비 정산 규정 알려줘',
    time: '09:12',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content:
      '출장비 정산 규정 요약입니다.\n\n1. 국내 출장 숙박비 상한은 직급별로 다르게 적용됩니다.\n2. 영수증 증빙은 출장 종료 후 7일 이내 제출해야 합니다.\n3. 법인카드 사용을 원칙으로 합니다.',
    time: '09:12',
    routeInfo: {
      auto: true,
      taskType: 'COMPANY_REGULATION_SEARCH',
      modelId: 'gemini-2.5-pro',
    },
    elapsedMs: 12_400,
    usage: { inputTokens: 1_234, outputTokens: 567 },
  },
  {
    id: 'user-2',
    role: 'user',
    content: '사업 계획서 초안을 길게 작성해줘',
    time: '09:13',
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    content:
      '사업 계획서 초안입니다.\n\n1장. 개요 — 본 사업은 사내 AI 허브 고도화를 목표로 하며, 세부 추진 항목은 다음과 같습니다. 첫째, 응답 품질 개선을 위한 라우팅 고도화. 둘째, 지식 파이프라인 일원화. 셋째,',
    time: '09:13',
    routeInfo: {
      auto: false,
      taskType: null,
      modelId: 'claude-sonnet-4-6-very-long-model-id-example',
    },
    truncated: true,
  },
  {
    id: 'user-3',
    role: 'user',
    content: '지금 생성 중 상태 확인',
    time: '09:14',
  },
  {
    id: 'assistant-3',
    role: 'assistant',
    content: '스트리밍 중인 답변 예시입니다. 이 말풍선에는 푸터가 없어야',
    time: '09:14',
    createdAt: new Date(Date.now() - 67_000).toISOString(),
    streaming: true,
  },
]

/** 하네스용 공급자→모델 카탈로그 — 실제 Dashboard 폴백 목록과 동일 구조로 항상 매칭 유지 */
const UI_CHECK_MODELS: Record<string, { id: string; label: string }[]> = {
  google: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  hermes: [{ id: 'hermes-default', label: 'Hermes' }],
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
  ],
  dify: [{ id: 'dify-ax', label: 'Dify Chat (RAG)' }],
}

export function DevUiCheckPage() {
  const [draft, setDraft] = useState('')
  const [mockProvider, setMockProvider] = useState('anthropic')
  const [mockModel, setMockModel] = useState('claude-sonnet-4-6')
  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-stone-950">
      <p className="border-b border-stone-200 px-4 py-2 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
        DEV UI 검수: 라우팅 칩 / 이어서 생성 / 스트리밍 상태
      </p>
      <ChatArea
        messages={MOCK_MESSAGES}
        variant="claude"
        messageType="session"
        activeModelLabel="Gemini 2.5 Pro"
        onRegenerateAssistant={(index) =>
          console.log('[ui-check] regenerate clicked:', index)
        }
        onContinueAssistant={(index) =>
          console.log('[ui-check] continue clicked:', index)
        }
      />
      <div className="border-t border-stone-200 bg-[#FAF9F6] px-3 py-3 dark:border-stone-800 dark:bg-stone-950">
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={(payload) => console.log('[ui-check] send:', payload.text)}
          variant="claude"
          placeholder="무엇이든 물어보세요"
          belowInputRow={
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1">
              <label htmlFor="ui-check-provider-select" className="sr-only">
                AI 공급자 선택
              </label>
              <select
                id="ui-check-provider-select"
                value={mockProvider}
                onChange={(e) => {
                  const next = e.target.value
                  setMockProvider(next)
                  const first = UI_CHECK_MODELS[next]?.[0]
                  if (first) setMockModel(first.id)
                }}
                className="h-[28px] w-[120px] max-w-[38vw] min-w-0 shrink rounded-full border-0 bg-stone-100/95 px-2 text-[12px]! font-medium text-stone-700 outline-none ring-orange-600/20 transition hover:bg-stone-200/90 focus-visible:ring-2 dark:bg-stone-800/95 dark:text-stone-200 dark:hover:bg-stone-700/90"
              >
                <option value="auto">자동 추천</option>
                <option value="openai">ChatGPT/OpenAI</option>
                <option value="anthropic">Claude</option>
                <option value="google">Gemini</option>
                <option value="deepseek">DeepSeek</option>
                <option value="hermes">Hermes</option>
                <option value="openrouter">OpenRouter</option>
                <option value="dify">Dify (사내 RAG)</option>
              </select>
              {mockProvider !== 'auto' ? (
                <select
                  aria-label="모델 버전 선택"
                  value={mockModel}
                  onChange={(e) => setMockModel(e.target.value)}
                  className="h-[28px] max-w-[38vw] min-w-0 shrink rounded-full border-0 bg-stone-100/95 px-2 text-[12px]! font-medium text-stone-700 outline-none dark:bg-stone-800/95 dark:text-stone-200"
                >
                  {(UI_CHECK_MODELS[mockProvider] ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          }
        />
      </div>
    </div>
  )
}

/**
 * DEV 전용 — SidebarNavDock 실측 검수용. 실제 사이드바와 동일하게
 * "채팅 목록(flex-1, 필러)" + "독(mt-auto, shrink-0)" 구조로 감싸,
 * 독이 전체 높이의 몇 %를 차지하는지 측정할 수 있게 한다.
 */
export function DevSidebarDockCheckPage() {
  return (
    <div className="flex h-dvh w-[308px] flex-col border-r border-stone-300 bg-[#F4F1EA] dark:border-stone-700 dark:bg-stone-900">
      <div
        id="ui-check-thread-filler"
        className="min-h-0 flex-1 overflow-y-auto bg-white/40 p-2 text-[11px] text-stone-400 dark:bg-stone-800/20"
      >
        (채팅 목록 영역 — 실제로는 스레드 목록이 이 자리에 스크롤됩니다)
      </div>
      <div id="ui-check-dock-wrapper" className="shrink-0">
        <SidebarNavDock
          sidebarCollapsed={false}
          isAppFolderOpen={false}
          setIsAppFolderOpen={() => {}}
          setIsMobileMenuOpen={() => {}}
          plannerActive={false}
          marketplaceActive={false}
          isAdmin={false}
          onOpenTokenRequest={() => {}}
          onOpenSettings={() => {}}
          onSignOut={() => {}}
        />
      </div>
    </div>
  )
}
