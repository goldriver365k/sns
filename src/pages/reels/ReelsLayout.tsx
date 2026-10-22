import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import SaveIndicator from '../../components/reels/SaveIndicator'
import { startAutosave } from '../../reels/persist'

const TABS = [
  { to: '/reels', label: '자동 릴스', end: true },
  { to: '/reels/tteolbok', label: '털복이 숏폼' },
  { to: '/reels/projects', label: '내 프로젝트' },
  { to: '/reels/keyword', label: '핵심어 타이포' },
  { to: '/reels/settings', label: '설정' },
]

/** AI 자동 릴스: 위쪽 메뉴(자동 릴스 / 내 프로젝트 / 디자인 / 설정) */
export default function ReelsLayout() {
  useEffect(() => startAutosave(), [])
  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest-900 sm:text-[28px]">AI 자동 릴스</h1>
          <p className="mt-1 text-[15px] text-muted">대본과 사진·영상으로 세로형 릴스를 구성하고 모션그래픽을 미리 봅니다.</p>
          <div className="mt-1">
            <SaveIndicator />
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 rounded-xl bg-cream-200 p-1" aria-label="릴스 메뉴">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium sm:px-4 ${isActive ? 'bg-white text-forest-900 shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
