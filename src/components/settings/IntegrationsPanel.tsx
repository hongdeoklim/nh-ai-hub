import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  disconnectGoogleIntegration,
  fetchGoogleIntegrationStatus,
  startGoogleIntegrationOAuth,
} from '../../services/integrations/google-integration'
import {
  disconnectMicrosoftIntegration,
  fetchMicrosoftIntegrationStatus,
  startMicrosoftIntegrationOAuth,
} from '../../services/integrations/microsoft-integration'

export function IntegrationsPanel() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [msConnected, setMsConnected] = useState(false)
  const [msEmail, setMsEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const redirectHint =
    import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth/google-integration`

  const msRedirectHint =
    import.meta.env.VITE_MICROSOFT_OAUTH_REDIRECT_URI?.trim() ||
    `${typeof window !== 'undefined' ? window.location.origin : ''}/oauth/microsoft-integration`

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [g, m] = await Promise.all([
        fetchGoogleIntegrationStatus(),
        fetchMicrosoftIntegrationStatus().catch(() => ({
          connected: false as const,
          email: null as string | null,
        })),
      ])
      setGoogleConnected(g.connected)
      setGoogleEmail(g.email)
      setMsConnected(m.connected)
      setMsEmail(m.email)
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  return (
    <section className="space-y-4">
      <p className="text-[20px] leading-relaxed text-stone-600 dark:text-stone-400">
        각 서비스는 <strong className="text-stone-900 dark:text-stone-100">본인 계정</strong>
        으로 로그인해 연동합니다. 리프레시 토큰은 서버에서 암호화해 저장하며, 채팅 이미지는 연동된 Google
        계정 Drive 우선으로 저장됩니다. (미연동 시 관리자 공용 Drive 설정이 있으면 그쪽을 사용합니다.)
      </p>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[18px] text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {error}{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void load()}
          >
            다시 시도
          </button>
        </p>
      ) : null}

      <div className="rounded-xl border border-sky-300/60 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/25">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
          워크스페이스 도구
        </p>
        <p className="mt-1 text-[17px] leading-snug text-stone-600 dark:text-stone-400">
          Gmail·Calendar·Drive·Sheets·Outlook·OneDrive 호출 및 HWPX 업로드는{' '}
          <Link
            to="/workspace-tools"
            className="font-semibold text-orange-900 underline underline-offset-2 dark:text-orange-300"
          >
            워크스페이스 연동
          </Link>{' '}
          페이지에서 테스트할 수 있습니다.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white/80 p-3 dark:border-stone-700 dark:bg-stone-950/50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
              Google Workspace (Drive · Gmail · Calendar · Sheets · Slides · Docs)
            </p>
            <p className="mt-1 text-[18px] text-stone-600 dark:text-stone-400">
              {loading
                ? '불러오는 중…'
                : googleConnected
                  ? `연결됨${googleEmail ? ` · ${googleEmail}` : ''}`
                  : '미연결'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {googleConnected ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void (async () => {
                    try {
                      await disconnectGoogleIntegration()
                      await load()
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? e.message : '연결 해제에 실패했습니다.',
                      )
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
                className="rounded-full border border-stone-400 px-3 py-1.5 text-[18px] font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                연결 해제
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => {
                  setBusy(true)
                  void (async () => {
                    try {
                      await startGoogleIntegrationOAuth()
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? e.message : '연동을 시작할 수 없습니다.',
                      )
                      setBusy(false)
                    }
                  })()
                }}
                className="rounded-full bg-orange-800 px-3 py-1.5 text-[18px] font-semibold text-white hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
              >
                Google 연결
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 border-t border-stone-200 pt-2 text-[17px] leading-snug text-stone-500 dark:border-stone-700 dark:text-stone-500">
          GCP OAuth 클라이언트에 승인된 리다이렉트 URI 예:{' '}
          <code className="break-all rounded bg-stone-100 px-1 dark:bg-stone-800">
            {redirectHint}
          </code>
          <span className="mt-1 block text-[15px]">
            스코프 확장 후에는 반드시 &quot;연결 해제&quot; 후 다시 연결해 동의를 갱신하세요.
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white/80 p-3 dark:border-stone-700 dark:bg-stone-950/50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
              Microsoft 365 (Outlook · Calendar · OneDrive)
            </p>
            <p className="mt-1 text-[18px] text-stone-600 dark:text-stone-400">
              {loading
                ? '불러오는 중…'
                : msConnected
                  ? `연결됨${msEmail ? ` · ${msEmail}` : ''}`
                  : '미연결'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {msConnected ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void (async () => {
                    try {
                      await disconnectMicrosoftIntegration()
                      await load()
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? e.message : '연결 해제에 실패했습니다.',
                      )
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
                className="rounded-full border border-stone-400 px-3 py-1.5 text-[18px] font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                연결 해제
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => {
                  setBusy(true)
                  void (async () => {
                    try {
                      await startMicrosoftIntegrationOAuth()
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? e.message : '연동을 시작할 수 없습니다.',
                      )
                      setBusy(false)
                    }
                  })()
                }}
                className="rounded-full bg-sky-800 px-3 py-1.5 text-[18px] font-semibold text-white hover:bg-sky-900 disabled:opacity-50 dark:bg-sky-900"
              >
                Microsoft 연결
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 border-t border-stone-200 pt-2 text-[17px] leading-snug text-stone-500 dark:border-stone-700 dark:text-stone-500">
          Azure 앱 등록 리다이렉트 URI 예:{' '}
          <code className="break-all rounded bg-stone-100 px-1 dark:bg-stone-800">
            {msRedirectHint}
          </code>
          <span className="mt-1 block text-[15px]">
            Edge 시크릿:{' '}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
              MICROSOFT_OAUTH_CLIENT_ID
            </code>
            ,{' '}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
              MICROSOFT_OAUTH_CLIENT_SECRET
            </code>
            ,{' '}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
              MICROSOFT_OAUTH_REDIRECT_URI
            </code>{' '}
            (선택:{' '}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
              MICROSOFT_OAUTH_TENANT
            </code>{' '}
            기본 common)
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-stone-300 bg-white/50 p-3 dark:border-stone-600 dark:bg-stone-950/30">
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
          노션 · 기타
        </p>
        <p className="mt-1 text-[18px] text-stone-600 dark:text-stone-400">
          노션 등 추가 공급자는 단계적으로 붙입니다. HWPX·오피스 파일 업로드 메타는 마이그레이션{' '}
          <code className="rounded bg-stone-100 px-1 text-[15px] dark:bg-stone-800">
            user_uploaded_documents
          </code>{' '}
          + Edge{' '}
          <code className="rounded bg-stone-100 px-1 text-[15px] dark:bg-stone-800">
            user-document-upload
          </code>
          로 처리합니다.
        </p>
      </div>
    </section>
  )
}
