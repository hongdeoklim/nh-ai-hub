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
        className="max-h-[min(88dvh,32rem)] w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-[#FAF9F6] shadow-2xl dark:border-stone-700 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <h2
            id="token-req-title"
            className="text-base font-semibold text-stone-900 dark:text-stone-50"
          >
            토큰 추가 요청
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            토큰이 부족할 때 관리자에게 추가 한도를 요청합니다. 승인되면 알림 없이 한도에
            반영됩니다.
          </p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            요청 사유
          </label>
          <textarea
            value={text}
            disabled={sending}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-orange-700/25 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-700">
          <button
            type="button"
            disabled={sending}
            onClick={() => onClose()}
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            취소
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void submit()}
            className="rounded-lg bg-orange-800 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
          >
            {sending ? '전송 중…' : '요청하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
