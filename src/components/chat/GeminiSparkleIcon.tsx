import { useId } from 'react'

type GeminiSparkleIconProps = {
  className?: string
  /** Gemini bard-avatar 로딩 링 회전 */
  loading?: boolean
}

/** Google Gemini 채팅 `bard-avatar` — 32px 원형 + 중앙 스파클 */
export function GeminiSparkleIcon({
  className = 'h-8 w-8',
  loading = false,
}: GeminiSparkleIconProps) {
  const gradId = useId().replace(/:/g, '')

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${className}`}
      aria-hidden={!loading}
      aria-label={loading ? '응답 생성 중' : undefined}
      role={loading ? 'status' : undefined}
    >
      {loading ? (
        <div
          className="gemini-avatar-ring absolute inset-0 rounded-full"
          aria-hidden="true"
        />
      ) : null}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_1px_2px_rgba(60,64,67,0.12)] ring-1 ring-[#e3e3e3] dark:bg-stone-900 dark:shadow-none dark:ring-stone-700 ${
          loading ? 'absolute inset-[2px]' : 'h-full w-full'
        }`}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          className={`h-3.5 w-3.5 ${loading ? 'gemini-avatar-sparkle-pulse' : ''}`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`nh-gemini-sparkle-${gradId}`}
              x1="4"
              y1="2"
              x2="24"
              y2="26"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#4285F4" />
              <stop offset="0.5" stopColor="#9B72CB" />
              <stop offset="1" stopColor="#D96570" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#nh-gemini-sparkle-${gradId})`}
            d="M14 2.5 16.8 11.2 25.5 14 16.8 16.8 14 25.5 11.2 16.8 2.5 14 11.2 11.2Z"
          />
        </svg>
      </div>
    </div>
  )
}

export function GeminiThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="응답 생성 중">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gradient-to-br from-[#4285F4] to-[#9B72CB] opacity-70 animate-bounce"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  )
}

export function GeminiStreamingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[1px] animate-pulse rounded-full bg-gradient-to-b from-[#4285F4] via-[#9B72CB] to-[#D96570]"
      aria-hidden="true"
    />
  )
}
