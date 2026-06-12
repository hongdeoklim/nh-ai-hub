import { forwardRef } from 'react'

import { AiSheetsModeAccordion } from './AiSheetsModeAccordion'
import { buildGoogleSheetsViewUrl } from '../../lib/google-sheets-url'
import { ChatInput, type ChatSendPayload } from '../chat/ChatInput'
import { ModelSelectRow } from '../chat/ChatStartHub'
import type { ModelSelectVersionRow } from '../../types/ai-models'

export type LinkedSpreadsheet = {
  spreadsheetId: string
  spreadsheetUrl?: string | null
  range: string
  source?: 'google' | 'local'
  fileName?: string
}

export type AiSheetsPromptSectionProps = {
  draft: string
  onDraftChange: (value: string) => void
  onSend: (payload: ChatSendPayload) => void
  profileReady: boolean
  selectedModel: string
  versionRows: readonly ModelSelectVersionRow[]
  modelSaving: boolean
  onModelChange: (id: string) => void
  linkedSpreadsheet: LinkedSpreadsheet | null
  onClearLinkedSpreadsheet: () => void
  generating?: boolean
}

export const AiSheetsPromptSection = forwardRef<
  HTMLElement,
  AiSheetsPromptSectionProps
>(function AiSheetsPromptSection(
  {
    draft,
    onDraftChange,
    onSend,
    profileReady,
    selectedModel,
    versionRows,
    modelSaving,
    onModelChange,
    linkedSpreadsheet,
    onClearLinkedSpreadsheet,
    generating = false,
  },
  ref,
) {
  const sheetViewUrl = linkedSpreadsheet
    ? linkedSpreadsheet.spreadsheetUrl ??
      buildGoogleSheetsViewUrl(linkedSpreadsheet.spreadsheetId)
    : null

  return (
    <section
      ref={ref}
      className="prompt-input-section sheets-agent-prompt has-promo-banner mb-6"
    >
      <div className="prompt-input-wrapper mx-auto max-w-3xl">
        <div className="mb-[-22px]">
          <AiSheetsModeAccordion />
        </div>

        <div className="search-input-wrapper input-wrapper w-full overflow-visible rounded-[16px] border border-gray-200 bg-white shadow-[0px_6px_30px_0px_rgba(0,0,0,0.08)] dark:border-[#e6e9eb40] dark:bg-[#333333]">
          <div className="sheets-template input relative cursor-text px-[12px] pb-[12px] pt-3">
            {linkedSpreadsheet ? (
              <div className="prompt-files mb-2">
                <div className="inline-flex h-9 max-w-full items-center gap-2 rounded-[10px] border border-gray-200 bg-[#F9FAFB] py-1 pl-2 pr-1 dark:border-stone-600 dark:bg-stone-800/80">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-100 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                    ▦
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#0D0D0D] dark:text-stone-50">
                    {linkedSpreadsheet.source === 'local'
                      ? linkedSpreadsheet.fileName ?? linkedSpreadsheet.spreadsheetId
                      : `${linkedSpreadsheet.spreadsheetId.slice(0, 16)}…`}
                    {' · '}
                    {linkedSpreadsheet.range}
                  </span>
                  {sheetViewUrl && linkedSpreadsheet.source !== 'local' ? (
                    <a
                      href={sheetViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-orange-800 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      열기
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClearLinkedSpreadsheet}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#737373] transition hover:bg-gray-200/80 hover:text-[#0D0D0D] dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
                    aria-label="연결된 시트 제거"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}

            <ChatInput
              value={draft}
              onChange={onDraftChange}
              onSend={onSend}
              disabled={!profileReady}
              allowSend={profileReady}
              generating={generating}
              variant="gemini"
              disableAttachments
              embeddedInSlidesShell
              slidesMinimalComposer
              placeholder="Google Sheets URL 붙여넣기 또는 분석 요청을 입력하세요."
            />
          </div>
        </div>

        {profileReady ? (
          <div className="mt-2 flex justify-end px-0.5">
            <ModelSelectRow
              selectedModel={selectedModel}
              modelVersionSelectId="ai-sheets-model-version-select"
              versionRows={versionRows}
              modelSaving={modelSaving}
              profileReady={profileReady}
              onModelChange={onModelChange}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
})
