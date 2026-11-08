import { IconArchive, IconCalendar, IconFilm, IconHome, IconImage, IconPen, IconSettings, IconSun, IconWand } from './Icons'

/** short: 왼쪽 좁은 메뉴(아이콘 아래)에 쓰는 짧은 이름 */
export const MENU = [
  { path: '/', label: '홈', short: '홈', icon: IconHome },
  { path: '/create', label: 'SNS 게시물 만들기', short: 'SNS 게시물', icon: IconPen },
  { path: '/reels', label: 'AI 자동 릴스', short: '자동 릴스', icon: IconFilm },
  { path: '/photo', label: '상품 사진 편집', short: '사진 편집', icon: IconWand },
  { path: '/today', label: '오늘의 콘텐츠', short: '오늘', icon: IconSun },
  { path: '/calendar', label: '콘텐츠 캘린더', short: '캘린더', icon: IconCalendar },
  { path: '/images', label: '이미지 보관함', short: '보관함', icon: IconImage },
  { path: '/history', label: '지난 콘텐츠', short: '지난 콘텐츠', icon: IconArchive },
  { path: '/settings', label: '운영 설정', short: '설정', icon: IconSettings },
] as const

/** 지금 주소에 맞는 메뉴 (홈은 정확히 '/'일 때만) */
export const currentMenu = (pathname: string) => MENU.find((m) => (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path)))
