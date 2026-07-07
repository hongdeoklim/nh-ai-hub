import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createWorkflow,
  deleteWorkflow,
  fetchMyWorkflows,
  fetchWorkflowRuns,
  updateWorkflow,
  type StepType,
  type TriggerType,
  type WorkflowRow,
  type WorkflowRunRow,
  type WorkflowStep,
} from '../services/workflows'
import { writeWorkflowBootstrap } from '../lib/workflow-bootstrap'
import { rememberLastPrivateThread } from '../lib/private-chat-storage'

// ─── 스텝 메타 ───────────────────────────────────────────────
const STEP_META: Record<StepType, { label: string; color: string; bg: string; dot: string; icon: string; desc: string }> = {
  trigger:   { label: '시작 조건', color: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800', dot: 'bg-violet-500', icon: '🚀', desc: '워크플로우를 시작하는 조건' },
  data:      { label: '데이터 조회', color: 'text-sky-700 dark:text-sky-400',     bg: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800',             dot: 'bg-sky-500',    icon: '📥', desc: '외부 시스템에서 데이터 가져오기' },
  ai:        { label: 'AI 처리',   color: 'text-indigo-700 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500', icon: '🤖', desc: 'AI가 분석·요약·생성' },
  action:    { label: '실행',       color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500', icon: '📤', desc: '메일·알림·문서 발송' },
  condition: { label: '조건 분기', color: 'text-amber-700 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',     dot: 'bg-amber-500',  icon: '🔀', desc: 'if/else 조건에 따라 분기' },
  save:      { label: '결과 저장', color: 'text-rose-700 dark:text-rose-400',     bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',         dot: 'bg-rose-500',   icon: '💾', desc: '실행 결과를 기록·저장' },
}

const TRIGGER_OPTIONS: { id: TriggerType; label: string; icon: string; desc: string }[] = [
  { id: 'manual',   label: '수동 실행',   icon: '▶️', desc: '버튼을 눌렀을 때' },
  { id: 'schedule', label: '예약 실행',   icon: '⏰', desc: '매일 오전 9시 등 정해진 시간' },
  { id: 'email',    label: '이메일 수신', icon: '📧', desc: '새 메일이 도착했을 때' },
  { id: 'webhook',  label: 'Webhook',     icon: '🔗', desc: '외부 시스템 신호 수신' },
]

const STEP_PRESETS: { type: StepType; name: string; config: Record<string, unknown> }[] = [
  { type: 'data',      name: 'Gmail 미읽음 조회',     config: { action: 'gmail_unread_summary' } },
  { type: 'data',      name: 'Calendar 일정 조회',    config: { action: 'calendar_upcoming_summary' } },
  { type: 'data',      name: '엑셀 데이터 읽기',      config: { source: 'sheets' } },
  { type: 'data',      name: '고객 DB 조회',          config: { source: 'db', table: 'customers' } },
  { type: 'ai',        name: 'AI 내용 분석·요약',     config: { model: 'auto', task: 'summarize' } },
  { type: 'ai',        name: 'AI 문서 생성',          config: { model: 'auto', task: 'generate' } },
  { type: 'ai',        name: '알림톡 문구 생성',      config: { model: 'auto', task: 'notification' } },
  { type: 'ai',        name: '데이터 검증·분류',      config: { model: 'auto', task: 'validate' } },
  { type: 'ai',        name: '감정 분석',             config: { model: 'auto', task: 'sentiment' } },
  { type: 'action',    name: '이메일 초안 작성',      config: { channel: 'gmail', mode: 'draft' } },
  { type: 'action',    name: '이메일 발송',           config: { channel: 'gmail', mode: 'send' } },
  { type: 'action',    name: '알림톡 발송',           config: { channel: 'kakao' } },
  { type: 'action',    name: '캘린더 일정 등록',      config: { channel: 'calendar' } },
  { type: 'action',    name: '슬랙 메시지 전송',      config: { channel: 'slack' } },
  { type: 'condition', name: '입금 여부 확인',        config: { field: '입금상태', op: 'eq', value: '완료' } },
  { type: 'condition', name: '담당자 승인 대기',      config: { approval: true } },
  { type: 'condition', name: '기한 초과 여부',        config: { field: '마감일', op: 'lt', value: 'today' } },
  { type: 'save',      name: '실행 결과 기록',        config: { target: 'db' } },
  { type: 'save',      name: '엑셀에 결과 저장',      config: { target: 'sheets' } },
  { type: 'save',      name: 'PDF 보고서 저장',       config: { target: 'pdf' } },
]

// ─── 카테고리 ─────────────────────────────────────────────────
type TemplateCategory = 'all' | 'customer' | 'finance' | 'hr' | 'marketing' | 'operation' | 'travel'

const CATEGORIES: { id: TemplateCategory; label: string; icon: string; color: string }[] = [
  { id: 'all',       label: '전체',      icon: '⚡', color: 'text-slate-600 dark:text-slate-300' },
  { id: 'travel',    label: '여행/예약', icon: '✈️', color: 'text-sky-600 dark:text-sky-400' },
  { id: 'customer',  label: '고객 관리', icon: '👥', color: 'text-violet-600 dark:text-violet-400' },
  { id: 'finance',   label: '정산/재무', icon: '💰', color: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'hr',        label: '인사/HR',  icon: '🏢', color: 'text-indigo-600 dark:text-indigo-400' },
  { id: 'marketing', label: '마케팅',   icon: '📣', color: 'text-rose-600 dark:text-rose-400' },
  { id: 'operation', label: '운영/관리', icon: '⚙️', color: 'text-amber-600 dark:text-amber-400' },
]

// ─── 템플릿 ──────────────────────────────────────────────────
const TEMPLATES: {
  title: string; description: string; category: TemplateCategory
  trigger_type: TriggerType; steps: WorkflowStep[]; badge?: string
}[] = [
  // ── 여행/예약 ──
  {
    title: '여행 예약 입금 자동화',
    description: '예약 등록 → 고객정보 확인 → 계약금 계산 → 입금 안내 발송 → 미입금 재안내',
    category: 'travel', trigger_type: 'webhook', badge: '인기',
    steps: [
      { id: 's1', type: 'data',      name: '예약·고객 정보 조회',   config: { source: 'sheets' } },
      { id: 's2', type: 'ai',        name: '계약금·일정 계산',      config: { model: 'auto', task: 'calculate' } },
      { id: 's3', type: 'action',    name: '입금 안내 알림톡 발송', config: { channel: 'kakao' } },
      { id: 's4', type: 'condition', name: '입금 여부 확인',        config: { field: '입금상태', op: 'eq', value: '완료' } },
      { id: 's5', type: 'action',    name: '미입금 재안내 발송',    config: { channel: 'kakao' } },
      { id: 's6', type: 'save',      name: '결과 기록',             config: { target: 'db' } },
    ],
  },
  {
    title: '여행 일정 확정 안내',
    description: '출발 D-7 → 일정표 생성 → 참여자 전체 알림톡 발송 → 담당자에게 보고',
    category: 'travel', trigger_type: 'schedule',
    steps: [
      { id: 's1', type: 'data',   name: 'Calendar 일정 조회',       config: { action: 'calendar_upcoming_summary' } },
      { id: 's2', type: 'ai',     name: '여행 일정표 문서 생성',    config: { model: 'auto', task: 'generate' } },
      { id: 's3', type: 'action', name: '참여자 알림톡 일괄 발송',  config: { channel: 'kakao' } },
      { id: 's4', type: 'action', name: '담당자 이메일 보고',       config: { channel: 'gmail', mode: 'send' } },
      { id: 's5', type: 'save',   name: '발송 이력 저장',           config: { target: 'db' } },
    ],
  },
  {
    title: '고객 만족도 조사',
    description: '여행 완료 확인 → 설문 발송 → 응답 수집 → AI 분석 → 개선 리포트 생성',
    category: 'travel', trigger_type: 'webhook',
    steps: [
      { id: 's1', type: 'data',   name: '완료 여행 목록 조회',   config: { source: 'db' } },
      { id: 's2', type: 'action', name: '만족도 설문 발송',       config: { channel: 'kakao' } },
      { id: 's3', type: 'data',   name: '설문 응답 수집',         config: { source: 'sheets' } },
      { id: 's4', type: 'ai',     name: '응답 AI 분석·요약',      config: { model: 'auto', task: 'sentiment' } },
      { id: 's5', type: 'ai',     name: '개선점 리포트 작성',     config: { model: 'auto', task: 'generate' } },
      { id: 's6', type: 'save',   name: 'PDF 보고서 저장',        config: { target: 'pdf' } },
    ],
  },

  // ── 고객 관리 ──
  {
    title: '고객 문의 자동 처리',
    description: '문의 접수 → AI 분류 → 자동 답변 or 담당자 배정 → 처리 결과 기록',
    category: 'customer', trigger_type: 'email', badge: '추천',
    steps: [
      { id: 's1', type: 'data',      name: 'Gmail 문의 메일 조회',  config: { action: 'gmail_unread_summary' } },
      { id: 's2', type: 'ai',        name: '문의 유형 AI 분류',     config: { model: 'auto', task: 'classify' } },
      { id: 's3', type: 'condition', name: '자동 처리 가능 여부',   config: { field: '유형', op: 'in', value: 'FAQ' } },
      { id: 's4', type: 'ai',        name: 'AI 자동 답변 생성',     config: { model: 'auto', task: 'generate' } },
      { id: 's5', type: 'action',    name: '답변 메일 발송',        config: { channel: 'gmail', mode: 'send' } },
      { id: 's6', type: 'save',      name: '처리 결과 기록',        config: { target: 'db' } },
    ],
  },
  {
    title: '계약 갱신 알림',
    description: '계약 만료 D-30 감지 → 갱신 안내 발송 → 담당자 승인 → 계약 연장 처리',
    category: 'customer', trigger_type: 'schedule',
    steps: [
      { id: 's1', type: 'data',      name: '만료 예정 계약 조회',  config: { source: 'db' } },
      { id: 's2', type: 'condition', name: 'D-30 이하 계약 필터',  config: { field: '만료일', op: 'lt', value: 'D+30' } },
      { id: 's3', type: 'ai',        name: '갱신 안내문 생성',     config: { model: 'auto', task: 'generate' } },
      { id: 's4', type: 'action',    name: '고객 알림톡 발송',     config: { channel: 'kakao' } },
      { id: 's5', type: 'condition', name: '담당자 승인',          config: { approval: true } },
      { id: 's6', type: 'save',      name: '갱신 이력 저장',       config: { target: 'db' } },
    ],
  },

  // ── 정산/재무 ──
  {
    title: '월별 정산 자동화',
    description: '월말 정산 데이터 수집 → 검증 → 청구서 생성 → 담당자 승인 → 이메일 발송',
    category: 'finance', trigger_type: 'schedule', badge: '추천',
    steps: [
      { id: 's1', type: 'data',      name: '월별 거래 내역 조회',   config: { source: 'sheets' } },
      { id: 's2', type: 'ai',        name: '데이터 검증·집계',      config: { model: 'auto', task: 'validate' } },
      { id: 's3', type: 'ai',        name: '청구서 문서 생성',      config: { model: 'auto', task: 'generate' } },
      { id: 's4', type: 'condition', name: '담당자 승인',           config: { approval: true } },
      { id: 's5', type: 'action',    name: '청구서 이메일 발송',    config: { channel: 'gmail', mode: 'send' } },
      { id: 's6', type: 'save',      name: '정산 이력 저장',        config: { target: 'db' } },
    ],
  },
  {
    title: '미수금 관리·독촉',
    description: '미수금 목록 조회 → 연체일 계산 → 단계별 독촉 알림 → 결과 기록',
    category: 'finance', trigger_type: 'schedule',
    steps: [
      { id: 's1', type: 'data',      name: '미수금 목록 조회',      config: { source: 'db' } },
      { id: 's2', type: 'ai',        name: '연체 심각도 분류',      config: { model: 'auto', task: 'classify' } },
      { id: 's3', type: 'condition', name: '30일 이상 연체 여부',   config: { field: '연체일', op: 'gte', value: '30' } },
      { id: 's4', type: 'action',    name: '독촉 알림톡 발송',      config: { channel: 'kakao' } },
      { id: 's5', type: 'action',    name: '담당자 슬랙 알림',      config: { channel: 'slack' } },
      { id: 's6', type: 'save',      name: '독촉 이력 저장',        config: { target: 'db' } },
    ],
  },

  // ── 인사/HR ──
  {
    title: '신규 직원 온보딩',
    description: '입사 등록 → 계정 안내 → 교육 일정 발송 → 체크리스트 관리',
    category: 'hr', trigger_type: 'webhook',
    steps: [
      { id: 's1', type: 'data',   name: '신규 직원 정보 조회',     config: { source: 'db' } },
      { id: 's2', type: 'ai',     name: '온보딩 안내문 생성',      config: { model: 'auto', task: 'generate' } },
      { id: 's3', type: 'action', name: '환영 이메일 발송',        config: { channel: 'gmail', mode: 'send' } },
      { id: 's4', type: 'action', name: '교육 일정 캘린더 등록',   config: { channel: 'calendar' } },
      { id: 's5', type: 'save',   name: '온보딩 체크리스트 저장',  config: { target: 'sheets' } },
    ],
  },
  {
    title: '휴가 신청 처리',
    description: '휴가 신청 접수 → 잔여 일수 확인 → 팀장 승인 → 일정 등록 → 결과 통보',
    category: 'hr', trigger_type: 'manual',
    steps: [
      { id: 's1', type: 'data',      name: '잔여 휴가 일수 조회',  config: { source: 'db' } },
      { id: 's2', type: 'condition', name: '잔여 일수 충족 여부',  config: { field: '잔여일수', op: 'gte', value: '1' } },
      { id: 's3', type: 'condition', name: '팀장 승인',            config: { approval: true } },
      { id: 's4', type: 'action',    name: '캘린더 휴가 등록',     config: { channel: 'calendar' } },
      { id: 's5', type: 'action',    name: '신청자 결과 알림',     config: { channel: 'kakao' } },
      { id: 's6', type: 'save',      name: '휴가 이력 저장',       config: { target: 'db' } },
    ],
  },

  // ── 마케팅 ──
  {
    title: 'SNS 콘텐츠 자동화',
    description: '소재 수집 → AI 카피 생성 → 담당자 검토 → 예약 발행',
    category: 'marketing', trigger_type: 'schedule',
    steps: [
      { id: 's1', type: 'data',      name: '콘텐츠 소재 수집',      config: { source: 'sheets' } },
      { id: 's2', type: 'ai',        name: 'SNS 카피라이팅',        config: { model: 'auto', task: 'generate' } },
      { id: 's3', type: 'condition', name: '담당자 승인',           config: { approval: true } },
      { id: 's4', type: 'action',    name: 'SNS 예약 발행',         config: { channel: 'sns' } },
      { id: 's5', type: 'save',      name: '발행 이력 저장',        config: { target: 'db' } },
    ],
  },
  {
    title: '뉴스레터 발송',
    description: '구독자 목록 조회 → AI 뉴스레터 작성 → 미리보기 승인 → 일괄 발송 → 통계 저장',
    category: 'marketing', trigger_type: 'schedule',
    steps: [
      { id: 's1', type: 'data',      name: '구독자 목록 조회',      config: { source: 'db' } },
      { id: 's2', type: 'ai',        name: 'AI 뉴스레터 초안 작성', config: { model: 'auto', task: 'generate' } },
      { id: 's3', type: 'condition', name: '담당자 최종 승인',      config: { approval: true } },
      { id: 's4', type: 'action',    name: '뉴스레터 일괄 발송',    config: { channel: 'gmail', mode: 'send' } },
      { id: 's5', type: 'save',      name: '발송 통계 저장',        config: { target: 'sheets' } },
    ],
  },

  // ── 운영/관리 ──
  {
    title: '주간 업무 리포트',
    description: '매주 금요일 → 팀 데이터 수집 → AI 요약 → 리포트 생성 → 전체 공유',
    category: 'operation', trigger_type: 'schedule', badge: '인기',
    steps: [
      { id: 's1', type: 'data',   name: '주간 업무 데이터 수집',   config: { source: 'sheets' } },
      { id: 's2', type: 'ai',     name: '성과 AI 분석·요약',       config: { model: 'auto', task: 'summarize' } },
      { id: 's3', type: 'ai',     name: '주간 리포트 작성',        config: { model: 'auto', task: 'generate' } },
      { id: 's4', type: 'action', name: '팀 전체 이메일 발송',     config: { channel: 'gmail', mode: 'send' } },
      { id: 's5', type: 'save',   name: 'PDF 리포트 저장',         config: { target: 'pdf' } },
    ],
  },
  {
    title: '회의 업무 자동화',
    description: '일정 등록 → 참석자 초대 → 회의자료 검색 → 회의록 작성 → 할 일 배정',
    category: 'operation', trigger_type: 'schedule',
    steps: [
      { id: 's1', type: 'data',   name: 'Calendar 일정 조회',      config: { action: 'calendar_upcoming_summary' } },
      { id: 's2', type: 'ai',     name: '회의 자료 검색·정리',     config: { model: 'auto', task: 'research' } },
      { id: 's3', type: 'ai',     name: '회의록 초안 작성',        config: { model: 'auto', task: 'generate' } },
      { id: 's4', type: 'ai',     name: '할 일 목록 배정',         config: { model: 'auto', task: 'assign' } },
      { id: 's5', type: 'save',   name: '회의록·할 일 저장',       config: { target: 'db' } },
    ],
  },
  {
    title: '긴급 이슈 대응',
    description: '이슈 감지 → AI 심각도 분류 → 담당자 즉시 알림 → 대응 기록',
    category: 'operation', trigger_type: 'webhook',
    steps: [
      { id: 's1', type: 'data',      name: '이슈·에러 로그 수집',  config: { source: 'webhook' } },
      { id: 's2', type: 'ai',        name: '심각도 AI 분류',       config: { model: 'auto', task: 'classify' } },
      { id: 's3', type: 'condition', name: '긴급 등급 여부',       config: { field: '심각도', op: 'gte', value: 'HIGH' } },
      { id: 's4', type: 'action',    name: '담당자 즉시 알림',     config: { channel: 'slack' } },
      { id: 's5', type: 'action',    name: '알림톡 긴급 발송',     config: { channel: 'kakao' } },
      { id: 's6', type: 'save',      name: '이슈 대응 기록',       config: { target: 'db' } },
    ],
  },

  // ── 메일 ──
  {
    title: '메일 업무 자동화',
    description: '새 메일 확인 → 중요도 판단 → 요약 → 답장 초안 → 담당자 승인 → 발송',
    category: 'operation', trigger_type: 'email',
    steps: [
      { id: 's1', type: 'data',      name: 'Gmail 미읽음 조회',     config: { action: 'gmail_unread_summary' } },
      { id: 's2', type: 'ai',        name: '중요도 판단 및 요약',   config: { model: 'auto', task: 'summarize' } },
      { id: 's3', type: 'ai',        name: '답장 초안 작성',        config: { model: 'auto', task: 'generate' } },
      { id: 's4', type: 'condition', name: '담당자 승인',           config: { approval: true } },
      { id: 's5', type: 'action',    name: '이메일 발송',           config: { channel: 'gmail', mode: 'send' } },
      { id: 's6', type: 'save',      name: '실행 결과 기록',        config: { target: 'db' } },
    ],
  },
  {
    title: '문서 일괄 처리',
    description: '엑셀 업로드 → 데이터 검증 → 알림톡 문구 생성 → 결과 저장',
    category: 'operation', trigger_type: 'manual',
    steps: [
      { id: 's1', type: 'data', name: '엑셀 데이터 읽기',          config: { source: 'sheets' } },
      { id: 's2', type: 'ai',   name: '데이터 검증·변수 추출',     config: { model: 'auto', task: 'validate' } },
      { id: 's3', type: 'ai',   name: '알림톡 문구 생성',          config: { model: 'auto', task: 'notification' } },
      { id: 's4', type: 'save', name: '엑셀에 결과 저장',          config: { target: 'sheets' } },
    ],
  },
]

// ─── 실행 시뮬레이션 ─────────────────────────────────────────
type LiveStep = WorkflowStep & { status: 'pending' | 'running' | 'succeeded' | 'failed'; result?: string }

function simulateExecution(steps: WorkflowStep[], onUpdate: (steps: LiveStep[]) => void): Promise<void> {
  let live: LiveStep[] = steps.map(s => ({ ...s, status: 'pending' }))
  onUpdate([...live])
  return new Promise(resolve => {
    let i = 0
    const tick = () => {
      if (i >= live.length) { resolve(); return }
      live = live.map((s, idx) => idx === i ? { ...s, status: 'running' } : s)
      onUpdate([...live])
      setTimeout(() => {
        const ok = Math.random() > 0.07
        const msgs: Record<StepType, string> = {
          trigger:   '시작 조건 확인 완료',
          data:      '데이터 12건 조회됨',
          ai:        'AI 처리 완료 — 결과 생성됨',
          action:    '발송 완료 (수신자 3명)',
          condition: '조건 충족 → 다음 단계 진행',
          save:      '결과 저장 완료',
        }
        live = live.map((s, idx) => idx === i
          ? { ...s, status: ok ? 'succeeded' : 'failed', result: ok ? msgs[s.type] : '오류: 연결 실패 (재시도 가능)' }
          : s)
        onUpdate([...live])
        i++
        if (ok) setTimeout(tick, 600 + Math.random() * 600)
        else resolve()
      }, 800 + Math.random() * 800)
    }
    setTimeout(tick, 300)
  })
}

// ─── 파이프라인 미리보기 ──────────────────────────────────────
function PipelinePreview({ steps }: { steps: WorkflowStep[] }) {
  if (!steps.length) return <span className="text-xs text-slate-400">단계 없음</span>
  return (
    <div className="flex flex-wrap items-center gap-1">
      {steps.map((s, i) => {
        const meta = STEP_META[s.type]
        return (
          <span key={s.id} className="flex items-center gap-1">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]! font-semibold ${meta.bg} ${meta.color}`}>
              <span className="text-[11px]!">{meta.icon}</span>
              <span>{s.name.length > 9 ? s.name.slice(0, 9) + '…' : s.name}</span>
            </span>
            {i < steps.length - 1 && <svg className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>}
          </span>
        )
      })}
    </div>
  )
}

// ─── 스텝 추가 버튼 ───────────────────────────────────────────
function AddStepButton({ onClick, open, onSelect, onClose }: {
  onClick: () => void; open: boolean
  onSelect: (p: typeof STEP_PRESETS[0]) => void; onClose: () => void
}) {
  const grouped = STEP_PRESETS.reduce<Record<StepType, typeof STEP_PRESETS>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = []
    acc[p.type].push(p)
    return acc
  }, {} as Record<StepType, typeof STEP_PRESETS>)

  return (
    <div className="relative flex justify-center">
      <button onClick={onClick}
        className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3 py-1 text-[11px]! font-medium text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        단계 추가
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-[60] w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400">단계 유형 선택</p>
            <button aria-label="닫기" onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          {(Object.entries(grouped) as [StepType, typeof STEP_PRESETS][]).map(([type, presets]) => {
            const meta = STEP_META[type]
            return (
              <div key={type}>
                <p className={`text-[10px]! font-bold uppercase tracking-wide mb-1 ${meta.color}`}>{meta.icon} {meta.label}</p>
                <div className="space-y-0.5">
                  {presets.map(p => (
                    <button key={p.name} onClick={() => onSelect(p)}
                      className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 빌더 모달 ───────────────────────────────────────────────
function WorkflowBuilder({ initial, onSave, onClose }: {
  initial?: Partial<WorkflowRow>
  onSave: (d: { title: string; description: string; category: string; trigger_type: TriggerType; steps: WorkflowStep[] }) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'operation')
  const [triggerType, setTriggerType] = useState<TriggerType>(initial?.trigger_type ?? 'manual')
  const [steps, setSteps] = useState<WorkflowStep[]>(initial?.steps ?? [])
  const [saving, setSaving] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState<number | null>(null)

  const addStep = (insertIdx: number, preset: typeof STEP_PRESETS[0]) => {
    const s: WorkflowStep = { id: `step-${Date.now()}`, type: preset.type, name: preset.name, config: preset.config }
    const next = [...steps]; next.splice(insertIdx, 0, s)
    setSteps(next); setShowPresetPicker(null)
  }
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx))
  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...steps]; const t = idx + dir
    if (t < 0 || t >= next.length) return
    ;[next[idx], next[t]] = [next[t]!, next[idx]!]; setSteps(next)
  }
  const handleSave = async () => {
    if (!title.trim() || steps.length === 0) return
    setSaving(true)
    await onSave({ title: title.trim(), description: desc.trim(), category, trigger_type: triggerType, steps })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">{initial?.id ? '워크플로우 편집' : '새 워크플로우'}</h2>
            <p className="text-[11px]! text-slate-400 mt-0.5">단계를 추가해 업무 파이프라인을 구성하세요</p>
          </div>
          <button aria-label="닫기" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">워크플로우 이름 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 여행 예약 입금 안내 자동화"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 text-slate-900 dark:text-slate-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">설명</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="어떤 업무를 자동화하나요?"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 text-slate-900 dark:text-slate-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">분류</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 text-slate-900 dark:text-slate-100">
                {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 시작 조건 */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">🚀 시작 조건</label>
            <div className="grid grid-cols-4 gap-2">
              {TRIGGER_OPTIONS.map(t => (
                <button key={t.id} onClick={() => setTriggerType(t.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                    triggerType === t.id
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-[11px]! font-semibold text-slate-700 dark:text-slate-300 leading-tight">{t.label}</span>
                  <span className="text-[10px]! text-slate-400 leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 스텝 빌더 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">⚙️ 실행 단계</label>
              <span className="text-[11px]! text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{steps.length}단계</span>
            </div>
            <div className="space-y-1">
              <AddStepButton onClick={() => setShowPresetPicker(0)} open={showPresetPicker === 0} onSelect={p => addStep(0, p)} onClose={() => setShowPresetPicker(null)} />
              {steps.map((step, idx) => {
                const meta = STEP_META[step.type]
                return (
                  <div key={step.id}>
                    <div className={`flex items-center gap-3 rounded-xl border p-3 ${meta.bg}`}>
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-base shrink-0 ${meta.bg} border ${meta.bg.includes('violet') ? 'border-violet-200 dark:border-violet-700' : ''}`}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${meta.color}`}>{step.name}</p>
                        <p className="text-[11px]! text-slate-400 mt-0.5">{meta.label}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-25 hover:bg-white/60 dark:hover:bg-slate-800/60">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-25 hover:bg-white/60 dark:hover:bg-slate-800/60">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button onClick={() => removeStep(idx)} className="rounded-md p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-center py-0.5"><div className="w-px h-3 bg-slate-200 dark:bg-slate-700" /></div>
                    <AddStepButton onClick={() => setShowPresetPicker(idx + 1)} open={showPresetPicker === idx + 1} onSelect={p => addStep(idx + 1, p)} onClose={() => setShowPresetPicker(null)} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 rounded-b-2xl">
          <p className="text-xs text-slate-400">{steps.length === 0 ? '최소 1단계 이상 추가하세요' : `${steps.length}단계 파이프라인`}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">취소</button>
            <button onClick={handleSave} disabled={saving || !title.trim() || steps.length === 0}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors">
              {saving ? '저장 중…' : '저장하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 실행 모달 ───────────────────────────────────────────────
function ExecutionModal({ wf, onClose }: { wf: WorkflowRow; onClose: () => void }) {
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const start = useCallback(async () => {
    if (!wf.steps.length) return
    setRunning(true); setDone(false)
    await simulateExecution(wf.steps, setLiveSteps)
    setRunning(false); setDone(true)
  }, [wf.steps])

  useEffect(() => { void start() }, [start])

  const succeeded = liveSteps.filter(s => s.status === 'succeeded').length
  const failed = liveSteps.filter(s => s.status === 'failed').length
  const progress = liveSteps.length ? Math.round((liveSteps.filter(s => s.status !== 'pending').length / liveSteps.length) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">{wf.title}</h2>
              <p className="text-[11px]! text-slate-400 mt-0.5">{running ? '실행 중…' : done ? '실행 완료' : '준비 중'}</p>
            </div>
            {!running && <button aria-label="닫기" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
          </div>
          {/* 프로그레스 바 */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px]! text-slate-400">
            <span>{succeeded} 완료 {failed > 0 ? `· ${failed} 실패` : ''}</span>
            <span>{progress}%</span>
          </div>
        </div>

        {/* 스텝 목록 */}
        <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
          {liveSteps.map(step => {
            const meta = STEP_META[step.type]
            const isRunning = step.status === 'running'
            return (
              <div key={step.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-all duration-300 ${
                isRunning        ? 'border-indigo-300 bg-indigo-50/80 dark:bg-indigo-900/10 dark:border-indigo-700 shadow-sm' :
                step.status === 'succeeded' ? `${meta.bg}` :
                step.status === 'failed'    ? 'border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800' :
                'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 opacity-40'
              }`}>
                {/* 상태 아이콘 */}
                <div className="shrink-0 mt-0.5">
                  {isRunning ? (
                    <div className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                  ) : step.status === 'succeeded' ? (
                    <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  ) : step.status === 'failed' ? (
                    <div className="h-5 w-5 rounded-full bg-rose-500 flex items-center justify-center">
                      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-slate-200 dark:border-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{meta.icon}</span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{step.name}</span>
                  </div>
                  {step.result && (
                    <p className={`mt-0.5 text-xs ${step.status === 'failed' ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'}`}>{step.result}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px]! font-semibold rounded-full px-2 py-0.5 ${
                  isRunning        ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' :
                  step.status === 'succeeded' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                  step.status === 'failed'    ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                  'bg-slate-100 text-slate-400 dark:bg-slate-800'
                }`}>
                  {isRunning ? '실행 중' : step.status === 'succeeded' ? '완료' : step.status === 'failed' ? '실패' : '대기'}
                </span>
              </div>
            )
          })}
        </div>

        {done && (
          <div className={`border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between ${
            failed > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : 'bg-emerald-50/50 dark:bg-emerald-900/10'
          }`}>
            <div>
              <p className={`text-sm font-bold ${failed > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {failed > 0 ? `⚠️ ${failed}단계 실패 — 확인 필요` : '✅ 모든 단계 완료'}
              </p>
              <p className="text-[11px]! text-slate-400 mt-0.5">{succeeded}/{liveSteps.length} 단계 성공</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void start()} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">재실행</button>
              <button onClick={onClose} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export function WorkflowsPage() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [runs, setRuns] = useState<WorkflowRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editTarget, setEditTarget] = useState<WorkflowRow | null>(null)
  const [runTarget, setRunTarget] = useState<WorkflowRow | null>(null)
  const [activeTab, setActiveTab] = useState<'my' | 'template'>('my')
  const [catFilter, setCatFilter] = useState<TemplateCategory>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [wfs, rs] = await Promise.all([fetchMyWorkflows(), fetchWorkflowRuns()])
    setWorkflows(wfs); setRuns(rs); setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSave = async (data: { title: string; description: string; category: string; trigger_type: TriggerType; steps: WorkflowStep[] }) => {
    if (editTarget) await updateWorkflow(editTarget.id, data)
    else await createWorkflow({ ...data, system_prompt: '' })
    setShowBuilder(false); setEditTarget(null); await load()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 워크플로우를 삭제할까요?')) return
    await deleteWorkflow(id); await load()
  }

  const handleLaunch = (wf: WorkflowRow) => {
    if (!wf.steps.length) {
      const threadId = crypto.randomUUID()
      writeWorkflowBootstrap(threadId, { workflowId: wf.id, title: wf.title, systemPrompt: wf.system_prompt })
      rememberLastPrivateThread(threadId)
      navigate(`/chat/${threadId}`)
      return
    }
    setRunTarget(wf)
  }

  const useTemplate = async (t: typeof TEMPLATES[0]) => {
    const created = await createWorkflow({ title: t.title, description: t.description, category: t.category, trigger_type: t.trigger_type, steps: t.steps, system_prompt: '' })
    if (created) { await load(); setActiveTab('my') }
  }

  const filteredTemplates = catFilter === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.category === catFilter)
  const totalSteps = workflows.reduce((sum, w) => sum + w.steps.length, 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* 헤더 */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-indigo-600 text-white text-lg shadow-md">⚡</span>
                <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">워크플로우</h1>
              </div>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-md">
                AI와 시스템을 연결해 여러 단계의 업무를 순서대로 자동 처리합니다
              </p>
            </div>
            <button onClick={() => { setEditTarget(null); setShowBuilder(true) }}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              새 워크플로우
            </button>
          </div>

          {/* 통계 */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: '전체 워크플로우', value: workflows.length, icon: '⚡', color: 'text-indigo-600 dark:text-indigo-400' },
              { label: '총 자동화 단계', value: totalSteps, icon: '🔗', color: 'text-sky-600 dark:text-sky-400' },
              { label: '최근 실행 이력', value: runs.length, icon: '▶️', color: 'text-emerald-600 dark:text-emerald-400' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="text-[11px]! text-slate-500 dark:text-slate-400">{label}</p>
                  <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 탭 */}
        <div className="mx-auto max-w-5xl px-6 pb-0">
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
            {([['my', '내 워크플로우'], ['template', '템플릿 라이브러리']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}>
                {label}
                {id === 'template' && <span className="ml-1.5 text-[10px]! rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 font-bold">{TEMPLATES.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-6 space-y-6">

        {/* 내 워크플로우 탭 */}
        {activeTab === 'my' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-indigo-600" /></div>
            ) : workflows.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-8 py-20 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-3xl mb-4">⚡</div>
                <p className="text-base font-bold text-slate-700 dark:text-slate-300">아직 워크플로우가 없습니다</p>
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">15개 템플릿으로 빠르게 시작하거나 직접 만들어보세요</p>
                <div className="flex items-center justify-center gap-2 mt-5">
                  <button onClick={() => setActiveTab('template')} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">템플릿 보기</button>
                  <button onClick={() => { setEditTarget(null); setShowBuilder(true) }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm">직접 만들기</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {workflows.map(wf => {
                  const triggerOpt = TRIGGER_OPTIONS.find(t => t.id === wf.trigger_type)
                  return (
                    <div key={wf.id} className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span className="text-xl shrink-0">{triggerOpt?.icon ?? '⚡'}</span>
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-slate-50 truncate">{wf.title}</h3>
                            {wf.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{wf.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditTarget(wf); setShowBuilder(true) }} className="rounded-lg p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(wf.id)} className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 min-h-[28px]">
                        {wf.steps.length > 0 ? <PipelinePreview steps={wf.steps} /> : <span className="text-xs text-slate-400">단순 채팅 봇</span>}
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]! font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{wf.steps.length}단계</span>
                          <span className="text-[11px]! text-slate-400">{triggerOpt?.label ?? '수동 실행'}</span>
                        </div>
                        <button onClick={() => handleLaunch(wf)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm active:scale-95 transition-all">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          실행
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 실행 이력 */}
            {runs.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">최근 실행 이력</h2>
                  <span className="text-xs text-slate-400">{runs.length}건</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {runs.slice(0, 8).map(run => (
                    <div key={run.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${
                        run.status === 'succeeded' ? 'bg-emerald-500' : run.status === 'failed' ? 'bg-rose-500' : run.status === 'running' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'
                      }`} />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 flex-1 truncate">{run.action_key}</span>
                      <span className={`text-xs font-semibold shrink-0 ${
                        run.status === 'succeeded' ? 'text-emerald-600 dark:text-emerald-400' : run.status === 'failed' ? 'text-rose-500' : 'text-slate-400'
                      }`}>{run.status === 'succeeded' ? '완료' : run.status === 'failed' ? '실패' : run.status === 'running' ? '실행 중' : '대기'}</span>
                      <span className="text-[11px]! text-slate-400 shrink-0">{new Date(run.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 템플릿 탭 */}
        {activeTab === 'template' && (
          <div className="space-y-5">
            {/* 카테고리 필터 */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setCatFilter(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-all ${
                    catFilter === cat.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                  <span>{cat.icon}</span>
                  {cat.label}
                  <span className={`text-[10px]! rounded-full px-1.5 py-0.5 font-bold ${
                    catFilter === cat.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {cat.id === 'all' ? TEMPLATES.length : TEMPLATES.filter(t => t.category === cat.id).length}
                  </span>
                </button>
              ))}
            </div>

            {/* 템플릿 그리드 */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map(t => {
                const triggerOpt = TRIGGER_OPTIONS.find(o => o.id === t.trigger_type)
                const catMeta = CATEGORIES.find(c => c.id === t.category)
                return (
                  <div key={t.title} className="group relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all flex flex-col">
                    {t.badge && (
                      <span className={`absolute top-3.5 right-3.5 text-[10px]! font-bold px-2 py-0.5 rounded-full ${
                        t.badge === '인기' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                        'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                      }`}>{t.badge}</span>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{triggerOpt?.icon ?? '⚡'}</span>
                      <span className={`text-[10px]! font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 ${catMeta?.color ?? 'text-slate-500'}`}>
                        {catMeta?.label ?? t.category}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-50 text-sm leading-snug">{t.title}</h3>
                    <p className="mt-1 text-[11px]! text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{t.description}</p>
                    <div className="mt-3">
                      <PipelinePreview steps={t.steps} />
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px]! font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full px-2 py-0.5">{t.steps.length}단계</span>
                        <span className="text-[11px]! text-slate-400">{triggerOpt?.label}</span>
                      </div>
                      <button onClick={() => void useTemplate(t)}
                        className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 text-[11px]! font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                        사용하기
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 단계 유형 가이드 */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">워크플로우 구성 요소</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.entries(STEP_META) as [StepType, typeof STEP_META[StepType]][]).map(([type, meta]) => (
              <div key={type} className={`rounded-xl border p-3 flex items-start gap-2.5 ${meta.bg}`}>
                <span className="text-xl shrink-0">{meta.icon}</span>
                <div>
                  <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                  <p className="text-[11px]! text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{meta.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showBuilder && (
        <WorkflowBuilder initial={editTarget ?? undefined} onSave={handleSave} onClose={() => { setShowBuilder(false); setEditTarget(null) }} />
      )}
      {runTarget && (
        <ExecutionModal wf={runTarget} onClose={() => setRunTarget(null)} />
      )}
    </div>
  )
}
