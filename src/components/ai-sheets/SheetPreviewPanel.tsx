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
    <div className="sheet-preview-panel flex h-full min-h-0 flex-col bg-white dark:bg-stone-900">
      <div className="shrink-0 border-b border-stone-200 px-3 py-2.5 dark:border-stone-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-300">
              AI Sheets
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-stone-900 dark:text-stone-50">
              {spreadsheetId}
            </p>
            {preview?.source ? (
              <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
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
            className="shrink-0 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Sheets 열기
          </a>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            value={range}
            onChange={(e) => onRangeChange(e.target.value)}
            placeholder={DEFAULT_SHEETS_RANGE}
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-[12px] text-stone-800 outline-none focus:ring-2 focus:ring-orange-500/25 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            aria-label="시트 범위"
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 rounded-md bg-orange-800 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
          >
            {loading ? '…' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <p className="text-[13px] text-stone-500 dark:text-stone-400">
            시트 불러오는 중…
          </p>
        ) : preview?.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-snug text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            {preview.error}
          </p>
        ) : tableRows.length === 0 && headers.length === 0 ? (
          <p className="text-[13px] text-stone-500 dark:text-stone-400">
            범위에 데이터가 없거나 아직 미리보기를 불러오지 않았습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
            <table className="w-full min-w-[20rem] border-collapse text-left text-[12px]">
              {headers.length > 0 ? (
                <thead className="sticky top-0 bg-stone-100 dark:bg-stone-800">
                  <tr>
                    {headers.map((header) => (
                      <th
                        key={header}
                        className="border-b border-stone-200 px-2 py-1.5 font-semibold text-stone-900 dark:border-stone-700 dark:text-stone-50"
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
                    className="border-b border-stone-100 last:border-0 dark:border-stone-800"
                  >
                    {headers.map((header) => (
                      <td
                        key={`${rowIndex}-${header}`}
                        className="max-w-[12rem] truncate px-2 py-1.5 text-stone-700 dark:text-stone-200"
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
          <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
            {preview.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
