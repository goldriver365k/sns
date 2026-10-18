import { FOOTER_FONT, getDesign, type FontSpec } from './designs'

const css = (f: FontSpec, size = 40) => `${f.weight} ${size}px "${f.family}"`

/**
 * 카드에 쓰는 폰트를 실제 글자 기준으로 모두 내려받은 뒤 확인한다.
 * (한글 폰트는 글자 범위별로 나뉘어 있어, 쓰인 글자를 넘겨야 그 범위가 로드된다)
 * 하나라도 준비되지 않으면 false — 한글 깨짐 위험이 있으므로 다운로드를 막는다.
 */
export async function ensureFonts(designId: string, text: string): Promise<boolean> {
  const d = getDesign(designId)
  const sample = text || '가나다'
  const specs = [d.title, d.body, FOOTER_FONT]
  try {
    await Promise.all(specs.map((f) => document.fonts.load(css(f), sample)))
    await document.fonts.ready
    return specs.every((f) => document.fonts.check(css(f), sample))
  } catch {
    return false
  }
}
