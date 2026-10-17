import { useCallback, useEffect, useRef, useState } from 'react'

import { AdminPageHeader } from '../../components/auth/admin/AdminPageHeader'
import { adminPageRootWide } from '../../components/auth/admin/admin-ui'
import { supabase } from '../../lib/supabase'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type Category = 'safety' | 'quality'

type SafetyFinding = {
  item: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  action: string
}

type QualityDefect = {
  item: string
  severity: 'minor' | 'major' | 'critical'
  location_detail?: string
  description: string
  action: string
}

type SafetyResult = {
  overall_risk_level: string
  summary: string
  findings: SafetyFinding[]
  compliant_items: string[]
  recommendations: string[]
  applicable_regulations: string[]
}

type QualityResult = {
  overall_grade: string
  quality_score: number
  summary: string
  defects: QualityDefect[]
  conformant_items: string[]
  recommendations: string[]
  applicable_standards: string[]
}

type AssessmentRecord = {
  id: string
  category: Category
  location: string | null
  notes: string | null
  overall_level: string
  result: SafetyResult | QualityResult
  image_thumb_b64: string | null
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const RISK_LABEL: Record<string, { label: string; className: string }> = {
  low:      { label: '낮음', className: 'bg-success-soft text-success' },
  medium:   { label: '보통', className: 'bg-warning-soft text-warning' },
  high:     { label: '높음', className: 'bg-brand-soft text-brand' },
  critical: { label: '위험', className: 'bg-danger-soft text-danger' },
}

const SEVERITY_LABEL: Record<string, { label: string; bar: string }> = {
  low:      { label: '낮음', bar: 'bg-emerald-500' },
  medium:   { label: '보통', bar: 'bg-amber-500' },
  high:     { label: '높음', bar: 'bg-orange-500' },
  critical: { label: '위험', bar: 'bg-danger' },
  minor:    { label: '경미', bar: 'bg-emerald-500' },
  major:    { label: '중결함', bar: 'bg-amber-500' },
}

const GRADE_CLASS: Record<string, string> = {
  A: 'text-success',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-amber-600',
  D: 'text-orange-600',
  F: 'text-danger',
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024  // 4MB limit before base64

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_LABEL[level.toLowerCase()] ?? { label: level, className: 'bg-surface-2 text-fg-muted' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_LABEL[severity.toLowerCase()] ?? { label: severity, bar: 'bg-slate-400' }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
      <span className={`h-2 w-2 rounded-full ${cfg.bar}`} />
      {cfg.label}
    </span>
  )
}

function SafetyResultView({ result }: { result: SafetyResult }) {
  return (
    <div className="space-y-5">
      {/* 위험 요소 */}
      {result.findings.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-danger">
            위험 요소 ({result.findings.length}건)
          </h3>
          <div className="space-y-2">
            {result.findings.map((f, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{f.item}</span>
                  <SeverityBadge severity={f.severity} />
                </div>
                <p className="mt-1 text-sm text-fg-muted">{f.description}</p>
                <p className="mt-1.5 text-xs text-accent">
                  <span className="font-semibold">조치:</span> {f.action}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 준수 사항 */}
      {result.compliant_items?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">
            준수 사항
          </h3>
          <ul className="space-y-1">
            {result.compliant_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                <span className="mt-1 shrink-0 text-emerald-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 권고 사항 */}
      {result.recommendations?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            개선 권고
          </h3>
          <ul className="space-y-1">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                <span className="mt-0.5 shrink-0 text-fg-subtle">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 관련 법규 */}
      {result.applicable_regulations?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            관련 법규·기준
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {result.applicable_regulations.map((reg, i) => (
              <span key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                {reg}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function QualityResultView({ result }: { result: QualityResult }) {
  const score = typeof result.quality_score === 'number' ? result.quality_score : 0
  const scoreBar = Math.min(100, Math.max(0, score))

  return (
    <div className="space-y-5">
      {/* 점수 바 */}
      <div>
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>품질 점수</span>
          <span className="font-semibold tabular-nums">{score}점</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full transition-all ${
              score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-danger'
            }`}
            style={{ width: `${scoreBar}%` }}
          />
        </div>
      </div>

      {/* 결함 목록 */}
      {result.defects?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-danger">
            발견 결함 ({result.defects.length}건)
          </h3>
          <div className="space-y-2">
            {result.defects.map((d, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{d.item}</span>
                  <SeverityBadge severity={d.severity} />
                </div>
                {d.location_detail && (
                  <p className="mt-0.5 text-xs text-fg-subtle">위치: {d.location_detail}</p>
                )}
                <p className="mt-1 text-sm text-fg-muted">{d.description}</p>
                <p className="mt-1.5 text-xs text-accent">
                  <span className="font-semibold">보수:</span> {d.action}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 적합 사항 */}
      {result.conformant_items?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">
            적합 사항
          </h3>
          <ul className="space-y-1">
            {result.conformant_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                <span className="mt-1 shrink-0 text-emerald-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 권고 사항 */}
      {result.recommendations?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            유지관리 권고
          </h3>
          <ul className="space-y-1">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                <span className="mt-0.5 shrink-0 text-fg-subtle">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 적용 기준 */}
      {result.applicable_standards?.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            적용 기준
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {result.applicable_standards.map((std, i) => (
              <span key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                {std}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// History item
// ────────────────────────────────────────────────────────────────────────────

function HistoryItem({
  record,
  onClick,
}: {
  record: AssessmentRecord
  onClick: () => void
}) {
  const isSafety = record.category === 'safety'
  const categoryLabel = isSafety ? '안전보건' : '품질관리'
  const levelKey = record.overall_level?.toLowerCase()

  const levelDisplay = isSafety
    ? (RISK_LABEL[levelKey]?.label ?? record.overall_level)
    : `${record.overall_level}등급`

  const levelColor = isSafety
    ? (RISK_LABEL[levelKey]?.className ?? 'bg-surface-2 text-fg-muted')
    : (GRADE_CLASS[record.overall_level?.toUpperCase()] ? '' : '')

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:border-indigo-200 hover:bg-accent-soft/30"
    >
      {record.image_thumb_b64 ? (
        <img
          src={record.image_thumb_b64}
          alt=""
          className="h-14 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-2 text-2xl">
          {isSafety ? '🦺' : '🏗'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-accent">{categoryLabel}</span>
          {isSafety ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${levelColor}`}>
              {levelDisplay}
            </span>
          ) : (
            <span className={`text-sm font-bold ${GRADE_CLASS[record.overall_level?.toUpperCase()] ?? 'text-fg-muted'}`}>
              {levelDisplay}
            </span>
          )}
        </div>
        {record.location && (
          <p className="mt-0.5 truncate text-sm text-fg-muted">{record.location}</p>
        )}
        <p className="mt-0.5 text-xs text-fg-subtle">{formatDateTime(record.created_at)}</p>
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────

export function SiteAssessmentPage() {
  // Form state
  const [category, setCategory] = useState<Category>('safety')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Result state
  const [latestResult, setLatestResult] = useState<AssessmentRecord | null>(null)

  // History
  const [history, setHistory] = useState<AssessmentRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form')
  const [selectedRecord, setSelectedRecord] = useState<AssessmentRecord | null>(null)

  // Drag state
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Image handling ──

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMsg('이미지 크기는 4MB 이하여야 합니다.')
      return
    }
    setErrorMsg(null)
    setImageFile(file)
    const dataUrl = await fileToDataUrl(file)
    setImagePreview(dataUrl)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) await handleImageFile(file)
    },
    [handleImageFile],
  )

  // ── Load history ──

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('site_assessments')
      .select('id, category, location, notes, overall_level, result, image_thumb_b64, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    setHistory((data ?? []) as AssessmentRecord[])
    setHistoryLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadHistory())
  }, [loadHistory])

  // ── Submit ──

  const handleSubmit = useCallback(async () => {
    if (!imagePreview) {
      setErrorMsg('이미지를 먼저 업로드해주세요.')
      return
    }
    setBusy(true)
    setErrorMsg(null)
    setLatestResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요합니다.')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/site-assessment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_data_url: imagePreview,
          category,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '평가 중 오류가 발생했습니다.')

      const record: AssessmentRecord = {
        id: json.id ?? crypto.randomUUID(),
        category,
        location: location.trim() || null,
        notes: notes.trim() || null,
        overall_level: json.overall_level,
        result: json.result,
        image_thumb_b64: imagePreview,
        created_at: json.created_at,
      }
      setLatestResult(record)
      setActiveTab('form')
      void loadHistory()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }, [imagePreview, category, location, notes, loadHistory])

  // ── Reset ──

  const resetForm = useCallback(() => {
    setImageFile(null)
    setImagePreview(null)
    setLocation('')
    setNotes('')
    setErrorMsg(null)
    setLatestResult(null)
  }, [])

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className={`${adminPageRootWide} space-y-6`}>
      <AdminPageHeader
        title="현장 AI 평가"
        description="현장 사진을 업로드하면 안전보건·품질관리 항목을 AI가 자동 분석합니다"
      />

      {/* 탭 */}
      <div className="flex gap-1 rounded-lg border border-border bg-bg p-1 w-fit">
        {([['form', '평가 입력'], ['history', '평가 이력']] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); setSelectedRecord(null) }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 평가 입력 탭 ── */}
      {activeTab === 'form' && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* 좌: 입력 */}
          <div className="space-y-4 lg:col-span-2">
            {/* 카테고리 선택 */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                평가 유형
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['safety', '🦺', '안전보건', '위험 요소 · 법규 준수 평가'],
                  ['quality', '🏗', '품질관리', '결함 · 시공 품질 평가'],
                ] as const).map(([cat, emoji, label, desc]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      category === cat
                        ? 'border-indigo-400 bg-accent-soft'
                        : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span className="mt-1 font-semibold text-fg">{label}</span>
                    <span className="mt-0.5 text-xs text-fg-subtle">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 이미지 업로드 */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                현장 사진
              </p>
              {imagePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  <img src={imagePreview} alt="미리보기" className="max-h-64 w-full object-contain bg-bg" />
                  <button
                    type="button"
                    onClick={resetForm}
                    className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-black/80"
                  >
                    삭제
                  </button>
                  <p className="px-3 py-1.5 text-xs text-fg-subtle">{imageFile?.name}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition ${
                    dragging
                      ? 'border-indigo-400 bg-accent-soft'
                      : 'border-border-strong bg-bg hover:border-border-strong'
                  }`}
                >
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-medium text-fg-muted">
                    클릭 또는 사진을 드래그해서 업로드
                  </span>
                  <span className="text-xs text-fg-subtle">JPG, PNG, WEBP · 최대 4MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await handleImageFile(file)
                }}
              />
            </div>

            {/* 장소 */}
            <label className="block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              촬영 장소 (선택)
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 3층 외벽, B동 계단실"
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            {/* 추가 맥락 */}
            <label className="block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              추가 맥락 (선택)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="예: 신축 공사 중, 준공 6년차 건물, 옥상 방수 공사 후"
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            {errorMsg && (
              <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              disabled={busy || !imagePreview}
              onClick={() => void handleSubmit()}
              className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent disabled:opacity-50"
            >
              {busy ? 'AI 분석 중…' : 'AI 평가 시작'}
            </button>
          </div>

          {/* 우: 결과 */}
          <div className="lg:col-span-3">
            {latestResult ? (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                {/* 결과 헤더 */}
                <div className="mb-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-fg-subtle">
                      {latestResult.category === 'safety' ? '안전보건 평가' : '품질관리 평가'}
                      {latestResult.location && ` · ${latestResult.location}`}
                    </p>
                    <p className="mt-0.5 text-sm text-fg-muted leading-relaxed">
                      {latestResult.category === 'safety'
                        ? (latestResult.result as SafetyResult).summary
                        : (latestResult.result as QualityResult).summary}
                    </p>
                  </div>
                  {latestResult.category === 'safety' ? (
                    <div className="text-right">
                      <p className="text-xs text-fg-subtle">위험도</p>
                      <RiskBadge level={latestResult.overall_level} />
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-xs text-fg-subtle">종합 등급</p>
                      <span className={`text-3xl font-bold ${GRADE_CLASS[latestResult.overall_level?.toUpperCase()] ?? 'text-fg-muted'}`}>
                        {latestResult.overall_level}
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  {latestResult.category === 'safety' ? (
                    <SafetyResultView result={latestResult.result as SafetyResult} />
                  ) : (
                    <QualityResultView result={latestResult.result as QualityResult} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-bg/50">
                <span className="text-4xl">🔍</span>
                <p className="text-sm text-fg-subtle">
                  사진을 업로드하고 평가를 시작하면 결과가 여기에 표시됩니다.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 이력 탭 ── */}
      {activeTab === 'history' && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* 좌: 목록 */}
          <div className="space-y-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                최근 평가 이력
              </p>
              <button
                type="button"
                onClick={() => void loadHistory()}
                className="text-xs text-accent hover:underline"
              >
                새로고침
              </button>
            </div>
            {historyLoading ? (
              <p className="py-8 text-center text-sm text-fg-subtle">불러오는 중…</p>
            ) : history.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-subtle">평가 기록이 없습니다.</p>
            ) : (
              history.map((record) => (
                <HistoryItem
                  key={record.id}
                  record={record}
                  onClick={() => setSelectedRecord(record)}
                />
              ))
            )}
          </div>

          {/* 우: 선택된 기록 상세 */}
          <div className="lg:col-span-3">
            {selectedRecord ? (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start gap-3">
                  {selectedRecord.image_thumb_b64 && (
                    <img
                      src={selectedRecord.image_thumb_b64}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-fg-subtle">{formatDateTime(selectedRecord.created_at)}</p>
                    <p className="mt-0.5 font-semibold text-fg">
                      {selectedRecord.category === 'safety' ? '안전보건 평가' : '품질관리 평가'}
                    </p>
                    {selectedRecord.location && (
                      <p className="text-sm text-fg-muted">{selectedRecord.location}</p>
                    )}
                    <div className="mt-1">
                      {selectedRecord.category === 'safety' ? (
                        <RiskBadge level={selectedRecord.overall_level} />
                      ) : (
                        <span className={`text-2xl font-bold ${GRADE_CLASS[selectedRecord.overall_level?.toUpperCase()] ?? 'text-fg-muted'}`}>
                          {selectedRecord.overall_level}등급
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="mb-3 text-sm text-fg-muted">
                  {selectedRecord.category === 'safety'
                    ? (selectedRecord.result as SafetyResult).summary
                    : (selectedRecord.result as QualityResult).summary}
                </p>

                <div className="border-t border-border pt-4">
                  {selectedRecord.category === 'safety' ? (
                    <SafetyResultView result={selectedRecord.result as SafetyResult} />
                  ) : (
                    <QualityResultView result={selectedRecord.result as QualityResult} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center rounded-2xl border-2 border-dashed border-border">
                <p className="text-sm text-fg-subtle">좌측 목록에서 항목을 선택하세요.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
