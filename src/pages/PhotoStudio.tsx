import { useEffect, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { btnGhost, btnLink, btnPrimary, fieldLabel } from '../components/ui'
import { prepareImage, type PickedImage } from '../lib/images'
import { canvasToPng, canShareImages, downloadPng, downloadZip, saveToGallery } from '../cards/export'
import { BG_COLORS, composePhoto, DEFAULT_SETTINGS, SIZES, type BgKind, type PhotoSettings, type ShadowKind } from '../photo/compose'
import { isModelReady, loadRemover, removeBackground, type Cutout, type ModelProgress } from '../photo/removeBg'

/** 한 번에 다룰 수 있는 사진 수 */
const MAX_PHOTOS = 30
const SETTINGS_KEY = 'snsroom.photo.settings'

type Item = {
  id: string
  original: PickedImage
  status: 'waiting' | 'working' | 'done' | 'error'
  cutout?: Cutout
  error?: string
}

const BG_KINDS: { value: BgKind; label: string }[] = [
  { value: 'color', label: '단색' },
  { value: 'studio', label: '스튜디오' },
  { value: 'blur', label: '원본 흐리게' },
  { value: 'transparent', label: '투명' },
]

const SHADOWS: { value: ShadowKind; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'floor', label: '바닥 그림자' },
  { value: 'soft', label: '부드러운 그림자' },
]

function loadSettings(): PhotoSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')
const mb = (n: number) => `${Math.round(n / 1048576)}MB`

/** 상품 사진 편집: 배경 제거 → 크기·배경·그림자 → 저장 (여러 장 한꺼번에) */
export default function PhotoStudio() {
  const [items, setItems] = useState<Item[]>([])
  const [settings, setSettings] = useState<PhotoSettings>(loadSettings)
  // 처음 쓰는 기기는 모델(약 170MB)을 받기 전에 한 번 확인을 받는다
  const [started, setStarted] = useState(isModelReady)
  const [progress, setProgress] = useState<ModelProgress | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const busy = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // 저장이 막혀도 이번 화면에서는 그대로 쓴다
    }
  }, [settings])

  const patch = (p: Partial<PhotoSettings>) => setSettings((s) => ({ ...s, ...p }))
  const update = (id: string, p: Partial<Item>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)))

  async function add(blobs: Blob[], source: PickedImage['source']) {
    setError(null)
    const room = MAX_PHOTOS - itemsRef.current.length
    if (room <= 0) {
      setError(`사진은 ${MAX_PHOTOS}장까지 넣을 수 있습니다.`)
      return
    }
    const added: Item[] = []
    for (const b of blobs.slice(0, room)) {
      try {
        const original = await prepareImage(b, source)
        added.push({ id: original.id, original, status: 'waiting' })
      } catch (e) {
        setError(e instanceof Error ? e.message : '사진을 넣지 못했습니다.')
      }
    }
    if (blobs.length > room) setError(`사진은 ${MAX_PHOTOS}장까지 넣을 수 있어 일부만 넣었습니다.`)
    if (added.length) setItems((list) => [...list, ...added])
  }

  // 화면 어디서든 이미지를 붙여넣으면 추가
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      add(files, 'paste')
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 기다리는 사진을 1장씩 차례로 처리한다
  useEffect(() => {
    if (!started || busy.current) return
    const next = items.find((x) => x.status === 'waiting')
    if (!next) return
    busy.current = true
    update(next.id, { status: 'working', error: undefined })
    removeBackground(next.original.url, setProgress)
      .then((cutout) => update(next.id, { status: 'done', cutout }))
      .catch((e) => {
        const message = e instanceof Error ? e.message : '배경을 지우지 못했습니다.'
        update(next.id, { status: 'error', error: message })
        if (/준비하지 못했습니다/.test(message)) {
          // 모델을 못 받았으면 나머지도 멈추고 다시 시작 버튼을 보여 준다
          setModelError(message)
          setStarted(false)
        }
      })
      .finally(() => {
        busy.current = false
        setProgress(null)
        setItems((list) => [...list]) // 다음 사진 처리를 깨운다
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, started])

  function start() {
    setModelError(null)
    setItems((list) => list.map((x) => (x.status === 'error' ? { ...x, status: 'waiting' } : x)))
    setStarted(true)
    // 사진을 넣기 전에 눌러도 모델을 미리 받아 둔다
    loadRemover(setProgress)
      .then(() => setProgress(null))
      .catch((e) => {
        setModelError(e instanceof Error ? e.message : '배경 제거 AI를 준비하지 못했습니다.')
        setStarted(false)
      })
  }

  function remove(id: string) {
    const target = items.find((x) => x.id === id)
    if (target) URL.revokeObjectURL(target.original.url)
    setItems((list) => list.filter((x) => x.id !== id))
  }

  function clearAll() {
    if (!window.confirm('넣은 사진을 모두 지울까요? (저장하지 않은 결과는 사라집니다)')) return
    items.forEach((x) => URL.revokeObjectURL(x.original.url))
    setItems([])
  }

  const done = items.filter((x) => x.status === 'done' && x.cutout)

  async function renderFiles(list: Item[]) {
    const files: { name: string; blob: Blob }[] = []
    for (const item of list) {
      const canvas = document.createElement('canvas')
      composePhoto(canvas, { original: item.original.el, cutout: item.cutout! }, settings)
      const n = items.indexOf(item) + 1
      files.push({ name: `photo_${today()}_${String(n).padStart(2, '0')}.png`, blob: await canvasToPng(canvas) })
    }
    return files
  }

  async function saveOne(item: Item) {
    const [file] = await renderFiles([item])
    downloadPng(file.blob, file.name)
  }

  async function copyOne(item: Item) {
    try {
      if (!('ClipboardItem' in window)) throw new Error()
      const canvas = document.createElement('canvas')
      composePhoto(canvas, { original: item.original.el, cutout: item.cutout! }, settings)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToPng(canvas) })])
      flash('복사되었습니다. SNS 앱이나 다른 화면에 붙여넣으세요.')
    } catch {
      flash('이 브라우저는 이미지 복사를 지원하지 않습니다. [저장]을 눌러 주세요.')
    }
  }

  async function saveAll(kind: 'zip' | 'gallery') {
    if (!done.length) return
    setSaving(true)
    try {
      const files = await renderFiles(done)
      if (kind === 'zip') await downloadZip(files, `photos_${today()}.zip`)
      else {
        const r = await saveToGallery(files)
        if (r === 'shared') flash('공유 화면에서 "이미지 저장"을 누르면 사진 앱에 저장됩니다.')
      }
    } catch {
      setError('파일을 만들지 못했습니다. 사진 수를 줄여 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  function flash(text: string) {
    setNotice(text)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const working = items.some((x) => x.status === 'working' || x.status === 'waiting') && started
  const colorEnabled = settings.bg === 'color' || settings.bg === 'studio'

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="상품 사진 편집"
        description="배경을 지우고 흰 배경·스튜디오 배경·그림자를 넣어 판매용 사진으로 만듭니다. 사진은 서버로 보내지 않고 이 기기 안에서 처리합니다."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        {/* 설정 (모든 사진에 똑같이 적용) — 휴대폰에서는 사진 칸 아래에 둔다 */}
        <section className="order-2 space-y-6 rounded-2xl border border-cream-300 bg-cream-50 p-5 lg:order-none lg:sticky lg:top-6">
          <div>
            <span className={fieldLabel}>크기</span>
            <div className="grid grid-cols-1 gap-1.5">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={settings.size === s.id}
                  onClick={() => patch({ size: s.id })}
                  className={`flex items-baseline justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${settings.size === s.id ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink hover:border-forest-500'}`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className={`text-xs ${settings.size === s.id ? 'text-cream-100' : 'text-muted'}`}>{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={fieldLabel}>배경</span>
            <div className="flex flex-wrap gap-1.5">
              {BG_KINDS.map((b) => (
                <button key={b.value} type="button" aria-pressed={settings.bg === b.value} onClick={() => patch({ bg: b.value })} className={`rounded-full border px-3 py-1.5 text-sm ${settings.bg === b.value ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`}>
                  {b.label}
                </button>
              ))}
            </div>
            {colorEnabled && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {BG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={`배경색 ${c.label}`}
                    aria-pressed={settings.color === c.value}
                    onClick={() => patch({ color: c.value })}
                    className={`h-8 w-8 rounded-full border-2 ${settings.color === c.value ? 'border-forest-700 ring-2 ring-forest-100' : 'border-cream-300'}`}
                    style={{ background: c.value }}
                  />
                ))}
                <label className="flex items-center gap-1 text-xs text-muted" title="직접 고르기">
                  <input type="color" value={settings.color} onChange={(e) => patch({ color: e.target.value })} className="h-8 w-8 cursor-pointer rounded-full border border-cream-300 bg-white p-0.5" aria-label="배경색 직접 고르기" />
                  직접
                </label>
              </div>
            )}
            {settings.bg === 'transparent' && <p className="mt-2 text-xs text-muted">투명 배경은 PNG로 저장되어 다른 디자인에 그대로 얹을 수 있습니다.</p>}
          </div>

          <div>
            <span className={fieldLabel}>그림자</span>
            <div className="flex flex-wrap gap-1.5">
              {SHADOWS.map((s) => (
                <button key={s.value} type="button" aria-pressed={settings.shadow === s.value} onClick={() => patch({ shadow: s.value })} className={`rounded-full border px-3 py-1.5 text-sm ${settings.shadow === s.value ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {settings.size !== 'original' && (
            <div>
              <label htmlFor="photo-padding" className={fieldLabel}>
                여백 <span className="font-normal text-muted">{Math.round(settings.padding * 100)}%</span>
              </label>
              <input id="photo-padding" type="range" min={0} max={30} step={1} value={Math.round(settings.padding * 100)} onChange={(e) => patch({ padding: Number(e.target.value) / 100 })} className="w-full accent-forest-700" />
              <p className="mt-1 text-xs text-muted">스마트스토어·쿠팡 대표 이미지는 상품이 꽉 차 보이게 5~10%를 권장합니다.</p>
            </div>
          )}

          <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)} className={btnLink}>
            처음 설정으로
          </button>
        </section>

        {/* 사진 넣기 + 결과 */}
        <section className="order-1 min-w-0 space-y-4 lg:order-none">
          {!started && (
            <div className="rounded-2xl border border-forest-100 bg-forest-50 p-5">
              <p className="text-[15px] font-semibold text-forest-900">배경 제거 AI를 처음 한 번 내려받습니다 (약 170MB)</p>
              <p className="mt-1 text-sm text-muted">이 기기 브라우저에 저장되어 다음부터는 바로 시작합니다. 휴대폰은 와이파이에서 시작해 주세요.</p>
              {modelError && <p className="mt-2 text-sm text-red-700">{modelError}</p>}
              <button type="button" onClick={start} className={`${btnPrimary} mt-3`}>
                {modelError ? '다시 시도' : '배경 제거 시작'}
              </button>
            </div>
          )}

          {progress && progress.total > 0 && progress.loaded < progress.total && (
            <div className="rounded-xl border border-cream-300 bg-white p-4" role="status">
              <div className="flex justify-between text-sm">
                <span>배경 제거 AI 내려받는 중…</span>
                <span className="text-muted">
                  {mb(progress.loaded)} / {mb(progress.total)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-200">
                <div className="h-full bg-forest-500 transition-all" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              add([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')), 'file')
            }}
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-forest-500 bg-forest-50' : 'border-cream-300 bg-white'}`}
          >
            <p className="text-[15px] text-ink">상품 사진을 끌어다 놓거나, 복사한 사진을 붙여넣으세요 (Ctrl+V)</p>
            <p className="mt-1 text-xs text-muted">
              여러 장을 한꺼번에 넣으면 같은 설정으로 모두 만듭니다 · {items.length}/{MAX_PHOTOS}장
            </p>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={items.length >= MAX_PHOTOS} className="mt-3 rounded-lg border border-cream-300 bg-cream-50 px-4 py-2 text-sm font-medium text-forest-700 hover:border-forest-500 disabled:opacity-40">
              파일 찾기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                add([...(e.target.files ?? [])], 'file')
                e.target.value = ''
              }}
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          {items.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  완성 {done.length}/{items.length}장{working && ' · 배경 지우는 중…'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={clearAll} className={`${btnGhost} px-3 py-2 text-sm`}>
                    모두 지우기
                  </button>
                  {canShareImages() && (
                    <button type="button" onClick={() => saveAll('gallery')} disabled={!done.length || saving} className={`${btnGhost} px-3 py-2 text-sm disabled:opacity-40`}>
                      갤러리에 저장
                    </button>
                  )}
                  <button type="button" onClick={() => saveAll('zip')} disabled={!done.length || saving} className={`${btnPrimary} px-4 py-2 text-sm`}>
                    {saving ? '만드는 중…' : `전체 ZIP 저장 (${done.length})`}
                  </button>
                </div>
              </div>

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((item, i) => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    index={i}
                    settings={settings}
                    started={started}
                    onRemove={() => remove(item.id)}
                    onRetry={() => update(item.id, { status: 'waiting', error: undefined })}
                    onSave={() => saveOne(item)}
                    onCopy={() => copyOne(item)}
                  />
                ))}
              </ul>
            </>
          )}

          {notice && (
            <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest-900 px-5 py-2.5 text-sm text-cream-50 shadow-lg">
              {notice}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** 투명 배경을 알아보기 쉽게 깔아 주는 체크무늬 */
const CHECKER = {
  backgroundImage: 'linear-gradient(45deg,#e5e2da 25%,transparent 25%),linear-gradient(-45deg,#e5e2da 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e2da 75%),linear-gradient(-45deg,transparent 75%,#e5e2da 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
}

type CardProps = {
  item: Item
  index: number
  settings: PhotoSettings
  started: boolean
  onRemove: () => void
  onRetry: () => void
  onSave: () => void
  onCopy: () => void
}

function ResultCard({ item, index, settings, started, onRemove, onRetry, onSave, onCopy }: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 미리보기 = 저장 파일 (같은 함수로 그린다)
  useEffect(() => {
    if (item.status !== 'done' || !item.cutout || !canvasRef.current) return
    composePhoto(canvasRef.current, { original: item.original.el, cutout: item.cutout }, settings)
  }, [item, settings])

  const label = item.status === 'working' ? '배경 지우는 중…' : item.status === 'waiting' ? (started ? '차례를 기다리는 중' : '시작을 누르면 처리합니다') : null

  return (
    <li className="overflow-hidden rounded-xl border border-cream-300 bg-white">
      <div className="relative flex aspect-square items-center justify-center" style={settings.bg === 'transparent' && item.status === 'done' ? CHECKER : { background: '#f7f3ea' }}>
        {item.status === 'done' ? (
          <canvas ref={canvasRef} aria-label={`완성 사진 ${index + 1}`} className="max-h-full max-w-full" />
        ) : (
          <img src={item.original.url} alt={`원본 사진 ${index + 1}`} className={`max-h-full max-w-full object-contain ${item.status === 'error' ? '' : 'opacity-60'}`} />
        )}
        {label && (
          <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/60 px-2 py-1 text-center text-xs text-white">
            {item.status === 'working' && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />}
            {label}
          </span>
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/55 px-1.5 text-[11px] text-white">{index + 1}</span>
        <button type="button" aria-label={`사진 ${index + 1} 빼기`} onClick={onRemove} className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-sm leading-6 text-white hover:bg-red-600">
          ×
        </button>
      </div>
      {item.status === 'error' && (
        <div className="space-y-1 p-2">
          <p className="text-xs text-red-700">{item.error}</p>
          <button type="button" onClick={onRetry} className={`${btnLink} text-xs`}>
            다시 시도
          </button>
        </div>
      )}
      {item.status === 'done' && (
        <div className="flex border-t border-cream-200 text-sm">
          <button type="button" onClick={onSave} className="flex-1 py-2 font-medium text-forest-700 hover:bg-cream-100">
            저장
          </button>
          <button type="button" onClick={onCopy} className="flex-1 border-l border-cream-200 py-2 text-forest-700 hover:bg-cream-100">
            복사
          </button>
        </div>
      )}
    </li>
  )
}
