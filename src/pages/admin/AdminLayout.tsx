import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS: {
  to: string
  label: string
  end?: boolean
}[] = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/employees', label: '직원 관리' },
  { to: '/admin/teams', label: '팀/조직' },
  { to: '/admin/activity-logs', label: '시스템 로그' },
  { to: '/admin/weekly-reports', label: '주간 트렌드' },
  { to: '/admin/token-requests', label: '토큰 요청' },
  { to: '/admin/templates', label: '프롬프트' },
  { to: '/admin/models', label: 'AI 모델' },
  { to: '/admin/plugins', label: '플러그인' },
  { to: '/admin/lab', label: 'AI 실험실' },
  { to: '/admin/audit', label: '대화 감사' },
  { to: '/admin/reference', label: '자료실' },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'rounded px-2 py-1 text-[15px] font-medium transition-colors',
              isActive
                ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="admin-shell flex min-h-dvh w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="admin-sidebar hidden w-44 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
            Control Tower
          </p>
          <h1 className="mt-0.5 font-semibold tracking-tight">NH-AX-HUB 관리자</h1>
          <p className="text-[14px] text-slate-500 dark:text-slate-400">운영 콘솔</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="관리자 메뉴">
          <NavLinks />
        </nav>
        <div className="border-t border-slate-200 p-2 dark:border-slate-800">
          <NavLink
            to="/"
            className="block rounded px-2 py-1 text-center text-[15px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
          >
            ← 사용자 포털
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-sidebar sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2.5 py-1.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Admin
            </p>
            <p className="truncate font-semibold">NH-AX-HUB Control Tower</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded border border-slate-200 px-2 py-0.5 font-medium dark:border-slate-700"
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-nav"
            >
              메뉴
            </button>
            <NavLink
              to="/"
              className="rounded bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800"
            >
              포털
            </NavLink>
          </div>
        </header>

        {mobileOpen ? (
          <nav
            id="admin-mobile-nav"
            className="admin-sidebar border-b border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 lg:hidden"
            aria-label="관리자 모바일 메뉴"
          >
            <div className="flex flex-col gap-0.5">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
          </nav>
        ) : null}

        <main className="admin-shell flex-1 overflow-auto p-3 md:p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
