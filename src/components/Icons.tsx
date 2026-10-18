// 메뉴에 쓰는 단순 선 아이콘 (외부 아이콘 라이브러리 없이 사용)
type P = { className?: string }
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}

export const IconPen = (p: P) => (
  <svg {...base} className={p.className}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
)
export const IconSun = (p: P) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const IconCalendar = (p: P) => (
  <svg {...base} className={p.className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
)
export const IconImage = (p: P) => (
  <svg {...base} className={p.className}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
)
export const IconArchive = (p: P) => (
  <svg {...base} className={p.className}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" /></svg>
)
export const IconSettings = (p: P) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
)
export const IconMenu = (p: P) => (
  <svg {...base} className={p.className}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
)
export const IconClose = (p: P) => (
  <svg {...base} className={p.className}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconPhone = (p: P) => (
  <svg {...base} className={p.className}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
)
