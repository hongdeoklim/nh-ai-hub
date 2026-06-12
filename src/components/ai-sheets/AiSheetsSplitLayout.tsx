import type { ReactNode } from 'react'

import type { GoogleSpreadsheetReadResult } from '../../services/ai/google-sheets-preview'
import { SheetPreviewPanel } from './SheetPreviewPanel'

type AiSheetsSplitLayoutProps = {
  spreadsheetId: string
  range: string
  spreadsheetUrl?: string
  preview: GoogleSpreadsheetReadResult | null
  loading: boolean
  onRangeChange: (range: string) => void
  onRefresh: () => void
  children: ReactNode
}

/** Genspark sheets_agent — 좌측 시트 · 우측 채팅 분할 */
export function AiSheetsSplitLayout({
  spreadsheetId,
  range,
  spreadsheetUrl,
  preview,
  loading,
  onRangeChange,
  onRefresh,
  children,
}: AiSheetsSplitLayoutProps) {
  return (
    <div className="sheets-agent-split flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <aside className="flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col border-b border-stone-200 dark:border-stone-800 md:max-h-none md:w-[42%] md:max-w-[520px] md:border-b-0 md:border-r">
        <SheetPreviewPanel
          spreadsheetId={spreadsheetId}
          range={range}
          spreadsheetUrl={spreadsheetUrl}
          preview={preview}
          loading={loading}
          onRangeChange={onRangeChange}
          onRefresh={onRefresh}
        />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
