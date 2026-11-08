import { useEffect, useReducer, useRef, useState } from 'react'
import SheetView from './components/SheetView'
import DocView from './components/DocView'
import { btnGhost, btnPrimary } from './ui'
import { downloadBlob } from './download'
import { baseName, MAX_FILE_BYTES } from './office/ooxml'
import * as X from './office/xlsx'
import * as D from './office/docx'

type OpenDoc = X.Workbook | D.WordDoc

/** 엑셀·워드 문서 보기와 간단한 수정 — 파일은 어디로도 보내지 않고 이 브라우저 안에서만 처리한다 */
export default function App() {
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 저장하지 않은 수정이 있으면 창을 닫기 전에 묻는다
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  function confirmDiscard() {
    return !dirty || window.confirm('저장하지 않은 수정 내용이 있습니다. 버리고 계속할까요?')
  }

  async function replace(next: Promise<OpenDoc>) {
    setBusy(true)
    setError(null)
    try {
      const opened = await next
      if (doc?.kind === 'docx') D.closeDocx(doc)
      setDoc(opened)
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
    try {
      if (doc.kind === 'xlsx') {
        const m = X
        downloadBlob(await m.saveXlsx(doc), m.xlsxFileName(doc))
      } else {
        const m = D
        downloadBlob(await m.saveDocx(doc), m.docxFileName(doc))
      }
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (!doc || !confirmDiscard()) return
    if (doc.kind === 'docx') D.closeDocx(doc)
    setDoc(null)
    setDirty(false)
  }

  const changed = () => {
    setDirty(true)
    bump()
  }

  const start = (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        openFile(e.dataTransfer.files[0])
      }}
      className={`rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-forest-500 bg-forest-50' : 'border-cream-300 bg-cream-50'}`}
    >
      <div className="text-4xl">📄</div>
      <p className="mt-3 text-[15px] text-ink">엑셀(.xlsx)·워드(.docx) 파일을 여기에 끌어다 놓거나</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button className={btnPrimary} disabled={busy} onClick={() => fileRef.current?.click()}>
          파일 열기
        </button>
        <button className={btnGhost} disabled={busy} onClick={() => confirmDiscard() && replace(X.newXlsx())}>
          새 엑셀
        </button>
        <button className={btnGhost} disabled={busy} onClick={() => confirmDiscard() && replace(D.newDocx())}>
          새 워드
        </button>
      </div>
      <p className="mt-5 text-sm text-muted">파일은 어디로도 보내지 않고 이 브라우저 안에서만 열고 고칩니다.</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-forest-900 sm:text-[28px]">엑셀·워드 문서 도구</h1>
        <p className="mt-2 text-[15px] text-muted">엑셀·워드 파일을 보고 간단히 고친 뒤 다시 저장합니다. 설치·인터넷 연결 없이 이 파일 하나로 동작합니다.</p>
      </header>
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
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">{error}</div>}
      {busy && !doc && <div className="mb-4 text-[15px] text-muted">여는 중…</div>}

      {!doc ? (
        start
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 rounded-lg bg-forest-50 px-2 py-1 text-xs font-semibold text-forest-700">{doc.kind === 'xlsx' ? '엑셀' : '워드'}</span>
            <span className="mr-auto min-w-0 truncate text-[15px] font-semibold text-forest-900">
              {baseName(doc.fileName)}
              {dirty && <span className="ml-2 text-sm font-normal text-muted">· 수정됨</span>}
            </span>
            <button className={btnGhost} onClick={() => fileRef.current?.click()} disabled={busy}>
              다른 파일
            </button>
            <button
              className={btnGhost}
              onClick={async () => {
                if (doc.kind === 'xlsx') {
                  const m = X
                  const sheet = doc.sheets[doc.active] ?? doc.sheets[0]
                  downloadBlob(m.sheetToCsv(sheet), `${baseName(doc.fileName)}-${sheet.name}.csv`)
                } else {
                  downloadBlob(D.docxToText(doc), `${baseName(doc.fileName)}.txt`)
                }
              }}
            >
              {doc.kind === 'xlsx' ? 'CSV로 저장' : '글만 저장(.txt)'}
            </button>
            <button className={btnPrimary} onClick={save} disabled={busy}>
              {busy ? '저장 중…' : `${doc.kind === 'xlsx' ? '.xlsx' : '.docx'} 저장`}
            </button>
            <button className="rounded-xl px-3 py-2.5 text-[15px] text-muted hover:text-ink" onClick={close}>
              닫기
            </button>
          </div>
          {doc.kind === 'xlsx' ? <SheetView wb={doc} onChange={changed} /> : <DocView d={doc} onChange={changed} />}
        </div>
      )}
    </div>
  )
}

