import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cellRef, colName, setCell, type Merge, type Workbook } from '../../office/xlsx'

const PAGE_ROWS = 500 // 한 번에 그리는 행 수 (큰 시트도 버벅이지 않게)
const MAX_COLS = 200
const DEFAULT_W = 96

/** 엑셀 시트 보기 + 셀 고치기 */
export default function SheetView({ wb, onChange }: { wb: Workbook; onChange: () => void }) {
  const [index, setIndex] = useState(() => Math.min(wb.active, wb.sheets.length - 1))
  const sheet = wb.sheets[index]
  const [sel, setSel] = useState({ r: 1, c: 1 })
  const [draft, setDraft] = useState('')
  const [extra, setExtra] = useState({ rows: 0, cols: 0 })
  const [page, setPage] = useState(0)
  const [find, setFind] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false) // Esc로 취소할 때는 저장하지 않는다

  const ref = cellRef(sel.r, sel.c)
  const cell = sheet.cells.get(ref)
  const rows = Math.max(sheet.rows + 10, 50) + extra.rows
  const cols = Math.min(Math.max(sheet.cols + 3, 26) + extra.cols, MAX_COLS)
  const pages = Math.ceil(rows / PAGE_ROWS)
  const first = page * PAGE_ROWS + 1
  const last = Math.min(rows, first + PAGE_ROWS - 1)

  useEffect(() => {
    wb.active = index
  }, [wb, index])
  // 고르는 셀이 바뀌면 수정 칸을 그 셀 값으로
  useEffect(() => {
    setDraft(cell?.input ?? '')
    setNotice(null)
  }, [ref, index])

  // 병합된 셀: 왼쪽 위 칸만 그리고 나머지는 가린다
  const { masters, covered } = useMemo(() => {
    const masters = new Map<string, Merge>()
    const covered = new Set<string>()
    for (const m of sheet.merges) {
      masters.set(cellRef(m.r, m.c), m)
      for (let r = m.r; r < m.r + m.rows; r++) for (let c = m.c; c < m.c + m.cols; c++) if (r !== m.r || c !== m.c) covered.add(cellRef(r, c))
    }
    return { masters, covered }
  }, [sheet])

  const matches = useMemo(() => {
    if (!find.trim()) return []
    const q = find.trim().toLowerCase()
    return [...sheet.cells.entries()].filter(([, v]) => v.value.toLowerCase().includes(q) || v.input.toLowerCase().includes(q)).map(([k]) => k)
  }, [find, sheet, sheet.cells.size, draft])

  function select(r: number, c: number) {
    const nr = Math.max(1, Math.min(r, rows))
    const nc = Math.max(1, Math.min(c, cols))
    setSel({ r: nr, c: nc })
    const p = Math.floor((nr - 1) / PAGE_ROWS)
    if (p !== page) setPage(p)
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-ref="${cellRef(nr, nc)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }

  function commit(value = draft): boolean {
    if (value === (cell?.input ?? '')) return true
    try {
      setCell(wb, index, ref, value)
      setEdited(true)
      onChange()
      return true
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '고치지 못했습니다.')
      setDraft(cell?.input ?? '')
      return false
    }
  }

  function onGridKey(e: KeyboardEvent) {
    if (e.target !== gridRef.current) return
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      select(sel.r + moves[e.key][0], sel.c + moves[e.key][1])
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      inputRef.current?.focus()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (commit('')) setDraft('')
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 셀을 고른 채 바로 입력하면 새 값으로 시작 (엑셀과 같은 방식)
      e.preventDefault()
      if (cell?.locked) return setNotice(cell.locked)
      setDraft(e.key)
      inputRef.current?.focus()
    }
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return // 한글 조합 중 Enter 는 무시
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (!commit()) return
      if (e.key === 'Enter') select(sel.r + (e.shiftKey ? -1 : 1), sel.c)
      else select(sel.r, sel.c + (e.shiftKey ? -1 : 1))
      gridRef.current?.focus()
    } else if (e.key === 'Escape') {
      skipBlur.current = true
      setDraft(cell?.input ?? '')
      gridRef.current?.focus()
    }
  }

  function nextMatch() {
    if (!matches.length) return
    const order = (k: string) => {
      const m = /^([A-Z]+)(\d+)$/.exec(k)!
      return Number(m[2]) * 100000 + m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
    }
    const sorted = [...matches].sort((a, b) => order(a) - order(b))
    const now = order(ref)
    const next = sorted.find((k) => order(k) > now) ?? sorted[0]
    const m = /^([A-Z]+)(\d+)$/.exec(next)!
    select(Number(m[2]), m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0))
  }

  const matchSet = new Set(matches)

  return (
    <div>
      {/* 시트 탭 */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {wb.sheets.map((s, i) => (
          <button
            key={s.path}
            onClick={() => {
              commit()
              setIndex(i)
              setSel({ r: 1, c: 1 })
              setPage(0)
              setExtra({ rows: 0, cols: 0 })
            }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${i === index ? 'bg-forest-700 font-semibold text-cream-50' : 'bg-white text-ink hover:bg-cream-200'}`}
          >
            {s.name}
            {s.hidden && <span className="ml-1 opacity-70">(숨김)</span>}
          </button>
        ))}
      </div>

      {/* 수식 입력줄 */}
      <div className="mb-2 flex items-stretch gap-2">
        <div className="flex w-20 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-white font-mono text-sm">{ref}</div>
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
          className="min-w-0 flex-1 rounded-lg border border-cream-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-forest-500 read-only:bg-cream-100"
        />
      </div>
      {(notice || cell?.locked || cell?.pending) && (
        <p className="mb-2 text-sm text-muted">{notice ?? cell?.locked ?? '고친 수식은 엑셀에서 열면 계산됩니다. 여기서는 수식만 보입니다.'}</p>
      )}

      {edited && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          수식 칸의 값은 고치기 전 계산 결과입니다. 이 화면은 수식을 다시 계산하지 않으며, 저장한 파일을 엑셀에서 열면 새로 계산됩니다.
        </p>
      )}

      {/* 표 */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onGridKey}
        className="max-h-[65vh] overflow-auto rounded-xl border border-cream-300 bg-white outline-none focus:ring-2 focus:ring-forest-100"
      >
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ tableLayout: 'fixed', width: 48 + Array.from({ length: cols }, (_, i) => sheet.widths.get(i + 1) ?? DEFAULT_W).reduce((a, b) => a + b, 0) }}
        >
          <colgroup>
            <col style={{ width: 48 }} />
            {Array.from({ length: cols }, (_, i) => (
              <col key={i} style={{ width: sheet.widths.get(i + 1) ?? DEFAULT_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 border-r border-b border-cream-300 bg-cream-200" />
              {Array.from({ length: cols }, (_, i) => (
                <th
                  key={i}
                  className={`sticky top-0 z-10 overflow-hidden border-r border-b border-cream-300 px-1 py-1 text-xs font-medium ${sel.c === i + 1 ? 'bg-forest-100 text-forest-900' : 'bg-cream-100 text-muted'}`}
                >
                  {colName(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: last - first + 1 }, (_, ri) => {
              const r = first + ri
              return (
                <tr key={r}>
                  <th className={`sticky left-0 z-10 border-r border-b border-cream-300 px-1 text-right text-xs font-medium ${sel.r === r ? 'bg-forest-100 text-forest-900' : 'bg-cream-100 text-muted'}`}>{r}</th>
                  {Array.from({ length: cols }, (_, ci) => {
                    const c = ci + 1
                    const k = cellRef(r, c)
                    if (covered.has(k)) return null
                    const m = masters.get(k)
                    const v = sheet.cells.get(k)
                    const selected = sel.r === r && sel.c === c
                    return (
                      <td
                        key={c}
                        data-ref={k}
                        rowSpan={m?.rows}
                        colSpan={m?.cols}
                        onMouseDown={() => {
                          commit()
                          setSel({ r, c })
                        }}
                        onDoubleClick={() => inputRef.current?.focus()}
                        title={v && v.input !== v.value ? v.input : undefined}
                        className={`h-7 cursor-cell overflow-hidden border-r border-b border-cream-200 px-1.5 whitespace-nowrap text-ellipsis ${v?.num ? 'text-right' : ''} ${v?.pending ? 'text-forest-500 italic' : ''} ${
                          selected ? 'outline-2 -outline-offset-2 outline-forest-500' : ''
                        } ${matchSet.has(k) ? 'bg-amber-100' : ''} ${m ? 'text-center align-middle' : ''}`}
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

      {/* 아래 도구 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 hover:border-forest-500" onClick={() => setExtra((x) => ({ ...x, rows: x.rows + 20 }))}>
          + 행 20개
        </button>
        {cols < MAX_COLS && (
          <button className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 hover:border-forest-500" onClick={() => setExtra((x) => ({ ...x, cols: x.cols + 5 }))}>
            + 열 5개
          </button>
        )}
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <button className="rounded-lg px-2 py-1.5 hover:bg-cream-200 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ‹
            </button>
            {first}~{last}행 / {rows}
            <button className="rounded-lg px-2 py-1.5 hover:bg-cream-200 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              ›
            </button>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && nextMatch()}
            placeholder="시트에서 찾기"
            className="w-36 rounded-lg border border-cream-300 bg-white px-3 py-1.5 outline-none focus:border-forest-500"
          />
          {find.trim() && (
            <button className="rounded-lg px-2 py-1.5 text-forest-700 hover:bg-cream-200" onClick={nextMatch}>
              다음 ({matches.length})
            </button>
          )}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">
        셀을 누르고 바로 입력하거나 위 칸에서 고친 뒤 Enter. 화살표로 이동, Delete로 지우기. 숫자·날짜(2026-11-08)·=수식을 넣을 수 있고, 원래 서식·차트·그림은 그대로 저장됩니다.
      </p>
    </div>
  )
}
