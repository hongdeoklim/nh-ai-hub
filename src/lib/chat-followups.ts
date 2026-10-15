/**
 * 답변 뒤에 붙는 "이어서 물어보기" 추천 질문.
 *
 * 모델에게 본문을 모두 쓴 뒤 맨 끝에 `<followups>` 블록으로 후속 질문을 덧붙이게 하고,
 * 클라이언트는 스트리밍 중에도 그 블록을 본문에서 숨긴 뒤 완료 시 칩으로 보여준다.
 * 별도 요청을 하지 않으므로 추가 지연이 없고, 토큰도 질문 몇 줄 분량만 더 쓴다.
 */

const OPEN_TAG = '<followups>'
const CLOSE_TAG = '</followups>'

/** 추천 질문 최대 개수 */
export const MAX_FOLLOWUPS = 3
/** 칩 하나에 넣을 최대 글자 수 (넘치면 버린다) */
const MAX_FOLLOWUP_LENGTH = 80

/** ai-chat 시스템 프롬프트 뒤에 덧붙이는 지시문 */
export const FOLLOWUP_INSTRUCTION = [
  '## 이어서 물어볼 질문 제안',
  '답변 본문을 모두 마친 뒤 맨 마지막에, 사용자가 이어서 물어볼 만한 후속 질문 3개를 아래 형식 그대로 덧붙이세요.',
  OPEN_TAG,
  '첫 번째 질문',
  '두 번째 질문',
  '세 번째 질문',
  CLOSE_TAG,
  '- 사용자 입장에서 쓴 짧은 질문(각 40자 이내)으로, 방금 답변을 더 깊게 파고들거나 실무에 바로 적용하는 방향이어야 합니다.',
  '- 번호·기호 없이 한 줄에 하나씩 쓰고, 본문에서는 이 블록이나 "후속 질문"을 언급하지 마세요.',
  '- 인사·감사 같은 짧은 대화처럼 이어서 물을 것이 없으면 블록을 생략하세요.',
].join('\n')

export type SplitFollowupsResult = {
  /** 추천 질문 블록을 뺀 본문 */
  body: string
  /** 완성된 블록에서 읽은 추천 질문 (블록이 없거나 덜 왔으면 빈 배열) */
  followups: string[]
}

function cleanFollowupLine(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*•·]|\d+[.)])\s*/, '')
    .replace(/^["'“‘]|["'”’]$/g, '')
    .trim()
}

function parseFollowupLines(block: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of block.split('\n')) {
    const line = cleanFollowupLine(raw)
    if (!line || line.length > MAX_FOLLOWUP_LENGTH) continue
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
    if (out.length >= MAX_FOLLOWUPS) break
  }
  return out
}

/**
 * 본문과 추천 질문을 분리한다.
 * `partial` 이면(스트리밍 중) 끝에 막 들어오기 시작한 `<follo…` 조각도 본문에서 숨긴다.
 */
export function splitFollowups(
  text: string,
  options: { partial?: boolean } = {},
): SplitFollowupsResult {
  const lower = text.toLowerCase()
  const openAt = lower.lastIndexOf(OPEN_TAG)
  if (openAt >= 0) {
    const afterOpen = text.slice(openAt + OPEN_TAG.length)
    const closeAt = afterOpen.toLowerCase().indexOf(CLOSE_TAG)
    const body = text.slice(0, openAt).trimEnd()
    // 닫는 태그까지 와야 완성된 목록으로 본다 (잘린 블록의 반쪽 질문은 쓰지 않는다)
    if (closeAt < 0) return { body, followups: [] }
    return { body, followups: parseFollowupLines(afterOpen.slice(0, closeAt)) }
  }

  if (options.partial) {
    // 스트리밍 중 `<`, `<fol` 처럼 여는 태그의 앞부분만 도착한 경우
    for (let k = Math.min(OPEN_TAG.length - 1, lower.length); k >= 1; k -= 1) {
      if (lower.endsWith(OPEN_TAG.slice(0, k))) {
        return { body: text.slice(0, text.length - k).trimEnd(), followups: [] }
      }
    }
  }
  return { body: text, followups: [] }
}
