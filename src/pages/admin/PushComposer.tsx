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
    'mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-focus/40'

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
 text: `발송 완료 — 인앱 알림 ${res.inapp ?? 0}명, 푸시 ${res.recipients ?? 0}대 중 ${res.success ?? 0}대 성공.`,
        })
 setTitle('')
 setBody('')
 setUrl('')
      } else if (res.configured === false) {
 setResult({
 tone: 'warn',
 text: `인앱 알림 ${res.inapp ?? 0}명에게 발송됨. ${res.error ?? ''}`,
        })
 setTitle('')
 setBody('')
 setUrl('')
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
        <h1 className="text-2xl font-bold tracking-tight text-fg">푸시 알림 보내기</h1>
        <p className="mt-1 text-sm text-fg-subtle">
 대상 사용자 전원에게 인앱 알림(종 아이콘)을 보내고, 그중 푸시를 켠 기기에는 FCM 웹 푸시도 함께 발송합니다.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
 제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputCls} placeholder="예: 정기 점검 안내" />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
 내용
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={300} className={inputCls} placeholder="알림 본문을 입력하세요." />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">
 클릭 시 이동 경로 <span className="font-normal normal-case text-fg-subtle">(선택, 예: /knowledge-hub)</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="/" />
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">대상</p>
          <div className="flex flex-wrap gap-2">
            {([['all', '전체'], ['department', '부서'], ['user', '특정 사용자']] as const).map(([mode, label]) => (
              <button
 key={mode}
 type="button"
 onClick={() => setTargetMode(mode)}
 className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
 targetMode === mode
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-fg-muted hover:bg-surface-3'
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
                ? 'bg-success-soft text-success'
                : result.tone === 'warn'
                  ? 'bg-warning-soft text-warning'
                  : 'bg-danger-soft text-danger'
            }`}
          >
            {result.text}
          </p>
        ) : null}

        <button
 type="button"
 disabled={sending}
 onClick={() => void handleSend()}
 className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent disabled:opacity-50"
        >
          {sending ? '발송 중…' : '푸시 발송'}
        </button>
      </div>
    </div>
  )
}
