import { useCallback, useEffect, useState } from 'react'

import {
  fetchCompanyRagLastUpdatedAt,
  formatCompanyRagLastUpdatedLabel,
  syncGoogleDriveFolderToRag,
} from '../../services/ai/googleDriveSync'

type DriveSyncWidgetProps = {
  className?: string
  /** 미지정 시 gdrive-service 가 GDRIVE_ROOT_FOLDER_ID 를 사용 */
  folderId?: string | null
}

export function DriveSyncWidget({
  className = '',
  folderId = null,
}: DriveSyncWidgetProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [lastUpdatedLoading, setLastUpdatedLoading] = useState(true)

  const refreshLastUpdated = useCallback(async () => {
    setLastUpdatedLoading(true)
    try {
      const at = await fetchCompanyRagLastUpdatedAt()
      setLastUpdatedAt(at)
    } finally {
      setLastUpdatedLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshLastUpdated()
  }, [refreshLastUpdated])

  const handleSync = useCallback(async () => {
    if (isSyncing) return
    setIsSyncing(true)
    setStatusMessage('구글 드라이브 자료실 연결 중...')

    try {
      setStatusMessage(
        '구글 드라이브에서 연수 일정 및 사내 규정 문서 가져오는 중...',
      )

      const result = await syncGoogleDriveFolderToRag({
        folderId,
        onProgress: (p) => {
          setStatusMessage(p.message)
        },
      })

      if (result.filesIngested > 0) {
        setStatusMessage(
          `동기화 성공! 총 ${result.filesIngested}개의 문서가 사내 AI 지식으로 학습되었습니다.` +
            (result.filesFailed > 0
              ? ` (${result.filesFailed}건 실패)`
              : ''),
        )
        await refreshLastUpdated()
      } else {
        setStatusMessage(
          result.errors[0]?.message ??
            '동기화할 텍스트 문서가 없거나 처리에 실패했습니다.',
        )
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : '네트워크 오류가 발생했습니다.'
      setStatusMessage(`동기화 실패: ${message}`)
    } finally {
      setIsSyncing(false)
    }
  }, [folderId, isSyncing, refreshLastUpdated])

  return (
    <div
      className={`flex max-w-sm flex-col justify-between rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900 ${className}`}
    >
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-stone-50">
            구글 드라이브 사내 자료실 동기화
          </h3>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">
            관리자 전용
          </span>
        </div>
        <p className="mb-2 text-sm text-gray-500 dark:text-stone-400">
          공유 폴더의 연수 일정·사내 규정을 AI 지식 DB에 반영합니다. 한 번
          동기화하면 <strong className="font-semibold text-stone-700 dark:text-stone-200">전체 임직원 채팅</strong>
          에서 RAG 검색으로 활용됩니다.
        </p>
        <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
          {lastUpdatedLoading ? (
            '최근 업데이트 확인 중…'
          ) : lastUpdatedAt ? (
            <>
              최근 지식 업데이트:{' '}
              <time
                dateTime={lastUpdatedAt.toISOString()}
                className="font-medium text-stone-700 dark:text-stone-200"
              >
                {formatCompanyRagLastUpdatedLabel(lastUpdatedAt)}
              </time>
            </>
          ) : (
            '아직 동기화된 사내 문서가 없습니다.'
          )}
        </p>
      </div>

      <div className="mt-4">
        {statusMessage ? (
          <p className="mb-3 break-all rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs font-medium text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            {isSyncing ? (
              <span className="flex items-center gap-2">
                <span
                  className="inline-flex h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600 dark:border-blue-800 dark:border-t-blue-300"
                  aria-hidden="true"
                />
                {statusMessage}
              </span>
            ) : (
              statusMessage
            )}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={isSyncing}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            isSyncing
              ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-stone-800 dark:text-stone-500'
              : 'bg-emerald-600 text-white shadow-sm shadow-emerald-100 hover:bg-emerald-700 dark:shadow-none'
          }`}
        >
          {isSyncing ? (
            <>
              <svg
                className="h-4 w-4 animate-spin text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              동기화 진행 중...
            </>
          ) : (
            '지금 지식 동기화 시작'
          )}
        </button>
      </div>
    </div>
  )
}
