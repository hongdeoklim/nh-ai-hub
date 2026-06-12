import type { ReactNode } from 'react'

type IconProps = { className?: string }

function Svg({
  className,
  children,
  viewBox = '0 0 16 16',
}: {
  className?: string
  children: ReactNode
  viewBox?: string
}) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconFileOpen({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M2.5 4.5h4l1.5 1.5H13.5V12.5H2.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 4.5V3H12.5V6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconExport({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M8 2.5v7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M5.5 7 8 9.5 10.5 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12.5h10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconFullscreen({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconFullscreenExit({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M6 3H3v3M13 3h-3v3M10 13h3v-3M3 13v-3h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconGoogleSheets({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M2.5 6h11M2.5 9.5h11M6 2.5v11" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9.5" y="9.5" width="2.5" height="2.5" fill="#217346" stroke="none" />
    </Svg>
  )
}

export function IconLinkOff({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M6.2 6.2 9.8 9.8M5.5 4.8a3.2 3.2 0 0 1 4.5 4.5M10.5 11.2a3.2 3.2 0 0 1-4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconRefresh({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M11.5 3.5A4.5 4.5 0 0 0 5.8 5.2M4.5 3.5V6h2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 12.5A4.5 4.5 0 0 0 10.2 10.8M11.5 12.5V10H9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconSpreadsheet({ className }: IconProps) {
  return (
    <Svg className={className} viewBox="0 0 24 24">
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M4 10h16M4 15h16M10 4v16" stroke="currentColor" strokeWidth="1.5" />
    </Svg>
  )
}

export function IconUpload({ className }: IconProps) {
  return (
    <Svg className={className} viewBox="0 0 24 24">
      <path
        d="M12 16V6M8.5 9.5 12 6l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 18h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconUndo({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M4 5.5h5.5a3.5 3.5 0 1 1 0 7H7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 3.5 4 5.5l2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconPaste({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect
        x="5"
        y="4.5"
        width="7"
        height="9"
        rx="0.8"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M6.5 4.5V3.8c0-.6.5-1.1 1.1-1.1h2.8c.6 0 1.1.5 1.1 1.1V4.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M7 8h3M7 10h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </Svg>
  )
}

export function IconClipboard({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect
        x="4.5"
        y="4"
        width="7"
        height="9"
        rx="0.8"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M6.5 4V3.3c0-.5.4-.8.9-.8h2.2c.5 0 .9.3.9.8V4"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </Svg>
  )
}

export function IconFont({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M4.5 12.5V4.5h2.2l3.3 8M6.2 10h3.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 12.5V4.5H14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconWrapText({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 4.5h10M3 7.5h7M3 10.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M12.5 9.5 14.5 11.5 12.5 13.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconMergeCenter({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="10" height="8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconAlign({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 4.5h10M3 7h7M3 9.5h9M3 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconParagraph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 4.5h6M4 7.5h8M4 10.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 4.5v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconNumberFormat({ className }: IconProps) {
  return (
    <Svg className={className}>
      <text x="3" y="11.5" fill="currentColor" fontSize="7" fontWeight="600" fontFamily="Segoe UI, sans-serif">
        123
      </text>
      <path d="M11 5.5v6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </Svg>
  )
}

export function IconTableStyle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3.5" width="10" height="9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 6.5h10M3 9.5h10M7 3.5v9" stroke="currentColor" strokeWidth="1.1" />
    </Svg>
  )
}

export function IconCell({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="4.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 8h7M8 4.5v7" stroke="currentColor" strokeWidth="1" />
    </Svg>
  )
}

export function IconEdit({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M10.5 3.5 12.5 5.5 6.5 11.5H4.5V9.5l6-6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9.5 4.5l2 2" stroke="currentColor" strokeWidth="1.2" />
    </Svg>
  )
}

function iconText(label: string, className?: string) {
  return (
    <Svg className={className}>
      <text x="2" y="11.5" fill="currentColor" fontSize="7" fontWeight="700" fontFamily="Segoe UI, sans-serif">
        {label}
      </text>
    </Svg>
  )
}

export function IconBold({ className }: IconProps) {
  return iconText('B', className)
}

export function IconItalic({ className }: IconProps) {
  return iconText('I', className)
}

export function IconUnderline({ className }: IconProps) {
  return iconText('U', className)
}

export function IconAlignLeft({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 4.5h10M3 7h6M3 9.5h8M3 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconAlignRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 4.5h10M6 7h7M5 9.5h8M8 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconAlignTop({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 3.5h7M6 3.5v9M10 3.5v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconAlignMiddle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 3h7M6 5.5v5M10 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconAlignBottom({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 12.5h7M6 3.5v9M10 6.5v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconCurrency({ className }: IconProps) {
  return iconText('$', className)
}

export function IconPercent({ className }: IconProps) {
  return iconText('%', className)
}

export function IconConditional({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="10" height="8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 10l2-2 2 2 2-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconAutosum({ className }: IconProps) {
  return iconText('Σ', className)
}

export function IconFill({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="8" height="8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconClear({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconFind({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.8 9.8 13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconChart({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 12.5V6.5h2.5v6M7 12.5V4.5h2.5v8M11 12.5V8h2.5v4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconImage({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="10" height="8" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="7" r="1" fill="currentColor" />
      <path d="M4 11l2.5-2 2 1.5 2.5-3 1 2.5" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconShape({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="4.5" width="5" height="5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.2" />
    </Svg>
  )
}

export function IconLink({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.5 9.5a2.2 2.2 0 0 0 3.1 0l1.8-1.8a2.2 2.2 0 0 0-3.1-3.1L7.5 5.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.5 6.5a2.2 2.2 0 0 0-3.1 0L4.6 8.3a2.2 2.2 0 0 0 3.1 3.1l1.8-1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconMargin({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="3.5" width="8" height="9" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="5" width="5" height="6" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5" />
    </Svg>
  )
}

export function IconOrientation({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5" y="3.5" width="6" height="9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12.5 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconPageSize({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="2.5" width="7" height="11" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5h4M6 7h4M6 9h2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </Svg>
  )
}

export function IconGridlines({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3.5" width="10" height="9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 6.5h10M3 9.5h10M6 3.5v9M10 3.5v9" stroke="currentColor" strokeWidth="0.9" />
    </Svg>
  )
}

export function IconHeadings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 6.5h10M6.5 3.5v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="3" y="3.5" width="10" height="9" stroke="currentColor" strokeWidth="1" />
    </Svg>
  )
}

export function IconFunction({ className }: IconProps) {
  return iconText('fx', className)
}

export function IconName({ className }: IconProps) {
  return iconText('Ab', className)
}

export function IconFormulaShow({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 5h10M3 8h7M3 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconSort({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 4v8M5 12l-1.5-1.5M5 12l1.5-1.5M11 12V4M11 4l-1.5 1.5M11 4l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconFilter({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 4h9l-3.5 4v4l-2 1.5V8L3.5 4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </Svg>
  )
}

export function IconTextSplit({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 5.5h4M3 8.5h4M3 11.5h4M10 4v8M12.5 8H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconDedupe({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8.5" y="7.5" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7.5 6.2 8.8 7.5" stroke="currentColor" strokeWidth="1.1" />
    </Svg>
  )
}

export function IconGroup({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="4" height="6" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9" y="5" width="4" height="6" stroke="currentColor" strokeWidth="1.1" />
    </Svg>
  )
}

export function IconViewNormal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="10" height="8" stroke="currentColor" strokeWidth="1.2" />
    </Svg>
  )
}

export function IconPageBreak({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3.5" width="4.5" height="9" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8.5" y="3.5" width="4.5" height="9" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 1.5" />
    </Svg>
  )
}

export function IconZoom({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.8 9.8 13 13M5.5 7h3M7 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  )
}

export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 2.5v1.2M8 12.3v1.2M2.5 8h1.2M12.3 8h1.2M4.2 4.2l.8.8M11 11l.8.8M11 4.2l-.8.8M4.2 11l-.8.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </Svg>
  )
}

export function IconCalc({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </Svg>
  )
}

export type SheetsRibbonIconId =
  | 'undo'
  | 'paste'
  | 'clipboard'
  | 'font'
  | 'wrap-text'
  | 'merge-center'
  | 'align'
  | 'align-left'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'paragraph'
  | 'number-format'
  | 'table-style'
  | 'cell'
  | 'edit'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'currency'
  | 'percent'
  | 'conditional'
  | 'autosum'
  | 'fill'
  | 'clear'
  | 'find'
  | 'chart'
  | 'image'
  | 'shape'
  | 'link'
  | 'margin'
  | 'orientation'
  | 'page-size'
  | 'gridlines'
  | 'headings'
  | 'function'
  | 'name'
  | 'formula-show'
  | 'sort'
  | 'filter'
  | 'text-split'
  | 'dedupe'
  | 'group'
  | 'view-normal'
  | 'page-break'
  | 'zoom'
  | 'settings'
  | 'calc'

const RIBBON_ICON_MAP: Record<
  SheetsRibbonIconId,
  (props: IconProps) => ReactNode
> = {
  undo: IconUndo,
  paste: IconPaste,
  clipboard: IconClipboard,
  font: IconFont,
  'wrap-text': IconWrapText,
  'merge-center': IconMergeCenter,
  align: IconAlign,
  'align-left': IconAlignLeft,
  'align-right': IconAlignRight,
  'align-top': IconAlignTop,
  'align-middle': IconAlignMiddle,
  'align-bottom': IconAlignBottom,
  paragraph: IconParagraph,
  'number-format': IconNumberFormat,
  'table-style': IconTableStyle,
  cell: IconCell,
  edit: IconEdit,
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  currency: IconCurrency,
  percent: IconPercent,
  conditional: IconConditional,
  autosum: IconAutosum,
  fill: IconFill,
  clear: IconClear,
  find: IconFind,
  chart: IconChart,
  image: IconImage,
  shape: IconShape,
  link: IconLink,
  margin: IconMargin,
  orientation: IconOrientation,
  'page-size': IconPageSize,
  gridlines: IconGridlines,
  headings: IconHeadings,
  function: IconFunction,
  name: IconName,
  'formula-show': IconFormulaShow,
  sort: IconSort,
  filter: IconFilter,
  'text-split': IconTextSplit,
  dedupe: IconDedupe,
  group: IconGroup,
  'view-normal': IconViewNormal,
  'page-break': IconPageBreak,
  zoom: IconZoom,
  settings: IconSettings,
  calc: IconCalc,
}

export function SheetsRibbonIcon({
  id,
  className = 'h-4 w-4',
}: {
  id: SheetsRibbonIconId
  className?: string
}) {
  const Icon = RIBBON_ICON_MAP[id]
  return <Icon className={className} />
}
