import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ContentItem from '../components/ContentItem'
import { listByDateRange, todayKst, type StoredContent } from '../lib/contents'
import { useChannels } from '../lib/channels'

/** 오늘의 콘텐츠: 오늘 만든 콘텐츠를 모아 검토·승인한다. (매일 자동 생성은 보류 중이라 지금은 직접 만든 것만) */
export default function TodayContents() {
  const today = todayKst()
  const { channels } = useChannels()
  const [items, setItems] = useState<StoredContent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listByDateRange(today, today)
      .then(setItems)
      .catch(() => setError('콘텐츠를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.'))
      .finally(() => setLoading(false))
  }, [today])

  const approved = items.filter((i) => i.status === 'approved').length
  const stats = [
    { label: '오늘의 콘텐츠', value: items.length },
    { label: '검토 대기', value: items.length - approved },
    { label: '승인 완료', value: approved },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="오늘의 콘텐츠" description={`${today} 에 만든 콘텐츠를 검토하고 승인합니다.`} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-cream-300 bg-cream-50 p-4 text-center">
            <div className="text-2xl font-bold text-forest-900">{loading ? '–' : s.value}</div>
            <div className="mt-1 text-xs text-muted sm:text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="py-6 text-center text-muted">불러오는 중…</p>}

      <ul className="space-y-2">
        {items.map((item) => (
          <ContentItem key={item.id} item={item} channels={channels} onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </ul>

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-8 text-center">
          <p className="text-muted">오늘 만든 콘텐츠가 아직 없습니다.</p>
          <Link to="/create" className="mt-3 inline-block font-semibold text-forest-700 hover:underline">SNS 게시물 만들기 →</Link>
        </div>
      )}

      <p className="mt-6 text-xs text-muted">매일 오전 5시 자동 생성은 보류 중입니다. 다시 시작하면 자동 생성 결과도 이 화면에 함께 표시됩니다.</p>
    </div>
  )
}
