import { loadAsset } from './assets'
import { newProject, saveNow } from './persist'
import { blankScene, updateProject } from './store'
import { maxScenesFor } from './storyboard'
import type { ReelAsset, ReelDuration, ReelScene } from './types'

/**
 * 상품 사진 편집에서 만든 사진을 자동 릴스 새 프로젝트로 옮긴다.
 * - 사진 1장 = 장면 1개 (영상 길이에 맞는 장면 수까지). 사진은 릴스 사진 칸에 맞는 1080×1350(4:5)으로 다시 그려서 넘긴다.
 * - 상품 이름·한 줄 소개·가격을 자막·가격표·CTA로 넣는다. 비우면 자막 없이 사진만.
 * - 장면 움직임은 확대·이동을 돌아가며 넣어 상품 소개 영상처럼 보이게 한다.
 * 그 뒤 릴스 화면에서 AI 대본, 목소리·음악, MP4 만들기를 그대로 쓴다.
 * 지금 편집 중인 릴스는 먼저 저장된다.
 */
export type PhotosForReel = {
  /** 4:5로 그린 사진 파일 (순서대로) */
  photos: Blob[]
  name: string
  intro: string
  price: string
  duration: ReelDuration
}

const MOTIONS: ReelScene['motion'][] = ['zoomIn', 'panLeft', 'zoomOut', 'panRight']
const ANIMS: ReelScene['subtitleAnim'][] = ['pop', 'slideUp', 'fade', 'typewriter']

/** 장면별 자막: 첫 장면 상품 이름, 둘째 한 줄 소개, 마지막 행동 유도. 사진이 적으면 앞에서부터 합친다 */
export function captionsFor(count: number, name: string, intro: string) {
  const lines = [name.trim(), intro.trim()].filter(Boolean)
  const texts = Array.from({ length: count }, (_, i) => lines[i] ?? '')
  if (count > 1 && lines.length && !texts[count - 1]) texts[count - 1] = '지금 바로 만나보세요'
  if (count === 1 && lines.length > 1) texts[0] = lines.join('\n')
  return texts
}

export async function reelFromPhotos(src: PhotosForReel) {
  const limit = Math.min(src.photos.length, maxScenesFor(src.duration))
  if (!limit) throw new Error('옮길 사진이 없습니다. 먼저 배경을 지운 사진을 만들어 주세요.')
  await newProject()

  const assets: ReelAsset[] = []
  for (const [i, blob] of src.photos.slice(0, limit).entries()) {
    try {
      assets.push(await loadAsset(new File([blob], `product${i + 1}.png`, { type: 'image/png' }), 'media'))
    } catch {
      // 읽지 못한 사진은 건너뛴다
    }
  }
  if (!assets.length) throw new Error('사진을 릴스로 옮기지 못했습니다.')

  const texts = captionsFor(assets.length, src.name, src.intro)
  const price = src.price.trim()
  const scenes: ReelScene[] = assets.map((a, i) => {
    const last = i === assets.length - 1
    const priceHere = !!price && i === Math.min(1, assets.length - 1)
    return {
      ...blankScene(texts[i]),
      assetId: a.id,
      motion: MOTIONS[i % MOTIONS.length],
      subtitleAnim: ANIMS[i % ANIMS.length],
      effects: [...(i === 0 ? (['sparkle'] as const) : []), ...(priceHere ? (['priceTag'] as const) : []), ...(last && assets.length > 1 ? (['cta'] as const) : [])],
      priceText: priceHere ? price : '',
      ctaText: last && assets.length > 1 ? '지금 구매하기' : '',
    }
  })

  const script = texts.filter(Boolean).join('\n')
  updateProject({
    title: (src.name.trim() || '상품 소개 영상').slice(0, 40),
    topic: [src.name.trim(), src.intro.trim(), price].filter(Boolean).join(' · '),
    script,
    duration: src.duration,
    template: 'clean',
    assets,
    scenes,
  })
  // 릴스 화면이 열리기 전이라도 바로 저장(내 프로젝트에 나오게)
  void saveNow()
  return { scenes: scenes.length, skipped: src.photos.length - assets.length }
}
