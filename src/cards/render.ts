import { FOOTER_FONT, type DesignId } from './designs'

/** 카드 원본 크기 (인스타그램 4:5) */
export const CARD_W = 1080
export const CARD_H = 1350

import type { Box, Align, TextStyle, ElementKey, ImageFrame, CardLayout, CardOverrides } from '../../shared/cards'
export type { Box, Align, TextStyle, ElementKey, ImageFrame, CardLayout, CardOverrides }

export type CardInput = {
  title: string
  body: string
  emphasis: string
  /** 0, 1, 2 */
  index: number
  total: number
  /** 하단 고정 표시 주소 (예: bulbaek.com). 비어 있으면 표시하지 않음 */
  siteUrl: string
  brandName: string
  image?: HTMLImageElement | null
  overrides?: CardOverrides
}

export type RenderReport = {
  /** 다 들어가지 않았거나 카드 밖으로 나간 항목 */
  overflow: string[]
  /** 하단 주소가 보이게 그려졌는지 (주소가 없으면 true) */
  footerOk: boolean
  /** 주소가 빠져 자동 복구(진한 띠)로 다시 그렸는지 */
  footerRepaired: boolean
  /** 실제로 쓴 배치 (편집기에서 선택 상자를 그릴 때 사용) */
  layout: CardLayout
  /** 강조 문구가 차지한 영역 */
  emphasisBox: Box | null
}

const font = (s: { family: string; weight: number }, size: number) => `${s.weight} ${size}px "${s.family}"`
const LABEL: Record<ElementKey, string> = { title: '제목', body: '본문', emphasis: '강조 문구' }

// ── 글자 배치 ─────────────────────────────────────────────

/** 상자 너비에 맞게 줄을 나눈다. 띄어쓰기 단위로 먼저 나누고, 한 단어가 너무 길면 글자 단위로 나눈다. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of para.split(/(\s+)/).filter((w) => w.length)) {
      const candidate = line + word
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim()) out.push(line.trimEnd())
      line = word.trimStart()
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    if (line.trim()) out.push(line.trimEnd())
  }
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}

type Fitted = { lines: string[]; size: number; height: number; fits: boolean }

/** 상자 높이에 들어갈 때까지 글씨 크기를 줄인다(최소 크기까지). */
export function fitText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, s: TextStyle): Fitted {
  let size = s.size
  for (;;) {
    ctx.font = font(s, size)
    const lines = wrapText(ctx, text, Math.max(10, w))
    const height = lines.length * size * s.lineHeight
    if (height <= h || size <= s.minSize) return { lines, size, height, fits: height <= h + 0.5 }
    size = Math.max(s.minSize, size - 2)
  }
}

/** 배치된 줄을 상자 위쪽부터 그린다. 상자를 넘는 줄은 그리지 않는다. */
function drawFitted(ctx: CanvasRenderingContext2D, t: Fitted, box: Box, s: TextStyle) {
  ctx.font = font(s, t.size)
  ctx.fillStyle = s.color
  ctx.textAlign = s.align
  ctx.textBaseline = 'middle'
  const lh = t.size * s.lineHeight
  const visible = Math.min(t.lines.length, Math.floor(box.h / lh + 0.001))
  const x = s.align === 'center' ? box.x + box.w / 2 : s.align === 'right' ? box.x + box.w : box.x
  for (let i = 0; i < visible; i++) ctx.fillText(t.lines[i], x, box.y + lh * i + lh / 2)
  return visible
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** 사진을 자리에 맞춰 그린다: 꽉 채운 뒤 zoom만큼 확대하고 ox·oy만큼 이동, 자리 밖은 잘라낸다. */
function drawImageFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement, f: ImageFrame, radius = 0) {
  const g = imageGeometry(img, f)
  ctx.save()
  if (radius) roundRect(ctx, f.x, f.y, f.w, f.h, radius)
  else {
    ctx.beginPath()
    ctx.rect(f.x, f.y, f.w, f.h)
  }
  ctx.clip()
  ctx.drawImage(img, g.x, g.y, g.w, g.h)
  ctx.restore()
}

/** 사진이 실제로 그려지는 위치·크기와, 이동할 수 있는 여유(px) */
export function imageGeometry(img: HTMLImageElement, f: ImageFrame) {
  const cover = Math.max(f.w / img.naturalWidth, f.h / img.naturalHeight) * Math.max(1, f.zoom)
  const w = img.naturalWidth * cover
  const h = img.naturalHeight * cover
  const slackX = (w - f.w) / 2
  const slackY = (h - f.h) / 2
  return { w, h, slackX, slackY, x: f.x - slackX + f.ox * slackX, y: f.y - slackY + f.oy * slackY }
}

// ── 강조 문구 ─────────────────────────────────────────────

type EmphasisLook = { pill: boolean; bg: string; rotate: number }

function measureEmphasis(ctx: CanvasRenderingContext2D, text: string, s: TextStyle, look: EmphasisLook, maxW = 900) {
  ctx.font = font(s, s.size)
  let label = text
  const pad = look.pill ? s.size * 1.4 : 0
  while (label.length > 1 && ctx.measureText(label).width > maxW - pad) label = label.slice(0, -1)
  if (label !== text) label = label.slice(0, -1) + '…'
  const w = ctx.measureText(label).width + pad
  const h = look.pill ? s.size * 1.9 : s.size * 1.3
  return { label, w, h, truncated: label !== text }
}

function drawEmphasis(ctx: CanvasRenderingContext2D, text: string, pos: { x: number; y: number }, s: TextStyle, look: EmphasisLook) {
  const m = measureEmphasis(ctx, text, s, look)
  ctx.save()
  ctx.translate(pos.x, pos.y)
  if (look.rotate) ctx.rotate(look.rotate)
  if (look.pill) {
    ctx.fillStyle = look.bg
    roundRect(ctx, 0, 0, m.w, m.h, m.h / 2)
    ctx.fill()
  }
  ctx.font = font(s, s.size)
  ctx.fillStyle = s.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(m.label, look.pill ? s.size * 0.7 : 0, m.h / 2)
  ctx.restore()
  return { x: pos.x, y: pos.y, w: m.w, h: m.h, truncated: m.truncated }
}

// ── 하단 주소 ─────────────────────────────────────────────

/** 하단 주소 표시 영역 (모든 디자인 공통 위치 — 디자인·배치를 바꿔도 같은 자리, 옮길 수 없음) */
export const FOOTER_BOX: Box = { x: 60, y: CARD_H - 120, w: CARD_W - 120, h: 80 }

function drawFooter(ctx: CanvasRenderingContext2D, siteUrl: string, color: string, band?: string) {
  if (band) {
    ctx.fillStyle = band
    ctx.fillRect(0, CARD_H - 130, CARD_W, 130)
  }
  ctx.font = font(FOOTER_FONT, 36)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(siteUrl, CARD_W / 2, FOOTER_BOX.y + FOOTER_BOX.h / 2, FOOTER_BOX.w)
}

/** 주소가 실제로 보이게 그려졌는지 픽셀로 검사: 주소 영역에 배경과 확실히 다른 색의 점이 충분히 있어야 통과 */
function footerVisible(ctx: CanvasRenderingContext2D, siteUrl: string) {
  ctx.font = font(FOOTER_FONT, 36)
  const textW = Math.min(ctx.measureText(siteUrl).width, FOOTER_BOX.w)
  if (textW < 20) return false
  const x = Math.round(CARD_W / 2 - textW / 2)
  const { data } = ctx.getImageData(x, FOOTER_BOX.y + 10, Math.round(textW), FOOTER_BOX.h - 20)
  const [br, bg, bb] = [data[0], data[1], data[2]]
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > 120) ink++
  }
  return ink > textW * 2
}

/** 오른쪽 위 쪽수 표시 (1 / 3) */
function drawPager(ctx: CanvasRenderingContext2D, c: CardInput, color: string, y: number) {
  ctx.font = font(FOOTER_FONT, 30)
  ctx.fillStyle = color
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${c.index + 1} / ${c.total}`, CARD_W - 80, y)
}

// ── 디자인 정의 ───────────────────────────────────────────
// 디자인 = 배경 + 글씨 기본 모양 + 자동 배치 계산 + 꾸밈(선, 패널 등)

const BOTTOM_LIMIT = CARD_H - 150 // 이 아래는 하단 주소 자리

type Styles = Record<ElementKey, TextStyle>

type DesignDef = {
  styles: Styles
  emphasis: EmphasisLook
  footerColor: string
  imageRadius: number
  background: (ctx: CanvasRenderingContext2D, c: CardInput) => void
  /** 글 양에 맞춰 요소 위치를 계산한다 */
  autoLayout: (ctx: CanvasRenderingContext2D, c: CardInput, s: Styles) => CardLayout
  /** 본문을 그리기 전 (예: 정보형 연한 상자) */
  beforeBody?: (ctx: CanvasRenderingContext2D, box: Box, body: Fitted, s: TextStyle, c: CardInput) => void
  /** 제목을 그린 뒤 (예: 프리미엄형 금색 선) */
  afterTitle?: (ctx: CanvasRenderingContext2D, box: Box) => void
}

const ts = (family: string, weight: number, size: number, minSize: number, color: string, lineHeight: number, align: Align = 'left'): TextStyle => ({
  family,
  weight,
  size,
  minSize,
  color,
  align,
  lineHeight,
})

/** 내용 묶음 높이를 보고 남는 공간이 있으면 시각적 가운데(약간 위)로 내릴 만큼의 값 */
const centerOffset = (top: number, contentH: number, bottom = BOTTOM_LIMIT) => Math.max(0, (bottom - top - contentH) * 0.42)

/** 위에서부터 [강조 문구] [사진] [제목] [본문]을 세로로 쌓는 기본 배치 */
function stackLayout(
  ctx: CanvasRenderingContext2D,
  c: CardInput,
  s: Styles,
  o: { x: number; w: number; top: number; emphGap: number; emphLook: EmphasisLook; emphCenter?: boolean; imgH: number; imgGap: number; imgX?: number; imgW?: number; titleMaxH: number; titleMaxHImg: number; gap: number; bottom?: number },
): CardLayout {
  const bottom = o.bottom ?? BOTTOM_LIMIT
  const emph = c.emphasis ? measureEmphasis(ctx, c.emphasis, s.emphasis, o.emphLook) : null
  const emphH = emph ? emph.h + o.emphGap : 0
  const imgH = c.image ? o.imgH + o.imgGap : 0
  const titleTop = o.top + emphH + imgH
  const titleMax = c.image ? o.titleMaxHImg : o.titleMaxH
  const title = fitText(ctx, c.title, o.w, titleMax, s.title)
  const titleH = Math.min(title.height, titleMax)
  const bodyMax = Math.max(0, bottom - titleTop - titleH - o.gap)
  const body = fitText(ctx, c.body, o.w, bodyMax, s.body)
  const bodyH = Math.min(body.height, bodyMax)
  let y = o.top + centerOffset(o.top, emphH + imgH + titleH + o.gap + bodyH, bottom)
  const emphasis = { x: emph && o.emphCenter ? CARD_W / 2 - emph.w / 2 : o.x, y }
  y += emphH
  const image = c.image ? { x: o.imgX ?? o.x, y, w: o.imgW ?? o.w, h: o.imgH, zoom: 1, ox: 0, oy: 0 } : null
  y += imgH
  const titleBox = { x: o.x, y, w: o.w, h: Math.max(titleH, s.title.size * s.title.lineHeight) }
  y += titleBox.h + o.gap
  return { emphasis, image, title: titleBox, body: { x: o.x, y, w: o.w, h: Math.max(bodyH, Math.min(bodyMax, s.body.size * s.body.lineHeight)) } }
}

const DESIGN_DEFS: Record<DesignId, DesignDef> = {
  simple: {
    styles: {
      title: ts('Noto Sans KR', 900, 116, 40, '#1B1F1C', 1.22),
      body: ts('Noto Sans KR', 400, 54, 24, '#4A4F4B', 1.6),
      emphasis: ts('Noto Sans KR', 400, 34, 20, '#FBF8F1', 1.2),
    },
    emphasis: { pill: true, bg: '#1F4D3A', rotate: 0 },
    footerColor: '#1F4D3A',
    imageRadius: 0,
    background(ctx, c) {
      ctx.fillStyle = '#FBF8F1'
      ctx.fillRect(0, 0, CARD_W, CARD_H)
      ctx.fillStyle = '#1F4D3A'
      ctx.fillRect(96, 96, 72, 10)
      drawPager(ctx, c, '#8A8F88', 100)
    },
    autoLayout: (ctx, c, s) =>
      stackLayout(ctx, c, s, { x: 96, w: 888, top: 190, emphGap: 40, emphLook: DESIGN_DEFS.simple.emphasis, imgH: 400, imgGap: 40, titleMaxH: 460, titleMaxHImg: 260, gap: 52 }),
  },
  photo: {
    styles: {
      title: ts('Jua', 400, 92, 40, '#2B2118', 1.2),
      body: ts('Pretendard Variable', 500, 44, 22, '#5C534B', 1.55),
      emphasis: ts('Jua', 400, 44, 22, '#2B2118', 1.2),
    },
    emphasis: { pill: true, bg: '#FFD43B', rotate: 0 },
    footerColor: '#B5651D',
    imageRadius: 0,
    background(ctx, c) {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, CARD_W, CARD_H)
      if (!c.image) {
        // 사진이 없으면 따뜻한 색 배경으로 완성
        const g = ctx.createLinearGradient(0, 0, CARD_W, 780)
        g.addColorStop(0, '#F3D9B1')
        g.addColorStop(1, '#D98E4A')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, CARD_W, 780)
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.beginPath()
        ctx.arc(860, 180, 260, 0, Math.PI * 2)
        ctx.arc(160, 700, 200, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#E9E2D6'
        ctx.fillRect(0, 0, CARD_W, 780)
      }
    },
    autoLayout(ctx, c, s) {
      const title = fitText(ctx, c.title, 920, 210, s.title)
      const titleH = Math.min(title.height, 210)
      const bodyTop = 800 + titleH + 28
      const body = fitText(ctx, c.body, 920, BOTTOM_LIMIT - bodyTop, s.body)
      return {
        image: c.image ? { x: 0, y: 0, w: CARD_W, h: 780, zoom: 1, ox: 0, oy: 0 } : null,
        emphasis: { x: 72, y: 640 },
        title: { x: 80, y: 800, w: 920, h: Math.max(titleH, s.title.size * s.title.lineHeight) },
        body: { x: 80, y: bodyTop, w: 920, h: Math.min(Math.max(body.height, s.body.size * s.body.lineHeight), BOTTOM_LIMIT - bodyTop) },
      }
    },
  },
  premium: {
    styles: {
      title: ts('ACM MaruBuri', 700, 100, 40, '#F3EAD7', 1.35, 'center'),
      body: ts('ACM MaruBuri', 400, 46, 22, '#D9CDB4', 1.75, 'center'),
      emphasis: ts('ACM MaruBuri', 400, 34, 20, '#C8A96A', 1.2),
    },
    emphasis: { pill: false, bg: '', rotate: 0 },
    footerColor: '#C8A96A',
    imageRadius: 0,
    background(ctx, c) {
      ctx.fillStyle = '#17332A'
      ctx.fillRect(0, 0, CARD_W, CARD_H)
      ctx.strokeStyle = '#C8A96A'
      ctx.lineWidth = 2
      ctx.strokeRect(48, 48, CARD_W - 96, CARD_H - 96)
      drawPager(ctx, c, '#C8A96A', 110)
    },
    autoLayout: (ctx, c, s) =>
      stackLayout(ctx, c, s, {
        x: 120, w: 840, top: 190, emphGap: 46, emphLook: DESIGN_DEFS.premium.emphasis, emphCenter: true,
        imgH: 380, imgGap: 40, imgX: 140, imgW: 800, titleMaxH: 440, titleMaxHImg: 240, gap: 92, bottom: BOTTOM_LIMIT - 20,
      }),
    afterTitle(ctx, box) {
      ctx.fillStyle = '#C8A96A'
      ctx.fillRect(box.x + box.w / 2 - 40, box.y + box.h + 36, 80, 3)
    },
  },
  mz: {
    styles: {
      title: ts('ACM Cafe24 SsurroundAir', 400, 128, 44, '#FFFFFF', 1.18),
      body: ts('Pretendard Variable', 600, 52, 22, '#FFF4EE', 1.55),
      emphasis: ts('ACM Cafe24 SsurroundAir', 400, 44, 22, '#1A1A1A', 1.2),
    },
    emphasis: { pill: true, bg: '#FFE14D', rotate: -0.07 },
    footerColor: '#FFFFFF',
    imageRadius: 36,
    background(ctx, c) {
      const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
      g.addColorStop(0, '#FF6B3D')
      g.addColorStop(1, '#FF3D7F')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, CARD_W, CARD_H)
      ctx.fillStyle = '#FFE14D'
      ctx.beginPath()
      ctx.arc(CARD_W - 60, 220, 150, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.beginPath()
      ctx.arc(80, CARD_H - 330, 220, 0, Math.PI * 2)
      ctx.fill()
      drawPager(ctx, c, '#1A1A1A', 90) // 노란 원 위라 진한 색
    },
    autoLayout: (ctx, c, s) =>
      stackLayout(ctx, c, s, { x: 90, w: 900, top: 190, emphGap: 56, emphLook: DESIGN_DEFS.mz.emphasis, imgH: 380, imgGap: 40, titleMaxH: 460, titleMaxHImg: 260, gap: 44 }),
  },
  info: {
    styles: {
      title: ts('Pretendard Variable', 800, 84, 36, '#111111', 1.25),
      body: ts('Pretendard Variable', 400, 46, 22, '#333333', 1.6),
      emphasis: ts('Pretendard Variable', 600, 36, 20, '#FFFFFF', 1.2),
    },
    emphasis: { pill: false, bg: '', rotate: 0 },
    footerColor: '#1F4D3A',
    imageRadius: 0,
    background(ctx, c) {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, CARD_W, CARD_H)
      ctx.fillStyle = '#1F4D3A'
      ctx.fillRect(0, 0, CARD_W, 170)
      ctx.font = font({ family: 'Pretendard Variable', weight: 800 }, 72)
      ctx.fillStyle = '#9FD3B5'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(c.index + 1).padStart(2, '0'), 80, 88)
      drawPager(ctx, c, '#CFE6D8', 88)
    },
    autoLayout(ctx, c, s) {
      let y = 230
      const image = c.image ? { x: 80, y, w: 920, h: 360, zoom: 1, ox: 0, oy: 0 } : null
      if (image) y += 400
      const titleMax = c.image ? 220 : 330
      const title = fitText(ctx, c.title, 920, titleMax, s.title)
      const titleBox = { x: 80, y, w: 920, h: Math.max(Math.min(title.height, titleMax), s.title.size * s.title.lineHeight) }
      y += titleBox.h + 40 + 44 // 제목 아래 여백 + 연한 상자 안쪽 여백
      const bodyMax = BOTTOM_LIMIT - 44 - y
      const body = fitText(ctx, c.body, 792, bodyMax, s.body)
      return {
        image,
        emphasis: { x: 200, y: 88 - s.emphasis.size * 0.65 },
        title: titleBox,
        body: { x: 164, y, w: 792, h: Math.min(Math.max(body.height, s.body.size * s.body.lineHeight), bodyMax) },
      }
    },
    beforeBody(ctx, box, fitted, s, c) {
      // 본문 뒤 연한 상자 + 문단마다 초록 점
      ctx.fillStyle = '#F2F6F3'
      roundRect(ctx, box.x - 84, box.y - 44, box.w + 128, box.h + 88, 28)
      ctx.fill()
      const lh = fitted.size * s.lineHeight
      const visible = Math.min(fitted.lines.length, Math.floor(box.h / lh + 0.001))
      ctx.font = font(s, fitted.size)
      let line = 0
      ctx.fillStyle = '#2E6B51'
      for (const para of c.body.split('\n')) {
        const n = para.trim() ? wrapText(ctx, para, box.w).length : 1
        if (para.trim() && line < visible) ctx.fillRect(box.x - 40, box.y + lh * line + lh / 2 - 7, 14, 14)
        line += n
      }
    },
  },
}

/** 디자인 기본 글씨 모양에 편집기에서 바꾼 값을 덮어쓴 최종 모양 */
export function effectiveStyles(design: DesignId, o?: CardOverrides): Styles {
  const base = DESIGN_DEFS[design].styles
  const st = o?.styles ?? {}
  return {
    title: { ...base.title, ...st.title },
    body: { ...base.body, ...st.body },
    emphasis: { ...base.emphasis, ...st.emphasis },
  }
}

export function defaultStyles(design: DesignId): Styles {
  return DESIGN_DEFS[design].styles
}

const outside = (b: Box) => b.x < -2 || b.y < -2 || b.x + b.w > CARD_W + 2 || b.y + b.h > CARD_H + 2

/**
 * 카드 1장을 1080×1350 캔버스에 그린다. 미리보기와 PNG 모두 이 함수 하나로 그린다.
 * 편집기에서 바꾼 배치(overrides.layout)가 있으면 그대로 쓰고, 없으면 디자인이 글 양에 맞춰 자동 배치한다.
 * 주소(siteUrl)는 하단 고정 위치에 그리고, 보이지 않으면 진한 띠를 깔고 다시 그려 자동 복구한다.
 */
export function renderCard(ctx: CanvasRenderingContext2D, design: DesignId, c: CardInput): RenderReport {
  const def = DESIGN_DEFS[design]
  const s = effectiveStyles(design, c.overrides)
  ctx.save()
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  const auto = def.autoLayout(ctx, c, s)
  const layout: CardLayout = c.overrides?.layout
    ? { ...c.overrides.layout, image: c.image ? (c.overrides.layout.image ?? auto.image) : null }
    : auto
  const overflow: string[] = []

  def.background(ctx, c)
  if (c.image && layout.image) drawImageFrame(ctx, c.image, layout.image, def.imageRadius)
  // 사진 강조형: 사진 아래 흰 영역은 사진 위에 덮는다(기본 배치일 때만)
  if (design === 'photo' && !c.overrides?.layout) {
    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, 0, 740, CARD_W, CARD_H - 740, 48)
    ctx.fill()
    ctx.fillRect(0, 800, CARD_W, CARD_H - 800)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    roundRect(ctx, CARD_W - 190, 60, 130, 60, 30)
    ctx.fill()
    drawPager(ctx, c, '#FFFFFF', 90)
  } else if (design === 'photo') {
    drawPager(ctx, c, '#2B2118', 90)
  }

  const title = fitText(ctx, c.title, layout.title.w, layout.title.h, s.title)
  if (!title.fits) overflow.push(LABEL.title)
  drawFitted(ctx, title, layout.title, s.title)
  def.afterTitle?.(ctx, layout.title)

  const body = fitText(ctx, c.body, layout.body.w, layout.body.h, s.body)
  if (c.body.trim()) {
    if (!body.fits) overflow.push(LABEL.body)
    def.beforeBody?.(ctx, layout.body, body, s.body, c)
    drawFitted(ctx, body, layout.body, s.body)
  }

  let emphasisBox: Box | null = null
  if (c.emphasis) {
    const e = drawEmphasis(ctx, c.emphasis, layout.emphasis, s.emphasis, def.emphasis)
    emphasisBox = { x: e.x, y: e.y, w: e.w, h: e.h }
    if (e.truncated) overflow.push(LABEL.emphasis)
  }

  // 카드 밖으로 나간 요소
  if (c.title.trim() && outside(layout.title)) overflow.push('제목 위치(카드 밖)')
  if (c.body.trim() && outside(layout.body)) overflow.push('본문 위치(카드 밖)')
  if (emphasisBox && outside(emphasisBox)) overflow.push('강조 문구 위치(카드 밖)')

  let footerOk = true
  let footerRepaired = false
  if (c.siteUrl) {
    drawFooter(ctx, c.siteUrl, def.footerColor)
    footerOk = footerVisible(ctx, c.siteUrl)
    if (!footerOk) {
      drawFooter(ctx, c.siteUrl, '#FFFFFF', '#1B1F1C')
      footerRepaired = true
      footerOk = footerVisible(ctx, c.siteUrl)
    }
  }
  ctx.restore()
  return { overflow: [...new Set(overflow)], footerOk, footerRepaired, layout, emphasisBox }
}
