import { supabase } from '../../lib/supabase'

/**
 * 브라우저 CAD 에디터의 DWG 열기: 로컬 에이전트에게 DWG→DXF 변환을 시키고
 * 그 결과(DXF 텍스트)를 받아온다. (작업 폴더 C:\NH-AI-HUB-workspace 안의 .dwg 대상)
 */

/** 변환 작업을 큐잉하고 job_id 를 반환. */
export async function requestDwgConversion(filename: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('cad-convert', {
    body: { filename },
  })
  if (error) throw new Error(error.message)
  if (!data?.job_id) throw new Error(data?.error || '변환 요청에 실패했습니다.')
  return data.job_id as string
}

export interface ConversionResult {
  dxfText: string
  bytes: number
}

/**
 * 변환 완료까지 cad_jobs 를 폴링(본인 작업만 RLS로 조회). 완료 시 DXF 텍스트 반환.
 * 에이전트가 실행 중이 아니면 pending 상태로 남으므로 timeoutMs 후 안내 에러.
 */
export async function waitForConversion(
  jobId: string,
  opts: { timeoutMs?: number; intervalMs?: number; onStatus?: (s: string) => void } = {},
): Promise<ConversionResult> {
  const timeoutMs = opts.timeoutMs ?? 90_000
  const intervalMs = opts.intervalMs ?? 2_000
  const deadline = Date.now() + timeoutMs
  let lastStatus = ''

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('cad_jobs')
      .select('status, result, error')
      .eq('id', jobId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) {
      if (data.status !== lastStatus) {
        lastStatus = data.status
        opts.onStatus?.(data.status)
      }
      if (data.status === 'completed') {
        const result = (data.result ?? {}) as { dxf_text?: string; bytes?: number }
        if (!result.dxf_text) throw new Error('변환 결과에 DXF가 없습니다.')
        return { dxfText: result.dxf_text, bytes: result.bytes ?? result.dxf_text.length }
      }
      if (data.status === 'failed') {
        throw new Error(data.error || '변환에 실패했습니다.')
      }
      if (data.status === 'pending_approval') {
        throw new Error('이 작업은 관리자 승인 대기 중입니다.')
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    '시간이 초과되었습니다. 이 PC에서 CAD 에이전트가 실행 중인지, 파일이 작업 폴더에 있는지 확인하세요.',
  )
}
