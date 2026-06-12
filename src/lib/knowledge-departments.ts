import { EMPLOYEE_DEPARTMENTS } from '../types/employee-org'

/** 전사 공개 문서 */
export const KNOWLEDGE_SHARED_DEPARTMENT = '공통' as const

/** 자료실 열람 권한(부서) 선택 옵션 — 프롬프트 템플릿·직원 CRUD 와 동일 목록 + 공통 */
export const KNOWLEDGE_DEPARTMENT_OPTIONS = [
  KNOWLEDGE_SHARED_DEPARTMENT,
  ...EMPLOYEE_DEPARTMENTS,
] as const

export type KnowledgeDepartmentOption = (typeof KNOWLEDGE_DEPARTMENT_OPTIONS)[number]

export function isKnowledgeDepartmentOption(value: string): value is KnowledgeDepartmentOption {
  return (KNOWLEDGE_DEPARTMENT_OPTIONS as readonly string[]).includes(value)
}

export function knowledgeDepartmentLabel(dept: string): string {
  if (dept === KNOWLEDGE_SHARED_DEPARTMENT) return '공통(전사 공개)'
  return dept
}
