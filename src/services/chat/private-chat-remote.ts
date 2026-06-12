import type { SupabaseClient } from '@supabase/supabase-js'

import type { ChatBubble } from '../../components/chat/ChatArea'
import { setChatMessageFeedbackUser } from '../../lib/chat-message-feedback'
import {
  resolveChatMessageIsoTime,
  sortChatBubblesChronologically,
} from '../../lib/chat-message-time'
import {
  getLastPrivateThreadId,
  loadPrivateChatState,
  PRIVATE_CHAT_STORAGE_UPDATED_EVENT,
  rememberLastPrivateThread,
  savePrivateChatState,
  setPrivateChatStorageUser,
  type PrivateChatStoredState,
} from '../../lib/private-chat-storage'

const HYDRATE_LIMIT = 40

const GENERIC_SESSION_TITLES = new Set(['개인 채팅', '무제 대화', '새 채팅'])

type RemoteMessageRow = {
  client_message_id: string | null
  role: string
  content: string
  created_at: string
}

type RemoteSessionRow = {
  client_thread_id: string
  title: string | null
  updated_at: string
  chat_session_messages: RemoteMessageRow[] | null
}

const hydratedUsers = new Set<string>()
const hydratePromises = new Map<string, Promise<void>>()

export function resetPrivateChatHydrationCache(userId?: string): void {
  if (userId) {
    hydratedUsers.delete(userId)
    hydratePromises.delete(userId)
    return
  }
  hydratedUsers.clear()
  hydratePromises.clear()
}

function formatDisplayTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dbMessagesToBubbles(rows: RemoteMessageRow[]): ChatBubble[] {
  const bubbles: ChatBubble[] = rows.map((row) => {
    const createdAt = new Date(row.created_at).toISOString()
    const role: ChatBubble['role'] =
      row.role === 'assistant' ? 'assistant' : 'user'
    return {
      id: row.client_message_id?.trim() || crypto.randomUUID(),
      role,
      content: row.content,
      time: formatDisplayTime(createdAt),
      createdAt,
    }
  })
  return sortChatBubblesChronologically(bubbles)
}

function lastMessageTimestamp(messages: ChatBubble[]): number {
  let max = 0
  for (const m of messages) {
    const t = Date.parse(resolveChatMessageIsoTime(m))
    if (Number.isFinite(t)) max = Math.max(max, t)
  }
  return max
}

function mergeThreadState(
  local: PrivateChatStoredState | null,
  remoteMessages: ChatBubble[],
  remoteSidebarTitle?: string,
): PrivateChatStoredState {
  const remote: PrivateChatStoredState = {
    messages: remoteMessages,
    draft: '',
    galleryDismissed: local?.galleryDismissed ?? false,
    sidebarTitle: remoteSidebarTitle ?? local?.sidebarTitle,
  }

  if (!local || local.messages.length === 0) {
    return { ...remote, messages: sortChatBubblesChronologically(remote.messages) }
  }

  const localCount = local.messages.length
  const remoteCount = remoteMessages.length
  if (remoteCount > localCount) {
    return {
      ...remote,
      messages: sortChatBubblesChronologically(remote.messages),
      draft: local.draft,
    }
  }
  if (localCount > remoteCount) {
    return {
      ...local,
      messages: sortChatBubblesChronologically(local.messages),
    }
  }

  const localTs = lastMessageTimestamp(local.messages)
  const remoteTs = lastMessageTimestamp(remoteMessages)
  if (remoteTs > localTs) {
    return {
      ...remote,
      messages: sortChatBubblesChronologically(remote.messages),
      draft: local.draft,
      sidebarTitle: local.sidebarTitle ?? remote.sidebarTitle,
    }
  }
  return {
    ...local,
    messages: sortChatBubblesChronologically(local.messages),
  }
}

function sidebarTitleFromSession(title: string | null | undefined): string | undefined {
  const trimmed = title?.trim() ?? ''
  if (!trimmed || GENERIC_SESSION_TITLES.has(trimmed)) return undefined
  return trimmed
}

export async function hydratePrivateChatsFromRemote(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  setPrivateChatStorageUser(userId)
  setChatMessageFeedbackUser(userId)

  const { data, error } = await supabase
    .from('chat_sessions')
    .select(
      'client_thread_id, title, updated_at, chat_session_messages ( client_message_id, role, content, created_at )',
    )
    .order('created_at', {
      ascending: true,
      foreignTable: 'chat_session_messages',
    })
    .not('client_thread_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(HYDRATE_LIMIT)

  if (error) {
    console.warn('[private-chat-remote] hydrate failed', error.message)
    return
  }

  const sessions = (data ?? []) as RemoteSessionRow[]
  let mostRecentThreadId: string | null = null
  let mostRecentUpdatedAt = 0

  for (const session of sessions) {
    const threadId = session.client_thread_id?.trim()
    if (!threadId) continue

    const remoteMessages = dbMessagesToBubbles(session.chat_session_messages ?? [])
    const local = loadPrivateChatState(threadId)
    const merged = mergeThreadState(
      local,
      remoteMessages,
      sidebarTitleFromSession(session.title),
    )

    savePrivateChatState(threadId, merged)

    const updatedAt = Date.parse(session.updated_at)
    if (Number.isFinite(updatedAt) && updatedAt >= mostRecentUpdatedAt) {
      mostRecentUpdatedAt = updatedAt
      mostRecentThreadId = threadId
    }
  }

  if (!getLastPrivateThreadId() && mostRecentThreadId) {
    rememberLastPrivateThread(mostRecentThreadId)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PRIVATE_CHAT_STORAGE_UPDATED_EVENT))
  }
}

export async function ensurePrivateChatsHydrated(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  if (hydratedUsers.has(userId)) return

  let pending = hydratePromises.get(userId)
  if (!pending) {
    pending = hydratePrivateChatsFromRemote(supabase, userId)
      .catch((err) => {
        console.warn('[private-chat-remote] ensure hydrate error', err)
      })
      .finally(() => {
        hydratedUsers.add(userId)
        hydratePromises.delete(userId)
      })
    hydratePromises.set(userId, pending)
  }

  await pending
}

export async function deleteRemotePrivateChatSession(
  supabase: SupabaseClient,
  clientThreadId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('client_thread_id', clientThreadId)

  if (error) {
    console.warn('[private-chat-remote] delete session failed', error.message)
  }
}
