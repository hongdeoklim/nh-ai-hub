import type { ReactNode } from 'react'

import type { StaticOrgPromptItem } from '../../data/org-static-prompts'

const CARD_SURFACE: readonly { gradient: string; icon: string }[] = [
  { gradient: 'from-amber-100/95 via-orange-50/90 to-stone-100/80 dark:from-amber-950/50 dark:via-stone-900/70 dark:to-stone-950/80', icon: '🛠️' },
  { gradient: 'from-sky-100/95 via-blue-50/85 to-indigo-50/75 dark:from-sky-950/45 dark:via-stone-900/65 dark:to-stone-950/80', icon: '📐' },
  { gradient: 'from-emerald-100/95 via-teal-50/85 to-cyan-50/75 dark:from-emerald-950/45 dark:via-stone-900/65 dark:to-stone-950/80', icon: '🧾' },
  { gradient: 'from-rose-100/95 via-orange-50/80 to-amber-50/75 dark:from-rose-950/45 dark:via-stone-900/65 dark:to-stone-950/80', icon: '🦺' },
  { gradient: 'from-violet-100/95 via-purple-50/82 to-fuchsia-50/75 dark:from-violet-950/48 dark:via-stone-900/65 dark:to-stone-950/80', icon: '✈️' },
  { gradient: 'from-neutral-100/95 via-stone-50/90 to-orange-50/72 dark:from-neutral-900/55 dark:via-stone-900/70 dark:to-stone-950/80', icon: '📄' },
]

function IconClose(props: { className?: string }) {
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
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  )
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

function GalleryDismissButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-300/80 bg-white/90 text-stone-500 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-45 dark:border-stone-600 dark:bg-stone-900/90 dark:text-stone-400 dark:hover:border-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-100"
      aria-label="패널 닫기"
      title="닫기"
    >
      <IconClose className="h-4 w-4" />
    </button>
  )
}

function GalleryHideButton({
  disabled,
  title,
  onClick,
}: {
  disabled?: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-400/40 bg-white/70 text-stone-500 shadow-sm backdrop-blur-sm transition hover:border-stone-500/60 hover:bg-white hover:text-stone-800 disabled:opacity-45 dark:border-stone-500/40 dark:bg-stone-950/50 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
      aria-label={`${title} 숨기기`}
      title="목록에서 숨기기"
    >
      <IconClose className="h-3.5 w-3.5" />
    </button>
  )
}

function OrgPromptGreeting({
  userGreetingName,
  disabled,
  onDismissSection,
  loading,
}: {
  userGreetingName?: string
  disabled?: boolean
  onDismissSection?: () => void
  loading?: boolean
}) {
  return (
    <div className="shrink-0 px-4 pb-2 pt-1 md:px-6 md:pb-3 md:pt-2">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
        <div className="min-w-0">
          {loading && !userGreetingName ? (
            <div className="space-y-2">
              <div className="h-[2.125rem] w-56 animate-pulse rounded-md bg-stone-300/80 dark:bg-stone-700/80" />
              <div className="h-[1.75rem] w-44 animate-pulse rounded-md bg-stone-200/90 dark:bg-stone-800/90" />
            </div>
          ) : (
            <>
              <p className="text-[60px] font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                {userGreetingName
                  ? `${userGreetingName}님, 안녕하세요`
                  : '안녕하세요'}
              </p>
              <p className="mt-1 text-[25.5px] leading-snug text-stone-600 dark:text-stone-400">
                무엇을 도와드릴까요?
              </p>
            </>
          )}
        </div>
        {onDismissSection ? (
          <GalleryDismissButton
            disabled={disabled}
            onClick={onDismissSection}
          />
        ) : null}
      </div>
    </div>
  )
}

type OrgPromptGalleryProps = {
  prompts: StaticOrgPromptItem[]
  disabled?: boolean
  /** 입력창에 반영 */
  onApplyToInput: (item: StaticOrgPromptItem) => void
  /** 숨김(서버 저장은 부모에서) */
  onRemoveFromGallery: (promptId: string) => void | Promise<void>
  onDismissSection?: () => void
  /** AI 제공사·모델 선택 등 상단 도구 모음 */
  modelToolbar?: ReactNode
  /** 인사말에 쓸 표시 이름(예: 홍덕) */
  userGreetingName?: string
}

export function OrgPromptGallery({
  prompts,
  disabled,
  onApplyToInput,
  onRemoveFromGallery,
  onDismissSection,
  modelToolbar,
  userGreetingName,
}: OrgPromptGalleryProps) {
  if (prompts.length === 0) return null

  return (
    <>
      <OrgPromptGreeting
        userGreetingName={userGreetingName}
        disabled={disabled}
        onDismissSection={onDismissSection}
      />
      <section className="shrink-0 border-b border-stone-200/80 bg-gradient-to-b from-stone-100/70 to-transparent px-4 py-3 dark:border-stone-800 dark:from-stone-900/60 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {modelToolbar ? (
            <div className="flex w-full items-center rounded-xl border border-stone-300/70 bg-white/70 px-2.5 py-2 dark:border-stone-600 dark:bg-stone-900/50">
              {modelToolbar}
            </div>
          ) : null}

          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {prompts.map((item, i) => {
            const deco = CARD_SURFACE[i % CARD_SURFACE.length]
            return (
              <article
                key={item.id}
                className={`org-prompt-gallery-card relative flex w-[30%] min-w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-stone-200/85 bg-gradient-to-br md:w-full md:min-w-0 md:shrink md:rounded-2xl ${deco.gradient} shadow-sm backdrop-blur-sm dark:border-stone-700/90`}
              >
                <div className="absolute right-1.5 top-1.5 md:right-2 md:top-2">
                  <GalleryHideButton
                    disabled={disabled}
                    title={item.title}
                    onClick={() => {
                      if (
                        typeof window !== 'undefined' &&
                        !window.confirm(
                          '이 프롬프트 카드를 목록에서 숨길까요? 이 계정에서는 다시 표시되지 않습니다.',
                        )
                      ) {
                        return
                      }
                      void onRemoveFromGallery(item.id)
                    }}
                  />
                </div>

                <div className="flex flex-1 flex-col gap-1 p-2.5 pt-7 md:gap-1.5 md:p-3 md:pt-9">
                  <div className="flex items-start gap-1.5 md:items-center md:gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/65 text-base shadow-inner dark:bg-stone-950/55 md:h-9 md:w-9 md:rounded-xl md:text-[1.6875rem]"
                      aria-hidden
                    >
                      {deco.icon}
                    </span>
                    <h3 className="org-prompt-gallery-card-title min-w-0 font-semibold text-stone-900 dark:text-stone-50">
                      {item.title}
                    </h3>
                  </div>
                  <p className="org-prompt-gallery-card-desc text-stone-700 dark:text-stone-300">
                    {item.description}
                  </p>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onApplyToInput(item)}
                    className="org-prompt-gallery-apply-btn mt-1.5 inline-flex w-full items-center justify-center rounded-md border border-orange-700/35 bg-white/75 px-2.5 py-1.5 font-semibold text-orange-900 shadow-sm transition hover:border-orange-700/55 hover:bg-orange-50/90 active:bg-orange-100/80 disabled:cursor-not-allowed disabled:opacity-50 md:mt-2 md:rounded-lg md:px-3 md:py-2 dark:border-orange-600/40 dark:bg-stone-950/40 dark:text-orange-200 dark:hover:bg-orange-950/35 dark:hover:border-orange-500/50"
                  >
                    <span>입력창에 적용</span>
                    <IconArrowDown className="opacity-80" />
                  </button>
                </div>
              </article>
            )
          })}
          </div>
        </div>
      </section>
    </>
  )
}

type OrgPromptGallerySkeletonProps = {
  disabled?: boolean
  onDismissSection?: () => void
  modelToolbar?: ReactNode
  userGreetingName?: string
}

export function OrgPromptGallerySkeleton({
  disabled,
  onDismissSection,
  modelToolbar,
  userGreetingName,
}: OrgPromptGallerySkeletonProps) {
  return (
    <>
      <OrgPromptGreeting
        userGreetingName={userGreetingName}
        disabled={disabled}
        onDismissSection={onDismissSection}
        loading={!userGreetingName}
      />
      <section className="shrink-0 border-b border-stone-200/80 bg-gradient-to-b from-stone-100/70 to-transparent px-4 py-3 dark:border-stone-800 dark:from-stone-900/60 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {modelToolbar ? (
            <div className="flex w-full items-center rounded-xl border border-stone-300/70 bg-white/70 px-2.5 py-2 dark:border-stone-600 dark:bg-stone-900/50">
              {modelToolbar}
            </div>
          ) : null}

          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="org-prompt-gallery-card relative flex w-[30%] min-w-[240px] shrink-0 snap-start animate-pulse flex-col overflow-hidden rounded-xl border border-stone-200/70 bg-stone-200/60 shadow-sm md:w-full md:min-w-0 md:shrink md:rounded-2xl dark:border-stone-700 dark:bg-stone-800/70"
            >
              <div className="flex flex-1 flex-col gap-1 p-2.5 pt-7 md:gap-1.5 md:gap-3 md:p-3 md:pt-9">
                <div className="flex items-start gap-1.5 md:items-center md:gap-2">
                  <div className="h-7 w-7 shrink-0 rounded-lg bg-stone-300/90 dark:bg-stone-600/90 md:h-9 md:w-9 md:rounded-xl" />
                  <div className="h-4 min-w-0 flex-1 rounded-md bg-stone-300/80 dark:bg-stone-600/80 md:h-5" />
                </div>
                <div className="space-y-1.5 md:space-y-2">
                  <div className="h-3 w-full rounded bg-stone-300/70 dark:bg-stone-600/70" />
                  <div className="h-3 w-[92%] rounded bg-stone-300/60 dark:bg-stone-600/60" />
                </div>
                <div className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-stone-300/80 bg-stone-100/40 dark:border-stone-600/70 dark:bg-stone-900/30 md:mt-2 md:h-9 md:rounded-lg">
                  <div className="h-2.5 w-16 animate-pulse rounded-full bg-stone-300/70 dark:bg-stone-600/70" />
                  <div className="h-3 w-3 animate-pulse rounded-full bg-stone-300/60 dark:bg-stone-600/60" />
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      </section>
    </>
  )
}
