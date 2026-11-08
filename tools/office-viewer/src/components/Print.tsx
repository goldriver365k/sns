// 인쇄: 화면 대신 #print-root 안에 인쇄용 내용만 그려 브라우저 인쇄 창을 연다
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cellRef, rangeText, type Range, type Workbook, type XSheet } from '../office/xlsx'
import { cellCss, colWidth, mergeLayout, rowHeight } from './sheetRender'

// A4 에서 여백 10mm 를 뺀 인쇄 가능 너비(px, 96dpi)
const PRINTABLE = { portrait: ((210 - 20) / 25.4) * 96, landscape: ((297 - 20) / 25.4) * 96 }

export function PrintPortal({ landscape, children }: { landscape: boolean; children: ReactNode }) {
  const root = document.getElementById('print-root')
  if (!root) return null
  return createPortal(
    <>
      <style>{`@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }`}</style>
      {children}
    </>,
    root,
  )
}

export type SheetPrintJob = { range: Range; landscape: boolean; fit: boolean; grid: boolean }

/** 엑셀 범위를 인쇄용 표로 */
export function SheetPrint({ wb, sheet, job }: { wb: Workbook; sheet: XSheet; job: SheetPrintJob }) {
  const { range } = job
  const { spans, covered } = mergeLayout(sheet, range)
  const cols: number[] = []
  for (let c = range.c1; c <= range.c2; c++) if (colWidth(sheet, c) > 0) cols.push(c)
  const width = cols.reduce((n, c) => n + colWidth(sheet, c), 0)
  const scale = job.fit ? Math.min(1, PRINTABLE[job.landscape ? 'landscape' : 'portrait'] / width) : 1
  const rows: number[] = []
  for (let r = range.r1; r <= range.r2; r++) if (rowHeight(sheet, r) > 0) rows.push(r)
  const grid = job.grid ? '1px solid #c8c8c8' : undefined
  return (
    <PrintPortal landscape={job.landscape}>
      <table style={{ zoom: scale, borderCollapse: 'collapse', tableLayout: 'fixed', width, color: '#000' }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c} style={{ width: colWidth(sheet, c) }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((r) => (
            <tr key={r} style={{ height: rowHeight(sheet, r) }}>
              {cols.map((c) => {
                const ref = cellRef(r, c)
                if (covered.has(ref)) return null
                const span = spans.get(ref)
                const cell = sheet.cells.get(ref)
                return (
                  <td
                    key={c}
                    rowSpan={span && span.rows > 1 ? span.rows : undefined}
                    colSpan={span && span.cols > 1 ? span.cols : undefined}
                    style={{ border: grid, padding: '0 3px', overflow: 'hidden', ...cellCss(wb, sheet, ref, cell) }}
                  >
                    {cell?.value}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </PrintPortal>
  )
}

type Choice = 'area' | 'selection' | 'sheet'

/** 엑셀 인쇄 설정 창 */
export function SheetPrintDialog({
  sheet,
  selection,
  used,
  onPrint,
  onClose,
  value,
  onValue,
}: {
  sheet: XSheet
  selection: Range
  used: Range
  value: { choice: Choice; landscape: boolean; fit: boolean; grid: boolean }
  onValue: (v: { choice: Choice; landscape: boolean; fit: boolean; grid: boolean }) => void
  onPrint: (job: SheetPrintJob) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const single = selection.r1 === selection.r2 && selection.c1 === selection.c2
  const ranges: { id: Choice; label: string; range: Range | null; note?: string }[] = [
    { id: 'area', label: '인쇄 영역', range: sheet.printArea, note: sheet.printArea ? undefined : '지정 안 됨' },
    { id: 'selection', label: '선택한 범위', range: single ? null : selection, note: single ? '여러 칸을 끌어서 고르세요' : undefined },
    { id: 'sheet', label: '시트 전체', range: used },
  ]
  const chosen = ranges.find((r) => r.id === value.choice && r.range) ?? ranges.find((r) => r.range)!
  const radio = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cream-100'
  return (
    <Dialog title="인쇄" onClose={onClose}>
      <div className="space-y-4 text-[15px]">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-forest-900">인쇄할 범위</legend>
          {ranges.map((r) => (
            <label key={r.id} className={`${radio} ${r.range ? '' : 'cursor-not-allowed opacity-50'}`}>
              <input type="radio" disabled={!r.range} checked={chosen.id === r.id} onChange={() => onValue({ ...value, choice: r.id })} />
              {r.label}
              <span className="text-sm text-muted">{r.range ? rangeText(r.range) : r.note}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-forest-900">용지 방향 (A4)</legend>
          <div className="flex gap-2">
            {[false, true].map((l) => (
              <label key={String(l)} className={radio}>
                <input type="radio" checked={value.landscape === l} onChange={() => onValue({ ...value, landscape: l })} />
                {l ? '가로' : '세로'}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={radio}>
            <input type="checkbox" checked={value.fit} onChange={(e) => onValue({ ...value, fit: e.target.checked })} />
            용지 너비에 맞춰 줄이기
          </label>
          <label className={radio}>
            <input type="checkbox" checked={value.grid} onChange={(e) => onValue({ ...value, grid: e.target.checked })} />
            눈금선도 인쇄 (테두리가 없는 표)
          </label>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-[15px] hover:border-forest-500" onClick={onClose}>
          취소
        </button>
        <button
          className="rounded-xl bg-forest-700 px-5 py-2 text-[15px] font-semibold text-cream-50 hover:bg-forest-900"
          onClick={() => onPrint({ range: chosen.range!, landscape: value.landscape, fit: value.fit, grid: value.grid })}
        >
          인쇄
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">브라우저 인쇄 창에서 프린터 또는 "PDF로 저장"을 고르세요.</p>
    </Dialog>
  )
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-forest-900">{title}</h2>
        {children}
      </div>
    </div>
  )
}
