import { useState } from 'react'

import { Overlay, OverlayHeader } from '../common/Overlay'
import { IconSearch } from '../common/icons'
import { IntegrationsPanel } from './IntegrationsPanel'
import { MyPagePanel } from './MyPagePanel'
import { PluginConnectionsPanel } from './PluginConnectionsPanel'
import { ScheduledTasksPanel } from './ScheduledTasksPanel'
import { UserAiProfilePanel } from './UserAiProfilePanel'

export type SettingsTab =
  | 'mypage'
  | 'history'
  | 'memory'
  | 'integrations'
  | 'plugins'
  | 'scheduled'
  | 'help'
  | 'more'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'mypage', label: '마이페이지' },
  { id: 'memory', label: 'AI 기억' },
  { id: 'integrations', label: '연동' },
  { id: 'plugins', label: '플러그인' },
  { id: 'scheduled', label: '예약 작업' },
  { id: 'history', label: '대화 기록' },
  { id: 'help', label: '도움말' },
  { id: 'more', label: '기타' },
]

type SettingsDialogProps = {
  open: boolean
  onClose: () => void
  userId?: string
  /** 열릴 때 표시할 탭 (예: 'mypage' — 테마/다크모드 설정 위치) */
  initialTab?: SettingsTab
}

export function SettingsDialog({
  open,
  onClose,
  userId,
  initialTab = 'mypage',
}: SettingsDialogProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="sheet"
      desktopDialog
      label="설정"
      panelClassName="h-[88dvh] md:h-[min(84dvh,760px)]"
      widthClass="md:w-[min(720px,calc(100vw-32px))]"
    >
      <OverlayHeader title="설정" onClose={onClose} />
      {/* Overlay 가 닫히면 언마운트 → 열 때마다 initialTab 으로 초기화 */}
      <SettingsBody initialTab={initialTab} userId={userId} />
    </Overlay>
  )
}

function SettingsBody({ initialTab, userId }: { initialTab: SettingsTab; userId?: string }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  return (
    <>
      <div
        role="tablist"
        aria-label="설정 탭"
        className="flex shrink-0 gap-[4px] overflow-x-auto border-b border-border px-[12px] py-[8px]"
      >
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-full px-[12px] py-[6px] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 ${
                active ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[16px] py-[16px] text-sm leading-relaxed text-fg-muted"
      >
        {tab === 'mypage' ? <MyPagePanel /> : null}
        {tab === 'memory' ? <UserAiProfilePanel userId={userId} /> : null}
        {tab === 'integrations' ? <IntegrationsPanel /> : null}
        {tab === 'plugins' ? <PluginConnectionsPanel /> : null}
        {tab === 'scheduled' ? <ScheduledTasksPanel /> : null}

        {tab === 'history' ? (
          <section className="space-y-[12px]">
            <p className="font-semibold text-fg">대화 기록</p>
            <p>
              개인 채팅은 이 기기에 저장되고 로그인 계정으로{' '}
              <strong className="text-fg">서버에 동기화</strong>됩니다. 다른 기기에서 같은 계정으로
              로그인하면 최근 대화 목록이 복원됩니다.
            </p>
            <ul className="list-disc space-y-[6px] pl-[20px] text-xs">
              <li>
                대화 검색: 좌측 패널(모바일은 ☰ 메뉴)의 <strong className="text-fg">대화 검색</strong>{' '}
                또는 <kbd className="rounded-[4px] border border-border bg-surface-2 px-[4px] font-sans">Ctrl K</kbd>
                <IconSearch className="ml-[4px] inline h-[12px] w-[12px] align-[-1px]" />
              </li>
              <li>대화 고정 · 이름 변경 · 노트북에 추가 · 삭제는 각 대화의 ⋮ 메뉴에서 할 수 있습니다.</li>
              <li>삭제한 대화는 서버 동기화 기록에서도 함께 제거되며 복구할 수 없습니다.</li>
            </ul>
          </section>
        ) : null}

        {tab === 'help' ? (
          <section className="space-y-[14px]">
            <p className="font-semibold text-fg">빠른 안내</p>
            <ul className="space-y-[10px] text-xs">
              <li>
                <span className="font-medium text-fg">새 채팅</span>: 좌측 레일의 ✎ 버튼 또는 대화
                패널 상단의 새 채팅으로 새 스레드를 시작합니다.
              </li>
              <li>
                <span className="font-medium text-fg">검색 · 명령</span>: 상단 검색창 또는{' '}
                <kbd className="rounded-[4px] border border-border bg-surface-2 px-[4px] font-sans">Ctrl K</kbd>
                로 화면 이동 · 최근 대화 · 테마 전환을 한 번에 실행합니다.
              </li>
              <li>
                <span className="font-medium text-fg">프롬프트</span>: 채팅 화면의 프롬프트 보관함에서
                전사·공유·개인 프롬프트를 선택하면 입력창에 적용됩니다.
              </li>
              <li>
                <span className="font-medium text-fg">모델</span>: 입력창 오른쪽 아래에서 제공사와 모델을
                고르면 프로필에 저장됩니다.
              </li>
              <li>
                <span className="font-medium text-fg">토큰</span>: 상단 헤더와 계정 메뉴에 이번 달 남은
                예산 비율이 표시됩니다. 부족하면 계정 메뉴에서 증액을 요청하세요.
              </li>
              <li>
                <span className="font-medium text-fg">가드레일 · 비용 정책</span>: 업무 관련 요청만
                처리되며 월간 한도에 따라 모델이 자동 조정될 수 있습니다.
              </li>
            </ul>
          </section>
        ) : null}

        {tab === 'more' ? (
          <section className="space-y-[12px]">
            <p className="font-semibold text-fg">기타</p>
            <p className="text-xs">
              NH-AX-HUB는 업무 관련 질의와 가드레일 정책을 따릅니다. 민감한 개인정보는 입력하지
              마세요.
            </p>
            <p className="text-xs">문의·개선 요청은 내부 담당 채널을 이용해 주세요.</p>
            <p className="text-[11px] text-fg-subtle">
              버전 {import.meta.env.VITE_APP_VERSION ?? '2.x'} · 2026-10 UI 개편
            </p>
          </section>
        ) : null}
      </div>
    </>
  )
}
