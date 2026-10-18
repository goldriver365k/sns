// 인스타그램 카드 디자인 5종 정의 (이름, 폰트, 어울리는 콘텐츠)

export type DesignId = 'simple' | 'photo' | 'premium' | 'mz' | 'info'

export type FontSpec = { family: string; weight: number }

export type DesignInfo = {
  id: DesignId
  name: string
  description: string
  /** 기본 제목 폰트 */
  title: FontSpec
  /** 기본 본문 폰트 */
  body: FontSpec
  fontLabel: string
}

export const DESIGNS: DesignInfo[] = [
  {
    id: 'simple',
    name: '심플형',
    description: '밝은 배경, 넓은 여백, 큰 제목 — 사자성어·생활정보·메시지',
    title: { family: 'Noto Sans KR', weight: 900 },
    body: { family: 'Noto Sans KR', weight: 400 },
    fontLabel: 'Noto Sans KR',
  },
  {
    id: 'photo',
    name: '사진 강조형',
    description: '사진을 크게, 제목은 아래 영역 — 음식 사진·메뉴 홍보',
    title: { family: 'Jua', weight: 400 },
    body: { family: 'Pretendard Variable', weight: 500 },
    fontLabel: '배민 주아체',
  },
  {
    id: 'premium',
    name: '프리미엄형',
    description: '차분한 색, 명조 제목 — 브랜드 소개·감성 문구',
    title: { family: 'ACM MaruBuri', weight: 700 },
    body: { family: 'ACM MaruBuri', weight: 400 },
    fontLabel: '마루 부리',
  },
  {
    id: 'mz',
    name: 'MZ 감성형',
    description: '밝고 선명한 색, 역동적 구성 — 대학생 관심사·공감',
    title: { family: 'ACM Cafe24 SsurroundAir', weight: 400 },
    body: { family: 'Pretendard Variable', weight: 600 },
    fontLabel: '카페24 써라운드에어',
  },
  {
    id: 'info',
    name: '정보 전달형',
    description: '제목·본문·강조 분리 — 창업·경제·운영 노하우',
    title: { family: 'Pretendard Variable', weight: 800 },
    body: { family: 'Pretendard Variable', weight: 400 },
    fontLabel: 'Pretendard',
  },
]

export const getDesign = (id: string | undefined): DesignInfo => DESIGNS.find((d) => d.id === id) ?? DESIGNS[0]

/** 편집기에서 고를 수 있는 폰트와 쓸 수 있는 굵기 */
export const FONT_OPTIONS: { family: string; label: string; weights: number[] }[] = [
  { family: 'Noto Sans KR', label: 'Noto Sans KR', weights: [400, 700, 900] },
  { family: 'Pretendard Variable', label: 'Pretendard', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Jua', label: '배민 주아체', weights: [400] },
  { family: 'ACM MaruBuri', label: '마루 부리', weights: [400, 700] },
  { family: 'ACM Cafe24 SsurroundAir', label: '카페24 써라운드에어', weights: [400] },
]

/** 하단 주소 표시에 쓰는 폰트 (모든 디자인 공통) */
export const FOOTER_FONT: FontSpec = { family: 'Pretendard Variable', weight: 700 }
