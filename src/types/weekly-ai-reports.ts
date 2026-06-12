export type WeeklyKeywordEntry = {
  rank: number
  keyword: string
}

export type WeeklyAiReportRow = {
  id: string
  report_date: string
  period_start: string
  period_end: string
  top_keywords: WeeklyKeywordEntry[] | string[]
  summary: string
  generated_by_ai: boolean
  created_at: string
}

export function normalizeTopKeywords(
  raw: WeeklyAiReportRow["top_keywords"],
): WeeklyKeywordEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => {
      if (typeof item === "string") {
        return { rank: index + 1, keyword: item }
      }
      if (item && typeof item === "object" && "keyword" in item) {
        const kw = String((item as WeeklyKeywordEntry).keyword ?? "").trim()
        const rank = Number((item as WeeklyKeywordEntry).rank) || index + 1
        return kw ? { rank, keyword: kw } : null
      }
      return null
    })
    .filter((x): x is WeeklyKeywordEntry => x !== null)
    .sort((a, b) => a.rank - b.rank)
}
