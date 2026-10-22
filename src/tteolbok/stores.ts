import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/firebase'
import { useChannels } from '../lib/channels'
import { bareDomain, brandSite } from '../../shared/site'

/** 영상 하단에 나오는 상호. Firestore `settings/tteolbok` 의 `stores[]` */
export type TteolbokStore = {
  id: string
  name: string
  /** 위치 (예: 모인관 2층). 비워 두면 상호만 나온다 */
  loc: string
  /** 상호 띠 배경·글자색. 비워 두면 디자인 기본색 */
  bg: string
  fg: string
}

/** 처음 쓸 때의 기본 상호. 이후에는 화면의 [상호 관리]에서 수정한다. */
export const DEFAULT_STORES: TteolbokStore[] = [
  { id: 'hururuk', name: '후루룩찹찹', loc: '모인관 2층', bg: '#4A2C22', fg: '#F2B632' },
  { id: 'babsim', name: '밥심', loc: '', bg: '', fg: '' },
  { id: 'mankwon', name: '만권화밥', loc: '', bg: '', fg: '' },
  { id: 'dukkubi', name: '두꺼비 종합분식', loc: '', bg: '', fg: '' },
  { id: 'bulbaek', name: '화산불백', loc: '', bg: '', fg: '' },
]

const ref = () => (db ? doc(db, 'settings', 'tteolbok') : null)

export async function loadStores(): Promise<TteolbokStore[]> {
  const r = ref()
  if (!r) return DEFAULT_STORES
  const snap = await getDoc(r)
  const list = snap.exists() ? (snap.data().stores as TteolbokStore[] | undefined) : undefined
  return Array.isArray(list) ? list.map(normalize) : DEFAULT_STORES
}

export async function saveStores(stores: TteolbokStore[]) {
  const r = ref()
  if (!r) throw new Error('저장소에 연결되지 않았습니다.')
  await setDoc(r, { stores: stores.map(normalize), updatedAt: Date.now() }, { merge: true })
}

const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '')

function normalize(s: Partial<TteolbokStore>): TteolbokStore {
  return {
    id: String(s.id || Math.random().toString(36).slice(2, 10)),
    name: String(s.name ?? '').slice(0, 30),
    loc: String(s.loc ?? '').slice(0, 30),
    bg: color(s.bg),
    fg: color(s.fg),
  }
}

export const newStore = (): TteolbokStore => ({ id: Math.random().toString(36).slice(2, 10), name: '', loc: '', bg: '', fg: '' })

/**
 * 영상 하단 상호 = SNS 게시물 만들기의 브랜드(운영 설정 → 브랜드 관리).
 * 위치 칸에는 브랜드 사이트 주소를 넣고, 예전 상호 설정에 같은 이름이 있으면 그 색을 이어 쓴다.
 */
export function useBrandStores(): TteolbokStore[] {
  const { channels } = useChannels()
  const [old, setOld] = useState<TteolbokStore[]>(DEFAULT_STORES)
  useEffect(() => {
    loadStores().then(setOld).catch(() => undefined)
  }, [])
  return useMemo(
    () =>
      channels.map((c) => {
        const prev = old.find((s) => s.name.replace(/\s/g, '') === c.name.replace(/\s/g, ''))
        const site = bareDomain(brandSite(c.name, c.siteUrl))
        return { id: c.id, name: c.name, loc: site || prev?.loc || '', bg: prev?.bg ?? '', fg: prev?.fg ?? '' }
      }),
    [channels, old],
  )
}
