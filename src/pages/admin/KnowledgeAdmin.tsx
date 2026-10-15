import { toast } from 'sonner'
import { startTransition, useCallback, useEffect, useState } from 'react'

import { DriveSyncWidget } from '../../components/automation/DriveSyncWidget'
import {
  fetchKnowledgeBase,
  type KnowledgeBaseRow,
} from '../../services/reference-room/knowledge-base'
import { supabase } from '../../lib/supabase'

export function KnowledgeAdmin() {
  const [rows, setRows] = useState<KnowledgeBaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    const res = await fetchKnowledgeBase(supabase)
    if (!res.ok) {
      setError(res.message)
      setRows([])
    } else {
      startTransition(() => setRows(res.rows))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function removeRow(id: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('이 자료 메타를 삭제할까요?')
    ) {
      return
    }
    setBusyId(id)
    const { error: dErr } = await supabase.from('knowledge_base').delete().eq('id', id)
    setBusyId(null)
    if (dErr) {
      toast.error(dErr.message)
      return
    }
    await load()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">자료실 관리</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Google Drive 공유 폴더 동기화와 knowledge_base 메타데이터를
          관리합니다.
        </p>
      </div>

      <DriveSyncWidget className="max-w-none" />

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-bg text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              <tr>
                <th className="px-4 py-3">파일명</th>
                <th className="px-4 py-3">카테고리</th>
                <th className="px-4 py-3">등록일</th>
                <th className="px-4 py-3">링크</th>
                <th className="px-4 py-3 text-right">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
                    자료가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-surface-2/80"
                  >
                    <td className="max-w-[200px] truncate px-4 py-3 font-medium">
                      {r.file_name}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {r.category}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-subtle">
                      {new Date(r.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 font-mono text-xs text-accent">
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {r.file_url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void removeRow(r.id)}
                        className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
