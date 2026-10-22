import { blankScene } from './store'
import type { ReelScriptScene } from '../../shared/reelScript'
import type { ReelAsset, ReelScene } from './types'

/**
 * 대본을 장면으로 나눈다(AI 없이 동작하는 기본 기능).
 * 줄바꿈이 있으면 줄 단위, 한 문단이면 문장 단위로 나누고, 너무 긴 장면은 다시 나눈다.
 * 글 길이에 비례해 장면 길이 비율을 정하고, 사진·영상을 순서대로 하나씩 배정한다.
 */
export function splitScript(script: string, media: ReelAsset[], maxScenes: number): ReelScene[] {
  const text = script.replace(/\r/g, '').trim()
  if (!text) return []
  let parts = text.includes('\n')
    ? text.split(/\n+/)
    : text.split(/(?<=[.!?。！？])\s+|(?<=다\.)\s*|(?<=요\.)\s*/)
  parts = parts.map((s) => s.trim()).filter(Boolean)
  // 한 장면 자막이 너무 길면(40자 초과) 쉼표·공백 기준으로 반으로 나눈다
  parts = parts.flatMap((s) => (s.length > 40 ? halve(s) : [s]))
  // 장면이 너무 많으면 이웃끼리 합친다
  while (parts.length > maxScenes) {
    let best = 0
    for (let i = 1; i < parts.length - 1; i++) if (parts[i].length + parts[i + 1].length < parts[best].length + parts[best + 1].length) best = i
    parts.splice(best, 2, `${parts[best]} ${parts[best + 1]}`)
  }
  const motions: ReelScene['motion'][] = ['zoomIn', 'panLeft', 'zoomOut', 'panRight']
  const anims: ReelScene['subtitleAnim'][] = ['pop', 'slideUp', 'typewriter', 'fade']
  return parts.map((t, i) => ({
    ...blankScene(t),
    weight: Math.max(1, Math.round(t.length / 8)),
    assetId: media.length ? media[i % media.length].id : null,
    motion: motions[i % motions.length],
    subtitleAnim: anims[i % anims.length],
  }))
}

function halve(s: string): string[] {
  const mid = Math.floor(s.length / 2)
  let cut = -1
  for (let d = 0; d < mid; d++) {
    for (const i of [mid - d, mid + d]) if (/[,，、\s]/.test(s[i] ?? '')) { cut = i; break }
    if (cut >= 0) break
  }
  if (cut < 0) cut = mid
  return [s.slice(0, cut + 1).trim(), s.slice(cut + 1).trim()].filter(Boolean)
}

/** 영상 길이에 맞는 최대 장면 수 (장면당 최소 약 1.5초) */
export const maxScenesFor = (duration: number) => Math.max(3, Math.min(20, Math.floor(duration / 1.5)))

/** AI가 만든 장면을 릴스 장면으로 바꾼다 (사진·영상은 순서대로 배정, 움직임·자막 효과는 돌아가며) */
export function scenesFromAi(list: ReelScriptScene[], media: ReelAsset[]): ReelScene[] {
  const motions: ReelScene['motion'][] = ['zoomIn', 'panLeft', 'zoomOut', 'panRight']
  const anims: ReelScene['subtitleAnim'][] = ['pop', 'slideUp', 'typewriter', 'fade']
  return list.map((s, i) => ({
    ...blankScene(s.text),
    weight: Math.min(12, Math.max(1, Math.round(s.seconds))),
    assetId: media.length ? media[i % media.length].id : null,
    motion: motions[i % motions.length],
    subtitleAnim: anims[i % anims.length],
    effects: s.effect === 'none' ? [] : [s.effect],
    priceText: s.priceText,
    ctaText: s.ctaText,
  }))
}
