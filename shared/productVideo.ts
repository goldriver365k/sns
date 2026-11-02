// 제품 애니메이션(AI 영상) — 화면과 서버가 함께 쓰는 선택지와 안내문
// 영상 모델은 영어 안내문에서 가장 잘 동작하므로(공식 문서) AI에 보내는 문장은 영어로 둔다.

export const PRODUCT_MOTIONS = [
  { id: 'turntable', label: '천천히 회전', prompt: 'The product slowly rotates on a turntable, revealing its form. The camera stays still.' },
  { id: 'dolly', label: '카메라 다가가기', prompt: 'The camera slowly pushes in toward the product, ending on a close-up hero shot.' },
  { id: 'orbit', label: '카메라 한 바퀴', prompt: 'The camera smoothly orbits halfway around the product at eye level.' },
  { id: 'float', label: '둥둥 떠오르기', prompt: 'The product gently lifts off the surface and floats up and down, with a soft shadow below.' },
  { id: 'shine', label: '빛 반사 지나가기', prompt: 'A soft beam of light sweeps across the product, creating an elegant glossy highlight. Subtle camera movement.' },
  { id: 'petals', label: '꽃잎·조각 흩날림', prompt: 'Soft petals and tiny sparkles drift slowly through the air around the product. The camera slowly pushes in.' },
  { id: 'splash', label: '물방울 튀기기', prompt: 'Fresh water droplets splash around the product in slow motion, catching the light.' },
  { id: 'steam', label: '김·연기 피어오르기', prompt: 'Gentle steam rises softly around the product in warm light. The camera slowly pushes in.' },
] as const

export type ProductMotionId = (typeof PRODUCT_MOTIONS)[number]['id'] | 'custom'
export type VideoAspect = '9:16' | '16:9'
export type VideoResolution = '360p' | '720p'

export type ProductVideoRequest = {
  /** JPEG base64 (data URL 앞부분 제외) */
  image: string
  motion: ProductMotionId
  /** 직접 설명 (motion이 custom이거나 덧붙일 때) */
  custom: string
  seconds: 5 | 8
  aspect: VideoAspect
  resolution: VideoResolution
  sound: boolean
}

/** 720p 1초 약 0.10달러(Gemini Omni Flash 공식 가격, 2026-11 기준) — 화면에 대략 금액을 보여 줄 때 사용 */
export const USD_PER_SECOND_720P = 0.1

/** 상품 모양을 지키고 한 장면으로 만들게 하는 안내문 */
export function productVideoPrompt(r: Pick<ProductVideoRequest, 'motion' | 'custom' | 'seconds' | 'sound'>) {
  const preset = PRODUCT_MOTIONS.find((m) => m.id === r.motion)?.prompt ?? ''
  const custom = r.custom.trim()
  return [
    `Create a ${r.seconds}-second premium product commercial shot based on the reference image.`,
    preset,
    custom ? `Additional direction (may be in Korean): ${custom}` : '',
    'In a single continuous shot, no scene cuts.',
    'Keep the product exactly as in the image: same shape, proportions, colors, labels, logo and printed text. Do not redesign or deform the product.',
    'Keep the same background and lighting style as the image.',
    'No people, no hands, no added text or captions, no watermarks.',
    r.sound ? 'Sound: soft, modern background music only. No dialogue, no voice-over.' : 'No dialogue, no voice-over, no music.',
  ]
    .filter(Boolean)
    .join(' ')
}
