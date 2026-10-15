import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type FeedbackRow = {
 feedback_id: string
 message_id: string
 message_type: string
 feedback_text: string | null
 rating: number
 created_at: string
 is_rag_applied: boolean
 user_email: string | null
 assistant_response: string | null
 user_prompt: string | null
}

type FilterType = 'all' | 'up' | 'down'

function RatingBadge({ rating }: { rating: number }) {
 if (rating === 1) {
 return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success ring-1 ring-focus/40">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 9V5a3 3 0 00-5.176-1.832l-4 9A3 3 0 006 16h11.28a2 2 0 002-1.7l1.38-9A2 2 0 0017.18 3H14z" />
          <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3v11z" />
        </svg>
 좋아요
      </span>
    )
  }
 return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:ring-rose-800">
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
        <path d="M17 2h2.86a2 2 0 012 2v7.5a2 2 0 01-2 2H17" />
      </svg>
 별로예요
    </span>
  )
}

function QaCard({ row }: { row: FeedbackRow }) {
 const [open, setOpen] = useState(false)
 return (
    <tr className="hover:bg-surface-2">
      <td className="px-4 py-3"><RatingBadge rating={row.rating} /></td>
      <td className="px-4 py-3 text-fg-muted">
        <span className="block max-w-[140px] truncate text-sm" title={row.user_email ?? ''}>
          {row.user_email ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
          {row.message_type === 'team' ? '팀 채팅' : '개인 채팅'}
        </span>
      </td>
      <td className="px-4 py-3 max-w-xs">
        {row.user_prompt ? (
          <button
 onClick={() => setOpen((v) => !v)}
 className="text-left text-sm text-accent hover:underline"
          >
            {row.user_prompt.length > 60
              ? row.user_prompt.slice(0, 60) + '…'
              : row.user_prompt}
          </button>
        ) : (
          <span className="text-xs text-fg-subtle">내용 없음</span>
        )}
        {open && (
          <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg p-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">질문</p>
              <p className="mt-0.5 text-sm text-fg-muted whitespace-pre-wrap">{row.user_prompt}</p>
            </div>
            {row.assistant_response && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">AI 답변</p>
                <p className="mt-0.5 text-sm text-fg-muted whitespace-pre-wrap line-clamp-6">
                  {row.assistant_response}
                </p>
              </div>
            )}
            {row.feedback_text && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-400">피드백 내용</p>
                <p className="mt-0.5 text-sm text-rose-600 dark:text-rose-400">{row.feedback_text}</p>
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {row.rating === 1 ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
 row.is_rag_applied
              ? 'bg-success-soft text-success'
              : 'bg-warning-soft text-amber-600'
          }`}>
            {row.is_rag_applied ? '지식 저장됨' : '대기 중'}
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-subtle">
        {new Date(row.created_at).toLocaleString('ko-KR', {
 year: 'numeric', month: '2-digit', day: '2-digit',
 hour: '2-digit', minute: '2-digit',
        })}
      </td>
    </tr>
  )
}

export function FeedbackDashboard() {
 const [rows, setRows] = useState<FeedbackRow[]>([])
 const [negRows, setNegRows] = useState<FeedbackRow[]>([])
 const [loading, setLoading] = useState(true)
 const [filter, setFilter] = useState<FilterType>('all')
 const [search, setSearch] = useState('')

 const load = useCallback(async () => {
 setLoading(true)

    // 좋아요(+1) — RPC 함수로 대화 내용 포함 조회
 const { data: posData } = await supabase.rpc('get_positive_feedbacks_with_dialogue')

    // 별로예요(-1) — 별도 조회 (RPC는 긍정만 반환)
 const { data: negData } = await supabase
      .from('message_feedbacks')
      .select('id, user_id, message_id, message_type, rating, feedback_text, created_at, is_rag_applied')
      .eq('rating', -1)
      .order('created_at', { ascending: false })
      .limit(200)

    // 부정 피드백 유저 이메일 병합
 let emailMap: Record<string, string> = {}
 if (negData?.length) {
 const userIds = [...new Set(negData.map((r: any) => r.user_id))]
 const { data: users } = await supabase.from('users').select('id, email').in('id', userIds)
 for (const u of users ?? []) emailMap[u.id] = u.email
    }

 const posRows: FeedbackRow[] = (posData ?? []).map((r: any) => ({
 feedback_id: r.feedback_id,
 message_id: r.message_id,
 message_type: r.message_type,
 feedback_text: r.feedback_text,
 rating: r.rating,
 created_at: r.created_at,
 is_rag_applied: r.is_rag_applied,
 user_email: r.user_email,
 assistant_response: r.assistant_response,
 user_prompt: r.user_prompt,
    }))

 const neg: FeedbackRow[] = (negData ?? []).map((r: any) => ({
 feedback_id: r.id,
 message_id: r.message_id,
 message_type: r.message_type,
 feedback_text: r.feedback_text,
 rating: r.rating,
 created_at: r.created_at,
 is_rag_applied: r.is_rag_applied ?? false,
 user_email: emailMap[r.user_id] ?? null,
 assistant_response: null,
 user_prompt: null,
    }))

 setRows(posRows)
 setNegRows(neg)
 setLoading(false)
  }, [])

 useEffect(() => { void load() }, [load])

 const allRows = [...rows, ...negRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

 const filtered = allRows.filter((r) => {
 if (filter === 'up' && r.rating !== 1) return false
 if (filter === 'down' && r.rating !== -1) return false
 if (search.trim()) {
 const q = search.toLowerCase()
 return (
        (r.feedback_text ?? '').toLowerCase().includes(q) ||
        (r.user_email ?? '').toLowerCase().includes(q) ||
        (r.user_prompt ?? '').toLowerCase().includes(q)
      )
    }
 return true
  })

 const upCount = allRows.filter((r) => r.rating === 1).length
 const downCount = allRows.filter((r) => r.rating === -1).length
 const ragApplied = allRows.filter((r) => r.is_rag_applied).length

 return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-fg">답변 피드백 관리</h1>
        <p className="mt-1 text-sm text-fg-subtle">
 사용자가 AI 답변에 남긴 좋아요 / 별로예요 피드백을 확인하고 고도화에 활용합니다.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '전체 피드백', value: allRows.length, color: 'text-fg-muted' },
          { label: '👍 좋아요', value: upCount, color: 'text-success' },
          { label: '👎 별로예요', value: downCount, color: 'text-rose-600 dark:text-rose-400' },
          { label: '지식 반영됨', value: ragApplied, color: 'text-accent' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-fg-subtle">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-1">
          {([['all', '전체'], ['up', '👍 좋아요'], ['down', '👎 별로예요']] as [FilterType, string][]).map(([v, label]) => (
            <button
 key={v}
 onClick={() => setFilter(v)}
 className={[
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
 filter === v
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-fg-muted hover:bg-surface-2',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="질문 내용, 피드백, 이메일 검색..."
 className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-focus/40"
        />
        <button
 onClick={() => void load()}
 className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
        >
 새로고침
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-indigo-600 dark:border-t-indigo-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-fg-subtle">피드백 데이터가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg">
              <tr>
                {['평가', '사용자', '유형', '질문 (클릭하여 전체 보기)', '지식 반영', '일시'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <QaCard key={row.feedback_id} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 안내 */}
      <div className="rounded-xl border border-warning/30 bg-warning-soft p-4">
        <p className="text-sm font-semibold text-warning">활용 방법</p>
        <ul className="mt-2 space-y-1 text-sm text-warning">
          <li>• <strong>👍 좋아요</strong>를 받은 Q&amp;A는 자동으로 사내 지식(FAQ 노드)에 저장되어 지식 그래프와 AI 채팅 RAG 검색에 반영됩니다.</li>
          <li>• <strong>👎 별로예요</strong>의 피드백 텍스트를 주기적으로 검토하여 프롬프트나 사내 문서를 개선하세요.</li>
          <li>• 같은 유형의 부정 피드백이 반복된다면 해당 주제 문서를 Drive에 추가하거나 시스템 프롬프트를 수정하세요.</li>
        </ul>
      </div>
    </div>
  )
}
