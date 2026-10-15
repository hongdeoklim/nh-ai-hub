/**
 * Dify 채팅 브리지 — dify-chat-proxy(Supabase Edge Function) 경유 SSE 스트리밍
 *
 * RAG 검색이 들어간 Dify 답변은 수십 초가 걸릴 수 있어, 한 번에 받는 REST 호출 대신
 * SSE 스트리밍으로 받아 조각마다 화면에 그린다.
 * Dify API 키는 절대 프런트엔드 번들에 넣지 않는다. 모든 호출은 프록시를 거치고,
 * 실제 키는 프록시가 서버 시크릿(DIFY_API_KEY)으로 붙인다.
 */

const SUPABASE_URL = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_URL || '') : '';

/**
 * NH-AX-HUB 대화(threadId) → Dify conversation_id.
 * 이 매핑이 있어야 Dify 가 같은 대화의 앞선 질문·답을 기억한다. 새로고침 뒤에도 이어지도록 localStorage 에도 둔다.
 */
const CONVERSATION_KEY_PREFIX = 'nh-ai-hub.dify-conversation.';
const conversationMap = new Map();

function readDifyConversationId(threadId) {
  if (!threadId) return '';
  if (conversationMap.has(threadId)) return conversationMap.get(threadId);
  try {
    const saved = localStorage.getItem(CONVERSATION_KEY_PREFIX + threadId) || '';
    if (saved) conversationMap.set(threadId, saved);
    return saved;
  } catch {
    return '';
  }
}

function rememberDifyConversationId(threadId, difyConversationId) {
  if (!threadId || !difyConversationId) return;
  if (conversationMap.get(threadId) === difyConversationId) return;
  conversationMap.set(threadId, difyConversationId);
  try {
    localStorage.setItem(CONVERSATION_KEY_PREFIX + threadId, difyConversationId);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리 매핑만 쓴다
  }
}

/** 오류에 HTTP 상태를 실어 호출 측이 토큰 한도(402)·요청 과다(429)를 구분하게 한다 */
function httpError(message, status) {
  const error = new Error(message);
  if (typeof status === 'number') error.status = status;
  return error;
}

/**
 * Dify(/v1/chat-messages)에 메시지를 보내고 스트리밍(SSE) 응답을 처리한다.
 * 콜백은 onDone·onError·onAbort 중 정확히 하나만 한 번 호출된다.
 *
 * @param {Object} params
 * @param {string} params.query - 사용자 메시지
 * @param {string} params.user - 사용자 식별자
 * @param {string} [params.conversationId=''] - NH-AX-HUB 대화 ID (Dify 대화 맥락 유지용)
 * @param {string} params.supabaseToken - dify-chat-proxy 인증용 Supabase 사용자 JWT
 * @param {Object} callbacks
 * @param {(chunk: string) => void} [callbacks.onMessage] - 답변 조각을 받을 때마다
 * @param {(error: Error) => void} [callbacks.onError] - 실패 시
 * @param {(metadata?: unknown) => void} [callbacks.onDone] - 정상 완료 시 (message_end 의 metadata)
 * @param {() => void} [callbacks.onAbort] - 사용자가 중단했을 때
 * @param {AbortSignal} [callbacks.signal]
 */
export async function streamDifyChat(
  { query, user, conversationId = '', supabaseToken = '' },
  { onMessage, onError, onDone, onAbort, signal }
) {
  let settled = false;
  const finishOk = (metadata) => {
    if (settled) return;
    settled = true;
    if (onDone) onDone(metadata);
  };
  const finishError = (error) => {
    if (settled) return;
    settled = true;
    if (onError) onError(error);
  };
  const finishAbort = () => {
    if (settled) return;
    settled = true;
    if (onAbort) onAbort();
  };

  if (!SUPABASE_URL) {
    finishError(new Error('Supabase 환경 변수(VITE_SUPABASE_URL)가 설정되지 않아 Dify 프록시를 호출할 수 없습니다.'));
    return;
  }
  if (!supabaseToken) {
    finishError(new Error('로그인 세션 토큰이 없어 Dify 프록시를 호출할 수 없습니다. 다시 로그인해 주세요.'));
    return;
  }

  // Mixed Content·키 노출을 피하기 위해 항상 프록시(Edge Function)를 거쳐 Dify 로 보낸다
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/dify-chat-proxy`;

  const payload = {
    inputs: {},
    query,
    response_mode: 'streaming',
    user: user || 'anonymous_user',
  };
  const difyConversationId = readDifyConversationId(conversationId);
  if (difyConversationId) payload.conversation_id = difyConversationId;

  let reader = null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      // 프록시는 { error }, Dify 는 { message, code } 로 실패를 알린다
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.error || errorData.message || errorData.code || response.statusText || '알 수 없는 오류';
      throw httpError(`Dify 응답 오류 (${response.status}): ${detail}`, response.status);
    }
    if (!response.body) {
      throw new Error('이 브라우저는 스트리밍 응답을 지원하지 않습니다.');
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let endMetadata;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 마지막 줄은 아직 덜 온 조각일 수 있어 다음 읽기로 넘긴다
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        // SSE 의 data 줄만 본다 (event: ping 등은 무시)
        if (!trimmedLine.startsWith('data:')) continue;
        const dataStr = trimmedLine.slice(5).trim();
        if (!dataStr) continue;

        let data;
        try {
          data = JSON.parse(dataStr);
        } catch (parseError) {
          console.warn('[Dify Bridge] SSE JSON 파싱 실패:', parseError, 'Raw:', dataStr);
          continue;
        }

        if (data.conversation_id) rememberDifyConversationId(conversationId, data.conversation_id);

        if ((data.event === 'message' || data.event === 'agent_message') && data.answer) {
          if (onMessage) onMessage(data.answer);
        } else if (data.event === 'error') {
          // 스트림 도중 오류: 빈 답변을 성공으로 넘기지 않고 사용자에게 알린다
          await reader.cancel().catch(() => undefined);
          finishError(httpError(`Dify 서버 오류: ${data.message || data.code || '알 수 없는 오류'}`, data.status));
          return;
        } else if (data.event === 'message_end') {
          endMetadata = data.metadata;
        }
        // agent_thought(에이전트 내부 추론)는 길고 날것이라 채팅창에 표시하지 않는다
      }
    }

    finishOk(endMetadata);
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      finishAbort();
      return;
    }
    console.error('[Dify Bridge] streamDifyChat 실패:', error);
    finishError(error instanceof Error ? error : new Error(String(error)));
  }
}
