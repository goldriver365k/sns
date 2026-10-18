import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { inputBase } from '../components/ui'
import { listByDateRange, todayKst, type StoredContent } from '../lib/contents'
import { useChannels, WEEKDAYS } from '../lib/channels'
import { getSnsProfile } from '../lib/options'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** 콘텐츠 캘린더: 날짜별로 만든 콘텐츠와, 고른 브랜드의 계획 주제를 함께 본다. 날짜를 누르면 지난 콘텐츠로 이동 */
export default function ContentCalendar() {
  const navigate = useNavigate()
  const today = todayKst()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)))
  const { channels } = useChannels()
  const [brandId, setBrandId] = useState('')
  const [items, setItems] = useState<StoredContent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const daysInMonth = new Date(year, month, 0).getDate()
  // 월요일 시작 (계획이 월~일 순서)
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    listByDateRange(ymd(year, month, 1), ymd(year, month, daysInMonth))
      .then((list) => alive && setItems(list))
      .catch(() => alive && setError('콘텐츠를 불러오지 못했습니다. 네트워크를 확인해 주세요.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [year, month, daysInMonth])

  const byDate = useMemo(() => {
    const map = new Map<string, StoredContent[]>()
    for (const i of items) map.set(i.date, [...(map.get(i.date) ?? []), i])
    return map
  }, [items])

  const brand = channels.find((c) => c.id === brandId)

  /** 그날의 계획 주제: 주간(요일) + 월간("15일"처럼 날짜가 적힌 것) */
  function topicsOf(day: number) {
    if (!brand) return []
    const weekday = WEEKDAYS[(firstWeekday + day - 1) % 7]
    return brand.plans
      .filter((p) => (p.period === 'weekly' ? p.when === weekday : new RegExp(`(^|\\D)${day}일`).test(p.when)))
      .map((p) => p.topic)
  }

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="콘텐츠 캘린더" description="날짜별로 만든 콘텐츠와 브랜드 계획을 한눈에 봅니다. 날짜를 누르면 그날 콘텐츠로 이동합니다." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} aria-label="이전 달" className="rounded-lg border border-cream-300 bg-white px-3 py-2 hover:border-forest-500">‹</button>
          <div className="min-w-32 text-center text-lg font-bold text-forest-900">{year}년 {month}월</div>
          <button onClick={() => shift(1)} aria-label="다음 달" className="rounded-lg border border-cream-300 bg-white px-3 py-2 hover:border-forest-500">›</button>
          <button onClick={() => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7))) }} className="ml-1 text-sm text-forest-700 hover:underline">오늘</button>
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
          계획 표시
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={`${inputBase} w-44 py-2`}>
            <option value="">표시 안 함</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white">
        <div className="grid grid-cols-7 border-b border-cream-300 bg-cream-50 text-center text-xs font-semibold text-muted">
          {WEEKDAYS.map((d) => <div key={d} className={`py-2 ${d === '일' ? 'text-red-700' : ''}`}>{d}</div>)}
        </div>
        <div className={`grid grid-cols-7 ${loading ? 'opacity-60' : ''}`}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} className="min-h-20 border-r border-b border-cream-200 bg-cream-50/50 sm:min-h-28" />
            const date = ymd(year, month, day)
            const list = byDate.get(date) ?? []
            const topics = topicsOf(day)
            const isToday = date === today
            return (
              <button
                key={date}
                onClick={() => navigate(`/history?date=${date}`)}
                className="flex min-h-20 flex-col items-stretch gap-1 border-r border-b border-cream-200 p-1.5 text-left transition hover:bg-forest-50 sm:min-h-28 sm:p-2"
                aria-label={`${date} 콘텐츠 ${list.length}개`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-forest-700 font-bold text-cream-50' : 'text-ink'}`}>{day}</span>
                {topics.map((t) => (
                  <span key={t} className="truncate text-[10px] text-forest-500 sm:text-[11px]" title={t}>· {t}</span>
                ))}
                {list.length > 0 && (
                  <>
                    {/* 모바일: 개수만 */}
                    <span className="mt-auto rounded bg-forest-700 px-1 text-center text-[10px] text-cream-50 sm:hidden">{list.length}개</span>
                    {/* PC: 브랜드·SNS 목록 */}
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {list.slice(0, 3).map((c) => (
                        <span key={c.id} className={`truncate rounded px-1 py-0.5 text-[11px] ${c.status === 'approved' ? 'bg-forest-700 text-cream-50' : 'bg-cream-200 text-ink'}`}>
                          {getSnsProfile(c.snsType)?.label ?? c.snsType}{c.brandName ? ` · ${c.brandName}` : ''}
                        </span>
                      ))}
                      {list.length > 3 && <span className="text-[11px] text-muted">+{list.length - 3}개 더</span>}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">진한 초록은 승인된 콘텐츠, 연한 색은 검토 대기입니다. 이번 달 {items.length}개.</p>
    </div>
  )
}
