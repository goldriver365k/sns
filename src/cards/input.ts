import type { CardText } from '../../shared/generate'
import type { PickedImage } from '../lib/images'
import type { CardInput } from './render'

export const bareUrl = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** 카드에 들어갈 이미지: 카드에서 고른 이미지 → 없으면 이미지 칸 순서(카드 n번 = n번째 이미지). null이면 사진 없음 */
export function cardImage(card: CardText, index: number, images: PickedImage[]): PickedImage | null {
  if (card.imageId === null) return null
  if (card.imageId) return images.find((i) => i.id === card.imageId) ?? null
  return images[index] ?? null
}

/** 저장된 카드 글 + 브랜드 정보 + 이미지 → 그리기 입력 */
export function toCardInput(cards: CardText[], i: number, o: { siteUrl: string; brandName: string; images: PickedImage[] }): CardInput {
  const c = cards[i]
  return {
    title: c.title,
    body: c.body,
    emphasis: c.emphasis,
    index: i,
    total: cards.length,
    siteUrl: bareUrl(o.siteUrl),
    brandName: o.brandName,
    image: cardImage(c, i, o.images)?.el ?? null,
    overrides: c.overrides,
  }
}
