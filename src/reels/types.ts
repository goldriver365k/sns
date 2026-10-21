// AI 자동 릴스 — 데이터 형식

export type AssetKind = 'media' | 'logo' | 'character'

/** 업로드한 사진·영상·로고·캐릭터 (파일은 이 기기 브라우저 저장소에, 사진은 Firestore에도 저장) */
export type ReelAsset = {
  id: string
  kind: AssetKind
  type: 'image' | 'video'
  name: string
  url: string
  el: HTMLImageElement | HTMLVideoElement
  width: number
  height: number
  /** 영상 길이(초) */
  duration?: number
  /** 핵심 모델 이미지: 자르거나 크게 확대하지 않고 원본 비율 그대로 보여 준다 */
  keyModel?: boolean
  /** 다른 기기용 사진 저장(Firestore)까지 끝났는지 */
  cloud?: boolean
}

export type MotionId = 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight'
export type SubtitleAnim = 'pop' | 'typewriter' | 'slideUp' | 'fade'
export type EffectId = 'sparkle' | 'fireworks' | 'priceTag' | 'highlight' | 'cta'

export type ReelScene = {
  id: string
  /** 화면 자막 (나중에 나레이션 대본으로도 사용) */
  text: string
  /** 길이 비율 — 실제 초는 전체 길이에 맞춰 나눈다 */
  weight: number
  assetId: string | null
  characterId: string | null
  motion: MotionId
  subtitleAnim: SubtitleAnim
  effects: EffectId[]
  priceText: string
  ctaText: string
}

export type ReelDuration = 10 | 15 | 30 | 60
export type TemplateId = 'clean' | 'impact' | 'premium' | 'pop' | 'info'

/** 저장용 자료 정보 (파일 자체는 따로 저장) */
export type ReelAssetMeta = Pick<ReelAsset, 'id' | 'kind' | 'type' | 'name' | 'width' | 'height' | 'duration' | 'keyModel' | 'cloud'>

export type ReelProject = {
  /** 저장된 프로젝트 id — 아직 저장 전이면 null */
  id: string | null
  title: string
  topic: string
  script: string
  duration: ReelDuration
  template: TemplateId
  scenes: ReelScene[]
  assets: ReelAsset[]
  logoId: string | null
  showProgress: boolean
  /** 이 기기에서 파일을 찾지 못한 자료(주로 다른 기기에서 넣은 영상) — [다시 넣기]로 채운다 */
  missing: ReelAssetMeta[]
}
