type AvatarProps = {
  name: string
  size?: 28 | 32 | 36 | 40 | 48 | 56
  className?: string
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  28: 'h-[28px] w-[28px] text-[12px]!',
  32: 'h-[32px] w-[32px] text-[13px]!',
  36: 'h-[36px] w-[36px] text-[14px]!',
  40: 'h-[40px] w-[40px] text-[15px]!',
  48: 'h-[48px] w-[48px] text-[18px]!',
  56: 'h-[56px] w-[56px] text-[20px]!',
}

/** 이니셜 아바타 — 브랜드 그라데이션 배경 */
export function Avatar({ name, size = 36, className = '' }: AvatarProps) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent font-bold text-white ring-2 ring-surface ${SIZE_CLASS[size]} ${className}`}
    >
      {initial}
    </span>
  )
}
