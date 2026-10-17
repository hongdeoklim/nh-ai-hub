import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

type AdminNavItem = {
  to: string
  label: string
  end?: boolean
}

type AdminNavSection = {
  label: string
  items: AdminNavItem[]
}

/** 관리자 메뉴 — 17개 평면 목록을 5개 영역으로 그룹화 (기능 변경 없음) */
const NAV_SECTIONS: AdminNavSection[] = [
  {
    label: '운영',
    items: [
      { to: '/admin', label: '대시보드', end: true },
      { to: '/admin/ax', label: 'AX 현황' },
      { to: '/admin/weekly-reports', label: '주간 트렌드' },
      { to: '/admin/activity-logs', label: '시스템 로그' },
    ],
  },
  {
    label: '사용자',
    items: [
      { to: '/admin/employees', label: '직원 관리' },
      { to: '/admin/teams', label: '팀/조직' },
      { to: '/admin/token-requests', label: '토큰 요청' },
      { to: '/admin/feedback', label: '피드백 관리' },
    ],
  },
  {
    label: 'AI',
    items: [
      { to: '/admin/models', label: 'AI 모델' },
      { to: '/admin/templates', label: '프롬프트' },
      { to: '/admin/plugins', label: '플러그인' },
      { to: '/admin/lab', label: 'AI 실험실' },
      { to: '/admin/audit', label: '대화 감사' },
    ],
  },
  {
    label: '지식',
    items: [
      { to: '/admin/reference', label: '자료실' },
      { to: '/admin/knowledge-graph', label: '지식 그래프' },
    ],
  },
  {
    label: '소통 · 현장',
    items: [
      { to: '/admin/push', label: '푸시 알림' },
      { to: '/admin/site-assessment', label: '현장 AI 평가' },
    ],
  },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="mb-2">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    'rounded px-2 py-1 text-[14px] font-medium transition-colors',
                    isActive
                      ? 'bg-brand text-brand-fg shadow-sm'
                      : 'text-fg-muted hover:bg-surface-2',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="admin-shell flex min-h-dvh w-full bg-bg text-fg">
      <aside className="admin-sidebar hidden w-48 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">
            Control Tower
          </p>
          <h1 className="mt-0.5 font-semibold tracking-tight">NH-AX-HUB 관리자</h1>
          <p className="text-[13px] text-fg-subtle">운영 콘솔</p>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto p-2" aria-label="관리자 메뉴">
          <NavLinks />
        </nav>
        <div className="border-t border-border p-2">
          <NavLink
            to="/"
            className="block rounded px-2 py-1 text-center text-[14px] font-medium text-fg-muted ring-1 ring-border transition hover:bg-surface-2"
          >
            ← 사용자 포털
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-sidebar sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-2.5 py-1.5 backdrop-blur-md lg:hidden">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-brand">Admin</p>
            <p className="truncate font-semibold">NH-AX-HUB Control Tower</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded border border-border px-2 py-0.5 font-medium"
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-nav"
            >
              메뉴
            </button>
            <NavLink
              to="/"
              className="rounded bg-surface-2 px-2 py-0.5 font-medium"
            >
              포털
            </NavLink>
          </div>
        </header>

        {mobileOpen ? (
          <nav
            id="admin-mobile-nav"
            className="admin-sidebar border-b border-border bg-surface p-2 lg:hidden"
            aria-label="관리자 모바일 메뉴"
          >
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </nav>
        ) : null}

        <main className="admin-shell flex-1 overflow-auto p-3 md:p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
