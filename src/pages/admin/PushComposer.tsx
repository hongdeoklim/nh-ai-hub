import { useState } from 'react'

import { sendPush, type PushTarget } from '../../services/push/send-push'

type TargetMode = 'all' | 'department' | 'user'

export function PushComposer() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [targetMode, setTargetMode] = useState<TargetMode>('all')
  const [targetValue, setTargetValue] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-900/30'

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      setResult({ tone: 'error', text: '제목과 내용을 입력하세요.' })
      return
    }
    if (targetMode !== 'all' && !targetValue.trim()) {
      setResult({ tone: 'error', text: targetMode === 'department' ? '부서명을 입력하세요.' : '사용자 ID를 입력하세요.' })
      return
    }
    setSending(true)
    setResult(null)
    try {
      const target: PushTarget =
        targetMode === 'all'
          ? { target_type: 'all' }
          : targetMode === 'department'
            ? { target_type: 'department', target_value: targetValue.trim() }
            : { target_type: 'user', target_value: targetValue.trim() }

      const res = await sendPush({ title: title.trim(), body: body.trim(), url: url.trim() || undefined, target })

      if (res.ok && res.configured !== false) {
        setResult({
          tone: 'ok',
          text: `발송 완료 — 대상 ${res.recipients ?? 0}대 중 ${res.success ?? 0}대 성공.`,
        })
        setTitle('')
        setBody('')
        setUrl('')
      } else if (res.configured === false) {
        setResult({
          tone: 'warn',
          text: `${res.error ?? ''} (대상 ${res.recipients ?? 0}대 집계됨)`,
        })
      } else {
        setResult({ tone: 'error', text: res.error ?? '발송에 실패했습니다.' })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">푸시 알림 보내기</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          푸시 알림을 켠 사용자에게 FCM 웹 푸시를 발송합니다. 마이페이지에서 알림을 켠 기기만 대상이 됩니다.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputCls} placeholder="예: 정기 점검 안내" />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          내용
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={300} className={inputCls} placeholder="알림 본문을 입력하세요." />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          클릭 시 이동 경로 <span className="font-normal normal-case text-slate-400">(선택, 예: /knowledge-hub)</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="/" />
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">대상</p>
          <div className="flex flex-wrap gap-2">
            {([['all', '전체'], ['department', '부서'], ['user', '특정 사용자']] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTargetMode(mode)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  targetMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {targetMode !== 'all' ? (
            <input
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className={inputCls}
              placeholder={targetMode === 'department' ? '부서명 (users.department와 일치)' : '사용자 UUID'}
            />
          ) : null}
        </div>

        {result ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              result.tone === 'ok'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : result.tone === 'warn'
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
            }`}
          >
            {result.text}
          </p>
        ) : null}

        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSend()}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? '발송 중…' : '푸시 발송'}
        </button>
      </div>
    </div>
  )
}
