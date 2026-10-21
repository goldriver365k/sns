import { IconArchive, IconCalendar, IconFilm, IconImage, IconPen, IconSettings, IconSun } from './Icons'

export const MENU = [
  { path: '/create', label: 'SNS 게시물 만들기', icon: IconPen },
  { path: '/reels', label: 'AI 자동 릴스', icon: IconFilm },
  { path: '/today', label: '오늘의 콘텐츠', icon: IconSun },
  { path: '/calendar', label: '콘텐츠 캘린더', icon: IconCalendar },
  { path: '/images', label: '이미지 보관함', icon: IconImage },
  { path: '/history', label: '지난 콘텐츠', icon: IconArchive },
  { path: '/settings', label: '운영 설정', icon: IconSettings },
] as const
