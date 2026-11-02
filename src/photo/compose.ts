/**
 * 상품 사진 그리기: 배경을 지운 상품을 정한 크기·배경·그림자로 다시 그린다.
 * 미리보기와 저장 파일이 같은 함수를 쓰므로 화면에 보이는 그대로 저장된다.
 */
import type { Cutout } from './removeBg'

export type SizeId = 'square' | 'portrait' | 'story' | 'wide' | 'original'
export type BgKind = 'transparent' | 'color' | 'studio' | 'blur' | 'ai'
export type ShadowKind = 'none' | 'floor' | 'soft'

export const SIZES: { id: SizeId; label: string; hint: string; w: number; h: number }[] = [
  { id: 'square', label: '정사각형 1:1', hint: '스마트스토어·쿠팡 대표 이미지', w: 1080, h: 1080 },
  { id: 'portrait', label: '세로 4:5', hint: '인스타그램 게시물', w: 1080, h: 1350 },
  { id: 'story', label: '세로 9:16', hint: '릴스·스토리·쇼츠', w: 1080, h: 1920 },
  { id: 'wide', label: '가로 16:9', hint: '블로그·유튜브 썸네일', w: 1920, h: 1080 },
  { id: 'original', label: '원본 그대로', hint: '배경만 바꾸고 크기·위치 유지', w: 0, h: 0 },
]

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
}

export const DEFAULT_SETTINGS: PhotoSettings = { size: 'square', bg: 'color', color: '#ffffff', shadow: 'floor', padding: 0.1 }

export type PhotoSource = {
  original: HTMLImageElement
  cutout: Cutout
  /** AI 배경 이미지 (배경 종류가 'ai'일 때). 없으면 스튜디오 배경으로 그린다 */
  background?: HTMLImageElement | null
}

/** 결과 캔버스 크기 */
export function outputSize(src: PhotoSource, s: PhotoSettings) {
  if (s.size === 'original') return { w: src.original.naturalWidth, h: src.original.naturalHeight }
  const preset = SIZES.find((x) => x.id === s.size)!
  return { w: preset.w, h: preset.h }
}

/** 결과 1장을 캔버스에 그린다 */
export function composePhoto(canvas: HTMLCanvasElement, src: PhotoSource, s: PhotoSettings) {
  const { w, h } = outputSize(src, s)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'

  drawBackground(ctx, w, h, src, s)

  const product = src.cutout.canvas
  let pw: number
  let ph: number
  let px: number
  let py: number
  if (s.size === 'original') {
    // 원본 자리 그대로
    pw = product.width
    ph = product.height
    px = src.cutout.x
    py = src.cutout.y
  } else if (s.bg === 'ai' && src.background) {
    // AI 배경: 비워 둔 바닥·테이블 면에 올려놓듯 아래쪽 가운데에 세운다
    const pad = Math.round(Math.min(w, h) * s.padding)
    const boxW = w - pad * 2
    const boxH = h * 0.62 - pad
    const scale = Math.min(boxW / product.width, boxH / product.height)
    pw = product.width * scale
    ph = product.height * scale
    px = (w - pw) / 2
    py = h * 0.88 - ph
  } else {
    // 여백 안에 들어가게 줄이고 가운데 배치
    const pad = Math.round(Math.min(w, h) * s.padding)
    const boxW = w - pad * 2
    const boxH = h - pad * 2
    const scale = Math.min(boxW / product.width, boxH / product.height)
    pw = product.width * scale
    ph = product.height * scale
    px = (w - pw) / 2
    py = (h - ph) / 2
  }

  if (s.shadow === 'floor') drawFloorShadow(ctx, px, py, pw, ph)
  ctx.save()
  if (s.shadow === 'soft') {
    const unit = Math.max(pw, ph)
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = unit * 0.06
    ctx.shadowOffsetY = unit * 0.025
  }
  ctx.drawImage(product, px, py, pw, ph)
  ctx.restore()
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
