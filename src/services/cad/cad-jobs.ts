import { supabase } from '../../lib/supabase'

/**
 * CAD 작업 큐(cad_jobs) 조회·승인 서비스.
 * - 일반 사용자: 본인이 요청한 작업만 조회(RLS).
 * - 관리자: 전체 조회 + 승인/반려(상태 전이).
 * 실제 실행은 사용자 PC의 로컬 에이전트가 cad_jobs를 폴링해 수행한다.
 */

export type CadJobStatus =
  | 'pending'
  | 'pending_approval'
  | 'running'
  | 'completed'
  | 'failed'

export type CadJob = {
  id: string
  command: string
  params: Record<string, unknown>
  status: CadJobStatus
  risk_tier: 'safe' | 'destructive'
  project_classification: 'general' | 'confidential'
  requested_by: string | null
  approved_by: string | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

export type AllowedProgram = {
  command_name: string
  exe_path: string
  allowed_input_roots: string[]
  risk_tier: 'safe' | 'destructive'
}

const JOB_COLUMNS =
  'id, command, params, status, risk_tier, project_classification, requested_by, approved_by, result, error, created_at'

export async function fetchMyCadJobs(limit = 50): Promise<CadJob[]> {
  const { data, error } = await supabase
    .from('cad_jobs')
    .select(JOB_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CadJob[]
}

/** 관리자 전용: 전체 작업(RLS admin_read 정책). fetchMyCadJobs와 동일 쿼리지만 관리자는 모두 보인다. */
export const fetchAllCadJobs = fetchMyCadJobs

export async function approveCadJob(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('cad_jobs')
    .update({ status: 'pending', approved_by: adminId })
    .eq('id', id)
    .eq('status', 'pending_approval')
  if (error) throw error
}

export async function rejectCadJob(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('cad_jobs')
    .update({ status: 'failed', approved_by: adminId, error: '관리자 반려' })
    .eq('id', id)
    .eq('status', 'pending_approval')
  if (error) throw error
}

const INSTALLER_BUCKET = 'agent-installer'
const INSTALLER_FILE = 'nh-agent-setup.exe'

/**
 * 설치본 다운로드 URL을 반환한다.
 * 우선순위: VITE_CAD_AGENT_DOWNLOAD_URL(명시 지정) → agent-installer 버킷에
 * 업로드된 setup.exe의 공개 URL → 없으면 null(버튼 대신 "준비 중" 표시).
 */
export async function getAgentInstallerUrl(): Promise<string | null> {
  const override = (import.meta.env.VITE_CAD_AGENT_DOWNLOAD_URL as string | undefined)?.trim()
  if (override) return override
  const { data, error } = await supabase.storage
    .from(INSTALLER_BUCKET)
    .list('', { search: INSTALLER_FILE, limit: 1 })
  if (error || !data?.some((f) => f.name === INSTALLER_FILE)) return null
  return supabase.storage.from(INSTALLER_BUCKET).getPublicUrl(INSTALLER_FILE).data.publicUrl
}

export async function fetchAllowedPrograms(): Promise<AllowedProgram[]> {
  const { data, error } = await supabase
    .from('allowed_programs')
    .select('command_name, exe_path, allowed_input_roots, risk_tier')
    .eq('enabled', true)
    .order('command_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as AllowedProgram[]
}
