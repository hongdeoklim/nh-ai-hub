import type { NotebookPinnedNote } from '../../types/notebook'

type NotebookNotesPanelProps = {
  notes: NotebookPinnedNote[]
  merging: boolean
  mergePreview: string | null
  onRemoveNote: (id: string) => void
  onMergeReport: () => void
  /** NotebookRightPanel 탭 내부 — 외곽 section·헤더 생략 */
  embedded?: boolean
}

function clip(text: string, max = 120): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function NotebookNotesPanel({
  notes,
  merging,
  mergePreview,
  onRemoveNote,
  onMergeReport,
  embedded = false,
}: NotebookNotesPanelProps) {
  const inner = (
    <>
      {!embedded ? (
        <header className="shrink-0 border-b border-border/90 px-4 py-3">
          <h2 className="text-lg font-bold text-fg">
            지식 노트
          </h2>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Saved Notes
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            채팅 답변에서 고정한 메모입니다.
          </p>
        </header>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {notes.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            AI 답변의 「📌 노트에 추가」로 카드를 쌓아 보세요.
          </p>
        ) : null}

        {notes.map((note) => (
          <article
            key={note.id}
            className="rounded-xl border border-border/90 bg-bg p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">
                {note.title}
              </h3>
              <button
                type="button"
                onClick={() => onRemoveNote(note.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-surface-3/80"
                aria-label="노트 삭제"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {clip(note.body, 280)}
            </p>
            <p className="mt-2 text-xs text-fg-subtle">
              {new Date(note.pinnedAt).toLocaleString('ko-KR')}
            </p>
          </article>
        ))}

        {mergePreview ? (
          <article className="rounded-xl border border-brand/30 bg-brand-soft/50 p-3">
            <h3 className="text-sm font-bold text-brand">
              통합 보고서
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg">
              {mergePreview}
            </p>
          </article>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-border/90 p-3">
        <button
          type="button"
          disabled={notes.length === 0 || merging}
          onClick={onMergeReport}
          className="w-full rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm font-semibold text-fg hover:bg-surface-2 disabled:opacity-50"
        >
          {merging
            ? '통합 요약 생성 중…'
            : '📄 하나의 보고서로 통합 요약하기'}
        </button>
      </footer>
    </>
  )

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col">{inner}</div>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-border/90 bg-surface/80">
      {inner}
    </section>
  )
}
