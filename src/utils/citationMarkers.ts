import type { ChatCitationSource } from '../types/chat-citations'

export type CitationTextPart =
  | { kind: 'text'; value: string }
  | {
      kind: 'citation'
      marker: string
      title: string
      snippet?: string
    }

const CITATION_MARKER_RE =
  /\[(\d{1,2})\]|\[출처:\s*([^\]]+?)\]|\[([^\[\]]+\.(?:pdf|docx?|xlsx?|pptx?|hwp|txt|md))\]/gi

function truncateSnippet(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function resolveNumericCitation(
  num: number,
  citations: ChatCitationSource[],
): ChatCitationSource | undefined {
  return citations.find((c) => c.index === num)
}

function resolveTitleCitation(
  label: string,
  citations: ChatCitationSource[],
): ChatCitationSource | undefined {
  const needle = label.trim().toLowerCase()
  if (!needle) return undefined
  return citations.find((c) => c.title.toLowerCase().includes(needle))
}

export function splitTextByCitationMarkers(
  text: string,
  citations: ChatCitationSource[],
): CitationTextPart[] {
  if (!text) return []

  const parts: CitationTextPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  CITATION_MARKER_RE.lastIndex = 0
  while ((match = CITATION_MARKER_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index)
    if (before) parts.push({ kind: 'text', value: before })

    const marker = match[0]
    let resolved: ChatCitationSource | undefined

    if (match[1]) {
      resolved = resolveNumericCitation(Number.parseInt(match[1], 10), citations)
    } else if (match[2]) {
      resolved = resolveTitleCitation(match[2], citations)
    } else if (match[3]) {
      resolved = resolveTitleCitation(match[3], citations)
    }

    parts.push({
      kind: 'citation',
      marker,
      title: resolved?.title ?? (match[2] ?? match[3] ?? `출처 ${match[1] ?? ''}`).trim(),
      snippet: resolved?.snippet,
    })

    lastIndex = match.index + marker.length
  }

  const tail = text.slice(lastIndex)
  if (tail) parts.push({ kind: 'text', value: tail })

  return parts.length > 0 ? parts : [{ kind: 'text', value: text }]
}

export function extractCitationsFromSearchSimilarCasesOutput(
  output: unknown,
): ChatCitationSource[] {
  if (!output || typeof output !== 'object') return []
  const payload = output as {
    ok?: boolean
    cases?: Array<{
      id?: string
      title?: string
      content?: string
    }>
  }
  if (!payload.ok || !Array.isArray(payload.cases)) return []

  return payload.cases.map((row, i) => ({
    index: i + 1,
    title: String(row.title ?? `사내 사례 ${i + 1}`).trim(),
    snippet: row.content ? truncateSnippet(String(row.content)) : undefined,
    sourceType: 'work_case' as const,
    id: typeof row.id === 'string' ? row.id : undefined,
  }))
}

export function mergeCitationSources(
  existing: ChatCitationSource[],
  incoming: ChatCitationSource[],
): ChatCitationSource[] {
  const seen = new Set(existing.map((c) => c.id ?? `${c.title}:${c.index}`))
  const merged = [...existing]
  let nextIndex =
    existing.reduce((max, c) => Math.max(max, c.index), 0) + 1

  for (const source of incoming) {
    const key = source.id ?? `${source.title}:${source.index}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({
      ...source,
      index: source.index > 0 ? source.index : nextIndex++,
    })
  }

  return merged
    .sort((a, b) => a.index - b.index)
    .map((c, i) => ({ ...c, index: i + 1 }))
}
