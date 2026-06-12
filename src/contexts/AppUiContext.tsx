import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type NewChatHandler = () => void
type OpenSettingsHandler = () => void

export type PromptPanelRegistration = {
  expanded: boolean
  toggle: () => void
  regionId: string
}

type AppUiContextValue = {
  /** 대화 화면에서 새 채팅 로직을 등록합니다. */
  registerNewChatHandler: (handler: NewChatHandler | null) => void
  /** Dashboard 미마운트 시 MainLayout 등에서 새 채팅 경로로 이동합니다. */
  registerNewChatFallback: (handler: NewChatHandler | null) => void
  /** 사이드바 등 어디서든 새 채팅을 요청합니다. */
  requestNewChat: () => void
  /** MainLayout 설정 다이얼로그를 엽니다. */
  openSettings: () => void
  registerOpenSettingsHandler: (handler: OpenSettingsHandler | null) => void
  /** 대화(Dashboard)에서만 프롬프트 패널 토글을 사이드바 상단에 노출합니다. */
  promptPanel: PromptPanelRegistration | null
  registerPromptPanel: (reg: PromptPanelRegistration | null) => void
}

const AppUiContext = createContext<AppUiContextValue | null>(null)

export function AppUiProvider({ children }: { children: ReactNode }) {
  const newChatRef = useRef<NewChatHandler | null>(null)
  const newChatFallbackRef = useRef<NewChatHandler | null>(null)
  const openSettingsRef = useRef<OpenSettingsHandler | null>(null)
  const [promptPanel, setPromptPanel] = useState<PromptPanelRegistration | null>(
    null,
  )

  const registerNewChatHandler = useCallback((handler: NewChatHandler | null) => {
    newChatRef.current = handler
  }, [])

  const registerNewChatFallback = useCallback((handler: NewChatHandler | null) => {
    newChatFallbackRef.current = handler
  }, [])

  const registerOpenSettingsHandler = useCallback(
    (handler: OpenSettingsHandler | null) => {
      openSettingsRef.current = handler
    },
    [],
  )

  const registerPromptPanel = useCallback(
    (reg: PromptPanelRegistration | null) => {
      setPromptPanel(reg)
    },
    [],
  )

  const requestNewChat = useCallback(() => {
    const fn = newChatRef.current ?? newChatFallbackRef.current
    if (fn) fn()
    else window.dispatchEvent(new CustomEvent('nh-ai:new-chat'))
  }, [])

  const openSettings = useCallback(() => {
    openSettingsRef.current?.()
  }, [])

  const value = useMemo(
    () => ({
      registerNewChatHandler,
      registerNewChatFallback,
      requestNewChat,
      openSettings,
      registerOpenSettingsHandler,
      promptPanel,
      registerPromptPanel,
    }),
    [
      registerNewChatHandler,
      registerNewChatFallback,
      requestNewChat,
      openSettings,
      registerOpenSettingsHandler,
      promptPanel,
      registerPromptPanel,
    ],
  )

  return <AppUiContext.Provider value={value}>{children}</AppUiContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- 컨텍스트 표준 패턴
export function useAppUi(): AppUiContextValue {
  const ctx = useContext(AppUiContext)
  if (!ctx) {
    throw new Error('useAppUi는 AppUiProvider 안에서만 사용할 수 있습니다.')
  }
  return ctx
}
