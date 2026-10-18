import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CardText, GeneratedPost } from '../../shared/generate'
import { checkReach, countChars, type SnsProfile } from '../../shared/sns'
import { composeCopyText, pickHashtags } from '../../shared/hashtags'
import { LANGUAGES } from '../lib/options'
import { copyText } from '../lib/clipboard'
import { btnGhost, btnPrimary, inputBase } from './ui'

export type LangResult = {
  status: 'loading' | 'fixing' | 'done' | 'error'
  post?: GeneratedPost
  error?: string
}

type Props = {
  profile: SnsProfile
  languages: string[]
  results: Record<string, LangResult>
  fixedHashtags: string[]
  approved: boolean
  saveState: 'saving' | 'saved' | 'error' | null
  /** 생성이 끝나고 자동 복사를 시도한 결과 알림 */
  autoCopyNotice: string | null
  onEdit: (lang: string, post: GeneratedPost) => void
  onRetry: (lang: string) => void
  onRegenerate: () => void
  onApprove: () => void
}

const langLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label ?? v

/** 복사할 최종 글 (본문 + 고정·생성 해시태그) */
export function finalText(profile: SnsProfile, post: GeneratedPost, fixed: string[]) {
  return composeCopyText(post.body, post.hashtags, fixed, profile.hashtags[1])
}

export default function PostResult(props: Props) {
  const { profile, languages, results, fixedHashtags, approved, saveState } = props
  const [active, setActive] = useState(languages[0])
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!languages.includes(active)) setActive(languages[0])
  }, [languages, active])

  useEffect(() => {
    if (props.autoCopyNotice) showToast(props.autoCopyNotice)
  }, [props.autoCopyNotice])

  function showToast(msg: string) {
    setToast(msg)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 2000)
  }

  async function copy(text: string) {
    showToast((await copyText(text)) ? '복사되었습니다' : '복사하지 못했습니다. 글을 길게 눌러 직접 복사해 주세요.')
  }

  const r = results[active]
  const busy = Object.values(results).some((x) => x.status === 'loading' || x.status === 'fixing')

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-forest-900">{profile.label} 게시물</h2>
        <span className="text-xs text-muted">
          {saveState === 'saving' && '저장 중…'}
          {saveState === 'saved' && '자동 저장됨'}
          {saveState === 'error' && <span className="text-red-700">저장하지 못했습니다. 네트워크를 확인해 주세요.</span>}
        </span>
      </div>

      {languages.length > 1 && (
        <div role="tablist" className="mb-4 flex flex-wrap gap-1 rounded-xl bg-cream-200 p-1">
          {languages.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={active === l}
              onClick={() => setActive(l)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${active === l ? 'bg-white text-forest-900 shadow-sm' : 'text-muted'}`}
            >
              {langLabel(l)}
              {results[l]?.status === 'error' && <span className="ml-1 text-red-700">!</span>}
            </button>
          ))}
        </div>
      )}

      {r && (r.status === 'loading' || r.status === 'fixing') && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream-300 border-t-forest-700" />
          {r.status === 'loading' ? `${langLabel(active)} 게시물을 작성하고 있어요…` : '노출 핵심을 보완하고 있어요…'}
        </div>
      )}

      {r?.status === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-[15px] text-red-700">{r.error}</p>
          <button onClick={() => props.onRetry(active)} className={btnGhost}>다시 시도</button>
        </div>
      )}

      {r?.status === 'done' && r.post && (
        <PostEditor
          key={active}
          profile={profile}
          post={r.post}
          fixedHashtags={fixedHashtags}
          onChange={(p) => props.onEdit(active, p)}
          onCopy={copy}
        />
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-cream-300 pt-4">
        <button onClick={props.onRegenerate} disabled={busy} className={btnGhost}>다시 생성</button>
        <button onClick={props.onApprove} disabled={busy || approved} className={btnPrimary}>
          {approved ? '승인됨' : '승인'}
        </button>
      </div>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-forest-900 px-5 py-2.5 text-sm text-cream-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function PostEditor({ profile, post, fixedHashtags, onChange, onCopy }: {
  profile: SnsProfile
  post: GeneratedPost
  fixedHashtags: string[]
  onChange: (p: GeneratedPost) => void
  onCopy: (text: string) => void
}) {
  const text = finalText(profile, post, fixedHashtags)
  const tags = pickHashtags(post.body, post.hashtags, fixedHashtags, profile.hashtags[1])
  const fixedSet = new Set(fixedHashtags.map((t) => t.toLowerCase()))
  const chars = countChars(profile.value, text)
  const over = chars > profile.maxChars
  const checks = checkReach(profile.value, { title: post.title, body: post.body, hashtags: tags, keyword: post.keyword })
  const set = (patch: Partial<GeneratedPost>) => onChange({ ...post, ...patch })

  return (
    <div className="space-y-4">
      {checks.length > 0 && (
        <ul aria-label="노출 핵심 검사" className="flex flex-wrap gap-1.5">
          {checks.map((c) => (
            <li key={c.label} className={`rounded-full px-2.5 py-1 text-xs ${c.ok ? 'bg-forest-50 text-forest-700' : 'bg-red-50 text-red-700'}`}>
              {c.ok ? '✓' : '✕'} {c.label}
            </li>
          ))}
        </ul>
      )}

      {(profile.kind === 'video' || profile.kind === 'blog') && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-forest-900">제목</span>
            <button onClick={() => onCopy(post.title)} className="text-sm font-medium text-forest-500 hover:underline">제목 복사</button>
          </div>
          <input value={post.title} onChange={(e) => set({ title: e.target.value })} className={inputBase} aria-label="제목" />
        </div>
      )}

      {profile.kind === 'cards' && post.cards.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-semibold text-forest-900">카드 글</div>
          <p className="mb-2 text-xs text-muted">카드 이미지 미리보기와 PNG 저장은 다음 단계에서 추가됩니다.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {post.cards.map((card, i) => (
              <CardFields key={i} index={i} card={card} onChange={(c) => set({ cards: post.cards.map((x, j) => (j === i ? c : x)) })} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-forest-900">{profile.kind === 'cards' ? '캡션' : '본문'}</span>
          <button onClick={() => onCopy(text)} className="rounded-lg bg-forest-700 px-3 py-1.5 text-sm font-semibold text-cream-50 hover:bg-forest-900">
            복사하기
          </button>
        </div>
        <AutoTextarea value={post.body} onChange={(v) => set({ body: v })} label="본문" />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className={`rounded-md px-2 py-0.5 text-xs ${fixedSet.has(t.toLowerCase()) ? 'bg-forest-700 text-cream-50' : 'bg-cream-200 text-forest-700'}`} title={fixedSet.has(t.toLowerCase()) ? '고정 해시태그' : undefined}>
                {t}
              </span>
            ))}
          </div>
          <span className={`text-xs ${over ? 'font-semibold text-red-700' : 'text-muted'}`}>
            {chars} / {profile.maxChars}자{profile.value === 'x' && ' (한글 기준)'}{over && ' — 제한 초과'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">[복사하기]를 누르면 해시태그까지 모두 복사됩니다. 진한 색은 고정 해시태그입니다.</p>
      </div>
    </div>
  )
}

function CardFields({ index, card, onChange }: { index: number; card: CardText; onChange: (c: CardText) => void }) {
  const field = 'w-full rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-forest-500'
  return (
    <div className="space-y-1.5 rounded-xl border border-cream-300 bg-cream-50 p-3">
      <div className="text-xs font-semibold text-muted">카드 {index + 1}</div>
      <input aria-label={`카드 ${index + 1} 제목`} value={card.title} onChange={(e) => onChange({ ...card, title: e.target.value })} className={`${field} font-semibold`} />
      <textarea aria-label={`카드 ${index + 1} 본문`} rows={3} value={card.body} onChange={(e) => onChange({ ...card, body: e.target.value })} className={`${field} resize-y`} />
      <input aria-label={`카드 ${index + 1} 강조 문구`} placeholder="강조 문구" value={card.emphasis} onChange={(e) => onChange({ ...card, emphasis: e.target.value })} className={field} />
    </div>
  )
}

/** 내용 길이에 맞춰 높이가 늘어나는 입력칸 */
function AutoTextarea({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputBase} min-h-40 resize-none leading-relaxed`}
    />
  )
}
