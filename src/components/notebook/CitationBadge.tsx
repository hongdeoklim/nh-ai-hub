import { CitationTooltip } from '../chat/CitationTooltip'
import type { NotebookChunkCitation } from '../../types/notebook'

type CitationBadgeProps = {
  marker: string
  citation?: NotebookChunkCitation
  variant?: 'default' | 'claude'
}

export function CitationBadge({
  marker,
  citation,
  variant = 'claude',
}: CitationBadgeProps) {
  const title = citation?.filename ?? marker
  const snippet = citation
    ? [
        citation.pageNumber != null ? `p.${citation.pageNumber}` : null,
        citation.matchedText,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <CitationTooltip
      marker={marker}
      title={title}
      snippet={snippet}
      variant={variant}
    />
  )
}
