import { useState } from 'react'

import { ChatArea, type ChatBubble } from '../components/chat/ChatArea'
import { ChatInput } from '../components/chat/ChatInput'
import { EmptyState } from '../components/common/EmptyState'
import { PageHeader } from '../components/common/PageHeader'
import { TokenMeter } from '../components/common/TokenMeter'
import { IconBookmark, IconFolder, IconSparkles } from '../components/common/icons'
import { OrgPromptGallery } from '../components/prompts/OrgPromptGallery'
import type { StaticOrgPromptItem } from '../data/org-static-prompts'

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
    <div className="flex h-dvh flex-col bg-surface">
      <p className="border-b border-border px-4 py-2 text-xs text-fg-muted">
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
      <div className="border-t border-border bg-bg px-3 py-3">
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
                className="h-[28px] w-[120px] max-w-[38vw] min-w-0 shrink rounded-full border-0 bg-surface-2 px-2 text-[12px] font-medium text-fg outline-none transition hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus/40"
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
                  className="h-[28px] max-w-[38vw] min-w-0 shrink rounded-full border-0 bg-surface-2 px-2 text-[12px] font-medium text-fg outline-none"
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

const MOCK_ORG_PROMPTS: StaticOrgPromptItem[] = [
  { id: 'p1', title: '출장비 정산 규정 요약', description: '여비 규정에서 숙박·일비 상한과 증빙 기한을 정리합니다.', content: '' },
  { id: 'p2', title: '현장 안전점검 체크리스트', description: '공종별 위험 요인과 점검 항목을 표로 만듭니다.', content: '' },
  { id: 'p3', title: '회의록 → 액션 아이템', description: '회의록을 붙여넣으면 담당자·기한별 할 일로 변환합니다.', content: '' },
  { id: 'p4', title: '견적서 검토 포인트', description: '협력사 견적서의 누락 항목과 단가 이상치를 찾습니다.', content: '' },
  { id: 'p5', title: '주간 업무 보고 초안', description: '이번 주 진행 사항을 보고서 형식으로 정리합니다.', content: '' },
  { id: 'p6', title: '사내 규정 Q&A', description: '취업규칙·복무규정에서 근거 조항과 함께 답합니다.', content: '' },
]

const SWATCHES: Array<{ label: string; className: string }> = [
  { label: 'bg', className: 'bg-bg' },
  { label: 'surface', className: 'bg-surface' },
  { label: 'surface-2', className: 'bg-surface-2' },
  { label: 'surface-3', className: 'bg-surface-3' },
  { label: 'brand', className: 'bg-brand' },
  { label: 'brand-soft', className: 'bg-brand-soft' },
  { label: 'accent', className: 'bg-accent' },
  { label: 'accent-soft', className: 'bg-accent-soft' },
  { label: 'success', className: 'bg-success' },
  { label: 'warning', className: 'bg-warning' },
  { label: 'danger', className: 'bg-danger' },
]

/**
 * DEV 전용 — 앱 셸 v2 + 디자인 토큰 검수 페이지 (/__ui-check/shell).
 * MainLayout 안에서 렌더되어 레일·헤더·하단 탭·런처·명령 팔레트를 로그인 없이 확인한다.
 */
export function DevShellCheckPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[24px] px-[16px] py-[20px] md:px-[24px]">
      <PageHeader
        eyebrow="DEV · 디자인 시스템"
        title="앱 셸 v2 검수"
        description="레일 · 보조 패널 · 헤더 · 하단 탭 · 런처 · 명령 팔레트(Ctrl K)와 디자인 토큰을 확인합니다."
        icon={IconSparkles}
        actions={
          <>
            <button
              type="button"
              className="inline-flex h-[36px] items-center gap-[6px] rounded-[10px] border border-border bg-surface px-[12px] text-sm font-medium text-fg transition hover:bg-surface-2"
            >
              보조 버튼
            </button>
            <button
              type="button"
              className="inline-flex h-[36px] items-center gap-[6px] rounded-[10px] bg-brand px-[12px] text-sm font-semibold text-brand-fg transition hover:bg-brand-strong"
            >
              주 버튼
            </button>
          </>
        }
      />

      <section aria-labelledby="tokens-title" className="rounded-[16px] border border-border bg-surface p-[16px] shadow-card">
        <h2 id="tokens-title" className="text-sm font-semibold text-fg">
          색상 토큰
        </h2>
        <div className="mt-[12px] grid grid-cols-3 gap-[8px] sm:grid-cols-4 md:grid-cols-6">
          {SWATCHES.map((s) => (
            <div key={s.label} className="flex flex-col gap-[6px]">
              <div className={`h-[44px] rounded-[10px] border border-border ${s.className}`} />
              <span className="text-[11px] text-fg-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-[16px] md:grid-cols-2">
        <div className="rounded-[16px] border border-border bg-surface p-[16px] shadow-card">
          <h2 className="text-sm font-semibold text-fg">타이포그래피</h2>
          <p className="mt-[8px] text-[24px] font-semibold tracking-tight text-fg">제목 24 · Semibold</p>
          <p className="text-[20px] font-semibold text-fg">제목 20 · Semibold</p>
          <p className="text-base font-medium text-fg">본문 16 · Medium</p>
          <p className="text-sm text-fg-muted">본문 14 · fg-muted</p>
          <p className="text-xs text-fg-subtle">보조 12 · fg-subtle</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">EYEBROW 11</p>
        </div>
        <div className="rounded-[16px] border border-border bg-surface p-[16px] shadow-card">
          <h2 className="text-sm font-semibold text-fg">토큰 미터</h2>
          <TokenMeter used={720_000} limit={1_000_000} className="mt-[12px]" />
          <TokenMeter used={930_000} limit={1_000_000} className="mt-[16px]" />
          <TokenMeter used={0} limit={0} loading className="mt-[16px]" />
        </div>
      </section>

      <section className="grid gap-[16px] md:grid-cols-2">
        <EmptyState
          icon={IconBookmark}
          title="저장한 답변이 없습니다"
          description="채팅에서 답변 하단의 스크랩 버튼을 누르면 여기에 모아 볼 수 있습니다."
          action={
            <button
              type="button"
              className="inline-flex h-[34px] items-center rounded-[10px] bg-brand px-[12px] text-xs font-semibold text-brand-fg hover:bg-brand-strong"
            >
              채팅으로 이동
            </button>
          }
        />
        <EmptyState
          icon={IconFolder}
          title="등록된 자료가 없습니다"
          description="드라이브 폴더를 연결하거나 파일을 업로드해 AI 참조 자료로 등록하세요."
        />
      </section>

      <section aria-label="채팅 홈 프롬프트 갤러리" className="rounded-[16px] border border-border bg-surface shadow-card">
        <OrgPromptGallery
          prompts={MOCK_ORG_PROMPTS}
          userGreetingName="홍길동"
          onApplyToInput={() => undefined}
          onRemoveFromGallery={() => undefined}
          onDismissSection={() => undefined}
        />
      </section>

      <section className="rounded-[16px] border border-border bg-surface p-[16px] shadow-card">
        <h2 className="text-sm font-semibold text-fg">모바일 컴포저 테스트</h2>
        <p className="mt-[4px] text-xs text-fg-muted">
          아래 입력창에 포커스하면 모바일 하단 탭이 숨겨져야 합니다 (키보드 영역 확보).
        </p>
        <textarea
          rows={3}
          placeholder="여기에 포커스…"
          className="mt-[10px] w-full resize-none rounded-[12px] border border-border bg-surface-2/60 p-[12px] text-sm text-fg outline-none focus:border-brand focus:bg-surface focus:ring-2 focus:ring-focus/25"
        />
      </section>
    </div>
  )
}
