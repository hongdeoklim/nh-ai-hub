import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ArtifactType = 'markdown' | 'html' | 'code' | 'table'

export type ChatArtifact = {
  title: string
  content: string
  type: ArtifactType
}

type ChatArtifactContextValue = {
  activeArtifact: ChatArtifact | null
  openArtifact: (artifact: ChatArtifact) => void
  closeArtifact: () => void
}

const ChatArtifactContext = createContext<ChatArtifactContextValue | null>(null)

export function ChatArtifactProvider({ children }: { children: ReactNode }) {
  const [activeArtifact, setActiveArtifact] = useState<ChatArtifact | null>(
    null,
  )

  const openArtifact = useCallback((artifact: ChatArtifact) => {
    setActiveArtifact(artifact)
  }, [])

  const closeArtifact = useCallback(() => {
    setActiveArtifact(null)
  }, [])

  const value = useMemo(
    () => ({ activeArtifact, openArtifact, closeArtifact }),
    [activeArtifact, openArtifact, closeArtifact],
  )

  return (
    <ChatArtifactContext.Provider value={value}>
      {children}
    </ChatArtifactContext.Provider>
  )
}

export function useChatArtifact(): ChatArtifactContextValue {
  const ctx = useContext(ChatArtifactContext)
  if (!ctx) {
    return {
      activeArtifact: null,
      openArtifact: () => {},
      closeArtifact: () => {},
    }
  }
  return ctx
}
