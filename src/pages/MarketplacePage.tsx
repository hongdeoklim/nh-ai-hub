import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  fetchMarketplaceExtensions,
  installExtension,
  setExtensionEnabled,
  uninstallExtension,
  updateInstallationConfig,
  type ExtensionType,
  type MarketplaceExtension,
} from '../services/marketplace'

// ── Type metadata ────────────────────────────────────────────────────────────

const TYPE_META: Record<ExtensionType, { label: string; icon: string; color: string; desc: string; badge: string }> = {
  plugin: {
    label: 'Plugin',
    icon: '🔌',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    desc: 'AI 채팅에서 외부 서비스를 직접 호출합니다.',
    badge: 'API 키 또는 계정 연결 필요',
  },
  mcp: {
    label: 'MCP',
    icon: '🔗',
    color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
    desc: '로컬 프로그램(AutoCAD, 한글 등)을 AI와 연결합니다.',
    badge: '로컬 브릿지 서버 설치 필요',
  },
  skill: {
    label: 'Skill',
    icon: '⚡',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    desc: '설치 즉시 사용 — AI가 특정 업무 형식으로 답변합니다.',
    badge: '설치 후 바로 사용 가능',
  },
  public_data: {
    label: 'Public Data',
    icon: '📡',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    desc: '공공기관 API 데이터를 AI 채팅에서 조회합니다.',
    badge: '공공데이터포털 API 키 필요',
  },
}

const FILTERS: Array<{ id: 'all' | ExtensionType; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'plugin', label: '🔌 Plugin' },
  { id: 'mcp', label: '🔗 MCP' },
  { id: 'skill', label: '⚡ Skill' },
  { id: 'public_data', label: '📡 Public Data' },
]

// ── Config schema helpers ────────────────────────────────────────────────────

interface JsonSchemaProperty {
  type: string
  description?: string
}

function getConfigFields(schema: Record<string, unknown>): Array<{ key: string; label: string; type: string; required: boolean }> {
  const props = (schema as { properties?: Record<string, JsonSchemaProperty> }).properties ?? {}
  const required: string[] = (schema as { required?: string[] }).required ?? []
  return Object.entries(props).map(([key, val]) => ({
    key,
    label: val.description ?? key,
    type: val.type ?? 'string',
    required: required.includes(key),
  }))
}

// ── Scope → 사람이 읽기 쉬운 한국어 ──────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  'weather.read': '날씨 정보 조회',
  'exchange.read': '환율 정보 조회',
  'web.search': '웹 검색',
  'news.read': '뉴스 기사 읽기',
  'calendar.read': '캘린더 일정 읽기',
  'calendar.write': '캘린더 일정 추가·수정',
  'gmail.read': '이메일 읽기',
  'gmail.send': '이메일 발송',
  'gmail.compose': '이메일 작성',
  'drive.read': '파일 읽기',
  'drive.write': '파일 저장·업로드',
  'sheets.read': '스프레드시트 읽기',
  'sheets.write': '스프레드시트 편집',
  'docs.read': '문서 읽기',
  'docs.write': '문서 편집',
  'slides.read': '프레젠테이션 읽기',
  'slides.write': '프레젠테이션 편집',
  'teams.read': 'Teams 메시지 읽기',
  'teams.send': 'Teams 메시지 전송',
  'slack.send': 'Slack 메시지 전송',
  'slack.read': 'Slack 채널 읽기',
  'notion.read': 'Notion 페이지 읽기',
  'notion.write': 'Notion 페이지 편집',
  'jira.read': 'Jira 이슈 조회',
  'jira.write': 'Jira 이슈 생성·수정',
  'real_estate.read': '부동산 실거래가 조회',
  'architecture.read': '건축인허가 정보 조회',
  'energy.read': '에너지 통계 조회',
  'solar.predict': '태양광 발전량 예측',
  'media.search': '미디어·뉴스 검색',
  'youtube.read': 'YouTube 동영상 정보 조회',
  'tourism.read': '관광 정보 조회',
  'flight.read': '항공편 정보 조회',
  'rental.read': '렌탈 정보 조회',
  'rental.write': '렌탈 계약 처리',
  'erp.read': 'ERP 데이터 조회',
  'erp.write': 'ERP 데이터 수정',
  'crm.read': 'CRM 고객 데이터 조회',
  'procurement.read': '나라장터 조달 정보 조회',
  'land.read': '토지이음 토지 정보 조회',
  'autocad.read': 'AutoCAD 도면 읽기',
  'sketchup.read': 'SketchUp 모델 읽기',
  'figma.read': 'Figma 디자인 읽기',
  'figma.write': 'Figma 디자인 편집',
  'adobe.firefly': 'Adobe AI 이미지 생성',
  'adobe.pdf': 'Adobe PDF 변환·추출',
  'zoom.meeting': 'Zoom 회의 생성·관리',
  'kakaotalk.send': '카카오 알림 발송',
  'hancom.read': '한글 문서 읽기',
  'hancom.write': '한글 문서 편집',
}

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

// ── 타입별 "시작하는 방법" 안내 ──────────────────────────────────────────────

interface HowToStartProps {
  type: ExtensionType
  onGoConfig?: () => void
}

function HowToStart({ type, onGoConfig }: HowToStartProps) {
  if (type === 'skill') {
    return (
      <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">⚡ 설치만 하면 바로 사용 가능합니다</p>
        <p className="mt-1.5 text-sm leading-6 text-amber-700 dark:text-amber-400">
          별도 계정이나 API 키 없이 설치 즉시 AI 채팅에서 사용할 수 있습니다. 설치 후 채팅창에 원하는 내용을 입력해 보세요.
        </p>
      </div>
    )
  }
  if (type === 'plugin') {
    return (
      <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">🔌 플러그인 연결 3단계</p>
        <ol className="mt-2 space-y-1.5 text-sm leading-6 text-blue-700 dark:text-blue-400">
          <li><span className="mr-2 font-bold">1.</span>아래 <strong>설치</strong> 버튼을 누릅니다.</li>
          <li><span className="mr-2 font-bold">2.</span>
            <button onClick={onGoConfig} className="underline font-semibold">설정 탭</button>
            으로 이동해 API 키 또는 계정 정보를 입력합니다.
          </li>
          <li><span className="mr-2 font-bold">3.</span>AI 채팅에서 서비스를 바로 호출할 수 있습니다.</li>
        </ol>
      </div>
    )
  }
  if (type === 'mcp') {
    return (
      <div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-950/30">
        <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">🔗 MCP 연결 4단계</p>
        <ol className="mt-2 space-y-1.5 text-sm leading-6 text-violet-700 dark:text-violet-400">
          <li><span className="mr-2 font-bold">1.</span>해당 프로그램(예: AutoCAD, 한글 등)이 PC에 설치되어 있어야 합니다.</li>
          <li><span className="mr-2 font-bold">2.</span>MCP 브릿지 서버를 설치하고 실행합니다. <span className="text-xs opacity-75">(IT팀 또는 문서 참고)</span></li>
          <li><span className="mr-2 font-bold">3.</span>설치 후 <button onClick={onGoConfig} className="underline font-semibold">설정 탭</button>에서 서버 URL을 입력합니다.</li>
          <li><span className="mr-2 font-bold">4.</span>AI 채팅에서 해당 프로그램의 기능을 명령어로 호출할 수 있습니다.</li>
        </ol>
      </div>
    )
  }
  if (type === 'public_data') {
    return (
      <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">📡 공공데이터 연결 3단계</p>
        <ol className="mt-2 space-y-1.5 text-sm leading-6 text-emerald-700 dark:text-emerald-400">
          <li><span className="mr-2 font-bold">1.</span><strong>공공데이터포털 (data.go.kr)</strong>에 회원가입 후 해당 API를 신청합니다.</li>
          <li><span className="mr-2 font-bold">2.</span>승인된 API 키를 복사합니다. <span className="text-xs opacity-75">(보통 1~2일 소요)</span></li>
          <li><span className="mr-2 font-bold">3.</span>설치 후 <button onClick={onGoConfig} className="underline font-semibold">설정 탭</button>에 API 키를 붙여넣습니다.</li>
        </ol>
      </div>
    )
  }
  return null
}

// ── 정보 탭 ──────────────────────────────────────────────────────────────────

interface InfoTabProps {
  ext: MarketplaceExtension
  manifest: Record<string, unknown>
  portalUrl: string | null
  docsUrl: string | null
  onGoConfig: () => void
}

function InfoTab({ ext, manifest, portalUrl, docsUrl, onGoConfig }: InfoTabProps) {
  const tools = Array.isArray(manifest.tools) ? (manifest.tools as Array<{ name: string; description: string }>) : []

  return (
    <div className="space-y-5">
      {/* 한 줄 설명 */}
      <p className="text-sm leading-7 text-stone-700 dark:text-stone-300">{ext.description}</p>

      {/* 시작하는 방법 */}
      <HowToStart type={ext.extension_type} onGoConfig={onGoConfig} />

      {/* 이 확장이 할 수 있는 것 */}
      {tools.length > 0 && (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-stone-400">이 확장으로 할 수 있는 것</p>
          <ul className="space-y-2">
            {tools.map((t) => (
              <li key={t.name} className="flex items-start gap-3 rounded-xl bg-stone-50 px-4 py-3 dark:bg-stone-800">
                <span className="mt-0.5 text-base">✅</span>
                <span className="text-sm leading-6 text-stone-700 dark:text-stone-300">{t.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 필요 권한 */}
      {ext.required_scopes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">이 확장이 요청하는 권한</p>
          <div className="flex flex-wrap gap-1.5">
            {ext.required_scopes.map((s) => (
              <span key={s} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {scopeLabel(s)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 링크 */}
      {(portalUrl || docsUrl) && (
        <div className="flex gap-4 text-sm">
          {portalUrl && (
            <a href={portalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
              🌐 서비스 홈페이지
            </a>
          )}
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
              📄 사용 설명서
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail / Config Modal ────────────────────────────────────────────────────

interface DetailModalProps {
  ext: MarketplaceExtension
  onClose: () => void
  onInstall: (config: Record<string, unknown>) => Promise<void>
  onUpdateConfig: (config: Record<string, unknown>) => Promise<void>
  busy: boolean
}

function DetailModal({ ext, onClose, onInstall, onUpdateConfig, busy }: DetailModalProps) {
  const meta = TYPE_META[ext.extension_type]
  const fields = getConfigFields(ext.config_schema)
  const hasConfig = fields.length > 0
  const manifest = ext.manifest as Record<string, unknown>
  const prompt = typeof manifest.prompt === 'string' ? manifest.prompt : null
  const portalUrl = typeof manifest.portal_url === 'string' ? manifest.portal_url : null
  const docsUrl = typeof manifest.docs_url === 'string' ? manifest.docs_url : null

  const [form, setForm] = useState<Record<string, string>>(() => {
    if (!ext.installation?.config) return {}
    const existing = ext.installation.config as Record<string, string>
    return Object.fromEntries(fields.map((f) => [f.key, String(existing[f.key] ?? '')]))
  })
  const [tab, setTab] = useState<'info' | 'config' | 'preview'>('info')

  const overlayRef = useRef<HTMLDivElement>(null)

  const handleSubmit = async () => {
    const config: Record<string, unknown> = {}
    for (const f of fields) config[f.key] = form[f.key] ?? ''
    if (ext.installation) {
      await onUpdateConfig(config)
    } else {
      await onInstall(config)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl dark:bg-stone-900 sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-6 py-5 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{typeof manifest.icon === 'string' ? manifest.icon : meta.icon}</span>
            <div>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px]! font-bold uppercase ${meta.color}`}>{meta.label}</span>
              <h2 className="mt-1 text-lg font-bold text-stone-950 dark:text-white">{ext.name}</h2>
              <p className="text-xs text-stone-500">v{ext.version} · {ext.provider}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="mt-1 rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-stone-100 dark:border-stone-800">
          {(['info', ...(hasConfig ? ['config'] : []), ...(prompt ? ['preview'] : [])] as Array<'info' | 'config' | 'preview'>).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold transition-colors ${tab === t ? 'border-b-2 border-orange-700 text-orange-800 dark:border-orange-400 dark:text-orange-300' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
            >
              {t === 'info' ? '정보' : t === 'config' ? '설정' : '미리보기'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {tab === 'info' && <InfoTab ext={ext} manifest={manifest} portalUrl={portalUrl} docsUrl={docsUrl} onGoConfig={() => setTab('config')} />}

          {tab === 'config' && (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-stone-600 dark:text-stone-400">
                아래 항목을 입력한 뒤 <strong>저장</strong> 버튼을 누르면 설정이 완료됩니다.
              </p>
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1.5 block text-sm font-semibold text-stone-700 dark:text-stone-300">
                    {f.label}
                    {f.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <input
                    type={f.key.toLowerCase().includes('token') || f.key.toLowerCase().includes('key') || f.key.toLowerCase().includes('secret') || f.key.toLowerCase().includes('password') ? 'password' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.label}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-600 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                  />
                </div>
              ))}
            </div>
          )}

          {tab === 'preview' && prompt && (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">💡 이렇게 사용하세요</p>
                <p className="mt-1 text-sm leading-6 text-amber-700 dark:text-amber-400">
                  AI 채팅창에 원하는 내용을 입력하면 아래 형식에 맞게 자동으로 답변합니다.
                  <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs dark:bg-amber-900">{'{{중괄호}}'}</code>
                  부분을 실제 내용으로 채워서 요청하세요.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">AI가 사용하는 프롬프트 형식</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-xs leading-6 text-stone-800 dark:bg-stone-800 dark:text-stone-200">{prompt}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-stone-100 px-6 py-4 dark:border-stone-800">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800">닫기</button>
          {tab === 'config' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-orange-800 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-orange-700"
            >
              {busy ? '저장 중…' : ext.installation ? '설정 저장' : '설치 및 저장'}
            </button>
          ) : !ext.installation ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void (hasConfig ? setTab('config') : handleSubmit())}
              className="rounded-lg bg-orange-800 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-orange-700"
            >
              {hasConfig ? '설치 설정하기' : busy ? '설치 중…' : '설치'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Extension Card ───────────────────────────────────────────────────────────

interface CardProps {
  ext: MarketplaceExtension
  busy: boolean
  onInstall: () => void
  onToggle: () => void
  onUninstall: () => void
  onDetail: () => void
}

function ExtensionCard({ ext, busy, onInstall, onToggle, onUninstall, onDetail }: CardProps) {
  const meta = TYPE_META[ext.extension_type]
  const installed = ext.installation
  const manifest = ext.manifest as Record<string, unknown>
  const icon = typeof manifest.icon === 'string' ? manifest.icon : meta.icon
  const hasConfig = getConfigFields(ext.config_schema).length > 0

  return (
    <article className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{icon}</span>
          <div>
            <span className={`rounded-full px-2 py-0.5 text-[10px]! font-bold uppercase ${meta.color}`}>{meta.label}</span>
            <h2 className="mt-1 text-base font-bold text-stone-950 dark:text-white">{ext.name}</h2>
          </div>
        </div>
        <span className="shrink-0 text-xs text-stone-400">v{ext.version}</span>
      </div>

      <p className="mt-3 grow text-sm leading-6 text-stone-600 dark:text-stone-400 line-clamp-2">{ext.description}</p>
      <p className="mt-2 text-xs text-stone-400">{ext.provider}</p>

      {installed && (
        <div className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${installed.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-stone-100 text-stone-500 dark:bg-stone-800'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${installed.enabled ? 'bg-emerald-500' : 'bg-stone-400'}`} />
          {installed.enabled ? '활성' : '비활성'}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDetail}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          자세히
        </button>
        {!installed ? (
          <button
            type="button"
            disabled={busy}
            onClick={hasConfig ? onDetail : onInstall}
            className="rounded-lg bg-orange-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-orange-700"
          >
            {busy ? '설치 중…' : '설치'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onToggle}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {busy ? '…' : installed.enabled ? '비활성화' : '활성화'}
            </button>
            {hasConfig && (
              <button
                type="button"
                onClick={onDetail}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                설정
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onUninstall}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              제거
            </button>
          </>
        )}
      </div>
    </article>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function MarketplacePage() {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailExt, setDetailExt] = useState<MarketplaceExtension | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setExtensions(await fetchMarketplaceExtensions())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Marketplace를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const visible = useMemo(() => {
    let list = filter === 'all' ? extensions : extensions.filter((x) => x.extension_type === filter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((x) => x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q) || x.provider.toLowerCase().includes(q))
    return list
  }, [extensions, filter, search])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: extensions.length }
    for (const x of extensions) map[x.extension_type] = (map[x.extension_type] ?? 0) + 1
    return map
  }, [extensions])

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    try {
      await action()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '작업에 실패했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  const handleInstall = (ext: MarketplaceExtension, config: Record<string, unknown> = {}) =>
    run(ext.id, () => installExtension(ext.id, config))

  const handleUpdateConfig = (ext: MarketplaceExtension, config: Record<string, unknown>) =>
    run(ext.id, async () => {
      if (ext.installation) {
        await updateInstallationConfig(ext.installation.id, config)
      } else {
        await installExtension(ext.id, config)
      }
    })

  const handleToggle = (ext: MarketplaceExtension) =>
    run(ext.id, () => setExtensionEnabled(ext.installation!.id, !ext.installation!.enabled))

  const handleUninstall = (ext: MarketplaceExtension) => {
    if (!window.confirm(`"${ext.name}"을(를) 제거하시겠습니까?`)) return Promise.resolve()
    return run(ext.id, () => uninstallExtension(ext.installation!.id))
  }

  const installedCount = extensions.filter((x) => x.installation?.enabled).length

  // Sync detailExt after reload so modal reflects latest state
  useEffect(() => {
    if (!detailExt) return
    const fresh = extensions.find((x) => x.id === detailExt.id)
    if (fresh) setDetailExt(fresh)
  }, [extensions]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-full overflow-y-auto bg-[#FAF9F6] px-4 py-8 dark:bg-stone-950 md:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <p className="text-sm font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-300">NH Extension Hub</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-stone-950 dark:text-white">Marketplace</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Plugin, MCP, Skill, Public Data 확장을 설치하고 AI 채팅에서 바로 사용하세요.</p>
          </div>
          {installedCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              {installedCount}개 활성 중
            </span>
          )}
        </div>

        {/* Type summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['plugin', 'mcp', 'skill', 'public_data'] as ExtensionType[]).map((t) => {
            const meta = TYPE_META[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`rounded-xl border p-3 text-left transition-all ${filter === t ? 'border-orange-700 bg-orange-50 dark:bg-orange-950/30' : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900'}`}
              >
                <span className="text-xl">{meta.icon}</span>
                <p className="mt-1 text-sm font-bold text-stone-900 dark:text-white">{meta.label}</p>
                <p className="text-xs text-stone-500">{counts[t] ?? 0}개</p>
              </button>
            )
          })}
        </div>

        {/* Search + filters */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="확장 검색…"
            className="min-w-48 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-600 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Marketplace 필터">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${filter === item.id ? 'border-orange-700 bg-orange-700 text-white' : 'border-stone-300 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'}`}
              >
                {item.label}
                {counts[item.id] !== undefined && (
                  <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]!">{counts[item.id]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Error / loading */}
        {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        {loading && (
          <div className="mt-10 flex items-center justify-center gap-2 text-stone-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-orange-700" />
            불러오는 중…
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div className="mt-10 text-center">
            <p className="text-2xl">🔍</p>
            <p className="mt-2 text-stone-500">{search ? `"${search}"에 해당하는 확장이 없습니다.` : '표시할 확장이 없습니다.'}</p>
          </div>
        )}

        {/* Grid */}
        {!loading && visible.length > 0 && (
          <>
            {/* Group by type when showing all */}
            {filter === 'all' ? (
              (['plugin', 'mcp', 'skill', 'public_data'] as ExtensionType[]).map((t) => {
                const group = visible.filter((x) => x.extension_type === t)
                if (group.length === 0) return null
                const meta = TYPE_META[t]
                return (
                  <section key={t} className="mt-8">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-stone-500">
                      <span>{meta.icon}</span> {meta.label}
                      <span className="ml-1 text-xs font-normal normal-case">{meta.desc}</span>
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.map((ext) => (
                        <ExtensionCard
                          key={ext.id}
                          ext={ext}
                          busy={busyId === ext.id}
                          onInstall={() => void handleInstall(ext)}
                          onToggle={() => void handleToggle(ext)}
                          onUninstall={() => void handleUninstall(ext)}
                          onDetail={() => setDetailExt(ext)}
                        />
                      ))}
                    </div>
                  </section>
                )
              })
            ) : (
              <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((ext) => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    busy={busyId === ext.id}
                    onInstall={() => void handleInstall(ext)}
                    onToggle={() => void handleToggle(ext)}
                    onUninstall={() => void handleUninstall(ext)}
                    onDetail={() => setDetailExt(ext)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailExt && (
        <DetailModal
          ext={detailExt}
          busy={busyId === detailExt.id}
          onClose={() => setDetailExt(null)}
          onInstall={(config) => handleInstall(detailExt, config).then(() => setDetailExt(null))}
          onUpdateConfig={(config) => handleUpdateConfig(detailExt, config)}
        />
      )}
    </main>
  )
}
