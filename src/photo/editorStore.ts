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
  /** 내 디자인 제목 */
  title: string
  /** 내 디자인에 저장된 뒤의 번호들 (처음 저장 전에는 없음) */
  designId?: string
  originalId?: string
  maskId?: string
  /** 이 디자인에 저장한 AI 배경: 화면 배경 id → 저장된 이미지 id */
  storedBgs?: Record<string, string>
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

const pad = (n: number) => String(n).padStart(2, '0')
/** 새 디자인 기본 제목: 상품 사진 11.02 14:30 */
export function defaultTitle(d = new Date()) {
  return `상품 사진 ${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 새 사진으로 편집 시작 (이전 사진 주소는 정리). preset은 홈 화면 도구가 정한 첫 설정.
 * 이미 배경을 지운 사진(여러 장 화면에서 열기)은 cutout을 넘겨 다시 지우지 않는다.
 */
export function openPhoto(original: PickedImage, tool: EditorTool, preset?: Partial<PhotoSettings>, cutout?: Cutout) {
  if (state.doc && state.doc.original.url !== original.url) releaseDoc()
  const design = freshDesign()
  setEditor({
    doc: { original, cutout: cutout ?? null, status: cutout ? 'done' : 'waiting', tool, title: defaultTitle() },
    design: { ...design, settings: { ...design.settings, ...preset } },
  })
}

/** 저장된 디자인을 연다 (사진·상품 모양·편집 내용을 그대로) */
export function openSaved(doc: EditorDoc, design: DesignState, bg: AiBackground | null) {
  releaseDoc()
  setEditor((s) => ({ doc, design, aiBgs: bg ? [bg, ...s.aiBgs.filter((b) => b.id !== bg.id)] : s.aiBgs }))
}

function releaseDoc() {
  // 여러 장 화면과 같은 사진 주소를 함께 쓸 수 있으니 blob 주소만, 지금 편집하던 것만 정리
  const url = state.doc?.original.url
  if (url?.startsWith('blob:') && !shared.has(url)) URL.revokeObjectURL(url)
}

/** 여러 장 화면이 계속 쓰는 사진 주소 (편집기가 지우면 안 됨) */
const shared = new Set<string>()
export const markShared = (url: string) => shared.add(url)

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
