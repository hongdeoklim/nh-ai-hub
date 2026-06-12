import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type KnowledgeGraphHelpDialogProps = {
  open: boolean
  onClose: () => void
}

function HelpSection({
  emoji,
  title,
  children,
}: {
  emoji: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-950/60">
      <h3 className="flex items-start gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs dark:bg-violet-950/60" aria-hidden>
          {emoji}
        </span>
        <span className="pt-0.5 leading-snug">{title}</span>
      </h3>
      <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-stone-700 dark:text-stone-300">
        {children}
      </div>
    </section>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-violet-500 dark:marker:text-violet-400">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function TermRow({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 dark:border-stone-700/60 dark:bg-stone-900/50">
      <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
        {term}
      </span>
      <span className="text-[13px] text-stone-700 dark:text-stone-300">{desc}</span>
    </div>
  )
}

export function KnowledgeGraphHelpDialog({ open, onClose }: KnowledgeGraphHelpDialogProps) {
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kg-help-title"
        className="flex max-h-[min(92dvh,46rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#FAF9F6] shadow-2xl dark:border-stone-700 dark:bg-stone-900 sm:max-h-[min(88dvh,42rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="shrink-0 border-b border-stone-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-4 dark:border-stone-700 dark:from-violet-950/40 dark:to-stone-900 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                기능 안내
              </p>
              <h2
                id="kg-help-title"
                className="mt-1 text-base font-semibold leading-snug text-stone-900 dark:text-stone-50 sm:text-lg"
              >
                사내 지식 그래프 (Knowledge Graph)
              </h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                문서 간 관계를 시각적으로 탐색하는 옵시디언 스타일의 지식 네트워크
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-stone-500 hover:bg-stone-200/80 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              aria-label="도움말 닫기"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"
        >
          <div className="space-y-4">
            {/* 개요 */}
            <p className="rounded-xl border border-violet-200/80 bg-violet-50/70 px-4 py-3 text-[13px] leading-relaxed text-stone-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-stone-200">
              사내 자료실에 등록된 문서들이 서로 어떻게 연결되어 있는지{' '}
              <strong className="font-semibold text-stone-900 dark:text-stone-50">
                2D 네트워크 그래프
              </strong>
              로 시각화합니다. 문서를 클릭하면 연결 관계(백링크·아웃링크)와 본문 미리보기를 확인할 수 있습니다.
            </p>

            {/* 용어 설명 */}
            <HelpSection emoji="📖" title="주요 용어">
              <div className="space-y-2">
                <TermRow term="노드" desc="그래프에서 하나의 점 — 사내 문서 1개에 해당합니다." />
                <TermRow term="엣지" desc="노드와 노드를 잇는 선 — 두 문서 사이의 참조 관계를 나타냅니다." />
                <TermRow term="백링크" desc="다른 문서가 '이 문서'를 참조하고 있는 방향 (← 화살표)." />
                <TermRow term="아웃링크" desc="'이 문서'가 다른 문서를 참조하는 방향 (→ 화살표)." />
              </div>
            </HelpSection>

            {/* 기본 조작 */}
            <HelpSection emoji="🖱️" title="그래프 조작 방법">
              <BulletList
                items={[
                  '드래그: 빈 공간을 클릭·드래그하면 전체 그래프를 이동할 수 있습니다.',
                  '스크롤(핀치): 마우스 휠 또는 트랙패드 핀치로 확대·축소합니다.',
                  '노드 클릭: 원하는 노드를 클릭하면 오른쪽 패널에 상세 정보가 표시됩니다.',
                  '연결 노드 이동: 상세 패널의 엣지 목록에서 연결 노드 이름을 클릭하면 해당 노드로 이동합니다.',
                ]}
              />
            </HelpSection>

            {/* 검색 & 필터 */}
            <HelpSection emoji="🔍" title="검색 및 필터 사용법">
              <BulletList
                items={[
                  '노드 검색: 상단의 검색창에 키워드를 입력하면 제목·본문에 해당 키워드가 포함된 노드만 남고 관련 엣지도 함께 필터링됩니다.',
                  '부서 필터: 드롭다운에서 부서를 선택하면 해당 부서가 등록한 문서만 표시됩니다.',
                  '전체 보기: 검색어를 지우거나 "전체 부서"를 선택하면 전체 그래프로 돌아갑니다.',
                ]}
              />
            </HelpSection>

            {/* 상세 패널 */}
            <HelpSection emoji="📋" title="노드 상세 패널">
              <BulletList
                items={[
                  '노드 유형(태그): 문서 종류(보고서, 매뉴얼, 회의록 등)를 색상 배지로 표시합니다.',
                  '본문 미리보기: 문서 내용의 일부를 패널 내에서 바로 확인할 수 있습니다.',
                  '연결된 엣지 목록: 백링크(←)와 아웃링크(→)로 구분하여 연결 관계를 보여줍니다.',
                  'Google Drive에서 보기: 원본 문서로 바로 이동할 수 있는 버튼이 제공됩니다.',
                ]}
              />
            </HelpSection>

            {/* 팁 */}
            <section className="rounded-xl border border-amber-300/80 bg-amber-50/80 p-4 dark:border-amber-800/60 dark:bg-amber-950/25">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
                <span aria-hidden>💡</span> 활용 팁
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-amber-950/90 marker:text-amber-700 dark:text-amber-100/90 dark:marker:text-amber-400">
                <li>
                  <strong className="font-semibold">허브 노드 탐색:</strong> 엣지가 많이 연결된 크고 밝은 노드가 사내에서 가장 많이 참조되는 핵심 문서입니다. 먼저 이 노드를 확인해 보세요.
                </li>
                <li>
                  <strong className="font-semibold">고립 노드 주의:</strong> 다른 문서와 연결이 없는 노드는 아직 정리가 필요한 문서일 수 있습니다.
                </li>
                <li>
                  <strong className="font-semibold">AI 채팅과 연계:</strong> 관심 있는 노드를 확인 후, AI 채팅에서 해당 문서를 바탕으로 추가 질문을 이어갈 수 있습니다.
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* 푸터 */}
        <div className="shrink-0 border-t border-stone-200 px-4 py-3 dark:border-stone-700 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 active:bg-violet-900 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
