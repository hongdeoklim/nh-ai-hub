import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { useChatArtifact } from '../../store/chat-artifact'
import { ArtifactPanel } from './ArtifactPanel'

type ChatArtifactLayoutProps = {
  children: ReactNode
  className?: string
}

export function ChatArtifactLayout({
  children,
  className = '',
}: ChatArtifactLayoutProps) {
  const { activeArtifact, closeArtifact } = useChatArtifact()
  const open = activeArtifact !== null
  const [sheetEntered, setSheetEntered] = useState(false)
  // 닫히면 진입 애니메이션 상태를 되돌린다 (렌더 중 조정 — 다시 열 때 처음부터 슬라이드)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) setSheetEntered(false)
  }

  useEffect(() => {
    if (!open) return
    let frame2 = 0
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setSheetEntered(true))
    })
    return () => {
      cancelAnimationFrame(frame1)
      cancelAnimationFrame(frame2)
    }
  }, [open])

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden transition-all duration-300 md:flex-row ${className}`}
    >
      <div
        className={`flex min-h-0 min-w-0 flex-col transition-all duration-300 ${
          open
            ? 'md:w-2/5 md:max-w-[42%] md:flex-none md:border-r md:border-border'
            : 'flex-1'
        }`}
      >
        {children}
      </div>

      {open && activeArtifact ? (
        <>
          <button
            type="button"
            className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] transition-opacity duration-300 md:hidden ${
              sheetEntered ? 'opacity-100' : 'opacity-0'
            }`}
            aria-label="아티팩트 닫기"
            onClick={closeArtifact}
          />

          <div
            className={`fixed inset-0 z-50 flex flex-col bg-[#FAFAF8] transition-transform duration-300 ease-out md:relative md:inset-auto md:z-0 md:max-h-none md:w-3/5 md:flex-1 md:translate-y-0 md:bg-transparent md:shadow-none ${
              sheetEntered ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
            }`}
          >
            <div className="mx-auto mt-[max(0.5rem,env(safe-area-inset-top))] h-1 w-10 shrink-0 rounded-full bg-surface-3 md:hidden" />
            <ArtifactPanel artifact={activeArtifact} onClose={closeArtifact} />
          </div>
        </>
      ) : null}
    </div>
  )
}
