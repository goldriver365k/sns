import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArchive, IconCalendar, IconFilm, IconImage, IconPen, IconSearch, IconSettings, IconSun, IconType, IconWand } from '../components/Icons'
import { emptyBox } from '../components/ui'

type Tool = {
  id: string
  label: string
  /** 찾기용 낱말 */
  keys: string
  icon: ComponentType<{ className?: string }> | string
  /** 아이콘 칸 그라데이션 */
  from: string
  to: string
  go: string | 'typo'
}

/** 첫 화면 도구 줄 (아이콘 칸 + 이름) */
const TOOLS: Tool[] = [
  { id: 'sns', label: 'SNS 게시물', keys: '인스타 스레드 페이스북 카드 캡션 게시물 글', icon: IconPen, from: '#ff6b8b', to: '#ff9f5a', go: '/create' },
  { id: 'reels', label: '자동 릴스', keys: '릴스 영상 동영상 mp4 쇼츠 숏폼', icon: IconFilm, from: '#b06cff', to: '#6d3df0', go: '/reels' },
  { id: 'tteolbok', label: '털복이 숏폼', keys: '털복이 곰 캐릭터 숏폼 영상', icon: '🐻', from: '#ffc163', to: '#ff8a3d', go: '/reels/tteolbok' },
  { id: 'keyword', label: '핵심어 타이포', keys: '핵심어 타이포 글자 영상', icon: IconType, from: '#ffd84d', to: '#f5a524', go: '/reels/keyword' },
  { id: 'photo', label: '상품 사진', keys: '사진 배경 지우기 상품 편집 포스터', icon: IconWand, from: '#34d6c3', to: '#0d9e95', go: '/photo' },
  { id: 'typo', label: '글자 포스터', keys: '글자 타이포 포스터 공지 문구', icon: 'Aa', from: '#7c8cff', to: '#4b4fe0', go: 'typo' },
  { id: 'today', label: '오늘의 콘텐츠', keys: '오늘 콘텐츠', icon: IconSun, from: '#ffb26b', to: '#f0743e', go: '/today' },
  { id: 'calendar', label: '캘린더', keys: '캘린더 달력 일정', icon: IconCalendar, from: '#4ade9a', to: '#10a36b', go: '/calendar' },
  { id: 'history', label: '지난 콘텐츠', keys: '지난 콘텐츠 기록 보관', icon: IconArchive, from: '#6ab1ff', to: '#2f6ef0', go: '/history' },
  { id: 'images', label: '이미지 보관함', keys: '이미지 사진 보관함', icon: IconImage, from: '#5ad1ff', to: '#1f9fe0', go: '/images' },
  { id: 'settings', label: '운영 설정', keys: '설정 브랜드 해시태그 서버', icon: IconSettings, from: '#a3a9bd', to: '#6b7184', go: '/settings' },
]

type Recent = { id: string; kind: 'reel' | 'photo' | 'post'; title: string; sub: string; thumb: string; at: number; open: () => Promise<void> }

const KIND_LABEL: Record<Recent['kind'], string> = { reel: '자동 릴스', photo: '상품 사진', post: 'SNS 게시물' }

function ago(ms: number) {
  if (!ms) return ''
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}일 전` : new Date(ms).toLocaleDateString('ko-KR')
}

/** 첫 화면: 큰 질문 + 찾기 + 도구 줄 + 디자인 계속하기 */
export default function Home() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<Recent[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 최근 작업: 자동 릴스 프로젝트 · 상품 사진 디자인 · SNS 게시물 (하나가 실패해도 나머지는 보여 줌)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [reels, photos, posts] = await Promise.allSettled([
        import('../reels/cloud').then((m) => m.listReelDocs()),
        import('../photo/designs').then((m) => m.listDesigns()),
        import('../lib/contents').then((m) => m.listRecent(8)),
      ])
      const list: Recent[] = []
      if (reels.status === 'fulfilled')
        for (const r of reels.value)
          list.push({
            id: `r-${r.id}`, kind: 'reel', title: r.title || '제목 없는 릴스', sub: `${r.duration}초 · 장면 ${r.scenes?.length ?? 0}개`, thumb: r.thumbnail, at: r.updatedAt?.getTime() ?? 0,
            open: async () => {
              const { openProject } = await import('../reels/persist')
              await openProject(r.id)
              navigate('/reels')
            },
          })
      if (photos.status === 'fulfilled')
        for (const d of photos.value)
          list.push({
            id: `p-${d.id}`, kind: 'photo', title: d.title || '상품 사진', sub: '', thumb: d.thumbnail, at: d.updatedAt?.getTime() ?? 0,
            open: async () => {
              const { getEditor } = await import('../photo/editorStore')
              if (getEditor().doc?.designId !== d.id) {
                const { openDesign } = await import('../photo/openDesign')
                await openDesign(d)
              }
              navigate('/photo/edit')
            },
          })
      if (posts.status === 'fulfilled')
        for (const c of posts.value.items) {
          const body = c.posts[0]?.cards?.[0]?.title || c.posts[0]?.body || c.topic || ''
          list.push({ id: `c-${c.id}`, kind: 'post', title: body.split('\n')[0].slice(0, 40) || 'SNS 게시물', sub: `${c.brandName || ''} · ${c.snsType}`, thumb: '', at: c.createdAtMs, open: async () => navigate('/history') })
        }
      list.sort((a, b) => b.at - a.at)
      if (alive) setRecent(list.slice(0, 12))
    })().catch(() => alive && setRecent([]))
    return () => {
      alive = false
    }
  }, [navigate])

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const match = (text: string) => words.every((w) => text.toLowerCase().includes(w))
  const tools = useMemo(() => (words.length ? TOOLS.filter((t) => match(`${t.label} ${t.keys}`)) : TOOLS), [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownRecent = (recent ?? []).filter((r) => !words.length || match(`${r.title} ${r.sub} ${KIND_LABEL[r.kind]}`))

  async function go(t: Tool) {
    setError(null)
    if (t.go !== 'typo') return navigate(t.go)
    setBusy(t.id)
    try {
      const { startTypoPoster } = await import('../photo/typoPoster')
      await startTypoPoster()
      navigate('/photo/edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : '글자 포스터를 시작하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function openRecent(r: Recent) {
    setError(null)
    setBusy(r.id)
    try {
      await r.open()
    } catch (e) {
      setError(e instanceof Error ? e.message : '열지 못했습니다.')
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      {/* 위쪽: 그라데이션 + 큰 질문 + 찾기 */}
      <section className="hero-gradient rounded-[28px] px-5 pt-12 pb-14 text-center sm:px-10 sm:pt-16 sm:pb-16">
        <h1 className="text-gradient text-3xl leading-tight font-bold sm:text-5xl">오늘은 무엇을 만들어 볼까요?</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (tools.length) void go(tools[0])
          }}
          className="mx-auto mt-8 flex max-w-3xl items-center gap-3 rounded-2xl border border-forest-100 bg-white px-5 py-4 shadow-[0_8px_30px_rgba(125,42,232,0.12)] focus-within:border-forest-500"
        >
          <IconSearch className="h-6 w-6 shrink-0 text-ink" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="무엇이든 찾아보세요 (예: 릴스, 포스터, 캘린더, 지난 디자인 제목)" aria-label="찾기" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
        </form>
      </section>

      {/* 도구 줄 */}
      <section className="mt-8">
        <ul className="flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:gap-4">
          {tools.map((t) => {
            const Icon = t.icon
            return (
              <li key={t.id} className="shrink-0">
                <button type="button" onClick={() => go(t)} disabled={busy === t.id} className="group flex w-[84px] flex-col items-center gap-2 text-[14px] text-ink sm:w-[96px]">
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl text-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-[68px] sm:w-[68px]" style={{ background: `linear-gradient(140deg, ${t.from}, ${t.to})` }}>
                    {typeof Icon === 'string' ? <span className="text-2xl font-bold">{Icon}</span> : <Icon className="h-7 w-7" />}
                  </span>
                  <span className="text-center leading-tight">{busy === t.id ? '여는 중…' : t.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {!tools.length && <p className="text-center text-sm text-muted">맞는 도구가 없습니다.</p>}
        {error && <p className="mt-2 text-center text-sm text-red-700">{error}</p>}
      </section>

      {/* 디자인 계속하기 */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-ink sm:text-[28px]">디자인 계속하기</h2>
          <button type="button" onClick={() => navigate('/reels/projects')} className="text-sm font-semibold text-ink hover:underline">
            릴스 모두 보기
          </button>
        </div>
        {recent === null && <p className="text-sm text-muted">불러오는 중…</p>}
        {recent !== null && !shownRecent.length && (
          <div className={emptyBox}>
            {words.length ? '찾은 디자인이 없습니다.' : '아직 만든 디자인이 없습니다. 위 도구로 시작해 보세요.'}
          </div>
        )}
        {!!shownRecent.length && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shownRecent.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => openRecent(r)} disabled={!!busy} className="group block w-full text-left">
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-cream-200 p-3 transition group-hover:shadow-md">
                    {r.thumb ? (
                      <img src={r.thumb} alt="" className="h-full w-full rounded-lg object-contain" />
                    ) : (
                      <span className="line-clamp-4 px-2 text-center text-[15px] font-semibold text-ink">{r.title}</span>
                    )}
                  </div>
                  <div className="mt-2 truncate text-[15px] font-semibold text-ink">{busy === r.id ? '여는 중…' : r.title}</div>
                  <div className="truncate text-xs text-muted">
                    {KIND_LABEL[r.kind]}
                    {r.sub && ` · ${r.sub}`} · {ago(r.at)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
