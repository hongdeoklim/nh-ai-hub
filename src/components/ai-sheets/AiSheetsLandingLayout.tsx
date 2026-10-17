import { toast } from 'sonner'
import { useCallback, useEffect, useState } from 'react'

import { AiSheetsHero } from './AiSheetsHero'
import {
  AiSheetsPromptSection,
  type LinkedSpreadsheet,
} from './AiSheetsPromptSection'
import { SheetsGlobalCanvas } from './SheetsGlobalCanvas'
import {
  DEFAULT_SHEETS_RANGE,
  parseSheetsPromptInput,
} from '../../lib/google-sheets-url'
import {
  matrixToSheetPreview,
  parseLocalSpreadsheetFile,
  type LocalSpreadsheetWorkbook,
} from '../../lib/parse-local-spreadsheet'
import {
  fetchGoogleSheetPreview,
  type GoogleSpreadsheetReadResult,
} from '../../services/ai/google-sheets-preview'

type AiSheetsLandingLayoutProps = {
  draft: string
  onDraftChange: (value: string) => void
  onSend: Parameters<typeof AiSheetsPromptSection>[0]['onSend']
  profileReady: boolean
  selectedModel: string
  versionRows: Parameters<typeof AiSheetsPromptSection>[0]['versionRows']
  modelSaving: boolean
  onModelChange: (id: string) => void
  linkedSpreadsheet: LinkedSpreadsheet | null
  onLinkSpreadsheet: (link: LinkedSpreadsheet | null) => void
  onPreviewChange?: (preview: GoogleSpreadsheetReadResult | null) => void
  starterChips: { id: string; label: string; prompt: string }[]
  onStarterClick: (prompt: string) => void
  promptSectionRef: React.RefObject<HTMLElement | null>
}

export function AiSheetsLandingLayout({
  draft,
  onDraftChange,
  onSend,
  profileReady,
  selectedModel,
  versionRows,
  modelSaving,
  onModelChange,
  linkedSpreadsheet,
  onLinkSpreadsheet,
  onPreviewChange,
  starterChips,
  onStarterClick,
  promptSectionRef,
}: AiSheetsLandingLayoutProps) {
  const [preview, setPreview] = useState<GoogleSpreadsheetReadResult | null>(
    null,
  )
  const [previewLoading, setPreviewLoading] = useState(false)
  const [localWorkbook, setLocalWorkbook] =
    useState<LocalSpreadsheetWorkbook | null>(null)
  const [activeSheetName, setActiveSheetName] = useState('')
  const [canvasRange, setCanvasRange] = useState(
    linkedSpreadsheet?.range ?? DEFAULT_SHEETS_RANGE,
  )

  const isLocalFile = linkedSpreadsheet?.source === 'local'

  // 연결된 시트가 바뀌면 로컬 통합 문서·범위·미리보기를 맞춘다 (렌더 중 조정 — effect 연쇄 렌더 방지)
  const linkSync = {
    source: linkedSpreadsheet?.source,
    spreadsheetId: linkedSpreadsheet?.spreadsheetId,
    range: linkedSpreadsheet?.range,
  }
  const [prevLinkSync, setPrevLinkSync] = useState(linkSync)
  if (
    prevLinkSync.source !== linkSync.source ||
    prevLinkSync.spreadsheetId !== linkSync.spreadsheetId ||
    prevLinkSync.range !== linkSync.range
  ) {
    setPrevLinkSync(linkSync)
    if (linkSync.source !== 'local') {
      setLocalWorkbook(null)
      setActiveSheetName('')
    }
    if (linkSync.range) setCanvasRange(linkSync.range)
    // 구글 시트 연결이 끊기면 이전 미리보기를 비운다
    if (!linkSync.spreadsheetId && linkSync.source !== 'local') setPreview(null)
  }

  useEffect(() => {
    onPreviewChange?.(preview)
  }, [onPreviewChange, preview])

  const loadGooglePreview = useCallback(
    (spreadsheetId: string, range: string) => {
      setPreviewLoading(true)
      void fetchGoogleSheetPreview(spreadsheetId, range)
        .then(setPreview)
        .finally(() => setPreviewLoading(false))
    },
    [],
  )

  useEffect(() => {
    const spreadsheetId = linkedSpreadsheet?.spreadsheetId
    if (!spreadsheetId || isLocalFile) return
    queueMicrotask(() => loadGooglePreview(spreadsheetId, canvasRange))
  }, [
    linkedSpreadsheet?.spreadsheetId,
    canvasRange,
    isLocalFile,
    loadGooglePreview,
  ])

  const handleConnectFromCanvas = useCallback(
    (url: string, nextRange: string) => {
      const parsed = parseSheetsPromptInput(`${url}\nrange: ${nextRange}`)
      if (!parsed.spreadsheetId) {
        toast.error('유효한 Google Sheets URL이 아닙니다.')
        return
      }
      setLocalWorkbook(null)
      setCanvasRange(parsed.range || nextRange)
      onLinkSpreadsheet({
        spreadsheetId: parsed.spreadsheetId,
        spreadsheetUrl: parsed.spreadsheetUrl,
        range: parsed.range || nextRange,
        source: 'google',
      })
    },
    [onLinkSpreadsheet],
  )

  const handleOpenLocalFile = useCallback(
    (file: File) => {
      setPreviewLoading(true)
      void parseLocalSpreadsheetFile(file)
        .then(({ workbook, preview: nextPreview }) => {
          setLocalWorkbook(workbook)
          setActiveSheetName(workbook.sheetNames[0] ?? 'Sheet1')
          setPreview(nextPreview)
          onLinkSpreadsheet({
            spreadsheetId: `local:${file.name}`,
            range: workbook.sheetNames[0] ?? 'Sheet1',
            source: 'local',
            fileName: file.name,
          })
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : '파일을 읽지 못했습니다.'
          setPreview({
            ok: false,
            error: message,
          })
        })
        .finally(() => setPreviewLoading(false))
    },
    [onLinkSpreadsheet],
  )

  const handleSheetChange = useCallback(
    (sheetName: string) => {
      if (!localWorkbook) return
      const matrix = localWorkbook.sheets[sheetName] ?? [['']]
      setActiveSheetName(sheetName)
      setPreview(
        matrixToSheetPreview(localWorkbook.fileName, sheetName, matrix),
      )
      if (linkedSpreadsheet?.source === 'local') {
        onLinkSpreadsheet({
          ...linkedSpreadsheet,
          range: sheetName,
        })
      }
    },
    [linkedSpreadsheet, localWorkbook, onLinkSpreadsheet],
  )

  const handleRangeChange = useCallback(
    (nextRange: string) => {
      setCanvasRange(nextRange)
      if (linkedSpreadsheet?.source === 'google') {
        onLinkSpreadsheet({ ...linkedSpreadsheet, range: nextRange })
      }
    },
    [linkedSpreadsheet, onLinkSpreadsheet],
  )

  const handleDisconnect = useCallback(() => {
    setLocalWorkbook(null)
    setActiveSheetName('')
    setPreview(null)
    onLinkSpreadsheet(null)
  }, [onLinkSpreadsheet])

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-0">
      <div className="shrink-0 overflow-y-auto lg:w-[min(100%,400px)] lg:max-w-[36%] lg:border-r lg:border-[#edebe9] dark:lg:border-stone-800">
        <div className="px-4 pb-8 pt-4 text-[13px] md:px-5 md:pt-3">
          <AiSheetsHero compact />

          <AiSheetsPromptSection
            ref={promptSectionRef}
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            profileReady={profileReady}
            selectedModel={selectedModel}
            versionRows={versionRows}
            modelSaving={modelSaving}
            onModelChange={onModelChange}
            linkedSpreadsheet={linkedSpreadsheet}
            onClearLinkedSpreadsheet={handleDisconnect}
          />

          <div>
            <p className="mb-2 text-[13px] font-medium text-fg-subtle">
              빠른 시작
            </p>
            <div className="flex flex-wrap gap-2">
              {starterChips.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => onStarterClick(starter.prompt)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-muted transition hover:border-orange-300 hover:bg-brand-soft/80"
                >
                  {starter.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-[480px] min-w-0 flex-1 flex-col p-0 lg:min-h-0">
        <SheetsGlobalCanvas
          linkedSpreadsheetId={
            isLocalFile ? null : linkedSpreadsheet?.spreadsheetId
          }
          linkedSpreadsheetUrl={linkedSpreadsheet?.spreadsheetUrl}
          linkedFileName={
            isLocalFile ? linkedSpreadsheet?.fileName ?? null : null
          }
          isLocalFile={isLocalFile}
          range={canvasRange}
          sheetNames={localWorkbook?.sheetNames ?? []}
          activeSheetName={activeSheetName || localWorkbook?.sheetNames[0]}
          onRangeChange={handleRangeChange}
          onConnectUrl={handleConnectFromCanvas}
          onOpenLocalFile={handleOpenLocalFile}
          onSheetChange={handleSheetChange}
          onDisconnect={handleDisconnect}
          onRefresh={() => {
            if (linkedSpreadsheet?.spreadsheetId && !isLocalFile) {
              loadGooglePreview(linkedSpreadsheet.spreadsheetId, canvasRange)
            }
          }}
          onSendSelectionToChat={(text) => {
            onDraftChange(draft.trim() ? `${draft.trim()}\n\n${text}` : text)
            promptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }}
          preview={preview}
          previewLoading={previewLoading}
        />
      </div>
    </div>
  )
}
