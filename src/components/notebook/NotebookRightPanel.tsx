import { useState } from 'react'

import type { NotebookGraphData } from '../../types/notebook-graph'
import type { NotebookPinnedNote } from '../../types/notebook'

import { KnowledgeGraph } from './KnowledgeGraph'
import { NotebookNotesPanel } from './NotebookNotesPanel'

type RightTab = 'graph' | 'notes'

type NotebookRightPanelProps = {
 graphData: NotebookGraphData
 graphLoading: boolean
 notes: NotebookPinnedNote[]
 merging: boolean
 mergePreview: string | null
 onRemoveNote: (id: string) => void
 onMergeReport: () => void
 onDocumentSelect: (documentId: string, label: string) => void
 onEntitySelect: (entityLabel: string, entityType?: string) => void
}

export function NotebookRightPanel({
 graphData,
 graphLoading,
 notes,
 merging,
 mergePreview,
 onRemoveNote,
 onMergeReport,
 onDocumentSelect,
 onEntitySelect,
}: NotebookRightPanelProps) {
 const [tab, setTab] = useState<RightTab>('notes')

 const tabBtn =
    'flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors duration-200'
 const tabActive =
    'bg-brand-soft text-brand shadow-sm'
 const tabIdle =
    'text-fg-muted hover:bg-surface-2'

 return (
    <section className="flex h-full min-h-0 flex-col border-l border-border/90 bg-surface/80">
      <header className="shrink-0 border-b border-border/90 px-3 py-3">
        <div className="flex gap-1 rounded-xl bg-surface-2/90 p-1">
          <button
 type="button"
 className={`${tabBtn} ${tab === 'graph' ? tabActive : tabIdle}`}
 onClick={() => setTab('graph')}
          >
            📊 지식 지도 보기
          </button>
          <button
 type="button"
 className={`${tabBtn} ${tab === 'notes' ? tabActive : tabIdle}`}
 onClick={() => setTab('notes')}
          >
            📝 메모 보드 보기
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
 className={`absolute inset-0 flex flex-col transition-all duration-300 ease-out ${
 tab === 'graph'
              ? 'pointer-events-auto translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-3 opacity-0'
          }`}
 aria-hidden={tab !== 'graph'}
        >
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <p className="mb-2 shrink-0 text-xs text-fg-subtle">
 선택된 출처 간 연관 관계 · 핵심 키워드
            </p>
            <div className="min-h-0 flex-1">
              <KnowledgeGraph
 data={graphData}
 loading={graphLoading}
 onDocumentSelect={onDocumentSelect}
 onEntitySelect={onEntitySelect}
              />
            </div>
          </div>
        </div>

        <div
 className={`absolute inset-0 flex flex-col transition-all duration-300 ease-out ${
 tab === 'notes'
              ? 'pointer-events-auto translate-x-0 opacity-100'
              : 'pointer-events-none -translate-x-3 opacity-0'
          }`}
 aria-hidden={tab !== 'notes'}
        >
          <NotebookNotesPanel
 notes={notes}
 merging={merging}
 mergePreview={mergePreview}
 onRemoveNote={onRemoveNote}
 onMergeReport={onMergeReport}
 embedded
          />
        </div>
      </div>
    </section>
  )
}
