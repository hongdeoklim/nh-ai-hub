import { toast } from 'sonner'
import { useState } from 'react'

import type { SavedPromptRow } from '../../types/prompts'
import type { StaticOrgPromptItem } from '../../data/org-static-prompts'
import { useDialogs } from '../common/DialogProvider'

export type { StaticOrgPromptItem }

export type ApplyPromptMeta =
  | { kind: 'org-static'; promptId: string }
  | { kind: 'public'; promptId: string }
  | { kind: 'mine'; promptId: string }

type PromptTab = 'org' | 'mine'

type PromptLibraryPanelProps = {
  staticOrgPrompts: StaticOrgPromptItem[]
  publicPrompts: SavedPromptRow[]
  myPrompts: SavedPromptRow[]
  loading: boolean
  disabled: boolean
  currentDraft: string
  userId: string | undefined
  onApplyContent: (text: string, meta?: ApplyPromptMeta) => void
  onRefresh: () => Promise<void>
  onSavePrompt: (
    title: string,
    content: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  onDeletePrompt: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  promptPanelRegionId?: string
  variant?: 'sidebar' | 'magnet'
}

function truncateOneLine(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}\u2026`
}

export function PromptLibraryPanel({
  staticOrgPrompts,
  publicPrompts,
  myPrompts,
  loading,
  disabled,
  currentDraft,
  userId,
  onApplyContent,
  onRefresh,
  onSavePrompt,
  onDeletePrompt,
  promptPanelRegionId = 'prompt-library-panel',
  variant = 'sidebar',
}: PromptLibraryPanelProps) {
  const { confirm: confirmDialog } = useDialogs()
  const [tab, setTab] = useState<PromptTab>('org')
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveBody, setSaveBody] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)

  const isCompactSidebar = variant === 'sidebar'

  function openSaveModal() {
    setSaveTitle('\uac1c\uc778 \ud504\ub86c\ud504\ud2b8')
    setSaveBody(currentDraft.trim())
    setSaveOpen(true)
  }

  async function submitSave() {
    setSaveBusy(true)
    try {
      const result = await onSavePrompt(saveTitle, saveBody)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setSaveOpen(false)
      await onRefresh()
      setTab('mine')
    } finally {
      setSaveBusy(false)
    }
  }

  const tabBase = isCompactSidebar
    ? 'min-w-0 rounded-full px-1 py-1 text-center text-[9px] font-semibold leading-tight transition-colors'
    : 'min-w-0 rounded-full px-2 py-2 text-center text-[20px] font-medium leading-tight transition-colors sm:px-3'
  const tabActive =
    'bg-surface text-fg shadow-sm'
  const tabIdle =
    'text-fg-muted hover:text-fg'

  const orgTabLabel = isCompactSidebar ? '\uc804\uc0ac' : '\uc804\uc0ac \ud504\ub86c\ud504\ud2b8'
  const mineTabLabel = isCompactSidebar ? '\uac1c\uc778' : '\uac1c\uc778 \ud504\ub86c\ud504\ud2b8'

  const tabHeader = (
    <div
      className={
        variant === 'magnet'
          ? 'sticky top-0 z-10 border-b border-border/80 bg-surface-2 px-4 py-3 backdrop-blur-sm'
          : 'border-b border-border/80 px-2 py-2'
      }
    >
      {variant === 'magnet' ? (
        <p className="text-[17px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          {'\ud504\ub86c\ud504\ud2b8'}
        </p>
      ) : null}
      <div
        className={`${variant === 'magnet' ? 'mt-2' : 'mt-0'} grid grid-cols-2 gap-0.5 rounded-full bg-surface-3/70 p-0.5`}
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'org'}
          className={`${tabBase} ${tab === 'org' ? tabActive : tabIdle}`}
          onClick={() => setTab('org')}
        >
          {orgTabLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          className={`${tabBase} ${tab === 'mine' ? tabActive : tabIdle}`}
          onClick={() => setTab('mine')}
        >
          {mineTabLabel}
        </button>
      </div>
    </div>
  )

  const sectionLabelClass = isCompactSidebar
    ? 'px-0.5 pb-0.5 text-[9px] font-medium text-fg-subtle'
    : 'px-1 pb-1 text-[17px] font-medium text-fg-subtle'
  const cardTitleClass = isCompactSidebar
    ? 'truncate text-[10px] font-semibold text-fg'
    : 'text-[20px] font-semibold text-fg'
  const cardBodyClass = isCompactSidebar
    ? 'mt-0.5 line-clamp-2 text-[9px] leading-snug text-fg-muted'
    : 'mt-1 text-[18px] leading-snug text-fg-muted'
  const cardButtonClass = isCompactSidebar
    ? 'group flex w-full flex-col rounded-lg border border-transparent bg-surface/60 px-1.5 py-1.5 text-left shadow-sm transition hover:border-orange-300/80 hover:bg-surface-2 disabled:opacity-50'
    : 'group flex w-full flex-col rounded-xl border border-transparent bg-surface/60 px-3 py-2.5 text-left shadow-sm transition hover:border-orange-300/80 hover:bg-surface-2 disabled:opacity-50'
  const badgeOrgClass = isCompactSidebar
    ? 'rounded bg-brand-soft px-1 py-px text-[8px] font-semibold text-brand'
    : 'rounded-md bg-brand-soft px-1.5 py-0.5 text-[15px] font-semibold text-brand'
  const badgeShareClass = isCompactSidebar
    ? 'rounded bg-warning-soft px-1 py-px text-[8px] font-semibold text-warning'
    : 'rounded-md bg-warning-soft px-1.5 py-0.5 text-[15px] font-semibold text-warning'
  const badgeMineClass = isCompactSidebar
    ? 'rounded bg-surface-3 px-1 py-px text-[8px] font-semibold text-fg'
    : 'rounded-md bg-surface-3 px-1.5 py-0.5 text-[15px] font-semibold text-fg'

  const tabContent = loading ? (
    <p className="px-1 py-6 text-center text-xs text-fg-subtle">
      {'\ubd88\ub7ec\uc624\ub294 \uc911\u2026'}
    </p>
  ) : tab === 'org' ? (
    <ul className={`flex flex-col ${isCompactSidebar ? 'gap-1' : 'gap-2'}`}>
      <li className={sectionLabelClass}>
        {'농협네트웍스'}
        <br />
        {'프롬프트 관리'}
      </li>
      {staticOrgPrompts.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onApplyContent(item.content, {
                kind: 'org-static',
                promptId: item.id,
              })
            }
            className={cardButtonClass}
          >
            <span
              className={`flex items-center ${isCompactSidebar ? 'gap-1' : 'gap-2'}`}
            >
              <span className={badgeOrgClass}>{'\uc804\uc0ac'}</span>
              <span className={cardTitleClass}>{item.title}</span>
            </span>
            <span className={cardBodyClass}>{item.description}</span>
          </button>
        </li>
      ))}

      {publicPrompts.length > 0 ? (
        <>
          <li
            className={`${sectionLabelClass} ${isCompactSidebar ? 'mt-1' : 'mt-4'}`}
          >
            {isCompactSidebar
              ? '\uc784\uc9c1\uc6d0 \uacf5\uc720'
              : '\uc784\uc9c1\uc6d0 \uacf5\uc720 \ud504\ub86c\ud504\ud2b8'}
          </li>
          {publicPrompts.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onApplyContent(row.content, {
                    kind: 'public',
                    promptId: row.id,
                  })
                }
                className={
                  isCompactSidebar
                    ? 'group flex w-full flex-col rounded-lg border border-transparent bg-surface/60 px-1.5 py-1.5 text-left shadow-sm transition hover:border-amber-300/80 hover:bg-surface-2 disabled:opacity-50'
                    : 'group flex w-full flex-col rounded-xl border border-transparent bg-surface/60 px-3 py-2.5 text-left shadow-sm transition hover:border-amber-300/80 hover:bg-surface-2 disabled:opacity-50'
                }
              >
                <span
                  className={`flex items-center ${isCompactSidebar ? 'gap-1' : 'gap-2'}`}
                >
                  <span className={badgeShareClass}>{'\uacf5\uc720'}</span>
                  <span className={cardTitleClass}>{row.title}</span>
                </span>
                <span className={cardBodyClass}>
                  {truncateOneLine(row.content)}
                </span>
              </button>
            </li>
          ))}
        </>
      ) : null}
    </ul>
  ) : (
    <div className={`flex flex-col ${isCompactSidebar ? 'gap-1.5' : 'gap-3'}`}>
      <button
        type="button"
        disabled={disabled || !userId}
        onClick={() => openSaveModal()}
        className={
          isCompactSidebar
            ? 'w-full rounded-lg border border-dashed border-border-strong/70 bg-surface/50 px-1.5 py-2 text-[9px] font-semibold text-fg transition hover:border-orange-400 hover:bg-surface-2 disabled:opacity-50'
            : 'w-full rounded-xl border border-dashed border-border-strong/70 bg-surface/50 px-3 py-3 text-[20px] font-semibold text-fg transition hover:border-orange-400 hover:bg-surface-2 disabled:opacity-50'
        }
      >
        {isCompactSidebar
          ? '+ \uc800\uc7a5'
          : '+ \ud604\uc7ac \uc785\ub825 \uc800\uc7a5\ud558\uae30'}
      </button>

      {!userId ? (
        <p className="text-center text-xs text-fg-subtle">
          {
            '\ub85c\uadf8\uc778 \ud6c4 \uac1c\uc778 \ud504\ub86c\ud504\ud2b8\ub97c \uc800\uc7a5\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.'
          }
        </p>
      ) : myPrompts.length === 0 ? (
        <p
          className={`rounded-xl bg-surface/50 text-center text-xs leading-relaxed text-fg-muted ${isCompactSidebar ? 'px-1.5 py-3' : 'px-3 py-6'}`}
        >
          {'\uc800\uc7a5\ub41c \ud504\ub86c\ud504\ud2b8\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.'}
          {!isCompactSidebar ? (
            <>
              <br />
              {
                '\uc704 \ubc84\ud2bc\uc73c\ub85c \uc785\ub825 \uc911\uc778 \ub0b4\uc6a9\uc744 \uc800\uc7a5\ud574 \ubcf4\uc138\uc694.'
              }
            </>
          ) : null}
        </p>
      ) : (
        <ul className={`flex flex-col ${isCompactSidebar ? 'gap-1' : 'gap-2'}`}>
          {myPrompts.map((row) => (
            <li
              key={row.id}
              className={`flex gap-1 rounded-xl border border-border/80 bg-surface/70 shadow-sm ${isCompactSidebar ? 'p-0.5' : 'p-1'}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onApplyContent(row.content, {
                    kind: 'mine',
                    promptId: row.id,
                  })
                }
                className={`min-w-0 flex-1 rounded-lg text-left transition hover:bg-surface-2 disabled:opacity-50 ${isCompactSidebar ? 'px-1 py-1' : 'px-2 py-2'}`}
              >
                <span
                  className={`flex items-center ${isCompactSidebar ? 'gap-1' : 'gap-2'}`}
                >
                  <span className={badgeMineClass}>
                    {isCompactSidebar ? 'MY' : '\uac1c\uc778 \ud504\ub86c\ud504\ud2b8'}
                  </span>
                  <span className={cardTitleClass}>{row.title}</span>
                </span>
                <span className={`block ${cardBodyClass}`}>
                  {truncateOneLine(row.content)}
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                className="shrink-0 rounded-lg px-2 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                aria-label={'\ud504\ub86c\ud504\ud2b8 \uc0ad\uc81c'}
                title={'\uc0ad\uc81c'}
                onClick={() => {
                  void (async () => {
                    const ok = await confirmDialog({
                      title: `「${row.title}」 프롬프트를 삭제할까요?`,
                      confirmLabel: '삭제',
                      tone: 'danger',
                    })
                    if (!ok) return
                    const r = await onDeletePrompt(row.id)
                    if (!r.ok) toast.error(r.message)
                    else await onRefresh()
                  })()
                }}
              >
                <svg
                  className={isCompactSidebar ? 'h-3.5 w-3.5' : 'h-5 w-5'}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const scrollBodyPadding =
    variant === 'sidebar' ? 'px-2 py-2' : 'px-3 py-3 md:px-4'

  return (
    <div
      id={promptPanelRegionId}
      className={
        variant === 'magnet'
          ? 'flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-2'
          : 'flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden border-b border-border/90 bg-surface-2 lg:border-b-0 lg:border-r'
      }
    >
      {tabHeader}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={scrollBodyPadding}>{tabContent}</div>
      </div>

      {saveOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={() => !saveBusy && setSaveOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="save-prompt-title"
            className="w-full max-w-lg rounded-2xl border border-border bg-bg p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="save-prompt-title"
              className="text-base font-semibold text-fg"
            >
              {'\uac1c\uc778 \ud504\ub86c\ud504\ud2b8 \uc800\uc7a5'}
            </h2>
            <label className="mt-4 block text-xs font-medium text-fg-muted">
              {'\uc81c\ubaa9'}
              <input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-fg-muted">
              {'\ub0b4\uc6a9'}
              <textarea
                value={saveBody}
                onChange={(e) => setSaveBody(e.target.value)}
                rows={6}
                className="mt-1 w-full resize-y rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setSaveOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-fg-muted hover:bg-surface-3/80"
              >
                {'\ucde8\uc18c'}
              </button>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void submitSave()}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-strong disabled:opacity-60"
              >
                {saveBusy ? '\uc800\uc7a5 \uc911\u2026' : '\uc800\uc7a5'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
