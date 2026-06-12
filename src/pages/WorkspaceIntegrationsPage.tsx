import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { supabase } from '../lib/supabase'
import {
  disconnectMicrosoftIntegration,
  fetchMicrosoftIntegrationStatus,
  startMicrosoftIntegrationOAuth,
} from '../services/integrations/microsoft-integration'
import {
  fetchGoogleIntegrationStatus,
  startGoogleIntegrationOAuth,
  disconnectGoogleIntegration,
} from '../services/integrations/google-integration'
import type { UploadedDocRow } from '../services/integrations/workspace-tools'
import {
  invokeGoogleWorkspaceApi,
  invokeMicrosoftGraphApi,
  uploadUserDocument,
} from '../services/integrations/workspace-tools'

function JsonBlock({ value }: { value: unknown }) {
  const text =
    value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2)
  return (
    <pre className="max-h-60 overflow-auto rounded-xl border border-stone-200 bg-stone-950/90 p-3 text-[11px] leading-snug text-stone-100 dark:border-stone-700">
      {text || '(비어 있음)'}
    </pre>
  )
}

function localDatetimeInputToIso(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

const fieldCls =
  'mt-1 w-full rounded-lg border border-stone-300 bg-[#FAF9F6] px-2 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100'

export function WorkspaceIntegrationsPage() {
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [msConnected, setMsConnected] = useState(false)
  const [msEmail, setMsEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleOut, setGoogleOut] = useState<unknown>(null)
  const [msOut, setMsOut] = useState<unknown>(null)
  const [uploads, setUploads] = useState<UploadedDocRow[]>([])
  const [uploadNote, setUploadNote] = useState('')
  const [googleMailDraft, setGoogleMailDraft] = useState({
    to: '',
    subject: '',
    body: '',
  })
  const [googleEventDraft, setGoogleEventDraft] = useState({
    summary: '',
    start: '',
    end: '',
    description: '',
  })
  const [microsoftMailDraft, setMicrosoftMailDraft] = useState({
    to: '',
    subject: '',
    body: '',
  })
  const [microsoftEventDraft, setMicrosoftEventDraft] = useState({
    subject: '',
    start: '',
    end: '',
    body: '',
  })

  const loadStatus = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        fetchGoogleIntegrationStatus(),
        fetchMicrosoftIntegrationStatus(),
      ])
      setGoogleConnected(g.connected)
      setGoogleEmail(g.email)
      setMsConnected(m.connected)
      setMsEmail(m.email)
    } catch {
      /* 설정 탭에서 처리 */
    }
  }, [])

  const loadUploads = useCallback(async () => {
    const { data } = await supabase
      .from('user_uploaded_documents')
      .select('id, kind, original_name, storage_object_path, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    setUploads((data ?? []) as UploadedDocRow[])
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadStatus()
      void loadUploads()
    })
  }, [loadStatus, loadUploads])

  async function runGoogle(action: string, payload?: Record<string, unknown>) {
    setBusy(true)
    setGoogleOut(null)
    try {
      const res = await invokeGoogleWorkspaceApi<{ ok?: boolean; data?: unknown; error?: string }>(
        action,
        payload,
      )
      setGoogleOut(res)
      if ((res as { error?: string }).error) {
        window.alert((res as { error: string }).error)
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runMs(action: string, payload?: Record<string, unknown>) {
    setBusy(true)
    setMsOut(null)
    try {
      const res = await invokeMicrosoftGraphApi<{ ok?: boolean; data?: unknown; error?: string }>(
        action,
        payload,
      )
      setMsOut(res)
      if ((res as { error?: string }).error) {
        window.alert((res as { error: string }).error)
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#FAF9F6] dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200/90 px-4 py-4 dark:border-stone-800 md:px-8 md:py-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50 md:text-2xl">
              워크스페이스 연동 도구
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-stone-600 dark:text-stone-400">
              Google(Gmail·Calendar·Drive·Sheets·Slides·Docs) 및 Microsoft 365(Graph) API를 Edge에서
              호출합니다. HWPX·문서는 아래 업로드로 Storage에 보관합니다.
            </p>
          </div>
          <Link
            to="/"
            className="shrink-0 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
          >
            ← 대화로
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        {/* 연결 상태 */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">Google</p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              {googleConnected ? `연결됨 · ${googleEmail ?? ''}` : '미연결 — 설정 또는 여기서 연결'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!googleConnected ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void startGoogleIntegrationOAuth().catch((e) =>
                      window.alert(e instanceof Error ? e.message : String(e)),
                    )
                  }
                  className="rounded-full bg-orange-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-900 disabled:opacity-50"
                >
                  Google 연결
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      try {
                        await disconnectGoogleIntegration()
                        await loadStatus()
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : String(e))
                      }
                    })()
                  }
                  className="rounded-full border border-stone-400 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  연결 해제
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">Microsoft 365</p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              Azure 앱 등록 +{' '}
              <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
                MICROSOFT_OAUTH_*
              </code>{' '}
              환경 변수 필요
            </p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              {msConnected ? `연결됨 · ${msEmail ?? ''}` : '미연결'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!msConnected ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void startMicrosoftIntegrationOAuth().catch((e) =>
                      window.alert(e instanceof Error ? e.message : String(e)),
                    )
                  }
                  className="rounded-full bg-sky-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-900 disabled:opacity-50"
                >
                  Microsoft 연결
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      try {
                        await disconnectMicrosoftIntegration()
                        await loadStatus()
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : String(e))
                      }
                    })()
                  }
                  className="rounded-full border border-stone-400 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  연결 해제
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Google 액션 */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            Google API 빠른 실행
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !googleConnected}
              onClick={() => void runGoogle('gmail.listMessages', { maxResults: 8 })}
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              Gmail 목록
            </button>
            <button
              type="button"
              disabled={busy || !googleConnected}
              onClick={() =>
                void runGoogle('calendar.listEvents', {
                  calendarId: 'primary',
                  timeMin: new Date().toISOString(),
                })
              }
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              Calendar 오늘 이후
            </button>
            <button
              type="button"
              disabled={busy || !googleConnected}
              onClick={() =>
                void runGoogle('drive.listFiles', {
                  mimeType:
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  pageSize: 15,
                })
              }
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              Drive · PPTX
            </button>
            <button
              type="button"
              disabled={busy || !googleConnected}
              onClick={() =>
                void runGoogle('drive.listFiles', {
                  mimeType:
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  pageSize: 15,
                })
              }
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              Drive · XLSX
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <details className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/40">
              <summary className="cursor-pointer text-xs font-semibold text-stone-800 dark:text-stone-200">
                Gmail 보내기
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  받는 사람
                  <input
                    type="email"
                    autoComplete="email"
                    value={googleMailDraft.to}
                    onChange={(e) =>
                      setGoogleMailDraft((p) => ({ ...p, to: e.target.value }))
                    }
                    className={fieldCls}
                    placeholder="name@company.com"
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  제목
                  <input
                    value={googleMailDraft.subject}
                    onChange={(e) =>
                      setGoogleMailDraft((p) => ({ ...p, subject: e.target.value }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  본문
                  <textarea
                    rows={3}
                    value={googleMailDraft.body}
                    onChange={(e) =>
                      setGoogleMailDraft((p) => ({ ...p, body: e.target.value }))
                    }
                    className={`${fieldCls} resize-y`}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !googleConnected}
                  onClick={() => {
                    const to = googleMailDraft.to.trim()
                    const subject = googleMailDraft.subject.trim()
                    if (!to || !subject) {
                      window.alert('받는 사람·제목을 입력하세요.')
                      return
                    }
                    void runGoogle('gmail.send', {
                      to,
                      subject,
                      text: googleMailDraft.body,
                    })
                  }}
                  className="rounded-lg bg-orange-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-900 disabled:opacity-45"
                >
                  Gmail 전송
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/40">
              <summary className="cursor-pointer text-xs font-semibold text-stone-800 dark:text-stone-200">
                Calendar 일정 만들기 (primary)
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  제목
                  <input
                    value={googleEventDraft.summary}
                    onChange={(e) =>
                      setGoogleEventDraft((p) => ({ ...p, summary: e.target.value }))
                    }
                    className={fieldCls}
                    placeholder="회의 제목"
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  시작 (로컬)
                  <input
                    type="datetime-local"
                    value={googleEventDraft.start}
                    onChange={(e) =>
                      setGoogleEventDraft((p) => ({ ...p, start: e.target.value }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  종료 (로컬)
                  <input
                    type="datetime-local"
                    value={googleEventDraft.end}
                    onChange={(e) =>
                      setGoogleEventDraft((p) => ({ ...p, end: e.target.value }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  설명 (선택)
                  <textarea
                    rows={2}
                    value={googleEventDraft.description}
                    onChange={(e) =>
                      setGoogleEventDraft((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    className={`${fieldCls} resize-y`}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !googleConnected}
                  onClick={() => {
                    const startIso = localDatetimeInputToIso(googleEventDraft.start)
                    const endIso = localDatetimeInputToIso(googleEventDraft.end)
                    if (!startIso || !endIso) {
                      window.alert('시작·종료 시각을 모두 입력하세요.')
                      return
                    }
                    void runGoogle('calendar.createEvent', {
                      calendarId: 'primary',
                      summary: googleEventDraft.summary.trim() || '일정',
                      start: startIso,
                      end: endIso,
                      description: googleEventDraft.description.trim() || undefined,
                    })
                  }}
                  className="rounded-lg bg-orange-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-900 disabled:opacity-45"
                >
                  일정 생성
                </button>
              </div>
            </details>
          </div>

          <div className="mt-3">
            <JsonBlock value={googleOut} />
          </div>
        </section>

        {/* Microsoft */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            Microsoft Graph 빠른 실행
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !msConnected}
              onClick={() => void runMs('mail.listMessages', { top: 8 })}
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              Outlook 메일
            </button>
            <button
              type="button"
              disabled={busy || !msConnected}
              onClick={() => void runMs('calendar.listEvents', { top: 15 })}
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              일정
            </button>
            <button
              type="button"
              disabled={busy || !msConnected}
              onClick={() => void runMs('drive.listRootChildren', { top: 20 })}
              className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              OneDrive 루트
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <details className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/40">
              <summary className="cursor-pointer text-xs font-semibold text-stone-800 dark:text-stone-200">
                Outlook 메일 보내기
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  받는 사람
                  <input
                    type="email"
                    autoComplete="email"
                    value={microsoftMailDraft.to}
                    onChange={(e) =>
                      setMicrosoftMailDraft((p) => ({ ...p, to: e.target.value }))
                    }
                    className={fieldCls}
                    placeholder="name@company.com"
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  제목
                  <input
                    value={microsoftMailDraft.subject}
                    onChange={(e) =>
                      setMicrosoftMailDraft((p) => ({
                        ...p,
                        subject: e.target.value,
                      }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  본문
                  <textarea
                    rows={3}
                    value={microsoftMailDraft.body}
                    onChange={(e) =>
                      setMicrosoftMailDraft((p) => ({ ...p, body: e.target.value }))
                    }
                    className={`${fieldCls} resize-y`}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !msConnected}
                  onClick={() => {
                    const to = microsoftMailDraft.to.trim()
                    const subject = microsoftMailDraft.subject.trim()
                    if (!to || !subject) {
                      window.alert('받는 사람·제목을 입력하세요.')
                      return
                    }
                    void runMs('mail.send', {
                      to,
                      subject,
                      text: microsoftMailDraft.body,
                    })
                  }}
                  className="rounded-lg bg-sky-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-900 disabled:opacity-45"
                >
                  메일 전송
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/40">
              <summary className="cursor-pointer text-xs font-semibold text-stone-800 dark:text-stone-200">
                Outlook 일정 만들기
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  제목
                  <input
                    value={microsoftEventDraft.subject}
                    onChange={(e) =>
                      setMicrosoftEventDraft((p) => ({
                        ...p,
                        subject: e.target.value,
                      }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  시작 (로컬)
                  <input
                    type="datetime-local"
                    value={microsoftEventDraft.start}
                    onChange={(e) =>
                      setMicrosoftEventDraft((p) => ({
                        ...p,
                        start: e.target.value,
                      }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  종료 (로컬)
                  <input
                    type="datetime-local"
                    value={microsoftEventDraft.end}
                    onChange={(e) =>
                      setMicrosoftEventDraft((p) => ({ ...p, end: e.target.value }))
                    }
                    className={fieldCls}
                  />
                </label>
                <label className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                  본문 (선택)
                  <textarea
                    rows={2}
                    value={microsoftEventDraft.body}
                    onChange={(e) =>
                      setMicrosoftEventDraft((p) => ({ ...p, body: e.target.value }))
                    }
                    className={`${fieldCls} resize-y`}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !msConnected}
                  onClick={() => {
                    const startIso = localDatetimeInputToIso(microsoftEventDraft.start)
                    const endIso = localDatetimeInputToIso(microsoftEventDraft.end)
                    if (!startIso || !endIso) {
                      window.alert('시작·종료 시각을 모두 입력하세요.')
                      return
                    }
                    void runMs('calendar.createEvent', {
                      subject: microsoftEventDraft.subject.trim() || '일정',
                      start: startIso,
                      end: endIso,
                      body: microsoftEventDraft.body,
                      timeZone: 'Asia/Seoul',
                    })
                  }}
                  className="rounded-lg bg-sky-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-900 disabled:opacity-45"
                >
                  일정 생성
                </button>
              </div>
            </details>
          </div>

          <div className="mt-3">
            <JsonBlock value={msOut} />
          </div>
        </section>

        {/* 문서 업로드 */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            문서 업로드 (HWPX·Office 등)
          </p>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            서버 Storage에 저장 후 메타만 DB에 남깁니다. 본문 추출·AI 연동은 다음 단계에서 파이프라인을
            붙이면 됩니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-stone-700 dark:text-stone-300">
              파일
              <input
                type="file"
                disabled={busy}
                className="text-[13px] text-stone-800 file:mr-2 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-2 file:py-1 dark:text-stone-200 dark:file:border-stone-600 dark:file:bg-stone-900"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setBusy(true)
                  void uploadUserDocument(f, uploadNote)
                    .then(async () => {
                      await loadUploads()
                      window.alert('업로드 완료')
                      e.target.value = ''
                    })
                    .catch((err) =>
                      window.alert(err instanceof Error ? err.message : String(err)),
                    )
                    .finally(() => setBusy(false))
                }}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-stone-700 dark:text-stone-300">
              메모(선택)
              <input
                value={uploadNote}
                onChange={(e) => setUploadNote(e.target.value)}
                placeholder="예: ○○ 프로젝트 견적"
                className="rounded-lg border border-stone-300 bg-[#FAF9F6] px-2 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
            </label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 dark:border-stone-700 dark:text-stone-400">
                  <th className="py-2 pr-2 font-semibold">종류</th>
                  <th className="py-2 pr-2 font-semibold">파일명</th>
                  <th className="py-2 font-semibold">일시</th>
                </tr>
              </thead>
              <tbody>
                {uploads.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-stone-500">
                      업로드 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  uploads.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-stone-100 dark:border-stone-800"
                    >
                      <td className="py-2 pr-2 uppercase text-stone-600 dark:text-stone-400">
                        {u.kind}
                      </td>
                      <td className="py-2 pr-2 text-stone-900 dark:text-stone-100">
                        {u.original_name}
                      </td>
                      <td className="py-2 tabular-nums text-stone-500 dark:text-stone-500">
                        {new Date(u.created_at).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
