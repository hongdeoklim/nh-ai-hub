import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import convert from 'xml-js'

import { markdownToHwpx } from '../hwpx/markdown-to-hwpx'
import { safeHwpxFilename } from '../hwpx/save-hwpx'

const SAMPLE = `# 주간 업무 보고

## 1. 개요
이번 주에는 **AI 허브 개편**을 진행했습니다. *디자인 토큰*과 \`useDialogs\` 를 도입했고, [사내 자료실](https://hub.example/reference)과 연동했습니다.

## 2. 진행 현황
- 앱 셸 v2 완료
  - PC 레일·패널
  - 모바일 하단 탭
- [x] 루트 폰트 16px 전환
- [ ] 사용자 검수

1. 첫째
2. 둘째

| 항목 | 상태 | 비율 |
| :--- | :---: | ---: |
| 셸 | 완료 | 100% |
| 토큰 & 테마 | 진행 | 80% |

> 참고: 실제 데이터 검수는 로그인 후 진행합니다.

\`\`\`ts
const a = 1 < 2 && "x"
\`\`\`

---

끝.
`

async function unzip(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files)
  const read = (p: string) => zip.file(p)!.async('string')
  return { zip, names, read }
}

describe('markdownToHwpx', () => {
  it('OWPML 패키지 구성 — mimetype 이 첫 항목·무압축이고 필수 파일이 모두 있다', async () => {
    const bytes = await markdownToHwpx(SAMPLE, { title: '주간 업무 보고', subtitle: 'NH-AX-HUB · 2026-10-15' })
    // zip 첫 로컬 헤더의 파일 이름이 mimetype 이어야 한다 (오프셋 30부터 이름)
    const nameLen = bytes[26] | (bytes[27] << 8)
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLen))).toBe('mimetype')
    expect(bytes[8] | (bytes[9] << 8)).toBe(0) // compression method = STORE

    const { names, read } = await unzip(bytes)
    for (const p of [
      'mimetype',
      'version.xml',
      'Contents/header.xml',
      'Contents/section0.xml',
      'Contents/content.hpf',
      'settings.xml',
      'Preview/PrvText.txt',
      'META-INF/container.xml',
      'META-INF/manifest.xml',
    ]) {
      expect(names).toContain(p)
    }
    expect(await read('mimetype')).toBe('application/hwp+zip')
  })

  it('모든 XML 이 올바른 형식이고 본문·표·목록이 들어간다', async () => {
    const bytes = await markdownToHwpx(SAMPLE, { title: '주간 업무 보고' })
    const { names, read } = await unzip(bytes)
    for (const p of names.filter((n) => n.endsWith('.xml') || n.endsWith('.hpf') || n.endsWith('.rdf'))) {
      const xml = await read(p)
      expect(() => convert.xml2js(xml), p).not.toThrow()
    }

    const section = await read('Contents/section0.xml')
    expect(section).toContain('<hp:secPr')
    expect(section).toContain('<hp:tbl ')
    expect(section).toContain('rowCnt="3" colCnt="3"')
    expect(section).toContain('AI 허브 개편')
    expect(section).toContain('• 앱 셸 v2 완료')
    expect(section).toContain('◦ PC 레일·패널')
    expect(section).toContain('☑ 루트 폰트 16px 전환')
    expect(section).toContain('2. 둘째')
    expect(section).toContain('토큰 &amp; 테마')
    expect(section).toContain('const a = 1 &lt; 2 &amp;&amp; &quot;x&quot;')
    expect(section).toContain('(https://hub.example/reference)')
    expect(section).toContain('<hp:footer')
    // 제목이 본문 첫 # 과 같으면 중복 제목 줄을 만들지 않는다
    expect(section.match(/주간 업무 보고/g)?.length).toBe(1)

    const header = await read('Contents/header.xml')
    const charCnt = Number(/<hh:charProperties itemCnt="(\d+)"/.exec(header)?.[1])
    const paraCnt = Number(/<hh:paraProperties itemCnt="(\d+)"/.exec(header)?.[1])
    // 본문이 참조하는 글자/문단 모양 id 가 머리 표 범위 안에 있다
    const maxChar = Math.max(...[...section.matchAll(/charPrIDRef="(\d+)"/g)].map((m) => Number(m[1])))
    const maxPara = Math.max(...[...section.matchAll(/paraPrIDRef="(\d+)"/g)].map((m) => Number(m[1])))
    expect(maxChar).toBeLessThan(charCnt)
    expect(maxPara).toBeLessThan(paraCnt)
    expect((await read('Preview/PrvText.txt')).length).toBeGreaterThan(10)
  })

  it('빈 문서도 열 수 있는 최소 구조를 만든다', async () => {
    const { read } = await unzip(await markdownToHwpx('', { pageNumbers: false }))
    const section = await read('Contents/section0.xml')
    expect(section).toContain('<hp:secPr')
    expect(section).not.toContain('<hp:footer')
  })

  it('파일 이름 정리', () => {
    expect(safeHwpxFilename('보고서: 1/2 "초안"')).toBe('보고서 1 2 초안 .hwpx'.replace(' .hwpx', '.hwpx'))
    expect(safeHwpxFilename('')).toBe('문서.hwpx')
  })
})
