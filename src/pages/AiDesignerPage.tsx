import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { AiDesignerCategoryBar } from '../components/ai-designer/AiDesignerCategoryBar'
import { AiDesignerGallery } from '../components/ai-designer/AiDesignerGallery'
import { useAuth } from '../components/auth/useAuth'
import { ChatInput, type ChatSendPayload } from '../components/chat/ChatInput'
import { ModelSelectRow } from '../components/chat/ChatStartHub'
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
  const { profile } = useAuth()
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

  // 프로필의 선호 모델이 정해지거나 바뀌면 선택값에 반영한다 (렌더 중 조정)
  const profilePreferredAi = profile?.preferred_ai?.trim() ?? ''
  const [syncedPreferredAi, setSyncedPreferredAi] = useState('')
  if (profilePreferredAi !== syncedPreferredAi) {
    setSyncedPreferredAi(profilePreferredAi)
    if (profilePreferredAi) setSelectedModel(profilePreferredAi)
  }

  const versionRows = useMemo(
    () => buildModelSelectOptions(registryModels, selectedModel),
    [registryModels, selectedModel],
  )

  const userGreetingName = profile?.display_name?.trim() || profile?.email?.split('@')[0] || '사용자'

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
    <div className="main-inner chat-agent flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">

      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aria-label="AI Designer"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent gemini-zero-dark-bg text-fg">
          {!draft.trim() ? (
            <div className="mx-auto w-full max-w-3xl px-4 pt-8 text-center md:pt-12">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
                <span aria-hidden>✦</span> AI Designer
              </span>
              <h2 className="mt-4 text-[24px] font-bold leading-tight tracking-tight text-fg md:text-[32px]">
                {userGreetingName}님, 안녕하세요
              </h2>
              <p className="mt-2 text-[14px] text-fg-subtle md:text-[16px]">
                아래에서 유형을 고르거나, 만들고 싶은 디자인을 바로 설명해 주세요.
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

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 shrink-0 border-t border-border/90 bg-bg px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md gemini-zero-dark-composer md:pointer-events-auto md:relative md:inset-x-auto md:bottom-auto md:z-0 md:bg-transparent md:px-6 md:pb-4 md:pt-2 md:backdrop-blur-none">
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
