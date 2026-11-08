// 엑셀 범위를 그림(PNG)으로: 화면과 같은 서식(채우기·테두리·글꼴·맞춤·병합)으로 캔버스에 그린다.
// 카카오톡·문서 등에 그림으로 붙여넣거나 PNG 파일로 저장할 때 쓴다.
import { cellRef, type Range, type Workbook, type XSheet } from '../office/xlsx'
import { cellCss, colWidth, mergeLayout, mergeOrigin, rowHeight } from './sheetRender'

const GRID = '#d9d9d9'
const PAD = 3

type Border = { width: number; style: string; color: string }
function parseBorder(v: unknown): Border | null {
  if (typeof v !== 'string') return null
  const m = /^(\d+)px\s+(\w+)\s+(.+)$/.exec(v.trim())
  return m ? { width: Number(m[1]), style: m[2], color: m[3] } : null
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, b: Border) {
  const draw = (off: number, w: number) => {
    ctx.beginPath()
    ctx.lineWidth = w
    ctx.strokeStyle = b.color
    ctx.setLineDash(b.style === 'dashed' ? [4, 2] : b.style === 'dotted' ? [1, 2] : [])
    const vertical = x1 === x2
    ctx.moveTo(x1 + (vertical ? off : 0), y1 + (vertical ? 0 : off))
    ctx.lineTo(x2 + (vertical ? off : 0), y2 + (vertical ? 0 : off))
    ctx.stroke()
  }
  if (b.style === 'double') {
    draw(-1, 1)
    draw(1, 1)
  } else draw(0, b.width)
  ctx.setLineDash([])
}

/** 줄바꿈 칸: 칸 너비에 맞춰 글을 여러 줄로 나눈다 */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const ch of para) {
      if (ctx.measureText(cur + ch).width > width && cur) {
        // 공백에서 끊을 수 있으면 단어 단위로
        const sp = cur.lastIndexOf(' ')
        if (sp > 0 && ch !== ' ') {
          out.push(cur.slice(0, sp))
          cur = cur.slice(sp + 1) + ch
        } else {
          out.push(cur)
          cur = ch === ' ' ? '' : ch
        }
      } else cur += ch
    }
    out.push(cur)
  }
  return out
}

/** 범위를 캔버스에 그린다. grid: 눈금선 표시 */
export function renderRange(wb: Workbook, sheet: XSheet, range: Range, grid = true): HTMLCanvasElement {
  const cols: number[] = []
  const rows: number[] = []
  for (let c = range.c1; c <= range.c2; c++) if (colWidth(sheet, c) > 0) cols.push(c)
  for (let r = range.r1; r <= range.r2; r++) if (rowHeight(sheet, r) > 0) rows.push(r)
  const xs = [0]
  for (const c of cols) xs.push(xs[xs.length - 1] + colWidth(sheet, c))
  const ys = [0]
  for (const r of rows) ys.push(ys[ys.length - 1] + rowHeight(sheet, r))
  const W = xs[xs.length - 1] + 1
  const H = ys[ys.length - 1] + 1
  // 선명하게 2배로 그리되, 너무 큰 그림은 줄인다 (브라우저 캔버스 한도)
  const scale = Math.max(0.5, Math.min(2, 12000 / Math.max(W, H)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(W * scale)
  canvas.height = Math.ceil(H * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  const family = getComputedStyle(document.body).fontFamily

  const { spans, covered } = mergeLayout(sheet, range)
  const colIdx = new Map(cols.map((c, i) => [c, i]))
  const rowIdx = new Map(rows.map((r, i) => [r, i]))
  type Box = { x: number; y: number; w: number; h: number; css: ReturnType<typeof cellCss>; text: string }
  const boxes: Box[] = []
  for (const r of rows)
    for (const c of cols) {
      const k = cellRef(r, c)
      if (covered.has(k)) continue
      const span = spans.get(k) ?? { rows: 1, cols: 1 }
      const ci = colIdx.get(c)!
      const ri = rowIdx.get(r)!
      const x = xs[ci] + 0.5
      const y = ys[ri] + 0.5
      const w = xs[Math.min(ci + span.cols, cols.length)] - xs[ci]
      const h = ys[Math.min(ri + span.rows, rows.length)] - ys[ri]
      const origin = spans.has(k) ? mergeOrigin(sheet, r, c) : k
      const v = sheet.cells.get(origin)
      boxes.push({ x, y, w, h, css: cellCss(wb, sheet, origin, v), text: v?.value ?? '' })
    }

  // 1) 채우기 → 2) 눈금선 → 3) 테두리 → 4) 글자 (엑셀과 같은 순서)
  for (const b of boxes) {
    if (b.css.backgroundColor) {
      ctx.fillStyle = String(b.css.backgroundColor)
      ctx.fillRect(b.x - 0.5, b.y - 0.5, b.w, b.h)
    }
  }
  if (grid) {
    const g: Border = { width: 1, style: 'solid', color: GRID }
    for (const b of boxes) {
      if (b.css.backgroundColor) continue // 색 칸에는 엑셀도 눈금선이 안 보임
      line(ctx, b.x, b.y, b.x + b.w, b.y, g)
      line(ctx, b.x, b.y, b.x, b.y + b.h, g)
      line(ctx, b.x + b.w, b.y, b.x + b.w, b.y + b.h, g)
      line(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h, g)
    }
  }
  for (const b of boxes) {
    const t = parseBorder(b.css.borderTop)
    const bt = parseBorder(b.css.borderBottom)
    const l = parseBorder(b.css.borderLeft)
    const rt = parseBorder(b.css.borderRight)
    if (t) line(ctx, b.x, b.y, b.x + b.w, b.y, t)
    if (bt) line(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h, bt)
    if (l) line(ctx, b.x, b.y, b.x, b.y + b.h, l)
    if (rt) line(ctx, b.x + b.w, b.y, b.x + b.w, b.y + b.h, rt)
  }
  for (const b of boxes) {
    if (!b.text) continue
    const css = b.css
    const size = parseFloat(String(css.fontSize)) || 15
    ctx.font = `${css.fontStyle === 'italic' ? 'italic ' : ''}${css.fontWeight ?? 400} ${size}px ${css.fontFamily ?? family}`
    ctx.fillStyle = String(css.color ?? '#000')
    const padL = typeof css.paddingLeft === 'string' ? parseFloat(css.paddingLeft) : PAD
    const inner = b.w - padL - PAD
    const lines = css.whiteSpace === 'pre-wrap' ? wrapLines(ctx, b.text, inner) : b.text.split('\n')
    const lh = size * 1.25
    const total = lh * lines.length
    const va = css.verticalAlign
    let y0 = va === 'top' ? b.y + PAD + size : va === 'middle' ? b.y + (b.h - total) / 2 + size * 0.95 : b.y + b.h - PAD - total + size * 0.95
    ctx.save()
    ctx.beginPath()
    ctx.rect(b.x, b.y, b.w, b.h) // 칸 밖으로 넘치는 글자는 자른다
    ctx.clip()
    for (const ln of lines) {
      const tw = ctx.measureText(ln).width
      const align = css.textAlign
      const x = align === 'center' ? b.x + (b.w - tw) / 2 : align === 'right' ? b.x + b.w - PAD - tw : b.x + padL
      ctx.fillText(ln, x, y0)
      const deco = String(css.textDecoration ?? '')
      if (deco.includes('underline')) ctx.fillRect(x, y0 + 2, tw, 1)
      if (deco.includes('line-through')) ctx.fillRect(x, y0 - size * 0.32, tw, 1)
      y0 += lh
    }
    ctx.restore()
  }
  return canvas
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('그림을 만들지 못했습니다.'))), 'image/png'))

/** 그림으로 복사: 클립보드에 PNG 를 넣는다. 실패하면 false */
export async function copyRangeImage(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false
    // 사용자 클릭 직후에 바로 write 를 불러야 브라우저가 허용한다 (그림은 Promise 로 넘김)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(canvas) })])
    return true
  } catch {
    return false
  }
}

export async function rangeImageBlob(canvas: HTMLCanvasElement) {
  return toBlob(canvas)
}
