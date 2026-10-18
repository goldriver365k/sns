import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import PageHeader from '../components/PageHeader'
import ContentItem from '../components/ContentItem'
import { inputBase } from '../components/ui'
import { listByDateRange, listRecent, type StoredContent } from '../lib/contents'
import { useChannels } from '../lib/channels'
import { SNS_TYPES } from '../lib/options'

const PAGE = 30

/** 지난 콘텐츠: 최근 순으로 보거나 날짜를 골라 보고, 브랜드·SNS로 거른다 */
export default function PastContents() {
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? ''
  const { channels } = useChannels()
  const [items, setItems] = useState<StoredContent[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | undefined>()
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [brand, setBrand] = useState('')
  const [sns, setSns] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const load = date ? listByDateRange(date, date).then((list) => ({ items: list, cursor: undefined, done: true })) : listRecent(PAGE)
    load
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setCursor(r.cursor)
        setDone(r.done)
      })
      .catch(() => alive && setError('콘텐츠를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [date])

  async function more() {
    setLoading(true)
    try {
      const r = await listRecent(PAGE, cursor)
      setItems((prev) => [...prev, ...r.items])
      setCursor(r.cursor)
      setDone(r.done)
    } catch {
      setError('더 불러오지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  const shown = useMemo(
    () => items.filter((i) => (!brand || (brand === '-' ? !i.channelId : i.channelId === brand)) && (!sns || i.snsType === sns)),
    [items, brand, sns],
  )

  // 날짜별 묶음
  const groups = useMemo(() => {
    const map = new Map<string, StoredContent[]>()
    for (const i of shown) map.set(i.date, [...(map.get(i.date) ?? []), i])
    return [...map.entries()]
  }, [shown])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="지난 콘텐츠" description="만든 게시물을 날짜별로 다시 보고, 복사하고, 고칠 수 있습니다." />

      <div className="mb-6 grid gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:grid-cols-3">
        <label className="text-sm text-muted">
          날짜
          <div className="mt-1 flex gap-2">
            <input type="date" value={date} onChange={(e) => setParams(e.target.value ? { date: e.target.value } : {})} className={`${inputBase} py-2`} />
            {date && <button onClick={() => setParams({})} className="shrink-0 text-sm text-forest-700 hover:underline">전체</button>}
          </div>
        </label>
        <label className="text-sm text-muted">
          브랜드
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={`${inputBase} mt-1 py-2`}>
            <option value="">전체</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="-">브랜드 없음</option>
          </select>
        </label>
        <label className="text-sm text-muted">
          SNS
          <select value={sns} onChange={(e) => setSns(e.target.value)} className={`${inputBase} mt-1 py-2`}>
            <option value="">전체</option>
            {SNS_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {groups.map(([d, list]) => (
        <section key={d} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-forest-900">
            {d} <span className="font-normal text-muted">· {list.length}개</span>
          </h2>
          <ul className="space-y-2">
            {list.map((item) => (
              <ContentItem key={item.id} item={item} channels={channels} onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))} />
            ))}
          </ul>
        </section>
      ))}

      {!loading && !error && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-8 text-center text-muted">
          {date ? `${date}에 만든 콘텐츠가 없습니다.` : '아직 만든 콘텐츠가 없습니다. "SNS 게시물 만들기"에서 만들어 보세요.'}
        </p>
      )}
      {loading && <p className="py-6 text-center text-muted">불러오는 중…</p>}
      {!loading && !date && !done && (
        <div className="text-center">
          <button onClick={more} className="rounded-xl border border-cream-300 bg-white px-5 py-2.5 text-sm hover:border-forest-500">더 보기</button>
        </div>
      )}
    </div>
  )
}
