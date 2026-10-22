// 털복이 숏폼: 화면과 서버 함수가 함께 쓰는 형식

/** 털복이가 말하는 문구 한 세트. `*단어*`로 감싼 부분은 빨간색 강조 */
export type TteolbokCopy = {
  /** 제목 첫째 줄 */
  title1: string
  /** 제목 둘째 줄(강조색) */
  title2: string
  /** 포인트 박스 (예: 비결!) */
  point: string
  /** 말풍선 첫째·둘째 줄 */
  l1: string
  l2: string
  /** 말풍선 마무리 줄(굵게) */
  l3: string
}

export const TTEOLBOK_COPY_KEYS = ['title1', 'title2', 'point', 'l1', 'l2', 'l3'] as const

/** 권장 글자 수(공백 포함). 넘으면 화면에서 글씨가 자동으로 줄어든다. */
export const TTEOLBOK_LIMITS: Record<keyof TteolbokCopy, number> = {
  title1: 9,
  title2: 9,
  point: 5,
  l1: 16,
  l2: 18,
  l3: 20,
}

export type TteolbokCopyRequest = {
  topic: string
  /** 하단 상호 (문구 분위기 참고용, 문구 안에는 넣지 않는다) */
  storeName?: string
  /** 이전 결과와 다르게 써 달라는 요청에 쓰는 이전 문구 */
  previous?: TteolbokCopy
}

export type TteolbokVoiceRequest = { text: string }

export const emptyCopy = (): TteolbokCopy => ({ title1: '', title2: '', point: '', l1: '', l2: '', l3: '' })
