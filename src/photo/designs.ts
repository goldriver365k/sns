import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { PhotoSettings, ProductTransform, TextLayer } from './compose'
import type { Cutout } from './removeBg'

/**
 * 내 디자인: 상품 사진 편집기 작업을 Firestore에 보관하고 다시 연다(다른 기기에서도).
 * - `photoDesigns/{id}`: 설정·상품 위치·글자·제목·목록용 작은 미리보기
 * - `images/{id}`: 원본 사진(JPEG, 긴 변 1600px 이하) · 배경 제거 마스크(흑백 PNG) · AI 배경(JPEG)
 *   문서 1개 1MB 제한에 맞춰 900KB 이하로 줄인다. 배경을 지운 상품은 원본 + 마스크로 다시 만든다
 *   → 다시 열 때 배경 제거 AI를 또 돌리지 않는다.
 */
const COL = 'photoDesigns'
const MAX_CHARS = 900_000
const MAX_SIDE = 1600

export type SavedDesign = {
  title: string
  originalId: string
  maskId: string
  /** AI 배경을 썼으면 그 이미지 */
  /** kind: ai(AI가 만든 배경) / image(사용자가 올린 사진) — 예전 저장분은 없으면 ai */
  aiBg: { id: string; prompt: string; kind?: 'ai' | 'image' } | null
  settings: PhotoSettings
  transform: ProductTransform
  texts: TextLayer[]
  /** 목록용 작은 미리보기 (JPEG data URL) */
  thumbnail: string
}

export type DesignListItem = SavedDesign & { id: string; updatedAt: Date | null }

function store() {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  return db
}

export const newDesignId = () => doc(collection(store(), COL)).id
export const newImageId = () => doc(collection(store(), 'images')).id

/** 이미지를 긴 변 maxSide 이하 캔버스로 */
function scaled(src: CanvasImageSource, w: number, h: number, maxSide = MAX_SIDE) {
  const k = Math.min(1, maxSide / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** 900KB 안에 들도록 JPEG 품질·크기를 낮춰 가며 만든다 */
function jpegUnderLimit(src: CanvasImageSource, w: number, h: number) {
  for (const side of [MAX_SIDE, 1200, 900]) {
    const c = scaled(src, w, h, side)
    for (let q = 0.88; q >= 0.5; q -= 0.1) {
      const url = c.toDataURL('image/jpeg', q)
      if (url.length <= MAX_CHARS) return { url, width: c.width, height: c.height }
    }
  }
  throw new Error('사진이 너무 커서 저장하지 못했습니다.')
}

async function putImage(id: string, data: string, width: number, height: number, source: string) {
  await setDoc(doc(store(), 'images', id), { data, width, height, source, createdAt: serverTimestamp() })
}

/** 원본 사진 저장 */
export async function saveOriginal(id: string, el: HTMLImageElement) {
  const { url, width, height } = jpegUnderLimit(el, el.naturalWidth, el.naturalHeight)
  await putImage(id, url, width, height, 'photo')
}

/** AI 배경 저장 */
export async function saveAiBackground(id: string, el: HTMLImageElement) {
  const { url, width, height } = jpegUnderLimit(el, el.naturalWidth, el.naturalHeight)
  await putImage(id, url, width, height, 'photo-aibg')
}

/** 배경 제거 결과를 원본 크기의 흑백 마스크(상품=흰색)로 저장 */
export async function saveMask(id: string, cutout: Cutout, originalW: number, originalH: number) {
  // 상품 모양만 흰색으로
  const white = document.createElement('canvas')
  white.width = cutout.canvas.width
  white.height = cutout.canvas.height
  const wctx = white.getContext('2d')!
  wctx.drawImage(cutout.canvas, 0, 0)
  wctx.globalCompositeOperation = 'source-in'
  wctx.fillStyle = '#fff'
  wctx.fillRect(0, 0, white.width, white.height)
  // 검은 바탕의 원본 크기 위 같은 자리에
  const full = document.createElement('canvas')
  full.width = originalW
  full.height = originalH
  const fctx = full.getContext('2d')!
  fctx.fillStyle = '#000'
  fctx.fillRect(0, 0, originalW, originalH)
  fctx.drawImage(white, cutout.x, cutout.y)
  for (const side of [MAX_SIDE, 1200, 900, 700]) {
    const c = scaled(full, originalW, originalH, side)
    const url = c.toDataURL('image/png')
    if (url.length <= MAX_CHARS) return putImage(id, url, c.width, c.height, 'photo-mask')
  }
  throw new Error('배경 제거 결과가 너무 커서 저장하지 못했습니다.')
}

export async function saveDesignDoc(id: string, data: SavedDesign, isNew: boolean) {
  await setDoc(doc(store(), COL, id), { ...data, updatedAt: serverTimestamp(), ...(isNew ? { createdAt: serverTimestamp() } : {}) }, { merge: true })
}

export async function listDesigns(): Promise<DesignListItem[]> {
  const snap = await getDocs(query(collection(store(), COL), orderBy('updatedAt', 'desc'), limit(60)))
  return snap.docs.map((d) => {
    const data = d.data() as SavedDesign & { updatedAt?: Timestamp }
    return { ...data, id: d.id, updatedAt: data.updatedAt?.toDate?.() ?? null }
  })
}

export async function loadDesignDoc(id: string): Promise<SavedDesign | null> {
  const snap = await getDoc(doc(store(), COL, id))
  return snap.exists() ? (snap.data() as SavedDesign) : null
}

export function loadEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
    el.src = src
  })
}

export async function loadImage(id: string): Promise<HTMLImageElement | null> {
  try {
    const data = (await getDoc(doc(store(), 'images', id))).data()?.data as string | undefined
    return data ? await loadEl(data) : null
  } catch {
    return null
  }
}

/** 원본과 마스크로 배경을 지운 상품을 다시 만든다(투명한 여백은 잘라 냄) */
export function cutoutFromMask(original: HTMLImageElement, mask: HTMLImageElement): Cutout {
  const w = original.naturalWidth
  const h = original.naturalHeight
  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  const ctx = full.getContext('2d')!
  ctx.drawImage(original, 0, 0)
  const img = ctx.getImageData(0, 0, w, h)
  const m = document.createElement('canvas')
  m.width = w
  m.height = h
  const mctx = m.getContext('2d')!
  mctx.imageSmoothingQuality = 'high'
  mctx.drawImage(mask, 0, 0, w, h)
  const md = mctx.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = md[i] < 10 ? 0 : md[i] > 245 ? 255 : md[i]
      img.data[i + 3] = a
      if (!a) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) throw new Error('저장된 상품 모양을 읽지 못했습니다.')
  ctx.putImageData(img, 0, 0)
  const canvas = document.createElement('canvas')
  canvas.width = maxX - minX + 1
  canvas.height = maxY - minY + 1
  canvas.getContext('2d')!.drawImage(full, minX, minY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
  return { canvas, x: minX, y: minY }
}

export async function deleteImage(id: string) {
  await deleteDoc(doc(store(), 'images', id)).catch(() => null)
}

/** 디자인과 그 이미지들을 지운다 */
export async function deleteDesign(item: Pick<DesignListItem, 'id' | 'originalId' | 'maskId' | 'aiBg'>) {
  await deleteDoc(doc(store(), COL, item.id))
  for (const id of [item.originalId, item.maskId, item.aiBg?.id]) {
    if (!id) continue
    await deleteDoc(doc(store(), 'images', id)).catch(() => null)
  }
}
