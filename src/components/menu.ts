import { IconArchive, IconCalendar, IconDoc, IconFilm, IconImage, IconPen, IconSettings, IconSun, IconWand } from './Icons'

export const MENU = [
  { path: '/create', label: 'SNS 게시물 만들기', icon: IconPen },
  { path: '/reels', label: 'AI 자동 릴스', icon: IconFilm },
  { path: '/photo', label: '상품 사진 편집', icon: IconWand },
  { path: '/today', label: '오늘의 콘텐츠', icon: IconSun },
  { path: '/calendar', label: '콘텐츠 캘린더', icon: IconCalendar },
  { path: '/images', label: '이미지 보관함', icon: IconImage },
  { path: '/history', label: '지난 콘텐츠', icon: IconArchive },
  { path: '/office', label: '엑셀·워드 문서', icon: IconDoc },
  { path: '/settings', label: '운영 설정', icon: IconSettings },
] as const
