import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { supabase } from '../lib/supabase'

export function MicrosoftIntegrationCallback() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Microsoft 계정 연동 처리 중…')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const oauthErr = params.get('error')

    if (oauthErr) {
      queueMicrotask(() =>
        setMessage('연동이 취소되었거나 거부되었습니다.'),
      )
      const t = window.setTimeout(() => navigate('/workspace-tools', { replace: true }), 1600)
      return () => window.clearTimeout(t)
    }

    if (!code || !state) {
      navigate('/workspace-tools', { replace: true })
      return
    }

    let cancelled = false

    void (async () => {
      const { error } = await supabase.functions.invoke(
        'integration-microsoft-exchange',
        { body: { code, state } },
      )
      if (cancelled) return
      if (error) {
        setMessage(error.message ?? '연동에 실패했습니다.')
        window.setTimeout(() => navigate('/workspace-tools', { replace: true }), 2800)
        return
      }
      navigate('/workspace-tools', { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6">
      <p className="text-center text-sm font-medium text-stone-700 dark:text-stone-300">
        {message}
      </p>
    </div>
  )
}
