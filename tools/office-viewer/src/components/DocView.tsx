import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { flushSync } from 'react-dom'
import { PrintPortal } from './Print'
import { ZoomControl, loadZoom, saveZoom } from './Zoom'
import {
  canChangeLevel,
  countMatches,
  deleteParagraph,
  insertParagraphAfter,
  LEVELS,
  refresh,
  replaceAll,
  setAlign,
  setLevel,
  setParagraphText,
  toggleFormat,
  type Align,
  type Block,
  type Level,
  type Para,
  type WordDoc,
} from '../office/docx'

const LEVEL_CLASS: Record<Para['level'], string> = {
  title: 'text-3xl font-bold text-forest-900 mb-4',
  h1: 'text-2xl font-bold text-forest-900 mt-6 mb-3',
  h2: 'text-xl font-bold text-forest-900 mt-5 mb-2',
  h3: 'text-lg font-semibold text-forest-900 mt-4 mb-2',
  normal: 'mb-2',
  other: 'mb-2',
}
const ALIGN_CLASS: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right', both: 'text-justify' }
const ALIGNS: { id: Align; label: string }[] = [
  { id: 'left', label: '왼쪽' },
  { id: 'center', label: '가운데' },
  { id: 'right', label: '오른쪽' },
  { id: 'both', label: '양쪽' },
]
const tool = 'rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-sm hover:border-forest-500'

/** 워드 문서 보기 + 문단 고치기 */
export default function DocView({ d, onChange, printRef }: { d: WordDoc; onChange: () => void; printRef: MutableRefObject<(() => void) | null> }) {
  const [editing, setEditing] = useState<Element | null>(null)
  const [find, setFind] = useState('')
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [zoom, setZoom] = useState(() => loadZoom('doc') ?? 100)
  const [printing, setPrinting] = useState(false)

  function changed() {
    refresh(d)
    onChange()
  }

  function run(action: () => void) {
    action()
    changed()
  }

  // 인쇄: 편집 표시 없이 문서 내용만 인쇄용 영역에 그린다
  useEffect(() => {
    printRef.current = () => {
      setEditing(null)
      flushSync(() => setPrinting(true))
      window.print()
      setPrinting(false)
    }
    const before = () => {
      if (!document.getElementById('print-root')?.childElementCount) flushSync(() => setPrinting(true))
    }
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      printRef.current = null
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [printRef])

  const props = { d, editing, setEditing, run }
  const matches = countMatches(d, find)
  const pgSz = Array.from(d.doc.getElementsByTagNameNS('*', 'pgSz')).pop()
  const landscape = !!pgSz && (pgSz.getAttribute('w:orient') === 'landscape' || Number(pgSz.getAttribute('w:w')) > Number(pgSz.getAttribute('w:h')))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 도구 모음: 찾아 바꾸기 + 배율 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-cream-300 bg-cream-50 px-2 py-1.5 text-sm">
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="찾을 글" className="w-32 rounded-lg border border-cream-300 bg-white px-2 py-1 outline-none focus:border-forest-500" />
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="바꿀 글" className="w-32 rounded-lg border border-cream-300 bg-white px-2 py-1 outline-none focus:border-forest-500" />
        <button
          className={tool}
          disabled={!matches}
          onClick={() => {
            const n = replaceAll(d, find, to)
            changed()
            setMsg(`${n}곳을 바꿨습니다.`)
          }}
        >
          모두 바꾸기
        </button>
        {find && <span className="text-muted">{matches}곳 찾음</span>}
        {msg && <span className="text-forest-700">{msg}</span>}
        <span className="flex-1" />
        <ZoomControl
          value={zoom}
          onChange={(z) => {
            setZoom(z)
            saveZoom('doc', z)
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-cream-200 p-2 sm:p-6">
        <article
          style={{ zoom: zoom / 100, maxWidth: landscape ? 1120 : 800 }}
          className="mx-auto rounded-lg bg-white px-5 py-8 text-[15px] leading-relaxed text-ink shadow-sm sm:px-14 sm:py-14"
        >
          <Blocks blocks={d.blocks} {...props} />
        </article>
        <p className="mx-auto mt-3 max-w-[800px] text-xs text-muted">
          문단을 누르면 고칠 수 있습니다. 글을 고쳐도 굵게·색 같은 글자 모양과 그림은 최대한 남기며, 머리글·바닥글·각주 등 이 화면에 안 보이는 내용도 그대로 저장됩니다.
        </p>
      </div>

      {printing && (
        <PrintPortal landscape={landscape}>
          <article className="text-[15px] leading-relaxed text-black">
            <Blocks blocks={d.blocks} d={d} editing={null} setEditing={() => {}} run={() => {}} />
          </article>
        </PrintPortal>
      )}
    </div>
  )
}

type Props = { d: WordDoc; editing: Element | null; setEditing: (el: Element | null) => void; run: (action: () => void) => void }

function Blocks({ blocks, ...props }: Props & { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b) =>
        b.kind === 'p' ? (
          <Paragraph key={b.key} p={b} {...props} />
        ) : (
          <div key={b.key} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.cells.map((cell, ci) => (
                      <td key={ci} colSpan={cell.span > 1 ? cell.span : undefined} className="border border-cream-300 px-2 py-1 align-top">
                        <Blocks blocks={cell.blocks} {...props} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </>
  )
}

function runStyle(r: Para['runs'][number]): CSSProperties {
  return {
    fontWeight: r.b ? 700 : undefined,
    fontStyle: r.i ? 'italic' : undefined,
    textDecoration: [r.u && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
    fontSize: r.size ? `${Math.min(Math.max(r.size, 7), 48) * 1.333}px` : undefined,
    color: r.color,
  }
}

function Paragraph({ p, d, editing, setEditing, run }: Props & { p: Para }) {
  const active = editing === p.el
  const [draft, setDraft] = useState(p.text)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!active) return
    setDraft(p.text)
    const el = areaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [active]) // 편집을 시작할 때만 맞춘다

  // 글 높이에 맞게 늘인다
  useEffect(() => {
    const el = areaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [draft, active])

  const cls = `${LEVEL_CLASS[p.level]} ${ALIGN_CLASS[p.align]} whitespace-pre-wrap break-words`

  if (!active) {
    return (
      <div onClick={() => setEditing(p.el)} className={`${cls} -mx-2 cursor-text rounded px-2 hover:bg-forest-50`}>
        {p.list && <span className="mr-2 text-muted">•</span>}
        {p.runs.length === 0 || (p.runs.every((r) => !r.text && !r.img)) ? (
          <span className="text-transparent select-none">.</span>
        ) : (
          p.runs.map((r, i) =>
            r.img ? (
              r.img.src ? (
                <img key={i} src={r.img.src} alt="" style={{ width: r.img.w, maxWidth: '100%', height: 'auto' }} className="inline-block align-bottom" />
              ) : (
                <span key={i} className="inline-block rounded bg-cream-200 px-2 py-1 text-xs text-muted">그림 (미리보기 불가)</span>
              )
            ) : (
              <span key={i} style={runStyle(r)}>
                {r.text}
              </span>
            ),
          )
        )}
      </div>
    )
  }

  const hasImage = p.runs.some((r) => r.img)
  return (
    <div className="-mx-2 my-2 rounded-xl border border-forest-500 bg-forest-50/40 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {canChangeLevel(d) && (
          <select
            value={p.level === 'other' ? '' : p.level}
            onChange={(e) => run(() => setLevel(d, p.el, e.target.value as Level))}
            className="rounded-lg border border-cream-300 bg-white px-2 py-1 text-sm"
          >
            {p.level === 'other' && <option value="">문서 스타일</option>}
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        <button className={`${tool} font-bold`} title="문단 전체 굵게" onClick={() => run(() => toggleFormat(d, p.el, 'b'))}>
          B
        </button>
        <button className={`${tool} italic`} title="문단 전체 기울임" onClick={() => run(() => toggleFormat(d, p.el, 'i'))}>
          I
        </button>
        <button className={`${tool} underline`} title="문단 전체 밑줄" onClick={() => run(() => toggleFormat(d, p.el, 'u'))}>
          U
        </button>
        <select value={p.align} onChange={(e) => run(() => setAlign(d, p.el, e.target.value as Align))} className="rounded-lg border border-cream-300 bg-white px-2 py-1 text-sm">
          {ALIGNS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} 맞춤
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button
          className={tool}
          onClick={() => {
            let np: Element | null = null
            run(() => (np = insertParagraphAfter(d, p.el)))
            setEditing(np)
          }}
        >
          + 아래에 문단
        </button>
        <button
          className="rounded-lg px-2.5 py-1 text-sm text-red-700 hover:bg-red-50"
          onClick={() => {
            if (hasImage && !window.confirm('그림이 들어 있는 문단입니다. 지울까요?')) return
            run(() => deleteParagraph(d, p.el))
            setEditing(null)
          }}
        >
          삭제
        </button>
        <button className="rounded-lg bg-forest-700 px-3 py-1 text-sm font-semibold text-cream-50 hover:bg-forest-900" onClick={() => setEditing(null)}>
          완료
        </button>
      </div>
      <textarea
        ref={areaRef}
        value={draft}
        rows={1}
        onChange={(e) => {
          setDraft(e.target.value)
          run(() => setParagraphText(d, p.el, e.target.value))
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') setEditing(null)
          // Enter = 새 문단, Shift+Enter = 문단 안 줄바꿈 (워드와 같은 방식)
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget
            const before = draft.slice(0, el.selectionStart)
            const after = draft.slice(el.selectionEnd)
            let np: Element | null = null
            run(() => {
              setParagraphText(d, p.el, before)
              np = insertParagraphAfter(d, p.el, after)
            })
            setEditing(np)
          }
        }}
        className={`${cls} block w-full resize-none overflow-hidden rounded-lg border-0 bg-white px-2 py-1 outline-none`}
      />
      {hasImage && <p className="mt-1 text-xs text-muted">이 문단의 그림은 글을 고쳐도 그대로 남습니다.</p>}
    </div>
  )
}
