import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/common/PageHeader'
import { IconFileText, IconHardHat } from '../components/common/icons'
import { firstMarkdownHeading, useHwpxSave } from '../hooks/useHwpxSave'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Category    = 'safety' | 'quality'
type ModelPref   = 'claude' | 'gemini' | 'hermes'

interface SafetyMeta {
  workplace: string
  project_name: string
  work_type: string
  work_stage: string
  assessor_name: string
  department: string
  assessment_date: string
  worker_count: string
  work_description: string
}

interface QualityMeta {
  facility_name: string
  inspection_area: string
  inspector_name: string
  department: string
  inspection_date: string
  contractor: string
  completion_year: string
  facility_age: string
  building_use: string
}

type Metadata = SafetyMeta | QualityMeta

interface SafetyFinding {
  no: number
  work_activity: string
  hazard: string
  hazard_type?: string
  current_measures: string
  probability: number
  severity: number
  risk_score: number
  risk_level: string
  reduction_measures: string
  residual_risk_level: string
  regulation: string
}

interface QualityDefect {
  no: number
  location: string
  defect_type: string
  severity: 'minor' | 'major' | 'critical'
  size_description?: string
  cause_analysis?: string
  description: string
  repair_method: string
  repair_priority: string
  standard_reference?: string
}

interface SafetyResult {
  overall_risk_level: string
  summary: string
  findings: SafetyFinding[]
  compliant_items: string[]
  recommendations: string[]
  applicable_regulations: string[]
}

interface QualityResult {
  overall_grade: string
  quality_score: number
  summary: string
  defects: QualityDefect[]
  conformant_items: string[]
  recommendations: string[]
  applicable_standards: string[]
}

interface Correction {
  finding_index: number
  finding_item: string
  original_severity: string
  corrected_severity: string
  note: string
  corrected_at: string
}

interface AssessmentRecord {
  id: string
  category: Category
  location: string | null
  overall_level: string
  result: SafetyResult | QualityResult
  report_text: string | null
  report_metadata: Metadata | null
  image_thumb_b64: string | null
  corrections: Correction[]
  feedback_status: string
  preferred_model: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RISK_CFG: Record<string, { label: string; cls: string }> = {
  low:      { label: '낮음 (Low)',     cls: 'bg-success-soft text-success' },
  medium:   { label: '보통 (Medium)',  cls: 'bg-warning-soft text-warning' },
  high:     { label: '높음 (High)',    cls: 'bg-brand-soft text-brand' },
  critical: { label: '위험 (Critical)',cls: 'bg-danger-soft text-danger' },
}

const GRADE_CLS: Record<string, string> = {
  A: 'text-success', B: 'text-blue-600', C: 'text-amber-600', D: 'text-orange-600', F: 'text-danger',
}

const SEV_DOT: Record<string, string> = {
  low: 'bg-emerald-500', medium: 'bg-amber-500', high: 'bg-orange-500', critical: 'bg-danger',
  minor: 'bg-emerald-500', major: 'bg-amber-500',
}

const SEV_LABEL_KO: Record<string, string> = {
  low: '낮음', medium: '보통', high: '높음', critical: '매우높음',
  minor: '경미', major: '중결함',
}

const MODEL_OPTIONS = [
  { value: 'claude'  as ModelPref, label: 'Claude Sonnet',  desc: '권장 · 정밀 분석' },
  { value: 'gemini'  as ModelPref, label: 'Gemini Flash',   desc: '빠른 처리' },
  { value: 'hermes'  as ModelPref, label: 'Hermes (사내)',  desc: '사내 전용 모델' },
]

const WORK_TYPES  = ['건축', '토목', '플랜트', '설비', '전기', '해체', '기타']
const WORK_STAGES = ['착공 전', '착공 초기', '시공 중', '마감 단계', '준공 후', '유지관리']
const BLDG_USES   = ['사무시설', '판매·업무시설', '숙박시설', '공동주택', '교육시설', '의료시설', '공장', '창고', '기타']

const MAX_IMG = 4 * 1024 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file)
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso))
}

function riskLabel(score: number): string {
  if (score >= 15) return '매우높음'
  if (score >= 10) return '높음'
  if (score >= 5)  return '보통'
  return '낮음'
}

function riskBg(score: number): string {
  if (score >= 15) return 'bg-danger-soft text-danger'
  if (score >= 10) return 'bg-brand-soft text-brand'
  if (score >= 5)  return 'bg-warning-soft text-warning'
  return 'bg-success-soft text-success'
}

// ─────────────────────────────────────────────────────────────────────────────
// Default metadata
// ─────────────────────────────────────────────────────────────────────────────

const defaultSafetyMeta = (): SafetyMeta => ({
  workplace: '', project_name: '', work_type: '건축', work_stage: '시공 중',
  assessor_name: '', department: '', assessment_date: today(), worker_count: '', work_description: '',
})

const defaultQualityMeta = (): QualityMeta => ({
  facility_name: '', inspection_area: '', inspector_name: '',
  department: '', inspection_date: today(), contractor: '', completion_year: '', facility_age: '', building_use: '사무시설',
})

// ─────────────────────────────────────────────────────────────────────────────
// MetadataForm
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-fg-muted">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}

const inputCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
const selectCls = inputCls

function SafetyMetaForm({ value, onChange }: { value: SafetyMeta; onChange: (v: SafetyMeta) => void }) {
  const set = (k: keyof SafetyMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="사업장명" required><input className={inputCls} value={value.workplace} onChange={set('workplace')} placeholder="예: (주)NH건설" /></Field>
      <Field label="공사명 / 작업명" required><input className={inputCls} value={value.project_name} onChange={set('project_name')} placeholder="예: 3층 외벽 도장 공사" /></Field>
      <Field label="작업 종류">
        <select className={selectCls} value={value.work_type} onChange={set('work_type')}>
          {WORK_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="공사 단계">
        <select className={selectCls} value={value.work_stage} onChange={set('work_stage')}>
          {WORK_STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="평가자명" required><input className={inputCls} value={value.assessor_name} onChange={set('assessor_name')} placeholder="예: 홍길동" /></Field>
      <Field label="소속부서"><input className={inputCls} value={value.department} onChange={set('department')} placeholder="예: 안전관리부" /></Field>
      <Field label="평가일" required><input type="date" className={inputCls} value={value.assessment_date} onChange={set('assessment_date')} /></Field>
      <Field label="작업인원"><input className={inputCls} value={value.worker_count} onChange={set('worker_count')} placeholder="예: 5명" /></Field>
      <div className="sm:col-span-2">
        <Field label="작업 내용 상세">
          <textarea className={inputCls} rows={2} value={value.work_description} onChange={set('work_description')}
            placeholder="예: 외벽 균열 보수 후 방수 도장 작업, 고소 작업 포함" />
        </Field>
      </div>
    </div>
  )
}

function QualityMetaForm({ value, onChange }: { value: QualityMeta; onChange: (v: QualityMeta) => void }) {
  const set = (k: keyof QualityMeta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="시설물명 / 공사명" required><input className={inputCls} value={value.facility_name} onChange={set('facility_name')} placeholder="예: NH빌딩 3호관" /></Field>
      <Field label="검사 부위" required><input className={inputCls} value={value.inspection_area} onChange={set('inspection_area')} placeholder="예: 지하주차장 천장, 외벽 3층" /></Field>
      <Field label="검사자명" required><input className={inputCls} value={value.inspector_name} onChange={set('inspector_name')} placeholder="예: 홍길동" /></Field>
      <Field label="소속부서"><input className={inputCls} value={value.department} onChange={set('department')} placeholder="예: 시설관리팀" /></Field>
      <Field label="검사일" required><input type="date" className={inputCls} value={value.inspection_date} onChange={set('inspection_date')} /></Field>
      <Field label="시공사"><input className={inputCls} value={value.contractor} onChange={set('contractor')} placeholder="예: (주)대한건설" /></Field>
      <Field label="준공연도"><input className={inputCls} value={value.completion_year} onChange={set('completion_year')} placeholder="예: 2015" /></Field>
      <Field label="경과연수"><input className={inputCls} value={value.facility_age} onChange={set('facility_age')} placeholder="예: 9" /></Field>
      <Field label="시설물 용도">
        <select className={selectCls} value={value.building_use} onChange={set('building_use')}>
          {BLDG_USES.map(u => <option key={u}>{u}</option>)}
        </select>
      </Field>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportView — 정식 보고서 렌더링 + 인쇄
// ─────────────────────────────────────────────────────────────────────────────

function ReportView({ record }: { record: AssessmentRecord }) {
  const printRef = useRef<HTMLDivElement>(null)
  const isSafety = record.category === 'safety'
  const safetyR  = record.result as SafetyResult
  const qualityR = record.result as QualityResult
  const meta     = record.report_metadata ?? {}
  const { save: saveHwpx, saving: hwpxSaving } = useHwpxSave()

  const handleHwpxSave = () => {
    const reportTitle = isSafety ? '위험성평가 보고서' : '품질검사 보고서'
    const overall = isSafety
      ? (RISK_CFG[record.overall_level?.toLowerCase()]?.label ?? record.overall_level)
      : `${record.overall_level}등급`
    const body = record.report_text?.trim()
      ? record.report_text
      : [
          `# ${reportTitle}`,
          '',
          `- **평가일**: ${fmtDate(record.created_at)}`,
          `- **종합 결과**: ${overall}`,
          '',
          (isSafety ? safetyR.summary : qualityR.summary) ?? '',
        ].join('\n')
    const markdown = `${body}\n\n---\n\n> 본 보고서는 AI 분석 결과입니다. 공식 사용 시 전문가 검토가 필요합니다. · 생성일: ${fmtDate(record.created_at)}`
    void saveHwpx(markdown, {
      title: firstMarkdownHeading(body) || reportTitle,
      filename: `${reportTitle}_${fmtDate(record.created_at)}`,
    })
  }

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="ko"><head>
      <meta charset="UTF-8"><title>${isSafety ? '위험성평가 보고서' : '품질검사 보고서'}</title>
      <style>
        body{font-family:'Malgun Gothic',sans-serif;font-size:11pt;color:#111;padding:20mm;max-width:210mm;margin:0 auto}
        h1{font-size:16pt;font-weight:bold;text-align:center;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:16px}
        h2{font-size:12pt;font-weight:bold;margin-top:18px;margin-bottom:6px;border-left:4px solid #555;padding-left:8px}
        h3{font-size:11pt;font-weight:bold;margin-top:12px;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;font-size:9pt;margin:8px 0}
        th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}
        th{background:#f0f0f0;font-weight:bold}
        .risk-low{background:#d1fae5}.risk-med{background:#fef3c7}.risk-high{background:#fed7aa}.risk-crit{background:#fecaca}
        .grade{font-size:20pt;font-weight:bold}
        .footer{margin-top:20px;border-top:1px solid #ccc;padding-top:8px;font-size:8pt;color:#666;text-align:center}
        p{margin:4px 0;font-size:10pt}
        ul{margin:4px 0 4px 16px}
        li{font-size:10pt}
        @media print{body{padding:10mm}}
      </style></head><body>`)

    if (record.report_text) {
      // AI가 생성한 마크다운 보고서를 기본 HTML로 변환
      const html = record.report_text
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^---$/gm, '<hr/>')
        .replace(/^\| (.+) \|$/gm, (line) => {
          const cells = line.split('|').slice(1, -1).map(c => c.trim())
          if (cells.every(c => /^:?-+:?$/.test(c))) return ''
          return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>'
        })
        .replace(/((<tr>.*?<\/tr>\n?)+)/gs, '<table><tbody>$1</tbody></table>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/((<li>.*?<\/li>\n?)+)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '<br/>')
      w.document.write(html)
    } else {
      // fallback: 데이터 기반 기본 보고서
      w.document.write(`<h1>${isSafety ? '위험성평가 보고서' : '품질검사 보고서'}</h1>`)
      w.document.write(`<p><strong>평가일:</strong> ${fmtDate(record.created_at)}</p>`)
      w.document.write(`<p><strong>종합 결과:</strong> ${isSafety ? (RISK_CFG[record.overall_level?.toLowerCase()]?.label ?? record.overall_level) : `${record.overall_level}등급`}</p>`)
      w.document.write(`<p>${isSafety ? safetyR.summary : qualityR.summary}</p>`)
    }

    w.document.write(`<div class="footer">본 보고서는 AI 분석 결과입니다. 공식 사용 시 전문가 검토가 필요합니다. | 생성일: ${fmtDate(record.created_at)}</div>`)
    w.document.write('</body></html>')
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  return (
    <div className="space-y-6">
      {/* 보고서 헤더 */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-bold text-fg">
              {isSafety ? '위험성평가 보고서' : '품질검사 보고서'}
            </h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {record.preferred_model && <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5">{record.preferred_model}</span>}
              {fmtDate(record.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSafety ? (
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${RISK_CFG[record.overall_level?.toLowerCase()]?.cls ?? 'bg-surface-2 text-fg-muted'}`}>
                위험도 {RISK_CFG[record.overall_level?.toLowerCase()]?.label ?? record.overall_level}
              </span>
            ) : (
              <span className={`text-3xl font-black ${GRADE_CLS[record.overall_level?.toUpperCase()] ?? 'text-fg-muted'}`}>
                {record.overall_level}등급
              </span>
            )}
            <button
              type="button"
              onClick={handleHwpxSave}
              disabled={hwpxSaving}
              className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft/70 disabled:opacity-50"
              title="한글 문서(.hwpx)로 저장"
            >
              <IconFileText className="h-4 w-4" />
              {hwpxSaving ? '저장 중…' : '한글(HWPX) 저장'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 개요 테이블 */}
        {record.report_metadata && Object.keys(record.report_metadata).some(k => (record.report_metadata as unknown as Record<string,unknown>)[k]) && (
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {isSafety ? (
                  <>
                    {([['workplace','사업장명'],['project_name','공사명/작업명'],['work_type','작업 종류'],['work_stage','공사 단계'],['assessor_name','평가자'],['department','소속부서'],['assessment_date','평가일'],['worker_count','작업인원']] as const).map(([k,l]) => {
                      const v = (meta as Record<string,unknown>)[k]
                      return v ? (
                        <tr key={k}>
                          <td className="w-32 py-2 pr-4 font-medium text-fg-subtle">{l}</td>
                          <td className="py-2 text-fg">{String(v)}</td>
                        </tr>
                      ) : null
                    })}
                  </>
                ) : (
                  <>
                    {([['facility_name','시설물명'],['inspection_area','검사 부위'],['inspector_name','검사자'],['department','소속부서'],['inspection_date','검사일'],['contractor','시공사'],['completion_year','준공연도'],['facility_age','경과연수'],['building_use','용도']] as const).map(([k,l]) => {
                      const v = (meta as Record<string,unknown>)[k]
                      return v ? (
                        <tr key={k}>
                          <td className="w-32 py-2 pr-4 font-medium text-fg-subtle">{l}</td>
                          <td className="py-2 text-fg">{String(v)}</td>
                        </tr>
                      ) : null
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 종합 소견 */}
      <div className="rounded-xl border border-border bg-bg px-5 py-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">종합 소견</p>
        <p className="text-sm leading-relaxed text-fg">
          {isSafety ? safetyR.summary : qualityR.summary}
        </p>
      </div>

      {/* 위험성 평가표 (안전) */}
      {isSafety && safetyR.findings?.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h3 className="font-semibold text-fg">위험성 평가표</h3>
            <p className="mt-0.5 text-xs text-fg-subtle">위험성 = 가능성 × 중대성 | ≥15 매우높음 · ≥10 높음 · ≥5 보통 · &lt;5 낮음</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-bg">
                <tr>
                  {['No','작업/공정','유해·위험요인','현재 조치','가능성','중대성','위험성','위험도','감소대책','잔류위험','관련법규'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-fg-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {safetyR.findings.map((f, i) => {
                  const score = f.risk_score ?? (f.probability * f.severity)
                  return (
                    <tr key={i} className="hover:bg-surface-2/60">
                      <td className="px-3 py-2.5 font-medium text-fg-subtle">{f.no ?? i + 1}</td>
                      <td className="px-3 py-2.5 text-fg">{f.work_activity}</td>
                      <td className="px-3 py-2.5 font-medium text-fg">{f.hazard}</td>
                      <td className="px-3 py-2.5 text-fg-muted">{f.current_measures}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{f.probability}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{f.severity}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{score}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${riskBg(score)}`}>{riskLabel(score)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted">{f.reduction_measures}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block h-2 w-2 rounded-full ${SEV_DOT[f.residual_risk_level?.toLowerCase()] ?? 'bg-slate-400'}`} />
                        <span className="ml-1">{SEV_LABEL_KO[f.residual_risk_level?.toLowerCase()] ?? f.residual_risk_level}</span>
                      </td>
                      <td className="px-3 py-2.5 text-fg-subtle">{f.regulation}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 품질 점수 + 결함 현황표 (품질) */}
      {!isSafety && (
        <>
          <div>
            <div className="mb-1 flex justify-between text-xs text-fg-subtle">
              <span>품질 점수</span>
              <span className="font-semibold">{qualityR.quality_score}점 / 100점</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full transition-all ${qualityR.quality_score >= 80 ? 'bg-emerald-500' : qualityR.quality_score >= 60 ? 'bg-amber-500' : 'bg-danger'}`}
                style={{ width: `${Math.min(100, qualityR.quality_score ?? 0)}%` }}
              />
            </div>
          </div>

          {qualityR.defects?.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-3">
                <h3 className="font-semibold text-fg">결함 현황표</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-bg">
                    <tr>
                      {['No','위치','결함 분류','심각도','규모/범위','원인 분석','보수 방법','우선순위','기준'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-fg-muted whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {qualityR.defects.map((d, i) => (
                      <tr key={i} className="hover:bg-surface-2/60">
                        <td className="px-3 py-2.5 font-medium text-fg-subtle">{d.no ?? i + 1}</td>
                        <td className="px-3 py-2.5 text-fg">{d.location}</td>
                        <td className="px-3 py-2.5 font-medium text-fg">{d.defect_type}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${d.severity === 'critical' ? 'bg-danger-soft text-danger' : d.severity === 'major' ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}>
                            {SEV_LABEL_KO[d.severity] ?? d.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-fg-muted">{d.size_description ?? '-'}</td>
                        <td className="px-3 py-2.5 text-fg-muted">{d.cause_analysis ?? '-'}</td>
                        <td className="px-3 py-2.5 text-fg-muted">{d.repair_method}</td>
                        <td className="px-3 py-2.5 font-medium text-fg-muted">{d.repair_priority}</td>
                        <td className="px-3 py-2.5 text-fg-subtle">{d.standard_reference ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 준수/적합 사항 */}
      {(isSafety ? safetyR.compliant_items : qualityR.conformant_items)?.length > 0 && (
        <div className="rounded-xl border border-success/30 bg-success-soft/50 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">
            {isSafety ? '준수 사항' : '적합 사항'}
          </p>
          <ul className="space-y-1">
            {(isSafety ? safetyR.compliant_items : qualityR.conformant_items).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                <span className="mt-1 shrink-0 text-emerald-500">✓</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 권고 사항 */}
      {(isSafety ? safetyR.recommendations : qualityR.recommendations)?.length > 0 && (
        <div className="rounded-xl border border-border px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">개선 권고 사항</p>
          <ul className="space-y-1">
            {(isSafety ? safetyR.recommendations : qualityR.recommendations).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                <span className="mt-0.5 shrink-0 text-fg-subtle">•</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 법규/기준 */}
      {(isSafety ? safetyR.applicable_regulations : qualityR.applicable_standards)?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">관련 법규 및 기준</p>
          <div className="flex flex-wrap gap-1.5">
            {(isSafety ? safetyR.applicable_regulations : qualityR.applicable_standards).map((s, i) => (
              <span key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">{s}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-fg-subtle">
        ※ 본 보고서는 AI 분석 결과로, 공식 문서 사용 시 전문가 검토가 필요합니다.
      </p>

      <div ref={printRef} className="hidden" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function SiteAssessmentUserPage() {
  const [category, setCategory]     = useState<Category>('safety')
  const [model, setModel]           = useState<ModelPref>('claude')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [location, setLocation]     = useState('')
  const [safetyMeta, setSafetyMeta] = useState<SafetyMeta>(defaultSafetyMeta)
  const [qualityMeta, setQualityMeta] = useState<QualityMeta>(defaultQualityMeta)
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<AssessmentRecord | null>(null)
  const [history, setHistory]       = useState<AssessmentRecord[]>([])
  const [tab, setTab]               = useState<'new' | 'history'>('new')
  const [selectedRecord, setSelectedRecord] = useState<AssessmentRecord | null>(null)
  const [dragging, setDragging]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('이미지 파일만 가능합니다.'); return }
    if (file.size > MAX_IMG) { setError('4MB 이하 이미지만 가능합니다.'); return }
    setError(null); setImageFile(file); setImagePreview(await fileToDataUrl(file))
  }, [])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('site_assessments')
      .select('id,category,location,overall_level,result,report_text,report_metadata,image_thumb_b64,corrections,feedback_status,preferred_model,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory((data ?? []) as AssessmentRecord[])
  }, [])

  useEffect(() => { queueMicrotask(() => void loadHistory()) }, [loadHistory])

  const handleSubmit = useCallback(async () => {
    if (!imagePreview) { setError('사진을 먼저 업로드해주세요.'); return }
    const meta = category === 'safety' ? safetyMeta : qualityMeta
    const requiredKey = category === 'safety' ? 'workplace' : 'facility_name'
    if (!(meta as unknown as Record<string,string>)[requiredKey]?.trim()) {
      setError(`${category === 'safety' ? '사업장명' : '시설물명'}은 필수 항목입니다.`); return
    }
    setBusy(true); setError(null); setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요합니다.')
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/site-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ image_data_url: imagePreview, category, location: location.trim() || undefined, preferred_model: model, metadata: meta }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '분석 중 오류')
      const record: AssessmentRecord = {
        id: json.id ?? crypto.randomUUID(), category,
        location: location.trim() || null, overall_level: json.overall_level,
        result: json.result, report_text: json.report_text ?? null,
        report_metadata: meta, image_thumb_b64: imagePreview,
        corrections: [], feedback_status: 'pending',
        preferred_model: json.model ?? null, created_at: json.created_at,
      }
      setResult(record)
      void loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally { setBusy(false) }
  }, [imagePreview, category, model, location, safetyMeta, qualityMeta, loadHistory])

  const resetForm = () => {
    setImageFile(null); setImagePreview(null); setLocation(''); setError(null); setResult(null)
    setSafetyMeta(defaultSafetyMeta()); setQualityMeta(defaultQualityMeta())
  }

  // ── Render ──

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="팀 · 현장 · 현장 AI 평가"
        title="사진 한 장으로 현장 보고서를"
        description="현장 사진과 기본 정보를 입력하면 AI가 위험성평가 / 품질검사 보고서를 자동 작성합니다."
        icon={IconHardHat}
      />

      {/* 탭 */}
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface-2/70 p-1">
        {([['new','📝 새 보고서'],['history','🗂 보고서 이력']] as const).map(([t,l]) => (
          <button key={t} type="button" onClick={() => { setTab(t); setSelectedRecord(null) }}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition md:text-[14px] ${tab===t ? 'bg-surface text-accent shadow-sm' : 'text-fg-subtle hover:text-fg'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── 새 보고서 ── */}
      {tab === 'new' && (
        <div className="grid gap-6 xl:grid-cols-5">

          {/* 입력 패널 */}
          <div className="space-y-5 xl:col-span-2">

            {/* 카테고리 */}
            <div className="grid grid-cols-2 gap-2">
              {([['safety','🦺','안전보건 위험성평가'],['quality','🏗','품질관리 검사']] as const).map(([c,e,l]) => (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${category===c ? 'border-indigo-400 bg-accent-soft' : 'border-border bg-surface hover:border-border-strong'}`}>
                  <span className="text-2xl">{e}</span>
                  <span className="mt-1 text-sm font-semibold text-fg">{l}</span>
                </button>
              ))}
            </div>

            {/* 사진 업로드 */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">현장 사진 <span className="text-red-500">*</span></p>
              {imagePreview ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  <img src={imagePreview} alt="" className="max-h-52 w-full object-contain bg-bg" />
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="truncate text-xs text-fg-subtle">{imageFile?.name}</span>
                    <button type="button" onClick={resetForm} className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </div>
              ) : (
                <button type="button"
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={async (e) => { e.preventDefault(); setDragging(false); const f=e.dataTransfer.files[0]; if(f) await handleFile(f) }}
                  onClick={() => fileRef.current?.click()}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition ${dragging ? 'border-indigo-400 bg-accent-soft' : 'border-border-strong bg-bg hover:border-border-strong'}`}>
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-medium text-fg-muted">클릭 또는 드래그해서 업로드</span>
                  <span className="text-xs text-fg-subtle">JPG · PNG · WEBP · 최대 4MB</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f=e.target.files?.[0]; if(f) await handleFile(f) }} />
            </div>

            {/* 촬영 장소 */}
            <Field label="촬영 장소 (선택)">
              <input className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="예: 3층 외벽 북측, 지하주차장 B2" />
            </Field>

            {/* 메타데이터 폼 */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {category === 'safety' ? '위험성평가 기본 정보' : '품질검사 기본 정보'}
              </p>
              {category === 'safety'
                ? <SafetyMetaForm value={safetyMeta} onChange={setSafetyMeta} />
                : <QualityMetaForm value={qualityMeta} onChange={setQualityMeta} />
              }
            </div>

            {/* 모델 선택 */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">AI 모델</p>
              <div className="flex gap-2">
                {MODEL_OPTIONS.map(m => (
                  <button key={m.value} type="button" onClick={() => setModel(m.value)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${model===m.value ? 'border-indigo-400 bg-accent-soft text-accent' : 'border-border text-fg-muted hover:border-border-strong'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <button type="button" disabled={busy || !imagePreview} onClick={() => void handleSubmit()}
              className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent disabled:opacity-50">
              {busy ? '보고서 작성 중… (30~60초 소요)' : '📄 AI 보고서 생성'}
            </button>
          </div>

          {/* 결과 패널 */}
          <div className="xl:col-span-3">
            {busy ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent/30">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <p className="text-sm text-fg-subtle">사진을 분석하고 보고서를 작성 중입니다…</p>
              </div>
            ) : result ? (
              <ReportView record={result} />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border">
                <span className="text-4xl opacity-25">📄</span>
                <p className="text-sm text-fg-subtle">기본 정보와 사진을 입력하고<br/>보고서 생성 버튼을 누르세요</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 이력 탭 ── */}
      {tab === 'history' && (
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="space-y-2 xl:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">최근 보고서</p>
              <button type="button" onClick={() => void loadHistory()} className="text-xs text-accent hover:underline">새로고침</button>
            </div>
            {history.length === 0
              ? <p className="py-8 text-center text-sm text-fg-subtle">보고서 이력이 없습니다.</p>
              : history.map(rec => {
                  const meta = rec.report_metadata as Record<string,unknown> | null
                  const title = rec.category === 'safety'
                    ? (meta?.project_name ?? meta?.workplace ?? '무제')
                    : (meta?.facility_name ?? meta?.inspection_area ?? '무제')
                  return (
                    <button key={rec.id} type="button" onClick={() => setSelectedRecord(rec)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${selectedRecord?.id===rec.id ? 'border-accent/30 bg-accent-soft' : 'border-border bg-surface hover:border-border-strong'}`}>
                      {rec.image_thumb_b64
                        ? <img src={rec.image_thumb_b64} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-2xl">{rec.category==='safety'?'🦺':'🏗'}</div>
                      }
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{String(title)}</p>
                        <p className="text-xs text-accent">{rec.category==='safety' ? '안전보건' : '품질관리'}</p>
                        <p className="text-xs text-fg-subtle">{fmtDate(rec.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-sm font-bold">
                        {rec.category==='safety'
                          ? <span className={`${RISK_CFG[rec.overall_level?.toLowerCase()]?.cls?.split(' ')[1] ?? 'text-fg-subtle'}`}>{RISK_CFG[rec.overall_level?.toLowerCase()]?.label?.split(' ')[0] ?? rec.overall_level}</span>
                          : <span className={GRADE_CLS[rec.overall_level?.toUpperCase()] ?? 'text-fg-subtle'}>{rec.overall_level}</span>
                        }
                      </div>
                    </button>
                  )
                })
            }
          </div>
          <div className="xl:col-span-3">
            {selectedRecord
              ? <ReportView record={selectedRecord} />
              : <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-border">
                  <p className="text-sm text-fg-subtle">좌측에서 보고서를 선택하세요.</p>
                </div>
            }
          </div>
        </div>
      )}
    </div>
  )
}
