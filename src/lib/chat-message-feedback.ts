import { supabase } from './supabase'

export type MessageFeedbackRating = 'up' | 'down'

type FeedbackMap = Record<string, MessageFeedbackRating>

const STORAGE_KEY_BASE = 'nh-ai-hub.chat-message-feedback.v1'

let storageUserId: string | null = null

export function setChatMessageFeedbackUser(userId: string | null): void {
  storageUserId = userId
}

function readStore(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function storageKey(): string {
  return storageUserId
    ? `${STORAGE_KEY_BASE}.${storageUserId}`
    : `${STORAGE_KEY_BASE}.anonymous`
}

function readMap(): FeedbackMap {
  const store = readStore()
  if (!store) return {}
  try {
    const raw = store.getItem(storageKey())
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const map: FeedbackMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (value === 'up' || value === 'down') {
        map[id] = value
      }
    }
    return map
  } catch {
    return {}
  }
}

function writeMap(map: FeedbackMap): void {
  const store = readStore()
  if (!store) return
  const key = storageKey()
  try {
    if (Object.keys(map).length === 0) {
      store.removeItem(key)
      return
    }
    store.setItem(key, JSON.stringify(map))
  } catch {
    /* quota or private mode */
  }
}

export function getMessageFeedback(
  messageId: string,
): MessageFeedbackRating | null {
  if (!messageId) return null
  return readMap()[messageId] ?? null
}

export function setMessageFeedback(
  messageId: string,
  rating: MessageFeedbackRating | null,
): MessageFeedbackRating | null {
  if (!messageId) return null
  const map = { ...readMap() }
  if (rating === null) {
    delete map[messageId]
  } else {
    map[messageId] = rating
  }
  writeMap(map)
  return rating
}

/** 같은 버튼 재클릭 시 해제, 반대 버튼은 상호 배타적으로 전환 */
export function toggleMessageFeedback(
  messageId: string,
  target: MessageFeedbackRating,
): MessageFeedbackRating | null {
  const current = getMessageFeedback(messageId)
  if (current === target) {
    return setMessageFeedback(messageId, null)
  }
  return setMessageFeedback(messageId, target)
}

// =============================================================================
// [1단계 고도화] Supabase DB 피드백 연동 기능
// =============================================================================

/** 로그인 유저의 모든 피드백 데이터를 DB에서 조회하여 로컬스토리지 맵에 동기화 */
export async function hydrateFeedbacksFromDb(userId: string): Promise<void> {
  setChatMessageFeedbackUser(userId)
  try {
    const { data, error } = await supabase
      .from('message_feedbacks')
      .select('message_id, rating')
      .eq('user_id', userId)

    if (error) throw error
    if (data) {
      const newMap: FeedbackMap = {}
      for (const item of data) {
        newMap[item.message_id] = item.rating === 1 ? 'up' : 'down'
      }
      writeMap(newMap)
      console.log(`[chat-message-feedback] DB 피드백 ${data.length}건 동기화 완료`)
    }
  } catch (err) {
    console.error('[chat-message-feedback] DB 피드백 동기화 실패:', err)
  }
}

/** 특정 메시지에 대한 피드백 상세 정보를 DB에서 실시간 조회 (텍스트 피드백 포함) */
export async function getDbFeedbackDetail(
  messageId: string,
): Promise<{ rating: MessageFeedbackRating | null; text: string | null } | null> {
  try {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return null

    const { data, error } = await supabase
      .from('message_feedbacks')
      .select('rating, feedback_text')
      .eq('user_id', user.id)
      .eq('message_id', messageId)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      rating: data.rating === 1 ? 'up' : 'down',
      text: data.feedback_text,
    }
  } catch (err) {
    console.error('[chat-message-feedback] 피드백 상세 조회 실패:', err)
    return null
  }
}

/** 피드백 데이터 DB upsert 및 로컬스토리지 동기화 */
export async function saveFeedbackToDb(
  messageId: string,
  messageType: 'session' | 'team',
  rating: MessageFeedbackRating | null,
  feedbackText: string | null = null,
): Promise<void> {
  try {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) {
      // 로그인되어 있지 않으면 로컬스토리지에만 기록
      setMessageFeedback(messageId, rating)
      return
    }

    // 로컬 즉각 반영 (Optimistic UI)
    setMessageFeedback(messageId, rating)

    if (rating === null) {
      // 피드백 취소 시 DB 삭제
      const { error } = await supabase
        .from('message_feedbacks')
        .delete()
        .eq('user_id', user.id)
        .eq('message_id', messageId)
      if (error) throw error
      console.log(`[chat-message-feedback] DB 피드백 삭제 완료 (msg: ${messageId})`)
    } else {
      // 피드백 등록 및 수정
      const ratingValue = rating === 'up' ? 1 : -1
      const { error } = await supabase
        .from('message_feedbacks')
        .upsert(
          {
            user_id: user.id,
            message_id: messageId,
            message_type: messageType,
            rating: ratingValue,
            feedback_text: feedbackText,
          },
          {
            onConflict: 'user_id,message_id',
          },
        )
      if (error) throw error
      console.log(`[chat-message-feedback] DB 피드백 저장 완료 (msg: ${messageId}, rating: ${ratingValue})`)
    }
  } catch (err) {
    console.error('[chat-message-feedback] DB 피드백 저장 실패:', err)
  }
}

