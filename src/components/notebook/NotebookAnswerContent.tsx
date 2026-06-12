import { useMemo } from 'react'

import type { NotebookChunkCitation } from '../../types/notebook'
import { notebookCitationsToChatSources } from '../../services/ai/notebookRag'
import { splitTextByCitationMarkers } from '../../utils/citationMarkers'
import { CitationBadge } from './CitationBadge'

type NotebookAnswerContentProps = {
  content: string
  citations?: NotebookChunkCitation[]
}

export function NotebookAnswerContent({
  content,
  citations = [],
}: NotebookAnswerContentProps) {
  const chatSources = useMemo(
    () => notebookCitationsToChatSources(citations),
    [citations],
  )

  const parts = useMemo(
    () => splitTextByCitationMarkers(content, chatSources),
    [content, chatSources],
  )

  const citationByIndex = useMemo(() => {
    const map = new Map<number, NotebookChunkCitation>()
    for (const c of citations) {
      map.set(c.index, c)
    }
    return map
  }, [citations])

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800 dark:text-stone-100">
      {parts.map((part, i) => {
        if (part.kind === 'text') {
          return <span key={`t-${i}`}>{part.value}</span>
        }
        const numMatch = /\[(\d{1,2})\]/.exec(part.marker)
        const idx = numMatch ? Number.parseInt(numMatch[1], 10) : undefined
        const resolved = idx != null ? citationByIndex.get(idx) : undefined
        return (
          <CitationBadge
            key={`c-${i}-${part.marker}`}
            marker={part.marker}
            citation={resolved}
          />
        )
      })}
    </p>
  )
}
