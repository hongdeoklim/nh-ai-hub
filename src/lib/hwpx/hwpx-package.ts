/**
 * 한글 문서(HWPX · OWPML, KS X 6101) 패키지 조립.
 *
 * 머리(header.xml)·구역 설정(secPr)·패키지 파일들의 모양은 nh-travel 의 `docxToHwpx`
 * (이 PC 의 한글 2024 로 직접 저장한 hwpx 에서 떠 온 구조)를 그대로 따른다.
 * 줄 배치 캐시(linesegarray)는 넣지 않는다 — 한글이 열 때 다시 짠다.
 *
 * 단위: HWPUNIT = 1/7200 인치 (1mm ≈ 283.465), 글자 크기 height = 1/100 pt
 */
import JSZip from 'jszip'

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'

export const XMLNS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"'

const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'] as const
const LANG_ATTRS = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'] as const

/** mm → HWPUNIT */
export const mm = (v: number) => Math.round(v * 283.465)

/** XML 텍스트/속성 이스케이프 + XML 1.0 에서 금지된 제어 문자 제거 */
export function esc(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- XML 1.0 금지 문자 제거가 목적
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ───────────────────────── 스타일 표 (같은 모양은 한 번만) ───────────────────────── */

export type BorderSide = { type: 'NONE' | 'SOLID'; width: string; color: string }

export type BorderFill = {
  left: BorderSide
  right: BorderSide
  top: BorderSide
  bottom: BorderSide
  fill: string | null
}

export type CharShape = {
  font: number
  /** 1/100 pt */
  height: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

export type ParaShape = {
  align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY'
  /** 문단 위·아래 간격 (HWPUNIT) */
  prev: number
  next: number
  left: number
  right: number
  /** 첫 줄 들여쓰기 (음수 = 내어쓰기) */
  indent: number
  lsType: 'PERCENT' | 'FIXED'
  lsValue: number
  keepNext: boolean
  borderFill: number
  borderOffsetLeft: number
}

class Registry<T> {
  private map = new Map<string, number>()
  private base: number
  readonly list: T[] = []
  constructor(base = 0) {
    this.base = base
  }
  id(item: T): number {
    const key = JSON.stringify(item)
    const hit = this.map.get(key)
    if (hit !== undefined) return hit
    const id = this.list.length + this.base
    this.map.set(key, id)
    this.list.push(item)
    return id
  }
}

export const NO_BORDER: BorderSide = { type: 'NONE', width: '0.1 mm', color: '#FFFFFF' }

export class HwpxStyles {
  readonly fonts: string[] = []
  /** borderFill id 는 1부터 — 1 은 «선 없음»(쪽·글자·문단 기본) */
  readonly borderFills = new Registry<BorderFill>(1)
  readonly charPrs = new Registry<CharShape>(0)
  readonly paraPrs = new Registry<ParaShape>(0)
  readonly defaultFont: string

  constructor(defaultFont = '맑은 고딕') {
    this.defaultFont = defaultFont
    this.fontId(defaultFont)
    this.borderFills.id({ left: NO_BORDER, right: NO_BORDER, top: NO_BORDER, bottom: NO_BORDER, fill: null })
  }

  fontId(face?: string | null): number {
    const f = String(face || this.defaultFont).trim() || this.defaultFont
    let i = this.fonts.indexOf(f)
    if (i < 0) {
      this.fonts.push(f)
      i = this.fonts.length - 1
    }
    return i
  }

  char(c: Partial<CharShape> = {}): number {
    return this.charPrs.id({
      font: c.font ?? 0,
      height: c.height ?? 1000,
      color: c.color ?? '#000000',
      bold: c.bold ?? false,
      italic: c.italic ?? false,
      underline: c.underline ?? false,
      strike: c.strike ?? false,
    })
  }

  para(p: Partial<ParaShape> = {}): number {
    return this.paraPrs.id({
      align: p.align ?? 'JUSTIFY',
      prev: p.prev ?? 0,
      next: p.next ?? 0,
      left: p.left ?? 0,
      right: p.right ?? 0,
      indent: p.indent ?? 0,
      lsType: p.lsType ?? 'PERCENT',
      lsValue: p.lsValue ?? 160,
      keepNext: p.keepNext ?? false,
      borderFill: p.borderFill ?? 1,
      borderOffsetLeft: p.borderOffsetLeft ?? 0,
    })
  }

  borderFill(b: BorderFill): number {
    return this.borderFills.id(b)
  }
}

function charPrXml(c: CharShape, id: number): string {
  const refs = LANG_ATTRS.map((l) => `${l}="${c.font}"`).join(' ')
  const same = (v: number) => LANG_ATTRS.map((l) => `${l}="${v}"`).join(' ')
  return (
    `<hh:charPr id="${id}" height="${c.height}" textColor="${c.color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
    `<hh:fontRef ${refs}/><hh:ratio ${same(100)}/><hh:spacing ${same(0)}/><hh:relSz ${same(100)}/><hh:offset ${same(0)}/>` +
    `${c.italic ? '<hh:italic/>' : ''}${c.bold ? '<hh:bold/>' : ''}` +
    `<hh:underline type="${c.underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="${c.underline ? c.color : '#000000'}"/>` +
    `<hh:strikeout shape="${c.strike ? 'SOLID' : 'NONE'}" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/>` +
    '</hh:charPr>'
  )
}

function paraPrXml(p: ParaShape, id: number): string {
  const margin = `<hh:margin><hc:intent value="${p.indent}" unit="HWPUNIT"/><hc:left value="${p.left}" unit="HWPUNIT"/><hc:right value="${p.right}" unit="HWPUNIT"/><hc:prev value="${p.prev}" unit="HWPUNIT"/><hc:next value="${p.next}" unit="HWPUNIT"/></hh:margin>`
  const ls = `<hh:lineSpacing type="${p.lsType}" value="${p.lsValue}" unit="HWPUNIT"/>`
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0" textDir="AUTO">` +
    `<hh:align horizontal="${p.align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="${p.keepNext ? 1 : 0}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
    `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}${ls}</hp:case><hp:default>${margin}${ls}</hp:default></hp:switch>` +
    `<hh:border borderFillIDRef="${p.borderFill}" offsetLeft="${p.borderOffsetLeft}" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
    '</hh:paraPr>'
  )
}

function borderFillXml(b: BorderFill, id: number): string {
  const side = (tag: string, s: BorderSide) => `<hh:${tag} type="${s.type}" width="${s.width}" color="${s.color}"/>`
  return (
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
    side('leftBorder', b.left) +
    side('rightBorder', b.right) +
    side('topBorder', b.top) +
    side('bottomBorder', b.bottom) +
    '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>' +
    (b.fill ? `<hc:fillBrush><hc:winBrush faceColor="${b.fill}" hatchColor="#000000" alpha="0"/></hc:fillBrush>` : '') +
    '</hh:borderFill>'
  )
}

export function headerXml(st: HwpxStyles): string {
  const fontXml = st.fonts
    .map(
      (f, i) =>
        `<hh:font id="${i}" face="${esc(f)}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="5" proportion="3" contrast="2" strokeVariation="0" armStyle="0" letterform="2" midline="0" xHeight="4"/></hh:font>`,
    )
    .join('')
  const faces = LANGS.map((l) => `<hh:fontface lang="${l}" fontCnt="${st.fonts.length}">${fontXml}</hh:fontface>`).join('')
  const bfs = st.borderFills.list.map((b, i) => borderFillXml(b, i + 1)).join('')
  const cps = st.charPrs.list.map((c, i) => charPrXml(c, i)).join('')
  const pps = st.paraPrs.list.map((p, i) => paraPrXml(p, i)).join('')
  return (
    `${XML_HEAD}<hh:head ${XMLNS} version="1.5" secCnt="1">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>' +
    '<hh:refList>' +
    `<hh:fontfaces itemCnt="${LANGS.length}">${faces}</hh:fontfaces>` +
    `<hh:borderFills itemCnt="${st.borderFills.list.length}">${bfs}</hh:borderFills>` +
    `<hh:charProperties itemCnt="${st.charPrs.list.length}">${cps}</hh:charProperties>` +
    '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
    `<hh:paraProperties itemCnt="${st.paraPrs.list.length}">${pps}</hh:paraProperties>` +
    '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
    '</hh:refList>' +
    '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
    '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>' +
    '<hh:trackchageConfig flags="56"/>' +
    '</hh:head>'
  )
}

/* ───────────────────────── 쪽 설정 ───────────────────────── */

export type PageSetup = {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  header: number
  footer: number
}

/** A4 세로 · 한글 기본 여백 (위 20 · 아래 15 · 좌우 30 · 머리말/꼬리말 15 mm) */
export const A4_PAGE: PageSetup = {
  width: 59528,
  height: 84188,
  left: mm(30),
  right: mm(30),
  top: mm(20),
  bottom: mm(15),
  header: mm(15),
  footer: mm(15),
}

export function secPrXml(pg: PageSetup): string {
  return (
    '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>' +
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>' +
    `<hp:pagePr landscape="WIDELY" width="${pg.width}" height="${pg.height}" gutterType="LEFT_ONLY">` +
    `<hp:margin header="${pg.header}" footer="${pg.footer}" gutter="0" left="${pg.left}" right="${pg.right}" top="${pg.top}" bottom="${pg.bottom}"/></hp:pagePr>` +
    '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>' +
    '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>' +
    ['BOTH', 'EVEN', 'ODD']
      .map(
        (t) =>
          `<hp:pageBorderFill type="${t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`,
      )
      .join('') +
    '</hp:secPr>'
  )
}

/** 쪽 번호 자동 번호 조절 (꼬리말 안에서 사용) */
export const PAGE_NUM_CTRL =
  '<hp:ctrl><hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl>'

/* ───────────────────────── 패키지 파일 ───────────────────────── */

function contentHpf(title: string, creator: string): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  return (
    `${XML_HEAD}<opf:package ${XMLNS} version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${esc(title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">${esc(creator)}</opf:meta>` +
    `<opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta></opf:metadata>` +
    '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
    '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>' +
    '</opf:package>'
  )
}

const CONTAINER_XML = `${XML_HEAD}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`
const CONTAINER_RDF = `${XML_HEAD}<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`
const MANIFEST_XML = `${XML_HEAD}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`
const VERSION_XML = `${XML_HEAD}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="13, 0, 0, 0 WIN32LEWindows_10"/>`
const SETTINGS_XML = `${XML_HEAD}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`

export type HwpxPackageInput = {
  title: string
  creator?: string
  styles: HwpxStyles
  /** <hp:p> 문단 XML 목록 (첫 문단 앞에 구역 설정이 자동으로 붙는다) */
  paragraphs: string[]
  /** 첫 문단 앞머리에 덧붙일 조절(머리말·꼬리말 등) */
  leadControls?: string
  page?: PageSetup
  /** 탐색기 미리보기용 평문 */
  previewText: string
}

/** 문단들을 구역(section0.xml) 으로 감싸고 hwpx(zip) 바이트를 만든다 */
export async function buildHwpxPackage(input: HwpxPackageInput): Promise<Uint8Array> {
  const page = input.page ?? A4_PAGE
  const paras = input.paragraphs.length
    ? [...input.paragraphs]
    : ['<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"/></hp:p>']

  // 구역 설정·단 설정·머리말/꼬리말은 첫 문단 맨 앞 조각에 싣는다(한글이 저장하는 꼴)
  const lead =
    `<hp:run charPrIDRef="0">${secPrXml(page)}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>` +
    (input.leadControls ? `<hp:run charPrIDRef="0">${input.leadControls}</hp:run>` : '')
  paras[0] = paras[0].replace(/^(<hp:p [^>]*>)/, `$1${lead}`)
  const section = `${XML_HEAD}<hs:sec ${XMLNS}>${paras.join('')}</hs:sec>`

  const zip = new JSZip()
  // mimetype 은 맨 앞·무압축이어야 한다(한글이 이것으로 파일 종류를 안다)
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' })
  zip.file('version.xml', VERSION_XML)
  zip.file('Contents/header.xml', headerXml(input.styles))
  zip.file('Contents/section0.xml', section)
  zip.file('Contents/content.hpf', contentHpf(input.title, input.creator ?? 'NH-AX-HUB'))
  zip.file('settings.xml', SETTINGS_XML)
  zip.file('Preview/PrvText.txt', input.previewText.replace(/\n{3,}/g, '\n\n').slice(0, 1000))
  zip.file('META-INF/container.xml', CONTAINER_XML)
  zip.file('META-INF/container.rdf', CONTAINER_RDF)
  zip.file('META-INF/manifest.xml', MANIFEST_XML)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
