import './fonts.css'
import type { TteolbokCopy } from '../../shared/tteolbok'
import { FPS, plain, richParts, type Cues } from './timeline'

/**
 * 털복이 숏폼 화면 그리기.
 * t초의 화면을 시간만으로 정하는 함수라, 미리보기와 MP4 제작이 같은 그림을 만든다(릴스 render.ts와 같은 방식).
 */
export const TT_W = 1080
export const TT_H = 1920
/** 화면 너비의 1% (디자인 치수 단위) */
const U = TT_W / 100

export type DesignId = 'bubble' | 'chalk' | 'poster'
export const TT_DESIGNS: { id: DesignId; name: string; desc: string }[] = [
  { id: 'bubble', name: '말풍선', desc: '살구색 배경, 털복이가 말풍선으로 이야기' },
  { id: 'chalk', name: '칠판', desc: '초록 칠판에 분필 글씨, 털복이가 옆에서 설명' },
  { id: 'poster', name: '포스터', desc: '빨간 배경에 큰 글씨, 강렬한 카드형' },
]

export type FrameInput = {
  design: DesignId
  copy: TteolbokCopy
  store: { name: string; loc: string; bg?: string; fg?: string }
  cues: Cues
  /** 털복이 음성이 들어가는지 (입·눈 움직임) */
  voice: boolean
  /** 음성 크기(30fps, 0~1). 없으면 말하는 구간에서 입 모양을 흉내 낸다 */
  env?: ArrayLike<number> | null
  /** "AI 음성" 표시 */
  aiLabel: boolean
  bear: HTMLImageElement | null
}

const INK = '#3A2418'
const CREAM = '#FFF8EE'
const CHILI = '#E8492F'
const FUR = '#E8613F'

// ── 공통 계산 ─────────────────────────────────────────────

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const prog = (t: number, start: number, dur: number) => clamp01((t - start) / dur)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
/** 살짝 튀었다 들어가는 움직임 (CSS cubic-bezier(.3,1.6,.5,1) 느낌) */
const easeBack = (x: number) => {
  const c = 1.9
  return x <= 0 ? 0 : x >= 1 ? 1 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
const lerp = (a: number, b: number, x: number) => a + (b - a) * x

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const font = (size: number, family: string, weight = 400) => `${weight} ${size.toFixed(1)}px "${family}", "Pretendard Variable", sans-serif`

type Look = { family: string; weight?: number; base: string; hl: string; strokes?: { w: number; c: string }[] }

/** 강조 조각을 포함한 한 줄의 너비 */
function measureRich(ctx: CanvasRenderingContext2D, s: string, size: number, look: Look) {
  ctx.font = font(size, look.family, look.weight)
  return richParts(s).reduce((w, p) => w + ctx.measureText(p.text).width, 0)
}

/** maxW 안에 들어가는 글자 크기 (넘치면 4%씩 줄인다) */
function fitSize(ctx: CanvasRenderingContext2D, s: string, size: number, look: Look, maxW: number) {
  let fs = size
  for (let i = 0; i < 60 && measureRich(ctx, s, fs, look) > maxW && fs > 10; i++) fs *= 0.96
  return fs
}

/** 강조색이 섞인 한 줄을 그린다. align: center는 x가 가운데, left는 x가 왼쪽 끝 */
function drawRich(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, look: Look, align: 'center' | 'left' = 'center') {
  const parts = richParts(s)
  ctx.font = font(size, look.family, look.weight)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  const total = parts.reduce((w, p) => w + ctx.measureText(p.text).width, 0)
  const x0 = align === 'center' ? x - total / 2 : x
  for (const st of look.strokes ?? []) {
    let cx = x0
    ctx.lineWidth = st.w
    ctx.strokeStyle = st.c
    for (const p of parts) {
      ctx.strokeText(p.text, cx, y)
      cx += ctx.measureText(p.text).width
    }
  }
  let cx = x0
  for (const p of parts) {
    ctx.fillStyle = p.hl ? look.hl : look.base
    ctx.fillText(p.text, cx, y)
    cx += ctx.measureText(p.text).width
  }
  return total
}

/** 기준점(px,py)을 중심으로 크기·회전·투명도·이동을 적용해 그린다 */
function withT(
  ctx: CanvasRenderingContext2D,
  o: { px: number; py: number; scale?: number; sx?: number; sy?: number; rot?: number; alpha?: number; dx?: number; dy?: number },
  draw: () => void,
) {
  if ((o.alpha ?? 1) <= 0.001) return
  ctx.save()
  ctx.globalAlpha *= o.alpha ?? 1
  ctx.translate(o.px + (o.dx ?? 0), o.py + (o.dy ?? 0))
  if (o.rot) ctx.rotate((o.rot * Math.PI) / 180)
  const s = o.scale ?? 1
  ctx.scale(s * (o.sx ?? 1), s * (o.sy ?? 1))
  ctx.translate(-o.px, -o.py)
  draw()
  ctx.restore()
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.35)
  ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.5, cy - s * 0.55, cx, cy - s * 0.22)
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.55, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.35)
  ctx.closePath()
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5, inner = 0.45) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * inner : r
    const a = -Math.PI / 2 + (i * Math.PI) / points
    const px = cx + Math.cos(a) * rad
    const py = cy + Math.sin(a) * rad
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  }
  ctx.closePath()
}

/** 하트·별 장식이 톡 나타나는 움직임 */
function popDeco(t: number, start: number) {
  const p = prog(t, start, 1.6)
  if (p <= 0) return { alpha: 0, scale: 0, dy: 0 }
  if (p < 0.3) {
    const q = p / 0.3
    return { alpha: q, scale: 1.3 * q, dy: 4 * U * (1 - q) }
  }
  const q = (p - 0.3) / 0.7
  return { alpha: 1, scale: lerp(1.3, 1, q), dy: -3 * U * q }
}

// ── 털복이 (눈·입 움직임) ────────────────────────────────────

const BEAR_W = 453
const BEAR_H = 399
const FACE_INK = '#2A1A12'

type Talk = { amp: number; talking: boolean; t: number }

function talkState(f: FrameInput, t: number): Talk {
  const talking = f.voice && f.cues.talk.some(([a, b]) => b > a && t >= a && t <= b)
  let amp = 0
  if (f.voice) {
    if (f.env && f.env.length) {
      const i = Math.round(t * FPS)
      amp = i >= 0 && i < f.env.length ? f.env[i] : 0
    } else if (talking) {
      amp = Math.max(0, 0.15 + 0.6 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 4.3)))
    }
  }
  return { amp, talking, t }
}

/** 털복이를 (x,y)=왼쪽 위, 너비 w로 그린다. 눈·입은 음성에 맞춰 직접 그린다. */
function drawBear(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, k: Talk, shadow = 'rgba(120,50,20,0.28)') {
  const s = w / BEAR_W
  const h = BEAR_H * s
  ctx.save()
  // 말할 때 살짝 들썩임 (아래 가운데 기준)
  if (k.talking) {
    ctx.translate(x + w / 2, y + h)
    ctx.scale(1 + 0.035 * k.amp, 1 - 0.045 * k.amp)
    ctx.translate(-(x + w / 2), -(y + h))
  }
  if (img && img.complete && img.naturalWidth) {
    ctx.save()
    ctx.shadowColor = shadow
    ctx.shadowOffsetY = 2 * U
    ctx.shadowBlur = 1.6 * U
    ctx.drawImage(img, x, y, w, h)
    ctx.restore()
  } else {
    ctx.fillStyle = FUR
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.lineCap = 'round'
  ctx.strokeStyle = FACE_INK
  ctx.fillStyle = FACE_INK
  if (!k.talking) {
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(82, 178)
    ctx.quadraticCurveTo(96, 162, 110, 178)
    ctx.moveTo(228, 184)
    ctx.quadraticCurveTo(242, 168, 256, 184)
    ctx.stroke()
  } else {
    const blink = (k.t * 1000) % 1800 < 130 ? 0.12 : 1
    const sy = blink * (1 - 0.18 * k.amp)
    for (const [ex, ey] of [
      [96, 175],
      [242, 181],
    ]) {
      ctx.fillStyle = FACE_INK
      ctx.beginPath()
      ctx.ellipse(ex, ey, 9, 12 * sy, 0, 0, Math.PI * 2)
      ctx.fill()
      if (blink === 1) {
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(ex + 3, ey - 4.5 * sy, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  if (k.amp > 0.12) {
    const rx = 9 + 4 * k.amp
    const ry = 3 + 11 * k.amp
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(163, 284, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#5A1E14'
    ctx.fill()
    ctx.clip()
    ctx.fillStyle = '#F07A7A'
    ctx.beginPath()
    ctx.ellipse(163, 284 + 1 + 7 * k.amp, 6, 1.5 + 3 * k.amp, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = 3
    ctx.strokeStyle = FACE_INK
    ctx.beginPath()
    ctx.ellipse(163, 284, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(148, 280)
    ctx.quadraticCurveTo(155, 291, 163, 283)
    ctx.quadraticCurveTo(171, 291, 178, 280)
    ctx.stroke()
  }
  ctx.restore()
  return h
}

/** 털복이 이름표 (알약 모양) */
function nameTag(ctx: CanvasRenderingContext2D, cx: number, cy: number, rot: number, bg: string, fg: string, alpha: number, scale: number) {
  withT(ctx, { px: cx, py: cy, rot, alpha, scale }, () => {
    const fs = 5.4 * U
    ctx.font = font(fs, 'Tteolbok Gaegu', 700)
    const w = ctx.measureText('털복이').width + 5.2 * U
    const h = fs * 1.1 + 1.2 * U
    ctx.fillStyle = bg
    rrect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('털복이', cx, cy + fs * 0.04)
  })
}

/** 하단 상호. 처음부터 끝까지 고정(움직이지 않음), 음성으로 읽지 않는다. */
function storeTag(ctx: CanvasRenderingContext2D, f: FrameInput, look: { bg: string; fg: string; family: string; radius?: number; nails?: boolean }) {
  const name = plain(f.store.name)
  const loc = plain(f.store.loc)
  if (!name && !loc) return
  const bg = f.store.bg || look.bg
  const fg = f.store.fg || look.fg
  let fs = 5.6 * U
  const measure = () => {
    ctx.font = font(fs, look.family)
    const a = name ? ctx.measureText(name).width : 0
    ctx.font = font(fs * 0.68, 'Pretendard Variable', 700)
    const b = loc ? ctx.measureText(loc).width : 0
    return a + b + (name && loc ? fs * 0.3 : 0)
  }
  for (let i = 0; i < 60 && measure() > 90 * U - 10 * U; i++) fs *= 0.96
  const tw = measure()
  const padX = 5 * U
  const h = fs * 1.15 + 2.8 * U
  const w = tw + padX * 2
  const x = TT_W / 2 - w / 2
  const y = TT_H - 4 * U - h
  ctx.fillStyle = bg
  rrect(ctx, x, y, w, h, look.radius ?? h / 2)
  ctx.fill()
  if (look.nails) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    for (const nx of [x + 1.6 * U, x + w - 1.6 * U]) {
      ctx.beginPath()
      ctx.arc(nx, y + h / 2, 0.6 * U, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = fg
  let cx = x + padX
  const cy = y + h / 2 + fs * 0.03
  if (name) {
    ctx.font = font(fs, look.family)
    ctx.fillText(name, cx, cy)
    cx += ctx.measureText(name).width + (loc ? fs * 0.3 : 0)
  }
  if (loc) {
    ctx.font = font(fs * 0.68, 'Pretendard Variable', 700)
    ctx.fillText(loc, cx, cy + fs * 0.04)
  }
}

function aiBadge(ctx: CanvasRenderingContext2D, f: FrameInput, dark = true) {
  if (!f.voice || !f.aiLabel) return
  const fs = 2.6 * U
  ctx.font = font(fs, 'Pretendard Variable', 700)
  const w = ctx.measureText('AI 음성').width + 2.4 * U
  const h = fs + 1.4 * U
  const x = TT_W - 3.5 * U - w
  const y = 3.5 * U
  ctx.fillStyle = dark ? 'rgba(58,36,24,0.32)' : 'rgba(255,255,255,0.22)'
  rrect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('AI 음성', x + w / 2, y + h / 2 + 1)
}

// ── 디자인 1: 말풍선 ─────────────────────────────────────────

function designBubble(ctx: CanvasRenderingContext2D, f: FrameInput, t: number) {
  const c = f.copy
  const k = f.cues
  ctx.fillStyle = '#FFDDC4'
  ctx.fillRect(0, 0, TT_W, TT_H)

  // 털복이 제목 (고정)
  let y = 10 * U
  const kSize = 16 * U
  const kY = y + kSize * 0.48
  const pk = easeOut(prog(t, 0.3, 0.6))
  withT(ctx, { px: TT_W / 2, py: kY, alpha: pk, dy: -6 * U * (1 - pk) }, () => {
    const look: Look = { family: 'Tteolbok Gaegu', weight: 700, base: FUR, hl: FUR }
    drawRich(ctx, '털복이', TT_W / 2, kY + 1.4 * U, kSize, { ...look, base: 'rgba(58,36,24,0.25)', strokes: [{ w: 5.2 * U, c: 'rgba(58,36,24,0.25)' }] })
    drawRich(ctx, '털복이', TT_W / 2, kY, kSize, { ...look, strokes: [{ w: 5.2 * U, c: INK }, { w: 2.6 * U, c: CREAM }] })
  })
  y += kSize * 0.95 + 8 * U

  // 제목 두 줄
  const lineH = 9.6 * U * 1.16
  const titles: [string, number, string][] = [
    [c.title1, 0.6, INK],
    [c.title2, 1.1, CHILI],
  ]
  for (const [text, start, color] of titles) {
    if (!plain(text)) continue
    const cy = y + lineH / 2
    const look: Look = { family: 'Jua', base: color, hl: CHILI }
    const fs = fitSize(ctx, text, 9.6 * U, look, 88 * U)
    const p = prog(t, start, 0.7)
    withT(ctx, { px: TT_W / 2, py: cy, alpha: clamp01(p * 2), scale: lerp(0.3, 1, easeBack(p)), rot: -8 * (1 - easeBack(p)) }, () =>
      drawRich(ctx, text, TT_W / 2, cy, fs, look),
    )
    y += lineH
  }

  // 포인트 박스
  if (plain(c.point)) {
    y += 4 * U
    const look: Look = { family: 'Jua', base: CREAM, hl: CREAM }
    const fs = fitSize(ctx, plain(c.point), 7.6 * U, look, 80 * U - 8 * U)
    const tw = measureRich(ctx, plain(c.point), fs, look)
    const h = 7.6 * U * 1.1 + 1.6 * U
    const w = tw + 8 * U
    const cy = y + h / 2
    const p = prog(t, 1.9, 0.55)
    withT(ctx, { px: TT_W / 2, py: cy, rot: -2, alpha: clamp01(p * 2), scale: lerp(2.2, 1, easeBack(p)) }, () => {
      ctx.fillStyle = INK
      rrect(ctx, TT_W / 2 - w / 2, cy - h / 2, w, h, 3 * U)
      ctx.fill()
      drawRich(ctx, plain(c.point), TT_W / 2, cy + fs * 0.03, fs, look)
    })
  }

  // 말풍선
  const lines = [
    { text: c.l1, start: k.sB, last: false },
    { text: c.l2, start: k.l2, last: false },
    { text: c.l3, start: k.sC, last: true },
  ].filter((l) => plain(l.text))
  if (lines.length) {
    const top = 79 * U
    const padT = 4.4 * U
    const padB = 4.6 * U
    const gap = 1.4 * U
    const normal = 5.4 * U * 1.4
    const lastH = 5.9 * U * 1.4
    const hasFirst = lines.some((l) => !l.last)
    const rows: { text: string; start: number; last: boolean; cy: number }[] = []
    let yy = top + padT
    lines.forEach((l, i) => {
      if (i) yy += gap
      if (l.last && hasFirst) yy += 1.6 * U + 2.4 * U
      const h = l.last ? lastH : normal
      rows.push({ ...l, cy: yy + h / 2 })
      yy += h
    })
    const bottom = yy + padB
    const left = 8 * U
    const right = TT_W - 8 * U
    const pb = prog(t, k.sB - 0.3, 0.55)
    withT(ctx, { px: TT_W / 2, py: bottom + 0.2 * (bottom - top), alpha: clamp01(pb * 2), scale: lerp(0.2, 1, easeBack(pb)) }, () => {
      // 그림자 → 풍선 → 꼬리
      ctx.fillStyle = 'rgba(232,73,47,0.16)'
      rrect(ctx, left, top + 1.6 * U, right - left, bottom - top, 7 * U)
      ctx.fill()
      ctx.fillStyle = '#fff'
      rrect(ctx, left, top, right - left, bottom - top, 7 * U)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(TT_W / 2 - 5.5 * U, bottom - 1)
      ctx.lineTo(TT_W / 2 + 5.5 * U, bottom - 1)
      ctx.lineTo(TT_W / 2, bottom + 6 * U)
      ctx.closePath()
      ctx.fill()
      if (hasFirst && rows.some((r) => r.last)) {
        const r = rows.find((x) => x.last)!
        ctx.save()
        ctx.strokeStyle = '#F2D3BF'
        ctx.lineWidth = 0.4 * U
        ctx.setLineDash([1.2 * U, 1 * U])
        ctx.beginPath()
        const ly = r.cy - lastH / 2 - 2.4 * U
        ctx.moveTo(left + 5 * U, ly)
        ctx.lineTo(right - 5 * U, ly)
        ctx.stroke()
        ctx.restore()
      }
      for (const r of rows) {
        const look: Look = r.last
          ? { family: 'Jua', base: INK, hl: CHILI }
          : { family: 'Pretendard Variable', weight: 700, base: INK, hl: CHILI }
        const fs = fitSize(ctx, r.text, r.last ? 5.9 * U : 5.4 * U, look, right - left - 10 * U)
        const p = easeOut(prog(t, r.start, r.last ? 0.6 : 0.5))
        withT(ctx, { px: TT_W / 2, py: r.cy, alpha: p, dy: 4 * U * (1 - p) }, () => drawRich(ctx, r.text, TT_W / 2, r.cy, fs, look))
      }
    })
  }

  // 털복이
  const bw = 38 * U
  const bh = (BEAR_H * bw) / BEAR_W
  const bx = TT_W / 2 - bw / 2
  const by = TT_H - 17 * U - bh
  const pin = prog(t, 0.15, 0.9)
  withT(ctx, { px: TT_W / 2, py: by + bh / 2, alpha: clamp01(pin * 2), scale: lerp(0.3, 1, easeBack(pin)), rot: -15 * (1 - easeBack(pin)) }, () => {
    drawBear(ctx, f.bear, bx, by, bw, talkState(f, t))
    const pn = prog(t, 1, 0.5)
    nameTag(ctx, bx + bw + 6 * U - 9 * U, by + 4 * U + 3.6 * U, 8, INK, CREAM, clamp01(pn * 2), lerp(0.3, 1, easeBack(pn)))
  })

  // 하트
  for (const [hx, hy, size, d] of [
    [14 * U + 4 * U, TT_H - 40 * U - 4 * U, 8 * U, 0],
    [82 * U + 3 * U, TT_H - 36 * U - 3 * U, 6 * U, 0.4],
  ]) {
    const a = popDeco(t, k.heart + d)
    withT(ctx, { px: hx, py: hy, alpha: a.alpha, scale: a.scale, dy: a.dy }, () => {
      ctx.fillStyle = CHILI
      heartPath(ctx, hx, hy, size)
      ctx.fill()
    })
  }

  storeTag(ctx, f, { bg: CHILI, fg: '#fff', family: 'Jua' })
  aiBadge(ctx, f)
}

// ── 디자인 2: 칠판 ───────────────────────────────────────────

const CHALK = '#F5F2E8'
const CHALK_Y = '#F6D55C'
const CHALK_P = '#FF9FB0'

function chalkBoard(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(TT_W / 2, TT_H * 0.42, 100, TT_W / 2, TT_H * 0.45, TT_H * 0.75)
  g.addColorStop(0, '#3B5A48')
  g.addColorStop(1, '#253B2F')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, TT_W, TT_H)
  // 분필 가루 (항상 같은 모양)
  const r = rng(7)
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.015 + r() * 0.03})`
    ctx.beginPath()
    ctx.ellipse(r() * TT_W, r() * TT_H, 60 + r() * 220, 20 + r() * 60, r() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.12})`
    ctx.fillRect(r() * TT_W, r() * TT_H, 1.5 + r() * 2.5, 1.5 + r() * 2.5)
  }
  // 나무 테두리
  const fw = 3 * U
  ctx.strokeStyle = '#8A5A33'
  ctx.lineWidth = fw
  ctx.strokeRect(fw / 2, fw / 2, TT_W - fw, TT_H - fw)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 4
  ctx.strokeRect(fw + 2, fw + 2, TT_W - fw * 2 - 4, TT_H - fw * 2 - 4)
}

/** 글씨를 왼쪽부터 써 내려가듯 보이게 자른다 */
function writeClip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number, draw: () => void) {
  if (p <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w * p, h)
  ctx.clip()
  draw()
  ctx.restore()
}

function designChalk(ctx: CanvasRenderingContext2D, f: FrameInput, t: number) {
  const c = f.copy
  const k = f.cues
  chalkBoard(ctx)

  let y = 9 * U
  const kSize = 15 * U
  const kY = y + kSize * 0.48
  const pk = easeOut(prog(t, 0.3, 0.6))
  withT(ctx, { px: TT_W / 2, py: kY, alpha: pk, dy: -6 * U * (1 - pk) }, () => {
    drawRich(ctx, '털복이', TT_W / 2, kY, kSize, { family: 'Tteolbok Gaegu', weight: 700, base: CHALK_Y, hl: CHALK_Y, strokes: [{ w: 0.5 * U, c: 'rgba(255,255,255,0.35)' }] })
  })
  y += kSize * 0.95 + 6 * U

  const lineH = 11 * U * 1.12
  for (const [text, start, color] of [
    [c.title1, 0.6, CHALK],
    [c.title2, 1.1, CHALK_P],
  ] as [string, number, string][]) {
    if (!plain(text)) continue
    const look: Look = { family: 'Tteolbok Gaegu', weight: 700, base: color, hl: CHALK_Y }
    const fs = fitSize(ctx, text, 11 * U, look, 84 * U)
    const w = measureRich(ctx, text, fs, look)
    const cy = y + lineH / 2
    writeClip(ctx, TT_W / 2 - w / 2 - 10, cy - lineH, w + 20, lineH * 2, easeOut(prog(t, start, 0.6)), () => drawRich(ctx, text, TT_W / 2, cy, fs, look))
    y += lineH
  }

  if (plain(c.point)) {
    y += 3 * U
    const look: Look = { family: 'Tteolbok Gaegu', weight: 700, base: CHALK_Y, hl: CHALK_Y }
    const fs = fitSize(ctx, plain(c.point), 8.5 * U, look, 60 * U)
    const w = measureRich(ctx, plain(c.point), fs, look)
    const cy = y + 6 * U
    const p = prog(t, 1.9, 0.55)
    withT(ctx, { px: TT_W / 2, py: cy, alpha: clamp01(p * 2), scale: lerp(1.8, 1, easeBack(p)) }, () => {
      drawRich(ctx, plain(c.point), TT_W / 2, cy, fs, look)
      // 손으로 두른 동그라미 (두 번 겹쳐 그린 느낌)
      ctx.strokeStyle = 'rgba(246,213,92,0.85)'
      ctx.lineWidth = 0.6 * U
      for (const [d, a] of [
        [0, -0.05],
        [1.2 * U, 0.04],
      ]) {
        ctx.beginPath()
        ctx.ellipse(TT_W / 2 + d * 0.3, cy + d * 0.2, w / 2 + 5 * U, 6.4 * U, a, 0.15, Math.PI * 2 - 0.05)
        ctx.stroke()
      }
    })
  }

  // 설명 줄 (왼쪽 정렬, 써 내려가기)
  const lines = [
    { text: c.l1, start: k.sB, last: false },
    { text: c.l2, start: k.l2, last: false },
    { text: c.l3, start: k.sC, last: true },
  ].filter((l) => plain(l.text))
  let ly = 86 * U
  const left = 10 * U
  const maxW = 80 * U
  for (const l of lines) {
    if (l.last) ly += 2.5 * U
    const size = l.last ? 7.2 * U : 6.4 * U
    const look: Look = l.last
      ? { family: 'Tteolbok Gaegu', weight: 700, base: CHALK_Y, hl: CHALK_P }
      : { family: 'Tteolbok Gaegu', weight: 700, base: CHALK, hl: CHALK_Y }
    const fs = fitSize(ctx, l.text, size, look, maxW - 4 * U)
    const w = measureRich(ctx, l.text, fs, look)
    const lh = size * 1.45
    const cy = ly + lh / 2
    const p = easeOut(prog(t, l.start, 0.7))
    // 분필 점
    if (p > 0 && !l.last) {
      ctx.fillStyle = CHALK_Y
      ctx.beginPath()
      ctx.arc(left + 1 * U, cy + 0.2 * U, 0.9 * U, 0, Math.PI * 2)
      ctx.fill()
    }
    const tx = l.last ? left : left + 4 * U
    writeClip(ctx, tx - 10, cy - lh, w + 20, lh * 2, p, () => drawRich(ctx, l.text, tx, cy, fs, look, 'left'))
    if (l.last && p > 0) {
      // 물결 밑줄
      ctx.strokeStyle = 'rgba(255,159,176,0.85)'
      ctx.lineWidth = 0.55 * U
      ctx.beginPath()
      const uy = cy + fs * 0.62
      const len = w * easeOut(prog(t, l.start + 0.5, 0.6))
      for (let i = 0; i <= len; i += 6) {
        const yy = uy + Math.sin(i / 18) * 0.6 * U
        if (i) ctx.lineTo(tx + i, yy)
        else ctx.moveTo(tx, yy)
      }
      ctx.stroke()
    }
    ly += lh + 1.2 * U
  }

  // 털복이 (오른쪽 아래)
  const bw = 40 * U
  const bh = (BEAR_H * bw) / BEAR_W
  const bx = TT_W - 6 * U - bw
  const by = TT_H - 14 * U - bh
  const pin = prog(t, 0.15, 0.9)
  withT(ctx, { px: bx + bw / 2, py: by + bh / 2, alpha: clamp01(pin * 2), scale: lerp(0.3, 1, easeBack(pin)), rot: -15 * (1 - easeBack(pin)) }, () => {
    drawBear(ctx, f.bear, bx, by, bw, talkState(f, t), 'rgba(0,0,0,0.35)')
    const pn = prog(t, 1, 0.5)
    nameTag(ctx, bx + 2 * U, by + 5 * U, -8, CHALK, '#2E4638', clamp01(pn * 2), lerp(0.3, 1, easeBack(pn)))
  })

  // 별
  for (const [sx, sy, r, d] of [
    [16 * U, TT_H - 36 * U, 3.6 * U, 0],
    [30 * U, TT_H - 28 * U, 2.4 * U, 0.4],
  ]) {
    const a = popDeco(t, k.heart + d)
    withT(ctx, { px: sx, py: sy, alpha: a.alpha, scale: a.scale, dy: a.dy }, () => {
      ctx.fillStyle = CHALK_Y
      starPath(ctx, sx, sy, r)
      ctx.fill()
    })
  }

  storeTag(ctx, f, { bg: '#8A5A33', fg: '#FFF3D6', family: 'Jua', radius: 1.6 * U, nails: true })
  aiBadge(ctx, f, false)
}

// ── 디자인 3: 포스터 ─────────────────────────────────────────

const MUSTARD = '#FFD45C'

function designPoster(ctx: CanvasRenderingContext2D, f: FrameInput, t: number) {
  const c = f.copy
  const k = f.cues
  ctx.fillStyle = CHILI
  ctx.fillRect(0, 0, TT_W, TT_H)
  // 오른쪽 위 망점 무늬
  ctx.fillStyle = 'rgba(255,248,238,0.16)'
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      const x = TT_W - i * 3.4 * U - 1.7 * U
      const y = j * 3.4 * U + 1.7 * U
      const r = Math.max(0, 1.3 * U * (1 - Math.hypot(i, j) / 13))
      if (r < 1) continue
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 털복이 스티커 제목
  const pk = prog(t, 0.3, 0.6)
  const kx = 8 * U
  const ky = 14 * U
  withT(ctx, { px: kx + 18 * U, py: ky, rot: -6, alpha: clamp01(pk * 2), scale: lerp(0.3, 1, easeBack(pk)) }, () =>
    drawRich(ctx, '털복이', kx, ky, 12 * U, { family: 'Tteolbok Gaegu', weight: 700, base: CREAM, hl: CREAM, strokes: [{ w: 3.4 * U, c: INK }] }, 'left'),
  )

  // 큰 제목 (왼쪽 정렬)
  let y = 30 * U
  for (const [text, start, color] of [
    [c.title1, 0.6, CREAM],
    [c.title2, 1.1, MUSTARD],
  ] as [string, number, string][]) {
    if (!plain(text)) continue
    const look: Look = { family: 'Jua', base: color, hl: MUSTARD }
    const fs = fitSize(ctx, text, 13 * U, look, 84 * U)
    const p = prog(t, start, 0.7)
    withT(ctx, { px: 8 * U, py: y, alpha: clamp01(p * 2), dx: -20 * U * (1 - easeBack(p)) }, () => {
      drawRich(ctx, text, 8 * U + 0.8 * U, y + 0.9 * U, fs, { ...look, base: 'rgba(58,36,24,0.55)', hl: 'rgba(58,36,24,0.55)' }, 'left')
      drawRich(ctx, text, 8 * U, y, fs, look, 'left')
    })
    y += 13 * U * 1.12
  }

  if (plain(c.point)) {
    const look: Look = { family: 'Jua', base: CREAM, hl: CREAM }
    const fs = fitSize(ctx, plain(c.point), 8 * U, look, 70 * U)
    const w = measureRich(ctx, plain(c.point), fs, look) + 7 * U
    const h = 8 * U * 1.1 + 2.4 * U
    const cy = y + 1.5 * U + h / 2
    const p = prog(t, 1.9, 0.55)
    withT(ctx, { px: 8 * U + w / 2, py: cy, rot: -3, alpha: clamp01(p * 2), scale: lerp(2.2, 1, easeBack(p)) }, () => {
      ctx.fillStyle = INK
      rrect(ctx, 8 * U, cy - h / 2, w, h, 2 * U)
      ctx.fill()
      drawRich(ctx, plain(c.point), 8 * U + w / 2, cy + fs * 0.03, fs, look)
    })
    y = cy + h / 2
  }

  // 털복이 뒤 노란 원
  const bw = 46 * U
  const bh = (BEAR_H * bw) / BEAR_W
  const bx = TT_W / 2 - bw / 2
  const by = TT_H - 13 * U - bh
  const pc = easeBack(prog(t, 0, 0.8))
  ctx.fillStyle = '#F2B632'
  ctx.beginPath()
  ctx.arc(TT_W / 2, by + bh * 0.55, 33 * U * pc, 0, Math.PI * 2)
  ctx.fill()

  // 말 카드 (한 줄씩 왼쪽에서 들어옴)
  const lines = [
    { text: c.l1, start: k.sB, last: false },
    { text: c.l2, start: k.l2, last: false },
    { text: c.l3, start: k.sC, last: true },
  ].filter((l) => plain(l.text))
  let ly = Math.max(64 * U, y + 6 * U)
  lines.forEach((l, i) => {
    const size = l.last ? 6.4 * U : 5.4 * U
    const look: Look = l.last
      ? { family: 'Jua', base: CREAM, hl: MUSTARD }
      : { family: 'Pretendard Variable', weight: 800, base: INK, hl: CHILI }
    const fs = fitSize(ctx, l.text, size, look, 84 * U - 6.8 * U)
    const w = measureRich(ctx, l.text, fs, look) + 6.8 * U
    const h = size * 1.35 + 4 * U
    const p = prog(t, l.start, 0.55)
    const rot = l.last ? -2 : i % 2 ? 1 : -1.2
    withT(ctx, { px: 8 * U + w / 2, py: ly + h / 2, rot: rot - 6 * (1 - easeOut(p)), alpha: clamp01(p * 2), dx: -30 * U * (1 - easeOut(p)) }, () => {
      ctx.fillStyle = 'rgba(58,36,24,0.25)'
      rrect(ctx, 8 * U + 0.8 * U, ly + 0.9 * U, w, h, 1.6 * U)
      ctx.fill()
      ctx.fillStyle = l.last ? INK : CREAM
      rrect(ctx, 8 * U, ly, w, h, 1.6 * U)
      ctx.fill()
      drawRich(ctx, l.text, 8 * U + 3.4 * U, ly + h / 2 + fs * 0.03, fs, look, 'left')
    })
    ly += h + 2.2 * U
  })

  // 털복이 (아래에서 올라옴)
  const pin = prog(t, 0.15, 0.9)
  withT(ctx, { px: TT_W / 2, py: by + bh / 2, alpha: clamp01(pin * 2), dy: 40 * U * (1 - easeBack(pin)) }, () => {
    drawBear(ctx, f.bear, bx, by, bw, talkState(f, t), 'rgba(58,36,24,0.35)')
    const pn = prog(t, 1, 0.5)
    nameTag(ctx, bx + bw - 4 * U, by + 5 * U, 8, CREAM, INK, clamp01(pn * 2), lerp(0.3, 1, easeBack(pn)))
  })

  // 반짝이
  for (const [sx, sy, r, d] of [
    [15 * U, by + 8 * U, 3.4 * U, 0],
    [86 * U, by + 26 * U, 2.6 * U, 0.4],
  ]) {
    const a = popDeco(t, k.heart + d)
    withT(ctx, { px: sx, py: sy, alpha: a.alpha, scale: a.scale, dy: a.dy }, () => {
      ctx.fillStyle = CREAM
      starPath(ctx, sx, sy, r, 4, 0.3)
      ctx.fill()
    })
  }

  storeTag(ctx, f, { bg: INK, fg: CREAM, family: 'Jua' })
  aiBadge(ctx, f)
}

const DRAW: Record<DesignId, (ctx: CanvasRenderingContext2D, f: FrameInput, t: number) => void> = {
  bubble: designBubble,
  chalk: designChalk,
  poster: designPoster,
}

/** t초의 화면 한 장. t가 영상 길이보다 크면 모두 나타난 마지막 화면 */
export function drawTteolbokFrame(ctx: CanvasRenderingContext2D, f: FrameInput, t: number) {
  ctx.save()
  ctx.globalAlpha = 1
  ;(DRAW[f.design] ?? designBubble)(ctx, f, t)
  ctx.restore()
}

/** 영상에 쓰는 폰트를 실제 글자 기준으로 미리 받는다 (한글 폰트는 글자 범위별로 나뉘어 있음) */
export async function ensureTteolbokFonts(f: Pick<FrameInput, 'copy' | 'store'>) {
  const sample = ['털복이', 'AI 음성', ...Object.values(f.copy), f.store.name, f.store.loc].join('') || '가나다'
  const specs = ['700 40px "Tteolbok Gaegu"', '400 40px "Jua"', '700 40px "Pretendard Variable"', '800 40px "Pretendard Variable"']
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s, sample)))
    await document.fonts.ready
  } catch {
    // 폰트를 못 받아도 기본 글꼴로 계속
  }
}

/** 털복이 그림 (원래 눈·입을 지운 그림. 눈·입은 drawBear가 그린다) */
let bearPromise: Promise<HTMLImageElement> | null = null
export function loadBear() {
  bearPromise ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      bearPromise = null
      reject(new Error('털복이 그림을 불러오지 못했습니다.'))
    }
    img.src = '/tteolbok/bear.png'
  })
  return bearPromise
}
