import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { composePhoto, fontSpec, type DrawnLayout, type PhotoSource, type PhotoSettings, type ProductTransform, type TextLayer } from '../../photo/compose'

export type Selection = 'product' | string | null

type Props = {
  src: PhotoSource
  settings: PhotoSettings
  transform: ProductTransform
  texts: TextLayer[]
  selected: Selection
  onSelect: (s: Selection) => void
  /** 끄는 중 (실행 취소 기록 없이 화면만 바꿈) */
  onPreview: (p: { transform?: ProductTransform; texts?: TextLayer[] }) => void
  /** 손을 뗐을 때 (실행 취소 기록) */
  onCommit: () => void
}

type Gesture =
  | { kind: 'move'; target: Selection; startX: number; startY: number; transform: ProductTransform; texts: TextLayer[] }
  | { kind: 'resize'; target: Selection; cx: number; cy: number; dist: number; transform: ProductTransform; texts: TextLayer[] }
  | { kind: 'rotate'; cx: number; cy: number; transform: ProductTransform }

/** 투명 배경을 알아보기 쉽게 깔아 주는 체크무늬 */
const CHECKER = {
  backgroundImage: 'linear-gradient(45deg,#e5e2da 25%,transparent 25%),linear-gradient(-45deg,#e5e2da 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e2da 75%),linear-gradient(-45deg,transparent 75%,#e5e2da 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
}

/**
 * 편집기 가운데 캔버스: 저장 파일과 같은 함수(composePhoto)로 그리고,
 * 상품·글자를 눌러 고른 뒤 끌어서 옮기기, 모서리로 크기 조절, 위쪽 동그라미로 회전(상품)을 한다. 마우스·터치 모두.
 */
export default function EditorStage({ src, settings, transform, texts, selected, onSelect, onPreview, onCommit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layout, setLayout] = useState<DrawnLayout | null>(null)
  const [scale, setScale] = useState(1)
  const [fontTick, setFontTick] = useState(0)
  const gesture = useRef<Gesture | null>(null)

  // 글자에 쓴 글꼴을 내려받은 뒤 다시 그린다(처음 쓰는 글꼴은 늦게 도착함)
  const fontKey = texts.map((t) => `${t.font}${t.bold}${t.text}`).join('|')
  useEffect(() => {
    if (!texts.length) return
    let alive = true
    Promise.all(texts.map((t) => document.fonts.load(fontSpec(t, 40), t.text || ' ').catch(() => null))).then(() => alive && setFontTick((n) => n + 1))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey])

  useLayoutEffect(() => {
    if (!canvasRef.current) return
    // 화면에는 긴 변 1600px로 줄여 그린다(저장할 때는 원래 크기). 좌표는 결과 크기 기준이라 그대로 맞는다
    setLayout(composePhoto(canvasRef.current, src, settings, { transform, texts }, { maxSide: 1600 }))
  }, [src, settings, transform, texts, fontTick])

  // 화면에 줄여 보이는 비율 (결과 픽셀 → 화면 픽셀)
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !layout) return
    const update = () => setScale(el.clientWidth / layout.w)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout])

  /** 화면 좌표 → 결과 픽셀 좌표 */
  function point(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  function hit(x: number, y: number): Selection {
    if (!layout) return null
    for (let i = layout.texts.length - 1; i >= 0; i--) {
      const t = layout.texts[i]
      if (Math.abs(x - t.cx) <= t.w / 2 && Math.abs(y - t.cy) <= t.h / 2) return t.id
    }
    // 상품을 숨긴 디자인(포스터·글자 포스터)에서는 보이지 않는 상품을 잡지 않는다
    if (settings.showProduct === false) return null
    const p = layout.product
    const a = (-p.rotate * Math.PI) / 180
    const dx = x - p.cx
    const dy = y - p.cy
    const rx = dx * Math.cos(a) - dy * Math.sin(a)
    const ry = dx * Math.sin(a) + dy * Math.cos(a)
    return Math.abs(rx) <= p.w / 2 && Math.abs(ry) <= p.h / 2 ? 'product' : null
  }

  function down(e: React.PointerEvent) {
    const { x, y } = point(e)
    const target = hit(x, y)
    onSelect(target)
    if (!target) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    gesture.current = { kind: 'move', target, startX: x, startY: y, transform, texts }
  }

  function startHandle(e: React.PointerEvent, kind: 'resize' | 'rotate') {
    e.stopPropagation()
    if (!layout || !selected) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const box = selected === 'product' ? layout.product : layout.texts.find((t) => t.id === selected)
    if (!box) return
    const { x, y } = point(e)
    if (kind === 'rotate') gesture.current = { kind: 'rotate', cx: box.cx, cy: box.cy, transform }
    else gesture.current = { kind: 'resize', target: selected, cx: box.cx, cy: box.cy, dist: Math.max(1, Math.hypot(x - box.cx, y - box.cy)), transform, texts }
  }

  function move(e: React.PointerEvent) {
    const g = gesture.current
    if (!g || !layout) return
    const { x, y } = point(e)
    if (g.kind === 'move') {
      const dx = (x - g.startX) / layout.w
      const dy = (y - g.startY) / layout.h
      if (g.target === 'product') onPreview({ transform: { ...g.transform, dx: g.transform.dx + dx, dy: g.transform.dy + dy } })
      else onPreview({ texts: g.texts.map((t) => (t.id === g.target ? { ...t, x: clamp(t.x + dx, 0, 1), y: clamp(t.y + dy, 0, 1) } : t)) })
    } else if (g.kind === 'resize') {
      const k = Math.hypot(x - g.cx, y - g.cy) / g.dist
      if (g.target === 'product') onPreview({ transform: { ...g.transform, scale: clamp(g.transform.scale * k, 0.1, 5) } })
      else onPreview({ texts: g.texts.map((t) => (t.id === g.target ? { ...t, size: Math.round(clamp(t.size * k, 16, 400)) } : t)) })
    } else {
      // 위쪽 동그라미가 가리키는 방향으로 회전, 15도 근처는 딱 맞춤
      let deg = (Math.atan2(y - g.cy, x - g.cx) * 180) / Math.PI + 90
      if (deg > 180) deg -= 360
      const snap = Math.round(deg / 15) * 15
      if (Math.abs(deg - snap) < 3) deg = snap
      onPreview({ transform: { ...g.transform, rotate: Math.round(deg) } })
    }
  }

  function up() {
    if (!gesture.current) return
    gesture.current = null
    onCommit()
  }

  const box = layout && selected ? (selected === 'product' ? { ...layout.product } : (() => {
    const t = layout.texts.find((x) => x.id === selected)
    return t ? { ...t, rotate: 0 } : null
  })()) : null

  return (
    <div className="relative mx-auto w-fit max-w-full select-none" style={settings.bg === 'transparent' ? CHECKER : undefined}>
      <canvas ref={canvasRef} aria-label="편집 중인 상품 사진" className="block max-h-[68vh] max-w-full shadow-sm" />
      <div
        className="absolute inset-0 cursor-default touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ cursor: gesture.current?.kind === 'move' ? 'grabbing' : undefined }}
      >
        {box && (
          <div
            className="pointer-events-none absolute border-2 border-forest-500"
            style={{ left: (box.cx - box.w / 2) * scale, top: (box.cy - box.h / 2) * scale, width: box.w * scale, height: box.h * scale, transform: `rotate(${box.rotate}deg)` }}
          >
            <span
              role="slider"
              aria-label="크기 조절"
              aria-valuenow={0}
              onPointerDown={(e) => startHandle(e, 'resize')}
              className="pointer-events-auto absolute -right-2.5 -bottom-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-forest-700 shadow"
            />
            {selected === 'product' && (
              <>
                <span className="absolute -top-7 left-1/2 h-5 w-0.5 -translate-x-1/2 bg-forest-500" />
                <span
                  role="slider"
                  aria-label="회전"
                  aria-valuenow={box.rotate}
                  onPointerDown={(e) => startHandle(e, 'rotate')}
                  className="pointer-events-auto absolute -top-10 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-forest-700 shadow"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
