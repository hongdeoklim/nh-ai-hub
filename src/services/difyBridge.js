/**
 * Dify API Bridge Service
 * 
 * [寃쎄퀬 諛??먯씤 遺꾩꽍]
 * RAG 湲곕컲 臾몄꽌 寃?됱씠 ?ы븿??梨쀫큸 ?묐떟? ?듬? ?앹꽦源뚯? ??珥덉뿉???섏떗 珥덇? ?뚯슂?????덉뒿?덈떎.
 * ?대? ?쇰컲?곸씤 ?숆린??HTTP ?붿껌(REST API)?쇰줈 泥섎━??寃쎌슦, Firebase Functions? 媛숈? 
 * ?쒕쾭由ъ뒪 ?섍꼍?먯꽌 Timeout ?쒗븳??嫄몃━嫄곕굹 ?대씪?댁뼵??UI媛 ?묐떟??湲곕떎由щŉ 硫덉텛??移섎챸?곸씤 臾몄젣媛 諛쒖깮?????덉뒿?덈떎.
 * ?곕씪????釉뚮┸吏 ?쒕퉬?ㅻ뒗 Server-Sent Events (SSE) 諛⑹떇???ъ슜?섏뿬
 * ?묐떟???ㅽ듃由щ컢 ?뺥깭濡??덉쟾?섍퀬 鍮좊Ⅴ寃??대씪?댁뼵?몄뿉寃??꾨떖?섎룄濡??ㅺ퀎?섏뿀?듬땲??
 */

// ?섍꼍 蹂€?섏뿉??API URL 諛?KEY 濡쒕뱶 (?섎뱶肄붾뵫 諛⑹?)
// Vite ?섍꼍(import.meta.env)怨??뱁뙥/CRA(process.env) ?묐갑???명솚???뺣낫
// Dify API 키는 절대 프론트엔드 번들에 포함하지 않는다.
// 모든 호출은 Supabase Edge Function(dify-chat-proxy)을 경유하며,
// 실제 Dify 키는 프록시가 서버 측 시크릿(DIFY_API_KEY)으로 붙인다.
const SUPABASE_URL = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_SUPABASE_URL || '') : '';

// 로컬 메모리에서 NH-AX-HUB의 threadId와 Dify의 conversation_id를 매핑합니다.
const conversationMap = new Map();

/**
 * Dify API(/v1/chat-messages)에 메시지를 전송하고 스트리밍(SSE) 응답을 처리합니다.
 *
 * @param {Object} params - 요청 파라미터
 * @param {string} params.query - 사용자 메시지
 * @param {string} params.user - 사용자 식별자 (ID)
 * @param {string} [params.conversationId=''] - 기존 대화 ID (선택 사항)
 * @param {Object} [params.userContext] - 사용자의 부서 및 직급 등 권한 정보
 * @param {Object} callbacks - 스트림 처리를 위한 콜백 함수들
 * @param {Function} callbacks.onMessage - 텍스트 청크를 받을 때마다 호출되는 함수
 * @param {Function} callbacks.onError - 에러 발생 시 호출되는 함수
 * @param {Function} callbacks.onDone - 스트리밍이 완료되었을 때 호출되는 함수
 * @param {AbortSignal} [callbacks.signal] - 사용자 요청 취소(AbortController)를 위한 시그널
 */
export async function streamDifyChat(
  { query, user, conversationId = '', userContext = {}, supabaseToken = '' },
  { onMessage, onError, onDone, signal }
) {
  if (!SUPABASE_URL) {
    const errorMsg = 'Supabase 환경 변수(VITE_SUPABASE_URL)가 설정되지 않아 Dify 프록시를 호출할 수 없습니다.';
    console.error('[Dify Bridge]', errorMsg);
    if (onError) onError(new Error(errorMsg));
    return;
  }
  if (!supabaseToken) {
    const errorMsg = '로그인 세션 토큰이 없어 Dify 프록시를 호출할 수 없습니다. 다시 로그인해 주세요.';
    console.error('[Dify Bridge]', errorMsg);
    if (onError) onError(new Error(errorMsg));
    return;
  }

  // Mixed Content·키 노출을 피하기 위해 항상 프록시 서버(Edge Function)를 거쳐 Dify로 전달
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/dify-chat-proxy`;

  const payload = {
    inputs: {}, // RBAC 기능 제거 (Dify 호환성 문제)
    query: query,
    response_mode: 'streaming', // 스트리밍 모드 강제
    user: user || 'anonymous_user'
  };

  // NH-AX-HUB의 threadId(conversationId)에 매핑된 실제 Dify의 conversation_id가 있을 때만 전송
  const realDifyConvId = conversationMap.get(conversationId);
  if (realDifyConvId) {
    payload.conversation_id = realDifyConvId;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: signal,
    });

    if (!response.ok) {
      // ?묐떟 ?ㅽ뙣 ??JSON ?먮윭 蹂몃Ц???뚯떛?섏뿬 ?꾨떖 ?쒕룄
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Dify API ?듭떊 ?ㅻ쪟: ${response.status} ${response.statusText} - ${errorData.message || errorData.code || '?????녿뒗 ?ㅻ쪟'}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream??吏?먰븯吏 ?딅뒗 釉뚮씪?곗??닿굅???ㅽ듃由щ컢 ?묐떟???꾨떃?덈떎.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // 留덉?留??붿냼???꾩쭅 以꾨컮轅덉쑝濡??앸굹吏 ?딆? 遺덉셿?꾪븳 泥?겕?????덉쑝誘濡?踰꾪띁???ㅼ떆 蹂닿?
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '') continue;
        
        // SSE 洹쒓꺽??'data: ' 濡??쒖옉?섎뒗 ?쇱씤 ?뚯떛
        if (trimmedLine.startsWith('data: ')) {
          const dataStr = trimmedLine.slice(6);
          
          try {
            const data = JSON.parse(dataStr);
            
            if (data.conversation_id && conversationId) {
              conversationMap.set(conversationId, data.conversation_id);
            }

            if ((data.event === 'message' || data.event === 'agent_message') && data.answer) {
              if (onMessage) onMessage(data.answer);
            } else if (data.event === 'agent_thought') {
              // 에이전트의 내부 생각(Chain of Thought)은 너무 길고 날것이므로 채팅창에 출력하지 않음
            } else if (data.event === 'error') {
              throw new Error(`Dify 서버 에러: ${data.message || data.code}`);
            } else if (data.event === 'message_end') {
              if (onDone) onDone(data); // metadata 전달
            }
          } catch (e) {
            // JSON ?뚯떛 ?먮윭??遺덉셿?꾪븳 泥?겕 ?섏떊 ??醫낆쥌 諛쒖깮?????덉쑝誘€濡?臾댁떆?섍굅??寃쎄퀬留??④?
            console.warn('[Dify Bridge] SSE JSON parsing error:', e, 'Raw:', dataStr);
          }
        }
      }
    }

    // ?듭떊 ?꾨즺 泥섎━
    if (onDone) onDone();

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[Dify Bridge] ?대씪?댁뼵?몄뿉 ?섑빐 ?붿껌??痍⑥냼?섏뿀?듬땲??');
    } else {
      console.error('[Dify Bridge] streamDifyChat ?덉쇅 諛쒖깮:', error);
      if (onError) onError(error);
    }
  }
}

