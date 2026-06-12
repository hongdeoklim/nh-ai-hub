import type { ChatBubble } from '../components/chat/ChatArea'
import {
  resolveChatMessageIsoTime,
  sortChatBubblesChronologically,
} from './chat-message-time'

const STORAGE_PREFIX = 'nh-ai-hub.private-chat.v1.'
const LAST_THREAD_KEY_BASE = 'nh-ai-hub.last-private-thread'
const PINNED_THREADS_KEY_BASE = 'nh-ai-hub.pinned-private-threads'

/** @deprecated 사용자별 키는 getLastPrivateThreadId() 사용 */
export const PRIVATE_CHAT_LAST_THREAD_KEY = LAST_THREAD_KEY_BASE

/** 사이드바 등에서 목록 갱신용 (localStorage 는 다른 탭에서 storage 이벤트 가능) */
export const PRIVATE_CHAT_STORAGE_UPDATED_EVENT = 'nh-ai-hub:private-chat-updated'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let storageUserId: string | null = null

export function setPrivateChatStorageUser(userId: string | null): void {
  storageUserId = userId
}

function readStore(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function lastThreadKey(): string | null {
  if (!storageUserId) return null
  return `${LAST_THREAD_KEY_BASE}.${storageUserId}`
}

function pinnedThreadsKey(): string | null {
  if (!storageUserId) return null
  return `${PINNED_THREADS_KEY_BASE}.${storageUserId}`
}

function storageKey(threadId: string): string | null {
  if (!storageUserId) return null
  return `${STORAGE_PREFIX}${storageUserId}.${threadId}`
}

function threadPrefix(): string | null {
  if (!storageUserId) return null
  return `${STORAGE_PREFIX}${storageUserId}.`
}

export function isValidPrivateChatThreadId(id: string | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id.trim())
}

export type PrivateChatStoredState = {
  messages: ChatBubble[]
  draft: string
  galleryDismissed: boolean
  /** 사이드바 표시용 사용자 지정 제목 */
  sidebarTitle?: string
}

/** localStorage·사이드바 목록에 남길 만한 실질 내용이 있는지 */
export function hasPersistablePrivateChatContent(
  state: Pick<
    PrivateChatStoredState,
    'messages' | 'draft' | 'sidebarTitle'
  >,
): boolean {
  if (typeof state.sidebarTitle === 'string' && state.sidebarTitle.trim()) {
    return true
  }
  if (state.draft.trim().length > 0) return true
  return state.messages.some(
    (m) =>
      !m.streaming &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0,
  )
}

function normalizeBubble(m: ChatBubble): ChatBubble {
  return { ...m, streaming: false }
}

export function loadPrivateChatState(
  threadId: string,
): PrivateChatStoredState | null {
  const store = readStore()
  const key = storageKey(threadId)
  if (!store || !key) return null
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PrivateChatStoredState>
    if (!Array.isArray(parsed.messages)) return null
    return {
      messages: sortChatBubblesChronologically(
        parsed.messages.map((row) => normalizeBubble(row as ChatBubble)),
      ),
      draft: typeof parsed.draft === 'string' ? parsed.draft : '',
      galleryDismissed: Boolean(parsed.galleryDismissed),
      sidebarTitle:
        typeof parsed.sidebarTitle === 'string'
          ? parsed.sidebarTitle
          : undefined,
    }
  } catch {
    return null
  }
}

export function savePrivateChatState(
  threadId: string,
  state: PrivateChatStoredState,
): void {
  const store = readStore()
  const key = storageKey(threadId)
  if (!store || !key) return

  const existing = loadPrivateChatState(threadId)
  const payload: PrivateChatStoredState = {
    ...state,
    sidebarTitle: state.sidebarTitle ?? existing?.sidebarTitle,
    messages: sortChatBubblesChronologically(
      state.messages.map(normalizeBubble),
    ),
  }
  if (!hasPersistablePrivateChatContent(payload)) {
    try {
      store.removeItem(key)
    } catch {
      /* ignore */
    }
    return
  }
  try {
    store.setItem(key, JSON.stringify(payload))
  } catch {
    try {
      store.setItem(
        key,
        JSON.stringify({
          ...payload,
          messages: payload.messages.map((m) => ({
            ...m,
            attachmentPreviews: undefined,
          })),
        }),
      )
    } catch {
      /* quota 또는 비공개 모드 */
    }
  }
}

export function getLastPrivateThreadId(): string | null {
  const store = readStore()
  const key = lastThreadKey()
  if (!store || !key) return null
  try {
    const raw = store.getItem(key)?.trim()
    return raw && isValidPrivateChatThreadId(raw) ? raw : null
  } catch {
    return null
  }
}

export function rememberLastPrivateThread(threadId: string) {
  const store = readStore()
  const key = lastThreadKey()
  if (!store || !key) return
  try {
    store.setItem(key, threadId)
  } catch {
    /* ignore */
  }
}

export type PrivateChatThreadSummary = {
  threadId: string
  title: string
  sortKey: number
  pinned: boolean
}

function readPinnedThreadIds(): string[] {
  const store = readStore()
  const key = pinnedThreadsKey()
  if (!store || !key) return []
  try {
    const raw = store.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (id): id is string =>
        typeof id === 'string' && isValidPrivateChatThreadId(id),
    )
  } catch {
    return []
  }
}

function writePinnedThreadIds(ids: string[]) {
  const store = readStore()
  const key = pinnedThreadsKey()
  if (!store || !key) return
  try {
    store.setItem(key, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

export function isPrivateChatThreadPinned(threadId: string): boolean {
  return readPinnedThreadIds().includes(threadId)
}

export function togglePinPrivateChatThread(threadId: string): boolean {
  if (!isValidPrivateChatThreadId(threadId)) return false
  const pinned = readPinnedThreadIds()
  const next = pinned.includes(threadId)
    ? pinned.filter((id) => id !== threadId)
    : [threadId, ...pinned.filter((id) => id !== threadId)]
  writePinnedThreadIds(next)
  notifyPrivateChatStorageUpdated()
  return true
}

/** 삭제 직후 Dashboard 등이 localStorage 에 다시 쓰지 않도록 표시 */
const deletedPrivateChatThreadIds = new Set<string>()

export function isPrivateChatThreadDeleted(threadId: string): boolean {
  return deletedPrivateChatThreadIds.has(threadId)
}

/** localStorage 에 저장된 개인 채팅 스레드 목록(키 스캔). */
export function listPrivateChatThreads(limit = 30): PrivateChatThreadSummary[] {
  const store = readStore()
  const prefix = threadPrefix()
  if (!store || !prefix) return []

  const pinnedIds = readPinnedThreadIds()
  const pinnedRank = new Map(pinnedIds.map((id, index) => [id, index]))
  const rows: PrivateChatThreadSummary[] = []

  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (!key?.startsWith(prefix)) continue
    const threadId = key.slice(prefix.length)
    if (!isValidPrivateChatThreadId(threadId)) continue

    let title = '새 채팅'
    let hasPersistableContent = false
    let sortKey = 0

    try {
      const raw = store.getItem(key)
      const parsed = JSON.parse(raw ?? '{}') as Partial<PrivateChatStoredState>
      const msgs = Array.isArray(parsed.messages) ? parsed.messages : []
      hasPersistableContent = hasPersistablePrivateChatContent({
        messages: msgs as ChatBubble[],
        draft: typeof parsed.draft === 'string' ? parsed.draft : '',
        sidebarTitle:
          typeof parsed.sidebarTitle === 'string'
            ? parsed.sidebarTitle
            : undefined,
      })
      if (!hasPersistableContent) continue

      for (const m of msgs) {
        const t = Date.parse(resolveChatMessageIsoTime(m as ChatBubble))
        if (Number.isFinite(t)) sortKey = Math.max(sortKey, t)
      }

      const customTitle =
        typeof parsed.sidebarTitle === 'string'
          ? parsed.sidebarTitle.trim()
          : ''
      if (customTitle.length > 0) {
        title =
          customTitle.length > 44
            ? `${customTitle.slice(0, 44).trim()}…`
            : customTitle
      } else {
        const firstUser = msgs.find((m) => (m as ChatBubble).role === 'user')
        const text =
          typeof firstUser?.content === 'string' ? firstUser.content.trim() : ''
        const singleLine = text.split(/\r?\n/).find((l) => l.trim().length > 0)
        const head = (singleLine ?? text).trim()

        if (head.length > 0) {
          title = head.length > 44 ? `${head.slice(0, 44).trim()}…` : head
        } else if (msgs.some((m) => (m as ChatBubble).role === 'assistant')) {
          title = '무제 대화'
        }
      }
    } catch {
      /* 무시 */
    }

    rows.push({
      threadId,
      title,
      sortKey,
      pinned: pinnedRank.has(threadId),
    })
  }

  rows.sort((a, b) => {
    const aPinned = pinnedRank.get(a.threadId)
    const bPinned = pinnedRank.get(b.threadId)
    if (aPinned !== undefined && bPinned !== undefined) {
      return aPinned - bPinned
    }
    if (aPinned !== undefined) return -1
    if (bPinned !== undefined) return 1
    return b.sortKey - a.sortKey
  })
  return rows.slice(0, Math.max(0, limit))
}

/** 제목·메시지 본문 기준 개인 채팅 검색 */
export function searchPrivateChatThreads(
  query: string,
  limit = 35,
): PrivateChatThreadSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return listPrivateChatThreads(limit)

  const matched: PrivateChatThreadSummary[] = []
  for (const thread of listPrivateChatThreads(200)) {
    if (thread.title.toLowerCase().includes(q)) {
      matched.push(thread)
      continue
    }
    const state = loadPrivateChatState(thread.threadId)
    if (!state) continue
    const hit = state.messages.some(
      (m) =>
        typeof m.content === 'string' &&
        m.content.toLowerCase().includes(q),
    )
    if (hit) matched.push(thread)
  }
  return matched.slice(0, Math.max(0, limit))
}

function notifyPrivateChatStorageUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PRIVATE_CHAT_STORAGE_UPDATED_EVENT))
  }
}

export function renamePrivateChatThread(
  threadId: string,
  title: string,
): boolean {
  const trimmed = title.trim()
  if (!isValidPrivateChatThreadId(threadId) || trimmed.length < 1) return false

  const existing = loadPrivateChatState(threadId) ?? {
    messages: [],
    draft: '',
    galleryDismissed: false,
  }

  savePrivateChatState(threadId, {
    ...existing,
    sidebarTitle: trimmed,
  })
  notifyPrivateChatStorageUpdated()
  return true
}

export function deletePrivateChatThread(threadId: string): boolean {
  if (!isValidPrivateChatThreadId(threadId)) return false

  deletedPrivateChatThreadIds.add(threadId)

  const store = readStore()
  const key = storageKey(threadId)
  const lastKey = lastThreadKey()
  if (!store || !key) return false

  try {
    store.removeItem(key)
    if (lastKey && store.getItem(lastKey) === threadId) {
      store.removeItem(lastKey)
    }
    const pinned = readPinnedThreadIds()
    const nextPinned = pinned.filter((id) => id !== threadId)
    if (nextPinned.length !== pinned.length) {
      writePinnedThreadIds(nextPinned)
    }
  } catch {
    return false
  }

  notifyPrivateChatStorageUpdated()
  return true
}
