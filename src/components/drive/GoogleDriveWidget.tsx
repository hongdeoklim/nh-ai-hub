import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  fetchGdriveServiceList,
  type GdriveServiceFile,
  type GdriveServiceFolder,
} from '../../services/drive/gdrive-service-client'

function IconDownload(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5m0 0 5-5m-5 5V4"
      />
    </svg>
  )
}

function IconFolder(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
      />
    </svg>
  )
}

function formatWhen(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function formatSize(size?: string) {
  if (!size) return ''
  const n = Number(size)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Crumb = { id: string; name: string }

type GoogleDriveWidgetProps = {
  className?: string
  /** compact: 대시보드 사이드 카드 / full: 자료실 탭 전체 */
  variant?: 'compact' | 'full'
}

export function GoogleDriveWidget({
  className = '',
  variant = 'compact',
}: GoogleDriveWidgetProps) {
  const [stack, setStack] = useState<Crumb[]>([])
  const [rootFolderId, setRootFolderId] = useState('')
  const [files, setFiles] = useState<GdriveServiceFile[]>([])
  const [folders, setFolders] = useState<GdriveServiceFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const currentFolderId = stack.length > 0 ? stack[stack.length - 1]?.id ?? null : null

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchGdriveServiceList(currentFolderId)
    setLoading(false)
    if (!res.ok) {
      setError(res.message)
      setFiles([])
      setFolders([])
      return
    }
    setFiles(res.data.files)
    setFolders(res.data.folders)
    if (res.data.rootFolderId) setRootFolderId(res.data.rootFolderId)
    setStack((prev) => {
      if (prev.length > 0 || !res.data.folderId) return prev
      return [{ id: res.data.folderId, name: '공유 Drive' }]
    })
  }, [currentFolderId])

  useEffect(() => {
    void load()
  }, [load])

  function enterFolder(folder: GdriveServiceFolder) {
    setStack((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  function goToCrumb(index: number) {
    setStack((prev) => prev.slice(0, index + 1))
  }

  const shellClass =
    variant === 'full'
      ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900'
      : 'flex flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900'

  const listMaxH =
    variant === 'full' ? 'min-h-0 flex-1' : 'max-h-[min(52vh,22rem)]'

  return (
    <section
      className={`${shellClass} ${className}`}
      aria-label="공유 Google Drive"
    >
      <div className="shrink-0 border-b border-stone-200/80 bg-gradient-to-br from-[#FFF7ED] via-white to-[#FAF9F6] px-4 py-3 dark:border-stone-700 dark:from-orange-950/30 dark:via-stone-900 dark:to-stone-950">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-900/80 dark:text-orange-300">
              Shared drive
            </p>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-stone-900 dark:text-stone-50">
              공유 Google Drive
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-600 dark:text-stone-400">
              사내 공유 폴더 파일을 조회·다운로드합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            새로고침
          </button>
        </div>

        {stack.length > 0 ? (
          <nav
            aria-label="폴더 경로"
            className="mt-2 flex flex-wrap items-center gap-1 text-[11px]"
          >
            {stack.map((c, i) => (
              <span key={`${c.id}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 ? (
                  <span className="text-stone-400" aria-hidden="true">
                    /
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => goToCrumb(i)}
                  className={`rounded px-1 py-0.5 font-medium ${
                    i === stack.length - 1
                      ? 'text-orange-900 dark:text-orange-200'
                      : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
                  }`}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
        ) : null}
      </div>

      <div className={`${listMaxH} overflow-y-auto px-3 py-3 md:px-4`}>
        {loading ? (
          <ul className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <li
                key={i}
                className="h-11 animate-pulse rounded-xl bg-stone-100 dark:bg-stone-800"
              />
            ))}
          </ul>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
            {error}
            {rootFolderId ? null : (
              <p className="mt-2">
                관리자에게 <code className="rounded bg-white/70 px-1">GDRIVE_ROOT_FOLDER_ID</code>{' '}
                Secret 설정을 요청하세요.
              </p>
            )}
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300/80 px-3 py-8 text-center text-xs text-stone-500 dark:border-stone-600 dark:text-stone-400">
            이 폴더에 항목이 없습니다.
          </p>
        ) : (
          <div className="grid gap-3">
            {folders.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      onClick={() => enterFolder(folder)}
                      className="flex w-full items-center gap-2 rounded-xl border border-stone-200/90 bg-[#FAF9F6] px-3 py-2.5 text-left text-xs font-medium text-stone-800 transition hover:border-orange-300/70 hover:bg-orange-50/60 dark:border-stone-600 dark:bg-stone-950/50 dark:text-stone-100 dark:hover:border-orange-700/50"
                    >
                      <IconFolder className="h-4 w-4 shrink-0 text-orange-800 dark:text-orange-300" />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {files.length > 0 ? (
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200/90 bg-white dark:divide-stone-800 dark:border-stone-700 dark:bg-stone-900">
                {files.map((file) => {
                  const downloadUrl =
                    file.downloadUrl ??
                    file.webContentLink ??
                    file.webViewLink ??
                    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`
                  const sizeLabel = formatSize(file.size)
                  return (
                    <li
                      key={file.id}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-stone-50/80 dark:hover:bg-stone-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-stone-900 dark:text-stone-50">
                          {file.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">
                          {formatWhen(file.modifiedTime)}
                          {sizeLabel ? ` · ${sizeLabel}` : ''}
                        </p>
                      </div>
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-900 dark:border-stone-600 dark:text-stone-300 dark:hover:border-orange-700 dark:hover:bg-orange-950/40 dark:hover:text-orange-200"
                        aria-label={`${file.name} 다운로드`}
                        title="다운로드"
                      >
                        <IconDownload className="h-4 w-4" />
                      </a>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {variant === 'compact' ? (
        <div className="shrink-0 border-t border-stone-200/80 px-3 py-2 dark:border-stone-700">
          <Link
            to="/reference-room"
            className="text-[11px] font-semibold text-orange-900 underline underline-offset-2 dark:text-orange-300"
          >
            자료실에서 더 보기 →
          </Link>
        </div>
      ) : null}
    </section>
  )
}
