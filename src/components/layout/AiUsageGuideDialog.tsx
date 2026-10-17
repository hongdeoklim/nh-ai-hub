import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type AiUsageGuideDialogProps = {
  open: boolean
  onClose: () => void
}

function SectionCard({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border/90 bg-surface p-4 shadow-sm">
      <h3 className="flex items-start gap-2 text-sm font-semibold text-fg">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
          {number}
        </span>
        <span className="pt-0.5 leading-snug">{title}</span>
      </h3>
      <div className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-fg-muted">
        {children}
      </div>
    </section>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function AiUsageGuideDialog({ open, onClose }: AiUsageGuideDialogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={() => onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-usage-guide-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl sm:max-h-[min(88dvh,40rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border bg-gradient-to-r from-brand-soft to-amber-50 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                공지
              </p>
              <h2
                id="ai-usage-guide-title"
                className="mt-1 text-base font-semibold leading-snug text-fg sm:text-lg"
              >
                사내 AI 업무 활용 가이드라인
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                스마트하게, 비용 효율적으로
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose()}
              className="shrink-0 rounded-lg p-2 text-fg-subtle hover:bg-surface-3/80 hover:text-fg"
              aria-label="도움말 닫기"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"
        >
          <div className="space-y-4">
            <p className="rounded-xl border border-brand/30 bg-brand-soft/70 px-4 py-3 text-[13px] leading-relaxed text-fg">
              우리 사내 AI 포털은 업무 시간을 획기적으로 줄여주는 강력한 도구입니다.
              하지만 잘못 사용하면 불필요한 비용이 발생할 수 있습니다.{' '}
              <strong className="font-semibold text-fg">
                &quot;한 번의 질문으로 정확한 답을 얻는 것&quot;
              </strong>
              이 비용 절감과 업무 효율의 핵심입니다.
            </p>

            <SectionCard
              number={1}
              title="AI 모델을 '업무 난이도'에 맞게 선택하세요 (가장 중요)"
            >
              <p>
                우리 포털은 최상급 모델(Pro, Sonnet)부터 가성비 모델(Flash, Mini)까지
                모두 갖추고 있습니다.
              </p>
              <BulletList
                items={[
                  '간단한 요약, 단순 정보 검색, 초안 작성: Gemini Flash나 GPT-4o mini 등 가성비 모델을 선택하세요. 충분히 빠르고 비용 효율적입니다.',
                  '복잡한 분석, 코드 작성, 기획서 고도화: Gemini Pro, GPT-4o, Claude 3.5 Sonnet 등 고성능 모델을 사용하세요. 단, 이 모델들은 성능이 좋은 만큼 신중하게 사용해야 합니다.',
                ]}
              />
            </SectionCard>

            <SectionCard
              number={2}
              title="'이미지 & 동영상'은 신중하게 (Premium 도구)"
            >
              <p>
                이미지와 동영상 생성은 텍스트 대화보다 훨씬 많은 컴퓨팅 자원을
                소모합니다.
              </p>
              <BulletList
                items={[
                  '생각 먼저, 클릭 나중에: "일단 하나 그려봐"라는 식의 무분별한 생성은 자제해 주세요. 원하는 스타일과 내용을 미리 텍스트로 충분히 정리한 후 요청하세요.',
                  '수정은 정교하게: 처음부터 완벽한 프롬프트를 입력하면 수정 횟수를 줄일 수 있습니다.',
                ]}
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-danger/30 bg-danger-soft/80 px-3 py-2 text-[12px] text-red-900">
                  <span className="font-semibold">예시 (X)</span>
                  <p className="mt-1">&quot;상하이 공항 사진 그려줘&quot;</p>
                </div>
                <div className="rounded-lg border border-success/30 bg-success-soft/80 px-3 py-2 text-[12px] text-success">
                  <span className="font-semibold">예시 (O)</span>
                  <p className="mt-1">
                    &quot;상하이 공항 터미널의 현대적인 내부 전경, 비즈니스 분위기,
                    깔끔한 톤으로 그려줘&quot;
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard number={3} title="'RAG(사내 지식 검색)' 기능을 활용하세요">
              <p>문서 파일을 매번 AI에게 새로 읽히지 마세요.</p>
              <BulletList
                items={[
                  '지식 데이터베이스 활용: 우리 포털은 사내 공유 폴더의 문서를 이미 학습하고 있습니다. 매번 긴 문서를 붙여넣지 마시고, "공유 폴더에 있는 [상하이 연수 자료]를 참고해서 ~를 작성해 줘"라고 요청하세요. 이것이 AI 비용을 획기적으로 줄이는 방법입니다.',
                ]}
              />
            </SectionCard>

            <SectionCard number={4} title="'코드(노트북) 작업'은 단계별로 접근하세요">
              <p>
                AI에게 한 번에 1,000줄짜리 코드를 짜라고 하면 오류 확률이 높고
                비용이 많이 듭니다.
              </p>
              <BulletList
                items={[
                  '모듈 단위로 요청: "전체 시스템 코딩해 줘"가 아니라, "이 부분의 함수를 이렇게 고쳐줘"라고 타겟팅해서 요청하세요.',
                  '징검다리 서버 활용: 로컬 PC 자동화 기능(징검다리 서버)은 반복 업무를 줄이는 핵심입니다. AI가 만든 코드를 맹신하지 말고, 반드시 로컬에서 작은 단위로 테스트한 뒤 적용하세요.',
                ]}
              />
            </SectionCard>

            <SectionCard number={5} title="AI와의 대화 예절 (프롬프트 꿀팁)">
              <p>잘못된 질문은 비용과 시간 낭비입니다.</p>
              <BulletList
                items={[
                  '역할 부여: "너는 10년 차 NH여행 기획자야"와 같이 역할을 주면 엉뚱한 답변을 할 확률이 낮아집니다.',
                  '제약 조건: "결과는 표 형식으로 작성해 줘", "3문장 이내로 요약해 줘"와 같이 형식을 지정하면 불필요한 대화가 줄어듭니다.',
                  '맥락 유지: 한 채팅방에서 여러 대화를 섞지 마세요. 주제가 바뀌면 \'새 채팅\'을 열어주세요. 그래야 AI가 이전 문맥을 혼동하지 않고 정확히 답변합니다.',
                ]}
              />
            </SectionCard>

            <section className="rounded-xl border border-warning/30 bg-warning-soft/80 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
                <span aria-hidden="true">🛡️</span>
                주의사항
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-amber-950/90 marker:text-warning">
                <li>
                  <strong className="font-semibold">보안:</strong> 사내 비밀, 고객
                  개인정보, 미공개 계약서는 절대 업로드하지 마세요. (이미 시스템이
                  보안 폴더 안에서만 작동하도록 설계되어 있으나, 사용자의 주의가
                  필수입니다.)
                </li>
                <li>
                  <strong className="font-semibold">확인:</strong> AI가 내놓은
                  결과물(데이터, 수치 등)은 반드시 최종적으로 담당자가 확인하세요.
                  AI는 도구일 뿐, 책임은 사람이 집니다.
                </li>
              </ul>
            </section>

            <p className="rounded-xl bg-surface-2/80 px-4 py-3 text-center text-[13px] leading-relaxed text-fg-muted">
              우리의 목표는 AI를 부려먹는 &apos;스마트한 인재&apos;가 되는 것입니다.
              효율적인 사용법을 익혀 농협네트웍스의 업무 디지털 혁신을 함께 만들어
              갑시다.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => onClose()}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:bg-brand-strong active:bg-brand-strong"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
