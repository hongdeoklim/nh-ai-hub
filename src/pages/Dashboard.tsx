import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AiSheetsSplitLayout } from '../components/ai-sheets/AiSheetsSplitLayout'
import { useAuth } from '../components/auth/useAuth'
import { ChatArea, type ChatBubble } from '../components/chat/ChatArea'
import { ChatArtifactLayout } from '../components/chat/ChatArtifactLayout'
import { GeminiChatBackground } from '../components/chat/GeminiChatBackground'
import { ChatArtifactProvider, useChatArtifact } from '../store/chat-artifact'
import {
  ChatInput,
  type ChatInputHandle,
  type ChatSendPayload,
} from '../components/chat/ChatInput'
import { ChatStartHub, ModelSelectRow } from '../components/chat/ChatStartHub'
import {
  PromptLibraryPanel,
  type ApplyPromptMeta,
} from '../components/prompts/PromptLibraryPanel'
import { PromptLibraryMagnetSheet } from '../components/prompts/PromptLibraryMagnetSheet'
import { TokenRequestModal } from '../components/settings/TokenRequestModal'
import { AccountHeaderActions } from '../components/layout/AccountHeaderActions'
import { useAppUi } from '../contexts/AppUiContext'
import {
  routePromptToModelId,
  seedOrgPromptRoutesFromCatalog,
  upsertOrgPromptRoute,
} from '../lib/auto-model-route'
import {
  isPrivateChatThreadDeleted,
  isValidPrivateChatThreadId,
  loadPrivateChatState,
  PRIVATE_CHAT_STORAGE_UPDATED_EVENT,
  rememberLastPrivateThread,
  savePrivateChatState,
} from '../lib/private-chat-storage'
import { supabase } from '../lib/supabase'
import { invokeCreativeGenerate } from '../services/ai/invoke-creative'
import { invokeMediaRouter } from '../services/ai/invoke-media-router'
import { invokeDeepResearch } from '../services/ai/deep-research-client'
import { invokeAiChat } from '../services/ai/invoke-chat'
import {
  buildModelSelectOptions,
  fetchActiveMediaAiModels,
  fetchActiveTextAiModels,
  filterActiveMediaModels,
  filterActiveTextModels,
  subscribeAiModelsChanges,
} from '../services/ai/ai-models-client'
import { extractHtmlArtifactBlock } from '../lib/extract-html-artifact'
import { sortChatBubblesChronologically } from '../lib/chat-message-time'
import { buildMessagesForApi } from '../lib/chat-history-for-api'
import { formatModelDisplayName } from '../utils/format-model-display-name'
import { splitThinkingStream } from '../utils/thinking-content'
import {
  getComposerToolMeta,
  type ComposerToolMode,
} from '../types/composer-tools'
import {
  cancelPrivateChatDbSync,
  schedulePrivateChatDbSync,
} from '../services/chat/private-chat-sync'
import { ensurePrivateChatsHydrated } from '../services/chat/private-chat-remote'
import {
  createPrivatePrompt,
  deleteMyPrompt,
  fetchMyPrivatePrompts,
  fetchPublicPrompts,
} from '../services/prompts/saved-prompts'
import { insertBookmarkedChat } from '../services/scrapbook/bookmarked-chats'
import {
  fetchActivePromptTemplates,
  filterTemplatesForUserDepartment,
  promptTemplateRowToOrgItem,
} from '../services/prompts/prompt-templates'
import type { PromptTemplateRow } from '../types/prompt-templates'
import type {
  AiModelProvider,
  AiModelRow,
  AiProviderPreference,
} from '../types/ai-models'
import { extractGoogleDriveFileId } from '../lib/google-drive-url'
import {
  clearAiSlidesBootstrap,
  readAiSlidesBootstrap,
} from '../lib/ai-slides-bootstrap'
import {
  clearWorkflowBootstrap,
  readWorkflowBootstrap,
} from '../lib/workflow-bootstrap'
import {
  clearAiDesignerBootstrap,
  readAiDesignerBootstrap,
} from '../lib/ai-designer-bootstrap'
import {
  clearAiSheetsBootstrap,
  readAiSheetsBootstrap,
} from '../lib/ai-sheets-bootstrap'
import {
  readAiSheetsContext,
  updateAiSheetsContextPreview,
  writeAiSheetsContext,
  type AiSheetsThreadContext,
} from '../lib/ai-sheets-context'
import {
  clearReferenceBootstrap,
  readReferenceBootstrap,
} from '../lib/reference-chat-bootstrap'
import {
  fetchHiddenOrgPromptIds,
  hideOrgPromptForUser,
} from '../services/prompts/hidden-org-prompts'
import { fetchGoogleIntegrationStatus } from '../services/integrations/google-integration'
import {
  fetchGoogleSheetPreview,
  type GoogleSpreadsheetReadResult,
} from '../services/ai/google-sheets-preview'
import { exportDriveFileForChat } from '../services/reference-room/export-drive-for-chat'
import type { SavedPromptRow } from '../types/prompts'

type AiManualProviderId = Exclude<AiModelProvider, 'openrouter'>

const MANUAL_PROVIDER_ORDER: AiManualProviderId[] = [
  'google',
  'openai',
  'anthropic',
  'deepseek',
  'hermes',
]

type FallbackModelEntry = {
  id: string
  label: string
  hint: string
  costInfo: string
  description: string
}

const AI_MODELS_BY_PROVIDER: Record<
  AiManualProviderId,
  readonly FallbackModelEntry[]
> = {
  deepseek: [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek Chat',
      hint: '반복 처리, 요약 및 비용 효율적인 일반 업무',
      costInfo: '낮음',
      description: '반복 처리, 요약 및 비용 효율적인 일반 업무에 적합합니다.',
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      hint: '수학, 분석 및 단계적 추론',
      costInfo: '보통',
      description: '복잡한 계산과 단계적 추론 작업에 적합합니다.',
    },
  ],
  hermes: [
    {
      id: 'hermes-default',
      label: 'Hermes',
      hint: '회사 내부 특화 업무 및 배치 처리',
      costInfo: '낮음',
      description: '관리자가 구성한 Hermes API의 기본 모델을 사용합니다.',
    },
  ],
  anthropic: [
    {
      id: 'claude-opus-4-7',
      label: 'Opus 4.7',
      hint: '최상급 추론·에이전트·장문 분석(공식 최신 Opus)',
      costInfo: '높음',
      description: '최상급 추론·에이전트·장문 분석(공식 최신 Opus)',
    },
    {
      id: 'claude-sonnet-4-6',
      label: 'Sonnet 4.6',
      hint: '속도·품질 균형 · 시방·계약·코드 보조에 적합',
      costInfo: '보통',
      description: '속도·품질 균형 · 시방·계약·코드 보조에 적합',
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Haiku 4.5',
      hint: '초저지연·요약·단답형',
      costInfo: '저렴',
      description: '초저지연·요약·단답형',
    },
    {
      id: 'claude-opus-4-5',
      label: 'Opus 4.5 (레거시)',
      hint: '이전 스냅샷 호환 · 필요 시 유지보수용',
      costInfo: '높음',
      description: '이전 스냅샷 호환 · 필요 시 유지보수용',
    },
    {
      id: 'claude-sonnet-4-5',
      label: 'Sonnet 4.5 (레거시)',
      hint: '이전 저장 프로필과 동일 문자열 호환',
      costInfo: '보통',
      description: '이전 저장 프로필과 동일 문자열 호환',
    },
  ],
  openai: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      hint: '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)',
      costInfo: '높음',
      description: '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)',
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      hint: '전문 업무 균형 · 멀틜 유지보수용',
    },
    {
      id: 'claude-sonnet-4-5',
      label: 'Sonnet 4.5 (레거시)',
      hint: '이전 저장 프로필과 동일 문자열 호환',
      costInfo: '보통',
      description: '이전 저장 프로필과 동일 문자열 호환',
    },
  ],
  openai: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      hint: '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)',
      costInfo: '높음',
      description: '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)',
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      hint: '전문 업무 균형 · 멀티모달 텍스트/이미지 입력',
      costInfo: '보통',
      description: '전문 업무 균형 · 멀티모달 텍스트/이미지 입력',
    },
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 mini',
      hint: '고성능 소형 · 대량·빠른 응답',
      costInfo: '저렴',
      description: '고성능 소형 · 대량·빠른 응답',
    },
    {
      id: 'gpt-5.4-nano',
      label: 'GPT-5.4 nano',
      hint: '최저비용 근거·추출·분류 작업에 적합',
      costInfo: '저렴',
      description: '최저비용 근거·추출·분류 작업에 적합',
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      hint: '기존 워크로드·구 API 티어 호환',
      costInfo: '보통',
      description: '기존 워크로드·구 API 티어 호환',
    },
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      hint: '경량 레거시 대안 · 저지연 요약',
      costInfo: '저렴',
      description: '경량 레거시 대안 · 저지연 요약',
    },
    {
      id: 'dall-e-3',
      label: 'DALL-E 3 (이미지 생성)',
      hint: '텍스트 프롬프트를 기반으로 고품질 이미지를 생성합니다.',
      costInfo: '높음',
      description: '텍스트 프롬프트를 기반으로 고품질 이미지를 생성합니다.',
    },
  ],
  google: [
      {
        id: 'dify-ax',
        label: 'Dify Chat (RAG)',
        hint: '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.',
        costInfo: '보통',
        description: '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.',
      },
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview',
      hint: 'Gemini 3 최상급(프리뷰)·도구·멀티모달',
      costInfo: '높음',
      description: 'Gemini 3 최상급(프리뷰)·도구·멀티모달',
    },
    {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash Preview',
      hint: '3세대 속도형(프리뷰)·비용 대비 성능',
      costInfo: '보통',
      description: '3세대 속도형(프리뷰)·비용 대비 성능',
    },
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash‑Lite',
      hint: '3.x 안정·초경량·고빈도 호출용',
      costInfo: '저렴',
      description: '3.x 안정·초경량·고빈도 호출용',
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      hint: '2.5 최상급 추론(안정)',
      costInfo: '보통',
      description: '2.5 최상급 추론(안정)',
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      hint: '이미지·표 포함 일반 업무(안정)',
      costInfo: '보통',
      description: '이미지·표 포함 일반 업무(안정)',
    },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash‑Lite',
      hint: '최저지연 요약·간단 질의',
      costInfo: '저렴',
      description: '최저지연 요약·간단 질의',
    },
  ],
}

function providerForModelId(modelId: string): AiManualProviderId {
  if (modelId.startsWith('claude-')) return 'anthropic'
  if (modelId.startsWith('gemini-')) return 'google'
  if (modelId.startsWith('deepseek-')) return 'deepseek'
  if (modelId.startsWith('hermes-')) return 'hermes'
  return 'openai'
}

function chatInputPlaceholderForModelId(modelId: string): string {
  switch (providerForModelId(modelId)) {
    case 'google':
      return 'Gemini에게 업무 관련 질문을 입력하세요.'
    case 'anthropic':
      return 'Claude에게 업무 관련 질문을 입력하세요.'
    case 'deepseek':
      return 'DeepSeek에게 업무 관련 질문을 입력하세요.'
    case 'hermes':
      return 'Hermes에게 내부 업무 관련 질문을 입력하세요.'
    default:
      return '챗GPT에게 업무 관련 질문을 입력하세요.'
  }
}

function buildAllModelRows(
  selectedModel: string,
  selectedProvider: AiProviderPreference = 'auto',
) {
  const rows: {
    id: string
    label: string
    hint: string
    costInfo: string
    description: string
  }[] = [
    {
      id: 'auto',
      label: '자동 · Gemini 2.5 Flash 기본',
      hint:
        '기본은 Gemini 2.5 Flash입니다. 프롬프트·첨부·길이에 따라 다른 모델로 전환될 수 있습니다.',
      costInfo: '저렴',
      description:
        '기본은 Gemini 2.5 Flash입니다. 프롬프트·첨부·길이에 따라 다른 모델로 전환될 수 있습니다.',
    },
  ]

  for (const provider of MANUAL_PROVIDER_ORDER) {
    if (selectedProvider !== 'auto' && provider !== selectedProvider) continue
    for (const model of AI_MODELS_BY_PROVIDER[provider]) {
      rows.push({
        id: model.id,
        label: model.label,
        hint: model.hint,
        costInfo: model.costInfo,
        description: model.description,
      })
    }
  }

  if (
    selectedModel !== 'auto' &&
    !rows.some((row) => row.id === selectedModel)
  ) {
    rows.splice(1, 0, {
      id: selectedModel,
      label: selectedModel,
      hint: '프로필에 저장된 모델입니다.',
      costInfo: '보통',
      description: '프로필에 저장된 모델입니다.',
    })
  }

  return rows
}

type ReferenceSnippet =
  | { key: string; kind: 'text'; title: string; sourceUrl: string; body: string }
  | { key: string; kind: 'link_only'; title: string; sourceUrl: string }
  | {
      key: string
      kind: 'binary_link'
      title: string
      sourceUrl: string
      mimeType: string
      hint?: string
    }

function buildReferencePromptBlock(snippets: ReferenceSnippet[]): string {
  if (snippets.length === 0) return ''
  const parts = snippets.map((s) => {
    if (s.kind === 'link_only') {
      return `### ${s.title}\n원본 링크: ${s.sourceUrl}`
    }
    if (s.kind === 'text') {
      return `### ${s.title}\n(구글 드라이브에서 추출한 본문)\n\n${s.body}\n\n원본: ${s.sourceUrl}`
    }
    return `### ${s.title}\n유형: ${s.mimeType}${s.hint ? `\n안내: ${s.hint}` : ''}\n원본: ${s.sourceUrl}`
  })
  return parts.join('\n\n---\n\n')
}

type PendingChatTurn = {
  payload: ChatSendPayload
  snippetsSnapshot: ReferenceSnippet[]
  deepResearch: boolean
  internetSearch: boolean
  /** 기존 사용자 메시지 유지, 어시스턴트 답변만 재생성 */
  regenerate?: boolean
}

function scrollChatArea(
  el: HTMLElement | null,
  position: 'top' | 'bottom' | 'lastUserMessage',
  behavior: ScrollBehavior = 'auto',
) {
  if (!el) return
  if (position === 'lastUserMessage') {
    const userNodes = el.querySelectorAll('[data-chat-role="user"]')
    if (userNodes.length > 0) {
      const target = userNodes[userNodes.length - 1] as HTMLElement
      target.scrollIntoView({ behavior, block: 'start' })
      return
    }
    position = 'bottom'
  }
  el.scrollTo({
    top: position === 'bottom' ? el.scrollHeight : 0,
    behavior,
  })
}

/** 표시용 사용자 말풍선 → 재전송 페이로드 */
function userBubbleToSendPayload(msg: ChatBubble): ChatSendPayload {
  let text = msg.content.trim()
  const refOnly =
    /^\[사내 자료실 참조 \d+건\] 첨부 맥락을 반영해 분석해 주세요\.$/
  const imgOnly = /^\[첨부 이미지 \d+장\] 이미지를 분석해 주세요\./

  if (refOnly.test(text)) {
    text = ''
  } else if (imgOnly.test(text)) {
    text = ''
  } else {
    text = text
      .replace(/\n\n\[사내 자료실·드라이브 참조 \d+건\]/g, '')
      .replace(/\n\n\[첨부 이미지 \d+장\]/g, '')
      .trim()
  }

  const previewUrl = msg.attachmentPreviews?.[0]
  if (previewUrl?.startsWith('data:')) {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(previewUrl)
    if (m) {
      return {
        text,
        imageBase64: m[2].replace(/\s/g, ''),
        mimeType: m[1].toLowerCase(),
      }
    }
  }

  const experimental_attachments = msg.attachmentPreviews?.length
    ? msg.attachmentPreviews.map((url) => ({ url }))
    : undefined

  return {
    text,
    experimental_attachments,
  }
}

const DEEP_RESEARCH_LOADING_MESSAGE =
  '🤖 3개의 AI(Claude, GPT, Gemini)가 회의 중입니다... (약 15~30초 소요)'

export function Dashboard() {
  const { profile, profileError, refreshProfile, signOut } = useAuth()
  const {
    registerNewChatHandler,
    registerPromptPanel,
    openSettings,
    requestNewChat,
  } = useAppUi()
  const [selectedModel, setSelectedModel] = useState<string>('auto')
  const [selectedProvider, setSelectedProvider] =
    useState<AiProviderPreference>('auto')
  const [registryModels, setRegistryModels] = useState<AiModelRow[]>([])
  const [registryModelsLoading, setRegistryModelsLoading] = useState(true)
  const [mediaImageModels, setMediaImageModels] = useState<AiModelRow[]>([])
  const [mediaVideoModels, setMediaVideoModels] = useState<AiModelRow[]>([])
  const [mediaEnginesLoading, setMediaEnginesLoading] = useState(true)
  const [modelSaving, setModelSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatBubble[]>([])
  const [isSending, setIsSending] = useState(false)
  const [referenceSnippets, setReferenceSnippets] = useState<ReferenceSnippet[]>(
    [],
  )
  const [referenceBootstrapBusy, setReferenceBootstrapBusy] = useState(false)

  const [publicPrompts, setPublicPrompts] = useState<SavedPromptRow[]>([])
  const [myPrompts, setMyPrompts] = useState<SavedPromptRow[]>([])
  const [promptsLoading, setPromptsLoading] = useState(false)
  const [hiddenOrgPromptIds, setHiddenOrgPromptIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [galleryDismissed, setGalleryDismissed] = useState(false)
  const [orgTemplateRows, setOrgTemplateRows] = useState<PromptTemplateRow[]>(
    [],
  )
  const [orgTemplatesLoading, setOrgTemplatesLoading] = useState(false)
  const orgTemplatesLoadedRef = useRef(false)
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [tokenModalPreset, setTokenModalPreset] = useState<string | undefined>(
    undefined,
  )
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false)
  const [internetSearchEnabled, setInternetSearchEnabled] = useState(false)
  const [composerTool, setComposerTool] = useState<ComposerToolMode | null>(null)
  const { openArtifact } = useChatArtifact()

  const dashboardTokenBudget = useMemo(() => {
    const limit = profile?.token_limit ?? 0
    const used = profile?.current_token_usage ?? 0
    const remaining = Math.max(0, limit - used)
    const pct = limit > 0 ? Math.round((remaining / limit) * 100) : 100
    return { limit, remaining, pct }
  }, [profile?.token_limit, profile?.current_token_usage])

  const modelVersionSelectId = 'dashboard-ai-model-version-select'
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const { threadId } = useParams<{ threadId: string }>()
  const chatInputRef = useRef<ChatInputHandle>(null)
  const chatAreaRef = useRef<HTMLElement>(null)
  const threadIdRef = useRef<string | undefined>(undefined)
  threadIdRef.current = threadId

  const profileRef = useRef(profile)
  profileRef.current = profile
  const selectedModelRef = useRef(selectedModel)
  selectedModelRef.current = selectedModel
  const selectedProviderRef = useRef(selectedProvider)
  selectedProviderRef.current = selectedProvider
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  /** 프로필 refresh 시 사용자가 드롭다운에서 고른 모델을 덮어쓰지 않음 */
  const userHasChosenModelRef = useRef(false)
  const slidesAutoSendPendingRef = useRef<string | null>(null)
  const designerAutoSendPendingRef = useRef<string | null>(null)
  const designerUseImageRef = useRef(false)
  const sheetsAutoSendPendingRef = useRef<string | null>(null)
  const [sheetsAgentContext, setSheetsAgentContext] =
    useState<AiSheetsThreadContext | null>(null)
  const [sheetsPreview, setSheetsPreview] =
    useState<GoogleSpreadsheetReadResult | null>(null)
  const [sheetsPreviewLoading, setSheetsPreviewLoading] = useState(false)
  const [sheetsRange, setSheetsRange] = useState('Sheet1!A1:Z100')

  const sendQueueRef = useRef<PendingChatTurn[]>([])
  const drainRunnerRef = useRef(false)
  const chatAbortRef = useRef<AbortController | null>(null)
  const [queuedAheadCount, setQueuedAheadCount] = useState(0)
  /** 스레드 전환 직전 상태 — useLayoutEffect에서 이전 스레드를 sessionStorage에 먼저 저장 */
  const threadStateSnapshotRef = useRef<{
    threadId: string | undefined
    messages: ChatBubble[]
    draft: string
    galleryDismissed: boolean
  }>({
    threadId: undefined,
    messages: [],
    draft: '',
    galleryDismissed: false,
  })
  /** 스레드 전환 직후 stale messages 로 저장되는 것을 막기 위한 hydration 가드 */
  const hydratedThreadIdRef = useRef<string | undefined>(undefined)
  const scrollAfterHydrateRef = useRef<'top' | 'bottom' | 'lastUserMessage' | null>(null)
  const skipSnapshotSyncRef = useRef(false)
  const promptPanelRegionId = 'dashboard-prompt-library'
  const [promptPanelExpanded, setPromptPanelExpanded] = useState(false)

  useEffect(() => {
    registerPromptPanel({
      expanded: promptPanelExpanded,
      toggle: () => setPromptPanelExpanded((v) => !v),
      regionId: promptPanelRegionId,
    })
    return () => registerPromptPanel(null)
  }, [registerPromptPanel, promptPanelExpanded, promptPanelRegionId])
  const userGreetingName = useMemo(() => {
    const fromDisplay = profile?.display_name?.trim()
    if (fromDisplay) return fromDisplay
    const email = profile?.email?.trim()
    if (email) return email.split('@')[0] ?? email
    return undefined
  }, [profile?.display_name, profile?.email])

  useEffect(() => {
    let cancelled = false

    async function loadRegistryModels() {
      setRegistryModelsLoading(true)
      try {
        const rows = await fetchActiveTextAiModels()
        if (!cancelled) {
          setRegistryModels(filterActiveTextModels(Array.isArray(rows) ? rows : []))
        }
      } catch (err) {
        console.warn('[Dashboard] ai_models 조회 실패 — 하드코딩 목록 폴백', err)
        if (!cancelled) setRegistryModels([])
      } finally {
        if (!cancelled) setRegistryModelsLoading(false)
      }
    }

    void loadRegistryModels()
    const unsubscribe = subscribeAiModelsChanges(() => {
      void loadRegistryModels()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadMediaEngines() {
      setMediaEnginesLoading(true)
      try {
        const [imageRows, videoRows] = await Promise.all([
          fetchActiveMediaAiModels('image'),
          fetchActiveMediaAiModels('video'),
        ])
        if (!cancelled) {
          setMediaImageModels(
            filterActiveMediaModels(
              Array.isArray(imageRows) ? imageRows : [],
              'image',
            ),
          )
          setMediaVideoModels(
            filterActiveMediaModels(
              Array.isArray(videoRows) ? videoRows : [],
              'video',
            ),
          )
        }
      } catch (err) {
        console.warn('[Dashboard] 미디어 ai_models 조회 실패 — 폴백 사용', err)
        if (!cancelled) {
          setMediaImageModels([])
          setMediaVideoModels([])
        }
      } finally {
        if (!cancelled) setMediaEnginesLoading(false)
      }
    }

    void loadMediaEngines()
    const unsubscribe = subscribeAiModelsChanges(() => {
      void loadMediaEngines()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const safeRegistryModels = Array.isArray(registryModels) ? registryModels : []
  const textRegistryModels = useMemo(
    () => filterActiveTextModels(safeRegistryModels),
    [safeRegistryModels],
  )
  const safeMediaImageModels = Array.isArray(mediaImageModels)
    ? filterActiveMediaModels(mediaImageModels, 'image')
    : []
  const safeMediaVideoModels = Array.isArray(mediaVideoModels)
    ? filterActiveMediaModels(mediaVideoModels, 'video')
    : []

  const versionRows = useMemo(() => {
    const providerModels = selectedProvider === 'auto'
      ? textRegistryModels
      : textRegistryModels.filter((model) => model.provider === selectedProvider)
    if (textRegistryModels.length > 0) {
      return buildModelSelectOptions(providerModels, selectedModel)
    }
    return buildAllModelRows(selectedModel, selectedProvider)
  }, [textRegistryModels, selectedModel, selectedProvider])

  const safeVersionRows = Array.isArray(versionRows) ? versionRows : []

  const draftTrimmed = draft.trim()
  const effectiveModelForTokens =
    selectedModel === 'auto'
      ? routePromptToModelId(draftTrimmed, false)
      : selectedModel

  const chatInputPlaceholder = useMemo(() => {
    const toolMeta = getComposerToolMeta(composerTool)
    if (toolMeta) return toolMeta.placeholder
    return chatInputPlaceholderForModelId(
      selectedModel === 'auto' ? effectiveModelForTokens : selectedModel,
    )
  }, [composerTool, selectedModel, effectiveModelForTokens])

  const loadHiddenOrgPrompts = useCallback(async () => {
    if (!profile?.id) {
      startTransition(() => setHiddenOrgPromptIds(new Set()))
      return
    }
    const ids = await fetchHiddenOrgPromptIds(supabase, profile.id)
    startTransition(() => setHiddenOrgPromptIds(ids))
  }, [profile])

  useEffect(() => {
    void loadHiddenOrgPrompts()
  }, [loadHiddenOrgPrompts])

  const loadOrgTemplates = useCallback(async () => {
    if (!profile?.id) {
      orgTemplatesLoadedRef.current = false
      startTransition(() => {
        setOrgTemplateRows([])
        setOrgTemplatesLoading(false)
      })
      return
    }
    const showBlockingLoad = !orgTemplatesLoadedRef.current
    if (showBlockingLoad) {
      startTransition(() => setOrgTemplatesLoading(true))
    }
    try {
      const result = await fetchActivePromptTemplates(supabase)
      if (!result.ok) {
        startTransition(() => setOrgTemplateRows([]))
      } else {
        startTransition(() => setOrgTemplateRows(result.rows))
      }
      orgTemplatesLoadedRef.current = true
    } finally {
      if (showBlockingLoad) {
        startTransition(() => setOrgTemplatesLoading(false))
      }
    }
  }, [profile?.id])

  useEffect(() => {
    void loadOrgTemplates()
  }, [loadOrgTemplates])

  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel('dashboard-prompt-templates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prompt_templates' },
        () => {
          void loadOrgTemplates()
        },
      )
      .subscribe()

    const onFocus = () => {
      void loadOrgTemplates()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [profile?.id, loadOrgTemplates])

  const departmentOrgTemplates = useMemo(() => {
    const scoped = filterTemplatesForUserDepartment(
      orgTemplateRows,
      profile?.department,
    )
    return scoped.map(promptTemplateRowToOrgItem)
  }, [orgTemplateRows, profile?.department])

  const visibleOrgPrompts = useMemo(
    () =>
      departmentOrgTemplates.filter((item) => !hiddenOrgPromptIds.has(item.id)),
    [departmentOrgTemplates, hiddenOrgPromptIds],
  )

  const threadHasUserMessage = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages],
  )

  const showOrgGalleryChrome =
    Boolean(profile) &&
    !galleryDismissed &&
    !threadHasUserMessage

  const showPromptGalleryLoading =
    showOrgGalleryChrome && orgTemplatesLoading

  const showPromptGallery =
    showOrgGalleryChrome &&
    !orgTemplatesLoading &&
    visibleOrgPrompts.length > 0

  const loadPromptLibrary = useCallback(async () => {
    if (!profile?.id) {
      startTransition(() => {
        setPublicPrompts([])
        setMyPrompts([])
      })
      return
    }
    startTransition(() => setPromptsLoading(true))
    try {
      const [pub, mine] = await Promise.all([
        fetchPublicPrompts(supabase),
        fetchMyPrivatePrompts(supabase, profile.id),
      ])
      startTransition(() => {
        setPublicPrompts(pub)
        setMyPrompts(mine)
      })
    } finally {
      startTransition(() => setPromptsLoading(false))
    }
  }, [profile?.id])

  useEffect(() => {
    const preferred = profile?.preferred_ai?.trim()
    if (!preferred || userHasChosenModelRef.current) return
    startTransition(() => setSelectedModel(preferred))
  }, [profile?.preferred_ai])

  useEffect(() => {
    seedOrgPromptRoutesFromCatalog(departmentOrgTemplates)
  }, [departmentOrgTemplates])

  useEffect(() => {
    void loadPromptLibrary()
  }, [loadPromptLibrary])

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) {
      navigate(`/chat/${crypto.randomUUID()}`, { replace: true })
      return
    }
    rememberLastPrivateThread(threadId)
  }, [threadId, navigate])

  useEffect(() => {
    setReferenceSnippets([])
    sendQueueRef.current = []
    setQueuedAheadCount(0)
  }, [threadId])

  // Workflow Bootstrap
  const [activeWorkflowSystemPrompt, setActiveWorkflowSystemPrompt] = useState<string | null>(null)
  const [activeWorkflowTitle, setActiveWorkflowTitle] = useState<string | null>(null)

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    const workflowPayload = readWorkflowBootstrap(threadId)
    if (!workflowPayload) return

    clearWorkflowBootstrap(threadId)
    setActiveWorkflowSystemPrompt(workflowPayload.systemPrompt)
    setActiveWorkflowTitle(workflowPayload.title || '사용자 지정')
  }, [threadId])

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    const slidesPayload = readAiSlidesBootstrap(threadId)
    if (!slidesPayload) return

    clearAiSlidesBootstrap(threadId)
    setComposerTool('canvas')
    setDeepResearchEnabled(false)
    if (slidesPayload.selectedModel?.trim()) {
      userHasChosenModelRef.current = true
      setSelectedModel(slidesPayload.selectedModel.trim())
    }

    if (slidesPayload.autoSend) {
      slidesAutoSendPendingRef.current = slidesPayload.prompt
      setDraft('')
    } else {
      setDraft(slidesPayload.prompt)
      queueMicrotask(() => chatInputRef.current?.focusField())
    }
  }, [threadId])

  useEffect(() => {
    const text = slidesAutoSendPendingRef.current
    if (!text || !profile?.id || !threadId || !isValidPrivateChatThreadId(threadId)) {
      return
    }
    slidesAutoSendPendingRef.current = null
    queueMicrotask(() => {
      handleSend({
        text,
        experimental_attachments: [],
        imageFiles: [],
      })
    })
  }, [threadId, profile?.id])

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    const designerPayload = readAiDesignerBootstrap(threadId)
    if (!designerPayload) return

    clearAiDesignerBootstrap(threadId)
    setDeepResearchEnabled(false)
    if (designerPayload.selectedModel?.trim()) {
      userHasChosenModelRef.current = true
      setSelectedModel(designerPayload.selectedModel.trim())
    }

    if (designerPayload.useImageGeneration) {
      setComposerTool('image')
    }

    if (designerPayload.autoSend) {
      designerAutoSendPendingRef.current = designerPayload.prompt
      designerUseImageRef.current = Boolean(designerPayload.useImageGeneration)
      setDraft('')
    } else {
      setDraft(designerPayload.prompt)
      queueMicrotask(() => chatInputRef.current?.focusField())
    }
  }, [threadId])

  useEffect(() => {
    const text = designerAutoSendPendingRef.current
    if (!text || !profile?.id || !threadId || !isValidPrivateChatThreadId(threadId)) {
      return
    }
    if (designerUseImageRef.current) {
      const engine = safeMediaImageModels[0]?.api_id
      if (!engine || mediaEnginesLoading) return
      designerAutoSendPendingRef.current = null
      designerUseImageRef.current = false
      queueMicrotask(() => {
        void handleMediaGenerate('image', text, engine)
      })
      return
    }
    designerAutoSendPendingRef.current = null
    designerUseImageRef.current = false
    queueMicrotask(() => {
      handleSend({
        text,
        experimental_attachments: [],
        imageFiles: [],
      })
    })
  }, [threadId, profile?.id, safeMediaImageModels, mediaEnginesLoading])

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    const sheetsPayload = readAiSheetsBootstrap(threadId)
    if (!sheetsPayload) return

    clearAiSheetsBootstrap(threadId)
    setDeepResearchEnabled(false)
    if (sheetsPayload.selectedModel?.trim()) {
      userHasChosenModelRef.current = true
      setSelectedModel(sheetsPayload.selectedModel.trim())
    }

    if (sheetsPayload.autoSend) {
      sheetsAutoSendPendingRef.current = sheetsPayload.prompt
      setDraft('')
    } else {
      setDraft(sheetsPayload.prompt)
      queueMicrotask(() => chatInputRef.current?.focusField())
    }

    if (sheetsPayload.spreadsheetId?.trim()) {
      writeAiSheetsContext(threadId, {
        spreadsheetId: sheetsPayload.spreadsheetId.trim(),
        range: sheetsPayload.range?.trim() || 'Sheet1!A1:Z100',
        spreadsheetUrl: sheetsPayload.spreadsheetUrl,
      })
    }
  }, [threadId])

  useEffect(() => {
    const text = sheetsAutoSendPendingRef.current
    if (!text || !profile?.id || !threadId || !isValidPrivateChatThreadId(threadId)) {
      return
    }
    sheetsAutoSendPendingRef.current = null
    queueMicrotask(() => {
      handleSend({
        text,
        experimental_attachments: [],
        imageFiles: [],
      })
    })
  }, [threadId, profile?.id])

  const loadSheetsPreview = useCallback(
    async (spreadsheetId: string, range: string) => {
      setSheetsPreviewLoading(true)
      try {
        const result = await fetchGoogleSheetPreview(spreadsheetId, range)
        setSheetsPreview(result)
        if (threadId && isValidPrivateChatThreadId(threadId)) {
          updateAiSheetsContextPreview(threadId, result)
        }
      } finally {
        setSheetsPreviewLoading(false)
      }
    },
    [threadId],
  )

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) {
      setSheetsAgentContext(null)
      setSheetsPreview(null)
      return
    }
    const ctx = readAiSheetsContext(threadId)
    setSheetsAgentContext(ctx)
    if (ctx?.range) setSheetsRange(ctx.range)
  }, [threadId])

  useEffect(() => {
    if (!sheetsAgentContext?.spreadsheetId) return
    void loadSheetsPreview(sheetsAgentContext.spreadsheetId, sheetsRange)
  }, [sheetsAgentContext?.spreadsheetId, sheetsRange, loadSheetsPreview])

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    const payload = readReferenceBootstrap(threadId)
    if (!payload) return

    const ac = new AbortController()

    void (async () => {
      setReferenceBootstrapBusy(true)
      try {
        let googleConnected = false
        try {
          const st = await fetchGoogleIntegrationStatus()
          googleConnected = st.connected
        } catch {
          googleConnected = false
        }

        const imageFiles: File[] = []
        const snippets: ReferenceSnippet[] = []
        let askedDriveConnect = false

        for (const item of payload.items) {
          if (ac.signal.aborted) return
          const fid = extractGoogleDriveFileId(item.file_url)
          if (!fid) {
            snippets.push({
              key: crypto.randomUUID(),
              kind: 'link_only',
              title: item.file_name,
              sourceUrl: item.file_url,
            })
            continue
          }
          if (!googleConnected) {
            if (!askedDriveConnect) {
              askedDriveConnect = true
              window.alert(
                '구글 계정 연동이 필요합니다. 설정 → 워크스페이스 연동에서 Google을 연결하면 드라이브 문서 본문을 채팅에 넣을 수 있습니다.',
              )
            }
            snippets.push({
              key: crypto.randomUUID(),
              kind: 'link_only',
              title: item.file_name,
              sourceUrl: item.file_url,
            })
            continue
          }

          const res = await exportDriveFileForChat(fid)
          if (ac.signal.aborted) return
          if (!res.ok) {
            window.alert(`「${item.file_name}」 불러오기 실패: ${res.message}`)
            snippets.push({
              key: crypto.randomUUID(),
              kind: 'link_only',
              title: item.file_name,
              sourceUrl: item.file_url,
            })
            continue
          }

          const r = res.result
          if (r.kind === 'text') {
            snippets.push({
              key: crypto.randomUUID(),
              kind: 'text',
              title: r.fileName,
              sourceUrl: item.file_url,
              body: r.text,
            })
          } else if (r.kind === 'image') {
            try {
              const blob = await fetch(r.dataUrl).then((x) => x.blob())
              if (ac.signal.aborted) return
              imageFiles.push(new File([blob], r.fileName, { type: r.mimeType }))
            } catch {
              snippets.push({
                key: crypto.randomUUID(),
                kind: 'link_only',
                title: r.fileName,
                sourceUrl: r.webViewLink ?? item.file_url,
              })
            }
          } else {
            snippets.push({
              key: crypto.randomUUID(),
              kind: 'binary_link',
              title: r.fileName,
              sourceUrl: r.webViewLink ?? item.file_url,
              mimeType: r.mimeType,
              hint: r.message,
            })
          }
        }

        if (ac.signal.aborted) return

        clearReferenceBootstrap(threadId)

        if (imageFiles.length > 0) {
          queueMicrotask(() => chatInputRef.current?.appendImageFiles(imageFiles))
        }

        startTransition(() => {
          setReferenceSnippets(snippets)
          setDraft((d) =>
            d.trim()
              ? d
              : snippets.length > 0 || imageFiles.length > 0
                ? '선택한 사내 자료를 바탕으로 요약하고, 검토할 포인트를 알려 주세요.'
                : d,
          )
        })
        queueMicrotask(() => chatInputRef.current?.focusField())
      } finally {
        if (!ac.signal.aborted) setReferenceBootstrapBusy(false)
      }
    })()

    return () => ac.abort()
  }, [threadId])

  useLayoutEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return

    let cancelled = false

    void (async () => {
      if (profile?.id) {
        await ensurePrivateChatsHydrated(supabase, profile.id)
      }
      if (cancelled) return

      skipSnapshotSyncRef.current = true

      const snap = threadStateSnapshotRef.current
      if (
        snap.threadId &&
        snap.threadId !== threadId &&
        isValidPrivateChatThreadId(snap.threadId) &&
        !isPrivateChatThreadDeleted(snap.threadId)
      ) {
        savePrivateChatState(snap.threadId, {
          messages: snap.messages,
          draft: snap.draft,
          galleryDismissed: snap.galleryDismissed,
        })
      }

      const loaded = loadPrivateChatState(threadId)
      const nextMessages =
        loaded && loaded.messages.length > 0
          ? sortChatBubblesChronologically(loaded.messages)
          : []
      const nextDraft = loaded?.draft ?? ''
      const nextGalleryDismissed = loaded?.galleryDismissed ?? false

      threadStateSnapshotRef.current = {
        threadId,
        messages: nextMessages,
        draft: nextDraft,
        galleryDismissed: nextGalleryDismissed,
      }
      hydratedThreadIdRef.current = threadId

      setMessages(nextMessages)
      setDraft(nextDraft)
      setGalleryDismissed(nextGalleryDismissed)
      chatInputRef.current?.clearAttachments()
      scrollAfterHydrateRef.current =
        nextMessages.length > 0 ? 'lastUserMessage' : 'top'
    })()

    return () => {
      cancelled = true
    }
  }, [threadId, profile?.id])

  useLayoutEffect(() => {
    const scrollPosition = scrollAfterHydrateRef.current
    if (scrollPosition == null) return
    if (hydratedThreadIdRef.current !== threadId) return
    scrollAfterHydrateRef.current = null
    scrollChatArea(chatAreaRef.current, scrollPosition, 'auto')
  }, [threadId, messages])

  useLayoutEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    if (skipSnapshotSyncRef.current) {
      skipSnapshotSyncRef.current = false
      return
    }
    if (hydratedThreadIdRef.current !== threadId) return
    threadStateSnapshotRef.current = {
      threadId,
      messages,
      draft,
      galleryDismissed,
    }
  }, [threadId, messages, draft, galleryDismissed])

  useEffect(() => {
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    if (isPrivateChatThreadDeleted(threadId)) return
    if (hydratedThreadIdRef.current !== threadId) return
    if (threadStateSnapshotRef.current.threadId !== threadId) return

    savePrivateChatState(threadId, {
      messages,
      draft,
      galleryDismissed,
    })
    schedulePrivateChatDbSync(supabase, {
      clientThreadId: threadId,
      messages,
      userId: profile?.id,
    })
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event(PRIVATE_CHAT_STORAGE_UPDATED_EVENT))
    }, 280)
    return () => {
      window.clearTimeout(t)
      cancelPrivateChatDbSync(threadId)
    }
  }, [threadId, messages, draft, galleryDismissed, profile?.id])

  useLayoutEffect(() => {
    function startNewChat() {
      const nid = crypto.randomUUID()
      rememberLastPrivateThread(nid)
      setSelectedModel('auto')
      navigate(`/chat/${nid}`)
      queueMicrotask(() => {
        scrollChatArea(chatAreaRef.current, 'top', 'smooth')
      })
    }

    registerNewChatHandler(startNewChat)

    function onWindowNewChat() {
      startNewChat()
    }
    window.addEventListener('nh-ai:new-chat', onWindowNewChat)

    return () => {
      registerNewChatHandler(null)
      window.removeEventListener('nh-ai:new-chat', onWindowNewChat)
    }
  }, [registerNewChatHandler, navigate])

  async function handleHideOrgPromptCard(promptId: string) {
    if (!profile?.id) return
    const result = await hideOrgPromptForUser(supabase, profile.id, promptId)
    if (!result.ok) {
      window.alert(result.message)
      return
    }
    startTransition(() =>
      setHiddenOrgPromptIds((prev) => new Set([...prev, promptId])),
    )
  }

  function applyPromptContent(text: string, meta?: ApplyPromptMeta) {
    if (meta?.kind === 'org-static') {
      upsertOrgPromptRoute(meta.promptId, text)
    }
    startTransition(() => {
      setDraft(text)
      setReferenceSnippets([])
    })
    chatInputRef.current?.clearAttachments()
    setPromptPanelExpanded(false)
    queueMicrotask(() => {
      chatInputRef.current?.focusField()
      document
        .getElementById('chat-input-field')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  async function handleSaveMyPrompt(title: string, content: string) {
    if (!profile?.id) {
      return { ok: false as const, message: '로그인이 필요합니다.' }
    }
    return createPrivatePrompt(supabase, {
      userId: profile.id,
      title,
      content,
    })
  }

  async function handleDeleteMyPrompt(id: string) {
    return deleteMyPrompt(supabase, id)
  }

  const handleBookmarkAssistant = useCallback(
    async (detail: { prompt: string; aiResponse: string }) => {
      if (!profile?.id) {
        return { ok: false as const, message: '로그인 프로필이 필요합니다.' }
      }
      return insertBookmarkedChat(supabase, {
        userId: profile.id,
        prompt: detail.prompt,
        aiResponse: detail.aiResponse,
        note: '',
      })
    },
    [profile],
  )

  const removeReferenceSnippet = useCallback((key: string) => {
    setReferenceSnippets((prev) => prev.filter((s) => s.key !== key))
  }, [])

  const handleCommitMessageEdit = useCallback(
    ({
      messageId,
      role,
      nextContent,
    }: {
      messageId: string
      role: 'user' | 'assistant'
      nextContent: string
    }) => {
      const trimmed = nextContent.trim()
      if (!trimmed) return

      const stamp = () =>
        new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      const nowIso = () => new Date().toISOString()

      const currentMessages = messagesRef.current
      const idx = currentMessages.findIndex((m) => m.id === messageId)
      if (idx < 0) return
      const msg = currentMessages[idx]
      if (msg.streaming || msg.role !== role) return
      if (
        msg.role === 'assistant' &&
        msg.id.startsWith('welcome-assistant')
      ) {
        return
      }

      if (role === 'assistant') {
        startTransition(() => {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === idx
                ? { ...m, content: trimmed, time: stamp(), createdAt: nowIso() }
                : m,
            ),
          )
        })
        return
      }

      if (!profile?.id) return
      if (!threadId || !isValidPrivateChatThreadId(threadId)) return

      const updatedUser: ChatBubble = {
        ...msg,
        content: trimmed,
        time: stamp(),
        createdAt: nowIso(),
      }
      const nextMessages = [...currentMessages.slice(0, idx), updatedUser]
      messagesRef.current = nextMessages
      startTransition(() => setMessages(nextMessages))

      chatAbortRef.current?.abort()
      sendQueueRef.current = []

      const payload: ChatSendPayload = {
        ...userBubbleToSendPayload(updatedUser),
        composerTool: composerTool ?? undefined,
      }

      sendQueueRef.current.push({
        payload,
        snippetsSnapshot: [...referenceSnippets],
        deepResearch: deepResearchEnabled,
        internetSearch: internetSearchEnabled,
        regenerate: true,
      })
      setQueuedAheadCount(sendQueueRef.current.length)
      void runDrain()
    },
    [
      profile?.id,
      threadId,
      composerTool,
      referenceSnippets,
      deepResearchEnabled,
      internetSearchEnabled,
    ],
  )

  const handleStopGeneration = useCallback(() => {
    chatAbortRef.current?.abort()
    sendQueueRef.current = []
    setQueuedAheadCount(0)
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.streaming) return m
        const trimmed = m.content.trim()
        const stoppedNote = '[생성이 중단되었습니다.]'
        return {
          ...m,
          streaming: false,
          content: trimmed
            ? trimmed.endsWith(stoppedNote)
              ? trimmed
              : `${trimmed}\n\n${stoppedNote}`
            : stoppedNote,
        }
      }),
    )
  }, [])

  async function executeChatTurn(
    item: PendingChatTurn,
    turnThreadId: string,
  ): Promise<void> {
    const profileNow = profileRef.current
    const rawModel =
      selectedModelRef.current.trim() ||
      profileNow?.preferred_ai?.trim() ||
      'auto'
    const modelNow =
      rawModel.toLowerCase() === 'auto' ? 'auto' : rawModel
    if (!profileNow?.id) return
    if (threadIdRef.current !== turnThreadId) return

    const { payload, snippetsSnapshot } = item
    const trimmed = payload.text.trim()
    const imageBase64 = payload.imageBase64?.trim() ?? ''
    const imageMime = payload.mimeType?.trim() ?? 'image/jpeg'
    const imageFiles = payload.imageFiles ?? []
    const legacyAttachments = payload.experimental_attachments ?? []
    const hasBase64Image = imageBase64.length > 0
    const hasImages =
      hasBase64Image || imageFiles.length > 0 || legacyAttachments.length > 0
    const refBlock = buildReferencePromptBlock(snippetsSnapshot)
    const hasRefContext = refBlock.length > 0

    if (!trimmed && !hasImages && !hasRefContext) return

    let refreshTwiceForTokens = false

    let attachmentPreviews: string[] | undefined
    if (hasBase64Image) {
      attachmentPreviews = [`data:${imageMime};base64,${imageBase64}`]
    } else if (imageFiles.length > 0) {
      attachmentPreviews = await Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = () =>
                reject(reader.error ?? new Error('미리보기 생성 실패'))
              reader.readAsDataURL(file)
            }),
        ),
      )
    } else if (legacyAttachments.length > 0) {
      attachmentPreviews = legacyAttachments.map((a) => a.url)
    }

    if (threadIdRef.current !== turnThreadId) return

    const imageCount =
      (hasBase64Image ? 1 : 0) + imageFiles.length + legacyAttachments.length

    const refNote =
      hasRefContext && snippetsSnapshot.length > 0
        ? `\n\n[사내 자료실·드라이브 참조 ${snippetsSnapshot.length}건]`
        : ''

    const displayContent =
      trimmed && hasImages
        ? `${trimmed}\n\n[첨부 이미지 ${imageCount}장]${refNote}`
        : trimmed
          ? `${trimmed}${refNote}`
          : hasRefContext && !hasImages
            ? `[사내 자료실 참조 ${snippetsSnapshot.length}건] 첨부 맥락을 반영해 분석해 주세요.`
            : `[첨부 이미지 ${imageCount}장] 이미지를 분석해 주세요.${refNote}`

    let apiPrompt =
      trimmed ||
      (hasImages
        ? `첨부된 현장 이미지 ${imageCount}장을 분석하고, 위험 요소·균열 여부·권장 조치를 요약해 주세요.`
        : hasRefContext
          ? `아래 사내 자료 맥락을 바탕으로 요약·검토 의견을 제시해 주세요.`
          : '')

    if (hasRefContext) {
      const userPart =
        trimmed ||
        (hasImages
          ? `첨부 이미지 ${imageCount}장과 함께 자료 내용을 종합해 분석해 주세요.`
          : '위 자료를 바탕으로 핵심을 요약하고 확인이 필요한 항목을 짚어 주세요.')
      apiPrompt = `${refBlock}\n\n---\n\n[사용자 요청]\n${userPart}`
    }

    const tokenLimit = profileNow.token_limit ?? 0
    const currentTokenUsage = profileNow.current_token_usage ?? 0

    const turnMs = Date.now()
    const userCreatedAt = new Date(turnMs).toISOString()
    const assistantCreatedAt = new Date(turnMs + 1).toISOString()
    const clockAt = (ms: number) =>
      new Date(ms).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })

    if (!item.regenerate) {
      const userId = `user-${turnMs}`
      setMessages((prev) => {
        if (threadIdRef.current !== turnThreadId) return prev
        return [
          ...prev,
          {
            id: userId,
            role: 'user',
            content: displayContent,
            time: clockAt(turnMs),
            createdAt: userCreatedAt,
            attachmentPreviews,
          },
        ]
      })
    }

    const assistantId = `assistant-${turnMs + 1}`
    const useDeepResearch = item.deepResearch

    setMessages((prev) => {
      if (threadIdRef.current !== turnThreadId) return prev
      return [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: useDeepResearch ? DEEP_RESEARCH_LOADING_MESSAGE : '',
          time: clockAt(turnMs + 1),
          createdAt: assistantCreatedAt,
          streaming: true,
        },
      ]
    })

    const composerToolMode = item.payload.composerTool ?? null

    chatAbortRef.current?.abort()
    const turnAbort = new AbortController()
    chatAbortRef.current = turnAbort
    const { signal } = turnAbort

    const finalizeAssistantStreaming = () => {
      if (threadIdRef.current !== turnThreadId) return
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                streaming: false,
                ...(message.thinkingContent?.trim()
                  ? {}
                  : { thinkingContent: undefined }),
              }
            : message,
        ),
      )
    }

    const isTurnAborted = () => signal.aborted

    try {
      if (composerToolMode === 'speech') {
        const creative = await invokeCreativeGenerate({
          supabase,
          tool: 'speech',
          prompt: apiPrompt,
          preferredAi: modelNow,
          signal,
        })
        if (threadIdRef.current !== turnThreadId) return
        if (isTurnAborted() || (!creative.ok && creative.aborted)) return
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: creative.ok ? creative.markdown : creative.message,
                  streaming: false,
                }
              : message,
          ),
        )
        return
      }

      if (useDeepResearch) {
        const outcome = await invokeDeepResearch({
          supabase,
          prompt: apiPrompt,
          signal,
        })

        if (threadIdRef.current !== turnThreadId) return
        if (isTurnAborted() || (!outcome.ok && outcome.aborted)) return

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: outcome.ok
                    ? outcome.content
                    : outcome.message,
                  streaming: false,
                  deepResearch: outcome.ok,
                }
              : message,
          ),
        )
        if (!outcome.ok && outcome.httpStatus === 402) {
          chatInputRef.current?.showBudgetExhaustedToast()
        }
        return
      }

      let canvasStreamText = ''
      let streamRawText = ''
      const historySnapshot = item.regenerate
        ? messagesRef.current
        : messagesRef.current.filter((message) => {
            if (message.streaming) return false
            if (message.id.startsWith(`user-${turnMs}`)) return false
            return true
          })
      const apiMessages = buildMessagesForApi(historySnapshot, apiPrompt, {
        excludeLastUser: item.regenerate === true,
      })
      const outcome = await invokeAiChat({
        supabase,
        messages: apiMessages,
        activeModel: modelNow,
        providerPreference: selectedProviderRef.current,
        composerTool: composerToolMode === 'canvas' ? 'canvas' : null,
        internetSearchEnabled: item.internetSearch,
        imageBase64: hasBase64Image ? imageBase64 : undefined,
        mimeType: hasBase64Image ? imageMime : undefined,
        imageFiles:
          !hasBase64Image && imageFiles.length > 0 ? imageFiles : undefined,
        experimental_attachments:
          !hasBase64Image &&
          imageFiles.length === 0 &&
          legacyAttachments.length > 0
            ? legacyAttachments
            : undefined,
        experimental_lab: activeWorkflowSystemPrompt ? {
          system_prompt: activeWorkflowSystemPrompt,
          system_prompt_mode: 'replace',
        } : undefined,
        tokenLimit,
        currentTokenUsage,
        signal,
        onTextDelta: (delta) => {
          if (threadIdRef.current !== turnThreadId) return
          if (composerToolMode === 'canvas') canvasStreamText += delta
          streamRawText += delta
          const { thinkingContent, content } = splitThinkingStream(streamRawText)
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content,
                    thinkingContent,
                  }
                : message,
            ),
          )
        },
        onCitationSources: (sources) => {
          if (threadIdRef.current !== turnThreadId) return
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, citations: sources }
                : message,
            ),
          )
        },
        onUniverOffice: ({ activeTab, aiDataSignal }) => {
          if (threadIdRef.current !== turnThreadId) return
          navigateRef.current('/ai-office', {
            state: {
              activeTab,
              aiDataSignal,
              fromThreadId: turnThreadId,
            },
          })
        },
      })

      if (threadIdRef.current !== turnThreadId) return
      if (isTurnAborted()) return

      finalizeAssistantStreaming()

      if (!outcome.ok) {
        if (outcome.aborted) return
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content:
                    message.content.trim().length > 0
                      ? `${message.content}\n\n[오류] ${outcome.message}`
                      : outcome.message,
                  streaming: false,
                }
              : message,
          ),
        )
        if (outcome.httpStatus === 402) {
          chatInputRef.current?.showBudgetExhaustedToast()
        } else if (
          outcome.httpStatus === 429 ||
          /토큰|한도|초과/i.test(outcome.message)
        ) {
          startTransition(() => {
            setTokenModalPreset(
              '개인 채팅 AI 호출이 토큰 한도와 관련해 거절되었습니다.',
            )
            setTokenModalOpen(true)
          })
        }
      } else {
        refreshTwiceForTokens = true
        if (hasRefContext) {
          startTransition(() => setReferenceSnippets([]))
        }
        if (composerToolMode === 'canvas') {
          const htmlBlock = extractHtmlArtifactBlock(canvasStreamText)
          if (htmlBlock) {
            openArtifact({
              title: htmlBlock.title,
              content: htmlBlock.html,
              type: 'html',
            })
          }
        }
      }
    } catch (error) {
      if (threadIdRef.current !== turnThreadId) return
      if (isTurnAborted()) return
      const message =
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content.trim()
                  ? `${m.content}\n\n[오류] ${message}`
                  : message,
                streaming: false,
              }
            : m,
        ),
      )
    } finally {
      if (chatAbortRef.current === turnAbort) {
        chatAbortRef.current = null
      }
      try {
        await refreshProfile()
        if (refreshTwiceForTokens && threadIdRef.current === turnThreadId) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          await refreshProfile()
        }
      } catch (err) {
        console.error('[Dashboard] 전송 후 프로필 새로고침 실패', err)
      }
    }
  }

  async function runDrain(): Promise<void> {
    if (drainRunnerRef.current) return
    drainRunnerRef.current = true
    setIsSending(true)
    try {
      while (sendQueueRef.current.length > 0) {
        const turnThreadId = threadIdRef.current
        if (!turnThreadId || !isValidPrivateChatThreadId(turnThreadId)) {
          sendQueueRef.current = []
          break
        }
        const item = sendQueueRef.current.shift()!
        setQueuedAheadCount(sendQueueRef.current.length)
        await executeChatTurn(item, turnThreadId)
      }
    } finally {
      drainRunnerRef.current = false
      setIsSending(false)
      setQueuedAheadCount(sendQueueRef.current.length)
    }
  }

  function handleRegenerateAssistant(assistantIndex: number) {
    const assistant = messages[assistantIndex]
    if (!assistant || assistant.role !== 'assistant') return
    if (assistant.streaming || assistant.id.startsWith('welcome-assistant')) return
    if (!profile?.id) return
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return

    const userMsg = messages[assistantIndex - 1]
    if (!userMsg || userMsg.role !== 'user') return

    const payload: ChatSendPayload = {
      ...userBubbleToSendPayload(userMsg),
      composerTool: composerTool ?? undefined,
    }

    const nextMessages = messages.slice(0, assistantIndex)
    messagesRef.current = nextMessages
    setMessages(nextMessages)

    sendQueueRef.current.push({
      payload,
      snippetsSnapshot: [...referenceSnippets],
      deepResearch: deepResearchEnabled,
      internetSearch: internetSearchEnabled,
      regenerate: true,
    })
    setQueuedAheadCount(sendQueueRef.current.length)
    void runDrain()
  }

  async function handleMediaGenerate(
    actionType: 'image' | 'video',
    prompt: string,
    mediaModelId: string,
  ) {
    const trimmed = prompt.trim()
    if (!trimmed) return
    if (!profile?.id) return
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return
    if (isSending) return

    const turnMs = Date.now()
    const userCreatedAt = new Date(turnMs).toISOString()
    const assistantCreatedAt = new Date(turnMs + 1).toISOString()
    const clockAt = (ms: number) =>
      new Date(ms).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })

    const label = actionType === 'image' ? '이미지 만들기' : '동영상 만들기'
    const engineLabel =
      (actionType === 'image' ? safeMediaImageModels : safeMediaVideoModels)?.find(
        (row) => row.api_id === mediaModelId,
      )?.display_name ?? mediaModelId
    const userId = `user-media-${turnMs}`
    const assistantId = `assistant-media-${turnMs + 1}`

    setComposerTool(null)
    setIsSending(true)
    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        content: `[${label} · ${engineLabel}] ${trimmed}`,
        time: clockAt(turnMs),
        createdAt: userCreatedAt,
      },
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        time: clockAt(turnMs + 1),
        createdAt: assistantCreatedAt,
        streaming: true,
      },
    ])
    setDraft('')

    const result = await invokeMediaRouter({
      supabase,
      activeModel: selectedModel,
      actionType,
      prompt: trimmed,
      mediaModelId,
    })

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== assistantId) return message
        if (!result.ok) {
          return { ...message, content: result.message, streaming: false }
        }
        if (actionType === 'image' && result.mediaUrl) {
          const alt = trimmed.slice(0, 80).replace(/[\[\]]/g, '') || '생성 이미지'
          return {
            ...message,
            content: result.markdown || `![${alt}](${result.mediaUrl})`,
            streaming: false,
          }
        }
        return {
          ...message,
          content: result.markdown,
          streaming: false,
        }
      }),
    )
    setIsSending(false)
  }

  function handleSend(payload: ChatSendPayload) {
    const trimmed = payload.text.trim()
    const imageBase64 = payload.imageBase64?.trim() ?? ''
    const imageFiles = payload.imageFiles ?? []
    const legacyAttachments = payload.experimental_attachments ?? []
    const hasBase64Image = imageBase64.length > 0
    const hasImages =
      hasBase64Image || imageFiles.length > 0 || legacyAttachments.length > 0
    const refBlock = buildReferencePromptBlock(referenceSnippets)
    const hasRefContext = refBlock.length > 0

    if (!trimmed && !hasImages && !hasRefContext) return
    if (!profile?.id) return
    if (!threadId || !isValidPrivateChatThreadId(threadId)) return

    sendQueueRef.current.push({
      payload,
      snippetsSnapshot: [...referenceSnippets],
      deepResearch: deepResearchEnabled,
      internetSearch: internetSearchEnabled,
    })
    setQueuedAheadCount(sendQueueRef.current.length)
    setDraft('')
    void runDrain()
  }

  async function handleModelChange(nextModel: string) {
    const previous = selectedModel
    userHasChosenModelRef.current = true
    setSelectedModel(nextModel)

    const userId = profile?.id
    if (!userId) return

    setModelSaving(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ preferred_ai: nextModel })
        .eq('id', userId)

      if (error) {
        console.error('[Dashboard] preferred_ai 업데이트 실패', error)
        startTransition(() => setSelectedModel(previous))
        return
      }

      await refreshProfile()
    } finally {
      setModelSaving(false)
    }
  }

  function handleProviderChange(nextProvider: AiProviderPreference) {
    setSelectedProvider(nextProvider)
    if (selectedModel !== 'auto') void handleModelChange('auto')
  }

  return (
    <ChatArtifactProvider>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAF9F6] dark:bg-transparent lg:flex-row">
      <div
        className={`hidden min-w-0 shrink-0 transition-[width] duration-200 ease-out lg:flex lg:h-full lg:max-h-none ${
          promptPanelExpanded
            ? 'lg:w-48 lg:min-w-48 lg:max-w-48 lg:overflow-hidden'
            : 'lg:hidden'
        }`}
      >
        <PromptLibraryPanel
          variant="sidebar"
          staticOrgPrompts={departmentOrgTemplates}
          publicPrompts={publicPrompts}
          myPrompts={myPrompts}
          loading={promptsLoading || orgTemplatesLoading}
          disabled={isSending || !profile}
          currentDraft={draft}
          userId={profile?.id}
          onApplyContent={applyPromptContent}
          onRefresh={loadPromptLibrary}
          onSavePrompt={handleSaveMyPrompt}
          onDeletePrompt={handleDeleteMyPrompt}
          promptPanelRegionId={promptPanelRegionId}
        />
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <GeminiChatBackground
          active={isSending || messages.some((message) => message.streaming)}
        />
        <header className="hidden shrink-0 items-center gap-1 border-b border-stone-200/90 bg-[#FAF9F6]/95 px-2 py-1 backdrop-blur-md dark:border-stone-800/60 dark:bg-[#050508]/55 md:flex md:px-3 md:py-1.5">
          <h1 className="min-w-0">
            <button
              type="button"
              onClick={() => requestNewChat()}
              className="text-left text-2xl font-semibold leading-none tracking-tight text-stone-900 transition hover:text-orange-800 dark:text-stone-50 dark:hover:text-orange-200"
              aria-label="홈 · 새 채팅"
              title="홈 · 새 채팅"
            >
              NH-AX-HUB
            </button>
          </h1>
          <AccountHeaderActions
            onOpenSettings={openSettings}
            onSignOut={signOut}
          />
        </header>

        {activeWorkflowTitle && (
          <div className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200 flex flex-wrap items-center justify-between gap-2 md:px-6">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">✨</span>
              <span>
                <span className="font-bold">{activeWorkflowTitle}</span> 워크플로우가 적용된 채팅 세션입니다.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveWorkflowSystemPrompt(null)
                setActiveWorkflowTitle(null)
              }}
              className="font-semibold underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              해제하기
            </button>
          </div>
        )}

        {profileError ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 md:px-6">
            {profileError}{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => void refreshProfile()}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {profile &&
        dashboardTokenBudget.limit > 0 &&
        dashboardTokenBudget.pct <= 10 ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 md:px-6">
            <span className="font-medium">
              월간 토큰 예산이 10% 이하입니다 (남은 비율 약 {dashboardTokenBudget.pct}
              %).
            </span>{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() =>
                startTransition(() => {
                  setTokenModalPreset(
                    `개인 채팅 기준 남은 예산 비율이 약 ${dashboardTokenBudget.pct}% 입니다.`,
                  )
                  setTokenModalOpen(true)
                })
              }
            >
              관리자에게 요청
            </button>
          </div>
        ) : null}

          {sheetsAgentContext ? (
            <AiSheetsSplitLayout
              spreadsheetId={sheetsAgentContext.spreadsheetId}
              range={sheetsRange}
              spreadsheetUrl={sheetsAgentContext.spreadsheetUrl}
              preview={sheetsPreview}
              loading={sheetsPreviewLoading}
              onRangeChange={setSheetsRange}
              onRefresh={() =>
                void loadSheetsPreview(
                  sheetsAgentContext.spreadsheetId,
                  sheetsRange,
                )
              }
            >
              <ChatArtifactLayout className="min-h-0 flex-1">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(9.25rem+env(safe-area-inset-bottom))] md:pb-0 lg:pb-0">
                  <ChatArea
                    ref={chatAreaRef}
                    messages={messages}
                    variant="gemini"
                    messageType="session"
                    className="min-h-0 flex-1"
                    activeModelLabel={formatModelDisplayName(selectedModel)}
                    threadShareUrl={
                      threadId && isValidPrivateChatThreadId(threadId)
                        ? `${window.location.origin}/chat/${threadId}`
                        : undefined
                    }
                    onBookmarkAssistant={handleBookmarkAssistant}
                    onRegenerateAssistant={handleRegenerateAssistant}
                    regenerateDisabled={isSending}
                    onCommitMessageEdit={handleCommitMessageEdit}
                    topPanel={null}
                  />
                </div>
              </ChatArtifactLayout>
            </AiSheetsSplitLayout>
          ) : (
          <ChatArtifactLayout className="min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(9.25rem+env(safe-area-inset-bottom))] md:pb-0 lg:pb-0">
              <ChatArea
                ref={chatAreaRef}
                messages={messages}
                variant="gemini"
                messageType="session"
                className="min-h-0 flex-1"
                activeModelLabel={formatModelDisplayName(selectedModel)}
                threadShareUrl={
                  threadId && isValidPrivateChatThreadId(threadId)
                    ? `${window.location.origin}/chat/${threadId}`
                    : undefined
                }
                onBookmarkAssistant={handleBookmarkAssistant}
                onRegenerateAssistant={handleRegenerateAssistant}
                regenerateDisabled={isSending}
                onCommitMessageEdit={handleCommitMessageEdit}
                topPanel={
                  !threadHasUserMessage ? (
                    <div className="mx-auto w-full max-w-6xl px-3 pt-2 md:px-4">
                      <ChatStartHub
                        loading={showPromptGalleryLoading}
                        showPromptCards={showPromptGallery}
                        prompts={visibleOrgPrompts}
                        disabled={isSending || !profile}
                        userGreetingName={userGreetingName}
                        onApplyToInput={(item) =>
                          applyPromptContent(item.content, {
                            kind: 'org-static',
                            promptId: item.id,
                          })
                        }
                        onRemoveFromGallery={(id) =>
                          void handleHideOrgPromptCard(id)
                        }
                        onDismissSection={() => setGalleryDismissed(true)}
                      />
                    </div>
                  ) : null
                }
              />
            </div>
          </ChatArtifactLayout>
          )}

        <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 shrink-0 border-t border-stone-200/90 bg-[#FAF9F6]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md gemini-zero-dark-composer dark:border-stone-800/80 md:pointer-events-auto md:relative md:inset-x-auto md:bottom-auto md:z-0 md:bg-transparent md:px-6 md:pb-4 md:pt-2 md:backdrop-blur-none ${isSending ? 'gemini-zero-dark-composer--generating' : ''}`}>
          <div className="pointer-events-auto">
          {referenceBootstrapBusy ? (
            <div className="mx-auto mb-1 max-w-3xl rounded-lg border border-orange-200/80 bg-orange-50/95 px-3 py-2 text-[11px] font-medium text-orange-950 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-100">
              구글 드라이브에서 자료를 불러오는 중입니다…
            </div>
          ) : null}
          {referenceSnippets.length > 0 ? (
            <div className="mx-auto mb-1 flex max-w-3xl flex-wrap gap-1.5 px-0.5">
              {referenceSnippets.map((s) => (
                <span
                  key={s.key}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-300/90 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-800 shadow-sm dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                >
                  <span className="truncate" title={s.title}>
                    📎 {s.title}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-50"
                    aria-label={`${s.title} 참조 제거`}
                    onClick={() => removeReferenceSnippet(s.key)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <ChatInput
            ref={chatInputRef}
            value={draft}
            onChange={setDraft}
            onSend={(detail) => void handleSend(detail)}
            disabled={!profile}
            allowSend={Boolean(profile)}
            generating={isSending}
            onStopGenerating={handleStopGeneration}
            variant="gemini"
            placeholder={chatInputPlaceholder}
            deepResearchEnabled={deepResearchEnabled}
            onDeepResearchChange={setDeepResearchEnabled}
            internetSearchEnabled={internetSearchEnabled}
            onInternetSearchChange={setInternetSearchEnabled}
            composerTool={composerTool}
            onComposerToolChange={(tool) => {
              setComposerTool(tool)
              if (tool) setDeepResearchEnabled(false)
            }}
            activeModel={selectedModel}
            onActiveModelChange={setSelectedModel}
            onMediaGenerate={handleMediaGenerate}
            mediaImageEngines={safeMediaImageModels}
            mediaVideoEngines={safeMediaVideoModels}
            mediaEnginesLoading={mediaEnginesLoading}
            onOpenWorkspaceTools={() => navigate('/workspace-tools')}
            onOpenReferenceRoom={() => navigate('/reference-room')}
            onOpenNotebook={() => navigate('/notebook')}
            onOpenSettings={openSettings}
            belowInputRow={
              registryModelsLoading ? (
                <div
                  className="inline-flex h-8 min-w-[8.5rem] max-w-[min(52vw,14rem)] animate-pulse items-center rounded-full bg-stone-200/90 px-3 dark:bg-stone-700/80"
                  aria-hidden="true"
                />
              ) : (
                <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1">
                  <label htmlFor="dashboard-ai-provider-select" className="sr-only">
                    AI 공급자 선택
                  </label>
                  <select
                    id="dashboard-ai-provider-select"
                    name="ai-provider"
                    value={selectedProvider}
                    disabled={!profile || modelSaving}
                    onChange={(event) =>
                      handleProviderChange(event.target.value as AiProviderPreference)
                    }
                    className="h-8 w-[7.75rem] max-w-[40vw] min-w-0 shrink rounded-full border-0 bg-stone-100/95 px-2.5 text-[12.5px] font-medium text-stone-700 outline-none ring-orange-600/20 transition hover:bg-stone-200/90 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-800/95 dark:text-stone-200 dark:hover:bg-stone-700/90"
                  >
                    <option value="auto">자동 추천</option>
                    <option value="openai">ChatGPT/OpenAI</option>
                    <option value="anthropic">Claude</option>
                    <option value="google">Gemini</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="hermes">Hermes</option>
                  </select>
                  <ModelSelectRow
                    selectedModel={selectedModel}
                    modelVersionSelectId={modelVersionSelectId}
                    versionRows={safeVersionRows}
                    modelSaving={modelSaving}
                    profileReady={Boolean(profile)}
                    onModelChange={(id) => void handleModelChange(id)}
                  />
                </div>
              )
            }
          />
          </div>
        </div>
      </div>
      <PromptLibraryMagnetSheet
        expanded={promptPanelExpanded}
        onExpandedChange={setPromptPanelExpanded}
      >
        <PromptLibraryPanel
          variant="magnet"
          staticOrgPrompts={departmentOrgTemplates}
          publicPrompts={publicPrompts}
          myPrompts={myPrompts}
          loading={promptsLoading || orgTemplatesLoading}
          disabled={isSending || !profile}
          currentDraft={draft}
          userId={profile?.id}
          onApplyContent={applyPromptContent}
          onRefresh={loadPromptLibrary}
          onSavePrompt={handleSaveMyPrompt}
          onDeletePrompt={handleDeleteMyPrompt}
          promptPanelRegionId={`${promptPanelRegionId}-mobile`}
        />
      </PromptLibraryMagnetSheet>
      <TokenRequestModal
        open={tokenModalOpen}
        onClose={() =>
          startTransition(() => {
            setTokenModalOpen(false)
            setTokenModalPreset(undefined)
          })
        }
        supabase={supabase}
        userId={profile?.id}
        presetSummary={tokenModalPreset}
      />
    </div>
    </ChatArtifactProvider>
  )
}
