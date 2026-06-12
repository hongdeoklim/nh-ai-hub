/** 직원 등록·수정 시 선택 가능한 부서 */
export const EMPLOYEE_DEPARTMENTS = [
  '교류사업부',
  '국내여행사업부',
  '교류마케팅사업단',
  '미디어교육부',
  '준법지원단',
  '전문건설부',
  '자산개발부',
  '품질지원부',
  '시설마케팅부',
  '공사관리부',
  '안전보건지원실',
  '경영지원부',
  '경영전략부',
  '공무지원부',
  '서울인천지사',
  '경기남부지사',
  '경기북부지사',
  '충북지사',
  '대전충남세종지사',
  '전북지사',
  '광주전남지사',
  '대구경북지사',
  '경남지사',
  '부산울산지사',
  '제주지사',
] as const

export type EmployeeDepartment = (typeof EMPLOYEE_DEPARTMENTS)[number]

/** 직원 등록·수정 시 선택 가능한 직책 */
export const EMPLOYEE_JOB_TITLES = [
  '대표이사',
  '전무이사',
  '전무',
  '감사실장',
  '상무',
  '본부장',
  '실장',
  '부장',
  '단장',
  '팀장',
  '기획역',
  '소장',
  '지사장',
  '부지사장',
  '차장',
  '과장',
  '대리',
  '계장',
  '주임',
  '사원',
] as const

export type EmployeeJobTitle = (typeof EMPLOYEE_JOB_TITLES)[number]
