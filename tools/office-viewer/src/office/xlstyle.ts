// 엑셀 셀 서식(글꼴·채우기·테두리·맞춤)을 화면·인쇄용 CSS로 바꾼다.
// 색은 RGB·기본 색표(indexed)·테마 색(밝게/어둡게 포함)을 읽는다.
import { attr, child, children } from './ooxml'

export type CellStyle = {
  b?: boolean
  i?: boolean
  u?: boolean
  strike?: boolean
  /** 글자 크기(pt) */
  size?: number
  color?: string
  font?: string
  bg?: string
  h?: 'left' | 'center' | 'right' | 'justify'
  v?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  indent?: number
  border: { l?: string; r?: string; t?: string; b?: string }
}

// 엑셀 기본 색표 (indexed 8~63)
const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 ' +
  '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF ' +
  '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 ' +
  '003366 339966 003300 333300 993300 993366 333399 333333'
).split(' ')

// 테마를 못 읽었을 때 쓰는 오피스 기본 테마 색 (밝은1, 어두운1, 밝은2, 어두운2, 강조1~6, 링크, 방문한 링크)
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72']

/** theme1.xml 의 색 목록을 엑셀 테마 번호 순서로 */
export function readTheme(theme: Document | null): string[] {
  if (!theme) return DEFAULT_THEME
  const scheme = theme.getElementsByTagNameNS('*', 'clrScheme')[0]
  if (!scheme) return DEFAULT_THEME
  const get = (name: string, i: number) => {
    const el = child(scheme, name)
    const c = el?.firstElementChild
    return (c?.getAttribute('lastClr') ?? c?.getAttribute('val') ?? DEFAULT_THEME[i]).toUpperCase()
  }
  // 엑셀 테마 번호: 0=밝은1(lt1), 1=어두운1(dk1), 2=밝은2, 3=어두운2 (파일 안 순서와 앞뒤가 바뀜)
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(get)
}

function tint(hex: string, t: number) {
  const n = parseInt(hex, 16)
  let r = (n >> 16) / 255
  let g = ((n >> 8) & 255) / 255
  let b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t
  const f = (p: number, q: number, x: number) => {
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  if (s === 0) r = g = b = l
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = f(p, q, h + 1 / 3)
    g = f(p, q, h)
    b = f(p, q, h - 1 / 3)
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `${to(r)}${to(g)}${to(b)}`
}

/** <color rgb|indexed|theme tint> → #rrggbb (자동·없음이면 undefined) */
export function colorOf(el: Element | null, theme: string[]): string | undefined {
  if (!el || el.getAttribute('auto') === '1') return undefined
  let hex: string | undefined
  const rgb = el.getAttribute('rgb')
  const idx = el.getAttribute('indexed')
  const th = el.getAttribute('theme')
  if (rgb) hex = rgb.length === 8 ? rgb.slice(2) : rgb
  else if (idx !== null) {
    const i = Number(idx)
    if (i >= 64) return undefined // 64 = 시스템 글자색, 65 = 시스템 배경
    // 0~7 은 8~15 와 같은 색
    hex = INDEXED[i < 8 ? i : i - 8]
  } else if (th !== null) hex = theme[Number(th)]
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return undefined
  const t = Number(el.getAttribute('tint') ?? 0)
  return `#${t ? tint(hex, t) : hex}`
}

const BORDER: Record<string, string> = {
  thin: '1px solid',
  hair: '1px solid',
  dotted: '1px dotted',
  dashed: '1px dashed',
  dashDot: '1px dashed',
  dashDotDot: '1px dashed',
  slantDashDot: '1px dashed',
  medium: '2px solid',
  mediumDashed: '2px dashed',
  mediumDashDot: '2px dashed',
  mediumDashDotDot: '2px dashed',
  thick: '3px solid',
  double: '3px double',
}

/** styles.xml 의 cellXfs 순서대로 셀 서식 목록을 만든다 */
export function readCellStyles(doc: Document | null, theme: string[]): CellStyle[] {
  if (!doc) return []
  const root = doc.documentElement
  const list = (parent: string, item: string) => {
    const p = child(root, parent)
    return p ? children(p, item) : []
  }
  const fonts = list('fonts', 'font').map((f) => {
    const val = (name: string) => child(f, name)
    const on = (name: string) => {
      const el = val(name)
      return !!el && !['0', 'false'].includes(attr(el, 'val') ?? '')
    }
    const u = val('u')
    return {
      b: on('b') || undefined,
      i: on('i') || undefined,
      u: (!!u && attr(u, 'val') !== 'none') || undefined,
      strike: on('strike') || undefined,
      size: Number(attr(val('sz'), 'val')) || undefined,
      color: colorOf(val('color'), theme),
      font: attr(val('name'), 'val') ?? undefined,
    }
  })
  const fills = list('fills', 'fill').map((f) => {
    const p = child(f, 'patternFill')
    if (!p) {
      // 그라데이션 채우기는 첫 색만 쓴다
      const stop = f.getElementsByTagNameNS('*', 'stop')[0]
      return stop ? colorOf(child(stop, 'color'), theme) : undefined
    }
    const type = p.getAttribute('patternType')
    if (!type || type === 'none') return undefined
    if (type === 'gray125' || type === 'gray0625') return undefined
    return colorOf(child(p, 'fgColor'), theme) ?? colorOf(child(p, 'bgColor'), theme)
  })
  const borders = list('borders', 'border').map((b) => {
    const side = (name: string) => {
      const el = child(b, name)
      const style = el?.getAttribute('style')
      if (!el || !style || !BORDER[style]) return undefined
      return `${BORDER[style]} ${colorOf(child(el, 'color'), theme) ?? '#000'}`
    }
    return { l: side('left') ?? side('start'), r: side('right') ?? side('end'), t: side('top'), b: side('bottom') }
  })
  return list('cellXfs', 'xf').map((xf) => {
    const font = fonts[Number(xf.getAttribute('fontId') ?? 0)] ?? {}
    const al = child(xf, 'alignment')
    const hor = al?.getAttribute('horizontal')
    const ver = al?.getAttribute('vertical')
    return {
      ...font,
      bg: fills[Number(xf.getAttribute('fillId') ?? 0)],
      border: borders[Number(xf.getAttribute('borderId') ?? 0)] ?? {},
      h: hor === 'center' || hor === 'centerContinuous' ? 'center' : hor === 'right' ? 'right' : hor === 'left' ? 'left' : hor === 'justify' || hor === 'distributed' ? 'justify' : undefined,
      v: ver === 'top' ? 'top' : ver === 'center' || ver === 'justify' || ver === 'distributed' ? 'middle' : 'bottom',
      wrap: al?.getAttribute('wrapText') === '1' || al?.getAttribute('wrapText') === 'true' || undefined,
      indent: Number(al?.getAttribute('indent') ?? 0) || undefined,
    }
  })
}
