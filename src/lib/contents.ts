import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { GeneratedPost } from '../../shared/generate'

/** 언어별 생성 결과 (Firestore contents 문서의 posts[] 한 칸) */
export type StoredPost = GeneratedPost & { language: string }

export type NewContent = {
  channelId: string | null
  brandName: string
  snsType: string
  topic: string
  fixedHashtags: string[]
  input: { content: string; instructions: string; languages: string[] }
  posts: StoredPost[]
}

/** 한국시간 기준 오늘 날짜 (yyyy-mm-dd) */
export function todayKst() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export function newContentId() {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  return doc(collection(db, 'contents')).id
}

/** 수동 생성 결과를 저장한다. 오프라인이어도 연결되면 자동 저장된다. */
export async function saveContent(id: string, c: NewContent) {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  await setDoc(doc(db, 'contents', id), {
    ...c,
    date: todayKst(),
    source: 'manual',
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateContent(id: string, patch: { posts?: StoredPost[]; status?: 'draft' | 'approved' | 'archived' }) {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  await updateDoc(doc(db, 'contents', id), { ...patch, updatedAt: serverTimestamp() })
}
