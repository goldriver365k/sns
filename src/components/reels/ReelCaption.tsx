import { useEffect, useState } from 'react'
import { composeCopyText } from '../../../shared/hashtags'
import { SNS_PROFILES } from '../../../shared/sns'
import { bareDomain, ensureSiteLink } from '../../../shared/site'
import { generatePost } from '../../lib/api'
import { useChannels } from '../../lib/channels'
import { copyText } from '../../lib/clipboard'

type Props = {
  /** 브랜드(운영 설정) 이름 — 같은 이름의 브랜드 사이트·고정 해시태그·규칙을 쓴다 */
  brandName?: string
  topic: string
  /** 영상 자막 전체 (캡션 내용의 근거) */
  content: string
  /** 캡션 보관: 값을 직접 넘기거나(value·onChange), 이 기기 저장 키를 넘긴다 */
  value?: string
  onChange?: (v: string) => void
  storageKey?: string
}

const INSTAGRAM = SNS_PROFILES.find((p) => p.value === 'instagram')!

function load(key?: string) {
  if (!key) return ''
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

/**
 * 인스타그램에 영상과 함께 올릴 캡션: 기존 인스타그램 캡션 규칙(3줄 이내 + 해시태그 3~5개)으로 만들고,
 * 브랜드 고정 해시태그와 사이트 링크(예: https://bulbaek.com)를 코드로 한 번 더 보장한다.
 */
export default function ReelCaption({ brandName, topic, content, value, onChange, storageKey }: Props) {
  const { channels } = useChannels()
  const [local, setLocal] = useState(() => load(storageKey))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const caption = value ?? local
  const brand = channels.find((c) => c.name.replace(/\s/g, '') === (brandName ?? '').replace(/\s/g, '')) ?? null
  const site = brand?.siteUrl ? bareDomain(brand.siteUrl) : ''

  function set(v: string) {
    if (onChange) onChange(v)
    else {
      setLocal(v)
      try {
        if (storageKey) localStorage.setItem(storageKey, v)
      } catch {
        // 저장하지 못해도 화면에는 남음
      }
    }
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  async function copy(text = caption) {
    setToast((await copyText(text)) ? '복사되었습니다' : '복사하지 못했습니다. 글을 길게 눌러 직접 복사해 주세요.')
  }

  async function make() {
    setError(null)
    if (!content.trim() && !topic.trim()) return setError('먼저 영상 자막이나 주제를 넣어 주세요.')
    setBusy(true)
    try {
      const post = await generatePost({
        snsType: 'instagram',
        language: 'ko',
        topic: topic.trim() || undefined,
        content: `인스타그램 릴스(세로 영상)에 함께 올릴 캡션. 영상 자막:\n${content.trim()}`,
        instructions: '릴스 영상 캡션만 쓴다. 카드 이미지는 없으므로 cards는 빈 배열로 둔다. 영상 자막을 그대로 반복하지 말고 보고 싶게 만드는 훅으로 시작한다.',
        brand: brand ? { name: brand.name, siteUrl: brand.siteUrl, description: brand.description, rules: brand.rules, hashtags: brand.hashtags } : undefined,
      })
      let body = post.body
      if (site) body = ensureSiteLink(body, site)
      const text = composeCopyText(body, post.hashtags, brand?.hashtags ?? [], INSTAGRAM.hashtags[1])
      set(text)
      await copy(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '캡션을 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const missingSite = !!site && !!caption && !caption.toLowerCase().includes(`https://${site.toLowerCase()}`)

  return (
    <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
      <h2 className="mb-1 text-sm font-bold text-forest-900">인스타그램 캡션</h2>
      <p className="mb-2 text-[11px] leading-snug text-muted">
        영상과 함께 올릴 캡션입니다. 3줄 이내 + 해시태그{brand ? `(${brand.name} 고정 해시태그 포함)` : ''}
        {site ? `, 사이트 링크 https://${site} 를 꼭 넣습니다.` : '. 브랜드(상호)를 고르면 사이트 링크·고정 해시태그가 들어갑니다.'}
      </p>
      <button onClick={make} disabled={busy} className="w-full rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:opacity-60">
        {busy ? '캡션 쓰는 중…' : caption ? '✨ 캡션 다시 만들기' : '✨ 캡션 만들기'}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {caption && (
        <>
          <textarea value={caption} onChange={(e) => set(e.target.value)} rows={7} aria-label="인스타그램 캡션" className="mt-2 w-full resize-y rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500" />
          {missingSite && (
            <button onClick={() => set(ensureSiteLink(caption, site))} className="mt-1 text-xs font-medium text-red-700 underline">
              사이트 링크가 빠졌습니다 — https://{site} 넣기
            </button>
          )}
          <button onClick={() => copy()} className="mt-1 w-full rounded-xl border border-forest-700 bg-white py-2 text-sm font-semibold text-forest-700">
            캡션 복사하기
          </button>
          {toast && <p className="mt-1 text-center text-xs text-forest-700">{toast}</p>}
        </>
      )}
      {site && (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          인스타그램은 캡션 속 주소를 눌리는 링크로 바꿔 주지 않습니다. 프로필의 웹사이트(링크) 칸에도 https://{site} 를 걸어 두고, 캡션에 "프로필 링크"를 안내하면 좋습니다.
        </p>
      )}
    </section>
  )
}
