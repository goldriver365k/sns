import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ReelAssetMeta, ReelProject } from './types'

/**
 * Firestore 저장
 * - `reelProjects/{id}`: 장면·설정·자료 정보·미리보기 그림
 * - `images/{자료 id}`: 사진·로고·캐릭터 (다른 기기에서도 보이게). 영상은 크기 때문에 저장하지 않음(이 기기 저장소만).
 */
export type ReelDoc = Omit<ReelProject, 'id' | 'assets' | 'missing'> & {
  assets: ReelAssetMeta[]
  /** 목록용 작은 미리보기 (JPEG data URL) */
  thumbnail: string
}

export type ReelListItem = ReelDoc & { id: string; updatedAt: Date | null }

const COL = 'reelProjects'
const MAX_CHARS = 900_000

function store() {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  return db
}

export function newProjectId() {
  return doc(collection(store(), COL)).id
}

export async function saveReelDoc(id: string, data: ReelDoc, isNew: boolean) {
  await setDoc(doc(store(), COL, id), { ...data, updatedAt: serverTimestamp(), ...(isNew ? { createdAt: serverTimestamp() } : {}) }, { merge: true })
}

export async function loadReelDoc(id: string): Promise<ReelDoc | null> {
  const snap = await getDoc(doc(store(), COL, id))
  return snap.exists() ? (snap.data() as ReelDoc) : null
}

export async function listReelDocs(): Promise<ReelListItem[]> {
  const snap = await getDocs(query(collection(store(), COL), orderBy('updatedAt', 'desc'), limit(60)))
  return snap.docs.map((d) => {
    const data = d.data() as ReelDoc & { updatedAt?: Timestamp }
    return { ...data, id: d.id, updatedAt: data.updatedAt?.toDate?.() ?? null }
  })
}

export async function deleteReelDoc(id: string) {
  await deleteDoc(doc(store(), COL, id))
}

function canvasFor(el: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(el.naturalWidth, el.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(el.naturalWidth * scale))
  c.height = Math.max(1, Math.round(el.naturalHeight * scale))
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height)
  return c
}

/** 사진을 1MB 문서 제한에 맞춰 줄여 저장한다. 투명 배경(PNG)은 PNG 그대로 크기만 줄인다. */
export async function uploadReelImage(id: string, blob: Blob, el: HTMLImageElement) {
  let data: string | null = null
  if (blob.type === 'image/png') {
    for (const side of [1600, 1200, 900, 700]) {
      const url = canvasFor(el, side).toDataURL('image/png')
      if (url.length <= MAX_CHARS) {
        data = url
        break
      }
    }
  } else {
    const c = canvasFor(el, 1600)
    for (let q = 0.85; q >= 0.4 && !data; q -= 0.1) {
      const url = c.toDataURL('image/jpeg', q)
      if (url.length <= MAX_CHARS) data = url
    }
  }
  if (!data) throw new Error('사진이 너무 커서 다른 기기용으로 저장하지 못했습니다(이 기기에는 저장됨).')
  await setDoc(doc(store(), 'images', id), { data, width: el.naturalWidth, height: el.naturalHeight, source: 'reel', createdAt: serverTimestamp() })
}

export async function downloadReelImage(id: string): Promise<Blob | null> {
  try {
    const snap = await getDoc(doc(store(), 'images', id))
    const data = snap.data()?.data as string | undefined
    return data ? await (await fetch(data)).blob() : null
  } catch {
    return null
  }
}

export async function deleteReelImage(id: string) {
  try {
    await deleteDoc(doc(store(), 'images', id))
  } catch {
    // 남아도 화면에는 영향 없음
  }
}
