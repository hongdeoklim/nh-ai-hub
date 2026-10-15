import { useEffect, useState } from 'react'

import type { SupabaseClient } from '@supabase/supabase-js'

import { submitTokenAllocationRequest } from '../../services/token-allocation-requests'

type TokenRequestModalProps = {
 open: boolean
 onClose: () => void
 supabase: SupabaseClient
 userId: string | undefined
  /** 초기 메시지(토큰 부족 안내 등) */
 presetSummary?: string
}

export function TokenRequestModal({
 open,
 onClose,
 supabase,
 userId,
 presetSummary,
}: TokenRequestModalProps) {
 const [text, setText] = useState('')
 const [sending, setSending] = useState(false)

 useEffect(() => {
 if (open) {
 queueMicrotask(() =>
 setText(
 presetSummary
            ? `${presetSummary}\n\n`
            : '월간 토큰 한도가 부족합니다. 추가 할당을 요청합니다.\n\n',
        ),
      )
    }
  }, [open, presetSummary])

 useEffect(() => {
 if (!open) return
 function onKey(event: KeyboardEvent) {
 if (event.key === 'Escape') onClose()
    }
 window.addEventListener('keydown', onKey)
 return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

 async function submit() {
 if (!userId) {
 window.alert('로그인이 필요합니다.')
 return
    }
 setSending(true)
 try {
 const result = await submitTokenAllocationRequest(supabase, {
 userId,
 message: text.trim(),
      })
 if (!result.ok) {
 window.alert(result.message)
 return
      }
 window.alert('요청이 접수되었습니다. 관리자가 순차적으로 처리합니다.')
 onClose()
    } finally {
 setSending(false)
    }
  }

 if (!open) return null

 return (
    <div
 className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
 role="presentation"
 onClick={() => onClose()}
    >
      <div
 role="dialog"
 aria-modal="true"
 aria-labelledby="token-req-title"
 className="max-h-[min(88dvh,32rem)] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
 onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h2
 id="token-req-title"
 className="text-base font-semibold text-fg"
          >
 토큰 추가 요청
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
 토큰이 부족할 때 관리자에게 추가 한도를 요청합니다. 승인되면 알림 없이 한도에
 반영됩니다.
          </p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <label className="block text-sm font-medium text-fg-muted">
 요청 사유
          </label>
          <textarea
 value={text}
 disabled={sending}
 onChange={(e) => setText(e.target.value)}
 rows={6}
 className="w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none ring-focus/40 focus:ring-2"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
 type="button"
 disabled={sending}
 onClick={() => onClose()}
 className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
          >
 취소
          </button>
          <button
 type="button"
 disabled={sending}
 onClick={() => void submit()}
 className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-strong disabled:opacity-50"
          >
            {sending ? '전송 중…' : '요청하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
