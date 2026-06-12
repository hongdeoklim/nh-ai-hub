import { useCallback, useMemo, useState } from 'react'

import type { ArtifactType, ChatArtifact } from '../../store/chat-artifact'
import {
  contentContainsTable,
  exportTableContentAsCsv,
} from '../../utils/csvExport'

type ArtifactPanelProps = {
  artifact: ChatArtifact
  onClose: () => void
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

function isTableSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function MarkdownTableView({ content }: { content: string }) {
  const rows = useMemo(() => {
    const lines = content.trim().split('\n').filter((l) => l.trim().includes('|'))
    if (lines.length === 0) return null

    const header = splitTableRow(lines[0])
    const bodyLines = lines.slice(1).filter((l) => !isTableSeparatorRow(l))
    const body = bodyLines.map(splitTableRow)
    return { header, body }
  }, [content])

  if (!rows) {
    return (
      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800 dark:text-stone-100">
        {content}
      </pre>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead className="bg-stone-100 dark:bg-stone-800">
          <tr>
            {rows.header.map((cell, i) => (
              <th
                key={`h-${i}`}
                className="border-b border-stone-200 px-4 py-2.5 font-semibold text-stone-900 dark:border-stone-700 dark:text-stone-50"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.body.map((row, ri) => (
            <tr
              key={`r-${ri}`}
              className="border-b border-stone-100 last:border-0 dark:border-stone-800"
            >
              {row.map((cell, ci) => (
                <td
                  key={`c-${ri}-${ci}`}
                  className="px-4 py-2.5 align-top text-stone-700 dark:text-stone-200"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownDocumentView({ content }: { content: string }) {
  const blocks = useMemo(() => content.split('\n'), [content])

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-stone-800 dark:text-stone-100">
      {blocks.map((line, i) => {
        const trimmed = line.trimEnd()
        if (!trimmed.trim()) return <div key={`sp-${i}`} className="h-2" />
        if (/^###\s+/.test(trimmed)) {
          return (
            <h3 key={`h3-${i}`} className="text-lg font-bold text-stone-900 dark:text-stone-50">
              {trimmed.replace(/^###\s+/, '')}
            </h3>
          )
        }
        if (/^##\s+/.test(trimmed)) {
          return (
            <h2 key={`h2-${i}`} className="text-xl font-bold text-stone-900 dark:text-stone-50">
              {trimmed.replace(/^##\s+/, '')}
            </h2>
          )
        }
        if (/^#\s+/.test(trimmed)) {
          return (
            <h1 key={`h1-${i}`} className="text-2xl font-bold text-stone-900 dark:text-stone-50">
              {trimmed.replace(/^#\s+/, '')}
            </h1>
          )
        }
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <p key={`li-${i}`} className="pl-4 before:mr-2 before:content-['•']">
              {trimmed.replace(/^[-*]\s+/, '')}
            </p>
          )
        }
        return <p key={`p-${i}`}>{trimmed}</p>
      })}
    </div>
  )
}

function ArtifactBody({ artifact }: { artifact: ChatArtifact }) {
  if (artifact.type === 'table') {
    return <MarkdownTableView content={artifact.content} />
  }
  if (artifact.type === 'html') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          HTML 소스 미리보기 (실행되지 않습니다)
        </p>
        <pre className="overflow-x-auto rounded-xl bg-stone-950 p-4 text-[13px] leading-relaxed text-emerald-100">
          <code>{artifact.content}</code>
        </pre>
      </div>
    )
  }
  if (artifact.type === 'code') {
    return (
      <pre className="overflow-x-auto rounded-xl bg-stone-950 p-4 text-[13px] leading-relaxed text-emerald-100">
        <code>{artifact.content}</code>
      </pre>
    )
  }
  return <MarkdownDocumentView content={artifact.content} />
}

const TYPE_LABEL: Record<ArtifactType, string> = {
  markdown: '문서',
  html: 'HTML',
  code: '코드',
  table: '표',
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)

  const hasTable = useMemo(
    () => artifact.type === 'table' || contentContainsTable(artifact.content),
    [artifact.content, artifact.type],
  )

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.alert('복사에 실패했습니다.')
    }
  }, [artifact.content])

  const handleCsvDownload = useCallback(() => {
    const ok = exportTableContentAsCsv(artifact.content, artifact.title)
    if (!ok) {
      window.alert('표 데이터를 찾을 수 없어 CSV로 내보낼 수 없습니다.')
      return
    }
    setDownloadDone(true)
    window.setTimeout(() => setDownloadDone(false), 1800)
  }, [artifact.content, artifact.title])

  return (
    <aside
      className="flex h-full min-h-0 w-full flex-col border-stone-200 bg-[#FAFAF8] shadow-xl dark:border-stone-800 dark:bg-stone-950 md:border-l md:shadow-none"
      aria-label="아티팩트 패널"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-200/90 px-4 py-3 dark:border-stone-800 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-400">
            Artifact · {TYPE_LABEL[artifact.type]}
          </p>
          <h2 className="truncate text-base font-bold text-stone-900 dark:text-stone-50">
            {artifact.title}
          </h2>
        </div>
        {hasTable ? (
          <button
            type="button"
            onClick={handleCsvDownload}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300/90 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60 sm:px-3"
            aria-label="엑셀 CSV 다운로드"
          >
            <span aria-hidden="true">{downloadDone ? '✓' : '⬇️'}</span>
            <span className="hidden sm:inline">
              {downloadDone ? '다운로드 완료!' : '엑셀(CSV) 다운로드'}
            </span>
            <span className="sm:hidden">
              {downloadDone ? '완료!' : 'CSV'}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
        >
          {copied ? '복사됨' : '복사하기'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/80 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          aria-label="아티팩트 닫기"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6">
        <ArtifactBody artifact={artifact} />
      </div>
    </aside>
  )
}
