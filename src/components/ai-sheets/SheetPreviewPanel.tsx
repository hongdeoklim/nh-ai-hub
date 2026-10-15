import { useMemo } from 'react'

import {
  buildGoogleSheetsViewUrl,
  DEFAULT_SHEETS_RANGE,
} from '../../lib/google-sheets-url'
import type { GoogleSpreadsheetReadResult } from '../../services/ai/google-sheets-preview'

type SheetPreviewPanelProps = {
  spreadsheetId: string
  range: string
  spreadsheetUrl?: string
  preview: GoogleSpreadsheetReadResult | null
  loading: boolean
  onRangeChange: (range: string) => void
  onRefresh: () => void
}

export function SheetPreviewPanel({
  spreadsheetId,
  range,
  spreadsheetUrl,
  preview,
  loading,
  onRangeChange,
  onRefresh,
}: SheetPreviewPanelProps) {
  const headers = preview?.headers ?? []
  const rows = preview?.rows ?? []
  const viewUrl = spreadsheetUrl ?? buildGoogleSheetsViewUrl(spreadsheetId)

  const tableRows = useMemo(() => {
    if (rows.length > 0) return rows.slice(0, 100)
    if (headers.length === 0) return []
    return []
  }, [headers.length, rows])

  return (
    <div className="sheet-preview-panel flex h-full min-h-0 flex-col bg-surface">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
              AI Sheets
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-fg">
              {spreadsheetId}
            </p>
            {preview?.source ? (
              <p className="mt-0.5 text-[11px] text-fg-subtle">
                {preview.source === 'oauth'
                  ? 'Google 계정 연동'
                  : '서비스 계정'}
              </p>
            ) : null}
          </div>
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-fg-muted transition hover:bg-surface-2"
          >
            Sheets 열기
          </a>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            value={range}
            onChange={(e) => onRangeChange(e.target.value)}
            placeholder={DEFAULT_SHEETS_RANGE}
            className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[12px] text-fg outline-none focus:ring-2 focus:ring-focus/40"
            aria-label="시트 범위"
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-brand-fg transition hover:bg-brand-strong disabled:opacity-50"
          >
            {loading ? '…' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <p className="text-[13px] text-fg-subtle">
            시트 불러오는 중…
          </p>
        ) : preview?.error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] leading-snug text-red-900">
            {preview.error}
          </p>
        ) : tableRows.length === 0 && headers.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">
            범위에 데이터가 없거나 아직 미리보기를 불러오지 않았습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[20rem] border-collapse text-left text-[12px]">
              {headers.length > 0 ? (
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    {headers.map((header) => (
                      <th
                        key={header}
                        className="border-b border-border px-2 py-1.5 font-semibold text-fg"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr
                    key={`row-${rowIndex}`}
                    className="border-b border-border last:border-0"
                  >
                    {headers.map((header) => (
                      <td
                        key={`${rowIndex}-${header}`}
                        className="max-w-[12rem] truncate px-2 py-1.5 text-fg-muted"
                        title={row[header] ?? ''}
                      >
                        {row[header] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {preview?.message ? (
          <p className="mt-2 text-[11px] text-fg-subtle">
            {preview.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
