import { useCallback, useState } from 'react'
import { toast } from 'sonner'

export type HwpxSaveOptions = {
  /** 문서 제목 (첫 줄·파일 속성) */
  title: string
  /** 파일 이름 (확장자 제외, 없으면 제목) */
  filename?: string
  /** 제목 아래 작성 정보 줄 (기본: "NH-AX-HUB · 오늘 날짜") */
  subtitle?: string
}

/** 마크다운 첫 `# 제목` 을 찾아 돌려준다 (없으면 null) */
export function firstMarkdownHeading(markdown: string): string | null {
  const m = /^#{1,2}\s+(.+?)\s*#*\s*$/m.exec(markdown)
  return m ? m[1].replace(/[*_`]/g, '').trim() || null : null
}

/**
 * 마크다운 → 한글 문서(.hwpx) 저장. 변환 모듈(jszip·마크다운 파서)은 누를 때만 불러온다.
 */
export function useHwpxSave() {
  const [saving, setSaving] = useState(false)

  const save = useCallback(async (markdown: string, options: HwpxSaveOptions) => {
    if (!markdown.trim()) {
      toast.error('저장할 내용이 없습니다.')
      return
    }
    setSaving(true)
    try {
      const { saveMarkdownAsHwpx } = await import('../lib/hwpx/save-hwpx')
      await saveMarkdownAsHwpx(markdown, options)
      toast.success('한글 문서(.hwpx)로 저장했습니다.')
    } catch (e) {
      toast.error(`한글 문서로 저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [])

  return { save, saving }
}
