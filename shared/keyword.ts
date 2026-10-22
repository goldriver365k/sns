// 핵심어 타이포: 화면과 서버 함수가 함께 쓰는 형식

/** 장면 하나: 크게 나오는 핵심어 + 이어지는 문장(`*단어*`로 감싸면 강조) */
export type KeywordScene = { kw: string; sent: string }

/** 권장 글자 수. 넘으면 화면에서 글씨가 작아진다 */
export const KEYWORD_LIMITS = { kw: 5, sent: 28 }
export const KEYWORD_SCENES_MIN = 2
export const KEYWORD_SCENES_MAX = 5

export type KeywordCopyRequest = {
  topic: string
  /** 장면 수 (2~5) */
  count: number
  /** 하단 상호 (분위기 참고용, 문장에는 넣지 않는다) */
  storeName?: string
  /** 다시 쓸 때 겹치지 않게 참고할 이전 장면 */
  previous?: KeywordScene[]
}
