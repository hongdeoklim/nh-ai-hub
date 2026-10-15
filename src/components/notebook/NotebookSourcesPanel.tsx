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
    <section className="flex h-full min-h-0 flex-col border-r border-border/90 bg-surface/80">
      <header className="shrink-0 border-b border-border/90 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-fg">
 참조 소스
          </h2>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
 Sources
          </p>
          <button
 type="button"
 onClick={onRefresh}
 className="rounded-lg px-2 py-1 text-sm font-medium text-fg-muted hover:bg-surface-2"
          >
 새로고침
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
 PDF·HWP 등 문서를 선택하면 채팅이 해당 출처로 제한됩니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
 type="button"
 disabled={uploading}
 onClick={() => fileInputRef.current?.click()}
 className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-strong disabled:opacity-60"
          >
            {uploading ? '업로드 중…' : '+ 문서 추가'}
          </button>
          <button
 type="button"
 onClick={onSelectAll}
 className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
          >
 전체 선택
          </button>
          <button
 type="button"
 onClick={onClearSelection}
 className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
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
          <p className="text-sm text-fg-subtle">출처 목록을 불러오는 중…</p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            {error}
          </p>
        ) : null}
        {!loading && sources.length === 0 ? (
          <p className="text-sm text-fg-subtle">
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
                      ? 'border-brand/30 bg-brand-soft/80'
                      : 'border-transparent hover:bg-surface-2'
                  }`}
                >
                  <input
 type="checkbox"
 checked={checked}
 onChange={() => onToggle(src.id)}
 className="mt-1 h-4 w-4 shrink-0 rounded border-border-strong text-brand focus:ring-focus/40"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {src.fileName}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-subtle">
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
