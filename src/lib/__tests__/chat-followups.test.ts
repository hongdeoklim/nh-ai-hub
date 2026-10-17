import { describe, expect, it } from 'vitest'

import { FOLLOWUP_INSTRUCTION, splitFollowups } from '../chat-followups'

describe('splitFollowups (이어서 물어보기)', () => {
  it('완성된 블록을 본문에서 떼어 추천 질문으로 돌려준다', () => {
    const text = [
      '출장비는 7일 안에 정산합니다.',
      '',
      '<followups>',
      '해외 출장도 같은 기준인가요?',
      '- 영수증을 잃어버리면 어떻게 하나요?',
      '3. 법인카드 한도는 얼마인가요?',
      '</followups>',
    ].join('\n')

    expect(splitFollowups(text)).toEqual({
      body: '출장비는 7일 안에 정산합니다.',
      followups: [
        '해외 출장도 같은 기준인가요?',
        '영수증을 잃어버리면 어떻게 하나요?',
        '법인카드 한도는 얼마인가요?',
      ],
    })
  })

  it('블록이 없으면 본문을 그대로 두고 추천 질문은 비어 있다', () => {
    expect(splitFollowups('안녕하세요!')).toEqual({ body: '안녕하세요!', followups: [] })
  })

  it('닫는 태그가 아직 안 왔으면 블록은 숨기되 반쪽 질문은 쓰지 않는다', () => {
    const streaming = '답변 본문입니다.\n<followups>\n첫 질문\n두 번'
    expect(splitFollowups(streaming, { partial: true })).toEqual({
      body: '답변 본문입니다.',
      followups: [],
    })
  })

  it('스트리밍 중 여는 태그의 앞부분만 와도 본문에서 숨긴다', () => {
    expect(splitFollowups('본문 끝.\n<foll', { partial: true }).body).toBe('본문 끝.')
    expect(splitFollowups('본문 끝.\n<', { partial: true }).body).toBe('본문 끝.')
    // 완료된 답변에서는 우연히 끝난 `<` 를 지우지 않는다
    expect(splitFollowups('a <', { partial: false }).body).toBe('a <')
  })

  it('대소문자·중복·긴 줄·빈 줄을 정리하고 최대 3개만 쓴다', () => {
    const long = '가'.repeat(120)
    const text = `본문\n<FOLLOWUPS>\n\n질문 A\n질문 A\n${long}\n질문 B\n질문 C\n질문 D\n</FOLLOWUPS>`
    expect(splitFollowups(text).followups).toEqual(['질문 A', '질문 B', '질문 C'])
  })

  it('지시문은 여는·닫는 태그 형식을 그대로 안내한다', () => {
    expect(FOLLOWUP_INSTRUCTION).toContain('<followups>')
    expect(FOLLOWUP_INSTRUCTION).toContain('</followups>')
  })
})
