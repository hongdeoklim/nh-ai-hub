/**
 * 마크다운(채팅 답변·보고서 본문) → 한글 문서(.hwpx)
 *
 * 지원: 제목(#~######) · 문단 · 굵게/기울임/취소선/인라인 코드/링크 · 줄바꿈 ·
 *       글머리/번호 목록(중첩·체크박스) · 인용 · 코드 블록 · 표(GFM, 정렬) · 구분선
 * 이미지는 내려받아 넣지 않고 «[그림: 설명]» 으로 남긴다.
 */
import type {
  BlockContent,
  Code,
  Heading,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table,
} from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import {
  A4_PAGE,
  buildHwpxPackage,
  esc,
  HwpxStyles,
  mm,
  NO_BORDER,
  PAGE_NUM_CTRL,
  type BorderSide,
  type CharShape,
  type ParaShape,
} from './hwpx-package'

export type MarkdownToHwpxOptions = {
  /** 문서 제목 — 첫 줄 큰 제목과 파일 속성에 쓰인다 */
  title?: string
  /** 제목 아래 작은 글씨 (예: "NH-AX-HUB · 2026-10-15") */
  subtitle?: string
  /** 본문 첫 줄이 이미 같은 제목(# …)이면 제목 줄을 생략 */
  skipTitleIfDuplicate?: boolean
  /** 꼬리말 쪽 번호 (기본 true) */
  pageNumbers?: boolean
}

const TEXT_WIDTH = A4_PAGE.width - A4_PAGE.left - A4_PAGE.right

const COLOR = {
  text: '#111111',
  heading: '#111827',
  muted: '#6B7280',
  link: '#1757B8',
  quote: '#4B5563',
  rule: '#9CA3AF',
  code: '#1F2937',
  codeFill: '#F3F4F6',
  headFill: '#EEF2EE',
}

const HEADING_SIZE: Record<number, number> = { 1: 1500, 2: 1300, 3: 1150, 4: 1050, 5: 1000, 6: 1000 }
const LIST_STEP = mm(5)
const HANG = mm(4)

type InlineStyle = { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean; link?: boolean }

type Ctx = {
  st: HwpxStyles
  text: string[]
  seq: number
  codeFont: number
}

const line = (color: string, width = '0.12 mm'): BorderSide => ({ type: 'SOLID', width, color })

/* ───────────────────────── 글자 조각 → <hp:run> ───────────────────────── */

class RunBuffer {
  private runs: string[] = []
  private cur: { cp: number; xml: string } | null = null
  private ctx: Ctx
  constructor(ctx: Ctx) {
    this.ctx = ctx
  }

  push(cp: number, xml: string) {
    if (this.cur && this.cur.cp === cp) {
      this.cur.xml += xml
      return
    }
    this.flush()
    this.cur = { cp, xml }
  }

  text(cp: number, value: string) {
    if (!value) return
    this.ctx.text.push(value)
    this.push(cp, esc(value))
  }

  lineBreak(cp: number) {
    this.ctx.text.push('\n')
    this.push(cp, '<hp:lineBreak/>')
  }

  private flush() {
    if (this.cur) this.runs.push(`<hp:run charPrIDRef="${this.cur.cp}"><hp:t>${this.cur.xml}</hp:t></hp:run>`)
    this.cur = null
  }

  isEmpty() {
    return !this.cur && this.runs.length === 0
  }

  done(fallbackCp: number): string {
    this.flush()
    return this.runs.length ? this.runs.join('') : `<hp:run charPrIDRef="${fallbackCp}"/>`
  }
}

function charFor(ctx: Ctx, base: Partial<CharShape>, s: InlineStyle): number {
  return ctx.st.char({
    ...base,
    bold: base.bold || s.bold,
    italic: base.italic || s.italic,
    strike: s.strike,
    underline: s.link,
    color: s.link ? COLOR.link : s.code ? COLOR.code : base.color ?? COLOR.text,
    font: s.code ? ctx.codeFont : base.font ?? 0,
    height: s.code ? Math.round((base.height ?? 1000) * 0.92) : base.height,
  })
}

function phrasing(ctx: Ctx, buf: RunBuffer, nodes: PhrasingContent[], base: Partial<CharShape>, s: InlineStyle = {}) {
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        buf.text(charFor(ctx, base, s), n.value.replace(/\r?\n/g, ' '))
        break
      case 'strong':
        phrasing(ctx, buf, n.children, base, { ...s, bold: true })
        break
      case 'emphasis':
        phrasing(ctx, buf, n.children, base, { ...s, italic: true })
        break
      case 'delete':
        phrasing(ctx, buf, n.children, base, { ...s, strike: true })
        break
      case 'inlineCode':
        buf.text(charFor(ctx, base, { ...s, code: true }), n.value)
        break
      case 'break':
        buf.lineBreak(charFor(ctx, base, s))
        break
      case 'link': {
        const before = ctx.text.length
        phrasing(ctx, buf, n.children, base, { ...s, link: true })
        const label = ctx.text.slice(before).join('')
        if (n.url && label.trim() !== n.url) buf.text(charFor(ctx, base, { ...s, link: false }), ` (${n.url})`)
        break
      }
      case 'image':
        buf.text(charFor(ctx, base, { ...s, italic: true }), `[그림: ${n.alt || n.url}]`)
        break
      case 'html':
        buf.text(charFor(ctx, base, s), n.value.replace(/<[^>]+>/g, ''))
        break
      default:
        if ('children' in n && Array.isArray(n.children)) {
          phrasing(ctx, buf, n.children as PhrasingContent[], base, s)
        } else if ('value' in n && typeof n.value === 'string') {
          buf.text(charFor(ctx, base, s), n.value)
        }
    }
  }
}

function paraXml(ctx: Ctx, para: Partial<ParaShape>, runs: string): string {
  ctx.text.push('\n')
  return `<hp:p id="0" paraPrIDRef="${ctx.st.para(para)}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runs}</hp:p>`
}

/* ───────────────────────── 블록 ───────────────────────── */

type BlockOpts = { left: number; para?: Partial<ParaShape>; char?: Partial<CharShape> }

const BODY_PARA: Partial<ParaShape> = { align: 'JUSTIFY', lsValue: 160, next: mm(1.5) }

/**
 * 문단 테두리 아래로 띄우는 빈 문단 (고정 높이).
 * 한글은 문단 테두리를 «아래 간격(next)» 바깥에 긋기 때문에, 밑줄 바로 다음 문단 글자가 선에 붙는다.
 */
function spacerXml(ctx: Ctx, height: number, keepNext = false): string {
  const pp = ctx.st.para({ align: 'LEFT', lsType: 'FIXED', lsValue: height, keepNext })
  return `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${ctx.st.char({ height: 100 })}"/></hp:p>`
}

function headingXml(ctx: Ctx, h: Heading, left: number): string[] {
  const buf = new RunBuffer(ctx)
  const base: Partial<CharShape> = { height: HEADING_SIZE[h.depth] ?? 1000, bold: true, color: COLOR.heading }
  phrasing(ctx, buf, h.children, base)
  const top = h.depth === 1 ? mm(5) : h.depth === 2 ? mm(4) : mm(2.5)
  const ruled = h.depth <= 2
  const para: Partial<ParaShape> = {
    align: 'LEFT',
    left,
    prev: top,
    next: ruled ? mm(0.8) : mm(1.5),
    keepNext: true,
    lsValue: 150,
  }
  // 큰 제목은 아래 밑줄로 구획 — 선 아래는 빈 문단으로 띄운다
  if (ruled) {
    para.borderFill = ctx.st.borderFill({
      left: NO_BORDER,
      right: NO_BORDER,
      top: NO_BORDER,
      bottom: line(h.depth === 1 ? COLOR.heading : COLOR.rule, h.depth === 1 ? '0.4 mm' : '0.12 mm'),
      fill: null,
    })
  }
  const out = [paraXml(ctx, para, buf.done(ctx.st.char(base)))]
  if (ruled) out.push(spacerXml(ctx, mm(2), true))
  return out
}

function codeXml(ctx: Ctx, c: Code, left: number): string {
  const cp = ctx.st.char({ font: ctx.codeFont, height: 900, color: COLOR.code })
  const buf = new RunBuffer(ctx)
  const lines = c.value.replace(/\t/g, '    ').split(/\r?\n/)
  lines.forEach((ln, i) => {
    if (i > 0) buf.lineBreak(cp)
    // 앞 공백 유지 (한글은 연속 공백을 그대로 둔다)
    buf.text(cp, ln.length ? ln : ' ')
  })
  const bf = ctx.st.borderFill({
    left: line(COLOR.rule),
    right: line(COLOR.rule),
    top: line(COLOR.rule),
    bottom: line(COLOR.rule),
    fill: COLOR.codeFill,
  })
  return paraXml(
    ctx,
    { align: 'LEFT', left: left + mm(1.5), right: mm(1.5), prev: mm(1), next: mm(2.5), lsValue: 130, borderFill: bf, borderOffsetLeft: mm(1.5) },
    buf.done(cp),
  )
}

function thematicBreakXml(ctx: Ctx, left: number): string[] {
  const bf = ctx.st.borderFill({ left: NO_BORDER, right: NO_BORDER, top: NO_BORDER, bottom: line(COLOR.rule), fill: null })
  return [
    paraXml(ctx, { align: 'LEFT', left, lsType: 'FIXED', lsValue: mm(2), borderFill: bf }, `<hp:run charPrIDRef="${ctx.st.char({ height: 100 })}"/>`),
    spacerXml(ctx, mm(3)),
  ]
}

function listXml(ctx: Ctx, list: List, left: number, depth: number): string[] {
  const out: string[] = []
  const start = typeof list.start === 'number' ? list.start : 1
  list.children.forEach((item: ListItem, idx) => {
    const marker =
      typeof item.checked === 'boolean'
        ? item.checked
          ? '☑'
          : '☐'
        : list.ordered
          ? `${start + idx}.`
          : depth === 0
            ? '•'
            : depth === 1
              ? '◦'
              : '▪'
    const itemLeft = left + LIST_STEP
    let first = true
    for (const child of item.children) {
      if (child.type === 'paragraph' && first) {
        const buf = new RunBuffer(ctx)
        const base: Partial<CharShape> = { height: 1000, color: COLOR.text }
        buf.text(ctx.st.char(base), `${marker} `)
        phrasing(ctx, buf, child.children, base)
        out.push(
          paraXml(ctx, { align: 'JUSTIFY', left: itemLeft, indent: -HANG, next: mm(0.8), lsValue: 160 }, buf.done(ctx.st.char(base))),
        )
        first = false
        continue
      }
      first = false
      out.push(...blockXml(ctx, child, { left: itemLeft }, depth + 1))
    }
    if (first) {
      // 빈 항목
      out.push(paraXml(ctx, { align: 'LEFT', left: itemLeft, indent: -HANG }, `<hp:run charPrIDRef="${ctx.st.char({})}"><hp:t>${esc(marker)}</hp:t></hp:run>`))
    }
  })
  // 목록 끝 여백
  return out
}

function cellText(cell: Table['children'][number]['children'][number]): string {
  const walk = (nodes: PhrasingContent[]): string =>
    nodes
      .map((n) => ('value' in n && typeof n.value === 'string' ? n.value : 'children' in n ? walk(n.children as PhrasingContent[]) : ''))
      .join('')
  return walk(cell.children)
}

function tableXml(ctx: Ctx, t: Table, left: number): string {
  const rows = t.children
  const colCnt = Math.max(1, ...rows.map((r) => r.children.length))
  const width = Math.max(mm(40), TEXT_WIDTH - left)

  // 열 너비 — 내용 길이에 비례(한 열이 너무 좁거나 넓지 않게)
  const weights = Array.from({ length: colCnt }, (_, c) => {
    const longest = Math.max(1, ...rows.map((r) => (r.children[c] ? cellText(r.children[c]).length : 0)))
    return Math.min(40, Math.max(4, longest))
  })
  const totalW = weights.reduce((a, b) => a + b, 0)
  const colW = weights.map((w) => Math.round((width * w) / totalW))
  colW[colW.length - 1] += width - colW.reduce((a, b) => a + b, 0)

  const border = line(COLOR.rule)
  const bodyBf = ctx.st.borderFill({ left: border, right: border, top: border, bottom: border, fill: null })
  const headBf = ctx.st.borderFill({ left: border, right: border, top: border, bottom: border, fill: COLOR.headFill })
  const ROW_H = 282
  const mar = { l: mm(1.8), r: mm(1.8), t: mm(0.8), b: mm(0.8) }

  const rowXml = rows.map((row, ri) => {
    const isHead = ri === 0
    const cells = Array.from({ length: colCnt }, (_, ci) => {
      const cell = row.children[ci]
      const align = t.align?.[ci]
      const buf = new RunBuffer(ctx)
      const base: Partial<CharShape> = { height: 950, bold: isHead, color: COLOR.text }
      if (cell) phrasing(ctx, buf, cell.children, base)
      ctx.text.push('\t')
      const pAlign: ParaShape['align'] = isHead ? 'CENTER' : align === 'center' ? 'CENTER' : align === 'right' ? 'RIGHT' : 'LEFT'
      const p = `<hp:p id="0" paraPrIDRef="${ctx.st.para({ align: pAlign, lsValue: 130 })}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${buf.done(ctx.st.char(base))}</hp:p>`
      return (
        `<hp:tc name="" header="${isHead ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${isHead ? headBf : bodyBf}">` +
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">' +
        p +
        '</hp:subList>' +
        `<hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
        `<hp:cellSz width="${colW[ci]}" height="${ROW_H}"/><hp:cellMargin left="${mar.l}" right="${mar.r}" top="${mar.t}" bottom="${mar.b}"/>` +
        '</hp:tc>'
      )
    })
    ctx.text.push('\n')
    return `<hp:tr>${cells.join('')}</hp:tr>`
  })

  ctx.seq += 1
  const id = ctx.seq
  const tbl =
    `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="1" noAdjust="0">` +
    `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${ROW_H * rows.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="${left}"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="${mm(2.5)}"/>` +
    `<hp:inMargin left="${mar.l}" right="${mar.r}" top="${mar.t}" bottom="${mar.b}"/>` +
    rowXml.join('') +
    '</hp:tbl>'

  // 표는 받침 문단(줄 높이 1pt 고정)의 조각에 싣는다 — 표 아래 빈 줄이 거의 안 남는다
  const anchor = ctx.st.para({ align: 'LEFT', lsType: 'FIXED', lsValue: 100, next: 0 })
  const tiny = ctx.st.char({ height: 100 })
  return `<hp:p id="0" paraPrIDRef="${anchor}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${tiny}">${tbl}<hp:t/></hp:run></hp:p>`
}

function blockXml(ctx: Ctx, node: RootContent | BlockContent, opts: BlockOpts, depth = 0): string[] {
  const left = opts.left
  switch (node.type) {
    case 'heading':
      return headingXml(ctx, node, left)
    case 'paragraph': {
      const buf = new RunBuffer(ctx)
      const base: Partial<CharShape> = { height: 1000, color: COLOR.text, ...opts.char }
      phrasing(ctx, buf, node.children, base)
      if (buf.isEmpty()) return []
      return [paraXml(ctx, { ...BODY_PARA, left, ...opts.para }, buf.done(ctx.st.char(base)))]
    }
    case 'list':
      return listXml(ctx, node, left, depth)
    case 'blockquote': {
      const bf = ctx.st.borderFill({ left: line(COLOR.rule, '0.4 mm'), right: NO_BORDER, top: NO_BORDER, bottom: NO_BORDER, fill: null })
      return node.children.flatMap((child) =>
        blockXml(ctx, child, { left: left + mm(4), para: { borderFill: bf, borderOffsetLeft: mm(2) }, char: { color: COLOR.quote } }, depth),
      )
    }
    case 'code':
      return [codeXml(ctx, node, left)]
    case 'table':
      return [tableXml(ctx, node, left), spacerXml(ctx, mm(2.5))]
    case 'thematicBreak':
      return thematicBreakXml(ctx, left)
    case 'html': {
      const text = node.value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
      if (!text) return []
      return blockXml(ctx, { type: 'paragraph', children: [{ type: 'text', value: text }] }, opts, depth)
    }
    default:
      return []
  }
}

/** 문서 제목(가운데 큰 글씨) */
function titleXml(ctx: Ctx, title: string): string {
  const tcp = ctx.st.char({ height: 1800, bold: true, color: COLOR.heading })
  ctx.text.push(title)
  return paraXml(ctx, { align: 'CENTER', next: mm(2), lsValue: 150 }, `<hp:run charPrIDRef="${tcp}"><hp:t>${esc(title)}</hp:t></hp:run>`)
}

/** 작성 정보 줄(오른쪽 작은 회색 글씨) */
function subtitleXml(ctx: Ctx, subtitle: string): string {
  const scp = ctx.st.char({ height: 900, color: COLOR.muted })
  ctx.text.push(subtitle)
  return paraXml(ctx, { align: 'RIGHT', next: mm(4) }, `<hp:run charPrIDRef="${scp}"><hp:t>${esc(subtitle)}</hp:t></hp:run>`)
}

function footerCtrl(ctx: Ctx): string {
  const cp = ctx.st.char({ height: 900, color: COLOR.muted })
  const pp = ctx.st.para({ align: 'CENTER', lsValue: 100 })
  ctx.seq += 1
  return (
    `<hp:ctrl><hp:footer id="${ctx.seq}" applyPageType="BOTH">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BOTTOM" linkListIDRef="0" linkListNextIDRef="0" textWidth="${TEXT_WIDTH}" textHeight="${A4_PAGE.footer}" hasTextRef="0" hasNumRef="0">` +
    `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>- </hp:t>${PAGE_NUM_CTRL}<hp:t> -</hp:t></hp:run></hp:p>` +
    '</hp:subList></hp:footer></hp:ctrl>'
  )
}

export function parseMarkdown(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root
}

/** 마크다운 → hwpx 바이트 */
export async function markdownToHwpx(markdown: string, options: MarkdownToHwpxOptions = {}): Promise<Uint8Array> {
  const st = new HwpxStyles('맑은 고딕')
  const ctx: Ctx = { st, text: [], seq: 1000, codeFont: st.fontId('굴림체') }
  // 기본 글자(0)·기본 문단(0) — 바탕글 스타일이 가리킨다
  st.char({ height: 1000, color: COLOR.text })
  st.para(BODY_PARA)

  const tree = parseMarkdown(markdown)
  const title = options.title?.trim()
  const firstNode = tree.children[0]
  const firstIsSameHeading =
    firstNode?.type === 'heading' &&
    firstNode.depth === 1 &&
    !!title &&
    firstNode.children.map((c) => ('value' in c ? c.value : '')).join('').trim() === title

  const paragraphs: string[] = []
  let rest = tree.children
  if (firstNode && firstIsSameHeading && options.skipTitleIfDuplicate !== false) {
    // 본문 첫 # 이 곧 제목 — 그 제목 바로 아래에 작성 정보 줄
    paragraphs.push(...blockXml(ctx, firstNode, { left: 0 }))
    if (options.subtitle) paragraphs.push(subtitleXml(ctx, options.subtitle))
    rest = tree.children.slice(1)
  } else {
    if (title) paragraphs.push(titleXml(ctx, title))
    if (options.subtitle) paragraphs.push(subtitleXml(ctx, options.subtitle))
  }
  for (const node of rest) paragraphs.push(...blockXml(ctx, node, { left: 0 }))

  return buildHwpxPackage({
    title: title || '문서',
    styles: st,
    paragraphs,
    leadControls: options.pageNumbers === false ? undefined : footerCtrl(ctx),
    previewText: ctx.text.join(''),
  })
}
