import { useState } from 'react'

import {
  actorLabel,
  EMPTY_ACTIVITY_FILTERS,
  useActivityLogs,
} from '../../hooks/admin/useActivityLogs'
import { KNOWN_ACTIVITY_ACTIONS } from '../../utils/admin-activity-badge'
import {
  activityBadgeClassName,
  resolveActivityAction,
} from '../../utils/admin-activity-badge'

export function ActivityLogViewer() {
  const [filters, setFilters] = useState(EMPTY_ACTIVITY_FILTERS)
  const { rows, totalFetched, loading, error, reload, actionTypes } =
    useActivityLogs(filters)

  const actionOptions = [
    ...new Set([...KNOWN_ACTIVITY_ACTIONS, ...actionTypes]),
  ].sort()

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-base">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            시스템 로그
          </h1>
          <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
            관리자·운영 콘솔의 주요 활동을 시간순으로 조회합니다. (읽기 전용)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          새로고침
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            시작일
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateFrom: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            종료일
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateTo: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            작업자
            <input
              type="search"
              value={filters.actorQuery}
              onChange={(e) =>
                setFilters((f) => ({ ...f, actorQuery: e.target.value }))
              }
              placeholder="이름·이메일"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            액션 종류
            <select
              value={filters.actionType}
              onChange={(e) =>
                setFilters((f) => ({ ...f, actionType: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">전체</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {resolveActivityAction(action).label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            상세 검색
            <input
              type="search"
              value={filters.textQuery}
              onChange={(e) =>
                setFilters((f) => ({ ...f, textQuery: e.target.value }))
              }
              placeholder="설명·액션 키워드"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          최근 {totalFetched}건 로드 · 필터 결과 {rows.length}건
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">발생 일시</th>
                <th className="px-4 py-2.5">작업자</th>
                <th className="px-4 py-2.5">액션</th>
                <th className="px-4 py-2.5">상세 내역</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    조건에 맞는 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const meta = resolveActivityAction(row.action_type)
                  return (
                    <tr
                      key={row.id}
                      className="align-top transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {new Date(row.created_at).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900 dark:text-slate-50">
                          {actorLabel(row)}
                        </p>
                        {row.actor_email ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {row.actor_email}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={activityBadgeClassName(row.action_type)}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="max-w-lg px-4 py-2.5 text-slate-700 dark:text-slate-300">
                        <p className="break-words leading-relaxed">
                          {row.description?.trim() || '—'}
                        </p>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
