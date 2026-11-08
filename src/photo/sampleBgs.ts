/**
 * 기본 샘플 배경: 이 앱이 직접 그리는 배경(외부 사진이 아님 → 저작권 걱정 없음).
 * 같은 이름이면 항상 같은 그림이 나오도록 난수도 고정한다.
 */
export type SampleBg = { id: string; name: string; group: '그라데이션' | '패턴' | '질감' | '계절·분위기'; tags: string; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }

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

const linear = (colors: string[], angle = 'v') => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const g = angle === 'd' ? ctx.createLinearGradient(0, 0, w, h) : ctx.createLinearGradient(0, 0, 0, h)
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

const radial = (inner: string, outer: string) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.75)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** 점·얼룩을 흩뿌린다 (종이·콘크리트 질감) */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, color: string, maxR: number) {
  const r = rng(seed)
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.04 + r() * 0.12
    ctx.beginPath()
    ctx.arc(r() * w, r() * h, 0.5 + r() * maxR, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

const U = (w: number, h: number) => Math.min(w, h) / 100

export const SAMPLE_BGS: SampleBg[] = [
  { id: 'sunset', name: '노을', group: '그라데이션', tags: '주황 분홍 저녁 따뜻한 sunset', draw: linear(['#ffb88c', '#ff8fa3', '#c779d0']) },
  { id: 'ocean', name: '바다', group: '그라데이션', tags: '파랑 하늘 시원한 여름 sea', draw: linear(['#a8edea', '#4fc3f7', '#1e88e5']) },
  { id: 'mint', name: '민트', group: '그라데이션', tags: '초록 연두 상큼 산뜻', draw: linear(['#e0f7ef', '#9be7c4'], 'd') },
  { id: 'lavender', name: '라벤더', group: '그라데이션', tags: '보라 파스텔 부드러운', draw: linear(['#f3e7ff', '#c9b6f2'], 'd') },
  { id: 'lemon', name: '레몬', group: '그라데이션', tags: '노랑 밝은 상큼', draw: linear(['#fffbe0', '#ffe27a'], 'd') },
  { id: 'cream', name: '크림', group: '그라데이션', tags: '베이지 따뜻한 깔끔', draw: radial('#fffaf2', '#ecdcc4') },
  { id: 'luxe', name: '고급 검정', group: '그라데이션', tags: '검정 금색 고급 어두운 black gold', draw: (ctx, w, h) => {
      radial('#3a3226', '#0c0b0a')(ctx, w, h)
      const g = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, w * 0.55)
      g.addColorStop(0, 'rgba(255,214,140,0.28)')
      g.addColorStop(1, 'rgba(255,214,140,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    } },
  { id: 'night', name: '밤하늘', group: '그라데이션', tags: '남색 별 밤 어두운 night star', draw: (ctx, w, h) => {
      linear(['#0f1b3d', '#3b2667', '#6a3f8a'])(ctx, w, h)
      const r = rng(7)
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 160; i++) {
        ctx.globalAlpha = 0.3 + r() * 0.7
        ctx.beginPath()
        ctx.arc(r() * w, r() * h * 0.8, r() * U(w, h) * 0.35 + 0.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    } },
  { id: 'dots', name: '물방울', group: '패턴', tags: '점 도트 귀여운 분홍 pattern', draw: (ctx, w, h) => {
      ctx.fillStyle = '#ffe4ea'
      ctx.fillRect(0, 0, w, h)
      const s = U(w, h) * 8
      ctx.fillStyle = '#ffffff'
      for (let y = 0, row = 0; y < h + s; y += s, row++)
        for (let x = row % 2 ? s / 2 : 0; x < w + s; x += s) {
          ctx.beginPath()
          ctx.arc(x, y, s * 0.18, 0, Math.PI * 2)
          ctx.fill()
        }
    } },
  { id: 'stripes', name: '줄무늬', group: '패턴', tags: '사선 스트라이프 하늘 pattern', draw: (ctx, w, h) => {
      ctx.fillStyle = '#e6f2fb'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#cfe4f5'
      ctx.lineWidth = U(w, h) * 3
      const s = U(w, h) * 8
      for (let x = -h; x < w + h; x += s) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + h, h)
        ctx.stroke()
      }
    } },
  { id: 'gingham', name: '체크', group: '패턴', tags: '깅엄 피크닉 빨강 식탁보 pattern', draw: (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      const s = U(w, h) * 7
      ctx.fillStyle = 'rgba(214,51,42,0.28)'
      for (let x = 0; x < w; x += s * 2) ctx.fillRect(x, 0, s, h)
      for (let y = 0; y < h; y += s * 2) ctx.fillRect(0, y, w, s)
    } },
  { id: 'grid', name: '모눈 메모지', group: '패턴', tags: '모눈종이 노트 메모 노랑 grid', draw: (ctx, w, h) => {
      ctx.fillStyle = '#fff6d6'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(120,150,190,0.35)'
      ctx.lineWidth = Math.max(1, U(w, h) * 0.18)
      const s = U(w, h) * 5
      for (let x = 0; x < w; x += s) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y < h; y += s) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    } },
  { id: 'paper', name: '종이', group: '질감', tags: '크라프트 베이지 자연 paper', draw: (ctx, w, h) => {
      ctx.fillStyle = '#efe4cf'
      ctx.fillRect(0, 0, w, h)
      speckle(ctx, w, h, 11, Math.round((w * h) / 900), '#8a6d45', U(w, h) * 0.25)
    } },
  { id: 'concrete', name: '콘크리트', group: '질감', tags: '회색 시멘트 벽 모던 concrete', draw: (ctx, w, h) => {
      radial('#d9d9d6', '#a9a9a5')(ctx, w, h)
      speckle(ctx, w, h, 23, Math.round((w * h) / 600), '#5d5d5a', U(w, h) * 0.4)
      speckle(ctx, w, h, 29, 60, '#ffffff', U(w, h) * 6)
    } },
  { id: 'marble', name: '대리석', group: '질감', tags: '흰 대리석 고급 결 marble', draw: (ctx, w, h) => {
      radial('#ffffff', '#eceae6')(ctx, w, h)
      const r = rng(41)
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(120,118,112,${0.08 + r() * 0.18})`
        ctx.lineWidth = 0.6 + r() * U(w, h) * 0.35
        ctx.beginPath()
        let x = r() * w
        let y = -10
        ctx.moveTo(x, y)
        while (y < h + 10) {
          const nx = x + (r() - 0.5) * U(w, h) * 18
          const ny = y + U(w, h) * (6 + r() * 10)
          ctx.quadraticCurveTo(x + (r() - 0.5) * U(w, h) * 12, (y + ny) / 2, nx, ny)
          x = nx
          y = ny
        }
        ctx.stroke()
      }
    } },
  { id: 'wood', name: '원목', group: '질감', tags: '나무 테이블 따뜻한 갈색 wood', draw: (ctx, w, h) => {
      linear(['#c9925a', '#b07a45', '#c38b52'], 'v')(ctx, w, h)
      const r = rng(53)
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(90,52,22,${0.06 + r() * 0.12})`
        ctx.lineWidth = 0.6 + r() * U(w, h) * 0.5
        const y0 = r() * h
        ctx.beginPath()
        ctx.moveTo(0, y0)
        for (let x = 0; x <= w; x += w / 12) ctx.lineTo(x, y0 + Math.sin(x / (w / 3) + i) * U(w, h) * 1.2)
        ctx.stroke()
      }
    } },
  { id: 'bokeh', name: '빛망울', group: '계절·분위기', tags: '보케 조명 반짝 따뜻한 밤 lights', draw: (ctx, w, h) => {
      radial('#3d2a1e', '#120c08')(ctx, w, h)
      const r = rng(61)
      const colors = ['255,200,120', '255,160,90', '255,235,180']
      for (let i = 0; i < 45; i++) {
        const rad = U(w, h) * (2 + r() * 7)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad)
        const c = colors[i % colors.length]
        g.addColorStop(0, `rgba(${c},${0.25 + r() * 0.35})`)
        g.addColorStop(1, `rgba(${c},0)`)
        ctx.save()
        ctx.translate(r() * w, r() * h)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(0, 0, rad, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } },
  { id: 'blossom', name: '벚꽃', group: '계절·분위기', tags: '봄 꽃잎 분홍 spring', draw: (ctx, w, h) => {
      linear(['#fff5f8', '#ffe1ea'])(ctx, w, h)
      const r = rng(71)
      for (let i = 0; i < 60; i++) {
        ctx.save()
        ctx.translate(r() * w, r() * h)
        ctx.rotate(r() * Math.PI)
        ctx.fillStyle = `rgba(255,${150 + Math.round(r() * 40)},${180 + Math.round(r() * 30)},${0.45 + r() * 0.4})`
        const s = U(w, h) * (0.8 + r() * 1.6)
        ctx.beginPath()
        ctx.ellipse(0, 0, s * 1.4, s, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } },
  { id: 'autumn', name: '가을', group: '계절·분위기', tags: '단풍 낙엽 주황 따뜻한 autumn', draw: (ctx, w, h) => {
      linear(['#fff1dc', '#f6c48f'])(ctx, w, h)
      const r = rng(83)
      const cs = ['#d9622b', '#e89a2c', '#b8451f', '#f2b84b']
      for (let i = 0; i < 40; i++) {
        ctx.save()
        ctx.translate(r() * w, r() < 0.5 ? r() * h * 0.25 : h - r() * h * 0.25)
        ctx.rotate(r() * Math.PI * 2)
        ctx.globalAlpha = 0.5 + r() * 0.4
        ctx.fillStyle = cs[i % cs.length]
        const s = U(w, h) * (1.5 + r() * 2.5)
        ctx.beginPath()
        ctx.ellipse(0, 0, s * 1.6, s * 0.8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.globalAlpha = 1
    } },
  { id: 'snow', name: '눈', group: '계절·분위기', tags: '겨울 크리스마스 하늘 snow winter', draw: (ctx, w, h) => {
      linear(['#cfe6fb', '#eaf4fd'])(ctx, w, h)
      const r = rng(97)
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 140; i++) {
        ctx.globalAlpha = 0.5 + r() * 0.5
        ctx.beginPath()
        ctx.arc(r() * w, r() * h, U(w, h) * (0.2 + r() * 0.8), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    } },
]

export function findSamples(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return SAMPLE_BGS
  const words = q.split(/\s+/)
  return SAMPLE_BGS.filter((s) => words.every((wd) => `${s.name} ${s.group} ${s.tags}`.toLowerCase().includes(wd)))
}

/** 샘플을 결과 크기 비율로 그린 이미지 (긴 변 1600px 이하) */
export function renderSample(s: SampleBg, outW: number, outH: number): Promise<HTMLImageElement> {
  const k = Math.min(1, 1600 / Math.max(outW, outH))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(outW * k))
  c.height = Math.max(1, Math.round(outH * k))
  s.draw(c.getContext('2d')!, c.width, c.height)
  return new Promise((resolve, reject) => {
    c.toBlob((b) => {
      if (!b) return reject(new Error('샘플 배경을 만들지 못했습니다.'))
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('샘플 배경을 만들지 못했습니다.'))
      img.src = URL.createObjectURL(b)
    }, 'image/jpeg', 0.92)
  })
}

/** 목록용 작은 그림 */
export function sampleThumb(canvas: HTMLCanvasElement, s: SampleBg) {
  const ctx = canvas.getContext('2d')
  if (ctx) s.draw(ctx, canvas.width, canvas.height)
}
