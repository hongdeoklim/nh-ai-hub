import { describe, expect, it } from 'vitest'

import { difyRetrieverSources } from '../dify-citations'

describe('difyRetrieverSources', () => {
  it('지식 베이스 조각을 출처 목록으로 바꾸고 같은 문서는 하나로 합친다', () => {
    const metadata = {
      usage: { total_tokens: 10 },
      retriever_resources: [
        { position: 1, dataset_name: '사내 규정', document_id: 'd1', document_name: '출장비 규정.pdf', content: '국내 출장 숙박비 상한은…' },
        { position: 2, dataset_name: '사내 규정', document_id: 'd1', document_name: '출장비 규정.pdf', content: '영수증 제출 기한은…' },
        { position: 3, dataset_name: '현장 매뉴얼', document_id: 'd2', document_name: '', content: '' },
      ],
    }

    expect(difyRetrieverSources(metadata)).toEqual([
      { index: 1, title: '출장비 규정.pdf', snippet: '국내 출장 숙박비 상한은…', sourceType: 'document', id: 'd1' },
      { index: 2, title: '현장 매뉴얼', snippet: undefined, sourceType: 'document', id: 'd2' },
    ])
  })

  it('metadata 가 없거나 형식이 다르면 빈 목록이다', () => {
    expect(difyRetrieverSources(undefined)).toEqual([])
    expect(difyRetrieverSources({ retriever_resources: 'x' })).toEqual([])
    expect(difyRetrieverSources({ retriever_resources: [null, 3] })).toEqual([])
  })

  it('긴 본문은 미리보기 길이로 자른다', () => {
    const [source] = difyRetrieverSources({
      retriever_resources: [{ document_id: 'd', document_name: '긴 문서', content: '가'.repeat(500) }],
    })
    expect(source?.snippet).toHaveLength(280)
  })
})
