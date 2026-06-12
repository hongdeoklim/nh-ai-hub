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
        <header className="shrink-0 border-b border-stone-200/90 px-4 py-3 dark:border-stone-800">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">
            지식 노트
          </h2>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Saved Notes
          </p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            채팅 답변에서 고정한 메모입니다.
          </p>
        </header>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {notes.length === 0 ? (
          <p className="text-sm text-stone-500">
            AI 답변의 「📌 노트에 추가」로 카드를 쌓아 보세요.
          </p>
        ) : null}

        {notes.map((note) => (
          <article
            key={note.id}
            className="rounded-xl border border-stone-200/90 bg-[#FAF9F6] p-3 shadow-sm dark:border-stone-700 dark:bg-stone-950"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50">
                {note.title}
              </h3>
              <button
                type="button"
                onClick={() => onRemoveNote(note.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200/80 dark:hover:bg-stone-800"
                aria-label="노트 삭제"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              {clip(note.body, 280)}
            </p>
            <p className="mt-2 text-xs text-stone-400">
              {new Date(note.pinnedAt).toLocaleString('ko-KR')}
            </p>
          </article>
        ))}

        {mergePreview ? (
          <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 dark:border-orange-900 dark:bg-orange-950/30">
            <h3 className="text-sm font-bold text-orange-950 dark:text-orange-100">
              통합 보고서
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-800 dark:text-stone-200">
              {mergePreview}
            </p>
          </article>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-stone-200/90 p-3 dark:border-stone-800">
        <button
          type="button"
          disabled={notes.length === 0 || merging}
          onClick={onMergeReport}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
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
    <section className="flex h-full min-h-0 flex-col border-l border-stone-200/90 bg-white/80 dark:border-stone-800 dark:bg-stone-900/60">
      {inner}
    </section>
  )
}
