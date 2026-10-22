import type { TteolbokCopy } from '../../shared/tteolbok'

/** 영상 속도 */
export const FPS = 30

/** 별표 강조 표시를 뺀 글자 */
export const plain = (s: string | undefined) => String(s ?? '').replace(/\*/g, '').trim()

/** `*강조*` 표시를 글자 조각으로 나눈다 */
export function richParts(s: string): { text: string; hl: boolean }[] {
  const out: { text: string; hl: boolean }[] = []
  String(s ?? '')
    .split(/(\*[^*]+\*)/g)
    .forEach((part) => {
      if (!part) return
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) out.push({ text: part.slice(1, -1), hl: true })
      else out.push({ text: part.replace(/\*/g, ''), hl: false })
    })
  return out
}

/**
 * 털복이가 읽는 3개 구간의 문장.
 * A: 제목(첫째 줄 + 둘째 줄 + 포인트) / B: 말풍선 첫째·둘째 줄 / C: 마무리 줄. 상호는 읽지 않는다.
 */
export function voiceTexts(c: TteolbokCopy): [string, string, string] {
  const join = (arr: string[], sep: string) => arr.map(plain).filter(Boolean).join(sep)
  return [join([c.title1, c.title2, c.point], ' '), join([c.l1, c.l2], ', '), plain(c.l3)]
}

/** 음성이 없을 때 쓰는 대략적인 읽기 시간(초) */
export const estimateSeconds = (t: string) => {
  const s = plain(t)
  return s ? 0.3 + s.replace(/\s/g, '').length * 0.17 : 0
}

export type Cues = {
  /** 구간 A(제목) 음성 시작 */
  a0: number
  /** 말풍선 첫 줄·구간 B 음성 시작 */
  sB: number
  /** 말풍선 둘째 줄 등장 */
  l2: number
  /** 마무리 줄·구간 C 음성 시작 */
  sC: number
  /** 하트(장식) 등장 */
  heart: number
  /** 영상 전체 길이 */
  end: number
  /** 털복이가 말하는 구간들 [시작, 끝] */
  talk: [number, number][]
}

/** 구간별 음성 길이로 화면 등장 시각을 정한다. 문구가 길어지면 영상도 길어진다(최소 9초). */
export function makeCues(d: [number, number, number], c: TteolbokCopy): Cues {
  const n1 = plain(c.l1).length
  const n2 = plain(c.l2).length
  const a0 = 0.6
  const aEnd = a0 + d[0]
  const sB = Math.max(aEnd + 0.5, 3.2)
  const bEnd = sB + d[1]
  const l2 = n1 + n2 && d[1] ? sB + (d[1] * n1) / (n1 + n2) : sB + 0.8
  const sC = bEnd + 0.35
  const cEnd = sC + d[2]
  const end = Math.ceil(Math.max(cEnd + 2.4, 9) * 10) / 10
  return { a0, sB, l2, sC, heart: Math.max(cEnd - 0.6, sC + 0.4), end, talk: [[a0, aEnd], [sB, bEnd], [sC, cEnd]] }
}
