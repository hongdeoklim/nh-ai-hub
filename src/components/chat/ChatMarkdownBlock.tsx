import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { ChatCitationSource } from '../../types/chat-citations'
import { normalizeAiMarkdown } from '../../utils/normalize-ai-markdown'
import { splitTextByCitationMarkers } from '../../utils/citationMarkers'
import { CitationTooltip } from './CitationTooltip'
import { RechartsRenderer } from './RechartsRenderer'

type MarkdownVariant = 'default' | 'claude' | 'gemini'

function buildMarkdownComponents(variant: MarkdownVariant): Components {
  const isGemini = variant === 'gemini'
  const isClaude = variant === 'claude'

  const textCls = isGemini
    ? 'text-actual-14 text-[#1f1f1f] dark:text-stone-100'
    : isClaude
      ? 'text-[15px] text-stone-900 dark:text-stone-100'
      : 'text-sm text-slate-800 dark:text-slate-100'

  const strongCls = isGemini
    ? 'font-semibold text-[#1f1f1f] dark:text-stone-50'
    : isClaude
      ? 'font-semibold text-stone-900 dark:text-stone-50'
      : 'font-semibold text-slate-900 dark:text-slate-50'

  const linkCls = isGemini
    ? 'font-medium text-[#0b57d0] underline decoration-[#0b57d0]/35 underline-offset-2 hover:decoration-[#0b57d0] dark:text-blue-400'
    : isClaude
      ? 'font-medium text-orange-800 underline underline-offset-2 hover:text-orange-950 dark:text-orange-300'
      : 'font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-400'

  const codeInlineCls = isGemini
    ? 'rounded-md bg-[#eef2f8] px-1.5 py-0.5 font-mono text-[0.88em] text-[#1f1f1f] dark:bg-stone-800 dark:text-stone-100'
    : isClaude
      ? 'rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[0.88em] dark:bg-stone-800'
      : 'rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[0.88em] dark:bg-slate-800'

  const tableWrapCls = isGemini
    ? 'my-3 overflow-x-auto rounded-xl border border-[#e3e3e3] dark:border-stone-700'
    : isClaude
      ? 'my-3 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700'
      : 'my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700'

  const thCls = isGemini
    ? 'border-b border-[#e3e3e3] bg-[#f0f4f9] px-3 py-2 text-left text-actual-13 font-semibold text-[#1f1f1f] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100'
    : isClaude
      ? 'border-b border-stone-200 bg-stone-100 px-3 py-2 text-left text-[13px] font-semibold dark:border-stone-700 dark:bg-stone-800'
      : 'border-b border-slate-200 bg-slate-100 px-3 py-2 text-left text-[13px] font-semibold dark:border-slate-700 dark:bg-slate-800'

  const tdCls = isGemini
    ? 'border-b border-[#e3e3e3] px-3 py-2 align-top text-actual-13 text-[#1f1f1f] dark:border-stone-800 dark:text-stone-100'
    : isClaude
      ? 'border-b border-stone-200 px-3 py-2 align-top text-[13px] dark:border-stone-800'
      : 'border-b border-slate-200 px-3 py-2 align-top text-[13px] dark:border-slate-800'

  return {
    p: ({ children }) => (
      <p className={`mb-3 last:mb-0 leading-relaxed ${textCls}`}>{children}</p>
    ),
    strong: ({ children }) => <strong className={strongCls}>{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    h1: ({ children }) => (
      <h1 className={`mb-3 mt-4 text-xl font-semibold leading-snug first:mt-0 ${textCls}`}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className={`mb-2.5 mt-4 text-lg font-semibold leading-snug first:mt-0 ${textCls}`}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className={`mb-2 mt-3 text-base font-semibold leading-snug first:mt-0 ${textCls}`}>
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className={`mb-2 mt-3 text-[15px] font-semibold leading-snug first:mt-0 ${textCls}`}>
        {children}
      </h4>
    ),
    ul: ({ children }) => (
      <ul className={`my-2 list-disc space-y-1.5 pl-5 ${textCls}`}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={`my-2 list-decimal space-y-1.5 pl-5 ${textCls}`}>{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed [&>p]:mb-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={`my-3 border-l-4 pl-3 italic ${
          isGemini
            ? 'border-[#c4c7c5] text-[#444746] dark:border-stone-600 dark:text-stone-400'
            : isClaude
              ? 'border-orange-300 text-stone-600 dark:border-orange-800 dark:text-stone-400'
              : 'border-emerald-400 text-slate-600 dark:border-emerald-700 dark:text-slate-400'
        }`}
      >
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr
        className={`my-4 border-0 border-t ${
          isGemini
            ? 'border-[#e3e3e3] dark:border-stone-700'
            : isClaude
              ? 'border-stone-200 dark:border-stone-700'
              : 'border-slate-200 dark:border-slate-700'
        }`}
      />
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const isBlock = Boolean(className?.includes('language-'))
      
      if (className === 'language-recharts') {
        const dataString = String(children).replace(/\n$/, '');
        return <RechartsRenderer dataString={dataString} />;
      }

      if (isBlock) {
        return <code className={`block font-mono text-[13px] ${className ?? ''}`}>{children}</code>
      }
      return <code className={codeInlineCls}>{children}</code>
    },
    pre: ({ children }) => (
      <pre
        className={`my-3 max-h-[min(24rem,50vh)] overflow-auto rounded-xl border p-3 font-mono text-[13px] leading-relaxed ${
          isGemini
            ? 'border-[#c4c7c5] bg-[#f8fafd] text-[#1f1f1f] dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200'
            : isClaude
              ? 'border-stone-200 bg-stone-950 text-stone-100 dark:border-stone-700'
              : 'border-slate-700 bg-slate-950 text-emerald-100'
        }`}
      >
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className={tableWrapCls}>
        <table className="min-w-full border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-transparent">{children}</tbody>,
    tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
    th: ({ children }) => <th className={thCls}>{children}</th>,
    td: ({ children }) => <td className={tdCls}>{children}</td>,
  }
}

type ChatMarkdownBlockProps = {
  content: string
  variant?: MarkdownVariant
  citations?: ChatCitationSource[]
}

export function ChatMarkdownBlock({
  content,
  variant = 'claude',
  citations = [],
}: ChatMarkdownBlockProps) {
  const components = useMemo(() => buildMarkdownComponents(variant), [variant])
  const markdown = useMemo(() => normalizeAiMarkdown(content), [content])

  const parts = useMemo(() => {
    if (!citations.length) {
      return [{ kind: 'text' as const, value: markdown }]
    }
    return splitTextByCitationMarkers(markdown, citations)
  }, [markdown, citations])

  if (!content.trim()) return null

  if (parts.length === 1 && parts[0]?.kind === 'text') {
    return (
      <div className={`chat-markdown chat-markdown-${variant}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className={`chat-markdown chat-markdown-${variant}`}>
      {parts.map((part, i) => {
        if (part.kind === 'text') {
          if (!part.value.trim()) return null
          return (
            <ReactMarkdown
              key={`md-${i}`}
              remarkPlugins={[remarkGfm]}
              components={components}
            >
              {part.value}
            </ReactMarkdown>
          )
        }
        return (
          <CitationTooltip
            key={`cite-${i}-${part.marker}`}
            marker={part.marker}
            title={part.title}
            snippet={part.snippet}
            variant={variant}
          />
        )
      })}
    </div>
  )
}
