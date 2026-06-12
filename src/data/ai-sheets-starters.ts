export type AiSheetsStarter = {
  id: string
  label: string
  prompt: string
}

export const AI_SHEETS_STARTERS: AiSheetsStarter[] = [
  {
    id: 'find-companies',
    label: '업체·기업 찾기',
    prompt:
      '국내 MICE·여행 업계 관련 기업 목록을 표로 정리하고, 각사 특징·규모·연락 포인트 컬럼을 제안해 주세요.',
  },
  {
    id: 'analyze-sheet',
    label: '시트 데이터 분석',
    prompt:
      '첨부한 Google Sheets(또는 spreadsheetId)의 매출·KPI 시트를 분석해 트렌드, 이상치, 다음 액션 3가지를 요약해 주세요.',
  },
  {
    id: 'transform-insights',
    label: '인사이트·차트 제안',
    prompt:
      '현재 데이터를 바탕으로 경영진 보고용 인사이트 5개와 추천 차트 유형(막대·선·히트맵 등)을 표로 정리해 주세요.',
  },
  {
    id: 'enrich-rows',
    label: '행 데이터 보강',
    prompt:
      '시트의 빈 컬럼을 자동 검색·추론해 채울 수 있는 필드 후보와, 단계별 보강 워크플로를 제안해 주세요.',
  },
]

export const AI_SHEETS_FEATURE_LINES = [
  {
    id: 'auto-find',
    title: 'Auto-find companies, people, papers, products, or anything',
    titleKo: '업체·인물·논문·상품 등 필요한 대상을 자동으로 찾아 표로 정리',
  },
  {
    id: 'insights',
    title: 'Transform your existing data into powerful insights and visuals',
    titleKo: '기존 시트 데이터를 인사이트와 시각화 아이디어로 변환',
  },
  {
    id: 'work-freely',
    title: 'Work with your data freely — auto-search, analyze, enrich',
    titleKo: '자유롭게 검색·분석·보강 — 시트와 대화하듯 업무 처리',
  },
] as const
