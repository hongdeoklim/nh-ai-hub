/**
 * 클라이언트 `src/services/ai/guardrail.ts` 와 동일한 판별 기준을 유지합니다.
 * 수정 시 양쪽 파일을 함께 갱신하세요.
 */
export const GUARDRAIL_SYSTEM_PROMPT = `당신은 농협네트웍스(NH Networks) 사내 AI 포털의 최소 차단 정책 분류기입니다.

## 기본 원칙
- **거의 모든 요청은 PASS** 입니다. 업무·일상·학습·창작·번역·코딩·이미지 생성 등 모두 허용합니다.
- 아래 **BLOCK 블랙리스트에 해당할 때만** BLOCK 하세요. 애매하면 반드시 PASS 입니다.

## BLOCK (이 두 가지만 차단)
1. **주식·증권·펀드 투자**: 종목 추천, 매매·매수·매도 타이밍, 수익률 예측, 투자 조언
2. **운세·점·미신**: 사주, 타로, 별자리 운세, 점술, 오늘의 운세 등

## PASS (명시적 허용 예)
- 업무 질의, 문서 작성, 번역, 요약, 코드, 일반 상식, 여행, 부동산 행정·서식, 코인·NFT 일반 설명(투자 조언 제외)
- 이미지·영상 생성, 창작, 인사·잡담

출력 규칙(매우 중요):
- 응답은 영단어 PASS 또는 BLOCK 둘 중 하나만 출력합니다.
- 공백·따옴표·마침표·설명 문장을 절대 붙이지 않습니다.`

/** LLM 호출 전 주식·운세 관련 명백한 키워드만 즉시 차단합니다. */
export function quickKeywordGuardrail(prompt: string): "BLOCK" | null {
  const normalized = prompt.trim()
  if (!normalized.length) return "BLOCK"

  const hardBlockPatterns: RegExp[] = [
    /\b주식\b|\b코스피\b|\b코스닥\b|\b증권\b|\b펀드\b|\b종목\b|주식\s*(추천|매매|투자|분석|사야|팔아|매수|매도)/i,
    /\bstock\b|\b(?:etf|reit)\b/i,
    /\b운세\b|\b사주\b|\b타로\b|\b별자리\b|\b점술\b|오늘\s*의?\s*운/i,
  ]

  for (const re of hardBlockPatterns) {
    if (re.test(normalized)) return "BLOCK"
  }

  return null
}

/** LLM 가드레일 응답 → PASS/BLOCK (파싱 불가 시 null) */
export function parseGuardrailVerdict(raw: string): "PASS" | "BLOCK" | null {
  const trimmed = raw.trim()
  if (!trimmed.length) return null

  const upper = trimmed.toUpperCase()
  const word = /\b(PASS|BLOCK)\b/.exec(upper)
  if (word) return word[1] as "PASS" | "BLOCK"

  if (/^(PASS|P)\b/.test(upper) || /^(OK|ALLOW|APPROVE)\b/.test(upper)) {
    return "PASS"
  }
  if (/^(BLOCK|B|DENY|REJECT)\b/.test(upper)) {
    return "BLOCK"
  }
  if (/통과|허용|업무\s*관련|사내\s*업무/i.test(trimmed)) return "PASS"
  if (/차단|거부|업무\s*무관|블랙리스트/i.test(trimmed)) return "BLOCK"

  return null
}
