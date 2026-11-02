import { useSyncExternalStore } from 'react'
import type { AiBackground } from '../components/AiBgPanel'
import type { PickedImage } from '../lib/images'
import { DEFAULT_SETTINGS, NO_TRANSFORM, type PhotoSettings, type ProductTransform, type TextLayer } from './compose'
import type { Cutout } from './removeBg'

/**
 * 상품 사진 편집기(1장 편집)의 지금 작업. 홈 화면에서 사진을 고르면 여기 넣고 편집기를 연다.
 * 메뉴를 옮겨 다녀도 유지되고, 새로고침하면 사라진다(작업 보관은 다음 단계 "내 디자인").
 */
export type EditorTool = 'background' | 'shadow' | 'size' | 'text' | 'video'

/** 실행 취소 단위가 되는 편집 내용 */
export type DesignState = {
  settings: PhotoSettings
  transform: ProductTransform
  texts: TextLayer[]
  aiBgId: string | null
}

export type EditorDoc = {
  original: PickedImage
  cutout: Cutout | null
  status: 'waiting' | 'working' | 'done' | 'error'
  error?: string
  /** 처음 열 도구 */
  tool: EditorTool
}

const SETTINGS_KEY = 'snsroom.photo.editor.settings'

function savedSettings(): PhotoSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function rememberSettings(s: PhotoSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // 저장이 막혀도 이번 작업에서는 그대로 쓴다
  }
}

/** 새 사진의 첫 편집 내용: 마지막에 쓴 배경·크기 설정은 이어 쓰고 위치·글자는 새로 */
export const freshDesign = (): DesignState => ({ settings: savedSettings(), transform: NO_TRANSFORM, texts: [], aiBgId: null })

type State = { doc: EditorDoc | null; design: DesignState; aiBgs: AiBackground[] }

let state: State = { doc: null, design: freshDesign(), aiBgs: [] }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function getEditor() {
  return state
}

export function setEditor(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  emit()
}

export function patchDoc(patch: Partial<EditorDoc>) {
  if (state.doc) setEditor({ doc: { ...state.doc, ...patch } })
}

/** 새 사진으로 편집 시작 (이전 사진 주소는 정리). preset은 홈 화면 도구가 정한 첫 설정 */
export function openPhoto(original: PickedImage, tool: EditorTool, preset?: Partial<PhotoSettings>) {
  if (state.doc && state.doc.original.url !== original.url) URL.revokeObjectURL(state.doc.original.url)
  const design = freshDesign()
  setEditor({ doc: { original, cutout: null, status: 'waiting', tool }, design: { ...design, settings: { ...design.settings, ...preset } } })
}

export function useEditor() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
  )
}
