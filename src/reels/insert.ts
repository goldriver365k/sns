import type { ReelAsset, ReelProject } from './types'

/** 새 사진·영상을 넣는 방식: 선택한 장면의 사진을 바꾸기 / 자료 목록에만 넣기 */
export type InsertMode = 'replace' | 'library'

/**
 * 새로 넣은 자료를 프로젝트에 더한다.
 * - replace: 선택한 장면(targetId)에 첫 사진·영상을 넣고(있으면 교체), 여러 개면 그다음 장면들에 차례로 넣는다.
 * - library: 자료 목록에만 넣는다(장면은 그대로).
 * 로고는 넣으면 바로 표시 로고가 된다. 선택한 장면은 바꾸지 않는다.
 */
export function placeAssets(cur: ReelProject, added: ReelAsset[], targetId: string | null, mode: InsertMode) {
  const media = added.filter((a) => a.kind === 'media')
  const start = targetId ? cur.scenes.findIndex((s) => s.id === targetId) : -1
  const placed: { index: number; replaced: boolean }[] = []
  const scenes =
    mode === 'replace' && start >= 0
      ? cur.scenes.map((s, i) => {
          const m = media[i - start]
          if (i < start || !m) return s
          placed.push({ index: i, replaced: !!s.assetId })
          return { ...s, assetId: m.id }
        })
      : cur.scenes
  const logo = added.find((a) => a.kind === 'logo')
  return { patch: { assets: [...cur.assets, ...added], scenes, logoId: logo ? logo.id : cur.logoId }, placed }
}
