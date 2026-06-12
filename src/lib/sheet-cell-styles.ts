export type CellStyle = {
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  numberFormat?: 'general' | 'number' | 'currency' | 'percent'
  wrapText?: boolean
  bgColor?: string
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export type CellStyleMap = Record<string, CellStyle>

export function styleKey(row: number, col: number): string {
  return `${row}:${col}`
}

export function getCellStyle(
  styles: CellStyleMap,
  row: number,
  col: number,
): CellStyle {
  return styles[styleKey(row, col)] ?? {}
}

export function applyStyleToKeys(
  styles: CellStyleMap,
  keys: string[],
  patch: Partial<CellStyle>,
): CellStyleMap {
  const next = { ...styles }
  for (const key of keys) {
    next[key] = { ...next[key], ...patch }
  }
  return next
}

export function formatDisplayValue(
  rawDisplay: string,
  style: CellStyle,
): string {
  const text = String(rawDisplay ?? '')
  if (!text || text.startsWith('#') || text.startsWith('=')) return text
  const n = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n)) return text
  switch (style.numberFormat) {
    case 'number':
      return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    case 'currency':
      return n.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      })
    case 'percent':
      return `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
    default:
      return text
  }
}

export type CellCssStyle = {
  fontFamily?: string
  fontSize?: string
  fontWeight?: number
  fontStyle?: string
  textDecoration?: string
  whiteSpace?: string
  backgroundColor?: string
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export function cssFromCellStyle(style: CellStyle): CellCssStyle {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: style.underline ? 'underline' : undefined,
    whiteSpace: style.wrapText ? 'normal' : undefined,
    backgroundColor: style.bgColor,
    textAlign: style.textAlign,
    verticalAlign: style.verticalAlign,
  }
}
