// 엑셀(.xlsx) 읽기·간단 수정·저장. 원본 ZIP을 그대로 두고 고친 시트 XML만 바꿔 넣으므로
// 서식·차트·그림 등 이 화면이 모르는 내용은 그대로 남는다.
import JSZip from 'jszip'
import { attr, baseName, child, children, loadZip, mainPart, makeEl, parseXml, readRels, readXml, removePart, writeXml } from './ooxml'
import { readCellStyles, readTheme, type CellStyle } from './xlstyle'

export type XCell = {
  /** 화면에 보이는 값 */
  value: string
  /** 수정 칸에 넣을 값 (수식은 '='로 시작) */
  input: string
  num?: boolean
  /** 고친 수식이라 아직 계산값이 없음 (엑셀에서 열면 계산) */
  pending?: boolean
  /** 고칠 수 없는 이유 */
  locked?: string
}
/** 셀 범위 (1부터, 양 끝 포함) */
export type Range = { r1: number; c1: number; r2: number; c2: number }
export type Merge = { r: number; c: number; rows: number; cols: number }
export type XSheet = {
  name: string
  path: string
  hidden: boolean
  doc: Document
  cells: Map<string, XCell>
  /** 내용이 있는 마지막 행·열 (1부터) */
  rows: number
  cols: number
  merges: Merge[]
  /** 열 너비(px), 열 번호(1부터) → 너비 */
  widths: Map<number, number>
  /** 행 높이(px), 행 번호 → 높이 (0 = 숨긴 행) */
  heights: Map<number, number>
  /** 셀 서식 번호 (값이 없어도 서식만 있는 칸 포함) */
  styleOf: Map<string, number>
  /** 기본 열 너비·행 높이(px) */
  defaultWidth: number
  defaultHeight: number
  /** 엑셀에 저장된 화면 배율(%) */
  zoom: number
  /** 엑셀 인쇄 설정의 가로 방향 여부 */
  landscape: boolean
  /** 인쇄 영역 */
  printArea: Range | null
  /** <sheets> 안의 순서 (인쇄 영역 이름의 localSheetId) */
  bookIndex: number
}
export type Workbook = {
  kind: 'xlsx'
  fileName: string
  zip: JSZip
  bookPath: string
  sheets: XSheet[]
  styles: { date: Set<number>; percent: Set<number>; fixed: Map<number, number>; comma: Set<number> }
  date1904: boolean
  changed: Set<number>
  formulaChanged: boolean
  /** 지금 보고 있는 시트 (CSV 저장에 씀) */
  active: number
  /** 셀 서식 목록 (styles.xml cellXfs 순서) */
  cellStyles: CellStyle[]
  printAreaChanged: boolean
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ── 셀 주소 ─────────────────────────────────────────
export function colName(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
export function cellRef(r: number, c: number) {
  return colName(c) + r
}
export function parseRef(ref: string): { r: number; c: number } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim())
  if (!m) return { r: 0, c: 0 }
  let c = 0
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: Number(m[2]), c }
}

// ── 숫자·날짜 표시 ───────────────────────────────────
// 기본 날짜 서식 번호 (한국어·중국어·일본어 엑셀의 날짜 서식 27~36, 50~58 포함)
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

function isDateFormat(code: string) {
  const s = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[ymdhs]/i.test(s) && !/general/i.test(s)
}

function readStyles(doc: Document | null): Workbook['styles'] {
  const styles: Workbook['styles'] = { date: new Set(), percent: new Set(), fixed: new Map(), comma: new Set() }
  if (!doc) return styles
  const custom = new Map<number, string>()
  for (const f of Array.from(doc.getElementsByTagNameNS(doc.documentElement.namespaceURI, 'numFmt'))) {
    custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '')
  }
  const xfs = doc.getElementsByTagNameNS(doc.documentElement.namespaceURI, 'cellXfs')[0]
  if (!xfs) return styles
  children(xfs, 'xf').forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0)
    const code = custom.get(id)
    if (BUILTIN_DATE.has(id) || (code && isDateFormat(code))) styles.date.add(i)
    else if (id === 9 || id === 10 || (code && /%/.test(code))) styles.percent.add(i)
    else if (id === 2) styles.fixed.set(i, 2)
    else if (id === 3) styles.comma.add(i)
    else if (id === 4) {
      styles.comma.add(i)
      styles.fixed.set(i, 2)
    }
  })
  return styles
}

function epoch(wb: Workbook) {
  return wb.date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
}
const pad = (n: number) => String(n).padStart(2, '0')

function serialToText(wb: Workbook, serial: number) {
  const d = new Date(epoch(wb) + Math.round(serial * 86400) * 1000)
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const secs = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${d.getUTCSeconds() ? `:${pad(d.getUTCSeconds())}` : ''}`
  if (serial < 1 && serial >= 0) return time
  return secs ? `${date} ${time}` : date
}

function textToSerial(wb: Workbook, text: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim())
  if (!m) return null
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  return Math.round(((ms - epoch(wb)) / 86400000) * 1e8) / 1e8
}

function numberText(wb: Workbook, raw: string, style: number) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (wb.styles.date.has(style)) return serialToText(wb, n)
  if (wb.styles.percent.has(style)) return `${parseFloat((n * 100).toPrecision(12))}%`
  const fixed = wb.styles.fixed.get(style)
  if (wb.styles.comma.has(style)) return n.toLocaleString('ko-KR', { minimumFractionDigits: fixed ?? 0, maximumFractionDigits: fixed ?? 0 })
  if (fixed !== undefined) return n.toFixed(fixed)
  return String(parseFloat(n.toPrecision(15)))
}

// ── 읽기 ────────────────────────────────────────────
function sharedText(si: Element): string {
  let s = ''
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.localName === 'rPh' || c.localName === 'phoneticPr') continue // 일본어 읽는 법 표기는 뺀다
      if (c.localName === 't') s += c.textContent ?? ''
      else walk(c)
    }
  }
  walk(si)
  return s
}

/** 행·셀의 r 속성이 빠진 파일도 있어서(생략 가능) 열 때 모두 채워 둔다 */
function normalizeRefs(sheetData: Element) {
  let r = 0
  for (const row of children(sheetData, 'row')) {
    r = Number(row.getAttribute('r')) || r + 1
    row.setAttribute('r', String(r))
    let c = 0
    for (const cell of children(row, 'c')) {
      const ref = cell.getAttribute('r')
      c = ref ? parseRef(ref).c : c + 1
      cell.setAttribute('r', cellRef(r, c))
    }
  }
}

function readCell(wb: Workbook, el: Element, shared: string[]): XCell {
  const t = el.getAttribute('t') ?? 'n'
  const style = Number(el.getAttribute('s') ?? 0)
  const v = child(el, 'v')?.textContent ?? ''
  const f = child(el, 'f')
  let value: string
  let num = false
  if (t === 's') value = shared[Number(v)] ?? ''
  else if (t === 'inlineStr') {
    const is = child(el, 'is')
    value = is ? sharedText(is) : ''
  } else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
  else if (t === 'str' || t === 'e' || t === 'd') value = v
  else {
    value = v === '' ? '' : numberText(wb, v, style)
    num = v !== ''
  }
  const cell: XCell = { value, input: value, num }
  if (f) {
    const text = f.textContent ?? ''
    if (text) cell.input = `=${text}`
    // 계산값이 저장되지 않은 수식(다른 프로그램이 만든 파일)은 수식을 그대로 보여 준다
    if (text && value === '') {
      cell.value = cell.input
      cell.pending = true
      cell.num = false
    }
    if (f.getAttribute('t') === 'shared' && text && f.getAttribute('ref')) {
      cell.locked = '여러 칸이 함께 쓰는 수식(공유 수식)의 기준 칸이라 여기서는 고칠 수 없습니다. 엑셀에서 고쳐 주세요.'
    }
  }
  return cell
}

async function readSheet(wb: Workbook, name: string, path: string, hidden: boolean, shared: string[], bookIndex: number): Promise<XSheet> {
  const doc = await readXml(wb.zip, path)
  if (!doc) throw new Error(`시트 "${name}" 파일이 없습니다.`)
  const root = doc.documentElement
  const fmt = child(root, 'sheetFormatPr')
  const view = child(child(root, 'sheetViews') ?? root, 'sheetView')
  const setup = child(root, 'pageSetup')
  const sheet: XSheet = {
    name,
    path,
    hidden,
    doc,
    cells: new Map(),
    rows: 0,
    cols: 0,
    merges: [],
    widths: new Map(),
    heights: new Map(),
    styleOf: new Map(),
    defaultWidth: Math.round((Number(fmt?.getAttribute('defaultColWidth')) || (Number(fmt?.getAttribute('baseColWidth')) || 8) + 0.71) * 7 + 5),
    defaultHeight: Math.round(((Number(fmt?.getAttribute('defaultRowHeight')) || 15) * 4) / 3),
    zoom: Number(view?.getAttribute('zoomScale')) || 100,
    landscape: setup?.getAttribute('orientation') === 'landscape',
    printArea: null,
    bookIndex,
  }
  const sheetData = child(root, 'sheetData')
  if (sheetData) {
    normalizeRefs(sheetData)
    for (const row of children(sheetData, 'row')) {
      const r = Number(row.getAttribute('r'))
      const ht = Number(row.getAttribute('ht'))
      if (row.getAttribute('hidden') === '1') sheet.heights.set(r, 0)
      else if (ht) sheet.heights.set(r, Math.round((ht * 4) / 3))
      for (const c of children(row, 'c')) {
        const ref = c.getAttribute('r')!
        const s = Number(c.getAttribute('s') ?? 0)
        if (s) sheet.styleOf.set(ref, s)
        const cell = readCell(wb, c, shared)
        if (cell.value === '' && !child(c, 'f')) continue
        const { c: col } = parseRef(ref)
        sheet.cells.set(ref, cell)
        sheet.rows = Math.max(sheet.rows, r)
        sheet.cols = Math.max(sheet.cols, col)
      }
    }
  }
  const mergeEl = child(root, 'mergeCells')
  for (const m of mergeEl ? children(mergeEl, 'mergeCell') : []) {
    const [a, b] = (m.getAttribute('ref') ?? '').split(':')
    if (!a || !b) continue
    const s = parseRef(a)
    const e = parseRef(b)
    sheet.merges.push({ r: s.r, c: s.c, rows: e.r - s.r + 1, cols: e.c - s.c + 1 })
    // 병합 칸에만 서식이 있는 표도 내용 범위에 넣는다
    sheet.rows = Math.max(sheet.rows, e.r)
    sheet.cols = Math.max(sheet.cols, e.c)
  }
  const colsEl = child(root, 'cols')
  for (const col of colsEl ? children(colsEl, 'col') : []) {
    const w = Number(col.getAttribute('width'))
    const hide = col.getAttribute('hidden') === '1'
    if (!w && !hide) continue
    const min = Number(col.getAttribute('min'))
    const max = Math.min(Number(col.getAttribute('max')), min + 500)
    for (let i = min; i <= max; i++) sheet.widths.set(i, hide ? 0 : Math.round(w * 7 + 5))
  }
  return sheet
}

async function readWorkbook(zip: JSZip, fileName: string): Promise<Workbook> {
  const bookPath = await mainPart(zip, 'xl/workbook.xml')
  const book = await readXml(zip, bookPath)
  if (!book || book.documentElement.localName !== 'workbook') throw new Error('엑셀 통합 문서(.xlsx)가 아닙니다.')
  const rels = await readRels(zip, bookPath)
  const relPath = (suffix: string) => rels.find((r) => r.type.endsWith(suffix))?.target
  const stylesDoc = await readXml(zip, relPath('/styles') ?? 'xl/styles.xml')
  const theme = readTheme(await readXml(zip, relPath('/theme') ?? 'xl/theme/theme1.xml'))
  const wb: Workbook = {
    kind: 'xlsx',
    fileName,
    zip,
    bookPath,
    sheets: [],
    styles: readStyles(stylesDoc),
    cellStyles: readCellStyles(stylesDoc, theme),
    printAreaChanged: false,
    date1904: ['1', 'true'].includes(attr(child(book.documentElement, 'workbookPr'), 'date1904') ?? ''),
    changed: new Set(),
    formulaChanged: false,
    active: 0,
  }
  const sst = await readXml(zip, relPath('/sharedStrings') ?? 'xl/sharedStrings.xml')
  const shared = sst ? children(sst.documentElement, 'si').map(sharedText) : []
  const sheetsEl = child(book.documentElement, 'sheets')
  const sheetEls = sheetsEl ? children(sheetsEl, 'sheet') : []
  for (const [bookIndex, s] of sheetEls.entries()) {
    const rel = rels.find((r) => r.id === attr(s, 'id'))
    if (!rel || !rel.type.endsWith('/worksheet')) continue // 차트 시트 등은 건너뛴다
    const state = s.getAttribute('state')
    wb.sheets.push(await readSheet(wb, s.getAttribute('name') ?? '시트', rel.target, state === 'hidden' || state === 'veryHidden', shared, bookIndex))
  }
  if (!wb.sheets.length) throw new Error('이 파일에는 볼 수 있는 시트가 없습니다.')
  // 인쇄 영역 (이름 _xlnm.Print_Area)
  const names = child(book.documentElement, 'definedNames')
  for (const n of names ? children(names, 'definedName') : []) {
    if (n.getAttribute('name') !== '_xlnm.Print_Area') continue
    const sheet = wb.sheets.find((sh) => sh.bookIndex === Number(n.getAttribute('localSheetId')))
    if (sheet) sheet.printArea = parsePrintArea(n.textContent ?? '', sheet)
  }
  return wb
}

export async function openXlsx(file: Blob, fileName: string): Promise<Workbook> {
  return readWorkbook(await loadZip(file), fileName)
}

// ── 인쇄 영역 ───────────────────────────────────────
/** "'시트'!$A$1:$G$40" → 범위 (여러 범위면 첫 번째, 열·행 전체 지정도 처리) */
function parsePrintArea(text: string, sheet: XSheet): Range | null {
  let first = ''
  let quoted = false
  for (const ch of text) {
    if (ch === "'") quoted = !quoted
    if (ch === ',' && !quoted) break
    first += ch
  }
  const ref = first.slice(first.lastIndexOf('!') + 1).replace(/\$/g, '')
  const [a, b = a] = ref.split(':')
  const col = (x: string) => parseRef(`${x}1`).c
  if (/^[A-Z]+$/i.test(a) && /^[A-Z]+$/i.test(b)) return { r1: 1, c1: col(a), r2: Math.max(sheet.rows, 1), c2: col(b) }
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return { r1: Number(a), c1: 1, r2: Number(b), c2: Math.max(sheet.cols, 1) }
  const s = parseRef(a)
  const e = parseRef(b)
  if (!s.r || !e.r) return null
  return { r1: Math.min(s.r, e.r), c1: Math.min(s.c, e.c), r2: Math.max(s.r, e.r), c2: Math.max(s.c, e.c) }
}

export function rangeText(r: Range) {
  const a = cellRef(r.r1, r.c1)
  const b = cellRef(r.r2, r.c2)
  return a === b ? a : `${a}:${b}`
}

/** 인쇄 영역 지정·해제 (저장하면 엑셀에서도 같은 인쇄 영역이 쓰인다) */
export function setPrintArea(wb: Workbook, sheetIndex: number, range: Range | null) {
  wb.sheets[sheetIndex].printArea = range
  wb.printAreaChanged = true
}

async function writePrintAreas(wb: Workbook) {
  const book = parseXml(await wb.zip.file(wb.bookPath)!.async('string'))
  const root = book.documentElement
  const ns = root.namespaceURI ?? MAIN
  let names = child(root, 'definedNames')
  if (names) for (const n of children(names, 'definedName')) if (n.getAttribute('name') === '_xlnm.Print_Area') names.removeChild(n)
  for (const sheet of wb.sheets) {
    if (!sheet.printArea) continue
    if (!names) {
      names = makeEl(book, ns, 'definedNames', root)
      // definedNames 는 sheets(·functionGroups·externalReferences) 다음, calcPr 앞 자리
      const after = ['calcPr', 'oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst']
      root.insertBefore(names, Array.from(root.children).find((el) => after.includes(el.localName)) ?? null)
    }
    const n = makeEl(book, ns, 'definedName', root)
    n.setAttribute('name', '_xlnm.Print_Area')
    n.setAttribute('localSheetId', String(sheet.bookIndex))
    const p = sheet.printArea
    n.textContent = `'${sheet.name.replace(/'/g, "''")}'!$${colName(p.c1)}$${p.r1}:$${colName(p.c2)}$${p.r2}`
    names.appendChild(n)
  }
  if (names && !names.children.length) root.removeChild(names)
  writeXml(wb.zip, wb.bookPath, book)
  wb.printAreaChanged = false
}

// ── 새 문서 ─────────────────────────────────────────
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export async function newXlsx(): Promise<Workbook> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    HEAD + `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
  )
  zip.file('xl/worksheets/sheet1.xml', HEAD + `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><sheetData/></worksheet>`)
  zip.file(
    'xl/styles.xml',
    HEAD +
      `<styleSheet xmlns="${MAIN}">` +
      '<fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="표준" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
  )
  return readWorkbook(zip, '새 엑셀.xlsx')
}

// ── 고치기 ──────────────────────────────────────────
function findOrCreate(parent: Element, local: string, key: number, keyOf: (el: Element) => number, create: () => Element): Element {
  const list = children(parent, local)
  for (const el of list) {
    const k = keyOf(el)
    if (k === key) return el
    if (k > key) {
      const made = create()
      parent.insertBefore(made, el)
      return made
    }
  }
  const made = create()
  const last = list[list.length - 1]
  if (last) last.after(made)
  else parent.appendChild(made)
  return made
}

/** 셀 하나를 고친다. 입력이 '='로 시작하면 수식, 숫자면 숫자, 나머지는 글자로 넣는다. */
export function setCell(wb: Workbook, sheetIndex: number, ref: string, input: string): XCell {
  const sheet = wb.sheets[sheetIndex]
  const old = sheet.cells.get(ref)
  if (old?.locked) throw new Error(old.locked)
  const doc = sheet.doc
  const root = doc.documentElement
  const ns = root.namespaceURI ?? MAIN
  let sheetData = child(root, 'sheetData')
  if (!sheetData) {
    sheetData = makeEl(doc, ns, 'sheetData', root)
    root.appendChild(sheetData)
  }
  const { r, c } = parseRef(ref)
  const row = findOrCreate(sheetData, 'row', r, (el) => Number(el.getAttribute('r')), () => {
    const el = makeEl(doc, ns, 'row', root)
    el.setAttribute('r', String(r))
    return el
  })
  row.removeAttribute('spans') // 행의 열 범위 힌트(선택 항목) — 바뀔 수 있으니 뺀다
  const cell = findOrCreate(row, 'c', c, (el) => parseRef(el.getAttribute('r') ?? '').c, () => {
    const el = makeEl(doc, ns, 'c', root)
    el.setAttribute('r', ref)
    return el
  })
  const hadFormula = !!child(cell, 'f')
  for (const k of Array.from(cell.children)) k.remove()
  cell.removeAttribute('t')
  cell.removeAttribute('cm')
  cell.removeAttribute('vm')
  const style = Number(cell.getAttribute('s') ?? 0)
  const add = (local: string, text: string, preserve = false) => {
    const el = makeEl(doc, ns, local, root)
    el.textContent = text
    if (preserve) el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
    return el
  }

  const text = input.replace(/\r\n?/g, '\n')
  const trimmed = text.trim()
  let result: XCell
  if (text === '') {
    if (!cell.hasAttribute('s')) cell.remove()
    result = { value: '', input: '' }
  } else if (trimmed.startsWith('=') && trimmed.length > 1) {
    cell.appendChild(add('f', trimmed.slice(1)))
    wb.formulaChanged = true
    result = { value: trimmed, input: trimmed, pending: true }
  } else {
    let number: number | null = null
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) number = Number(trimmed)
    else if (wb.styles.date.has(style)) number = textToSerial(wb, trimmed)
    else if (wb.styles.percent.has(style) && /^[-+]?\d+(\.\d+)?%$/.test(trimmed)) number = Number(trimmed.slice(0, -1)) / 100
    if (number !== null && Number.isFinite(number)) {
      cell.appendChild(add('v', String(number)))
      const value = numberText(wb, String(number), style)
      result = { value, input: value, num: true }
    } else if (/^(true|false)$/i.test(trimmed)) {
      cell.setAttribute('t', 'b')
      cell.appendChild(add('v', /^true$/i.test(trimmed) ? '1' : '0'))
      result = { value: trimmed.toUpperCase(), input: trimmed.toUpperCase() }
    } else {
      cell.setAttribute('t', 'inlineStr')
      const is = makeEl(doc, ns, 'is', root)
      is.appendChild(add('t', text, true))
      cell.appendChild(is)
      result = { value: text, input: text }
    }
  }
  if (hadFormula) wb.formulaChanged = true

  if (result.value === '' && !result.pending) sheet.cells.delete(ref)
  else {
    sheet.cells.set(ref, result)
    sheet.rows = Math.max(sheet.rows, r)
    sheet.cols = Math.max(sheet.cols, c)
  }
  wb.changed.add(sheetIndex)
  return result
}

// ── 저장 ────────────────────────────────────────────
export async function saveXlsx(wb: Workbook): Promise<Blob> {
  for (const i of wb.changed) {
    const sheet = wb.sheets[i]
    const dim = child(sheet.doc.documentElement, 'dimension')
    if (dim) dim.setAttribute('ref', sheet.rows && sheet.cols ? `A1:${cellRef(sheet.rows, sheet.cols)}` : 'A1')
    writeXml(wb.zip, sheet.path, sheet.doc)
  }
  if (wb.changed.size) {
    // 계산 순서 기록(calcChain)은 고친 수식과 어긋나면 엑셀이 "복구" 메시지를 띄우므로 지운다(엑셀이 다시 만든다)
    const rels = await readRels(wb.zip, wb.bookPath)
    const chain = rels.find((r) => r.type.endsWith('/calcChain'))
    if (chain) await removePart(wb.zip, wb.bookPath, chain.target)
  }
  if (wb.formulaChanged) {
    // 고친 수식은 계산값이 비어 있으니, 열 때 전체를 다시 계산하게 한다
    const book = parseXml(await wb.zip.file(wb.bookPath)!.async('string'))
    const root = book.documentElement
    let calc = child(root, 'calcPr')
    if (!calc) {
      calc = makeEl(book, root.namespaceURI ?? MAIN, 'calcPr', root)
      // calcPr 은 sheets·definedNames 다음 자리에 와야 한다
      const after = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst']
      const next = Array.from(root.children).find((el) => after.includes(el.localName))
      root.insertBefore(calc, next ?? null)
    }
    calc.setAttribute('fullCalcOnLoad', '1')
    writeXml(wb.zip, wb.bookPath, book)
  }
  if (wb.printAreaChanged) await writePrintAreas(wb)
  wb.changed.clear()
  wb.formulaChanged = false
  return wb.zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' })
}

/** 지금 시트를 CSV로 (엑셀에서 한글이 깨지지 않게 BOM 포함) */
export function sheetToCsv(sheet: XSheet): Blob {
  const lines: string[] = []
  for (let r = 1; r <= sheet.rows; r++) {
    const row: string[] = []
    for (let c = 1; c <= sheet.cols; c++) {
      const v = sheet.cells.get(cellRef(r, c))?.value ?? ''
      row.push(/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    }
    lines.push(row.join(','))
  }
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

export function xlsxFileName(wb: Workbook) {
  return `${baseName(wb.fileName)}.xlsx`
}
