// 입력 폼에서 쓰는 선택지 정의

// SNS 종류는 화면과 서버가 함께 쓰는 shared/sns.ts에 정의되어 있다.
export { SNS_PROFILES as SNS_TYPES, getSnsProfile, type SnsType } from '../../shared/sns'

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
