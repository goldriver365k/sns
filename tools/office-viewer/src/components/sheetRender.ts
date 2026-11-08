// 엑셀 표를 그릴 때 화면과 인쇄가 함께 쓰는 계산
import type { CSSProperties } from 'react'
import { cellRef, type Range, type Workbook, type XCell, type XSheet } from '../office/xlsx'

const DEFAULT_PT = 11

/** 셀 서식 → CSS */
export function cellCss(wb: Workbook, sheet: XSheet, ref: string, cell: XCell | undefined): CSSProperties {
  const cs = wb.cellStyles[sheet.styleOf.get(ref) ?? 0]
  const css: CSSProperties = {
    fontSize: `${((cs?.size ?? DEFAULT_PT) * 4) / 3}px`,
    textAlign: cs?.h ?? (cell?.num ? 'right' : /^(TRUE|FALSE)$/.test(cell?.value ?? '') ? 'center' : 'left'),
    verticalAlign: cs?.v ?? 'bottom',
    whiteSpace: cs?.wrap ? 'pre-wrap' : 'pre',
  }
  if (!cs) return css
  if (cs.b) css.fontWeight = 700
  if (cs.i) css.fontStyle = 'italic'
  if (cs.u || cs.strike) css.textDecoration = [cs.u && 'underline', cs.strike && 'line-through'].filter(Boolean).join(' ')
  if (cs.color) css.color = cs.color
  if (cs.bg) css.backgroundColor = cs.bg
  if (cs.font) css.fontFamily = `"${cs.font}", var(--font-sans)`
  if (cs.indent) css.paddingLeft = `${cs.indent * 9 + 4}px`
  if (cs.border.l) css.borderLeft = cs.border.l
  if (cs.border.r) css.borderRight = cs.border.r
  if (cs.border.t) css.borderTop = cs.border.t
  if (cs.border.b) css.borderBottom = cs.border.b
  return css
}

export const colWidth = (sheet: XSheet, c: number) => sheet.widths.get(c) ?? sheet.defaultWidth
export const rowHeight = (sheet: XSheet, r: number) => sheet.heights.get(r) ?? sheet.defaultHeight

/** 서식(테두리·채우기)만 있는 칸까지 포함한 사용 범위 */
export function usedRange(sheet: XSheet): Range {
  let rows = sheet.rows
  let cols = sheet.cols
  for (const ref of sheet.styleOf.keys()) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)
    if (!m) continue
    const r = Number(m[2])
    const c = m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
    // 서식만 있는 칸은 아주 먼 곳까지 있을 수 있어(열 전체 서식 등) 내용 근처까지만 센다
    if (r <= sheet.rows + 50 && c <= sheet.cols + 20) {
      rows = Math.max(rows, r)
      cols = Math.max(cols, c)
    }
  }
  return { r1: 1, c1: 1, r2: Math.max(rows, 1), c2: Math.max(cols, 1) }
}

export type Span = { rows: number; cols: number }
/**
 * 범위 안에서 병합 칸 계산: 왼쪽 위 칸 → 차지하는 (보이는) 행·열 수, 가려지는 칸 목록.
 * 숨긴 행·열은 세지 않고, 범위 밖으로 나가는 부분은 잘라낸다.
 */
export function mergeLayout(sheet: XSheet, range: Range) {
  const spans = new Map<string, Span>()
  const covered = new Set<string>()
  for (const m of sheet.merges) {
    const r1 = Math.max(m.r, range.r1)
    const c1 = Math.max(m.c, range.c1)
    const r2 = Math.min(m.r + m.rows - 1, range.r2)
    const c2 = Math.min(m.c + m.cols - 1, range.c2)
    if (r1 > r2 || c1 > c2) continue
    let rows = 0
    let cols = 0
    for (let r = r1; r <= r2; r++) if (rowHeight(sheet, r) > 0) rows++
    for (let c = c1; c <= c2; c++) if (colWidth(sheet, c) > 0) cols++
    // 병합의 첫 칸이 범위 밖이면 범위 안 첫 칸이 내용을 대신 보여 준다
    const master = cellRef(r1, c1)
    spans.set(master, { rows: Math.max(rows, 1), cols: Math.max(cols, 1) })
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(cellRef(r, c))
  }
  return { spans, covered }
}

/** 병합 칸의 값·서식은 원래 왼쪽 위 칸에서 가져온다 */
export function mergeOrigin(sheet: XSheet, r: number, c: number): string {
  for (const m of sheet.merges) if (r >= m.r && r < m.r + m.rows && c >= m.c && c < m.c + m.cols) return cellRef(m.r, m.c)
  return cellRef(r, c)
}

export function inRange(range: Range | null, r: number, c: number) {
  return !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2
}

export function normRange(a: { r: number; c: number }, b: { r: number; c: number }): Range {
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) }
}

/** 엑셀에서 복사한 글(탭·줄바꿈 구분, 따옴표 처리) → 2차원 배열 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"' && cur === '') quoted = true
    else if (ch === '\t') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  row.push(cur)
  rows.push(row)
  return rows
}

export function toTsv(values: string[][]): string {
  return values.map((r) => r.map((v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t')).join('\r\n')
}

/**
 * 수식을 다른 칸에 붙여넣을 때 상대 참조를 옮긴다 (엑셀과 같음).
 * =A1+B$2 를 한 칸 아래로 → =A2+B$2. $ 가 붙은 쪽은 그대로, 따옴표 안 글자와 함수 이름(LOG10 등)은 건드리지 않는다.
 */
export function shiftFormula(input: string, dr: number, dc: number): string {
  if (!input.startsWith('=') || (dr === 0 && dc === 0)) return input
  const colNum = (s: string) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  const colStr = (n: number) => {
    let t = ''
    while (n > 0) {
      const m = (n - 1) % 26
      t = String.fromCharCode(65 + m) + t
      n = Math.floor((n - 1) / 26)
    }
    return t
  }
  return input
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => {
      if (i % 2 === 1) return part // "글자"
      return part.replace(/(^|[^A-Za-z0-9_.!'])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\dA-Za-z_(])/g, (_m, pre, dCol, col, dRow, row) => {
        const c = dCol ? colNum(col) : colNum(col) + dc
        const r = dRow ? Number(row) : Number(row) + dr
        if (c < 1 || r < 1 || c > 16384) return `${pre}#REF!`
        return `${pre}${dCol}${colStr(c)}${dRow}${r}`
      }).replace(/(!)(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\dA-Za-z_(])/g, (_m, bang, dCol, col, dRow, row) => {
        // 다른 시트 참조 (Sheet1!A1) 도 같은 규칙으로
        const c = dCol ? colNum(col) : colNum(col) + dc
        const r = dRow ? Number(row) : Number(row) + dr
        if (c < 1 || r < 1) return `${bang}#REF!`
        return `${bang}${dCol}${colStr(c)}${dRow}${r}`
      })
    })
    .join('')
}
