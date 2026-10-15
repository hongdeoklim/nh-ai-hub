import type { SVGProps } from 'react'

/**
 * 앱 공용 아이콘 세트 (24×24 · stroke 1.75 · lucide 스타일).
 * 이모지·개별 인라인 SVG 대신 이 컴포넌트를 사용한다.
 * 크기는 className(h-[20px] w-[20px])으로 지정한다.
 */
export type IconProps = SVGProps<SVGSVGElement> & { className?: string }

function Base({ children, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconChat = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L4 21l1.4-4.2A8.5 8.5 0 1 1 21 12Z" />
  </Base>
)
export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)
export const IconPenSquare = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Base>
)
export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
)
export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </Base>
)
export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.6a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.6a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
)
export const IconLogOut = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Base>
)
export const IconUser = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Base>
)
export const IconSun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
  </Base>
)
export const IconMoon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Base>
)
export const IconMonitor = (p: IconProps) => (
  <Base {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Base>
)
export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Base>
)
export const IconPanelLeft = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Base>
)
export const IconX = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)
export const IconChevronLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 18-6-6 6-6" />
  </Base>
)
export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 18 6-6-6-6" />
  </Base>
)
export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
)
export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 19-7-7 7-7M19 12H5" />
  </Base>
)
export const IconCornerDownLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    <path d="m9 10-5 5 5 5" />
  </Base>
)
export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Base>
)
export const IconBookOpen = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H2Z" />
    <path d="M22 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6Z" />
  </Base>
)
export const IconFolder = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Base>
)
export const IconBrain = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 2a2.5 2.5 0 0 0-2.5 2.5v.6A3 3 0 0 0 4 8a3 3 0 0 0 .4 1.5A3 3 0 0 0 4 14a3 3 0 0 0 2 2.8V18a3 3 0 0 0 6 0V4.5A2.5 2.5 0 0 0 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.6A3 3 0 0 1 20 8a3 3 0 0 1-.4 1.5A3 3 0 0 1 20 14a3 3 0 0 1-2 2.8V18a3 3 0 0 1-6 0V4.5A2.5 2.5 0 0 1 14.5 2Z" />
  </Base>
)
export const IconNotebook = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="3" width="15" height="18" rx="2" />
    <path d="M9 3v18M3 8h2M3 12h2M3 16h2" />
  </Base>
)
export const IconBookmark = (p: IconProps) => (
  <Base {...p}>
    <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
  </Base>
)
export const IconLibrary = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4v16M9 4v16M14 5l4.5 14" />
    <path d="M4 20h4M9 20h4" />
  </Base>
)
export const IconZap = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />
  </Base>
)
export const IconRuler = (p: IconProps) => (
  <Base {...p}>
    <path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4Z" />
    <path d="m14.5 6.5 1.5 1.5M11.5 9.5 13 11M8.5 12.5 10 14M5.5 15.5 7 17" />
  </Base>
)
export const IconSparkles = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
    <path d="M19 17v4M17 19h4M5 3v3M3.5 4.5h3" />
  </Base>
)
export const IconClipboardList = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </Base>
)
export const IconPalette = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 22a10 10 0 1 1 10-10c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.6.7.3 1.7-.5 1.7Z" />
    <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
    <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="7.5" r="1" fill="currentColor" />
  </Base>
)
export const IconPresentation = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 3h20" />
    <rect x="3" y="3" width="18" height="12" rx="2" />
    <path d="m12 15 4 6M12 15l-4 6" />
  </Base>
)
export const IconTable = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </Base>
)
export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </Base>
)
export const IconHardHat = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1Z" />
    <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
    <path d="M4 15v-3a6 6 0 0 1 6-6M20 15v-3a6 6 0 0 0-6-6" />
  </Base>
)
export const IconCoins = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.1 10.4A6 6 0 1 1 10.4 18.1" />
    <path d="M7 6h1v4M16.7 13.7l.7.7-2.8 2.8" />
  </Base>
)
export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
)
export const IconHelpCircle = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
  </Base>
)
export const IconCommand = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
  </Base>
)
export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12 5 5L20 7" />
  </Base>
)
export const IconPin = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3Z" />
  </Base>
)
export const IconMoreVertical = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </Base>
)
export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </Base>
)
export const IconFileText = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </Base>
)
export const IconExternalLink = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Base>
)
export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Base>
)
export const IconLink = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </Base>
)
export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="m3 11 9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z" />
  </Base>
)
export const IconInbox = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" />
  </Base>
)
export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Base>
)
export const IconLayoutTemplate = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="7" rx="1.5" />
    <rect x="3" y="14" width="9" height="7" rx="1.5" />
    <rect x="16" y="14" width="5" height="7" rx="1.5" />
  </Base>
)
export const IconBoxes = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.97 12.92 2 13.5v4.14a2 2 0 0 0 1.05 1.76l3.5 1.95a2 2 0 0 0 1.9 0L12 19.5l3.55 1.85a2 2 0 0 0 1.9 0l3.5-1.95A2 2 0 0 0 22 17.64V13.5l-.97-.58" />
    <path d="M7 16.5 2.97 12.92 7 10.5l4 2.42M7 16.5v5M17 16.5l4.03-3.58L17 10.5l-4 2.42M17 16.5v5" />
    <path d="M12 12.92V8l4-2.4L12 3.2 8 5.6l4 2.4" />
  </Base>
)
export const IconWorkflow = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="6" height="6" rx="1.5" />
    <rect x="15" y="15" width="6" height="6" rx="1.5" />
    <path d="M9 6h4a2 2 0 0 1 2 2v7" />
  </Base>
)
export const IconStore = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 9 4.5 4h15L21 9" />
    <path d="M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
    <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
  </Base>
)
export const IconSpinner = (p: IconProps) => (
  <Base {...p} className={`animate-spin ${p.className ?? ''}`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Base>
)
