/** 생성 요청·응답 형식 (화면과 서버 공용) */
import type { CardOverrides } from './cards'

export const LANGUAGE_NAMES: Record<string, string> = {
  ko: '한국어',
  en: 'English',
  vi: 'Tiếng Việt',
  zh: '中文(简体)',
  ja: '日本語',
  hi: 'हिन्दी',
}

export type BrandInfo = {
  name: string
  siteUrl: string
  description: string
  rules: string
  hashtags: string[]
}

export type CardText = {
  title: string
  body: string
  emphasis: string
  /** 카드 디자인 (화면에서 고름, 없으면 브랜드 기본 디자인) */
  design?: string
  /** 카드 편집기에서 바꾼 배치·글씨 모양 */
  overrides?: CardOverrides
  /** 이 카드에 넣을 이미지 id (없으면 이미지 칸의 순서대로, null이면 사진 없음) */
  imageId?: string | null
}

export type GeneratedPost = {
  /** 핵심 키워드 (노출 검사에 사용) */
  keyword: string
  /** 제목 — 유튜브·블로그만, 나머지는 빈 문자열 */
  title: string
  /** 본문 또는 캡션 (해시태그 제외) */
  body: string
  /** 생성된 해시태그 (고정 해시태그 제외) */
  hashtags: string[]
  /** 인스타그램 카드 3장 글 — 다른 SNS는 빈 배열 */
  cards: CardText[]
}

export type GenerateRequest = {
  snsType: string
  language: string
  content: string
  instructions: string
  /** 선택한 계획 주제 */
  topic?: string
  brand?: BrandInfo
  /** 노출 검사에 걸린 항목을 고쳐 다시 만들 때 */
  fix?: { previous: GeneratedPost; failed: string[] }
}

export type GenerateResponse = { post: GeneratedPost } | { error: string }
