/**
 * 상품 사진 그리기: 배경을 지운 상품을 정한 크기·배경·그림자로 다시 그린다.
 * 미리보기와 저장 파일이 같은 함수를 쓰므로 화면에 보이는 그대로 저장된다.
 */
import type { Cutout } from './removeBg'

export type SizeId = 'market' | 'square' | 'portrait' | 'story' | 'yt' | 'og' | 'wide' | 'original' | 'custom'
export type BgKind = 'transparent' | 'color' | 'studio' | 'blur' | 'ai'
export type ShadowKind = 'none' | 'floor' | 'soft'

export type SizeGroup = '쇼핑몰' | 'SNS' | '가로' | '기타'

/** 결과 크기 (권장 크기 기준, 플랫폼 정책은 바뀔 수 있음) */
export const SIZES: { id: SizeId; group: SizeGroup; label: string; hint: string; w: number; h: number }[] = [
  { id: 'market', group: '쇼핑몰', label: '대표 이미지 1:1', hint: '스마트스토어·쿠팡 1000×1000', w: 1000, h: 1000 },
  { id: 'square', group: 'SNS', label: '정사각 1:1', hint: '인스타 게시물 1080×1080', w: 1080, h: 1080 },
  { id: 'portrait', group: 'SNS', label: '세로 4:5', hint: '인스타 게시물 1080×1350', w: 1080, h: 1350 },
  { id: 'story', group: 'SNS', label: '세로 9:16', hint: '릴스·스토리·쇼츠 1080×1920', w: 1080, h: 1920 },
  { id: 'yt', group: '가로', label: '유튜브 썸네일', hint: '16:9 1280×720', w: 1280, h: 720 },
  { id: 'og', group: '가로', label: '블로그·페이스북 가로', hint: '1200×630', w: 1200, h: 630 },
  { id: 'wide', group: '가로', label: '가로 16:9 고화질', hint: '1920×1080', w: 1920, h: 1080 },
  { id: 'original', group: '기타', label: '원본 그대로', hint: '배경만 바꾸고 크기·위치 유지', w: 0, h: 0 },
  { id: 'custom', group: '기타', label: '직접 입력', hint: '가로×세로 px', w: 0, h: 0 },
]

/** 직접 입력 크기 범위 (px) */
export const CUSTOM_MIN = 100
export const CUSTOM_MAX = 4000

/** 크기 이름 (예: "대표 이미지 1:1 · 1000×1000") */
export function sizeLabel(s: Pick<PhotoSettings, 'size' | 'customW' | 'customH'>) {
  const p = SIZES.find((x) => x.id === s.size)
  if (!p) return ''
  if (s.size === 'custom') return `직접 입력 · ${s.customW}×${s.customH}`
  return p.w ? `${p.label} · ${p.w}×${p.h}` : p.label
}

export const BG_COLORS = [
  { value: '#ffffff', label: '흰색' },
  { value: '#f2f1ee', label: '연회색' },
  { value: '#f3ece0', label: '베이지' },
  { value: '#e4eef7', label: '하늘' },
  { value: '#f7e5e7', label: '분홍' },
  { value: '#e3f0e5', label: '연두' },
  { value: '#faf1d6', label: '노랑' },
  { value: '#1c1c1c', label: '검정' },
]

export type PhotoSettings = {
  size: SizeId
  bg: BgKind
  color: string
  shadow: ShadowKind
  /** 테두리 여백 (짧은 변 대비, 0~0.3) */
  padding: number
  /** 직접 입력 크기 (px) */
  customW: number
  customH: number
}

export const DEFAULT_SETTINGS: PhotoSettings = { size: 'market', bg: 'color', color: '#ffffff', shadow: 'floor', padding: 0.1, customW: 1200, customH: 1200 }

export type PhotoSource = {
  original: HTMLImageElement
  cutout: Cutout
  /** AI 배경 이미지 (배경 종류가 'ai'일 때). 없으면 스튜디오 배경으로 그린다 */
  background?: HTMLImageElement | null
}

/** 결과 캔버스 크기 */
export function outputSize(src: PhotoSource, s: PhotoSettings) {
  return targetSize(s, src.original.naturalWidth, src.original.naturalHeight)
}

/** 설정과 원본 크기로 결과 크기를 정한다 (알 수 없는 크기 이름은 대표 이미지 크기로) */
export function targetSize(s: Pick<PhotoSettings, 'size' | 'customW' | 'customH'>, originalW: number, originalH: number) {
  if (s.size === 'original') return { w: originalW, h: originalH }
  if (s.size === 'custom') {
    const fit = (v: number) => Math.round(Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, v || 1000)))
    return { w: fit(s.customW), h: fit(s.customH) }
  }
  const preset = SIZES.find((x) => x.id === s.size) ?? SIZES[0]
  return { w: preset.w, h: preset.h }
}

/** AI 배경을 만들 모양: 결과 비율에 가장 가까운 것 */
export function shapeFor(w: number, h: number): 'square' | 'portrait' | 'landscape' {
  const r = w / h
  return r > 1.15 ? 'landscape' : r < 0.87 ? 'portrait' : 'square'
}

/** 편집기에서 사용자가 옮긴 상품 위치 (자동 배치 기준). 없으면 자동 배치 그대로 */
export type ProductTransform = {
  /** 가로·세로 이동 (결과 크기 대비 비율) */
  dx: number
  dy: number
  /** 크기 배율 */
  scale: number
  /** 회전 (도) */
  rotate: number
}

export const NO_TRANSFORM: ProductTransform = { dx: 0, dy: 0, scale: 1, rotate: 0 }

export type TextFont = 'pretendard' | 'jua' | 'maruburi' | 'cafe24'

export const TEXT_FONTS: { value: TextFont; label: string; family: string }[] = [
  { value: 'pretendard', label: '고딕', family: 'Pretendard Variable' },
  { value: 'jua', label: '주아', family: 'Jua' },
  { value: 'maruburi', label: '명조', family: 'ACM MaruBuri' },
  { value: 'cafe24', label: '써라운드', family: 'ACM Cafe24 SsurroundAir' },
]

/** 사진 위에 얹는 글자 */
export type TextLayer = {
  id: string
  text: string
  /** 글자 가운데 위치 (결과 크기 대비 비율 0~1) */
  x: number
  y: number
  /** 글자 크기: 결과 가로 1080px 기준 */
  size: number
  color: string
  font: TextFont
  bold: boolean
  /** 글자 뒤 둥근 띠 색 (빈 값이면 띠 없음) */
  box: string
}

/** 그린 결과의 요소 위치 (편집기에서 누른 곳 찾기·선택 상자 표시용, 결과 픽셀 기준) */
export type DrawnLayout = {
  w: number
  h: number
  product: { cx: number; cy: number; w: number; h: number; rotate: number }
  texts: { id: string; cx: number; cy: number; w: number; h: number }[]
}

/** 결과 1장을 캔버스에 그린다. 편집기에서는 상품 위치·글자도 함께 받는다 */
export function composePhoto(canvas: HTMLCanvasElement, src: PhotoSource, s: PhotoSettings, edit?: { transform?: ProductTransform; texts?: TextLayer[] }): DrawnLayout {
  const { w, h } = outputSize(src, s)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'

  drawBackground(ctx, w, h, src, s)

  const product = src.cutout.canvas
  const box = autoBox(src, s, w, h)
  const t = edit?.transform ?? NO_TRANSFORM
  const pw = box.w * t.scale
  const ph = box.h * t.scale
  const cx = box.x + box.w / 2 + t.dx * w
  const cy = box.y + box.h / 2 + t.dy * h

  if (s.shadow === 'floor') drawFloorShadow(ctx, cx - pw / 2, cy - ph / 2, pw, ph)
  ctx.save()
  if (s.shadow === 'soft') {
    const unit = Math.max(pw, ph)
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = unit * 0.06
    ctx.shadowOffsetY = unit * 0.025
  }
  ctx.translate(cx, cy)
  ctx.rotate((t.rotate * Math.PI) / 180)
  ctx.drawImage(product, -pw / 2, -ph / 2, pw, ph)
  ctx.restore()

  const texts = (edit?.texts ?? []).map((layer) => drawText(ctx, layer, w, h))
  return { w, h, product: { cx, cy, w: pw, h: ph, rotate: t.rotate }, texts }
}

/** 자동 배치 자리: 원본 그대로 / AI 배경(바닥에 세움) / 여백 안 가운데 */
function autoBox(src: PhotoSource, s: PhotoSettings, w: number, h: number) {
  const product = src.cutout.canvas
  if (s.size === 'original') return { x: src.cutout.x, y: src.cutout.y, w: product.width, h: product.height }
  const pad = Math.round(Math.min(w, h) * s.padding)
  const boxW = w - pad * 2
  if (s.bg === 'ai' && src.background) {
    // AI 배경: 비워 둔 바닥·테이블 면에 올려놓듯 아래쪽 가운데에 세운다
    const scale = Math.min(boxW / product.width, (h * 0.62 - pad) / product.height)
    const pw = product.width * scale
    const ph = product.height * scale
    return { x: (w - pw) / 2, y: h * 0.88 - ph, w: pw, h: ph }
  }
  // 여백 안에 들어가게 줄이고 가운데 배치
  const scale = Math.min(boxW / product.width, (h - pad * 2) / product.height)
  const pw = product.width * scale
  const ph = product.height * scale
  return { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph }
}

export const fontFamily = (f: TextFont) => TEXT_FONTS.find((x) => x.value === f)?.family ?? 'Pretendard Variable'
export const fontSpec = (layer: Pick<TextLayer, 'font' | 'bold'>, px: number) => `${layer.bold ? 700 : 400} ${px}px "${fontFamily(layer.font)}"`

/** 글자 1개(여러 줄 가능)를 그리고 차지한 자리를 돌려준다 */
function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer, w: number, h: number) {
  const px = layer.size * (w / 1080)
  const lines = (layer.text || ' ').split('\n')
  const lineH = px * 1.25
  ctx.save()
  ctx.font = fontSpec(layer, px)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width), px * 0.5)
  const textH = lineH * lines.length
  const cx = layer.x * w
  const cy = layer.y * h
  const padX = layer.box ? px * 0.55 : px * 0.1
  const padY = layer.box ? px * 0.3 : px * 0.05
  const bw = textW + padX * 2
  const bh = textH + padY * 2
  if (layer.box) {
    ctx.fillStyle = layer.box
    ctx.beginPath()
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, Math.min(bh / 2, px * 0.6))
    ctx.fill()
  }
  ctx.fillStyle = layer.color
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - textH / 2 + lineH * (i + 0.5)))
  ctx.restore()
  return { id: layer.id, cx, cy, w: bw, h: bh }
}

/** 이미지를 빈틈없이 채우도록(cover) 가운데 맞춰 그린다 */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, src: PhotoSource, s: PhotoSettings) {
  const original = src.original
  if (s.bg === 'transparent') return
  if (s.bg === 'ai' && src.background) {
    drawCover(ctx, src.background, w, h)
    return
  }
  if (s.bg === 'color') {
    ctx.fillStyle = s.color
    ctx.fillRect(0, 0, w, h)
    return
  }
  // AI 배경을 아직 만들지 않았으면 스튜디오 배경으로 보여 준다
  if (s.bg === 'studio' || s.bg === 'ai') {
    // 가운데가 밝고 가장자리로 갈수록 살짝 어두운 촬영 스튜디오 느낌
    ctx.fillStyle = s.color
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.hypot(w, h) * 0.62)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.55, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.16)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    return
  }
  // 원본 배경 흐리게: 작게 줄였다 키우는 방식(모든 브라우저에서 같은 결과, ctx.filter는 사파리에서 안 될 수 있음)
  const cover = Math.max(w / original.naturalWidth, h / original.naturalHeight)
  const dw = original.naturalWidth * cover
  const dh = original.naturalHeight * cover
  const small = document.createElement('canvas')
  small.width = Math.max(8, Math.round(w / 28))
  small.height = Math.max(8, Math.round(h / 28))
  const sctx = small.getContext('2d')!
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(original, ((w - dw) / 2) * (small.width / w), ((h - dh) / 2) * (small.height / h), dw * (small.width / w), dh * (small.height / h))
  ctx.drawImage(small, 0, 0, w, h)
  // 상품이 돋보이게 살짝 밝게
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, 0, w, h)
}

/** 상품 아래 바닥에 깔리는 둥근 그림자 */
function drawFloorShadow(ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number) {
  const cx = px + pw / 2
  const cy = py + ph - ph * 0.01
  const rx = pw * 0.46
  const ry = Math.max(6, Math.min(pw * 0.07, ph * 0.08))
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, 'rgba(0,0,0,0.32)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.12)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
