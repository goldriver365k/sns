import type { DesignId } from './designs'
import { ensureFonts } from './fonts'
import { CARD_H, CARD_W, renderCard, type CardInput } from './render'
import { canvasToPng } from './export'

/**
 * 카드 1장을 PNG로 만들고 다운로드 전 검사를 한다(화면 밖 캔버스 사용 — 미리보기와 같은 함수로 그림).
 * problems가 비어 있어야 내려받을 수 있다.
 */
export async function renderCardFile(design: DesignId, card: CardInput) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!
  const fontOk = await ensureFonts(design, `${card.title}${card.body}${card.emphasis}${card.siteUrl}0123456789/`, card.overrides)
  const report = renderCard(ctx, design, card)
  const n = card.index + 1
  const problems: string[] = []
  if (!fontOk) problems.push(`카드 ${n}: 폰트를 불러오지 못해 한글이 깨질 수 있습니다. 새로고침 후 다시 시도해 주세요.`)
  if (report.overflow.length) {
    const outside = report.overflow.some((o) => o.includes('카드 밖'))
    problems.push(`카드 ${n}: ${report.overflow.join('·')} — ${outside ? '카드 안으로 옮겨 주세요.' : '글이 잘립니다. 글을 줄이거나 상자를 키워 주세요.'}`)
  }
  if (!report.footerOk) problems.push(`카드 ${n}: ${card.siteUrl} 주소가 보이지 않습니다.`)
  return { blob: await canvasToPng(canvas), problems, repaired: report.footerRepaired }
}
