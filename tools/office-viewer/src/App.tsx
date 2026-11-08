import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import SheetView from './components/SheetView'
import DocView from './components/DocView'
import { btnGhost, btnPrimary } from './ui'
import { downloadBlob } from './download'
import { baseName, MAX_FILE_BYTES } from './office/ooxml'
import * as X from './office/xlsx'
import * as D from './office/docx'

type OpenDoc = X.Workbook | D.WordDoc

const VERSION = `v${__APP_VERSION__}`
const bar = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink hover:bg-cream-200 disabled:opacity-40'

/** 엑셀·워드 문서 보기와 간단한 수정 — 파일은 어디로도 보내지 않고 이 브라우저 안에서만 처리한다 */
export default function App() {
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [menu, setMenu] = useState(false)
  const [docId, setDocId] = useState(0) // 새 문서를 열 때마다 화면 상태를 새로
  const fileRef = useRef<HTMLInputElement>(null)
  const printRef = useRef<(() => void) | null>(null)

  // 저장하지 않은 수정이 있으면 창을 닫기 전에 묻는다
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  useEffect(() => {
    document.title = doc ? `${baseName(doc.fileName)} - 엑셀·워드 문서 도구 ${VERSION}` : `엑셀·워드 문서 도구 ${VERSION}`
  }, [doc])

  // 단축키: Ctrl+O 열기, Ctrl+S 저장, Ctrl+P 인쇄
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'o') {
        e.preventDefault()
        fileRef.current?.click()
      } else if (k === 's' && doc) {
        e.preventDefault()
        save()
      } else if (k === 'p' && doc && printRef.current) {
        e.preventDefault()
        printRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function confirmDiscard() {
    return !dirty || window.confirm('저장하지 않은 수정 내용이 있습니다. 버리고 계속할까요?')
  }

  async function replace(next: Promise<OpenDoc>) {
    setBusy(true)
    setError(null)
    setMenu(false)
    try {
      const opened = await next
      if (doc?.kind === 'docx') D.closeDocx(doc)
      setDoc(opened)
      setDocId((n) => n + 1)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '문서를 열지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function openFile(file: File | undefined) {
    if (!file || !confirmDiscard()) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (file.size > MAX_FILE_BYTES) return setError('30MB보다 큰 파일은 열 수 없습니다.')
    if (ext === 'xlsx' || ext === 'xlsm') return replace(X.openXlsx(file, file.name))
    if (ext === 'docx' || ext === 'docm') return replace(D.openDocx(file, file.name))
    if (ext === 'xls' || ext === 'doc') return setError('예전 형식(.xls·.doc)은 열 수 없습니다. 엑셀·워드에서 "다른 이름으로 저장" → .xlsx·.docx로 바꿔 주세요.')
    setError('엑셀(.xlsx) 또는 워드(.docx) 파일만 열 수 있습니다.')
  }

  async function save() {
    if (!doc) return
    setBusy(true)
    setMenu(false)
    try {
      if (doc.kind === 'xlsx') downloadBlob(await X.saveXlsx(doc), X.xlsxFileName(doc))
      else downloadBlob(await D.saveDocx(doc), D.docxFileName(doc))
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function saveText() {
    if (!doc) return
    setMenu(false)
    if (doc.kind === 'xlsx') {
      const sheet = doc.sheets[doc.active] ?? doc.sheets[0]
      downloadBlob(X.sheetToCsv(sheet), `${baseName(doc.fileName)}-${sheet.name}.csv`)
    } else downloadBlob(D.docxToText(doc), `${baseName(doc.fileName)}.txt`)
  }

  function close() {
    setMenu(false)
    if (!doc || !confirmDiscard()) return
    if (doc.kind === 'docx') D.closeDocx(doc)
    setDoc(null)
    setDirty(false)
  }

  const changed = () => {
    setDirty(true)
    bump()
  }

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDrag(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget === e.target) setDrag(false)
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      setDrag(false)
      openFile(e.dataTransfer.files[0])
    },
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      hidden
      accept=".xlsx,.xlsm,.docx,.docm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      onChange={(e) => {
        openFile(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )
  const errorBox = error && (
    <div className="flex items-start gap-2 bg-red-50 px-4 py-2 text-sm text-red-700">
      <span className="flex-1">{error}</span>
      <button onClick={() => setError(null)} className="text-red-700/70 hover:text-red-700">
        닫기
      </button>
    </div>
  )

  // ── 시작 화면 ──
  if (!doc) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-12">
        {fileInput}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-forest-900 sm:text-[28px]">
            엑셀·워드 문서 도구 <span className="ml-1 align-middle rounded-lg bg-forest-50 px-2 py-0.5 text-sm font-semibold text-forest-700">{VERSION}</span>
          </h1>
          <p className="mt-2 text-[15px] text-muted">엑셀·워드 파일을 보고, 간단히 고치고, 인쇄합니다. 설치·인터넷 연결 없이 이 파일 하나로 동작합니다.</p>
        </header>
        {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">{error}</div>}
        <div
          {...dropProps}
          className={`rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-forest-500 bg-forest-50' : 'border-cream-300 bg-cream-50'}`}
        >
          <div className="text-4xl">📄</div>
          <p className="mt-3 text-[15px] text-ink">엑셀(.xlsx)·워드(.docx) 파일을 여기에 끌어다 놓거나</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button className={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '여는 중…' : '파일 열기'}
            </button>
            <button className={btnGhost} disabled={busy} onClick={() => replace(X.newXlsx())}>
              새 엑셀
            </button>
            <button className={btnGhost} disabled={busy} onClick={() => replace(D.newDocx())}>
              새 워드
            </button>
          </div>
          <p className="mt-5 text-sm text-muted">파일은 어디로도 보내지 않고 이 브라우저 안에서만 열고 고칩니다.</p>
        </div>
        <p className="mt-6 text-sm text-muted">단축키: Ctrl+O 열기 · Ctrl+S 저장 · Ctrl+P 인쇄 · Ctrl+Z 되돌리기 · Ctrl+C/V 복사·붙여넣기</p>
      </div>
    )
  }

  // ── 문서 화면: 위쪽 도구 모음 + 문서가 남은 화면을 모두 씀 ──
  const kindLabel = doc.kind === 'xlsx' ? '엑셀' : '워드'
  return (
    <div {...dropProps} className="flex h-screen flex-col">
      {fileInput}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-cream-300 bg-white px-2 py-1">
        <div className="relative">
          <button className={`${bar} font-semibold`} onClick={() => setMenu((m) => !m)}>
            파일 ▾
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-cream-300 bg-white py-1 shadow-lg">
                {[
                  { label: '열기…', key: 'Ctrl+O', run: () => (setMenu(false), fileRef.current?.click()) },
                  { label: '새 엑셀', run: () => confirmDiscard() && replace(X.newXlsx()) },
                  { label: '새 워드', run: () => confirmDiscard() && replace(D.newDocx()) },
                  null,
                  { label: `저장 (.${doc.kind})`, key: 'Ctrl+S', run: save },
                  { label: doc.kind === 'xlsx' ? '지금 시트를 CSV로 저장' : '글만 저장 (.txt)', run: saveText },
                  null,
                  { label: '인쇄…', key: 'Ctrl+P', run: () => (setMenu(false), printRef.current?.()) },
                  null,
                  { label: '닫기', run: close },
                ].map((m, i) =>
                  m ? (
                    <button key={i} onClick={m.run} className="flex w-full items-center justify-between px-4 py-1.5 text-left text-sm hover:bg-cream-100">
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
        </div>
        <button className={bar} onClick={() => fileRef.current?.click()} disabled={busy} title="열기 (Ctrl+O)">
          📂 열기
        </button>
        <button className={bar} onClick={save} disabled={busy} title="저장 (Ctrl+S)">
          💾 저장
        </button>
        <button className={bar} onClick={() => printRef.current?.()} title="인쇄 (Ctrl+P)">
          🖨 인쇄
        </button>
        <span className="mx-2 h-5 w-px bg-cream-300" />
        <span className="mr-1 rounded bg-forest-50 px-1.5 py-0.5 text-[11px] font-semibold text-forest-700">{kindLabel}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-forest-900">
          {baseName(doc.fileName)}
          {dirty && <span className="ml-2 font-normal text-muted">· 수정됨</span>}
          {busy && <span className="ml-2 font-normal text-muted">· 처리 중…</span>}
        </span>
        <span className="px-1 text-xs text-muted" title="프로그램 버전">{VERSION}</span>
        <button className={`${bar} text-muted`} onClick={close} title="문서 닫기">
          ✕ 닫기
        </button>
      </div>
      {errorBox}
      <div className="min-h-0 flex-1">
        {doc.kind === 'xlsx' ? (
          <SheetView key={docId} wb={doc} onChange={changed} printRef={printRef} />
        ) : (
          <DocView key={docId} d={doc} onChange={changed} printRef={printRef} />
        )}
      </div>
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-forest-900/20">
          <div className="rounded-2xl bg-white px-6 py-4 text-[15px] font-semibold text-forest-900 shadow-lg">여기에 놓으면 파일을 엽니다</div>
        </div>
      )}
    </div>
  )
}
