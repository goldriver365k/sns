import { useRef, useState } from 'react'
import type { GeneratedPost } from '../../shared/generate'
import { getSnsProfile } from '../../shared/sns'
import { deleteContent, updateContent, type StoredContent } from '../lib/contents'
import type { Channel } from '../lib/channels'
import { useStoredImages } from '../lib/imageStore'
import { LANGUAGES } from '../lib/options'
import PostResult, { type LangResult } from './PostResult'

const langLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label ?? v

/** 저장된 콘텐츠 1건: 접힌 요약 → 펼치면 결과 화면(복사·수정·자동 저장·승인·카드 저장) */
export default function ContentItem({ item, channels, onDeleted }: { item: StoredContent; channels: Channel[]; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [posts, setPosts] = useState(item.posts)
  const [status, setStatus] = useState(item.status)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error' | null>(null)
  const timer = useRef<number | undefined>(undefined)
  // 저장된 사진은 펼칠 때 불러온다. 사진을 바꾸면 이 콘텐츠의 사진 목록도 함께 저장
  const { images, setImages, loading: imagesLoading, error: imageError } = useStoredImages(open ? item.imageIds : null, (ids) => {
    updateContent(item.id, { imageIds: ids }).catch(() => setSaveState('error'))
  })
  const profile = getSnsProfile(item.snsType)
  const channel = channels.find((c) => c.id === item.channelId)
  const first = posts[0]
  const preview = (first?.title || first?.cards?.[0]?.title || first?.body || '').replace(/\s+/g, ' ').slice(0, 80)

  function edit(language: string, post: GeneratedPost) {
    const next = posts.map((p) => (p.language === language ? { ...post, language } : p))
    setPosts(next)
    setSaveState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      updateContent(item.id, { posts: next })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 1000)
  }

  async function approve() {
    setStatus('approved')
    try {
      await updateContent(item.id, { status: 'approved' })
    } catch {
      setStatus(item.status)
      setSaveState('error')
    }
  }

  async function remove() {
    if (!confirm('이 콘텐츠를 삭제할까요? 되돌릴 수 없습니다.')) return
    try {
      await deleteContent(item.id)
      onDeleted(item.id)
    } catch {
      setSaveState('error')
    }
  }

  const results: Record<string, LangResult> = Object.fromEntries(posts.map((p) => [p.language, { status: 'done', post: p }]))

  return (
    <li className="rounded-2xl border border-cream-300 bg-white">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left sm:px-5">
        <span className="text-xs text-muted">{item.date}</span>
        <span className="rounded-md bg-forest-50 px-2 py-0.5 text-xs font-medium text-forest-700">{profile?.label ?? item.snsType}</span>
        {item.brandName && <span className="text-sm font-semibold text-forest-900">{item.brandName}</span>}
        <span className={`rounded-md px-2 py-0.5 text-xs ${status === 'approved' ? 'bg-forest-700 text-cream-50' : 'bg-cream-200 text-muted'}`}>
          {status === 'approved' ? '승인됨' : '검토 대기'}
        </span>
        {item.source === 'auto' && <span className="text-xs text-muted">자동 생성</span>}
        <span className="text-xs text-muted">{posts.map((p) => langLabel(p.language)).join(' · ')}</span>
        {item.imageIds.length > 0 && <span className="text-xs text-muted">사진 {item.imageIds.length}</span>}
        <span className="ml-auto text-sm text-muted">{open ? '접기' : '열기'}</span>
        <span className="w-full truncate text-[15px] text-ink">{item.topic ? `[${item.topic}] ` : ''}{preview || '(내용 없음)'}</span>
      </button>

      {open && profile && (
        <div className="border-t border-cream-300 p-4 sm:p-5">
          <PostResult
            profile={profile}
            languages={posts.map((p) => p.language)}
            results={results}
            fixedHashtags={item.fixedHashtags}
            images={images}
            onImagesChange={setImages}
            brand={{
              name: item.brandName,
              siteUrl: channel?.siteUrl ?? '',
              defaultDesign: channel?.defaultDesign ?? 'simple',
              fileKey: (item.channelId ?? '').replace(/[^a-zA-Z0-9-]/g, '') || 'card',
            }}
            approved={status === 'approved'}
            saveState={saveState}
            autoCopyNotice={null}
            onEdit={edit}
            onApprove={approve}
            channelId={item.channelId}
            topic={item.topic}
          />
          {imagesLoading && <p className="mt-2 text-xs text-muted">사진 불러오는 중…</p>}
          {imageError && <p className="mt-2 text-xs text-red-700">{imageError}</p>}
          <div className="mt-3 text-right">
            <button onClick={remove} className="text-sm text-red-700 hover:underline">이 콘텐츠 삭제</button>
          </div>
        </div>
      )}
    </li>
  )
}
