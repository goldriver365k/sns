import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type MutableRefObject } from 'react'
import { flushSync } from 'react-dom'
import { cellRef, colName, rangeText, setCell, setPrintArea, type Range, type Workbook } from '../office/xlsx'
import { cellCss, colWidth, inRange, mergeLayout, mergeOrigin, normRange, parseTsv, rowHeight, toTsv, usedRange } from './sheetRender'
import { SheetPrint, SheetPrintDialog, type SheetPrintJob } from './Print'
import { ZoomControl, loadZoom, saveZoom } from './Zoom'

const PAGE_ROWS = 500 // 한 번에 그리는 행 수 (큰 시트도 버벅이지 않게)
const MAX_COLS = 200
const HEAD_W = 44
const tool = 'rounded-lg px-2.5 py-1 text-sm text-ink hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-40'

type Pos = { r: number; c: number }
type UndoItem = { sheet: number; edits: { ref: string; before: string }[] }

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
    (edits: { ref: string; value: string }[]) => {
      const done: UndoItem['edits'] = []
      let lockedCount = 0
      for (const e of edits) {
        const before = sheet.cells.get(e.ref)
        if ((before?.input ?? '') === e.value) continue
        if (before?.locked) {
          lockedCount++
          continue
        }
        setCell(wb, index, e.ref, e.value)
        done.push({ ref: e.ref, before: before?.input ?? '' })
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
    for (const e of [...item.edits].reverse()) setCell(wb, item.sheet, e.ref, e.before)
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

  // ── 복사·잘라내기·붙여넣기 (엑셀과 주고받기 가능) ──
  function onCopy(e: ClipboardEvent, cut = false) {
    if (e.target !== gridRef.current) return
    e.preventDefault()
    const values: string[][] = []
    for (let y = sel.r1; y <= sel.r2; y++) {
      const row: string[] = []
      for (let x = sel.c1; x <= sel.c2; x++) row.push(sheet.cells.get(cellRef(y, x))?.value ?? '')
      values.push(row)
    }
    e.clipboardData.setData('text/plain', toTsv(values))
    if (cut) clearRange()
  }
  function onPaste(e: ClipboardEvent) {
    if (e.target !== gridRef.current) return
    e.preventDefault()
    const data = parseTsv(e.clipboardData.getData('text/plain'))
    const edits: { ref: string; value: string }[] = []
    data.forEach((row, y) => row.forEach((v, x) => edits.push({ ref: cellRef(sel.r1 + y, sel.c1 + x), value: v })))
    apply(edits)
    setFocus({ r: sel.r1 + data.length - 1, c: sel.c1 + Math.max(...data.map((r) => r.length)) - 1 })
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
    if (inRange(sel, r, c) && !(sel.r1 === sel.r2 && sel.c1 === sel.c2)) css.backgroundImage = 'linear-gradient(rgba(46,107,81,.16), rgba(46,107,81,.16))'
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
                    className={`sticky top-0 z-20 cursor-s-resize overflow-hidden border-r border-b border-cream-300 text-[11px] font-normal ${
                      c >= sel.c1 && c <= sel.c2 ? 'bg-forest-100 text-forest-900' : 'bg-cream-100 text-muted'
                    }`}
                  >
                    {hidden ? '' : colName(c)}
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

      {printOpen && (
        <SheetPrintDialog sheet={sheet} selection={sel} used={used} value={printOpts} onValue={setPrintOpts} onPrint={runPrint} onClose={() => setPrintOpen(false)} />
      )}
      {job && <SheetPrint wb={wb} sheet={sheet} job={job} />}
    </div>
  )
}
