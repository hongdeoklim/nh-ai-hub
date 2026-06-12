import { useEffect, useState } from 'react'

import { IntegrationsPanel } from './IntegrationsPanel'
import { MyPagePanel } from './MyPagePanel'
import { UserAiProfilePanel } from './UserAiProfilePanel'

type SettingsTab =
  | 'mypage'
  | 'history'
  | 'memory'
  | 'integrations'
  | 'scheduled'
  | 'help'
  | 'more'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'mypage', label: '마이페이지' },
  { id: 'history', label: '이전 기록' },
  { id: 'memory', label: 'AI 기억' },
  { id: 'integrations', label: '연동' },
  { id: 'scheduled', label: '예약 작업' },
  { id: 'help', label: '도움말' },
  { id: 'more', label: '기타' },
]

type SettingsDialogProps = {
  open: boolean
  onClose: () => void
  userId?: string
}

export function SettingsDialog({
  open,
  onClose,
  userId,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>('mypage')

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={() => onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#FAF9F6] shadow-2xl dark:border-stone-700 dark:bg-stone-900 sm:max-h-[min(88dvh,40rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <h2
            id="settings-dialog-title"
            className="text-base font-semibold text-stone-900 dark:text-stone-50"
          >
            설정
          </h2>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-200/80 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            aria-label="설정 닫기"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-200 px-2 py-2 dark:border-stone-700">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[20px] font-medium transition-colors ${
                tab === item.id
                  ? 'bg-orange-800 text-white dark:bg-orange-900'
                  : 'text-stone-600 hover:bg-stone-200/80 dark:text-stone-400 dark:hover:bg-stone-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
          {tab === 'mypage' ? <MyPagePanel /> : null}

          {tab === 'memory' ? <UserAiProfilePanel userId={userId} /> : null}

          {tab === 'integrations' ? <IntegrationsPanel /> : null}

          {tab === 'history' ? (
            <section className="space-y-3">
              <p className="font-semibold text-stone-900 dark:text-stone-100">
                대화 기록
              </p>
              <p>
                현재 버전에서는 대화가{' '}
                <strong className="text-stone-900 dark:text-stone-100">
                  이 브라우저 탭 세션에만
                </strong>{' '}
                유지됩니다. 페이지를 새로 고치거나 다른 기기에서는 이어지지 않습니다.
              </p>
              <p className="rounded-xl border border-stone-200/90 bg-white/80 px-3 py-3 text-[20px] dark:border-stone-700 dark:bg-stone-950/60">
                계정별 대화 목록·검색·복원 기능은 추후 제공 예정입니다. 지금은 왼쪽
                메뉴의 <strong>새 채팅</strong>으로 현재 대화만 초기화할 수 있습니다.
              </p>
            </section>
          ) : null}

          {tab === 'scheduled' ? (
            <section className="space-y-3">
              <p className="font-semibold text-stone-900 dark:text-stone-100">
                예약된 작업
              </p>
              <p>
                정해진 시각에 프롬프트를 실행하거나 리포트를 받는{' '}
                <strong className="text-stone-900 dark:text-stone-100">
                  예약 작업
                </strong>{' '}
                기능은 준비 중입니다.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-[20px] text-stone-600 dark:text-stone-400">
                <li>예: 매주 안전점검 요약, 월간 토큰 사용 알림 등</li>
                <li>출시 시 이 탭에서 생성·수정·중지할 수 있도록 할 예정입니다.</li>
              </ul>
            </section>
          ) : null}

          {tab === 'help' ? (
            <section className="space-y-4">
              <p className="font-semibold text-stone-900 dark:text-stone-100">
                빠른 안내
              </p>
              <ul className="space-y-3 text-[20px]">
                <li>
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    새 채팅
                  </span>
                  ：사이드바 또는 상단의 새 채팅으로 현재 스레드를 초기화하고 입력·첨부도
                  비웁니다.
                </li>
                <li>
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    프롬프트
                  </span>
                  ：왼쪽 패널에서 전사·공유·개인 프롬프트를 탭하면 입력창에 적용됩니다.
                  이전에 고른 문구는 새로 고른 항목으로 덮어씁니다.
                </li>
                <li>
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    모델
                  </span>
                  ：작성창 오른쪽 아래에서 제공사와 모델을 고르면 프로필에 저장됩니다.
                </li>
                <li>
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    토큰
                  </span>
                  ：사이드바에 남은 예산 비율이 표시됩니다. 한도에 다다르면 안내 또는
                  자동 조정 정책이 적용될 수 있습니다.
                </li>
                <li>
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    가드레일·비용 정책
                  </span>
                  ：업무 관련 요청만 처리되며, 월간 토큰 한도에 따라 모델이 자동 조정될
                  수 있습니다.
                </li>
              </ul>
            </section>
          ) : null}

          {tab === 'more' ? (
            <section className="space-y-3">
              <p className="font-semibold text-stone-900 dark:text-stone-100">
                기타
              </p>
              <p className="text-[20px] text-stone-600 dark:text-stone-400">
                NH-AX-HUB는 업무 관련 질의와 가드레일 정책을 따릅니다. 민감한
                개인정보는 입력하지 마세요.
              </p>
              <p className="text-[20px] text-stone-600 dark:text-stone-400">
                문의·개선 요청은 내부 담당 채널을 이용해 주세요.
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
