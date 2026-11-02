import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import AiBgPanel, { MAX_AI_BACKGROUNDS, type AiBackground } from '../components/AiBgPanel'
import EditorStage, { type Selection } from '../components/photo/EditorStage'
import SizePicker from '../components/photo/SizePicker'
import TextPanel from '../components/photo/TextPanel'
import PhotoReelDialog, { type PhotoReelInput } from '../components/PhotoReelDialog'
import ProductAnimatorDialog from '../components/ProductAnimatorDialog'
import { btnGhost, btnPrimary } from '../components/ui'
import { canvasToPng, downloadPng } from '../cards/export'
import { prepareImage } from '../lib/images'
import { BG_COLORS, composePhoto, fontSpec, NO_TRANSFORM, shapeFor, SIZES, sizeLabel, targetSize, type BgKind, type PhotoSettings, type PhotoSource, type ShadowKind, type TextLayer } from '../photo/compose'
import { getEditor, openPhoto, patchDoc, rememberSettings, setEditor, useEditor, type DesignState, type EditorTool } from '../photo/editorStore'
import { isModelReady, loadRemover, removeBackground, type ModelProgress } from '../photo/removeBg'
import type { VideoAspect } from '../../shared/productVideo'

const TOOLS: { id: EditorTool; icon: string; label: string }[] = [
  { id: 'background', icon: '🖼', label: '배경' },
  { id: 'shadow', icon: '🌗', label: '그림자' },
  { id: 'size', icon: '📐', label: '크기·위치' },
  { id: 'text', icon: '🔤', label: '글자' },
  { id: 'video', icon: '🎞', label: '영상·릴스' },
]

const BG_KINDS: { value: BgKind; label: string }[] = [
  { value: 'color', label: '단색' },
  { value: 'studio', label: '스튜디오' },
  { value: 'blur', label: '원본 흐리게' },
  { value: 'transparent', label: '투명' },
  { value: 'ai', label: '✨ AI 배경' },
]

const SHADOWS: { value: ShadowKind; label: string; desc: string }[] = [
  { value: 'none', label: '없음', desc: '그림자 없이' },
  { value: 'floor', label: '바닥 그림자', desc: '바닥에 놓인 느낌' },
  { value: 'soft', label: '부드러운 그림자', desc: '살짝 떠 있는 느낌' },
]

const HISTORY_MAX = 50
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')
const newId = () => Math.random().toString(36).slice(2, 10)
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`

/**
 * 상품 사진 편집기 (1장): 가운데 캔버스 + 도구 패널. Photoroom 편집기와 같은 흐름.
 * 사진을 열면 배경을 자동으로 지우고, 배경·그림자·크기·글자를 바꾸며, 상품·글자는 캔버스에서 직접 옮긴다.
 * 실행 취소·다시 실행(Ctrl+Z / Ctrl+Shift+Z), PNG 저장·복사, 제품 영상(AI)·릴스로 이어진다.
 */
export default function PhotoEditor() {
  const navigate = useNavigate()
  const { doc, design: stored, aiBgs } = useEditor()
  const [tool, setTool] = useState<EditorTool>(doc?.tool ?? 'background')
  const [design, setDesign] = useState<DesignState>(stored)
  const [selected, setSelected] = useState<Selection>(null)
  const past = useRef<DesignState[]>([])
  const future = useRef<DesignState[]>([])
  const committed = useRef<DesignState>(stored)
  const [, setHistoryTick] = useState(0)
  const [progress, setProgress] = useState<ModelProgress | null>(null)
  const [consent, setConsent] = useState(isModelReady)
  const [notice, setNotice] = useState<string | null>(null)
  const [animate, setAnimate] = useState<string | null>(null)
  const [reelOpen, setReelOpen] = useState(false)
  const [reelBusy, setReelBusy] = useState(false)
  const [reelError, setReelError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 손을 뗄 때 기록할 최신 편집 내용
  const designRef = useRef(design)
  designRef.current = design

  // 다른 사진을 열면(같은 화면에서 새 사진) 편집 내용과 기록을 새로 시작
  const docUrl = doc?.original.url
  useEffect(() => {
    const d = getEditor().design
    setDesign(d)
    committed.current = d
    past.current = []
    future.current = []
    setSelected(null)
    if (doc) setTool(doc.tool)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docUrl])

  // 편집 내용은 메뉴를 옮겨 다녀도 남도록 저장소에도 둔다
  useEffect(() => {
    setEditor({ design })
  }, [design])

  // 사진을 열면 배경을 지운다 (처음 쓰는 기기는 모델 내려받기 확인 후)
  useEffect(() => {
    if (!doc || doc.status !== 'waiting' || !consent) return
    patchDoc({ status: 'working', error: undefined })
    removeBackground(doc.original.url, setProgress)
      .then((cutout) => {
        if (getEditor().doc?.original.url === doc.original.url) patchDoc({ cutout, status: 'done' })
      })
      .catch((e) => patchDoc({ status: 'error', error: e instanceof Error ? e.message : '배경을 지우지 못했습니다.' }))
      .finally(() => setProgress(null))
  }, [doc, consent])

  /** 바꾼 내용을 실행 취소 기록에 남긴다 */
  const commit = useCallback((next: DesignState) => {
    if (JSON.stringify(next) === JSON.stringify(committed.current)) return
    past.current = [...past.current, committed.current].slice(-HISTORY_MAX)
    future.current = []
    committed.current = next
    setDesign(next)
    setHistoryTick((n) => n + 1)
    rememberSettings(next.settings)
  }, [])

  const update = (patch: Partial<DesignState>) => commit({ ...design, ...patch })
  const patchSettings = (p: Partial<PhotoSettings>) => update({ settings: { ...design.settings, ...p } })

  function undo() {
    const prev = past.current.pop()
    if (!prev) return
    future.current = [committed.current, ...future.current]
    committed.current = prev
    setDesign(prev)
    setSelected(null)
    setHistoryTick((n) => n + 1)
  }

  function redo() {
    const [next, ...rest] = future.current
    if (!next) return
    past.current = [...past.current, committed.current]
    future.current = rest
    committed.current = next
    setDesign(next)
    setHistoryTick((n) => n + 1)
  }

  // 단축키: 실행 취소·다시 실행, 고른 글자 지우기 (글 입력 중에는 동작하지 않음)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (typing) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && selected !== 'product') {
        e.preventDefault()
        removeText(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 새 사진 붙여넣기 → 그 사진으로 새로 편집
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      openNew(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  if (!doc) return <Navigate to="/photo" replace />

  const aiBg = design.settings.bg === 'ai' ? (aiBgs.find((b) => b.id === design.aiBgId)?.el ?? null) : null
  const src: PhotoSource | null = doc.cutout ? { original: doc.original.el, cutout: doc.cutout, background: aiBg } : null
  const selectedText = selected && selected !== 'product' ? selected : null

  async function openNew(file: Blob) {
    try {
      openPhoto(await prepareImage(file, 'file'), tool)
    } catch (e) {
      flash(e instanceof Error ? e.message : '사진을 열지 못했습니다.')
    }
  }

  function addAiBg(bg: AiBackground) {
    setEditor((s) => ({ aiBgs: [bg, ...s.aiBgs].slice(0, MAX_AI_BACKGROUNDS) }))
    update({ aiBgId: bg.id })
  }

  function addText(layer: Omit<TextLayer, 'id'>) {
    const t = { ...layer, id: newId() }
    update({ texts: [...design.texts, t] })
    setSelected(t.id)
  }

  function changeText(id: string, patch: Partial<TextLayer>, save: boolean) {
    const next = { ...design, texts: design.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
    if (save) commit(next)
    else setDesign(next)
  }

  function removeText(id: string) {
    update({ texts: design.texts.filter((t) => t.id !== id) })
    setSelected(null)
  }

  /** 지금 편집 내용 그대로 그린 캔버스 (글꼴을 받은 뒤) */
  async function renderCanvas(over?: Partial<PhotoSettings>, withTexts = true) {
    if (!src) throw new Error('배경을 지운 뒤에 저장할 수 있습니다.')
    await Promise.all(design.texts.map((t) => document.fonts.load(fontSpec(t, 40), t.text || ' ').catch(() => null)))
    const canvas = document.createElement('canvas')
    composePhoto(canvas, src, { ...design.settings, ...over }, { transform: design.transform, texts: withTexts ? design.texts : [] })
    return canvas
  }

  async function save() {
    try {
      downloadPng(await canvasToPng(await renderCanvas()), `photo_${today()}.png`)
    } catch (e) {
      flash(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
  }

  async function copy() {
    try {
      if (!('ClipboardItem' in window)) throw new Error()
      const canvas = await renderCanvas()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToPng(canvas) })])
      flash('복사되었습니다. SNS 앱이나 다른 화면에 붙여넣으세요.')
    } catch {
      flash('이 브라우저는 이미지 복사를 지원하지 않습니다. [저장]을 눌러 주세요.')
    }
  }

  /** 영상용: 투명 배경은 흰 배경으로 (영상·JPEG는 투명을 쓸 수 없음) */
  const opaque = (size: PhotoSettings['size']): Partial<PhotoSettings> => (design.settings.bg === 'transparent' ? { bg: 'color', color: '#ffffff', size } : { size })

  async function openAnimator() {
    try {
      setAnimate((await renderCanvas(opaque('square'), false)).toDataURL('image/jpeg', 0.7))
    } catch (e) {
      flash(e instanceof Error ? e.message : '영상을 만들 수 없습니다.')
    }
  }

  async function makeReel(v: PhotoReelInput) {
    setReelBusy(true)
    setReelError(null)
    try {
      // 릴스 디자인의 사진 칸이 4:5라 이 비율로 그려 넘긴다
      const blob = await canvasToPng(await renderCanvas(opaque('portrait')))
      const { reelFromPhotos } = await import('../reels/fromPhotos')
      await reelFromPhotos({ photos: [blob], ...v })
      navigate('/reels')
    } catch (e) {
      setReelError(e instanceof Error ? e.message : '릴스로 옮기지 못했습니다.')
      setReelBusy(false)
    }
  }

  function flash(text: string) {
    setNotice(text)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const t = design.transform
  const out = targetSize(design.settings, doc.original.width, doc.original.height)
  const moved = t.dx !== 0 || t.dy !== 0 || t.scale !== 1 || t.rotate !== 0

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* 위쪽 막대: 홈 · 실행 취소 · 저장 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/photo" className="mr-auto text-sm font-medium text-forest-700 hover:underline">
          ← 상품 사진 편집 홈
        </Link>
        {/* 크기는 언제든 바로 바꿀 수 있게 위쪽에도 둔다 */}
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-forest-900">크기</span>
          <select aria-label="결과 크기" value={design.settings.size} onChange={(e) => patchSettings({ size: e.target.value as PhotoSettings['size'] })} className="rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500">
            {SIZES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
                {x.w ? ` (${x.w}×${x.h})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={undo} disabled={!past.current.length} aria-label="실행 취소" title="실행 취소 (Ctrl+Z)" className={`${btnGhost} px-3 py-1 text-xl leading-none disabled:opacity-40`}>
          ↶
        </button>
        <button type="button" onClick={redo} disabled={!future.current.length} aria-label="다시 실행" title="다시 실행 (Ctrl+Shift+Z)" className={`${btnGhost} px-3 py-1 text-xl leading-none disabled:opacity-40`}>
          ↷
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${btnGhost} px-3 py-2 text-sm`}>
          새 사진
        </button>
        <button type="button" onClick={copy} disabled={!src} className={`${btnGhost} px-3 py-2 text-sm disabled:opacity-40`}>
          복사
        </button>
        <button type="button" onClick={save} disabled={!src} className={`${btnPrimary} px-4 py-2 text-sm`}>
          저장 (PNG)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) openNew(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[76px_320px_1fr] lg:items-start">
        {/* 도구 막대 — 휴대폰에서는 캔버스 아래 가로 줄 */}
        <nav aria-label="편집 도구" className="order-2 flex gap-1 overflow-x-auto rounded-2xl border border-cream-300 bg-cream-50 p-1.5 lg:order-none lg:sticky lg:top-6 lg:flex-col">
          {TOOLS.map((x) => (
            <button key={x.id} type="button" aria-pressed={tool === x.id} onClick={() => setTool(x.id)} className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-xs ${tool === x.id ? 'bg-forest-700 font-semibold text-cream-50' : 'text-ink hover:bg-cream-200'}`}>
              <span className="text-lg" aria-hidden>
                {x.icon}
              </span>
              {x.label}
            </button>
          ))}
        </nav>

        {/* 도구 패널 */}
        <section aria-label="도구 설정" className="order-3 rounded-2xl border border-cream-300 bg-cream-50 p-4 lg:order-none lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {tool === 'background' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {BG_KINDS.map((b) => (
                  <button key={b.value} type="button" aria-pressed={design.settings.bg === b.value} onClick={() => patchSettings({ bg: b.value })} className={chip(design.settings.bg === b.value)}>
                    {b.label}
                  </button>
                ))}
              </div>
              {(design.settings.bg === 'color' || design.settings.bg === 'studio') && (
                <div className="flex flex-wrap items-center gap-2">
                  {BG_COLORS.map((c) => (
                    <button key={c.value} type="button" title={c.label} aria-label={`배경색 ${c.label}`} aria-pressed={design.settings.color === c.value} onClick={() => patchSettings({ color: c.value })} className={`h-8 w-8 rounded-full border-2 ${design.settings.color === c.value ? 'border-forest-700 ring-2 ring-forest-100' : 'border-cream-300'}`} style={{ background: c.value }} />
                  ))}
                  <input type="color" aria-label="배경색 직접 고르기" value={design.settings.color} onChange={(e) => setDesign({ ...design, settings: { ...design.settings, color: e.target.value } })} onBlur={() => commit(design)} className="h-8 w-8 cursor-pointer rounded-full border border-cream-300 bg-white p-0.5" />
                </div>
              )}
              {design.settings.bg === 'ai' && (
                <>
                  <AiBgPanel
                    shape={shapeFor(out.w, out.h)}
                    backgrounds={aiBgs}
                    selectedId={design.aiBgId}
                    onAdd={addAiBg}
                    onSelect={(id) => update({ aiBgId: id })}
                  />
                  {!aiBg && <p className="text-xs text-muted">AI 배경을 만들기 전까지는 스튜디오 배경으로 보여 줍니다.</p>}
                </>
              )}
              {design.settings.bg === 'transparent' && <p className="text-xs text-muted">투명 배경은 PNG로 저장되어 다른 디자인에 그대로 얹을 수 있습니다.</p>}
            </div>
          )}

          {tool === 'shadow' && (
            <div className="grid gap-1.5">
              {SHADOWS.map((s) => (
                <button key={s.value} type="button" aria-pressed={design.settings.shadow === s.value} onClick={() => patchSettings({ shadow: s.value })} className={`flex items-baseline justify-between rounded-lg border px-3 py-2.5 text-left text-sm ${design.settings.shadow === s.value ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink hover:border-forest-500'}`}>
                  <span className="font-medium">{s.label}</span>
                  <span className={`text-xs ${design.settings.shadow === s.value ? 'text-cream-100' : 'text-muted'}`}>{s.desc}</span>
                </button>
              ))}
            </div>
          )}

          {tool === 'size' && (
            <div className="space-y-5">
              <SizePicker settings={design.settings} onChange={patchSettings} />
              {design.settings.size !== 'original' && (
                <Slider label="여백" value={Math.round(design.settings.padding * 100)} min={0} max={30} unit="%" onChange={(v) => setDesign({ ...design, settings: { ...design.settings, padding: v / 100 } })} onDone={() => commit(design)} />
              )}
              <Slider label="상품 크기" value={Math.round(t.scale * 100)} min={20} max={300} unit="%" onChange={(v) => setDesign({ ...design, transform: { ...t, scale: v / 100 } })} onDone={() => commit(design)} />
              <Slider label="회전" value={t.rotate} min={-180} max={180} unit="°" onChange={(v) => setDesign({ ...design, transform: { ...t, rotate: v } })} onDone={() => commit(design)} />
              <button type="button" disabled={!moved} onClick={() => update({ transform: NO_TRANSFORM })} className="text-sm font-medium text-forest-700 hover:underline disabled:opacity-40">
                상품 위치·크기·회전 처음대로
              </button>
              <p className="text-xs text-muted">사진 위에서 상품을 끌어 옮기고, 모서리 동그라미로 크기, 위쪽 동그라미로 회전합니다.</p>
            </div>
          )}

          {tool === 'text' && <TextPanel texts={design.texts} selectedId={selectedText} onAdd={addText} onSelect={setSelected} onChange={changeText} onRemove={removeText} />}

          {tool === 'video' && (
            <div className="space-y-3">
              <button type="button" onClick={openAnimator} disabled={!src} className="w-full rounded-xl border border-cream-300 bg-white p-4 text-left hover:border-forest-500 disabled:opacity-40">
                <span className="block text-[15px] font-semibold text-ink">🎞 제품 영상 (AI)</span>
                <span className="mt-1 block text-xs text-muted">이 사진을 AI가 움직이는 5·8초 영상으로. 회전·카메라 이동·물방울 등 (사용료 1초 약 $0.10)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReelError(null)
                  setReelOpen(true)
                }}
                disabled={!src}
                className="w-full rounded-xl border border-cream-300 bg-white p-4 text-left hover:border-forest-500 disabled:opacity-40"
              >
                <span className="block text-[15px] font-semibold text-ink">🎬 릴스로 만들기</span>
                <span className="mt-1 block text-xs text-muted">자막·가격표·음악·AI 목소리를 넣은 세로 MP4. AI 자동 릴스 화면으로 이어집니다 (무료)</span>
              </button>
              <p className="text-xs text-muted">사진이 여러 장이면 홈의 [여러 장 한꺼번에]에서 릴스를 만드세요.</p>
            </div>
          )}
        </section>

        {/* 가운데 캔버스 */}
        <section aria-label="캔버스" className="order-1 flex min-h-[300px] items-center justify-center rounded-2xl border border-cream-300 bg-cream-200/60 p-4 lg:order-none lg:min-h-[70vh] lg:p-8">
          {src ? (
            <div className="w-full">
              <EditorStage
                src={src}
                settings={design.settings}
                transform={design.transform}
                texts={design.texts}
                selected={selected}
                onSelect={(s) => {
                  setSelected(s)
                  if (s && s !== 'product') setTool('text')
                }}
                onPreview={(p) => setDesign((d) => ({ ...d, ...p }))}
                onCommit={() => commit(designRef.current)}
              />
              <p className="mt-3 text-center text-xs text-muted">
                {sizeLabel(design.settings)}
                {design.settings.size === 'original' ? ` · ${out.w}×${out.h}px` : ''}
              </p>
            </div>
          ) : (
            <div className="relative max-w-full">
              <img src={doc.original.url} alt="원본 사진" className={`max-h-[68vh] max-w-full rounded-lg ${doc.status === 'error' ? '' : 'opacity-50'}`} />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {!consent ? (
                  <div className="max-w-sm rounded-2xl bg-white/95 p-5 text-center shadow">
                    <p className="font-semibold text-forest-900">배경 제거 AI를 처음 한 번 내려받습니다 (약 170MB)</p>
                    <p className="mt-1 text-sm text-muted">이 기기 브라우저에 저장되어 다음부터는 바로 시작합니다. 휴대폰은 와이파이에서 해 주세요.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setConsent(true)
                        loadRemover(setProgress).catch(() => null)
                      }}
                      className={`${btnPrimary} mt-3`}
                    >
                      배경 제거 시작
                    </button>
                  </div>
                ) : doc.status === 'error' ? (
                  <div className="max-w-sm rounded-2xl bg-white/95 p-5 text-center shadow">
                    <p className="text-sm text-red-700">{doc.error}</p>
                    <button type="button" onClick={() => patchDoc({ status: 'waiting' })} className={`${btnPrimary} mt-3`}>
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white/95 px-5 py-4 text-center shadow" role="status">
                    <p className="font-semibold text-forest-900">배경 지우는 중…</p>
                    {progress && progress.total > 0 && progress.loaded < progress.total ? (
                      <>
                        <p className="mt-1 text-xs text-muted">
                          AI 내려받는 중 {Math.round(progress.loaded / 1048576)} / {Math.round(progress.total / 1048576)}MB
                        </p>
                        <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-cream-200">
                          <div className="h-full bg-forest-500" style={{ width: `${(progress.loaded / progress.total) * 100}%` }} />
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted">보통 몇 초~20초 걸립니다</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {animate && src && (
        <ProductAnimatorDialog
          preview={animate}
          renderImage={async (aspect: VideoAspect) => (await renderCanvas(opaque(aspect === '16:9' ? 'wide' : 'story'), false)).toDataURL('image/jpeg', 0.9).split(',')[1]}
          onClose={() => setAnimate(null)}
        />
      )}
      {reelOpen && <PhotoReelDialog count={1} busy={reelBusy} error={reelError} onClose={() => !reelBusy && setReelOpen(false)} onSubmit={makeReel} />}
      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-forest-900 px-5 py-2.5 text-sm text-cream-50 shadow-lg">
          {notice}
        </div>
      )}
    </div>
  )
}

function Slider({ label, value, min, max, unit, onChange, onDone }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void; onDone: () => void }) {
  const id = `slider-${label}`
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-forest-900">
        {label} <span className="font-normal text-muted">{value}{unit}</span>
      </label>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} onPointerUp={onDone} onKeyUp={onDone} onBlur={onDone} className="w-full accent-forest-700" />
    </div>
  )
}
