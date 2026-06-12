import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AddMyTemplateCard } from '../components/ai-slides/AddMyTemplateCard'
import { AiSlidesPromptSection } from '../components/ai-slides/AiSlidesPromptSection'
import {
  AiSlidesTabNavigation,
  AiSlidesTabPanel,
  type AiSlidesTabId,
} from '../components/ai-slides/AiSlidesTabNavigation'
import { SlideTemplateScreenshot } from '../components/ai-slides/SlideTemplateScreenshot'
import { useAuth } from '../components/auth/useAuth'
import type { ChatSendPayload } from '../components/chat/ChatInput'
import {
  AI_SLIDES_STYLE_FILTERS,
  AI_SLIDES_TEMPLATES,
  AI_SLIDES_THEME_FILTERS,
  buildAiSlidesPrompt,
  type AiSlidesAspectRatio,
  type AiSlidesGuideMode,
  type AiSlidesImageEngine,
  type AiSlidesSortKey,
  type AiSlidesStyleMode,
  type AiSlidesTemplate,
} from '../data/ai-slides-catalog'
import { writeAiSlidesBootstrap } from '../lib/ai-slides-bootstrap'
import {
  customTemplateToSlidesTemplate,
  readCustomAiSlidesTemplates,
  saveCustomAiSlidesTemplate,
} from '../lib/ai-slides-custom-templates'
import { rememberLastPrivateThread } from '../lib/private-chat-storage'
import { supabase } from '../lib/supabase'
import {
  buildModelSelectOptions,
  fetchActiveTextAiModels,
  filterActiveTextModels,
} from '../services/ai/ai-models-client'

type ExploreTab = AiSlidesTabId

const selectCls =
  'rounded-lg border border-stone-300/90 bg-white px-2.5 py-1.5 text-[13px] text-stone-800 outline-none focus:ring-2 focus:ring-orange-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100'

function TemplateCard({
  template,
  selected,
  onSelect,
  onApply,
  applying,
}: {
  template: AiSlidesTemplate
  selected: boolean
  onSelect: () => void
  onApply: () => void
  applying: boolean
}) {
  return (
    <article className="break-inside-avoid">
      <div
        className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-stone-900 ${
          selected
            ? 'border-orange-500 ring-2 ring-orange-500/30 dark:border-orange-500'
            : 'border-stone-200/90 hover:border-stone-300 hover:shadow-md dark:border-stone-700 dark:hover:border-stone-600'
        }`}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <button
            type="button"
            className="block h-full w-full text-left"
            onClick={onSelect}
          >
            {template.thumbnailUrl ? (
              <img
                src={template.thumbnailUrl}
                alt={template.titleKo}
                className="template-screenshot h-full w-full object-cover object-top"
                loading="lazy"
              />
            ) : (
              <SlideTemplateScreenshot template={template} fillParent />
            )}
          </button>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/20 via-transparent to-transparent p-3">
            <button
              type="button"
              disabled={applying}
              onClick={(event) => {
                event.stopPropagation()
                onApply()
              }}
              className="pointer-events-auto h-8 rounded-lg bg-orange-800 px-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900 dark:hover:bg-orange-950"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function AiSlidesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [styleMode, setStyleMode] = useState<AiSlidesStyleMode>('professional')
  const [imageEngine, setImageEngine] =
    useState<AiSlidesImageEngine>('gemini-image')
  const [aspectRatio, setAspectRatio] = useState<AiSlidesAspectRatio>('auto')
  const [guideMode, setGuideMode] = useState<AiSlidesGuideMode>('standard')
  const [exploreTab, setExploreTab] = useState<ExploreTab>('explore')
  const [styleFilter, setStyleFilter] =
    useState<(typeof AI_SLIDES_STYLE_FILTERS)[number]['id']>('all')
  const [themeFilter, setThemeFilter] =
    useState<(typeof AI_SLIDES_THEME_FILTERS)[number]['id']>('all')
  const [sortKey, setSortKey] = useState<AiSlidesSortKey>('popularity')
  const [koreanOnly, setKoreanOnly] = useState(true)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [customTemplates, setCustomTemplates] = useState(() =>
    readCustomAiSlidesTemplates(),
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(
    null,
  )
  const promptSectionRef = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState('')
  const [selectedModel, setSelectedModel] = useState('auto')
  const [modelSaving, setModelSaving] = useState(false)
  const [registryModels, setRegistryModels] = useState<
    import('../types/ai-models').AiModelRow[]
  >([])

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

  const allTemplates = useMemo(() => {
    const custom = customTemplates.map(customTemplateToSlidesTemplate)
    return [...custom, ...AI_SLIDES_TEMPLATES]
  }, [customTemplates])

  const selectedTemplate = useMemo(
    () => allTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [allTemplates, selectedTemplateId],
  )

  const appliedTemplate = useMemo(
    () => allTemplates.find((t) => t.id === appliedTemplateId) ?? null,
    [allTemplates, appliedTemplateId],
  )

  const filteredTemplates = useMemo(() => {
    let list = AI_SLIDES_TEMPLATES.filter((t) => t.styleModes.includes(styleMode))

    if (styleFilter !== 'all') {
      list = list.filter((t) => t.style === styleFilter)
    }
    if (themeFilter !== 'all') {
      list = list.filter((t) => t.theme === themeFilter)
    }
    if (koreanOnly) {
      list = list.filter((t) => t.koreanOnly !== false)
    }

    list = [...list].sort((a, b) => {
      if (sortKey === 'newest') {
        return Number(b.isNew) - Number(a.isNew) || b.popularity - a.popularity
      }
      return b.popularity - a.popularity
    })

    return list
  }, [styleMode, styleFilter, themeFilter, koreanOnly, sortKey])

  const myTemplates = useMemo(
    () => customTemplates.map(customTemplateToSlidesTemplate),
    [customTemplates],
  )

  const launchSlides = useCallback(
    (template: AiSlidesTemplate, topic: string, autoSend: boolean) => {
      setApplyingId(template.id)
      const threadId = crypto.randomUUID()
      const prompt = buildAiSlidesPrompt(template, {
        styleMode,
        guideMode,
        aspectRatio,
        imageEngine,
        topic,
      })

      writeAiSlidesBootstrap(threadId, {
        templateId: template.id,
        templateTitle: template.titleKo,
        styleMode,
        guideMode,
        aspectRatio,
        imageEngine,
        prompt,
        selectedModel,
        autoSend,
      })
      rememberLastPrivateThread(threadId)
      navigate(`/chat/${threadId}`)
    },
    [
      aspectRatio,
      guideMode,
      imageEngine,
      navigate,
      selectedModel,
      styleMode,
    ],
  )

  function handleApply(template: AiSlidesTemplate) {
    setSelectedTemplateId(template.id)
    setAppliedTemplateId(template.id)
    queueMicrotask(() => {
      promptSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function handleSend(payload: ChatSendPayload) {
    const template = appliedTemplate ?? selectedTemplate
    if (!template) {
      window.alert('템플릿에서 Apply를 눌러 선택해 주세요.')
      return
    }
    launchSlides(template, payload.text, true)
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

  function handleAddCustomTemplate(file: File) {
    if (!file.type.startsWith('image/')) {
      window.alert('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      window.alert('2MB 이하 이미지를 사용해 주세요.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'My Template'
      const entry = {
        id: `custom-${crypto.randomUUID()}`,
        title: baseName,
        thumbnailDataUrl: dataUrl,
        createdAt: new Date().toISOString(),
      }
      saveCustomAiSlidesTemplate(entry)
      setCustomTemplates(readCustomAiSlidesTemplates())
      setSelectedTemplateId(entry.id)
      setExploreTab('my-templates')
    }
    reader.readAsDataURL(file)
  }

  function renderTemplateWaterfall(templates: AiSlidesTemplate[]) {
    return (
      <div className="waterfall-container">
        <div className="template-waterfall columns-1 gap-4 sm:columns-2 lg:columns-3">
          <div className="mb-4 break-inside-avoid">
            <AddMyTemplateCard onAdd={handleAddCustomTemplate} />
          </div>
          {templates.map((template) => (
            <div key={template.id} className="mb-4 break-inside-avoid">
              <TemplateCard
                template={template}
                selected={selectedTemplateId === template.id}
                onSelect={() => setSelectedTemplateId(template.id)}
                onApply={() => handleApply(template)}
                applying={applyingId === template.id}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#FAF9F6] dark:bg-stone-950">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 text-[13px] md:px-8 md:pt-[4vh]">
        <header className="mb-4">
          <p className="font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-300">
            NH-AX-HUB
          </p>
          <h1 className="mt-1 font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            AI Slides
          </h1>
        </header>

        <AiSlidesPromptSection
          ref={promptSectionRef}
          styleMode={styleMode}
          onStyleModeChange={setStyleMode}
          imageEngine={imageEngine}
          onImageEngineChange={setImageEngine}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          guideMode={guideMode}
          onGuideModeChange={setGuideMode}
          appliedTemplate={appliedTemplate}
          onClearAppliedTemplate={() => setAppliedTemplateId(null)}
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          profileReady={Boolean(profile)}
          selectedModel={selectedModel}
          versionRows={versionRows}
          modelSaving={modelSaving}
          onModelChange={(id) => void handleModelChange(id)}
        />

        <AiSlidesTabNavigation
          value={exploreTab}
          onChange={setExploreTab}
          myTemplatesCount={myTemplates.length}
        />

        <AiSlidesTabPanel tabId="explore" activeTab={exploreTab}>
          <div className="explore-content">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
              <select
                value={styleFilter}
                onChange={(e) =>
                  setStyleFilter(
                    e.target.value as (typeof AI_SLIDES_STYLE_FILTERS)[number]['id'],
                  )
                }
                className={selectCls}
                aria-label="스타일 필터"
              >
                {AI_SLIDES_STYLE_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={themeFilter}
                onChange={(e) =>
                  setThemeFilter(
                    e.target.value as (typeof AI_SLIDES_THEME_FILTERS)[number]['id'],
                  )
                }
                className={selectCls}
                aria-label="테마 필터"
              >
                {AI_SLIDES_THEME_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as AiSlidesSortKey)}
                className={selectCls}
                aria-label="정렬"
              >
                <option value="popularity">Sort by: Popularity</option>
                <option value="newest">Sort by: Newest</option>
              </select>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300/90 bg-white px-2.5 py-1.5 text-[13px] text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200">
                <input
                  type="checkbox"
                  checked={koreanOnly}
                  onChange={(e) => setKoreanOnly(e.target.checked)}
                  className="rounded border-stone-400"
                />
                My language only
              </label>
            </div>

            {renderTemplateWaterfall(filteredTemplates)}

            {filteredTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center dark:border-stone-600 dark:bg-stone-900/40">
                <p className="text-[13px] text-stone-600 dark:text-stone-400">
                  선택한 필터에 맞는 템플릿이 없습니다.
                </p>
              </div>
            ) : null}
          </div>
        </AiSlidesTabPanel>

        <AiSlidesTabPanel tabId="my-templates" activeTab={exploreTab}>
          <div className="explore-content">
            {renderTemplateWaterfall(myTemplates)}

            {myTemplates.length === 0 ? (
              <p className="mt-2 text-center text-[13px] text-stone-500 dark:text-stone-400">
                Add My Template 카드에서 썸네일을 업로드하면 My Templates에 표시됩니다.
              </p>
            ) : null}
          </div>
        </AiSlidesTabPanel>
      </div>
    </div>
  )
}
