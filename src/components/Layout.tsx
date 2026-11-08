import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { currentMenu, MENU } from './menu'
import { IconClose, IconMenu, IconPlus } from './Icons'

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // 모바일에서 메뉴를 고르면 서랍을 닫는다.
  useEffect(() => setOpen(false), [location.pathname])

  const current = currentMenu(location.pathname)

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-6 pt-8 pb-6">
        <div className="text-xs font-medium tracking-widest text-forest-500">AI CONTENT</div>
        <div className="mt-1 text-xl font-bold text-forest-900">AI 콘텐츠 매니저</div>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {MENU.map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition ${
                  isActive
                    ? 'bg-forest-700 font-semibold text-cream-50'
                    : 'text-ink hover:bg-cream-200'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-cream-300 px-6 py-5">
        <div className="truncate text-sm text-muted">{user?.email}</div>
        <button onClick={logout} className="mt-2 text-sm font-medium text-forest-700 hover:underline">
          로그아웃
        </button>
      </div>
    </nav>
  )

  // PC: 아이콘 위·이름 아래의 좁은 메뉴
  const rail = (
    <nav className="flex h-full flex-col items-center gap-1 py-5" aria-label="주 메뉴">
      <Link to="/create" className="mb-3 flex flex-col items-center gap-1 text-[11px] font-medium text-ink" title="SNS 게시물 만들기">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-forest-500 to-[#5b5bf0] text-white shadow-md transition hover:scale-105">
          <IconPlus className="h-6 w-6" />
        </span>
        만들기
      </Link>
      <ul className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {MENU.map(({ path, label, short, icon: Icon }) => (
          <li key={path}>
            <NavLink to={path} end={path === '/'} title={label} className="group flex w-[76px] flex-col items-center gap-1 py-1.5 text-[11px] leading-tight">
              {({ isActive }) => (
                <>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${isActive ? 'bg-forest-50 text-forest-700' : 'text-ink group-hover:bg-cream-200'}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={`text-center ${isActive ? 'font-semibold text-forest-700' : 'text-ink'}`}>{short}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <button onClick={logout} title={`${user?.email ?? ''} · 로그아웃`} className="mt-2 flex flex-col items-center gap-1 text-[11px] text-muted hover:text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8553e] text-sm font-bold text-white">{(user?.email ?? '?').charAt(0).toUpperCase()}</span>
        로그아웃
      </button>
    </nav>
  )

  return (
    <div className="flex min-h-full">
      {/* PC: 고정 좁은 메뉴 */}
      <aside className="sticky top-0 hidden h-screen w-[92px] shrink-0 border-r border-cream-300 bg-cream-50 lg:block">
        {rail}
      </aside>

      {/* 모바일: 상단 바 + 서랍 메뉴 */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-cream-300 bg-cream-50/95 px-4 backdrop-blur lg:hidden">
        <button aria-label="메뉴 열기" onClick={() => setOpen(true)} className="-ml-1 p-1 text-forest-900">
          <IconMenu className="h-6 w-6" />
        </button>
        <div className="text-[15px] font-semibold text-forest-900">{current?.label ?? 'AI 콘텐츠 매니저'}</div>
        <div className="w-6" />
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-cream-50 shadow-xl">
            <button
              aria-label="메뉴 닫기"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 text-muted"
            >
              <IconClose className="h-6 w-6" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pt-20 pb-12 sm:px-8 lg:px-12 lg:pt-10">
        <Outlet />
      </main>
    </div>
  )
}
