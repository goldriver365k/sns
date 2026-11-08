import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react'
import { flushSync } from 'react-dom'
import { cellRef, colName, rangeText, setCell, setCellStyle, setColWidths, setPrintArea, setRowHeights, type Range, type Workbook } from '../office/xlsx'
import { cellCss, colWidth, inRange, mergeLayout, mergeOrigin, normRange, parseTsv, rowHeight, shiftFormula, toTsv, usedRange } from './sheetRender'
import { SheetPrint, SheetPrintDialog, type SheetPrintJob } from './Print'
import { ZoomControl, loadZoom, saveZoom } from './Zoom'
import { copyRangeImage, rangeImageBlob, renderRange } from './sheetImage'
import { downloadBlob } from '../download'

const PAGE_ROWS = 500 // 한 번에 그리는 행 수 (큰 시트도 버벅이지 않게)
const MAX_COLS = 200
const HEAD_W = 44
const tool = 'rounded-lg px-2.5 py-1 text-sm text-ink hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-40'

type Pos = { r: number; c: number }
type SizeChange = { kind: 'col' | 'row'; n: number; before: number }
type UndoItem = { sheet: number; edits: { ref: string; before: string; styleBefore?: number }[]; sizes?: SizeChange[] }
type Edit = { ref: string; value?: string; style?: number }
/** 복사(잘라내기)한 칸: 값·수식·서식을 복사한 순간 그대로 기억 */
type Clip = { sheet: number; range: Range; cut: boolean; cells: { input: string; value: string; style: number }[][]; text: string }
type Resize = { kind: 'col' | 'row'; targets: number[]; start: number; size: number; before: SizeChange[] }

/** 엑셀 시트 보기 + 셀 고치기 + 인쇄 */
export default function SheetView({ wb, onChange, printRef }: { wb: Workbook; onChange: () => void; printRef: MutableRefObject<(() => void) | null> }) {
  const [index, setIndex] = useState(() => Math.min(wb.active, wb.sheets.length - 1))
  const sheet = wb.sheets[index]
  const [anchor, setAnchor] = useState<Pos>({ r: 1, c: 1 })
  const [focus, setFocus] = useState<Pos>({ r: 1, c: 1 })
  const [draft, setDraft] = useState('')
  const [extra, setExtra] = useState({ rows: 0, cols: 0 })
  const [page, setPage] = useState(0)
  const [find, setFind] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const [zoom, setZoom] = useState(() => loadZoom('sheet') ?? sheet.zoom)
  const [printOpen, setPrintOpen] = useState(false)
  const [printOpts, setPrintOpts] = useState({ choice: 'area' as 'area' | 'selection' | 'sheet', landscape: sheet.landscape, fit: true, grid: false })
  const [job, setJob] = useState<SheetPrintJob | null>(null)
  const [ver, setVer] = useState(0) // 셀이 바뀔 때마다 늘려 수식 입력줄을 새 값으로 맞춘다
  const undo = useRef<UndoItem[]>([])
  const dragging = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false) // Esc로 취소할 때는 저장하지 않는다
  const resizing = useRef<Resize | null>(null)
  const clip = useRef<Clip | null>(null)
  const [clipMark, setClipMark] = useState<{ sheet: number; range: Range; cut: boolean } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [, redraw] = useState(0)

  const sel = normRange(anchor, focus)
  const ref = cellRef(anchor.r, anchor.c)
  const cell = sheet.cells.get(ref)
  const used = useMemo(() => usedRange(sheet), [sheet, sheet.rows, sheet.cols])
  const rows = Math.max(used.r2 + 20, 40) + extra.rows
  const cols = Math.min(Math.max(used.c2 + 3, 12) + extra.cols, MAX_COLS)
  const pages = Math.ceil(rows / PAGE_ROWS)
  const first = page * PAGE_ROWS + 1
  const last = Math.min(rows, first + PAGE_ROWS - 1)
  const view: Range = { r1: first, c1: 1, r2: last, c2: cols }
  const { spans, covered } = useMemo(() => mergeLayout(sheet, view), [sheet, first, last, cols])

  useEffect(() => {
    wb.active = index
  }, [wb, index])
  useEffect(() => {
    setDraft(cell?.input ?? '')
  }, [ref, index, ver])
  useEffect(() => setNotice(null), [ref, index])

  // 엑셀처럼 마우스를 놓으면 끌기 선택 끝
  useEffect(() => {
    const up = () => (dragging.current = false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ── 고치기 ──
  /** 여러 칸을 한 번에 고치고 한 번에 되돌릴 수 있게 기록한다 */
  const apply = useCallback(
    (edits: Edit[]) => {
      const done: UndoItem['edits'] = []
      let lockedCount = 0
      for (const e of edits) {
        const before = sheet.cells.get(e.ref)
        const styleBefore = sheet.styleOf.get(e.ref) ?? 0
        const valueChange = e.value !== undefined && (before?.input ?? '') !== e.value
        const styleChange = e.style !== undefined && styleBefore !== e.style
        if (!valueChange && !styleChange) continue
        if (valueChange && before?.locked) {
          lockedCount++
          continue
        }
        if (styleChange) setCellStyle(wb, index, e.ref, e.style!)
        if (valueChange) setCell(wb, index, e.ref, e.value!)
        done.push({ ref: e.ref, before: before?.input ?? '', styleBefore: styleChange ? styleBefore : undefined })
      }
      if (done.length) {
        undo.current.push({ sheet: index, edits: done })
        if (undo.current.length > 200) undo.current.shift()
        setEdited(true)
        setVer((v) => v + 1)
        onChange()
      }
      setNotice(lockedCount ? `공유 수식 칸 ${lockedCount}개는 고치지 않았습니다 (엑셀에서 고쳐 주세요).` : null)
      return done.length > 0 || lockedCount === 0
    },
    [wb, index, sheet, onChange],
  )

  function commit(value = draft) {
    if (value === (cell?.input ?? '')) return true
    if (cell?.locked) {
      setNotice(cell.locked)
      setDraft(cell.input)
      return false
    }
    return apply([{ ref, value }])
  }

  function undoLast() {
    const item = undo.current.pop()
    if (!item) return
    for (const e of [...item.edits].reverse()) {
      if (e.styleBefore !== undefined) setCellStyle(wb, item.sheet, e.ref, e.styleBefore)
      if ((wb.sheets[item.sheet].cells.get(e.ref)?.input ?? '') !== e.before) setCell(wb, item.sheet, e.ref, e.before)
    }
    for (const z of item.sizes ?? []) {
      if (z.kind === 'col') setColWidths(wb, item.sheet, [z.n], z.before)
      else setRowHeights(wb, item.sheet, [z.n], z.before)
    }
    if (item.sheet !== index) setIndex(item.sheet)
    setVer((v) => v + 1)
    const first = item.edits[0]
    if (first) {
      const m = /^([A-Z]+)(\d+)$/.exec(first.ref)!
      const p = { r: Number(m[2]), c: m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) }
      setAnchor(p)
      setFocus(p)
    }
    onChange()
  }

  // ── 열 너비·행 높이 (머리글 경계를 끌어서) ──
  /** 여러 열(행)을 통째로 고른 상태에서 그중 하나를 끌면 고른 열(행) 모두 바꾼다 (엑셀과 같음) */
  function sizeTargets(kind: 'col' | 'row', n: number) {
    const whole = kind === 'col' ? sel.r1 === 1 && sel.r2 >= used.r2 : sel.c1 === 1 && sel.c2 >= used.c2
    const [a, b] = kind === 'col' ? [sel.c1, sel.c2] : [sel.r1, sel.r2]
    if (whole && n >= a && n <= b && b > a) return Array.from({ length: b - a + 1 }, (_, i) => a + i)
    return [n]
  }
  const sizeOf = (kind: 'col' | 'row', n: number) => (kind === 'col' ? colWidth(sheet, n) : rowHeight(sheet, n))

  function applySizes(kind: 'col' | 'row', targets: number[], px: number, before: SizeChange[]) {
    if (kind === 'col') setColWidths(wb, index, targets, px)
    else setRowHeights(wb, index, targets, px)
    undo.current.push({ sheet: index, edits: [], sizes: before })
    onChange()
  }

  function startResize(e: ReactMouseEvent, kind: 'col' | 'row', n: number) {
    e.preventDefault()
    e.stopPropagation()
    const targets = sizeTargets(kind, n)
    resizing.current = {
      kind,
      targets,
      start: kind === 'col' ? e.clientX : e.clientY,
      size: sizeOf(kind, n),
      before: targets.map((t) => ({ kind, n: t, before: sizeOf(kind, t) })),
    }
    const move = (ev: MouseEvent) => {
      const rz = resizing.current
      if (!rz) return
      const delta = ((rz.kind === 'col' ? ev.clientX : ev.clientY) - rz.start) / (zoom / 100)
      const px = Math.max(rz.kind === 'col' ? 12 : 8, Math.round(rz.size + delta))
      // 끄는 동안에는 화면만 바꾸고, 놓을 때 파일에 반영한다
      for (const t of rz.targets) (rz.kind === 'col' ? sheet.widths : sheet.heights).set(t, px)
      redraw((v) => v + 1)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      const rz = resizing.current
      resizing.current = null
      if (!rz) return
      const px = sizeOf(rz.kind, rz.targets[0])
      if (rz.before.every((b) => b.before === px)) return
      applySizes(rz.kind, rz.targets, px, rz.before)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /** 내용에 맞는 크기: 열은 가장 긴 글자, 행은 가장 큰 글자·줄 수 (병합 칸은 뺌) */
  function fitSize(kind: 'col' | 'row', n: number) {
    const ctx = document.createElement('canvas').getContext('2d')!
    const family = getComputedStyle(document.body).fontFamily
    const merged = (r: number, c: number) => sheet.merges.some((m) => (kind === 'col' ? m.cols > 1 : m.rows > 1) && r >= m.r && r < m.r + m.rows && c >= m.c && c < m.c + m.cols)
    const [r1, r2, c1, c2] = kind === 'col' ? [1, used.r2, n, n] : [n, n, 1, used.c2]
    let best = 0
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const k = cellRef(r, c)
        const v = sheet.cells.get(k)
        if (!v?.value || merged(r, c)) continue
        const css = cellCss(wb, sheet, k, v)
        const size = parseFloat(String(css.fontSize)) || 15
        const lines = v.value.split('\n')
        if (kind === 'col') {
          ctx.font = `${css.fontWeight ?? 400} ${size}px ${family}`
          for (const line of lines) best = Math.max(best, ctx.measureText(line).width + 12)
        } else best = Math.max(best, size * 1.4 * lines.length + 4)
      }
    return kind === 'col' ? Math.min(600, Math.max(30, Math.ceil(best) || sheet.defaultWidth)) : Math.max(sheet.defaultHeight, Math.ceil(best))
  }

  /** 열(행) 경계를 두 번 누르거나 [열 너비 맞춤]: 각 열(행)을 내용에 맞춘다 */
  function autoFit(kind: 'col' | 'row', targets: number[]) {
    const before = targets.map((t) => ({ kind, n: t, before: sizeOf(kind, t) }))
    for (const t of targets) {
      const px = fitSize(kind, t)
      if (kind === 'col') setColWidths(wb, index, [t], px)
      else setRowHeights(wb, index, [t], px)
    }
    undo.current.push({ sheet: index, edits: [], sizes: before })
    onChange()
  }

  function refsIn(r: Range) {
    const out: string[] = []
    for (let y = r.r1; y <= r.r2; y++) for (let x = r.c1; x <= r.c2; x++) out.push(cellRef(y, x))
    return out
  }
  const clearRange = () => apply(refsIn(sel).map((r) => ({ ref: r, value: '' })))

  // ── 선택·이동 ──
  function scrollTo(p: Pos) {
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-ref="${cellRef(p.r, p.c)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }
  function moveTo(p: Pos, extend = false) {
    const np = { r: Math.max(1, Math.min(p.r, rows)), c: Math.max(1, Math.min(p.c, cols)) }
    if (!extend) setAnchor(np)
    setFocus(np)
    const pg = Math.floor((np.r - 1) / PAGE_ROWS)
    if (pg !== page) setPage(pg)
    scrollTo(np)
  }

  function onGridKey(e: KeyboardEvent) {
    if (e.target !== gridRef.current) return
    const ctrl = e.ctrlKey || e.metaKey
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      const from = e.shiftKey ? focus : anchor
      moveTo({ r: from.r + moves[e.key][0], c: from.c + moves[e.key][1] }, e.shiftKey)
    } else if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      undoLast()
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setAnchor({ r: 1, c: 1 })
      setFocus({ r: used.r2, c: used.c2 })
    } else if (ctrl && e.key === 'Home') {
      e.preventDefault()
      moveTo({ r: 1, c: 1 })
    } else if (e.key === 'Escape') {
      // 엑셀처럼 Esc 로 복사 표시(점선)를 없앤다
      clip.current = null
      setClipMark(null)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      inputRef.current?.focus()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      clearRange()
    } else if (e.key.length === 1 && !ctrl && !e.altKey) {
      // 셀을 고른 채 바로 입력하면 새 값으로 시작 (엑셀과 같은 방식)
      e.preventDefault()
      if (cell?.locked) return setNotice(cell.locked)
      setFocus(anchor)
      setDraft(e.key)
      inputRef.current?.focus()
    }
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return // 한글 조합 중 Enter 는 무시
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (!commit()) return
      skipBlur.current = true
      if (e.key === 'Enter') moveTo({ r: anchor.r + (e.shiftKey ? -1 : 1), c: anchor.c })
      else moveTo({ r: anchor.r, c: anchor.c + (e.shiftKey ? -1 : 1) })
      gridRef.current?.focus()
    } else if (e.key === 'Escape') {
      skipBlur.current = true
      setDraft(cell?.input ?? '')
      gridRef.current?.focus()
    }
  }

  // ── 잘라내기·복사·붙여넣기 ──
  // 이 프로그램 안에서는 값·수식·서식을 함께 옮기고(수식의 칸 주소는 옮긴 만큼 바뀜),
  // 엑셀·메모장 등 다른 프로그램과는 글(탭으로 구분)로 주고받는다.
  function copySel(cut: boolean): string {
    const cells: Clip['cells'] = []
    const values: string[][] = []
    for (let y = sel.r1; y <= sel.r2; y++) {
      const row: Clip['cells'][number] = []
      const vrow: string[] = []
      for (let x = sel.c1; x <= sel.c2; x++) {
        const k = cellRef(y, x)
        const v = sheet.cells.get(k)
        row.push({ input: v?.input ?? '', value: v?.value ?? '', style: sheet.styleOf.get(k) ?? 0 })
        vrow.push(v?.value ?? '')
      }
      cells.push(row)
      values.push(vrow)
    }
    const text = toTsv(values)
    clip.current = { sheet: index, range: { ...sel }, cut, cells, text }
    setClipMark({ sheet: index, range: { ...sel }, cut })
    setNotice(cut ? '잘라낸 범위를 붙여넣을 곳을 고르고 붙여넣기 하세요 (Esc: 취소).' : null)
    return text
  }

  const normText = (t: string) => t.replace(/\r\n?/g, '\n').replace(/\n+$/, '')

  /** 붙여넣기: 우리가 복사한 내용이면 서식·수식까지, 아니면 글만 */
  function pasteText(text: string | null, valuesOnly = false) {
    const c = clip.current
    if (c && (text === null || normText(text) === normText(c.text))) return pasteInternal(c, valuesOnly)
    if (!text) return
    const data = parseTsv(text)
    apply(data.flatMap((row, y) => row.map((v, x) => ({ ref: cellRef(sel.r1 + y, sel.c1 + x), value: v }))))
    setAnchor({ r: sel.r1, c: sel.c1 })
    setFocus({ r: sel.r1 + data.length - 1, c: sel.c1 + Math.max(...data.map((r) => r.length)) - 1 })
  }

  function pasteInternal(c: Clip, valuesOnly: boolean) {
    const top = { r: sel.r1, c: sel.c1 }
    const dr = top.r - c.range.r1
    const dc = top.c - c.range.c1
    const edits = new Map<string, Edit>()
    // 잘라내기: 원래 칸을 비운다 (붙여넣을 곳과 겹치는 칸은 아래에서 덮어씀)
    if (c.cut && c.sheet === index)
      for (let y = c.range.r1; y <= c.range.r2; y++) for (let x = c.range.c1; x <= c.range.c2; x++) edits.set(cellRef(y, x), { ref: cellRef(y, x), value: '', style: 0 })
    c.cells.forEach((row, y) =>
      row.forEach((src, x) => {
        const ref = cellRef(top.r + y, top.c + x)
        if (valuesOnly) edits.set(ref, { ref, value: src.value })
        // 잘라내기는 수식을 그대로 옮기고(엑셀과 같음), 복사는 칸 주소를 옮긴 만큼 바꾼다
        else edits.set(ref, { ref, value: c.cut ? src.input : shiftFormula(src.input, dr, dc), style: src.style })
      }),
    )
    apply([...edits.values()])
    // 다른 시트에서 잘라낸 경우 원래 시트의 칸도 비운다
    if (c.cut && c.sheet !== index) {
      for (let y = c.range.r1; y <= c.range.r2; y++)
        for (let x = c.range.c1; x <= c.range.c2; x++) {
          setCell(wb, c.sheet, cellRef(y, x), '')
          setCellStyle(wb, c.sheet, cellRef(y, x), 0)
        }
      onChange()
    }
    setAnchor(top)
    setFocus({ r: top.r + c.cells.length - 1, c: top.c + c.cells[0].length - 1 })
    if (c.cut) {
      clip.current = null
      setClipMark(null)
      setNotice(null)
    }
  }

  // ── 그림으로 복사 (카카오톡·문서에 표를 그림으로 붙여넣기) ──
  /** 여러 칸을 골랐으면 그 범위, 한 칸만 골랐으면 인쇄 영역 또는 내용 있는 범위 전체 */
  function imageRange(): Range {
    if (!(sel.r1 === sel.r2 && sel.c1 === sel.c2)) return { ...sel }
    return sheet.printArea ?? used
  }
  async function copyAsImage() {
    setMenu(null)
    const range = imageRange()
    const canvas = renderRange(wb, sheet, range)
    const ok = await copyRangeImage(canvas)
    if (ok) setNotice(`${rangeText(range)} 범위를 그림으로 복사했습니다. 카카오톡·문서 등에 Ctrl+V 로 붙여넣으세요.`)
    else {
      downloadBlob(await rangeImageBlob(canvas), `${sheet.name}-${rangeText(range).replace(':', '-')}.png`)
      setNotice('브라우저가 그림 복사를 막아서 PNG 파일로 저장했습니다 (다운로드 폴더).')
    }
    gridRef.current?.focus()
  }
  async function saveAsImage() {
    setMenu(null)
    const range = imageRange()
    downloadBlob(await rangeImageBlob(renderRange(wb, sheet, range)), `${sheet.name}-${rangeText(range).replace(':', '-')}.png`)
    setNotice(`${rangeText(range)} 범위를 PNG 그림 파일로 저장했습니다 (다운로드 폴더).`)
  }

  // 키보드(Ctrl+X/C/V): 브라우저의 잘라내기·복사·붙여넣기 이벤트로 처리 → 다른 프로그램과도 주고받기
  function onCopy(e: ClipboardEvent, cut = false) {
    if (e.target !== gridRef.current) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', copySel(cut))
  }
  function onPaste(e: ClipboardEvent) {
    if (e.target !== gridRef.current) return
    e.preventDefault()
    pasteText(e.clipboardData.getData('text/plain'))
  }

  // 버튼·오른쪽 클릭 메뉴
  function copyButton(cut: boolean) {
    setMenu(null)
    const text = copySel(cut)
    navigator.clipboard?.writeText(text).catch(() => {}) // 다른 프로그램에 붙여넣을 수 있게 (안 되면 이 안에서만)
    gridRef.current?.focus()
  }
  async function pasteButton(valuesOnly = false) {
    setMenu(null)
    gridRef.current?.focus()
    if (valuesOnly && clip.current) return pasteInternal(clip.current, true)
    try {
      const text = await navigator.clipboard.readText()
      pasteText(text, valuesOnly)
    } catch {
      // 브라우저가 버튼으로 읽기를 막으면: 이 안에서 복사한 것만 붙여넣고, 아니면 Ctrl+V 안내
      if (clip.current) pasteInternal(clip.current, valuesOnly)
      else setNotice('브라우저가 버튼 붙여넣기를 막았습니다. 다른 프로그램에서 복사한 내용은 Ctrl+V 로 붙여넣어 주세요.')
    }
  }

  // ── 찾기 ──
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase()
    if (!q) return []
    return [...sheet.cells.entries()].filter(([, v]) => v.value.toLowerCase().includes(q) || v.input.toLowerCase().includes(q)).map(([k]) => k)
  }, [find, sheet, sheet.cells.size, draft])
  const matchSet = new Set(matches)
  function nextMatch() {
    if (!matches.length) return
    const pos = (k: string) => {
      const m = /^([A-Z]+)(\d+)$/.exec(k)!
      return { r: Number(m[2]), c: m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) }
    }
    const key = (p: Pos) => p.r * 100000 + p.c
    const sorted = matches.map(pos).sort((a, b) => key(a) - key(b))
    moveTo(sorted.find((p) => key(p) > key(anchor)) ?? sorted[0])
  }

  // ── 인쇄 ──
  const runPrint = useCallback((j: SheetPrintJob) => {
    setPrintOpen(false)
    flushSync(() => setJob(j))
    window.print()
    setJob(null)
  }, [])
  useEffect(() => {
    printRef.current = () => setPrintOpen(true)
    // 브라우저 메뉴로 인쇄해도 빈 종이가 나오지 않게 기본 설정으로 그린다
    const before = () => {
      if (document.getElementById('print-root')?.childElementCount) return
      flushSync(() => setJob({ range: sheet.printArea ?? used, landscape: sheet.landscape, fit: true, grid: false }))
    }
    const after = () => setJob(null)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      printRef.current = null
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [printRef, sheet, used])

  // ── 상태 표시줄: 선택 범위의 개수·합계·평균 (엑셀 아래쪽과 같은 정보) ──
  const stats = useMemo(() => {
    if (sel.r1 === sel.r2 && sel.c1 === sel.c2) return null
    let count = 0
    let nums = 0
    let sum = 0
    for (let y = sel.r1; y <= Math.min(sel.r2, used.r2); y++)
      for (let x = sel.c1; x <= Math.min(sel.c2, used.c2); x++) {
        const v = sheet.cells.get(cellRef(y, x))
        if (!v || v.value === '') continue
        count++
        const n = Number(v.input.replace(/,/g, ''))
        if (v.num && Number.isFinite(n)) {
          nums++
          sum += n
        }
      }
    return { count, nums, sum }
  }, [sel.r1, sel.r2, sel.c1, sel.c2, sheet, used, draft])

  // 수식이 있는 시트에서만 '다시 계산 안 됨' 안내를 띄운다
  const hasFormula = useMemo(() => [...sheet.cells.values()].some((v) => v.input.startsWith('=')), [sheet, ver])
  const fmt = (n: number) => parseFloat(n.toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: 10 })
  const area = sheet.printArea
  const totalWidth = HEAD_W + Array.from({ length: cols }, (_, i) => colWidth(sheet, i + 1)).reduce((a, b) => a + b, 0)

  /** 셀 테두리 위에 겹쳐 그리는 표시: 선택 범위 색, 인쇄 영역 점선 */
  function overlay(r: number, c: number, span?: { rows: number; cols: number }): CSSProperties {
    const shadows: string[] = []
    const css: CSSProperties = {}
    const layers: { img: string; size: string; pos: string }[] = []
    if (inRange(sel, r, c) && !(sel.r1 === sel.r2 && sel.c1 === sel.c2)) layers.push({ img: 'linear-gradient(rgba(46,107,81,.16), rgba(46,107,81,.16))', size: '100% 100%', pos: '0 0' })
    // 복사·잘라낸 범위: 엑셀처럼 점선 테두리
    const cm = clipMark && clipMark.sheet === index ? clipMark.range : null
    if (cm && inRange(cm, r, c)) {
      const color = clipMark!.cut ? '#b45309' : '#1f4d3a'
      const h = `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 9px)`
      const v = `repeating-linear-gradient(0deg, ${color} 0 5px, transparent 5px 9px)`
      if (r === cm.r1) layers.push({ img: h, size: '100% 2px', pos: 'top' })
      if (r + (span?.rows ?? 1) - 1 >= cm.r2) layers.push({ img: h, size: '100% 2px', pos: 'bottom' })
      if (c === cm.c1) layers.push({ img: v, size: '2px 100%', pos: 'left' })
      if (c + (span?.cols ?? 1) - 1 >= cm.c2) layers.push({ img: v, size: '2px 100%', pos: 'right' })
    }
    if (layers.length) {
      css.backgroundImage = layers.map((l) => l.img).join(', ')
      css.backgroundSize = layers.map((l) => l.size).join(', ')
      css.backgroundPosition = layers.map((l) => l.pos).join(', ')
      css.backgroundRepeat = 'no-repeat'
    }
    if (area && inRange(area, r, c)) {
      const r2 = r + (span?.rows ?? 1) - 1
      const c2 = c + (span?.cols ?? 1) - 1
      if (r === area.r1) shadows.push('inset 0 2px 0 #2563eb')
      if (r2 >= area.r2) shadows.push('inset 0 -2px 0 #2563eb')
      if (c === area.c1) shadows.push('inset 2px 0 0 #2563eb')
      if (c2 >= area.c2) shadows.push('inset -2px 0 0 #2563eb')
    }
    if (r === anchor.r && c === anchor.c) shadows.push('inset 0 0 0 2px #1f4d3a')
    if (shadows.length) css.boxShadow = shadows.join(', ')
    return css
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 도구 모음 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-cream-300 bg-cream-50 px-2 py-1.5">
        <button className={tool} disabled={!undo.current.length} onClick={undoLast} title="되돌리기 (Ctrl+Z)">
          ↶ 되돌리기
        </button>
        <span className="mx-1 h-5 w-px bg-cream-300" />
        <button className={tool} onClick={() => copyButton(true)} title="잘라내기 (Ctrl+X) — 붙여넣으면 옮겨짐">
          ✂ 잘라내기
        </button>
        <button className={tool} onClick={() => copyButton(false)} title="복사 (Ctrl+C) — 값·수식·서식">
          ⧉ 복사
        </button>
        <button className={tool} onClick={() => pasteButton()} title="붙여넣기 (Ctrl+V) — 오른쪽 클릭 메뉴에 '값만 붙여넣기'도 있음">
          📋 붙여넣기
        </button>
        <button className={tool} onClick={copyAsImage} title="고른 범위를 그림으로 복사 (한 칸만 골랐으면 표 전체) — 카카오톡·문서에 그림으로 붙여넣기">
          📷 그림으로 복사
        </button>
        <span className="mx-1 h-5 w-px bg-cream-300" />
        <button className={tool} onClick={() => autoFit('col', Array.from({ length: sel.c2 - sel.c1 + 1 }, (_, i) => sel.c1 + i))} title="고른 열의 너비를 내용에 맞춤 (열 머리글 경계를 두 번 눌러도 됨)">
          ↔ 열 너비 맞춤
        </button>
        <span className="mx-1 h-5 w-px bg-cream-300" />
        <button className={tool} onClick={() => (setPrintArea(wb, index, { ...sel }), onChange())} title="선택한 범위를 인쇄 영역으로 (저장하면 엑셀에도 적용)">
          ▣ 인쇄 영역 지정
        </button>
        {area && (
          <button className={tool} onClick={() => (setPrintArea(wb, index, null), onChange())}>
            인쇄 영역 해제 <span className="text-muted">({rangeText(area)})</span>
          </button>
        )}
        <span className="mx-1 h-5 w-px bg-cream-300" />
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && nextMatch()}
          placeholder="찾기"
          className="w-28 rounded-lg border border-cream-300 bg-white px-2 py-1 text-sm outline-none focus:border-forest-500"
        />
        {find.trim() && (
          <button className={tool} onClick={nextMatch}>
            다음 ({matches.length})
          </button>
        )}
        <span className="flex-1" />
        <ZoomControl
          value={zoom}
          onChange={(z) => {
            setZoom(z)
            saveZoom('sheet', z)
          }}
          onFit={() => {
            const w = gridRef.current?.clientWidth ?? 1000
            const usedW = HEAD_W + Array.from({ length: used.c2 }, (_, i) => colWidth(sheet, i + 1)).reduce((a, b) => a + b, 0)
            const z = Math.max(25, Math.min(200, Math.floor(((w - 20) / usedW) * 100)))
            setZoom(z)
            saveZoom('sheet', z)
          }}
        />
      </div>

      {/* 수식 입력줄 */}
      <div className="flex items-stretch gap-1 border-b border-cream-300 bg-white px-2 py-1">
        <div className="flex w-24 shrink-0 items-center justify-center rounded border border-cream-300 font-mono text-xs">{rangeText(sel)}</div>
        <span className="flex items-center px-1 text-sm text-muted italic">fx</span>
        <input
          ref={inputRef}
          value={draft}
          readOnly={!!cell?.locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKey}
          onBlur={() => {
            if (skipBlur.current) skipBlur.current = false
            else commit()
          }}
          placeholder="값 또는 =수식 입력 후 Enter"
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 font-mono text-sm outline-none focus:border-forest-500 read-only:bg-cream-100"
        />
      </div>
      {(notice || cell?.locked || (edited && hasFormula)) && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900">
          {notice ?? cell?.locked ?? '수식 칸의 값은 고치기 전 계산 결과입니다. 저장한 파일을 엑셀에서 열면 새로 계산됩니다.'}
        </p>
      )}

      {/* 표 */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onGridKey}
        onCopy={(e) => onCopy(e)}
        onCut={(e) => onCopy(e, true)}
        onPaste={onPaste}
        className="min-h-0 flex-1 overflow-auto bg-white outline-none select-none"
      >
        <table className="border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: totalWidth, zoom: zoom / 100 }}>
          <colgroup>
            <col style={{ width: HEAD_W }} />
            {Array.from({ length: cols }, (_, i) => (
              <col key={i} style={{ width: colWidth(sheet, i + 1) }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: 20 }}>
              <th
                className="sticky top-0 left-0 z-30 border-r border-b border-cream-300 bg-cream-200"
                onMouseDown={() => {
                  setAnchor({ r: 1, c: 1 })
                  setFocus({ r: used.r2, c: used.c2 })
                }}
              />
              {Array.from({ length: cols }, (_, i) => {
                const c = i + 1
                const hidden = colWidth(sheet, c) === 0
                return (
                  <th
                    key={i}
                    onMouseDown={(e) => {
                      if (!e.shiftKey) setAnchor({ r: 1, c })
                      setFocus({ r: Math.max(used.r2, 1), c })
                    }}
                    className={`group sticky top-0 z-20 cursor-s-resize overflow-hidden border-r border-b border-cream-300 text-[11px] font-normal ${
                      c >= sel.c1 && c <= sel.c2 ? 'bg-forest-100 text-forest-900' : 'bg-cream-100 text-muted'
                    }`}
                  >
                    {hidden ? '' : colName(c)}
                    {/* 오른쪽 경계: 끌어서 너비 조절, 두 번 눌러 내용에 맞춤 */}
                    <span
                      onMouseDown={(e) => startResize(e, 'col', c)}
                      onDoubleClick={() => autoFit('col', sizeTargets('col', c))}
                      title="끌어서 열 너비 조절 · 두 번 눌러 내용에 맞춤"
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-forest-500/60"
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: last - first + 1 }, (_, ri) => {
              const r = first + ri
              const h = rowHeight(sheet, r)
              if (h === 0) return null
              return (
                <tr key={r} style={{ height: h }}>
                  <th
                    onMouseDown={(e) => {
                      if (!e.shiftKey) setAnchor({ r, c: 1 })
                      setFocus({ r, c: Math.max(used.c2, 1) })
                    }}
                    className={`sticky left-0 z-10 cursor-e-resize border-r border-b border-cream-300 px-1 text-right text-[11px] font-normal ${
                      r >= sel.r1 && r <= sel.r2 ? 'bg-forest-100 text-forest-900' : 'bg-cream-100 text-muted'
                    }`}
                  >
                    {r}
                    {/* 아래 경계: 끌어서 높이 조절, 두 번 눌러 내용에 맞춤 */}
                    <span
                      onMouseDown={(e) => startResize(e, 'row', r)}
                      onDoubleClick={() => autoFit('row', sizeTargets('row', r))}
                      title="끌어서 행 높이 조절 · 두 번 눌러 내용에 맞춤"
                      className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize hover:bg-forest-500/60"
                    />
                  </th>
                  {Array.from({ length: cols }, (_, ci) => {
                    const c = ci + 1
                    const k = cellRef(r, c)
                    if (covered.has(k) || colWidth(sheet, c) === 0) return null
                    const span = spans.get(k)
                    const origin = span ? mergeOrigin(sheet, r, c) : k
                    const v = sheet.cells.get(origin)
                    return (
                      <td
                        key={c}
                        data-ref={k}
                        rowSpan={span && span.rows > 1 ? span.rows : undefined}
                        colSpan={span && span.cols > 1 ? span.cols : undefined}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return
                          commit()
                          if (e.shiftKey) setFocus({ r, c })
                          else {
                            setAnchor({ r, c })
                            setFocus({ r: r + (span?.rows ?? 1) - 1, c: c + (span?.cols ?? 1) - 1 })
                          }
                          dragging.current = true
                          gridRef.current?.focus()
                        }}
                        onMouseEnter={() => dragging.current && setFocus({ r, c })}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          if (!inRange(sel, r, c)) {
                            setAnchor({ r, c })
                            setFocus({ r, c })
                          }
                          setMenu({ x: e.clientX, y: e.clientY })
                        }}
                        onDoubleClick={() => inputRef.current?.focus()}
                        title={v && v.input !== v.value ? v.input : undefined}
                        className={`cursor-cell overflow-hidden border-r border-b border-[#e6e6e6] px-1 leading-tight text-ellipsis ${v?.pending ? 'text-forest-500 italic' : ''} ${
                          matchSet.has(origin) ? 'bg-amber-100' : ''
                        }`}
                        style={{ ...cellCss(wb, sheet, origin, v), ...overlay(r, c, span) }}
                      >
                        {v?.value}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 아래: 시트 탭 + 상태 표시줄 */}
      <div className="flex flex-wrap items-center gap-1 border-t border-cream-300 bg-cream-50 px-2 py-1 text-sm">
        <div className="flex min-w-0 gap-0.5 overflow-x-auto">
          {wb.sheets.map((s, i) => (
            <button
              key={s.path}
              onClick={() => {
                commit()
                setIndex(i)
                setAnchor({ r: 1, c: 1 })
                setFocus({ r: 1, c: 1 })
                setPage(0)
                setExtra({ rows: 0, cols: 0 })
                setPrintOpts((o) => ({ ...o, landscape: s.landscape }))
                if (loadZoom('sheet') === null) setZoom(s.zoom)
              }}
              className={`shrink-0 rounded-b-md border-x border-b px-3 py-1 ${i === index ? 'border-cream-300 bg-white font-semibold text-forest-900' : 'border-transparent text-muted hover:bg-cream-200'}`}
            >
              {s.name}
              {s.hidden && <span className="ml-1 opacity-70">(숨김)</span>}
            </button>
          ))}
        </div>
        <button className={tool} onClick={() => setExtra((x) => ({ ...x, rows: x.rows + 20 }))}>
          +행
        </button>
        {cols < MAX_COLS && (
          <button className={tool} onClick={() => setExtra((x) => ({ ...x, cols: x.cols + 5 }))}>
            +열
          </button>
        )}
        {pages > 1 && (
          <span className="flex items-center gap-1 text-muted">
            <button className={tool} disabled={page === 0} onClick={() => setPage(page - 1)}>
              ‹
            </button>
            {first}~{last}행
            <button className={tool} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              ›
            </button>
          </span>
        )}
        <span className="ml-auto text-xs text-muted">
          {stats && (
            <>
              개수 {stats.count}
              {stats.nums > 0 && (
                <>
                  {' '}
                  · 합계 {fmt(stats.sum)} · 평균 {fmt(stats.sum / stats.nums)}
                </>
              )}
            </>
          )}
        </span>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))} />
          <div
            className="fixed z-50 w-52 rounded-xl border border-cream-300 bg-white py-1 text-sm shadow-lg"
            style={{ left: Math.min(menu.x, window.innerWidth - 216), top: Math.min(menu.y, window.innerHeight - 380) }}
          >
            {[
              { label: '✂ 잘라내기', key: 'Ctrl+X', run: () => copyButton(true) },
              { label: '⧉ 복사', key: 'Ctrl+C', run: () => copyButton(false) },
              { label: '📋 붙여넣기', key: 'Ctrl+V', run: () => pasteButton() },
              { label: '값만 붙여넣기', run: () => pasteButton(true) },
              null,
              { label: '📷 그림으로 복사', run: copyAsImage },
              { label: '그림으로 저장 (PNG)', run: saveAsImage },
              null,
              { label: '내용 지우기', key: 'Delete', run: () => (setMenu(null), clearRange()) },
              null,
              { label: '인쇄 영역으로 지정', run: () => (setMenu(null), setPrintArea(wb, index, { ...sel }), onChange()) },
              { label: '열 너비를 내용에 맞춤', run: () => (setMenu(null), autoFit('col', Array.from({ length: sel.c2 - sel.c1 + 1 }, (_, i) => sel.c1 + i))) },
            ].map((m, i) =>
              m ? (
                <button key={i} onClick={m.run} className="flex w-full items-center justify-between px-4 py-1.5 text-left hover:bg-cream-100">
                  {m.label}
                  {m.key && <span className="text-xs text-muted">{m.key}</span>}
                </button>
              ) : (
                <div key={i} className="my-1 border-t border-cream-200" />
              ),
            )}
          </div>
        </>
      )}
      {printOpen && (
        <SheetPrintDialog sheet={sheet} selection={sel} used={used} value={printOpts} onValue={setPrintOpts} onPrint={runPrint} onClose={() => setPrintOpen(false)} />
      )}
      {job && <SheetPrint wb={wb} sheet={sheet} job={job} />}
    </div>
  )
}
