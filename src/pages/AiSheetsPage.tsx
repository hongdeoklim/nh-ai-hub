import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AiSheetsLandingLayout } from '../components/ai-sheets/AiSheetsLandingLayout'
import {
  type LinkedSpreadsheet,
} from '../components/ai-sheets/AiSheetsPromptSection'
import { useAuth } from '../components/auth/useAuth'
import type { ChatSendPayload } from '../components/chat/ChatInput'
import { AI_SHEETS_STARTERS } from '../data/ai-sheets-starters'
import { writeAiSheetsContext } from '../lib/ai-sheets-context'
import {
  buildAiSheetsAgentPrompt,
  writeAiSheetsBootstrap,
} from '../lib/ai-sheets-bootstrap'
import { parseSheetsPromptInput } from '../lib/google-sheets-url'
import { rememberLastPrivateThread } from '../lib/private-chat-storage'
import { supabase } from '../lib/supabase'
import type { GoogleSpreadsheetReadResult } from '../services/ai/google-sheets-preview'
import {
  buildModelSelectOptions,
  fetchActiveTextAiModels,
  filterActiveTextModels,
} from '../services/ai/ai-models-client'
import type { AiModelRow } from '../types/ai-models'

export function AiSheetsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const promptSectionRef = useRef<HTMLElement>(null)

  const [draft, setDraft] = useState('')
  const [linkedSpreadsheet, setLinkedSpreadsheet] =
    useState<LinkedSpreadsheet | null>(null)
  const [sheetPreview, setSheetPreview] =
    useState<GoogleSpreadsheetReadResult | null>(null)
  const [selectedModel, setSelectedModel] = useState('auto')
  const [modelSaving, setModelSaving] = useState(false)
  const [registryModels, setRegistryModels] = useState<AiModelRow[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchActiveTextAiModels()
        if (!cancelled) {
          setRegistryModels(filterActiveTextModels(rows))
        }
      } catch {
        if (!cancelled) setRegistryModels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const preferred = profile?.preferred_ai?.trim()
    if (preferred) setSelectedModel(preferred)
  }, [profile?.preferred_ai])

  const versionRows = useMemo(
    () => buildModelSelectOptions(registryModels, selectedModel),
    [registryModels, selectedModel],
  )

  const syncLinkedSheetFromDraft = useCallback((text: string) => {
    const parsed = parseSheetsPromptInput(text)
    setLinkedSpreadsheet((current) => {
      if (parsed.spreadsheetId) {
        return {
          spreadsheetId: parsed.spreadsheetId,
          spreadsheetUrl: parsed.spreadsheetUrl,
          range: parsed.range,
          source: 'google',
        }
      }
      if (current?.source === 'local') return current
      return null
    })
  }, [])

  function handleDraftChange(value: string) {
    setDraft(value)
    syncLinkedSheetFromDraft(value)
  }

  const launchSheets = useCallback(
    (rawTopic: string, autoSend: boolean) => {
      const parsed = parseSheetsPromptInput(rawTopic)
      const topic = parsed.userMessage || rawTopic.trim()
      const spreadsheetId =
        linkedSpreadsheet?.spreadsheetId ?? parsed.spreadsheetId ?? undefined
      const range = linkedSpreadsheet?.range ?? parsed.range
      const spreadsheetUrl =
        linkedSpreadsheet?.spreadsheetUrl ?? parsed.spreadsheetUrl ?? undefined

      const threadId = crypto.randomUUID()
      const prompt = buildAiSheetsAgentPrompt(topic, {
        spreadsheetId,
        range,
      })

      writeAiSheetsBootstrap(threadId, {
        prompt,
        selectedModel,
        autoSend,
        spreadsheetId,
        range,
        spreadsheetUrl,
      })

      if (spreadsheetId) {
        writeAiSheetsContext(threadId, {
          spreadsheetId,
          range,
          spreadsheetUrl,
          fileName: linkedSpreadsheet?.fileName,
          source: linkedSpreadsheet?.source,
          title:
            linkedSpreadsheet?.source === 'local'
              ? linkedSpreadsheet.fileName
              : undefined,
          preview: sheetPreview
            ? {
                ok: sheetPreview.ok,
                headers: sheetPreview.headers,
                rows: sheetPreview.rows,
                matrix: sheetPreview.matrix,
                rowCount: sheetPreview.rowCount,
                columnCount: sheetPreview.columnCount,
                error: sheetPreview.error,
                message: sheetPreview.message,
                source: sheetPreview.source,
              }
            : null,
        })
      }

      rememberLastPrivateThread(threadId)
      navigate(`/chat/${threadId}`)
    },
    [linkedSpreadsheet, navigate, selectedModel, sheetPreview],
  )

  function handleSend(payload: ChatSendPayload) {
    const text = payload.text.trim()
    if (!text) return
    launchSheets(text, true)
  }

  async function handleModelChange(nextModel: string) {
    setSelectedModel(nextModel)
    const userId = profile?.id
    if (!userId) return
    setModelSaving(true)
    try {
      await supabase
        .from('users')
        .update({ preferred_ai: nextModel })
        .eq('id', userId)
    } finally {
      setModelSaving(false)
    }
  }

  function handleStarterClick(prompt: string) {
    setDraft(prompt)
    syncLinkedSheetFromDraft(prompt)
    queueMicrotask(() => {
      promptSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function handleLinkSpreadsheet(link: LinkedSpreadsheet | null) {
    setLinkedSpreadsheet(link)
    if (!link) {
      setSheetPreview(null)
      setDraft((current) => {
        const parsed = parseSheetsPromptInput(current)
        return parsed.userMessage
      })
    }
  }

  const starterChips = useMemo(() => AI_SHEETS_STARTERS, [])

  return (
    <div className="main-inner sheets-agent-new chat-agent flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAF9F6] dark:bg-stone-950">
      <AiSheetsLandingLayout
        draft={draft}
        onDraftChange={handleDraftChange}
        onSend={handleSend}
        profileReady={Boolean(profile)}
        selectedModel={selectedModel}
        versionRows={versionRows}
        modelSaving={modelSaving}
        onModelChange={(id) => void handleModelChange(id)}
        linkedSpreadsheet={linkedSpreadsheet}
        onLinkSpreadsheet={handleLinkSpreadsheet}
        onPreviewChange={setSheetPreview}
        starterChips={starterChips}
        onStarterClick={handleStarterClick}
        promptSectionRef={promptSectionRef}
      />
    </div>
  )
}
