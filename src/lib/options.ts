// 입력 폼에서 쓰는 선택지 정의

export const SNS_TYPES = [
  { value: 'instagram', label: '인스타그램' },
  { value: 'threads', label: '스레드' },
] as const
export type SnsType = (typeof SNS_TYPES)[number]['value']

export const BRANDS = [
  { value: '', label: '선택 안 함' },
  { value: 'hurururuk', label: '후루룩찹찹' },
  { value: 'bulbaek', label: '화산불백' },
  { value: 'hellokorean', label: 'Hello Korean' },
] as const
export type Brand = (typeof BRANDS)[number]['value']

export const LANGUAGES = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: '영어' },
  { value: 'vi', label: '베트남어' },
  { value: 'zh', label: '중국어' },
  { value: 'ja', label: '일본어' },
  { value: 'hi', label: '힌디어' },
] as const
export type Language = (typeof LANGUAGES)[number]['value']

export const MAX_TEXT = 1000
