import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '../components/auth/useAuth'
import {
  approveCadJob,
  fetchAllowedPrograms,
  fetchMyCadJobs,
  rejectCadJob,
  type AllowedProgram,
  type CadJob,
  type CadJobStatus,
} from '../services/cad/cad-jobs'

/**
 * CAD 에이전트 — 로컬 에이전트 설치 안내 + 작업 큐 모니터.
 * 채팅에서 CAD 명령을 요청하면 cad-job-gateway가 cad_jobs에 등록하고,
 * 사용자 PC의 로컬 에이전트가 이를 폴링해 정품 AutoCAD로 실행한다.
 */

const AGENT_DOWNLOAD_URL = (import.meta.env.VITE_CAD_AGENT_DOWNLOAD_URL as string | undefined)?.trim()
const WORKSPACE_ROOT = 'C:\\NH-AI-HUB-workspace'

const STATUS_META: Record<CadJobStatus, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300' },
  pending_approval: { label: '승인 대기', cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300' },
  running: { label: '실행 중', cls: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300' },
  completed: { label: '완료', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300' },
  failed: { label: '실패', cls: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300' },
}

function StatusBadge({ status }: { status: CadJobStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]! font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

export function CadAgentPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.is_admin === true
  const [jobs, setJobs] = useState<CadJob[]>([])
  const [programs, setPrograms] = useState<AllowedProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [jobRows, programRows] = await Promise.all([
        fetchMyCadJobs(50).catch((e) => {
          toast.error(`작업 조회 실패: ${e instanceof Error ? e.message : e}`)
          return [] as CadJob[]
        }),
        fetchAllowedPrograms().catch(() => [] as AllowedProgram[]),
      ])
      setJobs(jobRows)
      setPrograms(programRows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const handleApprove = useCallback(
    async (id: string, approve: boolean) => {
      if (!profile?.id) return
      setActing(id)
      try {
        if (approve) {
          await approveCadJob(id, profile.id)
          toast.success('작업을 승인했습니다. 에이전트가 곧 실행합니다.')
        } else {
          await rejectCadJob(id, profile.id)
          toast.success('작업을 반려했습니다.')
        }
        await load()
      } catch (e) {
        toast.error(`처리 실패: ${e instanceof Error ? e.message : e}`)
      } finally {
        setActing(null)
      }
    },
    [profile?.id, load],
  )

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:py-10">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[10px]! font-semibold uppercase tracking-[0.12em] text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300 md:text-[11px]!">
          <span aria-hidden>📐</span> 자동화 · CAD 에이전트
        </span>
        <h1 className="mt-3 text-[22px]! font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-[28px]!">
          내 PC의 AutoCAD를 채팅으로 실행하세요
        </h1>
        <p className="mt-2 text-[13px]! leading-relaxed text-stone-600 dark:text-stone-400 md:text-[15px]!">
          로컬 에이전트를 설치하면, AI 채팅에서 요청한 CAD 명령이 안전하게 검증된 뒤
          내 컴퓨터의 정품 AutoCAD에서 실행됩니다. 도면 데이터는 PC 밖으로 나가지 않습니다.
        </p>
      </header>

      {/* 설치 안내 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-[15px]! font-bold text-stone-900 dark:text-stone-50 md:text-[17px]!">1. 로컬 에이전트 설치</h2>
        <ol className="mt-3 flex flex-col gap-2 text-[13px]! leading-relaxed text-stone-600 dark:text-stone-400 md:text-[14px]!">
          <li>① 아래 버튼으로 설치본을 내려받아 실행합니다 (Windows · AutoCAD 2025 필요).</li>
          <li>② 설치 마법사에서 Supabase 접속 정보와 작업 폴더(<code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]! dark:bg-stone-800">{WORKSPACE_ROOT}</code>)를 확인합니다.</li>
          <li>③ 에이전트가 실행되면 이 페이지의 작업 큐가 자동으로 처리됩니다.</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {AGENT_DOWNLOAD_URL ? (
            <a
              href={AGENT_DOWNLOAD_URL}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-[13px]! font-semibold text-white transition-colors hover:bg-orange-700 md:text-[14px]!"
            >
              <span aria-hidden>⬇</span> 설치본 다운로드 (setup.exe)
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-4 py-2 text-[12px]! text-stone-500 dark:border-stone-700 dark:text-stone-400 md:text-[13px]!">
              설치본 준비 중 — 관리자에게 문의하세요.
            </span>
          )}
          <span className="text-[12px]! text-stone-500 dark:text-stone-500 md:text-[13px]!">
            작업 폴더에 도면(.dwg)을 두고 채팅에서 “도면 열어줘”처럼 요청하세요.
          </span>
        </div>
      </section>

      {/* 작업 큐 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px]! font-bold text-stone-900 dark:text-stone-50 md:text-[17px]!">
            2. 작업 큐 {isAdmin && <span className="text-[12px]! font-normal text-stone-500 md:text-[13px]!">(관리자 · 전체)</span>}
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px]! font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 md:text-[13px]!"
          >
            새로고침
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-[13px]! text-stone-500 md:text-[14px]!">불러오는 중…</p>
        ) : jobs.length === 0 ? (
          <p className="mt-4 text-[13px]! text-stone-500 md:text-[14px]!">
            아직 등록된 CAD 작업이 없습니다. AI 채팅에서 CAD 명령을 요청해 보세요.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={job.status} />
                  <code className="text-[13px]! font-semibold text-stone-900 dark:text-stone-100 md:text-[14px]!">{job.command}</code>
                  {job.risk_tier === 'destructive' && (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px]! font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 md:text-[11px]!">
                      파괴적
                    </span>
                  )}
                  {job.project_classification === 'confidential' && (
                    <span className="rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px]! font-semibold text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 md:text-[11px]!">
                      🔒 기밀
                    </span>
                  )}
                  <span className="ml-auto text-[11px]! text-stone-400 md:text-[12px]!">
                    {new Date(job.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                {Object.keys(job.params ?? {}).length > 0 && (
                  <pre className="overflow-x-auto rounded-lg bg-stone-50 p-2 text-[11px]! text-stone-600 dark:bg-stone-950 dark:text-stone-400 md:text-[12px]!">
                    {JSON.stringify(job.params, null, 2)}
                  </pre>
                )}
                {job.error && (
                  <p className="text-[12px]! text-rose-600 dark:text-rose-400 md:text-[13px]!">오류: {job.error}</p>
                )}
                {isAdmin && job.status === 'pending_approval' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={acting === job.id}
                      onClick={() => void handleApprove(job.id, true)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px]! font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 md:text-[13px]!"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={acting === job.id}
                      onClick={() => void handleApprove(job.id, false)}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-[12px]! font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 md:text-[13px]!"
                    >
                      반려
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 실행 가능한 명령 */}
      {programs.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-[15px]! font-bold text-stone-900 dark:text-stone-50 md:text-[17px]!">3. 실행 가능한 명령</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {programs.map((p) => (
              <li key={p.command_name} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
                <code className="text-[13px]! font-semibold text-stone-900 dark:text-stone-100 md:text-[14px]!">{p.command_name}</code>
                {p.risk_tier === 'destructive' && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px]! font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 md:text-[11px]!">
                    승인 필요
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default CadAgentPage
