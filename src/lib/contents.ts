import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
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

/** Firestore에 저장된 콘텐츠 1건 */
export type StoredContent = NewContent & {
  id: string
  date: string
  source: 'manual' | 'auto'
  status: 'draft' | 'approved' | 'archived'
  createdAtMs: number
}

function toContent(d: QueryDocumentSnapshot): StoredContent {
  const x = d.data()
  return {
    id: d.id,
    date: x.date ?? '',
    source: x.source ?? 'manual',
    status: x.status ?? 'draft',
    channelId: x.channelId ?? null,
    brandName: x.brandName ?? '',
    snsType: x.snsType ?? '',
    topic: x.topic ?? '',
    fixedHashtags: x.fixedHashtags ?? [],
    input: x.input ?? { content: '', instructions: '', languages: [] },
    posts: x.posts ?? [],
    createdAtMs: x.createdAt?.toMillis?.() ?? 0,
  }
}

const newestFirst = (a: StoredContent, b: StoredContent) => b.createdAtMs - a.createdAtMs

/** 최근 콘텐츠 (더 보기: 마지막 문서를 cursor로 넘긴다) */
export async function listRecent(pageSize: number, cursor?: QueryDocumentSnapshot) {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  const q = cursor
    ? query(collection(db, 'contents'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(collection(db, 'contents'), orderBy('createdAt', 'desc'), limit(pageSize))
  const snap = await getDocs(q)
  return { items: snap.docs.map(toContent), cursor: snap.docs[snap.docs.length - 1], done: snap.docs.length < pageSize }
}

/** 날짜 범위(yyyy-mm-dd, 양 끝 포함)의 콘텐츠 — 날짜 한 칸 조건이라 별도 색인이 필요 없다 */
export async function listByDateRange(from: string, to: string) {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  const snap = await getDocs(query(collection(db, 'contents'), where('date', '>=', from), where('date', '<=', to)))
  return snap.docs.map(toContent).sort(newestFirst)
}

export async function deleteContent(id: string) {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  await deleteDoc(doc(db, 'contents', id))
}
