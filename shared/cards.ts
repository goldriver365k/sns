// 카드 편집기에서 바꾼 배치·글씨 모양 (Firestore posts[].cards[].overrides에 저장)

export type Box = { x: number; y: number; w: number; h: number }
export type Align = 'left' | 'center' | 'right'

/** 글씨 모양. size는 최대 크기 — 상자에 안 들어가면 minSize까지 자동으로 줄어든다 */
export type TextStyle = {
  family: string
  weight: number
  size: number
  minSize: number
  color: string
  align: Align
  lineHeight: number
}

export type ElementKey = 'title' | 'body' | 'emphasis'

/** 사진 자리 + 자르기(확대·이동). zoom 1 = 자리를 꽉 채움, ox·oy는 -1~1 (넘치는 부분 안에서 이동) */
export type ImageFrame = Box & { zoom: number; ox: number; oy: number }

/** 카드 위 요소들의 위치 (1080×1350 기준 px) */
export type CardLayout = {
  title: Box
  body: Box
  emphasis: { x: number; y: number }
  image: ImageFrame | null
}

/** 편집기에서 바꾼 값. 없으면 디자인 기본값으로 자동 배치 */
export type CardOverrides = {
  layout?: CardLayout
  styles?: Partial<Record<ElementKey, Partial<TextStyle>>>
}

