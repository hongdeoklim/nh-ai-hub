export interface DlpViolation {
  isViolated: boolean;
  reason?: string;
}

/**
 * 프롬프트에 민감한 정보(주민번호, 계좌번호 등)가 포함되어 있는지 검사합니다.
 */
export function checkDlpViolation(prompt: string): DlpViolation {
  // 1. 주민등록번호 패턴 (XXXXXX-XXXXXXX)
  const ssnPattern = /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[1,2][0-9]|3[0,1])-[1-4]\d{6}\b/;
  if (ssnPattern.test(prompt)) {
    return { isViolated: true, reason: "주민등록번호가 감지되었습니다." };
  }

  // 2. 신용카드 번호 패턴 (14~16자리 연속 또는 대시 포함)
  const cardPattern = /\b(?:\d{4}[-\s]?){3}\d{2,4}\b/;
  if (cardPattern.test(prompt)) {
    return { isViolated: true, reason: "신용카드 번호가 감지되었습니다." };
  }

  // 3. 사내 기밀 키워드 (예시)
  const secretKeywords = ["프로젝트 오메가", "임원진 연봉", "대외비 매출현황"];
  for (const keyword of secretKeywords) {
    if (prompt.includes(keyword)) {
      return { isViolated: true, reason: `사내 기밀 키워드('${keyword}')가 감지되었습니다.` };
    }
  }

  return { isViolated: false };
}
