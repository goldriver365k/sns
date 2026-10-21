import { useSyncExternalStore } from 'react'
import { releaseAsset, restoreAsset } from './assets'
import { deleteReelDoc, deleteReelImage, downloadReelImage, loadReelDoc, newProjectId, saveReelDoc, uploadReelImage, type ReelDoc } from './cloud'
import { askPersistentStorage, deleteFile, getFile, putFile } from './localFiles'
import { drawReelFrame, REEL_H, REEL_W } from './render'
import { blankScene, FIRST_HINT, freshProject, getProject, replaceProject, sceneTimes, subscribeProject, updateProject } from './store'
import type { ReelAsset, ReelAssetMeta, ReelProject } from './types'

/**
 * 릴스 프로젝트 자동 저장·불러오기
 * - 장면·설정은 Firestore `reelProjects`에 (어느 기기에서나 목록·편집 가능)
 * - 자료 원본 파일은 이 기기 브라우저 저장소(IndexedDB)에 — 무료
 * - 사진·로고·캐릭터는 Firestore `images`에도 올려 다른 기기에서도 보이게 한다. 영상은 이 기기에만 있다.
 */
export type SaveStatus = {
  state: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  savedAt: Date | null
  message: string | null
  /** 사진을 다른 기기용으로 올리지 못했을 때 안내 */
  warning: string | null
  loading: boolean
}

const DELAY = 1200
const LAST_KEY = 'snsroom.reels.lastProject'

let status: SaveStatus = { state: 'idle', savedAt: null, message: null, warning: null, loading: false }
const statusListeners = new Set<() => void>()
function setStatus(patch: Partial<SaveStatus>) {
  status = { ...status, ...patch }
  statusListeners.forEach((l) => l())
}

export function useSaveStatus() {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l)
      return () => statusListeners.delete(l)
    },
    () => status,
  )
}

/** 이 기기 저장소에 파일이 들어간 자료 id */
const stored = new Set<string>()
/** 다른 기기용으로 올리는 중인 사진 id */
const uploading = new Set<string>()
let lastSig = ''
let timer: ReturnType<typeof setTimeout> | null = null
let running: Promise<void> | null = null
let again = false

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id)
    else localStorage.removeItem(LAST_KEY)
  } catch {
    // 기억하지 못해도 내 프로젝트에서 열 수 있음
  }
}

function lastId() {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

const toMeta = ({ id, kind, type, name, width, height, duration, keyModel, cloud }: ReelAsset | ReelAssetMeta): ReelAssetMeta => ({
  id,
  kind,
  type,
  name,
  width,
  height,
  duration,
  keyModel,
  cloud,
})

function toDoc(p: ReelProject): Omit<ReelDoc, 'thumbnail'> {
  return {
    title: p.title,
    topic: p.topic,
    script: p.script,
    duration: p.duration,
    template: p.template,
    scenes: p.scenes,
    logoId: p.logoId,
    showProgress: p.showProgress,
    // 이 기기에 없는 자료도 정보는 남겨 둔다(다른 기기에서는 있을 수 있음)
    assets: [...p.assets.map(toMeta), ...p.missing],
  }
}

const signature = (p: ReelProject) => JSON.stringify(toDoc(p))
/** 이 기기 저장소에 아직 넣지 않은 파일이 있는지 (예: [다시 넣기]한 영상) */
const needsFiles = (p: ReelProject) => p.assets.some((a) => !stored.has(a.id))

/** 아무것도 손대지 않은 새 프로젝트는 저장하지 않는다 */
function isPristine(p: ReelProject) {
  return (
    !p.id &&
    !p.assets.length &&
    !p.missing.length &&
    !p.script.trim() &&
    !p.topic.trim() &&
    p.title === '새 릴스' &&
    p.scenes.length === 1 &&
    p.scenes[0].text === FIRST_HINT
  )
}

let thumbCanvas: HTMLCanvasElement | null = null
function makeThumbnail(p: ReelProject) {
  try {
    thumbCanvas ??= Object.assign(document.createElement('canvas'), { width: REEL_W, height: REEL_H })
    const first = sceneTimes(p)[0]
    drawReelFrame(thumbCanvas.getContext('2d')!, p, Math.min(1.2, (first?.len ?? 1) * 0.7))
    const small = Object.assign(document.createElement('canvas'), { width: 216, height: 384 })
    small.getContext('2d')!.drawImage(thumbCanvas, 0, 0, 216, 384)
    return small.toDataURL('image/jpeg', 0.7)
  } catch {
    return ''
  }
}

/** 사진을 다른 기기용(Firestore)으로 올린다 — 저장을 막지 않고 뒤에서 진행 */
function uploadForOtherDevices(a: ReelAsset, blob: Blob) {
  if (a.type !== 'image' || a.cloud || uploading.has(a.id)) return
  uploading.add(a.id)
  uploadReelImage(a.id, blob, a.el as HTMLImageElement)
    .then(() => {
      setStatus({ warning: null })
      updateProject((cur) => ({ assets: cur.assets.map((x) => (x.id === a.id ? { ...x, cloud: true } : x)) }))
    })
    .catch((e) => setStatus({ warning: e instanceof Error ? e.message : '사진을 다른 기기용으로 올리지 못했습니다(이 기기에는 저장됨).' }))
    .finally(() => uploading.delete(a.id))
}

async function saveOnce() {
  let p = getProject()
  if (isPristine(p)) return
  const sig = signature(p)
  const isNew = !p.id
  if (!isNew && sig === lastSig && !needsFiles(p)) return
  setStatus({ state: 'saving', message: null })
  if (!p.id) {
    updateProject({ id: newProjectId() })
    p = getProject()
  }
  const id = p.id!
  try {
    for (const a of p.assets) {
      let blob: Blob | null = null
      if (!stored.has(a.id)) {
        blob = await (await fetch(a.url)).blob()
        await putFile(a.id, blob)
        stored.add(a.id)
      }
      if (a.type === 'image' && !a.cloud && !uploading.has(a.id)) {
        uploadForOtherDevices(a, blob ?? (await (await fetch(a.url)).blob()))
      }
    }
    await saveReelDoc(id, { ...toDoc(p), thumbnail: makeThumbnail(p) }, isNew)
    if (getProject().id === id) {
      lastSig = sig
      remember(id)
    }
    setStatus({ state: 'saved', savedAt: new Date(), message: null })
  } catch (e) {
    setStatus({ state: 'error', message: e instanceof Error ? e.message : '저장하지 못했습니다. 네트워크를 확인해 주세요.' })
  }
}

/** 지금 바로 저장 (대기 중인 저장이 있으면 끝날 때까지 기다림) */
export async function saveNow() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (running) {
    again = true
    await running
    return
  }
  running = saveOnce().finally(() => {
    running = null
  })
  await running
  if (again) {
    again = false
    await saveNow()
  }
}

function onChange() {
  const p = getProject()
  if (status.loading || isPristine(p) || (signature(p) === lastSig && !needsFiles(p))) return
  if (status.state !== 'saving') setStatus({ state: 'pending' })
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void saveNow()
  }, DELAY)
}

let users = 0
let unsubscribe: (() => void) | null = null

function beforeUnload(e: BeforeUnloadEvent) {
  if (status.state === 'pending' || status.state === 'saving') e.preventDefault()
}

/** 릴스 화면에 들어오면 자동 저장을 켠다. 지난번 작업이 있으면 다시 연다. */
export function startAutosave() {
  if (users++ === 0) {
    unsubscribe = subscribeProject(onChange)
    window.addEventListener('beforeunload', beforeUnload)
    askPersistentStorage()
    const last = lastId()
    const p = getProject()
    if (last && !p.id && isPristine(p) && !status.loading) void openProject(last).catch(() => remember(null))
  }
  return () => {
    if (--users === 0) {
      unsubscribe?.()
      unsubscribe = null
      window.removeEventListener('beforeunload', beforeUnload)
      void saveNow()
    }
  }
}

function releaseCurrent() {
  getProject().assets.forEach(releaseAsset)
}

/** 저장된 프로젝트를 열어 편집 화면에 올린다 */
export async function openProject(id: string) {
  setStatus({ loading: true, message: null })
  try {
    await saveNow()
    const d = await loadReelDoc(id)
    if (!d) throw new Error('프로젝트를 찾지 못했습니다. 지워졌을 수 있습니다.')
    const assets: ReelAsset[] = []
    const missing: ReelAssetMeta[] = []
    for (const meta of d.assets ?? []) {
      let blob = await getFile(meta.id)
      if (!blob && meta.type === 'image') {
        blob = await downloadReelImage(meta.id)
        if (blob) await putFile(meta.id, blob).catch(() => undefined)
      }
      if (!blob) {
        missing.push(toMeta(meta))
        continue
      }
      try {
        assets.push(await restoreAsset(toMeta(meta), blob))
        stored.add(meta.id)
      } catch {
        missing.push(toMeta(meta))
      }
    }
    const next: ReelProject = {
      id,
      title: d.title ?? '새 릴스',
      topic: d.topic ?? '',
      script: d.script ?? '',
      duration: d.duration ?? 15,
      template: d.template ?? 'clean',
      scenes: d.scenes?.length ? d.scenes.map((s) => ({ ...blankScene(), ...s })) : [blankScene('')],
      logoId: d.logoId ?? null,
      showProgress: d.showProgress ?? true,
      assets,
      missing,
    }
    releaseCurrent()
    lastSig = signature(next)
    replaceProject(next)
    remember(id)
    setStatus({ state: 'saved', savedAt: null, message: null, warning: null })
  } finally {
    setStatus({ loading: false })
  }
}

/** 새 프로젝트 시작 (지금 프로젝트는 저장해 둔다) */
export async function newProject() {
  await saveNow()
  releaseCurrent()
  lastSig = ''
  replaceProject(freshProject())
  remember(null)
  setStatus({ state: 'idle', savedAt: null, message: null, warning: null })
}

/** 프로젝트와 그 자료 파일을 지운다 */
export async function deleteProject(id: string, assetIds: string[]) {
  if (getProject().id === id) {
    if (timer) clearTimeout(timer)
    timer = null
    if (running) await running
    releaseCurrent()
    lastSig = ''
    replaceProject(freshProject())
    remember(null)
    setStatus({ state: 'idle', savedAt: null, message: null, warning: null })
  }
  await deleteReelDoc(id)
  await Promise.all(assetIds.map((a) => Promise.all([deleteFile(a), deleteReelImage(a)])))
  assetIds.forEach((a) => stored.delete(a))
}

/** 자료를 뺄 때 저장된 파일도 지운다 */
export function forgetAssetFiles(id: string) {
  stored.delete(id)
  void deleteFile(id)
  void deleteReelImage(id)
}
