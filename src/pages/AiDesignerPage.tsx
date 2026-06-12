import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { AiDesignerCategoryBar } from '../components/ai-designer/AiDesignerCategoryBar'
import { AiDesignerGallery } from '../components/ai-designer/AiDesignerGallery'
import { useAuth } from '../components/auth/useAuth'
import { ChatInput, type ChatSendPayload } from '../components/chat/ChatInput'
import { ModelSelectRow } from '../components/chat/ChatStartHub'
import { AccountHeaderActions } from '../components/layout/AccountHeaderActions'
import { useAppUi } from '../contexts/AppUiContext'
import {
  AI_DESIGNER_CATEGORIES,
  buildDesignerPrompt,
  getDesignerCategory,
  type AiDesignerCategoryId,
} from '../data/ai-designer-catalog'
import { writeAiDesignerBootstrap } from '../lib/ai-designer-bootstrap'
import { rememberLastPrivateThread } from '../lib/private-chat-storage'
import { supabase } from '../lib/supabase'
import {
  buildModelSelectOptions,
  fetchActiveTextAiModels,
  filterActiveTextModels,
} from '../services/ai/ai-models-client'

export function AiDesignerPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { openSettings } = useAppUi()
  const chatInputRef = useRef<ComponentRef<typeof ChatInput>>(null)

  const [activeCategory, setActiveCategory] = useState<AiDesignerCategoryId>('chat')
  const [draft, setDraft] = useState('')
  const [selectedModel, setSelectedModel] = useState('auto')
  const [modelSaving, setModelSaving] = useState(false)
  const [registryModels, setRegistryModels] = useState<
    Awaited<ReturnType<typeof fetchActiveTextAiModels>>
  >([])

  useEffect(() => {
    let cancelled = false
    void fetchActiveTextAiModels()
      .then((rows) => {
        if (!cancelled) setRegistryModels(filterActiveTextModels(rows))
      })
      .catch(() => {
        if (!cancelled) setRegistryModels([])
      })
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

  const userGreetingName = profile?.name?.trim() || profile?.email?.split('@')[0] || '사용자'

  const launchDesigner = useCallback(
    (rawTopic: string, categoryId: AiDesignerCategoryId, autoSend: boolean) => {
      const category = getDesignerCategory(categoryId)
      const prompt = buildDesignerPrompt(categoryId, rawTopic)
      const useImageGeneration = categoryId !== 'chat'
      const threadId = crypto.randomUUID()

      writeAiDesignerBootstrap(threadId, {
        categoryId,
        categoryLabel: category.label,
        prompt,
        selectedModel,
        autoSend,
        useImageGeneration,
      })

      rememberLastPrivateThread(threadId)
      navigate(`/chat/${threadId}`)
    },
    [navigate, selectedModel],
  )

  function handleSend(payload: ChatSendPayload) {
    const text = payload.text.trim()
    if (!text) return
    launchDesigner(text, activeCategory, true)
  }

  function handleCategoryPick(id: AiDesignerCategoryId) {
    setActiveCategory(id)
    const category = getDesignerCategory(id)
    if (id !== 'chat') {
      setDraft(category.promptSeed)
      queueMicrotask(() => chatInputRef.current?.focusField())
    }
  }

  async function handleModelChange(nextModel: string) {
    setSelectedModel(nextModel)
    const userId = profile?.id
    if (!userId) return
    setModelSaving(true)
    try {
      await supabase.from('users').update({ preferred_ai: nextModel }).eq('id', userId)
    } finally {
      setModelSaving(false)
    }
  }

  const placeholder =
    activeCategory === 'chat'
      ? '디자인 아이디어·수정 요청을 입력하세요.'
      : `${getDesignerCategory(activeCategory).label} 디자인 설명을 입력하세요.`

  return (
    <div className="main-inner chat-agent flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAF9F6] dark:bg-stone-950">
      <header className="hidden shrink-0 items-center gap-1 border-b border-stone-200/90 bg-[#FAF9F6]/95 px-2 py-1 backdrop-blur-md dark:border-stone-800/60 dark:bg-[#050508]/55 md:flex md:px-3 md:py-1.5">
        <h1 className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-left text-[14px] font-semibold leading-none tracking-tight text-stone-900 transition hover:text-orange-800 dark:text-stone-50 dark:hover:text-orange-200"
            aria-label="홈 · 새 채팅"
          >
            NH-AX-HUB
          </button>
        </h1>
        <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[14px] font-semibold text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
          AI Designer
        </span>
        <AccountHeaderActions onOpenSettings={openSettings} onSignOut={signOut} />
      </header>

      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aria-label="AI Designer"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent gemini-zero-dark-bg text-stone-900 dark:text-stone-100">
          {!draft.trim() ? (
            <div className="mx-auto w-full max-w-3xl px-4 pt-6 text-center md:pt-10">
              <p className="text-[14px] font-medium text-stone-800 dark:text-stone-100">
                {userGreetingName}님, 안녕하세요
              </p>
              <p className="mt-2 text-[14px] text-stone-500 dark:text-stone-400">
                어떤 디자인을 만들어 드릴까요?
              </p>
            </div>
          ) : null}

          <AiDesignerCategoryBar
            categories={AI_DESIGNER_CATEGORIES}
            activeId={activeCategory}
            onSelect={handleCategoryPick}
          />

          <div className="main-content mx-auto w-full max-w-6xl">
            <AiDesignerGallery
              categories={AI_DESIGNER_CATEGORIES}
              activeId={activeCategory}
              onSelect={handleCategoryPick}
            />
          </div>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 shrink-0 border-t border-stone-200/90 bg-[#FAF9F6]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md gemini-zero-dark-composer dark:border-stone-800/80 md:pointer-events-auto md:relative md:inset-x-auto md:bottom-auto md:z-0 md:bg-transparent md:px-6 md:pb-4 md:pt-2 md:backdrop-blur-none">
          <div className="pointer-events-auto">
            <ChatInput
              ref={chatInputRef}
              value={draft}
              onChange={setDraft}
              onSend={handleSend}
              disabled={!profile}
              allowSend={Boolean(profile)}
              variant="gemini"
              placeholder={placeholder}
              belowInputRow={
                <ModelSelectRow
                  selectedModel={selectedModel}
                  modelVersionSelectId="ai-designer-model-version-select"
                  versionRows={versionRows}
                  modelSaving={modelSaving}
                  profileReady={Boolean(profile)}
                  onModelChange={(id) => void handleModelChange(id)}
                />
              }
            />
          </div>
        </div>
      </section>
    </div>
  )
}
