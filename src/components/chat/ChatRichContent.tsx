import { useCallback, useMemo, useState } from 'react'

import type { ChatCitationSource } from '../../types/chat-citations'
import { ChatMarkdownBlock } from './ChatMarkdownBlock'
import {
  ChatMediaLightbox,
  type ChatMediaLightboxItem,
} from './ChatMediaLightbox'

type ContentSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; language: string; value: string }
  | { kind: 'image'; alt: string; url: string }
  | { kind: 'audio'; src: string }

const CODE_FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
const AUDIO_TAG_RE = /<audio\s+[^>]*src="([^"]+)"[^>]*>\s*<\/audio>/gi
const BARE_IMAGE_URL_RE =
  /(https?:\/\/[^\s<>"']+\.(?:png|jpe?g|gif|webp)(?:\?[^\s<>"']*)?)/gi

function parseRichSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const pushText = (raw: string) => {
    const t = raw
    if (!t) return

    let textLast = 0
    const imageParts: ContentSegment[] = []
    MD_IMAGE_RE.lastIndex = 0
    let imgMatch: RegExpExecArray | null
    while ((imgMatch = MD_IMAGE_RE.exec(t)) !== null) {
      const before = t.slice(textLast, imgMatch.index)
      if (before) imageParts.push({ kind: 'text', value: before })
      imageParts.push({
        kind: 'image',
        alt: imgMatch[1] ?? '',
        url: imgMatch[2],
      })
      textLast = imgMatch.index + imgMatch[0].length
    }
    let tail = t.slice(textLast)
    if (tail) {
      AUDIO_TAG_RE.lastIndex = 0
      const audioMatch = AUDIO_TAG_RE.exec(tail)
      if (audioMatch?.index !== undefined) {
        const beforeAudio = tail.slice(0, audioMatch.index)
        if (beforeAudio) imageParts.push({ kind: 'text', value: beforeAudio })
        imageParts.push({ kind: 'audio', src: audioMatch[1] })
        tail = tail.slice(audioMatch.index + audioMatch[0].length)
      }
      if (tail) {
        BARE_IMAGE_URL_RE.lastIndex = 0
        let urlLast = 0
        let urlMatch: RegExpExecArray | null
        while ((urlMatch = BARE_IMAGE_URL_RE.exec(tail)) !== null) {
          const beforeUrl = tail.slice(urlLast, urlMatch.index)
          if (beforeUrl) imageParts.push({ kind: 'text', value: beforeUrl })
          imageParts.push({
            kind: 'image',
            alt: '이미지',
            url: urlMatch[1],
          })
          urlLast = urlMatch.index + urlMatch[0].length
        }
        const urlTail = tail.slice(urlLast)
        if (urlTail) imageParts.push({ kind: 'text', value: urlTail })
      }
    }

    if (imageParts.length === 0) {
      segments.push({ kind: 'text', value: t })
    } else {
      segments.push(...imageParts)
    }
  }

  CODE_FENCE_RE.lastIndex = 0
  while ((match = CODE_FENCE_RE.exec(content)) !== null) {
    pushText(content.slice(lastIndex, match.index))
    segments.push({
      kind: 'code',
      language: (match[1] ?? '').trim(),
      value: match[2].replace(/\n$/, ''),
    })
    lastIndex = match.index + match[0].length
  }
  pushText(content.slice(lastIndex))

  return segments.length > 0 ? segments : [{ kind: 'text', value: content }]
}

type ChatRichContentProps = {
  content: string
  variant?: 'default' | 'claude' | 'gemini'
  citations?: ChatCitationSource[]
}

function CodeCanvasPanel({
  language,
  code,
  variant,
}: {
  language: string
  code: string
  variant: 'default' | 'claude' | 'gemini'
}) {
  const [copied, setCopied] = useState(false)
  const isGemini = variant === 'gemini'

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.alert('복사에 실패했습니다.')
    }
  }, [code])

  return (
    <div
      className={`my-2 overflow-hidden rounded-xl border shadow-sm ${
        isGemini
          ? 'border-[#c4c7c5] bg-[#f8fafd] dark:border-stone-700 dark:bg-stone-950'
          : variant === 'claude'
          ? 'border-stone-200 bg-stone-950 dark:border-stone-700'
          : 'border-slate-700 bg-slate-950'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
            isGemini
              ? 'text-[#444746] hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10'
              : 'text-stone-300 hover:bg-white/10'
          }`}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre
        className={`max-h-[min(24rem,50vh)] overflow-auto p-3 text-[13px] leading-relaxed ${
          isGemini ? 'text-[#1f1f1f] dark:text-stone-200' : 'text-emerald-100'
        }`}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

function CitationAwareMarkdown({
  text,
  citations,
  variant,
}: {
  text: string
  citations: ChatCitationSource[]
  variant: 'default' | 'claude' | 'gemini'
}) {
  return (
    <ChatMarkdownBlock content={text} variant={variant} citations={citations} />
  )
}

export function ChatRichContent({
  content,
  variant = 'claude',
  citations = [],
}: ChatRichContentProps) {
  const segments = useMemo(() => parseRichSegments(content), [content])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const imageItems: ChatMediaLightboxItem[] = useMemo(
    () =>
      segments
        .filter((s): s is Extract<ContentSegment, { kind: 'image' }> =>
          s.kind === 'image',
        )
        .map((s) => ({ src: s.url, alt: s.alt })),
    [segments],
  )

  let imageCursor = -1

  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          if (!seg.value.trim()) return null
          return (
            <div key={`t-${i}`}>
              <CitationAwareMarkdown
                text={seg.value}
                citations={citations}
                variant={variant}
              />
            </div>
          )
        }
        if (seg.kind === 'code') {
          return (
            <CodeCanvasPanel
              key={`c-${i}`}
              language={seg.language}
              code={seg.value}
              variant={variant}
            />
          )
        }
        if (seg.kind === 'audio') {
          return (
            <audio
              key={`a-${i}`}
              controls
              src={seg.src}
              className="my-2 w-full max-w-md"
            />
          )
        }
        imageCursor += 1
        const imgIdx = imageCursor
        return (
          <button
            key={`img-${i}`}
            type="button"
            onClick={() => setLightboxIndex(imgIdx)}
            className="group relative my-2 block w-full max-w-md overflow-hidden rounded-xl border border-stone-200/80 bg-stone-100 dark:border-stone-600 dark:bg-stone-900"
          >
            <img
              src={seg.url}
              alt={seg.alt}
              className="max-h-72 w-full object-contain transition group-hover:brightness-95"
              loading="lazy"
            />
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
              크게 보기
            </span>
          </button>
        )
      })}

      <ChatMediaLightbox
        open={lightboxIndex !== null && imageItems.length > 0}
        items={imageItems}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  )
}
