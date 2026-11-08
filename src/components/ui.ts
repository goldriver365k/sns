/**
 * 디자인 시스템 — 공용 스타일 (규칙: docs/DESIGN.md)
 * 화면마다 같은 모양을 직접 쓰지 말고 여기서 가져다 쓴다. 색·그림자·모서리 값은 src/index.css의 토큰.
 */

// ── 글자 ──────────────────────────────────────────────
/** 화면 제목 (PageHeader가 사용) */
export const pageTitle = 'text-2xl font-bold text-ink sm:text-[28px]'
/** 화면 안 큰 묶음 제목 (예: 디자인 계속하기) */
export const sectionTitle = 'text-xl font-bold text-ink sm:text-2xl'
/** 카드 제목 */
export const cardTitle = 'mb-2 text-sm font-bold text-ink'
/** 도움말 (작은 회색 글) */
export const help = 'text-[11px] leading-snug text-muted'
/** 오류·성공 안내 */
export const errorText = 'text-xs text-danger'
export const okText = 'text-xs text-ok'

// ── 영역 ──────────────────────────────────────────────
/** 카드: 설정 묶음·결과 칸 */
export const card = 'rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-card'
/** 넓은 카드 (설정 화면 등) */
export const cardLg = 'rounded-2xl border border-cream-300 bg-cream-50 p-5 shadow-card sm:p-6'
/** 안쪽 칸 (카드 안의 하위 묶음) */
export const panel = 'rounded-xl border border-cream-300 bg-white p-3'
/** 비어 있음·다음 단계 안내 */
export const emptyBox = 'rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-8 text-center text-sm text-muted'

// ── 입력 ──────────────────────────────────────────────
/** 큰 입력 (게시물 만들기 등 주 입력 폼) */
export const fieldLabel = 'mb-2 block text-[15px] font-semibold text-ink'
export const inputBase =
  'w-full rounded-xl border border-cream-300 bg-white px-4 py-3 text-[15px] outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100'
/** 작은 입력 (편집 패널 안) */
export const label = 'mb-1 block text-xs font-medium text-muted'
export const field =
  'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100'

// ── 버튼 ──────────────────────────────────────────────
const btn = 'inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'
/** 주 버튼: 화면(또는 카드)마다 가장 중요한 동작 하나 */
export const btnPrimary = `${btn} rounded-xl bg-forest-700 px-5 py-2.5 text-[15px] text-white hover:bg-forest-900`
/** 작은 주 버튼 (패널 안) */
export const btnPrimarySm = `${btn} rounded-xl bg-forest-700 px-3 py-2 text-sm text-white hover:bg-forest-900`
/** 보조 버튼: 보라 테두리 */
export const btnSecondary = `${btn} rounded-xl border border-forest-700 bg-white px-3 py-2 text-sm text-forest-700 hover:bg-forest-50`
/** 조용한 버튼: 회색 테두리 */
export const btnGhost = `${btn} rounded-xl border border-cream-300 bg-white px-5 py-2.5 text-[15px] font-normal text-ink hover:border-forest-500`
/** 위험한 동작 (삭제) */
export const btnDanger = 'mr-auto rounded-xl px-3 py-2.5 text-[15px] text-danger hover:bg-red-50'
/** 글자 버튼 (수정, 추가 등) */
export const btnLink = 'text-sm font-medium text-forest-700 hover:text-forest-900 hover:underline'

// ── 고르기 ────────────────────────────────────────────
/** 알약 모양 선택 (여러 개 중 하나·여러 개) */
export const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-forest-700 bg-forest-700 text-white' : 'border-cream-300 bg-white text-ink hover:border-forest-500'}`
/** 칸 나눔 선택 (길이·디자인처럼 나란한 몇 개 중 하나) */
export const seg = (on: boolean) =>
  `rounded-lg border py-2 text-sm transition ${on ? 'border-forest-700 bg-forest-700 text-white' : 'border-cream-300 bg-white text-ink hover:border-forest-500'}`
