export type ChatCitationSource = {
  /** 1-based marker index ([1] → index 1) */
  index: number
  title: string
  snippet?: string
  sourceType?: 'work_case' | 'document'
  id?: string
}
