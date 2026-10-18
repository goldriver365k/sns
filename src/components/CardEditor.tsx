import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardText } from '../../shared/generate'
import { DESIGNS, FONT_OPTIONS, getDesign, type DesignId } from '../cards/designs'
import { CARD_H, CARD_W, effectiveStyles, FOOTER_BOX, imageGeometry, type Box, type CardLayout, type ElementKey, type TextStyle } from '../cards/render'
import { cardImage, toCardInput } from '../cards/input'
import { renderCardFile } from '../cards/output'
import { downloadPng, downloadZip } from '../cards/export'
import { MAX_IMAGES, prepareImage, type PickedImage } from '../lib/images'
import { todayKst } from '../lib/contents'
import CardCanvas, { type CardCheck } from './CardCanvas'
import { btnGhost, btnPrimary } from './ui'

type Props = {
  cards: CardText[]
  startIndex: number
  images: PickedImage[]
  onImagesChange: (images: PickedImage[]) => void
  defaultDesign: string
  brandName: string
  siteUrl: string
  fileKey: string
  onChange: (cards: CardText[]) => void
  onClose: () => void
  onMessage: (msg: string) => void
}

type Target = ElementKey | 'image'
type Drag = {
  target: Target
  kind: 'move' | 'resize' | 'crop'
  startX: number
  startY: number
  layout: CardLayout
  slackX: number
  slackY: number
}

const NAMES: Record<Target, string> = { title: '제목', body: '본문', emphasis: '강조 문구', image: '사진' }
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'
const section = 'space-y-2 rounded-xl border border-cream-300 bg-cream-50 p-3'
const heading = 'text-sm font-semibold text-forest-900'

/**
 * 카드 편집기: 사진을 넣고(파일·끌어다 놓기·붙여넣기·보관함), 글씨와 사진을 직접 옮기고 크기를 바꾸고,
 * 폰트·크기·굵기·색상·정렬·줄 간격을 바꾼다. 미리보기와 PNG는 같은 그리기 함수를 쓴다.
 */
export default function CardEditor(props: Props) {
  const { cards, images, defaultDesign, brandName, siteUrl, fileKey, onChange, onMessage } = props
  const [index, setIndex] = useState(props.startIndex)
  const [selected, setSelected] = useState<Target | null>('title')
  const [imageMode, setImageMode] = useState<'move' | 'crop'>('move')
  const [check, setCheck] = useState<CardCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [drop, setDrop] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scale, setScale] = useState(0.4)
  const drag = useRef<Drag | null>(null)
  const latest = useRef({ cards, images, index })
  latest.current = { cards, images, index }

  const card = cards[index]
  const design = getDesign(card.design ?? defaultDesign).id
  const styles = effectiveStyles(design, card.overrides)
  const img = cardImage(card, index, images)
  const input = toCardInput(cards, index, { siteUrl, brandName, images })
  const layout = check?.layout ?? null

  // 미리보기 폭 → 화면 배율
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CARD_W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── 카드 고치기 ──
  function patchCard(patch: Partial<CardText>, i = latest.current.index) {
    const list = latest.current.cards
    onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

  function setLayout(next: CardLayout) {
    const c = latest.current.cards[latest.current.index]
    patchCard({ overrides: { ...c.overrides, layout: next } })
  }

  function setStyle(el: ElementKey, patch: Partial<TextStyle>) {
    const c = latest.current.cards[latest.current.index]
    const st = c.overrides?.styles ?? {}
    patchCard({ overrides: { ...c.overrides, styles: { ...st, [el]: { ...st[el], ...patch } } } })
  }

  function chooseDesign(id: DesignId) {
    // 디자인을 바꾸면 글·사진은 그대로 두고 위치·글씨 모양만 새 디자인 기본값으로
    patchCard({ design: id, overrides: undefined })
  }

  function reset() {
    patchCard({ overrides: undefined })
    onMessage('이 카드의 배치와 글씨 모양을 디자인 기본값으로 되돌렸습니다.')
  }

  // ── 사진 ──
  /** 사진을 넣거나 바꾸거나 빼면 배치는 새로 자동 계산한다(글씨 모양은 유지) — 사진이 글을 덮지 않게 */
  function setCardImage(imageId: string | null) {
    const c = latest.current.cards[latest.current.index]
    patchCard({ imageId, overrides: c.overrides?.styles ? { styles: c.overrides.styles } : undefined })
  }

  async function addImages(blobs: Blob[]) {
    const room = MAX_IMAGES - latest.current.images.length
    if (room <= 0) return onMessage(`이미지는 ${MAX_IMAGES}장까지 넣을 수 있습니다. 보관함에서 하나를 빼 주세요.`)
    try {
      const picked = await prepareImage(blobs[0], 'file')
      props.onImagesChange([...latest.current.images, picked])
      setCardImage(picked.id)
      setSelected('image')
    } catch (e) {
      onMessage(e instanceof Error ? e.message : '이미지를 넣지 못했습니다.')
    }
  }

  // 편집기가 열려 있는 동안 붙여넣은 이미지는 지금 카드에 넣는다 (입력 폼의 붙여넣기보다 먼저 받음)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      e.stopPropagation()
      addImages(files)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  // ── 끌어서 옮기기·크기 조절 ──
  function startDrag(e: ReactPointerEvent, target: Target, kind: Drag['kind']) {
    if (!layout) return
    e.preventDefault()
    e.stopPropagation()
    setSelected(target)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const base: CardLayout = structuredClone(card.overrides?.layout ? { ...card.overrides.layout, image: layout.image } : layout)
    const g = img && base.image ? imageGeometry(img.el, base.image) : null
    drag.current = { target, kind, startX: e.clientX, startY: e.clientY, layout: base, slackX: g?.slackX ?? 0, slackY: g?.slackY ?? 0 }
  }

  function onDragMove(e: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale
    const next: CardLayout = structuredClone(d.layout)
    if (d.target === 'emphasis') {
      next.emphasis = { x: Math.round(d.layout.emphasis.x + dx), y: Math.round(d.layout.emphasis.y + dy) }
    } else if (d.target === 'image' && next.image && d.layout.image) {
      const f = d.layout.image
      if (d.kind === 'crop') {
        next.image.ox = d.slackX > 0 ? clamp(f.ox + dx / d.slackX, -1, 1) : 0
        next.image.oy = d.slackY > 0 ? clamp(f.oy + dy / d.slackY, -1, 1) : 0
      } else if (d.kind === 'resize') {
        next.image.w = Math.round(Math.max(120, f.w + dx))
        next.image.h = Math.round(Math.max(120, f.h + dy))
      } else {
        next.image.x = Math.round(f.x + dx)
        next.image.y = Math.round(f.y + dy)
      }
    } else if (d.target === 'title' || d.target === 'body') {
      const b = d.layout[d.target]
      next[d.target] =
        d.kind === 'resize'
          ? { ...b, w: Math.round(Math.max(120, b.w + dx)), h: Math.round(Math.max(40, b.h + dy)) }
          : { ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) }
    }
    setLayout(next)
  }

  function endDrag() {
    drag.current = null
  }

  function setZoom(zoom: number) {
    if (!layout?.image) return
    const base: CardLayout = structuredClone(card.overrides?.layout ? { ...card.overrides.layout, image: layout.image } : layout)
    base.image = { ...base.image!, zoom }
    setLayout(base)
  }

  // ── 저장 ──
  const fileName = (i: number) => `${fileKey}_${todayKst().replace(/-/g, '')}_${i + 1}.png`

  async function exportCards(indexes: number[]) {
    setBusy(true)
    try {
      const files: { name: string; blob: Blob }[] = []
      let repaired = false
      for (const i of indexes) {
        const c = latest.current.cards[i]
        const r = await renderCardFile(getDesign(c.design ?? defaultDesign).id, toCardInput(latest.current.cards, i, { siteUrl, brandName, images: latest.current.images }))
        if (r.problems.length) {
          onMessage(r.problems[0])
          return
        }
        repaired ||= r.repaired
        files.push({ name: fileName(i), blob: r.blob })
      }
      if (repaired) onMessage('주소가 잘 보이지 않아 자동으로 복구했습니다.')
      if (files.length === 1) downloadPng(files[0].blob, files[0].name)
      else await downloadZip(files, `${fileKey}_${todayKst().replace(/-/g, '')}.zip`)
    } catch {
      onMessage('이미지를 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  // ── 선택 상자 ──
  const boxes: { key: Target; box: Box; resizable: boolean }[] = []
  if (layout) {
    if (img && layout.image) boxes.push({ key: 'image', box: layout.image, resizable: true })
    if (card.title.trim()) boxes.push({ key: 'title', box: layout.title, resizable: true })
    if (card.body.trim()) boxes.push({ key: 'body', box: layout.body, resizable: true })
    if (card.emphasis && check?.emphasisBox) boxes.push({ key: 'emphasis', box: check.emphasisBox, resizable: false })
  }
  const textEl = selected && selected !== 'image' ? selected : null
  const st = textEl ? styles[textEl] : null
  const weights = st ? (FONT_OPTIONS.find((f) => f.family === st.family)?.weights ?? [st.weight]) : []
  const problems = [
    ...(check && !check.fontOk ? ['폰트 준비 안 됨(한글 깨짐 위험)'] : []),
    ...(check?.overflow ?? []).map((o) => (o.includes('카드 밖') ? o : `${o} 잘림`)),
    ...(check && !check.footerOk ? ['주소 표시 안 됨'] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream-100" role="dialog" aria-modal="true" aria-label="카드 편집기">
      {/* 위: 카드 전환 */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-300 bg-cream-50 px-4 py-3">
        <h2 className="text-lg font-bold text-forest-900">카드 편집기</h2>
        <div className="flex gap-1 rounded-xl bg-cream-200 p-1" role="tablist">
          {cards.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={index === i}
              onClick={() => {
                setIndex(i)
                setCheck(null)
              }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${index === i ? 'bg-white text-forest-900 shadow-sm' : 'text-muted'}`}
            >
              카드 {i + 1}
            </button>
          ))}
        </div>
        <button onClick={props.onClose} className={btnPrimary}>완료</button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        {/* 왼쪽: 설정 */}
        <aside className="order-2 w-full shrink-0 space-y-3 p-4 lg:order-1 lg:w-[360px] lg:overflow-y-auto">
          <div className={section}>
            <div className={heading}>디자인</div>
            <div className="grid grid-cols-5 gap-1">
              {DESIGNS.map((d) => (
                <button key={d.id} onClick={() => chooseDesign(d.id)} aria-pressed={design === d.id} title={d.description} className={`rounded-lg border px-1 py-1.5 text-[11px] leading-tight ${design === d.id ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}>
                  {d.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">디자인을 바꾸면 글과 사진은 그대로, 위치·글씨 모양은 새 디자인 기본값이 됩니다.</p>
          </div>

          <div className={section}>
            <div className={heading}>글</div>
            <textarea aria-label="제목" rows={2} value={card.title} onFocus={() => setSelected('title')} onChange={(e) => patchCard({ title: e.target.value })} className={`${field} font-semibold`} placeholder="제목" />
            <textarea aria-label="본문" rows={4} value={card.body} onFocus={() => setSelected('body')} onChange={(e) => patchCard({ body: e.target.value })} className={field} placeholder="본문" />
            <input aria-label="강조 문구" value={card.emphasis} onFocus={() => setSelected('emphasis')} onChange={(e) => patchCard({ emphasis: e.target.value })} className={field} placeholder="강조 문구 (선택)" />
          </div>

          {st && textEl && (
            <div className={section}>
              <div className={heading}>{NAMES[textEl]} 글씨</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-muted">
                  폰트
                  <select value={st.family} onChange={(e) => {
                    const f = FONT_OPTIONS.find((o) => o.family === e.target.value)!
                    setStyle(textEl, { family: f.family, weight: f.weights.includes(st.weight) ? st.weight : f.weights[f.weights.length - 1] })
                  }} className={field}>
                    {FONT_OPTIONS.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted">
                  굵기
                  <select value={st.weight} onChange={(e) => setStyle(textEl, { weight: Number(e.target.value) })} className={field}>
                    {weights.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted">
                  색상
                  <input type="color" value={st.color} onChange={(e) => setStyle(textEl, { color: e.target.value })} className="h-[38px] w-full cursor-pointer rounded-lg border border-cream-300 bg-white" />
                </label>
                <label className="col-span-2 text-xs text-muted">
                  크기 {st.size}px <span className="text-[11px]">(넘치면 {st.minSize}px까지 자동 축소)</span>
                  <input type="range" min={Math.max(16, st.minSize)} max={200} value={st.size} onChange={(e) => setStyle(textEl, { size: Number(e.target.value) })} className="w-full accent-forest-700" />
                </label>
                {textEl !== 'emphasis' && (
                  <>
                    <div className="col-span-2 text-xs text-muted">
                      정렬
                      <div className="mt-1 flex gap-1">
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button key={a} onClick={() => setStyle(textEl, { align: a })} aria-pressed={st.align === a} className={`flex-1 rounded-lg border py-1.5 text-xs ${st.align === a ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white text-ink'}`}>
                            {a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="col-span-2 text-xs text-muted">
                      줄 간격 {st.lineHeight.toFixed(2)}
                      <input type="range" min={1} max={2.2} step={0.05} value={st.lineHeight} onChange={(e) => setStyle(textEl, { lineHeight: Number(e.target.value) })} className="w-full accent-forest-700" />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={section}>
            <div className={heading}>사진</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-sm text-forest-700 hover:border-forest-500">파일 찾기</button>
              <button onClick={() => setCardImage(null)} disabled={!img} className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-sm text-ink disabled:opacity-40">사진 빼기</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
                if (e.target.files?.[0]) addImages([e.target.files[0]])
                e.target.value = ''
              }} />
            </div>
            <p className="text-xs text-muted">미리보기에 끌어다 놓거나 Ctrl+V로 붙여넣어도 이 카드에 들어갑니다.</p>
            {images.length > 0 && (
              <>
                <div className="pt-1 text-xs font-medium text-muted">보관함 (이번 작업에서 넣은 사진)</div>
                <div className="grid grid-cols-5 gap-1">
                  {images.map((im) => (
                    <button key={im.id} onClick={() => setCardImage(im.id)} aria-pressed={img?.id === im.id} className={`overflow-hidden rounded-md border-2 ${img?.id === im.id ? 'border-forest-700' : 'border-transparent'}`}>
                      <img src={im.url} alt="보관함 사진" className="aspect-square w-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {img && layout?.image && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-1">
                  {(['move', 'crop'] as const).map((m) => (
                    <button key={m} onClick={() => {
                      setImageMode(m)
                      setSelected('image')
                    }} aria-pressed={imageMode === m} className={`flex-1 rounded-lg border py-1.5 text-xs ${imageMode === m ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}>
                      {m === 'move' ? '사진 자리 옮기기' : '사진 자르기(안에서 이동)'}
                    </button>
                  ))}
                </div>
                <label className="block text-xs text-muted">
                  확대 {layout.image.zoom.toFixed(2)}배
                  <input type="range" min={1} max={3} step={0.05} value={layout.image.zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-forest-700" />
                </label>
              </div>
            )}
          </div>

          <button onClick={reset} className="w-full rounded-xl border border-cream-300 bg-white py-2 text-sm text-ink hover:border-forest-500">이 카드 배치 초기화</button>
        </aside>

        {/* 가운데: 미리보기 + 직접 조작 */}
        <main className="order-1 flex min-w-0 flex-1 flex-col items-center gap-3 p-4 lg:order-2 lg:overflow-y-auto">
          <div
            ref={stageRef}
            className={`relative w-full max-w-[520px] touch-none select-none ${drop ? 'ring-4 ring-forest-500' : ''}`}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerDown={() => setSelected(null)}
            onDragOver={(e) => {
              e.preventDefault()
              setDrop(true)
            }}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrop(false)
              const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
              if (files.length) addImages(files)
            }}
          >
            <CardCanvas design={design} card={input} onCheck={setCheck} />
            {/* 하단 주소 자리 (옮길 수 없음) */}
            {siteUrl && (
              <div className="pointer-events-none absolute border border-dashed border-forest-500/40" style={{ left: FOOTER_BOX.x * scale, top: FOOTER_BOX.y * scale, width: FOOTER_BOX.w * scale, height: FOOTER_BOX.h * scale }} />
            )}
            {boxes.map(({ key, box, resizable }) => {
              const on = selected === key
              return (
                <div
                  key={key}
                  role="button"
                  aria-label={`${NAMES[key]} 선택`}
                  onPointerDown={(e) => startDrag(e, key, key === 'image' && imageMode === 'crop' ? 'crop' : 'move')}
                  className={`absolute cursor-move ${on ? 'outline-2 outline-forest-500' : 'outline-1 outline-dashed outline-transparent hover:outline-forest-500/60'} ${key === 'image' ? 'z-0' : 'z-10'}`}
                  style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
                >
                  {on && (
                    <span className="absolute -top-6 left-0 rounded bg-forest-700 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-cream-50">
                      {NAMES[key]}
                      {key === 'image' && (imageMode === 'crop' ? ' · 끌어서 자르기' : ' · 끌어서 옮기기')}
                    </span>
                  )}
                  {on && resizable && (
                    <span
                      aria-label={`${NAMES[key]} 크기 조절`}
                      onPointerDown={(e) => startDrag(e, key, 'resize')}
                      className="absolute -right-2 -bottom-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-forest-700 shadow"
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="w-full max-w-[520px] text-xs">
            {problems.length ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">확인 필요: {problems.join(', ')}</p>
            ) : (
              <p className="text-muted">글씨·사진을 눌러 고른 뒤 끌어서 옮기고, 오른쪽 아래 동그라미로 크기를 바꿉니다. 점선은 주소 자리입니다.</p>
            )}
          </div>

          <div className="flex w-full max-w-[520px] flex-wrap justify-center gap-2 pb-4">
            <button disabled={busy} onClick={() => exportCards([index])} className={btnGhost}>이 카드 PNG 저장</button>
            <button disabled={busy} onClick={() => exportCards(cards.map((_, i) => i))} className={btnGhost}>전체 ZIP 다운로드</button>
          </div>
        </main>
      </div>
      <div className="sr-only">{`카드 크기 ${CARD_W}×${CARD_H}`}</div>
    </div>
  )
}
