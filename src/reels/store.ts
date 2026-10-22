import { useSyncExternalStore } from 'react'
import type { ReelAudio, ReelDuration, ReelProject, ReelScene } from './types'

/**
 * 지금 편집 중인 릴스 프로젝트 상태 (메뉴 탭을 옮겨 다녀도 유지).
 * 저장·불러오기는 persist.ts가 맡는다.
 */
export const newSceneId = () => Math.random().toString(36).slice(2, 10)

export function blankScene(text = ''): ReelScene {
  return { id: newSceneId(), text, weight: 1, assetId: null, characterId: null, motion: 'zoomIn', subtitleAnim: 'pop', effects: [], priceText: '', ctaText: '' }
}

export const defaultAudio = (): ReelAudio => ({
  voiceOn: false,
  voice: 'coral',
  style: 'bright',
  speed: 1,
  music: 'none',
  musicFile: null,
  musicVolume: 0.5,
  ducking: true,
})

export const FIRST_HINT = '주제를 입력하거나 대본을 붙여넣고\n[장면 나누기]를 눌러 보세요'

export const freshProject = (): ReelProject => ({
  id: null,
  title: '새 릴스',
  brandId: null,
  topic: '',
  script: '',
  duration: 15 as ReelDuration,
  template: 'clean',
  scenes: [blankScene(FIRST_HINT)],
  assets: [],
  logoId: null,
  showProgress: true,
  audio: defaultAudio(),
  caption: '',
  missing: [],
})

let state: ReelProject = freshProject()
const listeners = new Set<() => void>()

export function getProject() {
  return state
}

export function updateProject(patch: Partial<ReelProject> | ((p: ReelProject) => Partial<ReelProject>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach((l) => l())
}

/** 프로젝트를 통째로 바꾼다 (불러오기·새 프로젝트) */
export function replaceProject(next: ReelProject) {
  state = next
  listeners.forEach((l) => l())
}

export function subscribeProject(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useReelProject() {
  return useSyncExternalStore(subscribeProject, () => state)
}

/** 장면별 실제 시작·길이(초) — 비율(weight)을 전체 길이에 맞춰 나눈다 */
export function sceneTimes(p: Pick<ReelProject, 'scenes' | 'duration'>) {
  const total = p.scenes.reduce((s, x) => s + x.weight, 0) || 1
  let start = 0
  return p.scenes.map((s) => {
    const len = (s.weight / total) * p.duration
    const r = { start, len }
    start += len
    return r
  })
}
