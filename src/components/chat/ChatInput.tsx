import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from 'react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import type {
  ChatExperimentalAttachment,
  ChatSendPayload,
} from '../../types/chat'
import {
  COMPOSER_TOOLS,
  getComposerToolMeta,
  type ComposerToolMode,
} from '../../types/composer-tools'
import type { AiModelRow } from '../../types/ai-models'

import { compressChatImageFile } from '../../utils/compress-chat-image'

import { ChatAttachmentPreviewStrip } from './ChatAttachmentPreviewStrip'
import {
  MediaEngineBentoPanel,
  mediaEngineLabel,
} from './MediaEngineBentoPanel'

export type { ChatExperimentalAttachment, ChatSendPayload }

export type ChatInputHandle = {
  focusField: () => void
  /** 프롬프트 라이브러리 적용 등 입력 교체 시 미리보기·파일 선택 상태 초기화 */
  clearAttachments: () => void
  /** 사내 자료실 등에서 이미지 파일을 프로그램적으로 추가 (검증 규칙은 파일 선택과 동일) */
  appendImageFiles: (files: File[]) => void
  /** 부서 예산 소진(402) 시 컴포저 상단 토스트 */
  showBudgetExhaustedToast: () => void
}

const BUDGET_TOAST_MESSAGE =
  '부서 예산 소진으로 인해 다음 달 1일까지 AI 사용이 제한됩니다. 관리자에게 문의하세요.'

const BUDGET_TOAST_DISMISS_MS = 8000

type ChatInputProps = {
  value: string
  onChange: (value: string) => void
  onSend: (payload: ChatSendPayload) => void
  placeholder?: string
  /** 전송 중 등 입력 컴포저 전체 잠금(텍스트 영역 포함) */
  disabled?: boolean
  /** false면 문안 입력은 가능하지만 전송만 막음(프로필 미로드 등) */
  allowSend?: boolean
  variant?: 'default' | 'claude' | 'gemini'
  /** true 이면 이미지 첨부 버튼 비활성(MVP 공유 채팅 등) */
  disableAttachments?: boolean
  /** 전송 버튼 바로 왼쪽 영역(모델 선택 등, Cursor 스타일) */
  toolbarBeforeSend?: ReactNode
  /** 입력 하단 도구 모음(모델 선택 등) */
  belowInputRow?: ReactNode
  /** 컴포저 하단 보조 정보(토큰 추정 등) */
  composerMeta?: ReactNode
  /** AI 답변 생성 중 — 전송 버튼 대신 중지 버튼 표시 */
  generating?: boolean
  /** 스트리밍 중 생성 중지 */
  onStopGenerating?: () => void
  /** 지정 시 + 메뉴에서 문서 업로드·외부 연동 페이지로 이동할 수 있습니다 */
  onOpenWorkspaceTools?: () => void
  onOpenReferenceRoom?: () => void
  onOpenNotebook?: () => void
  onOpenSettings?: () => void
  /** 심층 연구(AI 앙상블) 모드 */
  deepResearchEnabled?: boolean
  onDeepResearchChange?: (enabled: boolean) => void
  /** [인터넷 검색] — Edge 하이브리드 웹 검색 라우팅 */
  internetSearchEnabled?: boolean
  onInternetSearchChange?: (enabled: boolean) => void
  composerTool?: ComposerToolMode | null
  onComposerToolChange?: (tool: ComposerToolMode | null) => void
  /** 대시보드에서 선택 중인 AI 모델 — 미디어 라우터 activeModel */
  activeModel?: string
  /** AI 모델을 ChatInput 내부에서 강제로 변경하고자 할 때 (예: 이미지 생성 등) */
  onActiveModelChange?: (modelId: string) => void
  /** 이미지/동영상 만들기 → ai-chat mediaRouter */
  onMediaGenerate?: (
    actionType: 'image' | 'video',
    prompt: string,
    mediaModelId: string,
  ) => void | Promise<void>
  /** Supabase ai_models — model_type = image */
  mediaImageEngines?: readonly AiModelRow[]
  /** Supabase ai_models — model_type = video */
  mediaVideoEngines?: readonly AiModelRow[]
  mediaEnginesLoading?: boolean
  /** textarea 위에 표시 (AI Slides prompt-files 등) */
  aboveTextareaContent?: ReactNode
  /** AI Slides 등 외부 input-wrapper 안에 임베드 */
  embeddedInSlidesShell?: boolean
  /** embeddedInSlidesShell과 함께 — 도구·음성 등 숨기고 전송만 */
  slidesMinimalComposer?: boolean
}

type PendingAttachment = {
  id: string
  previewUrl: string
  imageBase64: string
  mimeType: string
  fileName: string
}

function IconSpinner(props: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${props.className ?? ''}`}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function IconPlus(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}

function IconTokenCost(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function IconSliders(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
      />
    </svg>
  )
}

function IconStopSquare(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  )
}

function IconCheck(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function IconVoiceWave(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2 10v3 M6 6v11 M10 3v18 M14 8v8 M18 5v14 M22 10v3"
      />
    </svg>
  )
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSend,
      placeholder = '업무 관련 질문을 입력하세요…',
      disabled = false,
      allowSend = true,
      variant = 'default',
      disableAttachments = false,
      toolbarBeforeSend,
      belowInputRow,
      composerMeta,
      generating = false,
      onStopGenerating,
      onOpenWorkspaceTools,
      onOpenReferenceRoom,
      onOpenNotebook,
      onOpenSettings,
      deepResearchEnabled = false,
      onDeepResearchChange,
      internetSearchEnabled = false,
      onInternetSearchChange,
      composerTool = null,
      onComposerToolChange,
      activeModel,
      onMediaGenerate,
      mediaImageEngines = [],
      mediaVideoEngines = [],
      mediaEnginesLoading = false,
      aboveTextareaContent,
      embeddedInSlidesShell = false,
      slidesMinimalComposer = false,
    }: ChatInputProps,
    ref,
  ) {
    const slidesMinimal = embeddedInSlidesShell && slidesMinimalComposer
    const safeMediaImageEngines = Array.isArray(mediaImageEngines)
      ? mediaImageEngines
      : []
    const safeMediaVideoEngines = Array.isArray(mediaVideoEngines)
      ? mediaVideoEngines
      : []

    const fileInputRef = useRef<HTMLInputElement>(null)
    const documentInputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [attachments, setAttachments] = useState<PendingAttachment[]>([])
    const [mediaBusy, setMediaBusy] = useState<'image' | 'video' | null>(null)
    const [mediaEnginePanel, setMediaEnginePanel] = useState<
      'image' | 'video' | null
    >(null)
    const [selectedImageModelId, setSelectedImageModelId] = useState('')
    const [selectedVideoModelId, setSelectedVideoModelId] = useState('')
    const latestValueRef = useRef(value)
    const speechBaseRef = useRef('')
    const attachWrapRef = useRef<HTMLDivElement>(null)
    const attachButtonRef = useRef<HTMLButtonElement>(null)
    const attachMenuRef = useRef<HTMLDivElement>(null)
    const metaWrapRef = useRef<HTMLDivElement>(null)
    const metaButtonRef = useRef<HTMLButtonElement>(null)
    const metaMenuRef = useRef<HTMLDivElement>(null)
    const toolsWrapRef = useRef<HTMLDivElement>(null)
    const toolsButtonRef = useRef<HTMLButtonElement>(null)
    const toolsMenuRef = useRef<HTMLDivElement>(null)
    const [attachMenuOpen, setAttachMenuOpen] = useState(false)
    const [metaMenuOpen, setMetaMenuOpen] = useState(false)
    const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
    const [attachMenuAnchor, setAttachMenuAnchor] = useState<{
      top: number
      left: number
    } | null>(null)
    const [toolsMenuAnchor, setToolsMenuAnchor] = useState<{
      top: number
      left: number
    } | null>(null)
    const [metaMenuAnchor, setMetaMenuAnchor] = useState<{
      top: number
      left: number
      maxHeight: number
    } | null>(null)
    const [budgetToastVisible, setBudgetToastVisible] = useState(false)
    const budgetToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const {
      isSupported: speechSupported,
      isListening,
      transcript,
      startListening,
      stopListening,
    } = useSpeechRecognition({
      onError: (message) => window.alert(message),
    })

    useEffect(() => {
      if (safeMediaImageEngines.length === 0) return
      setSelectedImageModelId((current) => {
        if (
          current &&
          safeMediaImageEngines.some((row) => row?.api_id === current)
        ) {
          return current
        }
        return safeMediaImageEngines[0]?.api_id ?? ''
      })
    }, [safeMediaImageEngines])

    useEffect(() => {
      if (safeMediaVideoEngines.length === 0) return
      setSelectedVideoModelId((current) => {
        if (
          current &&
          safeMediaVideoEngines.some((row) => row?.api_id === current)
        ) {
          return current
        }
        return safeMediaVideoEngines[0]?.api_id ?? ''
      })
    }, [safeMediaVideoEngines])

    useEffect(() => {
      latestValueRef.current = value
    }, [value])

    useEffect(() => {
      if (!isListening) return
      const base = speechBaseRef.current
      if (!transcript) return
      const gap = base.length > 0 && !/\s$/.test(base) ? ' ' : ''
      const merged = `${base}${gap}${transcript}`
      latestValueRef.current = merged
      onChange(merged)
    }, [isListening, onChange, transcript])

    useEffect(() => {
      if (!attachMenuOpen && !metaMenuOpen && !toolsMenuOpen) return
      function onDocMouseDown(e: MouseEvent) {
        const target = e.target as Node | null
        if (
          attachWrapRef.current?.contains(target) ||
          attachMenuRef.current?.contains(target) ||
          metaWrapRef.current?.contains(target) ||
          metaMenuRef.current?.contains(target) ||
          toolsWrapRef.current?.contains(target) ||
          toolsMenuRef.current?.contains(target)
        ) {
          return
        }
        setAttachMenuOpen(false)
        setMetaMenuOpen(false)
        setToolsMenuOpen(false)
      }
      function onKeyDown(e: globalThis.KeyboardEvent) {
        if (e.key === 'Escape') {
          setAttachMenuOpen(false)
          setMetaMenuOpen(false)
          setToolsMenuOpen(false)
        }
      }
      document.addEventListener('mousedown', onDocMouseDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('mousedown', onDocMouseDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    }, [attachMenuOpen, metaMenuOpen, toolsMenuOpen])

    useLayoutEffect(() => {
      if (!attachMenuOpen) {
        setAttachMenuAnchor(null)
        return
      }

      function updatePosition() {
        const button = attachButtonRef.current
        if (!button) return
        const rect = button.getBoundingClientRect()
        setAttachMenuAnchor({ top: rect.top, left: rect.left })
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }, [attachMenuOpen])

    useLayoutEffect(() => {
      if (!toolsMenuOpen) {
        setToolsMenuAnchor(null)
        return
      }

      function updatePosition() {
        const button = toolsButtonRef.current
        if (!button) return
        const rect = button.getBoundingClientRect()
        setToolsMenuAnchor({ top: rect.top, left: rect.left })
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }, [toolsMenuOpen])

    useLayoutEffect(() => {
      if (!metaMenuOpen) {
        setMetaMenuAnchor(null)
        return
      }

      function updatePosition() {
        const button = metaButtonRef.current
        if (!button) return
        const rect = button.getBoundingClientRect()
        const panelWidth = Math.min(window.innerWidth - 24, 448)
        const left = Math.min(
          Math.max(12, rect.left),
          window.innerWidth - panelWidth - 12,
        )
        const topGap = 8
        const maxHeight = Math.max(
          180,
          Math.min(window.innerHeight * 0.62, rect.top - topGap - 12),
        )
        setMetaMenuAnchor({ top: rect.top, left, maxHeight })
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }, [metaMenuOpen])

    useEffect(() => {
      if (disableAttachments) setAttachMenuOpen(false)
    }, [disableAttachments])

    useEffect(() => {
      if (disabled) {
        setAttachMenuOpen(false)
        setMetaMenuOpen(false)
        setToolsMenuOpen(false)
      }
    }, [disabled])

    useEffect(() => {
      if (!disableAttachments) return
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.previewUrl))
        return []
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
    }, [disableAttachments])

    useEffect(() => {
      if (disabled && isListening) {
        stopListening()
      }
    }, [disabled, isListening, stopListening])

    const dismissBudgetToast = useCallback(() => {
      if (budgetToastTimerRef.current) {
        clearTimeout(budgetToastTimerRef.current)
        budgetToastTimerRef.current = null
      }
      setBudgetToastVisible(false)
    }, [])

    const showBudgetExhaustedToast = useCallback(() => {
      if (budgetToastTimerRef.current) {
        clearTimeout(budgetToastTimerRef.current)
      }
      setBudgetToastVisible(true)
      budgetToastTimerRef.current = setTimeout(() => {
        setBudgetToastVisible(false)
        budgetToastTimerRef.current = null
      }, BUDGET_TOAST_DISMISS_MS)
    }, [])

    useEffect(() => {
      return () => {
        if (budgetToastTimerRef.current) {
          clearTimeout(budgetToastTimerRef.current)
        }
      }
    }, [])

    const handleMicToggle = useCallback(() => {
      if (disabled || !speechSupported) return
      if (isListening) {
        stopListening()
        return
      }
      speechBaseRef.current = latestValueRef.current
      startListening()
    }, [disabled, isListening, speechSupported, startListening, stopListening])

    useLayoutEffect(() => {
      const el = textareaRef.current
      if (!el) return

      const syncHeight = () => {
        el.style.height = 'auto'
        const computed = window.getComputedStyle(el)
        const lineHeight = Number.parseFloat(computed.lineHeight) || 20
        const verticalPadding =
          (Number.parseFloat(computed.paddingTop) || 0) +
          (Number.parseFloat(computed.paddingBottom) || 0)
        const verticalBorder =
          (Number.parseFloat(computed.borderTopWidth) || 0) +
          (Number.parseFloat(computed.borderBottomWidth) || 0)
        const maxHeight = lineHeight * 4 + verticalPadding + verticalBorder
        const nextHeight = Math.min(el.scrollHeight, maxHeight)
        el.style.height = `${nextHeight}px`
        el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
      }

      syncHeight()
      window.addEventListener('resize', syncHeight)
      return () => window.removeEventListener('resize', syncHeight)
    }, [value, disabled])

    useImperativeHandle(ref, () => ({
      focusField: () => {
        textareaRef.current?.focus()
      },
      showBudgetExhaustedToast,
      clearAttachments: () => {
        setAttachments((prev) => {
          prev.forEach((a) => {
            if (a.previewUrl.startsWith('blob:')) {
              URL.revokeObjectURL(a.previewUrl)
            }
          })
          return []
        })
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
      appendImageFiles: (files: File[]) => {
        if (disableAttachments || files.length === 0) return
        void (async () => {
          const compressed = await compressChatImageFile(files[0])
          if (!compressed) {
            window.alert(
              'JPG 또는 PNG 이미지만 첨부할 수 있습니다. (최대 1024px, 1MB)',
            )
            return
          }
          setAttachments((prev) => {
            prev.forEach((a) => {
              if (a.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(a.previewUrl)
              }
            })
            return [
              {
                id: randomId(),
                previewUrl: compressed.previewDataUrl,
                imageBase64: compressed.imageBase64,
                mimeType: compressed.mimeType,
                fileName: compressed.fileName,
              },
            ]
          })
        })()
      },
    }), [disableAttachments, showBudgetExhaustedToast])

    const ingestCompressedFile = useCallback(
      async (file: File) => {
        const compressed = await compressChatImageFile(file)
        if (!compressed) {
          window.alert(
            `지원하지 않는 형식이거나 압축에 실패했습니다: ${file.name}\nJPG·PNG만 가능하며, 최대 1024px·1MB 이하로 압축됩니다.`,
          )
          return
        }
        setAttachments((prev) => {
          prev.forEach((a) => {
            if (a.previewUrl.startsWith('blob:')) {
              URL.revokeObjectURL(a.previewUrl)
            }
          })
          return [
            {
              id: randomId(),
              previewUrl: compressed.previewDataUrl,
              imageBase64: compressed.imageBase64,
              mimeType: compressed.mimeType,
              fileName: compressed.fileName,
            },
          ]
        })
      },
      [],
    )

    const handlePickFiles = useCallback(
      (list: FileList | null) => {
        if (disableAttachments) return
        setAttachMenuOpen(false)
        if (!list?.length) return

        const file = list[0]
        void ingestCompressedFile(file).finally(() => {
          if (fileInputRef.current) fileInputRef.current.value = ''
        })
      },
      [disableAttachments, ingestCompressedFile],
    )

    const handlePaste = useCallback(
      (event: ClipboardEvent<HTMLTextAreaElement>) => {
        if (disableAttachments || disabled) return

        const data = event.clipboardData
        if (!data) return

        let imageFile: File | null = null

        if (data.items?.length) {
          for (let i = 0; i < data.items.length; i += 1) {
            const item = data.items[i]
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              imageFile = item.getAsFile()
              if (imageFile) break
            }
          }
        }

        if (!imageFile && data.files?.length) {
          const candidate = data.files[0]
          if (candidate.type.startsWith('image/')) {
            imageFile = candidate
          }
        }

        if (!imageFile) return

        event.preventDefault()
        const namedFile =
          imageFile.name.trim().length > 0
            ? imageFile
            : new File([imageFile], 'pasted-image.png', {
                type: imageFile.type || 'image/png',
              })
        void ingestCompressedFile(namedFile)
      },
      [disableAttachments, disabled, ingestCompressedFile],
    )

    function removeAttachment(id: string) {
      setAttachments((prev) => {
        const target = prev.find((a) => a.id === id)
        if (target?.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(target.previewUrl)
        }
        return prev.filter((a) => a.id !== id)
      })
    }

    const handleMediaAction = useCallback(
      async (actionType: 'image' | 'video'): Promise<boolean> => {
        if (disabled || !allowSend || !onMediaGenerate || mediaBusy || generating) {
          return false
        }
        const text = value.trim()
        if (!text) {
          window.alert(
            actionType === 'image'
              ? '만들고 싶은 이미지를 입력해 주세요.'
              : '만들고 싶은 동영상 장면을 입력해 주세요.',
          )
          return false
        }
        const mediaModelId =
          actionType === 'image' ? selectedImageModelId : selectedVideoModelId
        if (!mediaModelId.trim()) {
          window.alert('미디어 엔진을 선택해 주세요.')
          return false
        }
        setMediaBusy(actionType)
        try {
          await onMediaGenerate(actionType, text, mediaModelId)
          return true
        } finally {
          setMediaBusy(null)
        }
      },
      [
        allowSend,
        disabled,
        generating,
        mediaBusy,
        onMediaGenerate,
        selectedImageModelId,
        selectedVideoModelId,
        value,
      ],
    )

    function clearAttachments() {
      attachments.forEach((a) => {
        if (a.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(a.previewUrl)
        }
      })
      setAttachments([])
    }

    function submitMessage() {
      if (disabled || !allowSend) return
      if (isListening) stopListening()
      const text = value.trim()
      if (!text && attachments.length === 0) return

      if (
        onMediaGenerate &&
        (composerTool === 'image' || composerTool === 'video')
      ) {
        void (async () => {
          const ok = await handleMediaAction(composerTool)
          if (!ok) return
          onComposerToolChange?.(null)
          onChange('')
          clearAttachments()
        })()
        return
      }

      const first = attachments[0]
      clearAttachments()

      onSend({
        text: value,
        ...(first
          ? {
              imageBase64: first.imageBase64,
              mimeType: first.mimeType,
            }
          : {}),
        composerTool: composerTool ?? undefined,
      })
    }

    function handleSubmit(event: FormEvent) {
      event.preventDefault()
      submitMessage()
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        submitMessage()
      }
    }

    const canSend =
      !disabled &&
      allowSend &&
      !mediaBusy &&
      (value.trim().length > 0 || attachments.length > 0)

    const isGemini = variant === 'gemini'
    const isClaude = variant === 'claude'
    const isSoftShell = isClaude || isGemini

    const toolbarIdleBtn = isSoftShell
      ? 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800/80'
      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'

    const showDeepResearchToggle = typeof onDeepResearchChange === 'function'
    const showInternetSearchToggle =
      typeof onInternetSearchChange === 'function'
    const showComposerTools = typeof onComposerToolChange === 'function'
    const activeToolMeta = getComposerToolMeta(composerTool)

    function toggleComposerTool(id: ComposerToolMode) {
      const nextId = composerTool === id ? null : id
      onComposerToolChange?.(nextId)
      if (nextId === 'canvas') {
        onActiveModelChange?.('claude-sonnet-4-6')
      } else if (nextId) {
        onActiveModelChange?.('gemini-2.5-pro')
      }
      closeMenus()
    }

    function selectMediaEngine(
      toolId: 'image' | 'video',
      modelId: string,
    ) {
      if (toolId === 'image') {
        setSelectedImageModelId(modelId)
      } else {
        setSelectedVideoModelId(modelId)
      }
      onComposerToolChange?.(toolId)
      onDeepResearchChange?.(false)
      setMediaEnginePanel(toolId)
    }

    function renderMediaComposerTool(tool: (typeof COMPOSER_TOOLS)[number]) {
      if (tool.id !== 'image' && tool.id !== 'video') return null

      const mediaKind = tool.id
      const engines =
        mediaKind === 'image' ? safeMediaImageEngines : safeMediaVideoEngines
      const selectedModelId =
        mediaKind === 'image' ? selectedImageModelId : selectedVideoModelId
      const active = composerTool === mediaKind
      const panelOpen = mediaEnginePanel === mediaKind
      const busy = mediaBusy === mediaKind
      const engineName = mediaEngineLabel(engines, selectedModelId)

      return (
        <div
          key={tool.id}
          className="relative"
          onMouseEnter={() => {
            if (!disabled && !busy) setMediaEnginePanel(mediaKind)
          }}
          onMouseLeave={() => {
            setMediaEnginePanel((current) =>
              current === mediaKind ? null : current,
            )
          }}
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={active}
            aria-expanded={panelOpen}
            disabled={disabled || busy}
            className={toolboxMenuItemClass}
            onClick={() => {
              if (busy) return
              setMediaEnginePanel((current) =>
                current === mediaKind ? null : mediaKind,
              )
              toggleComposerTool(mediaKind)
              if (composerTool !== mediaKind) {
                onDeepResearchChange?.(false)
              }
            }}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-violet-700 dark:text-violet-300">
              {busy ? (
                <IconSpinner className="h-4 w-4" />
              ) : mediaKind === 'image' ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                {tool.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                {engineName || tool.hint}
              </span>
            </span>
            {active ? (
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
            ) : (
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
              </svg>
            )}
          </button>

          {panelOpen ? (
            <div className="absolute left-full top-0 z-[210] ml-2 hidden w-[min(22rem,calc(100vw-2rem))] md:block">
              <MediaEngineBentoPanel
                engines={engines}
                selectedModelId={selectedModelId}
                loading={mediaEnginesLoading}
                disabled={disabled || busy}
                onSelect={(modelId) => selectMediaEngine(mediaKind, modelId)}
              />
            </div>
          ) : null}

          {panelOpen && toolsMenuAnchor
            ? createPortal(
                <div className="fixed inset-x-3 bottom-[max(6.5rem,env(safe-area-inset-bottom))] z-[220] md:hidden">
                  <MediaEngineBentoPanel
                    engines={engines}
                    selectedModelId={selectedModelId}
                    loading={mediaEnginesLoading}
                    disabled={disabled || busy}
                    onSelect={(modelId) => selectMediaEngine(mediaKind, modelId)}
                  />
                </div>,
                document.body,
              )
            : null}
        </div>
      )
    }

    const toolboxPillClass = isSoftShell
      ? 'bg-stone-100/95 text-stone-700 hover:bg-stone-200/90 dark:bg-stone-800/95 dark:text-stone-200 dark:hover:bg-stone-700/90'
      : 'bg-slate-100/95 text-slate-700 hover:bg-slate-200/90 dark:bg-slate-800/95 dark:text-slate-200'

    const popupPanelClass = isSoftShell
      ? 'border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-900'
      : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900'

    const toolboxMenuItemClass =
      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-stone-800'

    const closeMenus = () => {
      setAttachMenuOpen(false)
      setMetaMenuOpen(false)
      setToolsMenuOpen(false)
      setMediaEnginePanel(null)
    }

    const metaPanelSurfaceClass = isSoftShell
      ? 'border-stone-200/80 bg-stone-50/95 dark:border-stone-700 dark:bg-stone-950/80'
      : 'border-slate-200 bg-slate-50/95 dark:border-slate-700 dark:bg-slate-900/80'

    const metaMenuPanel =
      metaMenuOpen && metaMenuAnchor && composerMeta
        ? createPortal(
            <div
              ref={metaMenuRef}
              role="dialog"
              aria-label="토큰·비용 추정"
              className={`chat-composer-popup-menu fixed z-[200] w-[min(calc(100vw-1.5rem),28rem)] -translate-y-[calc(100%+0.375rem)] rounded-xl border shadow-lg ${popupPanelClass}`}
              style={{
                top: metaMenuAnchor.top,
                left: metaMenuAnchor.left,
              }}
            >
              <div
                className={`composer-meta-rail overflow-y-auto overscroll-contain border-0 px-3 py-2.5 ${metaPanelSurfaceClass}`}
                style={{
                  fontSize: '11px',
                  lineHeight: 1.35,
                  maxHeight: metaMenuAnchor.maxHeight,
                }}
              >
                {composerMeta}
              </div>
            </div>,
            document.body,
          )
        : null

    const attachMenuPanel =
      attachMenuOpen && attachMenuAnchor
        ? createPortal(
            <div
              ref={attachMenuRef}
              role="menu"
              aria-label="첨부"
              className={`chat-composer-popup-menu fixed z-[200] min-w-[15rem] -translate-y-[calc(100%+0.375rem)] overflow-hidden rounded-xl border shadow-lg ${popupPanelClass}`}
              style={{
                top: attachMenuAnchor.top,
                left: attachMenuAnchor.left,
              }}
            >
              <div className="max-h-[60vh] overflow-y-auto py-1">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                  onClick={() => {
                    closeMenus()
                    queueMicrotask(() => fileInputRef.current?.click())
                  }}
                >
                  <span className="text-[13px] font-medium text-stone-800 dark:text-stone-100">
                    이미지 첨부
                  </span>
                  <span className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                    JPG, PNG · 최대 1024px · 1MB
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!onOpenWorkspaceTools}
                  className={`flex w-full flex-col px-3 py-2.5 text-left ${
                    onOpenWorkspaceTools
                      ? 'hover:bg-stone-100 dark:hover:bg-stone-800'
                      : 'cursor-not-allowed opacity-60'
                  }`}
                  onClick={() => {
                    if (!onOpenWorkspaceTools) return
                    closeMenus()
                    queueMicrotask(() => onOpenWorkspaceTools())
                  }}
                >
                  <span className="text-[13px] font-medium text-stone-800 dark:text-stone-100">
                    파일·문서 첨부
                  </span>
                  <span className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                    Google Drive · Microsoft 365
                  </span>
                </button>
              </div>
            </div>,
            document.body,
          )
        : null

    const composerMetaRail = composerMeta ? (
      <aside
        aria-label="입력 보조 정보"
        className={`composer-meta-rail hidden w-full shrink-0 overflow-y-auto overscroll-contain rounded-xl border px-2 py-1.5 shadow-sm md:block md:max-h-none md:w-[10.25rem] md:max-w-[10.25rem] md:self-stretch ${
          isSoftShell
            ? 'border-stone-200/80 bg-stone-50/95 dark:border-stone-700 dark:bg-stone-950/80'
            : 'border-slate-200 bg-slate-50/95 dark:border-slate-700 dark:bg-slate-900/80'
        }`}
        style={{
          fontSize: '11px',
          lineHeight: 1.35,
        }}
      >
        {composerMeta}
      </aside>
    ) : null

    return (
      <form
        onSubmit={handleSubmit}
        className={`relative mx-auto flex w-full flex-col gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:pb-0 ${
          embeddedInSlidesShell
            ? 'max-w-none'
            : composerMeta
              ? 'max-w-[calc(48rem+10.25rem+0.625rem)]'
              : 'max-w-3xl'
        }`}
      >
        {budgetToastVisible ? (
          <div
            role="alert"
            className="absolute bottom-full left-0 right-0 z-50 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 shadow-lg dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-100"
          >
            <p className="min-w-0 flex-1 leading-snug">{BUDGET_TOAST_MESSAGE}</p>
            <button
              type="button"
              onClick={dismissBudgetToast}
              className="shrink-0 rounded p-0.5 text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/50"
              aria-label="알림 닫기"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
        {!disableAttachments ? (
          <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => handlePickFiles(e.target.files)}
          />
          <input
            ref={documentInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              window.alert('일반 파일 업로드 기능은 서버 연동 준비 중입니다.')
              if (documentInputRef.current) documentInputRef.current.value = ''
            }}
          />
          </>
        ) : null}

        {attachments.length > 0 ? (
          <ChatAttachmentPreviewStrip
            layout="composer"
            variant={isGemini ? 'gemini' : isClaude ? 'claude' : 'default'}
            disabled={disabled}
            items={attachments.map((a) => ({
              src: a.previewUrl,
              alt: a.fileName,
              onRemove: () => removeAttachment(a.id),
            }))}
          />
        ) : null}

        <div
          className={`flex w-full flex-col gap-2 ${
            slidesMinimal ? '' : 'md:flex-row md:items-stretch md:gap-2.5'
          }`}
        >
          <div
            className={`min-w-0 flex-1 ${slidesMinimal ? 'max-w-none' : 'max-w-3xl'}`}
          >
        <div
          className={`overflow-visible ${
            embeddedInSlidesShell
              ? 'rounded-none border-0 bg-transparent shadow-none'
              : `rounded-[1.75rem] border shadow-sm ${
                  isSoftShell
                    ? 'border-stone-200/90 bg-white dark:border-stone-700 dark:bg-stone-900'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`
          }`}
        >
          <label htmlFor="chat-input-field" className="sr-only">
            메시지 입력
          </label>
          <div
            className={
              embeddedInSlidesShell
                ? 'px-0 pb-0 pt-0'
                : 'px-3 py-2 md:px-4 md:py-2'
            }
          >
            <div className="flex min-w-0 flex-col">
              {aboveTextareaContent}
              <textarea
                ref={textareaRef}
                id="chat-input-field"
                rows={1}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                style={{ fontSize: '14px' }}
                className={`box-border min-h-[1.5rem] max-h-[5.25rem] w-full min-w-0 resize-none overflow-y-hidden bg-transparent py-0.5 leading-snug outline-none ring-0 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSoftShell
                    ? 'text-stone-900 placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500'
                    : 'text-slate-900 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500'
                }`}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
              />

              <div
                className={`relative z-10 flex w-full flex-wrap items-center gap-x-2 gap-y-1 pt-1 md:pt-1.5 ${
                  slidesMinimal ? 'justify-end' : 'justify-between'
                }`}
              >
            {!slidesMinimal ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-visible whitespace-nowrap md:gap-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

              <div ref={toolsWrapRef} className="relative flex shrink-0 items-center gap-1">
                {activeToolMeta ? (
                  <span className="flex max-w-[8rem] items-center gap-0.5 rounded-full bg-violet-100 pl-2 pr-1 py-1 text-[10px] font-semibold text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
                    <span className="truncate">{activeToolMeta.label}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onComposerToolChange?.(null)
                      }}
                      className="shrink-0 rounded-full p-0.5 hover:bg-violet-200 dark:hover:bg-violet-900 transition"
                      title="기능 끄기"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ) : null}
                {deepResearchEnabled ? (
                  <span className="flex max-w-[8rem] items-center gap-0.5 rounded-full bg-violet-100 pl-2 pr-1 py-1 text-[10px] font-semibold text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
                    <span className="truncate">Deep Research</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeepResearchChange?.(false)
                      }}
                      className="shrink-0 rounded-full p-0.5 hover:bg-violet-200 dark:hover:bg-violet-900 transition"
                      title="기능 끄기"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ) : null}
                {internetSearchEnabled ? (
                  <span className="flex max-w-[8rem] items-center gap-0.5 rounded-full bg-violet-100 pl-2 pr-1 py-1 text-[10px] font-semibold text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
                    <span className="truncate">인터넷 검색</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onInternetSearchChange?.(false)
                      }}
                      className="shrink-0 rounded-full p-0.5 hover:bg-violet-200 dark:hover:bg-violet-900 transition"
                      title="기능 끄기"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ) : null}
                <button
                  ref={toolsButtonRef}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setAttachMenuOpen(false)
                    setMetaMenuOpen(false)
                    setToolsMenuOpen((open) => !open)
                  }}
                  aria-expanded={toolsMenuOpen}
                  aria-haspopup="menu"
                  className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 transition disabled:opacity-40 md:px-3 ${
                    activeToolMeta || deepResearchEnabled || internetSearchEnabled
                      ? 'bg-violet-200/90 text-violet-950 dark:bg-violet-900/50 dark:text-violet-50'
                      : toolboxPillClass
                  }`}
                  aria-label="도구"
                  title="도구 · AI 기능"
                >
                  <IconSliders className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] font-medium leading-none">도구</span>
                </button>
                {toolsMenuOpen && toolsMenuAnchor
                  ? createPortal(
                      <div
                        ref={toolsMenuRef}
                        role="menu"
                        id="chat-toolbox-menu"
                        aria-label="도구"
                        className={`chat-composer-popup-menu fixed z-[200] w-[min(19rem,calc(100vw-2rem))] -translate-y-[calc(100%+0.375rem)] overflow-hidden rounded-2xl border shadow-xl ${popupPanelClass}`}
                        style={{
                          top: toolsMenuAnchor.top,
                          left: toolsMenuAnchor.left,
                        }}
                      >
                    <div className="border-b border-stone-100 px-3 py-2.5 dark:border-stone-700">
                      <p className="text-[13px] font-semibold text-stone-900 dark:text-stone-50">
                        도구
                      </p>
                    </div>
                    <div className="max-h-[min(24.5rem,50vh)] overflow-y-auto overflow-x-hidden overscroll-contain py-1">
                      {!disableAttachments ? (
                        <>
                        <button
                          type="button"
                          role="menuitem"
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            closeMenus()
                            queueMicrotask(() => fileInputRef.current?.click())
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-stone-600 dark:text-stone-300">
                            <IconPlus className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                              이미지 첨부
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                              JPG, PNG · 최대 1024px · 1MB
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!onOpenWorkspaceTools}
                          className={`${toolboxMenuItemClass} ${!onOpenWorkspaceTools ? 'cursor-not-allowed opacity-60' : ''}`}
                          onClick={() => {
                            if (!onOpenWorkspaceTools) return
                            closeMenus()
                            queueMicrotask(() => onOpenWorkspaceTools())
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-stone-600 dark:text-stone-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                              파일·문서 첨부
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                              Google Drive · Microsoft 365
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            closeMenus()
                            queueMicrotask(() => documentInputRef.current?.click())
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-stone-600 dark:text-stone-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                              로컬 파일 업로드
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                              PDF, DOCX, TXT 등 다양한 포맷 지원
                            </span>
                          </span>
                        </button>
                        <div className="mx-3 my-1 border-t border-stone-100 dark:border-stone-700" />
                        </>
                      ) : null}
                      {showDeepResearchToggle ? (
                        <button
                          id="deep-research-toggle"
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={deepResearchEnabled}
                          disabled={disabled}
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            const next = !deepResearchEnabled
                            onDeepResearchChange?.(next)
                            if (next) {
                              onComposerToolChange?.(null)
                              onActiveModelChange?.('gemini-2.5-pro')
                            }
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-violet-700 dark:text-violet-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                              Deep Research
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                              Claude·GPT·Gemini 교차 검증
                            </span>
                          </span>
                          {deepResearchEnabled ? (
                            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
                          ) : null}
                        </button>
                      ) : null}

                      {showInternetSearchToggle ? (
                        <button
                          id="internet-search-toggle"
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={internetSearchEnabled}
                          disabled={disabled}
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            const next = !internetSearchEnabled
                            onInternetSearchChange?.(next)
                            if (next) {
                              onActiveModelChange?.('gemini-2.5-pro')
                            }
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-sky-700 dark:text-sky-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                              인터넷 검색
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                              Gemini·Claude·GPT 실시간 웹 정보
                            </span>
                          </span>
                          {internetSearchEnabled ? (
                            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
                          ) : null}
                        </button>
                      ) : null}

                      {showComposerTools
                        ? COMPOSER_TOOLS.map((tool) => {
                            if (tool.id === 'image' || tool.id === 'video') {
                              return renderMediaComposerTool(tool)
                            }
                            const active = composerTool === tool.id
                            return (
                              <button
                                key={tool.id}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={active}
                                disabled={disabled}
                                className={toolboxMenuItemClass}
                                onClick={() => {
                                  toggleComposerTool(tool.id)
                                  if (tool.id !== composerTool) {
                                    onDeepResearchChange?.(false)
                                  }
                                }}
                              >
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-violet-700 dark:text-violet-300">
                                  {tool.id === 'canvas' ? (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                                    </svg>
                                  ) : (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M6.75 8.25l4.72-4.72a.75.75 0 011.28.53V15.25a.75.75 0 01-1.28.53l-4.72-4.72H4.51A2.25 2.25 0 012.25 9.25v-1.5A2.25 2.25 0 014.51 5.5h2.24z" />
                                    </svg>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">
                                    {tool.label}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                                    {tool.hint}
                                  </span>
                                </span>
                                {active ? (
                                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />
                                ) : null}
                              </button>
                            )
                          })
                        : null}

                      {onOpenReferenceRoom ? (
                        <button
                          type="button"
                          role="menuitem"
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            closeMenus()
                            onOpenReferenceRoom()
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-orange-800 dark:text-orange-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">사내 자료실</span>
                            <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">문서·드라이브 참조</span>
                          </span>
                        </button>
                      ) : null}

                      {onOpenNotebook ? (
                        <button
                          type="button"
                          role="menuitem"
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            closeMenus()
                            onOpenNotebook()
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-orange-800 dark:text-orange-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">노트북 워크스페이스</span>
                            <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">RAG · 사내 문서 분석</span>
                          </span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        role="menuitem"
                        className={toolboxMenuItemClass}
                        onClick={() => {
                          closeMenus()
                          onChange('학습 가이드 작성 요청:\n\n')
                          setTimeout(() => textareaRef.current?.focus(), 0)
                        }}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-stone-500">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">가이드 학습</span>
                          <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">새로운 내용 공부하고 배우기</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        className={toolboxMenuItemClass}
                        onClick={() => {
                          closeMenus()
                          onChange('개인 데이터 분석 요청:\n\n')
                          setTimeout(() => textareaRef.current?.focus(), 0)
                        }}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-stone-500">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">개인 인텔리전스 Labs</span>
                          <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">데이터 분석 요청</span>
                        </span>
                      </button>

                      {onOpenWorkspaceTools ? (
                        <button
                          type="button"
                          role="menuitem"
                          className={toolboxMenuItemClass}
                          onClick={() => {
                            closeMenus()
                            onOpenWorkspaceTools()
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-orange-800 dark:text-orange-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">워크스페이스 연동</span>
                            <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">Google · Microsoft</span>
                          </span>
                        </button>
                      ) : null}

                      {onOpenSettings ? (
                        <button
                          type="button"
                          role="menuitem"
                          className={`${toolboxMenuItemClass} border-t border-stone-100 dark:border-stone-800`}
                          onClick={() => {
                            closeMenus()
                            onOpenSettings()
                          }}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-stone-600 dark:text-stone-300">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-stone-900 dark:text-stone-50">채팅 맞춤설정</span>
                            <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">프로필 · AI 선호 설정</span>
                          </span>
                        </button>
                      ) : null}
                    </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>

              {composerMeta ? (
                <div ref={metaWrapRef} className="relative shrink-0 md:hidden">
                  <button
                    ref={metaButtonRef}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setAttachMenuOpen(false)
                      setToolsMenuOpen(false)
                      setMetaMenuOpen((open) => !open)
                    }}
                    aria-expanded={metaMenuOpen}
                    aria-haspopup="dialog"
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${toolboxPillClass}`}
                    aria-label="토큰·비용 추정"
                    title="토큰·비용 추정"
                  >
                    <IconTokenCost className="h-4 w-4 shrink-0" />
                  </button>
                </div>
              ) : null}

              {toolbarBeforeSend ? (
                <div className="relative z-10 inline-flex min-w-0 max-w-[min(72vw,20rem)] shrink items-center gap-1">
                  {toolbarBeforeSend}
                </div>
              ) : null}
            </div>
            ) : null}

            <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-0.5 md:gap-1">
              {!slidesMinimal ? belowInputRow : null}

              {!slidesMinimal && speechSupported ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleMicToggle}
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 md:h-9 md:w-9 ${
                    isListening
                      ? 'animate-pulse bg-red-100 text-red-600 ring-2 ring-red-500/60 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-400/50'
                      : `${toolbarIdleBtn} rounded-full`
                  }`}
                  aria-label={isListening ? '음성 입력 중지' : '음성 입력'}
                  aria-pressed={isListening}
                  title={
                    isListening
                      ? '녹음 중 — 다시 누르면 중지'
                      : '음성 입력 (한국어 · Web Speech API)'
                  }
                >
                  {isListening ? (
                    <span
                      className="pointer-events-none absolute inset-0 rounded-full bg-red-500/20 motion-safe:animate-ping"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="relative inline-flex items-center gap-0.5">
                    {isListening ? (
                      <>
                        <span
                          className="h-2.5 w-0.5 animate-pulse rounded-full bg-red-500 motion-safe:animate-bounce [animation-delay:0ms] dark:bg-red-400"
                          aria-hidden="true"
                        />
                        <span
                          className="h-3.5 w-0.5 animate-pulse rounded-full bg-red-500 motion-safe:animate-bounce [animation-delay:120ms] dark:bg-red-400"
                          aria-hidden="true"
                        />
                        <span
                          className="h-2 w-0.5 animate-pulse rounded-full bg-red-500 motion-safe:animate-bounce [animation-delay:240ms] dark:bg-red-400"
                          aria-hidden="true"
                        />
                      </>
                    ) : (
                      <IconVoiceWave className="relative h-4 w-4 md:h-[18px] md:w-[18px]" />
                    )}
                  </span>
                </button>
              ) : null}

              {generating && onStopGenerating ? (
                <button
                  type="button"
                  onClick={onStopGenerating}
                  aria-label="생성 중지"
                  title="생성 중지"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition md:h-9 md:w-9 ${
                    isGemini
                      ? 'bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#063078]'
                      : isSoftShell
                        ? 'bg-orange-700 hover:bg-orange-800 active:bg-orange-900'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                  }`}
                >
                  <IconStopSquare className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="전송"
                  title="전송 (Enter)"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 md:h-9 md:w-9 ${
                    isGemini
                      ? 'bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#063078]'
                      : isSoftShell
                        ? 'bg-orange-700 hover:bg-orange-800 active:bg-orange-900'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                  }`}
                >
                  <svg
                    className="h-3.5 w-3.5 md:h-4 md:w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.25}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 17V10m0 0l-3 3m3-3l3 3"
                    />
                  </svg>
                </button>
              )}
            </div>
              </div>
            </div>
          </div>
        </div>
          </div>
          {!slidesMinimal ? composerMetaRail : null}
        </div>
        {attachMenuPanel}
        {metaMenuPanel}
      </form>
    )
  },
)

ChatInput.displayName = 'ChatInput'
