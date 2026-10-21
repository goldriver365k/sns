import { getTemplate, type ReelTemplate } from './templates'
import { sceneTimes } from './store'
import type { ReelAsset, ReelProject, ReelScene } from './types'

/** 릴스 크기 (세로 9:16) */
export const REEL_W = 1080
export const REEL_H = 1920

/**
 * 릴스의 t초 화면 한 장을 그린다.
 * 시간만으로 화면이 정해지는 함수라, 미리보기와 나중의 MP4 제작이 같은 그림을 만든다.
 */
export function drawReelFrame(ctx: CanvasRenderingContext2D, p: ReelProject, t: number) {
  const tpl = getTemplate(p.template)
  const times = sceneTimes(p)
  let i = times.findIndex((x) => t >= x.start && t < x.start + x.len)
  if (i < 0) i = Math.max(0, p.scenes.length - 1)
  const scene = p.scenes[i]
  const { start, len } = times[i] ?? { start: 0, len: p.duration }
  const local = Math.max(0, t - start)
  const prog = len > 0 ? Math.min(1, local / len) : 0
  const assets = new Map(p.assets.map((a) => [a.id, a]))

  ctx.save()
  ctx.clearRect(0, 0, REEL_W, REEL_H)
  drawBackground(ctx, tpl)

  if (scene) {
    // 장면이 바뀔 때 0.25초 동안 서서히 나타남
    const fadeIn = i === 0 ? 1 : Math.min(1, local / 0.25)
    ctx.globalAlpha = 0.35 + 0.65 * fadeIn
    const media = scene.assetId ? assets.get(scene.assetId) : undefined
    if (media) drawMedia(ctx, tpl, media, scene, prog)
    else drawEmptyMedia(ctx, tpl)
    ctx.globalAlpha = 1
    drawHeader(ctx, tpl, p, i)
    drawEffects(ctx, tpl, scene, local, len)
    const character = scene.characterId ? assets.get(scene.characterId) : undefined
    if (character) drawCharacter(ctx, character, local)
    drawSubtitle(ctx, tpl, scene, local, len)
  }

  const logo = p.logoId ? assets.get(p.logoId) : undefined
  if (logo) drawLogo(ctx, logo, t)
  if (p.showProgress) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(0, REEL_H - 12, REEL_W, 12)
    ctx.fillStyle = tpl.accent
    ctx.fillRect(0, REEL_H - 12, REEL_W * Math.min(1, t / p.duration), 12)
  }
  ctx.restore()
  return { sceneIndex: i, sceneStart: start, sceneLength: len }
}

// ── 배경·사진 ─────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, tpl: ReelTemplate) {
  const g = ctx.createLinearGradient(0, 0, REEL_W, REEL_H)
  g.addColorStop(0, tpl.bg[0])
  g.addColorStop(1, tpl.bg[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  if (tpl.id === 'pop') {
    ctx.fillStyle = 'rgba(255,225,77,0.9)'
    circle(ctx, REEL_W - 40, 160, 160)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    circle(ctx, 60, REEL_H - 260, 240)
  }
}

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3)
const easeBack = (x: number) => {
  const c = 1.70158
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}

function clipBox(ctx: CanvasRenderingContext2D, b: ReelTemplate['media']) {
  ctx.beginPath()
  if (b.radius) ctx.roundRect(b.x, b.y, b.w, b.h, b.radius)
  else ctx.rect(b.x, b.y, b.w, b.h)
  ctx.clip()
}

/** 사진·영상 + 움직임(확대·축소·좌우 이동). 핵심 모델 이미지는 원본 비율 그대로(자르지 않음) */
function drawMedia(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, a: ReelAsset, s: ReelScene, prog: number) {
  const b = tpl.media
  const sw = a.width || 1
  const sh = a.height || 1
  const e = ease(prog)
  // 핵심 모델: 화면 안에 통째로(contain) + 아주 약한 확대만
  const fit = a.keyModel ? Math.min(b.w / sw, b.h / sh) : Math.max(b.w / sw, b.h / sh)
  let zoom = 1
  let dx = 0
  if (a.keyModel) zoom = 1 + 0.03 * e
  else if (s.motion === 'zoomIn') zoom = 1 + 0.18 * e
  else if (s.motion === 'zoomOut') zoom = 1.18 - 0.18 * e
  else if (s.motion === 'panLeft' || s.motion === 'panRight') {
    zoom = 1.15
    dx = (s.motion === 'panLeft' ? 1 - 2 * e : -1 + 2 * e) * b.w * 0.06
  }
  const w = sw * fit * zoom
  const h = sh * fit * zoom
  ctx.save()
  clipBox(ctx, b)
  if (a.keyModel) {
    // 원본 주변은 흐린 배경색으로 채운다
    ctx.fillStyle = tpl.bg[1]
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }
  try {
    ctx.drawImage(a.el, b.x + (b.w - w) / 2 + dx, b.y + (b.h - h) / 2, w, h)
  } catch {
    // 영상 프레임이 아직 준비되지 않았으면 건너뜀
  }
  if (tpl.shade) {
    const g = ctx.createLinearGradient(0, b.y + b.h * 0.45, 0, b.y + b.h)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${tpl.shade + 0.3})`)
    ctx.fillStyle = g
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }
  ctx.restore()
}

function drawEmptyMedia(ctx: CanvasRenderingContext2D, tpl: ReelTemplate) {
  const b = tpl.media
  if (tpl.id === 'impact') return
  ctx.save()
  clipBox(ctx, b)
  ctx.fillStyle = tpl.id === 'premium' ? '#21443A' : tpl.id === 'pop' ? 'rgba(255,255,255,0.18)' : '#E9E2D6'
  ctx.fillRect(b.x, b.y, b.w, b.h)
  ctx.restore()
}

function drawHeader(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, p: ReelProject, i: number) {
  if (tpl.header === 'bar') {
    ctx.fillStyle = tpl.accent
    ctx.fillRect(0, 0, REEL_W, 220)
    ctx.font = '800 92px "Pretendard Variable"'
    ctx.fillStyle = tpl.accent2
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(String(i + 1).padStart(2, '0'), 60, 115)
    ctx.font = '700 52px "Pretendard Variable"'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(p.title.slice(0, 16), 200, 115, 820)
  } else if (tpl.header === 'frame') {
    ctx.strokeStyle = tpl.accent
    ctx.lineWidth = 3
    ctx.strokeRect(50, 50, REEL_W - 100, REEL_H - 100)
    ctx.font = '400 40px "ACM MaruBuri"'
    ctx.fillStyle = tpl.accent
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.title.slice(0, 20), REEL_W / 2, 200, 860)
  } else if (tpl.header === 'dots') {
    p.scenes.forEach((_, k) => {
      ctx.fillStyle = k === i ? tpl.accent : 'rgba(31,77,58,0.2)'
      const total = p.scenes.length
      circle(ctx, REEL_W / 2 + (k - (total - 1) / 2) * 34, 140, k === i ? 11 : 8)
    })
  }
}

// ── 자막 ─────────────────────────────────────────────────

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para.split(/(\s+)/)) {
      if (ctx.measureText(line + ch).width <= maxW) line += ch
      else {
        if (line.trim()) lines.push(line.trim())
        line = ch.trimStart()
        while (ctx.measureText(line).width > maxW && line.length > 1) {
          let cut = line.length - 1
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--
          lines.push(line.slice(0, cut))
          line = line.slice(cut)
        }
      }
    }
    if (line.trim()) lines.push(line.trim())
  }
  return lines
}

function drawSubtitle(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, s: ReelScene, local: number, len: number) {
  if (!s.text.trim()) return
  const st = tpl.sub
  const maxW = 920
  let size = st.size
  let lines: string[] = []
  // 3줄 안에 들어갈 때까지 글씨를 줄인다
  for (; size >= 36; size -= 4) {
    ctx.font = `${st.weight} ${size}px "${st.family}"`
    lines = wrap(ctx, s.text, maxW - 40)
    if (lines.length <= 3) break
  }
  lines = lines.slice(0, 3)
  const lh = size * 1.35

  // 자막 움직임
  let alpha = 1
  let scale = 1
  let dy = 0
  let visibleChars = Infinity
  if (s.subtitleAnim === 'pop') {
    const k = Math.min(1, local / 0.35)
    scale = 0.6 + 0.4 * easeBack(k)
    alpha = Math.min(1, local / 0.15)
  } else if (s.subtitleAnim === 'slideUp') {
    const k = ease(Math.min(1, local / 0.45))
    dy = (1 - k) * 80
    alpha = k
  } else if (s.subtitleAnim === 'fade') {
    alpha = Math.min(1, local / 0.5)
  } else if (s.subtitleAnim === 'typewriter') {
    visibleChars = Math.floor((lines.join('').length * local) / Math.max(0.5, len * 0.6))
  }

  const blockH = lines.length * lh
  const top = st.y - blockH / 2 + dy
  const cx = st.align === 'center' ? REEL_W / 2 : 80
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(REEL_W / 2, st.y)
  ctx.scale(scale, scale)
  ctx.translate(-REEL_W / 2, -st.y)
  ctx.font = `${st.weight} ${size}px "${st.family}"`
  ctx.textBaseline = 'middle'
  ctx.textAlign = st.align
  let shown = 0
  lines.forEach((line, k) => {
    const textLine = visibleChars === Infinity ? line : line.slice(0, Math.max(0, visibleChars - shown))
    shown += line.length
    const y = top + lh * k + lh / 2
    const w = ctx.measureText(line).width
    if (st.box) {
      ctx.fillStyle = st.box
      const bx = st.align === 'center' ? cx - w / 2 - 28 : cx - 24
      ctx.beginPath()
      ctx.roundRect(bx, y - lh / 2 + 4, w + 56, lh - 8, 18)
      ctx.fill()
    }
    if (st.stroke) {
      ctx.lineWidth = 14
      ctx.lineJoin = 'round'
      ctx.strokeStyle = st.stroke
      ctx.strokeText(textLine, cx, y)
    }
    ctx.fillStyle = st.color
    ctx.fillText(textLine, cx, y)
  })
  ctx.restore()
}

// ── 로고·캐릭터 ───────────────────────────────────────────

function drawLogo(ctx: CanvasRenderingContext2D, a: ReelAsset, t: number) {
  // 영상 시작 0.6초 동안 커지며 나타난 뒤 오른쪽 위에 머문다
  const k = easeBack(Math.min(1, t / 0.6))
  const maxW = 220
  const maxH = 140
  const fit = Math.min(maxW / (a.width || 1), maxH / (a.height || 1))
  const w = (a.width || 1) * fit * k
  const h = (a.height || 1) * fit * k
  ctx.save()
  ctx.globalAlpha = Math.min(1, t / 0.4)
  try {
    ctx.drawImage(a.el, REEL_W - 60 - maxW / 2 - w / 2, 60 + maxH / 2 - h / 2, w, h)
  } catch {
    // 준비 전이면 건너뜀
  }
  ctx.restore()
}

function drawCharacter(ctx: CanvasRenderingContext2D, a: ReelAsset, local: number) {
  // 왼쪽 아래에서 튀어 오른 뒤 살짝 통통 튄다
  const enter = easeBack(Math.min(1, local / 0.5))
  const bob = Math.sin(local * 5) * 10
  const maxW = 360
  const fit = Math.min(maxW / (a.width || 1), 420 / (a.height || 1))
  const w = (a.width || 1) * fit
  const h = (a.height || 1) * fit
  const y = REEL_H - 300 - h + (1 - enter) * 400 + bob
  try {
    ctx.drawImage(a.el, 40, y, w, h)
  } catch {
    // 준비 전이면 건너뜀
  }
}

// ── 모션그래픽 효과 ─────────────────────────────────────────

/** 장면 id로 정해지는 난수 (같은 장면은 항상 같은 위치 → 미리보기와 MP4가 같음) */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, s: ReelScene, local: number, len: number) {
  for (const fx of s.effects) {
    if (fx === 'sparkle') sparkle(ctx, s.id, local)
    if (fx === 'fireworks') fireworks(ctx, tpl, s.id, local, len)
    if (fx === 'highlight') highlight(ctx, tpl, local)
    if (fx === 'priceTag' && s.priceText.trim()) priceTag(ctx, tpl, s.priceText.trim(), local)
    if (fx === 'cta' && s.ctaText.trim()) cta(ctx, tpl, s.ctaText.trim(), local)
  }
}

/** 반짝임: 네 갈래 별이 깜빡인다 */
function sparkle(ctx: CanvasRenderingContext2D, seed: string, local: number) {
  const r = rng(seed + 's')
  for (let k = 0; k < 16; k++) {
    const x = 80 + r() * (REEL_W - 160)
    const y = 260 + r() * 1150
    const size = 14 + r() * 26
    const a = Math.max(0, Math.sin(local * (2.5 + r() * 3) + r() * 6.28))
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = k % 3 === 0 ? '#FFE9A6' : '#FFFFFF'
    ctx.translate(x, y)
    ctx.beginPath()
    for (let j = 0; j < 8; j++) {
      const rad = j % 2 === 0 ? size : size * 0.22
      const ang = (j * Math.PI) / 4
      ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

/** 불꽃: 장면 중 세 번 터지는 불꽃 */
function fireworks(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, seed: string, local: number, len: number) {
  const r = rng(seed + 'f')
  const colors = [tpl.accent, '#FF6B6B', '#FFFFFF', '#7CE0FF', '#FFD43B']
  for (let b = 0; b < 3; b++) {
    const at = len * (0.1 + b * 0.28)
    const cx = 180 + r() * (REEL_W - 360)
    const cy = 320 + r() * 700
    const age = local - at
    if (age < 0 || age > 1.2) {
      for (let j = 0; j < 24; j++) r()
      continue
    }
    for (let j = 0; j < 24; j++) {
      const ang = (j / 24) * Math.PI * 2 + r() * 0.2
      const speed = 260 + r() * 140
      const d = speed * ease(Math.min(1, age / 0.9))
      ctx.globalAlpha = Math.max(0, 1 - age / 1.2)
      ctx.fillStyle = colors[j % colors.length]
      circle(ctx, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d + 60 * age * age, 7)
    }
  }
  ctx.globalAlpha = 1
}

/** 강조 박스: 사진 영역 둘레를 선이 그리며 감싼 뒤 숨 쉬듯 깜빡 */
function highlight(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, local: number) {
  const b = tpl.media
  const pad = 18
  const per = 2 * (b.w + b.h + pad * 4)
  const k = ease(Math.min(1, local / 0.8))
  ctx.save()
  ctx.strokeStyle = tpl.accent
  ctx.lineWidth = 12 + (k >= 1 ? Math.sin(local * 6) * 3 : 0)
  ctx.setLineDash([per * k, per])
  ctx.beginPath()
  ctx.roundRect(b.x + pad, b.y + pad, b.w - pad * 2, b.h - pad * 2, Math.max(12, b.radius))
  ctx.stroke()
  ctx.restore()
}

/** 가격표: 오른쪽에서 기울어진 꼬리표가 들어온다 */
function priceTag(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, text: string, local: number) {
  const k = easeBack(Math.min(1, Math.max(0, (local - 0.2) / 0.5)))
  ctx.save()
  ctx.font = '900 72px "Pretendard Variable"'
  const w = Math.min(560, ctx.measureText(text).width + 120)
  const h = 130
  const x = REEL_W - w - 60 + (1 - k) * (w + 120)
  const y = tpl.media.y + 140
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(-0.12)
  ctx.fillStyle = '#E8392C'
  ctx.beginPath()
  ctx.moveTo(-w / 2 + 50, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  ctx.lineTo(w / 2, h / 2)
  ctx.lineTo(-w / 2 + 50, h / 2)
  ctx.lineTo(-w / 2, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  circle(ctx, -w / 2 + 44, 0, 12)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 25, 4, w - 90)
  ctx.restore()
}

/** CTA 버튼: 아래쪽에서 올라와 두근거린다 */
function cta(ctx: CanvasRenderingContext2D, tpl: ReelTemplate, text: string, local: number) {
  const enter = ease(Math.min(1, local / 0.5))
  const pulse = 1 + Math.sin(local * 5) * 0.035
  ctx.save()
  ctx.font = '800 56px "Pretendard Variable"'
  const w = Math.min(900, ctx.measureText(text).width + 140)
  const h = 120
  const cx = REEL_W / 2
  const cy = REEL_H - 190 + (1 - enter) * 200
  ctx.translate(cx, cy)
  ctx.scale(pulse, pulse)
  ctx.fillStyle = tpl.accent
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = tpl.id === 'impact' || tpl.id === 'pop' ? '#111111' : '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${text} ›`, 0, 4, w - 60)
  ctx.restore()
}

/** 미리보기 전에 템플릿·효과에 쓰는 폰트를 실제 글자로 내려받는다 */
export async function ensureReelFonts(p: ReelProject) {
  const tpl = getTemplate(p.template)
  const sample = p.scenes.map((s) => s.text + s.priceText + s.ctaText).join('') + p.title + '0123456789'
  const specs = [
    `${tpl.sub.weight} 40px "${tpl.sub.family}"`,
    '900 40px "Pretendard Variable"',
    '800 40px "Pretendard Variable"',
    '700 40px "Pretendard Variable"',
    '400 40px "ACM MaruBuri"',
  ]
  try {
    await Promise.all(specs.map((f) => document.fonts.load(f, sample || '가나다')))
  } catch {
    // 폰트를 못 받아도 미리보기는 기본 글꼴로 계속
  }
}
