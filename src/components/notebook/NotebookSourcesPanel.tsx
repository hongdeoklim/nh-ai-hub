import { useRef } from 'react'

import type { NotebookSource } from '../../types/notebook'
import { sourceKindLabel } from '../../services/ai/notebookRag'

type NotebookSourcesPanelProps = {
  sources: NotebookSource[]
  selectedIds: Set<string>
  loading: boolean
  error: string | null
  uploading: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onUpload: (file: File) => void
  onRefresh: () => void
}

export function NotebookSourcesPanel({
  sources,
  selectedIds,
  loading,
  error,
  uploading,
  onToggle,
  onSelectAll,
  onClearSelection,
  onUpload,
  onRefresh,
}: NotebookSourcesPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <section className="flex h-full min-h-0 flex-col border-r border-stone-200/90 bg-white/80 dark:border-stone-800 dark:bg-stone-900/60">
      <header className="shrink-0 border-b border-stone-200/90 px-4 py-3 dark:border-stone-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">
            참조 소스
          </h2>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Sources
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg px-2 py-1 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            새로고침
          </button>
        </div>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          PDF·HWP 등 문서를 선택하면 채팅이 해당 출처로 제한됩니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60 dark:bg-orange-600 dark:hover:bg-orange-500"
          >
            {uploading ? '업로드 중…' : '+ 문서 추가'}
          </button>
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            선택 해제
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUpload(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-sm text-stone-500">출처 목록을 불러오는 중…</p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {error}
          </p>
        ) : null}
        {!loading && sources.length === 0 ? (
          <p className="text-sm text-stone-500">
            등록된 문서가 없습니다. 자료실에 PDF를 올리거나 위에서 직접
            업로드하세요.
          </p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {sources.map((src) => {
            const checked = selectedIds.has(src.id)
            return (
              <li key={`${src.kind}-${src.id}`}>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                    checked
                      ? 'border-orange-300 bg-orange-50/80 dark:border-orange-800 dark:bg-orange-950/30'
                      : 'border-transparent hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(src.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-orange-700 focus:ring-orange-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-50">
                      {src.fileName}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
                      {sourceKindLabel(src.kind)}
                      {src.category ? ` · ${src.category}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
