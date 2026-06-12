import type { SupabaseClient } from '@supabase/supabase-js'

import type { ChatBubble } from '../../components/chat/ChatArea'
import {
  resolveChatMessageIsoTime,
  sortChatBubblesChronologically,
} from '../../lib/chat-message-time'
import { loadPrivateChatState } from '../../lib/private-chat-storage'

const SYNC_DEBOUNCE_MS = 2_000
const MAX_MESSAGES = 300

/** 스레드별 마지막 동기화 페이로드 해시 — 불필요한 RPC 방지 */
const lastSyncSignature = new Map<string, string>()

function deriveThreadTitle(messages: ChatBubble[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = firstUser?.content?.trim() ?? ''
  const singleLine = text.split(/\r?\n/).find((l) => l.trim().length > 0)
  const head = (singleLine ?? text).trim()
  if (head.length > 0) {
    return head.length > 80 ? `${head.slice(0, 80).trim()}…` : head
  }
  if (messages.some((m) => m.role === 'assistant')) {
    return '무제 대화'
  }
  return '개인 채팅'
}

function buildSyncPayload(
  messages: ChatBubble[],
  sidebarTitle?: string,
): {
  title: string
  rows: { id: string; role: string; content: string; time: string }[]
} {
  const stable = sortChatBubblesChronologically(messages)
    .filter((m) => !m.streaming && m.content.trim().length > 0)
    .slice(-MAX_MESSAGES)

  const customTitle = sidebarTitle?.trim()
  return {
    title: customTitle || deriveThreadTitle(stable),
    rows: stable.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content.trim(),
      time: resolveChatMessageIsoTime(m),
    })),
  }
}

function signatureFor(
  clientThreadId: string,
  title: string,
  rows: { id: string; role: string; content: string; time: string }[],
): string {
  return `${clientThreadId}:${title}:${rows.length}:${rows.map((r) => r.id).join(',')}`
}

/** RPC 미배포 시 동기화 시도마다 콘솔 경고가 쌓이지 않도록 1회만 안내 */
let rpcUnavailableLogged = false

function isMissingSyncRpcError(message: string): boolean {
  return (
    message.includes('Could not find the function') ||
    message.includes('sync_private_chat_session')
  )
}

export async function syncPrivateChatSessionToDb(
  supabase: SupabaseClient,
  params: {
    clientThreadId: string
    messages: ChatBubble[]
    sidebarTitle?: string
  },
): Promise<{ ok: true; sessionId: string } | { ok: false; message: string }> {
  const hasUser = params.messages.some(
    (m) => m.role === 'user' && m.content.trim().length > 0 && !m.streaming,
  )
  if (!hasUser) {
    return { ok: false, message: 'skip_no_user_message' }
  }

  const { title, rows } = buildSyncPayload(
    params.messages,
    params.sidebarTitle,
  )
  const sig = signatureFor(params.clientThreadId, title, rows)
  if (lastSyncSignature.get(params.clientThreadId) === sig) {
    return { ok: false, message: 'skip_unchanged' }
  }

  const { data, error } = await supabase.rpc('sync_private_chat_session', {
    p_client_thread_id: params.clientThreadId,
    p_title: title,
    p_messages: rows,
  })

  if (error) {
    if (isMissingSyncRpcError(error.message)) {
      if (!rpcUnavailableLogged) {
        console.warn(
          '[private-chat-sync] sync_private_chat_session RPC가 없습니다. Supabase에 마이그레이션 20260522110000_chat_sessions_sync.sql 을 적용하세요 (npm run db:push).',
        )
        rpcUnavailableLogged = true
      }
      return { ok: false, message: 'rpc_not_deployed' }
    }
    console.warn('[private-chat-sync]', error.message)
    return { ok: false, message: error.message }
  }

  lastSyncSignature.set(params.clientThreadId, sig)
  return { ok: true, sessionId: String(data) }
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Dashboard 저장 effect 와 병행 — 실패해도 localStorage UX 는 유지 */
export function schedulePrivateChatDbSync(
  supabase: SupabaseClient,
  params: {
    clientThreadId: string
    messages: ChatBubble[]
    userId: string | undefined
  },
): void {
  if (!params.userId) return

  const existing = debounceTimers.get(params.clientThreadId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    debounceTimers.delete(params.clientThreadId)
    const stored = loadPrivateChatState(params.clientThreadId)
    void syncPrivateChatSessionToDb(supabase, {
      clientThreadId: params.clientThreadId,
      messages: params.messages,
      sidebarTitle: stored?.sidebarTitle,
    })
  }, SYNC_DEBOUNCE_MS)

  debounceTimers.set(params.clientThreadId, timer)
}

export function cancelPrivateChatDbSync(clientThreadId: string): void {
  const t = debounceTimers.get(clientThreadId)
  if (t) {
    clearTimeout(t)
    debounceTimers.delete(clientThreadId)
  }
}
