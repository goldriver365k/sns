import type { TemplateId } from './types'

/** 릴스 디자인 템플릿 5종 — 배경, 사진 자리, 자막 모양, 강조색 */
export type ReelTemplate = {
  id: TemplateId
  name: string
  description: string
  bg: [string, string]
  /** 사진·영상이 들어가는 영역 (1080×1920 기준) */
  media: { x: number; y: number; w: number; h: number; radius: number }
  /** 사진 위 어둡게 깔기(자막 가독성) */
  shade: number
  sub: {
    family: string
    weight: number
    size: number
    color: string
    /** 자막 뒤 상자 색 (빈 문자열이면 상자 없음) */
    box: string
    stroke: string
    y: number
    align: 'center' | 'left'
  }
  accent: string
  accent2: string
  /** 화면 위쪽 장식 */
  header?: 'bar' | 'frame' | 'dots'
}

export const REEL_TEMPLATES: ReelTemplate[] = [
  {
    id: 'clean',
    name: '클린',
    description: '밝은 배경, 둥근 사진 카드, 깔끔한 자막 — 정보·일상',
    bg: ['#FBF8F1', '#EFE8DA'],
    media: { x: 60, y: 220, w: 960, h: 1180, radius: 48 },
    shade: 0,
    sub: { family: 'Pretendard Variable', weight: 800, size: 64, color: '#1B1F1C', box: '', stroke: '', y: 1560, align: 'center' },
    accent: '#1F4D3A',
    accent2: '#C8A96A',
    header: 'dots',
  },
  {
    id: 'impact',
    name: '임팩트',
    description: '화면 가득 사진 + 노란 상자 큰 자막 — 맛집·홍보',
    bg: ['#111111', '#000000'],
    media: { x: 0, y: 0, w: 1080, h: 1920, radius: 0 },
    shade: 0.35,
    sub: { family: 'Jua', weight: 400, size: 84, color: '#111111', box: '#FFD43B', stroke: '', y: 1380, align: 'center' },
    accent: '#FFD43B',
    accent2: '#FF4D4F',
  },
  {
    id: 'premium',
    name: '프리미엄',
    description: '짙은 녹색과 금색, 명조 자막 — 브랜드·감성',
    bg: ['#17332A', '#0E211B'],
    media: { x: 90, y: 300, w: 900, h: 1100, radius: 0 },
    shade: 0.1,
    sub: { family: 'ACM MaruBuri', weight: 700, size: 62, color: '#F3EAD7', box: '', stroke: '', y: 1560, align: 'center' },
    accent: '#C8A96A',
    accent2: '#F3EAD7',
    header: 'frame',
  },
  {
    id: 'pop',
    name: '팝',
    description: '선명한 그라데이션, 흰 테두리 자막, 스티커 느낌 — MZ·이벤트',
    bg: ['#FF6B3D', '#FF3D7F'],
    media: { x: 80, y: 260, w: 920, h: 1120, radius: 60 },
    shade: 0,
    sub: { family: 'ACM Cafe24 SsurroundAir', weight: 400, size: 76, color: '#FFFFFF', box: '', stroke: '#1A1A1A', y: 1560, align: 'center' },
    accent: '#FFE14D',
    accent2: '#1A1A1A',
  },
  {
    id: 'info',
    name: '정보',
    description: '상단 제목 띠, 번호 장면, 왼쪽 정렬 자막 — 창업·경제 정보',
    bg: ['#FFFFFF', '#F2F6F3'],
    media: { x: 60, y: 300, w: 960, h: 1000, radius: 24 },
    shade: 0,
    sub: { family: 'Pretendard Variable', weight: 700, size: 58, color: '#111111', box: '#F2F6F3', stroke: '', y: 1420, align: 'left' },
    accent: '#1F4D3A',
    accent2: '#9FD3B5',
    header: 'bar',
  },
]

export const getTemplate = (id: string) => REEL_TEMPLATES.find((t) => t.id === id) ?? REEL_TEMPLATES[0]
