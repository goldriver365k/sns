import { useSyncExternalStore } from 'react'
import type { ReelDuration, ReelProject, ReelScene } from './types'

/**
 * 릴스 프로젝트 상태 (메뉴 탭을 옮겨 다녀도 유지).
 * 지금은 이 브라우저 안에서만 유지되며 새로고침하면 사라진다 — 프로젝트 저장은 다음 단계.
 */
export const newSceneId = () => Math.random().toString(36).slice(2, 10)

export function blankScene(text = ''): ReelScene {
  return { id: newSceneId(), text, weight: 1, assetId: null, characterId: null, motion: 'zoomIn', subtitleAnim: 'pop', effects: [], priceText: '', ctaText: '' }
}

const initial: ReelProject = {
  title: '새 릴스',
  topic: '',
  script: '',
  duration: 15 as ReelDuration,
  template: 'clean',
  scenes: [blankScene('주제를 입력하거나 대본을 붙여넣고\n[장면 나누기]를 눌러 보세요')],
  assets: [],
  logoId: null,
  showProgress: true,
}

let state: ReelProject = initial
const listeners = new Set<() => void>()

export function getProject() {
  return state
}

export function updateProject(patch: Partial<ReelProject> | ((p: ReelProject) => Partial<ReelProject>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach((l) => l())
}

export function useReelProject() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
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
