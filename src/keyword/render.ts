import './fonts.css'

/**
 * 핵심어 타이포 모션: 글자만 나오는 세로 숏폼.
 * 장면마다 핵심어가 한 글자씩 3D 입체로 세워지고 → 작아지며 → 문장이 단어 단위로 이어진다.
 * t초의 화면을 시간만으로 그리므로 미리보기와 MP4가 같은 그림이 된다.
 */
export const KW_W = 1080
export const KW_H = 1920
const U = KW_W / 100

export type KwDesignId = 'white' | 'black' | 'red' | 'memo'

type Palette = {
  bg: string
  fg: string
  sub: string
  mark: string
  side: string
  edge: string
  floor: string
  tagBg: string
  tagFg: string
  prog: string
  progBg: string
  /** 문장 속 핵심어: 형광펜(밑칠) 또는 글자색 */
  hlMode: 'marker' | 'color'
  grid?: string
  sentFont: { family: string; weight: number; size: number; lh: number }
}

const PLEX = { family: 'Pretendard Variable', weight: 500, size: 7.4 * U, lh: 1.5 }

const PALETTES: Record<KwDesignId, Palette> = {
  white: { bg: '#FFFFFF', fg: '#111111', sub: '#3B3B3B', mark: '#FFE14D', side: '#F5C400', edge: '#B88F00', floor: 'rgba(0,0,0,0.18)', tagBg: '#111111', tagFg: '#FFFFFF', prog: '#111111', progBg: 'rgba(0,0,0,0.1)', hlMode: 'marker', sentFont: PLEX },
  black: { bg: '#0B0B0B', fg: '#FAFAFA', sub: '#CFCFCF', mark: '#E8492F', side: '#E8492F', edge: '#8E2414', floor: 'rgba(232,73,47,0.28)', tagBg: '#FAFAFA', tagFg: '#0B0B0B', prog: '#FAFAFA', progBg: 'rgba(255,255,255,0.18)', hlMode: 'marker', sentFont: PLEX },
  red: { bg: '#D9381E', fg: '#FFF4E2', sub: '#FFE3CC', mark: '#FFC23D', side: '#5A1408', edge: '#2E0A04', floor: 'rgba(46,10,4,0.35)', tagBg: '#FFF4E2', tagFg: '#8E2414', prog: '#FFF4E2', progBg: 'rgba(255,244,226,0.28)', hlMode: 'color', sentFont: PLEX },
  memo: {
    bg: '#FFF6D6', fg: '#1E1A16', sub: '#3A332B', mark: '#FF9F8A', side: '#E8492F', edge: '#8E2414', floor: 'rgba(30,26,22,0.16)', tagBg: '#1E1A16', tagFg: '#FFF6D6', prog: '#1E1A16', progBg: 'rgba(30,26,22,0.12)', hlMode: 'marker',
    grid: 'rgba(120,150,190,0.3)', sentFont: { family: 'Tteolbok Gaegu', weight: 700, size: 8.6 * U, lh: 1.35 },
  },
}

export const KW_DESIGNS: { id: KwDesignId; name: string; desc: string }[] = [
  { id: 'white', name: '흰 바탕', desc: '검은 글씨 + 노란 입체, 깔끔한 정보형' },
  { id: 'black', name: '검은 바탕', desc: '흰 글씨 + 빨간 입체, 강한 대비' },
  { id: 'red', name: '빨간 바탕', desc: '크림 글씨 + 갈색 입체, 홍보·이벤트' },
  { id: 'memo', name: '모눈 메모지', desc: '노란 모눈종이 + 손글씨 문장, 친근한 조언형' },
]

export type KwScene = { kw: string; sent: string }

/** 장면 하나의 시간표 (초, 장면 시작 기준) */
export type SceneTiming = { start: number; lift: number; sent: number; dur: number }

const LETTER_GAP = 0.22
const FLIP = 0.6

/** 장면별 시간: 핵심어 글자 수·문장 단어 수·음성 길이로 정한다 */
export function sceneTimings(scenes: KwScene[], voiceSec: number[] = []): { list: SceneTiming[]; end: number } {
  let start = 0
  const list = scenes.map((s, i) => {
    const n = Math.max(1, [...s.kw.trim()].length)
    const w = Math.max(1, words(s.sent).length)
    const lift = (n - 1) * LETTER_GAP + FLIP + 0.25
    const sent = lift + 0.2
    const visual = sent + w * 0.07 + 0.45 + 1.5
    const dur = Math.max(visual, sent + (voiceSec[i] ?? 0) + 0.7)
    const t = { start, lift, sent, dur: Math.round(dur * 10) / 10 }
    start += t.dur
    return t
  })
  return { list, end: Math.round(start * 10) / 10 }
}

export type KwFrame = {
  design: KwDesignId
  scenes: KwScene[]
  timings: SceneTiming[]
  store: { name: string; loc: string; bg?: string; fg?: string }
  aiLabel: boolean
}

// ── 공통 ─────────────────────────────────────────────────

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const prog = (t: number, s: number, d: number) => clamp01((t - s) / d)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeBack = (x: number) => {
  const c = 1.6
  return x <= 0 ? 0 : x >= 1 ? 1 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
const font = (size: number, family: string, weight = 400) => `${weight} ${size.toFixed(1)}px "${family}", "Pretendard Variable", sans-serif`
const plain = (s: string) => s.replace(/\*/g, '')
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

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

/** 핵심어 글자 크기: 오른쪽 여백(화면 폭 16%)과 입체 두께를 넘지 않게 */
function kwSize(ctx: CanvasRenderingContext2D, kw: string) {
  const avail = KW_W * (1 - 0.09 - 0.16) - KW_W * 0.035
  let fs = 27 * U
  for (let i = 0; i < 80; i++) {
    ctx.font = font(fs, 'KW Black Han Sans')
    if (ctx.measureText(kw).width <= avail || fs < 10 * U) break
    fs *= 0.97
  }
  return fs
}

/** 강조 표시가 섞인 문장을 줄로 나눈다(띄어쓰기 단위). 단어마다 강조 여부를 갖는다 */
function layoutSentence(ctx: CanvasRenderingContext2D, sent: string, p: Palette, maxW: number) {
  const f = p.sentFont
  // 띄어쓰기로 단어를 나누고, *강조* 표시가 여러 단어에 걸쳐도 단어마다 강조 여부를 이어 간다
  let open = false
  const glued = words(sent).map((w) => {
    const pieces: { text: string; hl: boolean }[] = []
    let buf = ''
    for (const ch of w) {
      if (ch === '*') {
        if (buf) pieces.push({ text: buf, hl: open })
        buf = ''
        open = !open
      } else buf += ch
    }
    if (buf) pieces.push({ text: buf, hl: open })
    return { pieces }
  }).filter((g) => g.pieces.length)
  const measure = (pieces: { text: string; hl: boolean }[]) =>
    pieces.reduce((w, pc) => {
      ctx.font = font(f.size, f.family, pc.hl ? 700 : f.weight)
      return w + ctx.measureText(pc.text).width
    }, 0)
  ctx.font = font(f.size, f.family, f.weight)
  const space = ctx.measureText(' ').width
  const lines: { pieces: { text: string; hl: boolean }[]; w: number; x: number; idx: number }[][] = [[]]
  let lineW = 0
  glued.forEach((g, idx) => {
    const w = measure(g.pieces)
    const cur = lines[lines.length - 1]
    if (cur.length && lineW + space + w > maxW) {
      lines.push([])
      lineW = 0
    }
    const l = lines[lines.length - 1]
    const x = l.length ? lineW + space : 0
    l.push({ pieces: g.pieces, w, x, idx })
    lineW = x + w
  })
  return lines
}

/** 입체(3D) 글자 한 자: 바닥 그림자 → 측면 → 앞면 순서로 그린다 */
function draw3DChar(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, fs: number, p: Palette) {
  const k = fs / (27 * U)
  ctx.save()
  ctx.shadowColor = p.floor
  ctx.shadowBlur = 3 * U * k
  ctx.shadowOffsetX = 0.5 * U * k
  ctx.shadowOffsetY = 2.6 * U * k
  ctx.fillStyle = p.edge
  ctx.fillText(ch, x + 2.9 * U * k, y + 3.9 * U * k)
  ctx.restore()
  ctx.fillStyle = p.side
  for (let i = 12; i >= 1; i--) ctx.fillText(ch, x + i * 0.22 * U * k, y + i * 0.3 * U * k)
  ctx.fillStyle = p.fg
  ctx.fillText(ch, x, y)
}

function drawScene(ctx: CanvasRenderingContext2D, p: Palette, scene: KwScene, tm: SceneTiming, local: number) {
  const left = 9 * U
  const kw = scene.kw.trim()
  const fs = kwSize(ctx, kw)
  const kwH = fs * 1.05
  const sentMaxW = KW_W * (1 - 0.09 - 0.16)
  const lines = layoutSentence(ctx, scene.sent, p, sentMaxW)
  const lh = p.sentFont.size * p.sentFont.lh
  const gap = 7 * U
  const total = kwH + gap + lines.length * lh
  const top = (KW_H - 14 * U - total) / 2
  const kwBase = top + fs * 0.88

  // 장면 끝: 위로 살짝 빠지며 사라짐
  const out = easeInOut(prog(local, tm.dur - 0.35, 0.35))
  ctx.save()
  ctx.globalAlpha = 1 - out
  ctx.translate(0, -0.06 * KW_H * out)

  // ── 핵심어 (한 글자씩 3D로 세워짐 → 작아짐 → 좌우로 천천히 기울어짐)
  const lift = easeInOut(prog(local, tm.lift, 0.55))
  const scale = 1 - 0.38 * lift
  const swayT = Math.max(0, local - tm.lift)
  const swayP = (swayT % 5.2) / 2.6
  const swayE = easeInOut(swayP <= 1 ? swayP : 2 - swayP)
  const sway = local > tm.lift ? -10 + 20 * swayE : 0
  ctx.font = font(fs, 'KW Black Han Sans')
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const chars = [...kw]
  const widths = chars.map((c) => ctx.measureText(c).width + fs * 0.01)
  const kwW = widths.reduce((a, b) => a + b, 0)
  ctx.save()
  // 작아질 때 기준점: 왼쪽 아래
  ctx.translate(left, top + kwH)
  ctx.scale(scale, scale)
  // 좌우 기울임(rotateY 흉내): 가로를 줄이고 약간 비틀어 원근감
  const a = (sway * Math.PI) / 180
  ctx.translate(kwW * 0.3, -kwH * 0.4)
  ctx.transform(Math.cos(a), Math.sin(a) * 0.12, 0, 1, 0, 0)
  ctx.translate(-kwW * 0.3, kwH * 0.4)
  ctx.translate(0, -(top + kwH) + kwBase)
  let cx = 0
  chars.forEach((ch, i) => {
    const pp = prog(local, i * LETTER_GAP, FLIP)
    if (pp > 0) {
      const e = easeBack(pp)
      const rot = -100 * (1 - e)
      const cosv = Math.cos((rot * Math.PI) / 180)
      if (cosv > 0.02) {
        const s = 0.7 + 0.3 * e
        ctx.save()
        ctx.globalAlpha *= clamp01(pp / 0.4)
        ctx.translate(cx + widths[i] / 2, 0)
        ctx.translate(0, 0.3 * fs * (1 - e))
        ctx.scale(s, s * cosv)
        draw3DChar(ctx, ch, -widths[i] / 2, 0, fs, p)
        ctx.restore()
      }
    }
    cx += widths[i]
  })
  ctx.restore()

  // ── 문장 (단어 단위로 올라옴, 문장 속 핵심어 강조)
  const sf = p.sentFont
  lines.forEach((line, li) => {
    const cy = top + kwH + gap + li * lh + lh / 2
    for (const g of line) {
      const pp = easeOut(prog(local, tm.sent + g.idx * 0.07, 0.45))
      if (pp <= 0) continue
      ctx.save()
      ctx.globalAlpha *= pp
      ctx.translate(0, 0.6 * lh * 0.5 * (1 - pp))
      let x = left + g.x
      for (const pc of g.pieces) {
        ctx.font = font(sf.size, sf.family, pc.hl ? 700 : sf.weight)
        const w = ctx.measureText(pc.text).width
        if (pc.hl && p.hlMode === 'marker') {
          ctx.fillStyle = p.mark
          ctx.fillRect(x - 0.2 * U, cy + sf.size * 0.05, w + 0.4 * U, sf.size * 0.42)
        }
        ctx.fillStyle = pc.hl ? (p.hlMode === 'color' ? p.mark : p.fg) : p.sub
        ctx.textBaseline = 'middle'
        ctx.fillText(pc.text, x, cy)
        x += w
      }
      ctx.restore()
    }
  })
  ctx.restore()
}

/** t초의 화면 한 장. t가 영상 길이보다 크면 마지막 장면의 완성 화면 */
export function drawKwFrame(ctx: CanvasRenderingContext2D, f: KwFrame, t: number) {
  const p = PALETTES[f.design] ?? PALETTES.white
  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, KW_W, KW_H)
  if (p.grid) {
    ctx.strokeStyle = p.grid
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x <= KW_W; x += 6 * U) {
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, KW_H)
    }
    for (let y = 0; y <= KW_H; y += 6 * U) {
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(KW_W, y + 0.5)
    }
    ctx.stroke()
  }

  const n = f.scenes.length
  const end = n ? f.timings[n - 1].start + f.timings[n - 1].dur : 0
  // 영상이 끝난 뒤(정지 화면)는 첫 장면의 완성 모습을 보여 준다
  const rest = t >= end
  let si = rest ? 0 : f.timings.findIndex((x) => t >= x.start && t < x.start + x.dur)
  if (si < 0) si = 0

  // 위쪽 진행 막대
  if (n > 1) {
    const gap = 1.6 * U
    const x0 = 6 * U
    const w = (KW_W - 12 * U - gap * (n - 1)) / n
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap)
      ctx.fillStyle = p.progBg
      rrect(ctx, x, 5 * U, w, 0.9 * U, 0.45 * U)
      ctx.fill()
      const tm = f.timings[i]
      const r = rest ? (i === 0 ? 1 : 0) : i < si ? 1 : i === si ? clamp01((t - tm.start) / tm.dur) : 0
      if (r > 0) {
        ctx.fillStyle = p.prog
        rrect(ctx, x, 5 * U, w * r, 0.9 * U, 0.45 * U)
        ctx.fill()
      }
    }
  }

  if (n) {
    const tm = f.timings[si]
    // 정지 화면은 핵심어가 작아지고 문장까지 나온 순간(퇴장 전)
    const local = rest ? Math.min(tm.dur - 0.4, tm.sent + 3) : t - tm.start
    drawScene(ctx, p, f.scenes[si], tm, local)
  }

  // 하단 상호 (처음부터 고정, 음성 없음)
  const name = plain(f.store.name).trim()
  const loc = plain(f.store.loc).trim()
  if (name || loc) {
    let fs = 4.4 * U
    const measure = () => {
      ctx.font = font(fs, 'Pretendard Variable', 700)
      const a = name ? ctx.measureText(name).width : 0
      ctx.font = font(fs * 0.8, 'Pretendard Variable', 500)
      const b = loc ? ctx.measureText(loc).width : 0
      return a + b + (name && loc ? fs * 0.4 : 0)
    }
    for (let i = 0; i < 60 && measure() > 80 * U; i++) fs *= 0.96
    const tw = measure()
    const h = fs * 1.2 + 3.2 * U
    const w = tw + 9.2 * U
    const x = KW_W / 2 - w / 2
    const y = KW_H - 5.5 * U - h
    ctx.fillStyle = f.store.bg || p.tagBg
    rrect(ctx, x, y, w, h, h / 2)
    ctx.fill()
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = f.store.fg || p.tagFg
    let cx = x + 4.6 * U
    if (name) {
      ctx.font = font(fs, 'Pretendard Variable', 700)
      ctx.fillText(name, cx, y + h / 2)
      cx += ctx.measureText(name).width + (loc ? fs * 0.4 : 0)
    }
    if (loc) {
      ctx.globalAlpha = 0.75
      ctx.font = font(fs * 0.8, 'Pretendard Variable', 500)
      ctx.fillText(loc, cx, y + h / 2 + 1)
      ctx.globalAlpha = 1
    }
  }

  if (f.aiLabel) {
    const fs = 2.6 * U
    ctx.font = font(fs, 'Pretendard Variable', 700)
    const w = ctx.measureText('AI 음성').width + 2.4 * U
    const h = fs + 1.4 * U
    const x = KW_W - 6 * U - w
    const y = 8 * U
    ctx.fillStyle = p.progBg
    rrect(ctx, x, y, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = p.prog
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('AI 음성', x + w / 2, y + h / 2 + 1)
  }
  ctx.restore()
}

export async function ensureKwFonts(f: Pick<KwFrame, 'scenes' | 'store'>) {
  const sample = ['AI 음성', ...f.scenes.flatMap((s) => [s.kw, plain(s.sent)]), f.store.name, f.store.loc].join('') || '가나다'
  const specs = ['400 40px "KW Black Han Sans"', '700 40px "Tteolbok Gaegu"', '500 40px "Pretendard Variable"', '700 40px "Pretendard Variable"']
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s, sample)))
    await document.fonts.ready
  } catch {
    // 폰트를 못 받아도 기본 글꼴로 계속
  }
}
