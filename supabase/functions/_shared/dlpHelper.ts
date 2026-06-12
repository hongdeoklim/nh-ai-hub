/**
 * [29단계] DLP(Data Loss Prevention) 마스킹 헬퍼
 * 주민등록번호 · 여권번호 · 휴대전화 · 신용카드 패턴을 * 로 치환합니다.
 */

/** 주민등록번호: 900101-1234567 → 900101-******* */
const RRN_RE = /\b(\d{6})-(\d{7})\b/g

/** 여권번호: M12345678 → M******** (영문 1~2자 + 숫자 7~9자) */
const PASSPORT_RE = /\b([A-Z]{1,2}\d{7,9})\b/g

/** 휴대전화: 010-1234-5678 / 01012345678 / 010 1234 5678 → 010-****-**** */
const MOBILE_RE =
  /\b(010)[-\s]?(\d{3,4})[-\s]?(\d{4})\b/g

/** 신용카드: 1234-5678-1234-5678 → 1234-****-****-5678 */
const CARD_HYPHEN_RE =
  /\b(\d{4})-(\d{4})-(\d{4})-(\d{4})\b/g

/** 신용카드(연속 16자리) → 1234-****-****-5678 형식으로 마스킹 */
const CARD_PLAIN_RE = /\b(\d{4})(\d{4})(\d{4})(\d{4})\b/g

function maskResidentRegistrationNumber(text: string): string {
  return text.replace(RRN_RE, (_match, front: string) => `${front}-*******`)
}

function maskPassportNumber(text: string): string {
  return text.replace(PASSPORT_RE, (match: string) => {
    const letterPart = match.match(/^[A-Z]{1,2}/)?.[0] ?? "X"
    const starCount = Math.max(match.length - letterPart.length, 6)
    return letterPart + "*".repeat(starCount)
  })
}

function maskMobilePhone(text: string): string {
  return text.replace(MOBILE_RE, (_match, prefix: string) => `${prefix}-****-****`)
}

function maskCreditCardHyphenated(text: string): string {
  return text.replace(
    CARD_HYPHEN_RE,
    (_match, g1: string, _g2: string, _g3: string, g4: string) =>
      `${g1}-****-****-${g4}`,
  )
}

function maskCreditCardPlain(text: string): string {
  return text.replace(
    CARD_PLAIN_RE,
    (_match, g1: string, _g2: string, _g3: string, g4: string) =>
      `${g1}-****-****-${g4}`,
  )
}

/**
 * 민감 정보 패턴을 마스킹한 텍스트를 반환합니다.
 * 원본에 패턴이 없으면 입력과 동일한 문자열을 반환합니다.
 */
export function maskSensitiveText(text: string): string {
  if (!text || text.length === 0) return text

  let out = text
  out = maskResidentRegistrationNumber(out)
  out = maskPassportNumber(out)
  out = maskMobilePhone(out)
  out = maskCreditCardHyphenated(out)
  out = maskCreditCardPlain(out)
  return out
}

/** 마스킹 전후 content 가 달라졌는지 여부 */
export function contentWasMasked(original: string, masked: string): boolean {
  return original !== masked
}

export type DlpMaskStats = {
  originalLength: number
  maskedLength: number
  wasMasked: boolean
}

export function maskWithStats(text: string): DlpMaskStats & { masked: string } {
  const masked = maskSensitiveText(text)
  return {
    masked,
    originalLength: text.length,
    maskedLength: masked.length,
    wasMasked: contentWasMasked(text, masked),
  }
}
