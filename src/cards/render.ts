import { FOOTER_FONT, getDesign, type DesignId, type FontSpec } from './designs'

/** 카드 원본 크기 (인스타그램 4:5) */
export const CARD_W = 1080
export const CARD_H = 1350

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
}

export type RenderReport = {
  /** 최소 글씨 크기로도 다 들어가지 않은 항목 */
  overflow: string[]
  /** 하단 주소가 보이게 그려졌는지 (주소가 없으면 true) */
  footerOk: boolean
  /** 주소가 빠져 자동 복구(진한 띠)로 다시 그렸는지 */
  footerRepaired: boolean
}

type Box = { x: number; y: number; w: number; h: number }
type Align = 'left' | 'center'

const font = (f: FontSpec, size: number) => `${f.weight} ${size}px "${f.family}"`

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
      // 단어 하나가 줄보다 길면 글자 단위로 자른다
      while (ctx.measureText(line).width > maxWidth) {
        let cut = line.length - 1
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    if (line.trim()) out.push(line.trimEnd())
  }
  // 끝의 빈 줄 제거
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}

type Fitted = { lines: string[]; size: number; lineHeight: number; height: number; fits: boolean }

/** 상자 안에 들어갈 때까지 글씨 크기를 줄인다(최소 크기까지). */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Box,
  f: FontSpec,
  maxSize: number,
  minSize: number,
  lineHeight: number,
): Fitted {
  let size = maxSize
  for (;;) {
    ctx.font = font(f, size)
    const lines = wrapText(ctx, text, box.w)
    const height = lines.length * size * lineHeight
    if (height <= box.h || size <= minSize) {
      return { lines, size, lineHeight, height, fits: height <= box.h }
    }
    size = Math.max(minSize, size - 2)
  }
}

/** 배치된 줄을 그린다. 상자를 넘는 줄은 그리지 않는다. 그린 높이를 돌려준다. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  t: Fitted,
  box: Box,
  f: FontSpec,
  color: string,
  align: Align = 'left',
  valign: 'top' | 'middle' = 'top',
) {
  ctx.font = font(f, t.size)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const lh = t.size * t.lineHeight
  const visible = Math.min(t.lines.length, Math.floor(box.h / lh + 0.001))
  const used = visible * lh
  const top = valign === 'middle' ? box.y + (box.h - used) / 2 : box.y
  const x = align === 'center' ? box.x + box.w / 2 : box.x
  for (let i = 0; i < visible; i++) ctx.fillText(t.lines[i], x, top + lh * i + lh / 2)
  return used
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** 사진을 상자에 꽉 채워(넘치는 부분은 잘라) 그린다. */
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Box) {
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.w, box.h)
  ctx.clip()
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h)
  ctx.restore()
}

/** 오른쪽 위 쪽수 표시 (1 / 3) */
function drawPager(ctx: CanvasRenderingContext2D, c: CardInput, color: string, y = 90) {
  ctx.font = font(FOOTER_FONT, 30)
  ctx.fillStyle = color
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${c.index + 1} / ${c.total}`, CARD_W - 80, y)
}

/** 강조 문구 알약 모양. 그린 너비·높이를 돌려준다. */
function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, f: FontSpec, size: number, bg: string, fg: string, maxW: number) {
  ctx.font = font(f, size)
  let label = text
  while (label.length > 1 && ctx.measureText(label).width > maxW - size * 1.4) label = label.slice(0, -1)
  if (label !== text) label = label.slice(0, -1) + '…'
  const w = ctx.measureText(label).width + size * 1.4
  const h = size * 1.9
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + size * 0.7, y + h / 2)
  return { w, h }
}

// ── 하단 주소 ─────────────────────────────────────────────

/** 하단 주소 표시 영역 (모든 디자인 공통 위치 — 디자인을 바꿔도 같은 자리) */
const FOOTER_BOX: Box = { x: 60, y: CARD_H - 120, w: CARD_W - 120, h: 80 }

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

/**
 * 주소가 실제로 보이게 그려졌는지 픽셀로 검사한다.
 * 주소 영역에서 배경과 확실히 다른 색의 점이 충분히 있어야 통과.
 */
function footerVisible(ctx: CanvasRenderingContext2D, siteUrl: string) {
  ctx.font = font(FOOTER_FONT, 36)
  const textW = Math.min(ctx.measureText(siteUrl).width, FOOTER_BOX.w)
  if (textW < 20) return false
  const x = Math.round(CARD_W / 2 - textW / 2)
  const { data } = ctx.getImageData(x, FOOTER_BOX.y + 10, Math.round(textW), FOOTER_BOX.h - 20)
  // 영역 가장자리 첫 점을 배경색으로 본다
  const [br, bg, bb] = [data[0], data[1], data[2]]
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > 120) ink++
  }
  return ink > textW * 2
}

// ── 디자인별 그리기 ────────────────────────────────────────
// 각 함수는 글이 다 들어가지 않은 항목 이름을 돌려준다.
type Painter = (ctx: CanvasRenderingContext2D, c: CardInput) => { overflow: string[]; footerColor: string }

const BOTTOM_LIMIT = CARD_H - 150 // 이 아래는 하단 주소 자리

/** 내용 묶음 높이를 보고, 남는 공간이 있으면 시각적 가운데(약간 위)로 내릴 만큼의 값 */
function centerOffset(top: number, contentH: number, bottom = BOTTOM_LIMIT) {
  return Math.max(0, (bottom - top - contentH) * 0.42)
}

/** 제목과 본문을 함께 배치: 제목 먼저 맞추고 남은 높이에 본문을 맞춘다 */
function fitTitleBody(
  ctx: CanvasRenderingContext2D,
  c: CardInput,
  x: number,
  w: number,
  top: number,
  titleMaxH: number,
  gap: number,
  t: { f: FontSpec; max: number; min: number; lh: number },
  b: { f: FontSpec; max: number; min: number; lh: number },
  bottom = BOTTOM_LIMIT,
) {
  const title = fitText(ctx, c.title, { x, y: top, w, h: titleMaxH }, t.f, t.max, t.min, t.lh)
  const titleH = Math.min(title.height, titleMaxH)
  const bodyMaxH = bottom - top - titleH - gap
  const body = fitText(ctx, c.body, { x, y: 0, w, h: bodyMaxH }, b.f, b.max, b.min, b.lh)
  const bodyH = Math.min(body.height, bodyMaxH)
  return { title, titleH, body, bodyH, total: titleH + gap + bodyH }
}

const simple: Painter = (ctx, c) => {
  const d = getDesign('simple')
  const overflow: string[] = []
  ctx.fillStyle = '#FBF8F1'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = '#1F4D3A'
  ctx.fillRect(96, 96, 72, 10)
  drawPager(ctx, c, '#8A8F88', 100)

  const top = 190
  const pillH = c.emphasis ? 34 * 1.9 + 40 : 0
  const imgH = c.image ? 440 : 0
  const fit = fitTitleBody(ctx, c, 96, 888, top + pillH + imgH, c.image ? 260 : 460, 52,
    { f: d.title, max: 116, min: 56, lh: 1.22 }, { f: d.body, max: 54, min: 28, lh: 1.6 })
  let y = top + centerOffset(top, pillH + imgH + fit.total)
  if (c.emphasis) y += drawPill(ctx, c.emphasis, 96, y, d.body, 34, '#1F4D3A', '#FBF8F1', 888).h + 40
  if (c.image) {
    drawImageCover(ctx, c.image, { x: 96, y, w: 888, h: 400 })
    y += 440
  }
  if (!fit.title.fits) overflow.push('제목')
  drawFitted(ctx, fit.title, { x: 96, y, w: 888, h: fit.titleH }, d.title, '#1B1F1C')
  y += fit.titleH + 52
  if (!fit.body.fits) overflow.push('본문')
  drawFitted(ctx, fit.body, { x: 96, y, w: 888, h: fit.bodyH }, d.body, '#4A4F4B')
  return { overflow, footerColor: '#1F4D3A' }
}

const photo: Painter = (ctx, c) => {
  const d = getDesign('photo')
  const overflow: string[] = []
  const photoBox = { x: 0, y: 0, w: CARD_W, h: 780 }
  if (c.image) {
    drawImageCover(ctx, c.image, photoBox)
  } else {
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
  }
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, 0, 740, CARD_W, CARD_H - 740, 48)
  ctx.fill()
  ctx.fillRect(0, 800, CARD_W, CARD_H - 800)
  // 쪽수는 사진 위에서도 읽히게 반투명 바탕
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  roundRect(ctx, CARD_W - 190, 60, 130, 60, 30)
  ctx.fill()
  drawPager(ctx, c, '#FFFFFF', 90)
  if (c.emphasis) drawPill(ctx, c.emphasis, 72, 640, d.title, 44, '#FFD43B', '#2B2118', 936)

  const titleBox = { x: 80, y: 800, w: 920, h: 210 }
  const t = fitText(ctx, c.title, titleBox, d.title, 92, 50, 1.2)
  if (!t.fits) overflow.push('제목')
  const used = drawFitted(ctx, t, titleBox, d.title, '#2B2118')
  const bodyBox = { x: 80, y: 800 + used + 28, w: 920, h: BOTTOM_LIMIT - (800 + used + 28) }
  const b = fitText(ctx, c.body, bodyBox, d.body, 44, 26, 1.55)
  if (!b.fits) overflow.push('본문')
  drawFitted(ctx, b, bodyBox, d.body, '#5C534B')
  return { overflow, footerColor: '#B5651D' }
}

const premium: Painter = (ctx, c) => {
  const d = getDesign('premium')
  const overflow: string[] = []
  ctx.fillStyle = '#17332A'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.strokeStyle = '#C8A96A'
  ctx.lineWidth = 2
  ctx.strokeRect(48, 48, CARD_W - 96, CARD_H - 96)
  drawPager(ctx, c, '#C8A96A', 110)

  const top = 190
  const emphH = c.emphasis ? 80 : 0
  const imgH = c.image ? 420 : 0
  const gap = 36 + 56 // 제목 아래 금색 선 포함
  const fit = fitTitleBody(ctx, c, 120, 840, top + emphH + imgH, c.image ? 240 : 440, gap,
    { f: d.title, max: 100, min: 52, lh: 1.35 }, { f: d.body, max: 46, min: 28, lh: 1.75 }, BOTTOM_LIMIT - 20)
  let y = top + centerOffset(top, emphH + imgH + fit.total, BOTTOM_LIMIT - 20)
  if (c.emphasis) {
    ctx.font = font(d.body, 34)
    ctx.fillStyle = '#C8A96A'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(c.emphasis, CARD_W / 2, y + 17, 840)
    y += emphH
  }
  if (c.image) {
    drawImageCover(ctx, c.image, { x: 140, y, w: 800, h: 380 })
    y += imgH
  }
  if (!fit.title.fits) overflow.push('제목')
  drawFitted(ctx, fit.title, { x: 120, y, w: 840, h: fit.titleH }, d.title, '#F3EAD7', 'center')
  y += fit.titleH + 36
  ctx.fillStyle = '#C8A96A'
  ctx.fillRect(CARD_W / 2 - 40, y, 80, 3)
  y += 56
  if (!fit.body.fits) overflow.push('본문')
  drawFitted(ctx, fit.body, { x: 120, y, w: 840, h: fit.bodyH }, d.body, '#D9CDB4', 'center')
  return { overflow, footerColor: '#C8A96A' }
}

const mz: Painter = (ctx, c) => {
  const d = getDesign('mz')
  const overflow: string[] = []
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
  // 노란 원 위에 놓이므로 진한 색
  drawPager(ctx, c, '#1A1A1A', 90)

  const top = 190
  const stickerH = c.emphasis ? 140 : 0
  const imgH = c.image ? 420 : 0
  const fit = fitTitleBody(ctx, c, 90, 900, top + stickerH + imgH, c.image ? 260 : 460, 44,
    { f: d.title, max: 128, min: 60, lh: 1.18 }, { f: d.body, max: 52, min: 28, lh: 1.55 })
  let y = top + centerOffset(top, stickerH + imgH + fit.total)
  if (c.emphasis) {
    ctx.save()
    ctx.translate(90, y)
    ctx.rotate(-0.07)
    drawPill(ctx, c.emphasis, 0, 0, d.title, 44, '#FFE14D', '#1A1A1A', 800)
    ctx.restore()
    y += stickerH
  }
  if (c.image) {
    ctx.save()
    roundRect(ctx, 90, y, 900, 380, 36)
    ctx.clip()
    drawImageCover(ctx, c.image, { x: 90, y, w: 900, h: 380 })
    ctx.restore()
    y += imgH
  }
  if (!fit.title.fits) overflow.push('제목')
  drawFitted(ctx, fit.title, { x: 90, y, w: 900, h: fit.titleH }, d.title, '#FFFFFF')
  y += fit.titleH + 44
  if (!fit.body.fits) overflow.push('본문')
  drawFitted(ctx, fit.body, { x: 90, y, w: 900, h: fit.bodyH }, d.body, '#FFF4EE')
  return { overflow, footerColor: '#FFFFFF' }
}

const info: Painter = (ctx, c) => {
  const d = getDesign('info')
  const overflow: string[] = []
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = '#1F4D3A'
  ctx.fillRect(0, 0, CARD_W, 170)
  ctx.font = font({ family: d.title.family, weight: 800 }, 72)
  ctx.fillStyle = '#9FD3B5'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(c.index + 1).padStart(2, '0'), 80, 88)
  if (c.emphasis) {
    ctx.font = font({ family: d.body.family, weight: 600 }, 36)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(c.emphasis, 200, 88, 640)
  }
  drawPager(ctx, c, '#CFE6D8', 88)

  let y = 230
  if (c.image) {
    drawImageCover(ctx, c.image, { x: 80, y, w: 920, h: 360 })
    y += 400
  }
  const titleBox = { x: 80, y, w: 920, h: c.image ? 220 : 330 }
  const t = fitText(ctx, c.title, titleBox, d.title, 84, 48, 1.25)
  if (!t.fits) overflow.push('제목')
  y += drawFitted(ctx, t, titleBox, d.title, '#111111') + 40

  // 본문은 연한 상자 안에, 줄(문단)마다 표시점. 상자는 글 높이에 맞춘다.
  const maxPanelH = BOTTOM_LIMIT - y
  const innerMax = { x: 80 + 84, y: y + 44, w: 920 - 128, h: maxPanelH - 88 }
  const b = fitText(ctx, c.body, innerMax, d.body, 46, 26, 1.6)
  if (!b.fits) overflow.push('본문')
  const panel = { x: 80, y, w: 920, h: Math.min(maxPanelH, Math.max(160, b.height + 88)) }
  ctx.fillStyle = '#F2F6F3'
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 28)
  ctx.fill()
  const inner = { ...innerMax, h: panel.h - 88 }
  drawFitted(ctx, b, inner, d.body, '#333333')
  // 문단 시작 줄에 초록 점
  const lh = b.size * b.lineHeight
  const visible = Math.min(b.lines.length, Math.floor(inner.h / lh + 0.001))
  const paraStarts = paragraphStartLines(ctx, c.body, inner.w, d.body, b.size)
  ctx.fillStyle = '#2E6B51'
  for (const i of paraStarts) if (i < visible) ctx.fillRect(panel.x + 44, inner.y + lh * i + lh / 2 - 7, 14, 14)
  return { overflow, footerColor: '#1F4D3A' }
}

/** 각 문단이 몇 번째 줄에서 시작하는지 */
function paragraphStartLines(ctx: CanvasRenderingContext2D, text: string, width: number, f: FontSpec, size: number) {
  ctx.font = font(f, size)
  const starts: number[] = []
  let line = 0
  for (const para of text.split('\n')) {
    const n = para.trim() ? wrapText(ctx, para, width).length : 1
    if (para.trim()) starts.push(line)
    line += n
  }
  return starts
}

const PAINTERS: Record<DesignId, Painter> = { simple, photo, premium, mz, info }

/**
 * 카드 1장을 1080×1350 캔버스에 그린다. 미리보기와 PNG 모두 이 함수 하나로 그린다.
 * 주소(siteUrl)가 있으면 하단에 고정 표시하고, 보이지 않으면 진한 띠를 깔고 다시 그려 자동 복구한다.
 */
export function renderCard(ctx: CanvasRenderingContext2D, design: DesignId, c: CardInput): RenderReport {
  ctx.save()
  ctx.clearRect(0, 0, CARD_W, CARD_H)
  const { overflow, footerColor } = PAINTERS[design](ctx, c)
  let footerOk = true
  let footerRepaired = false
  if (c.siteUrl) {
    drawFooter(ctx, c.siteUrl, footerColor)
    footerOk = footerVisible(ctx, c.siteUrl)
    if (!footerOk) {
      drawFooter(ctx, c.siteUrl, '#FFFFFF', '#1B1F1C')
      footerRepaired = true
      footerOk = footerVisible(ctx, c.siteUrl)
    }
  }
  ctx.restore()
  return { overflow, footerOk, footerRepaired }
}
