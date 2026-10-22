import { useEffect, useState } from 'react'
import { composeCopyText } from '../../../shared/hashtags'
import { SNS_PROFILES } from '../../../shared/sns'
import { bareDomain, brandLanguages, brandSite, ensureSiteLink } from '../../../shared/site'
import { LANGUAGES } from '../../lib/options'
import { generatePost } from '../../lib/api'
import { useChannels } from '../../lib/channels'
import { copyText } from '../../lib/clipboard'

type Captions = Record<string, string>

type Props = {
  /** 브랜드(운영 설정) 이름 — 같은 이름의 브랜드 사이트·고정 해시태그·규칙을 쓴다 */
  brandName?: string
  topic: string
  /** 영상 자막 전체 (캡션 내용의 근거) */
  content: string
  /** 언어별 캡션 보관: 값을 직접 넘기거나(value·onChange), 이 기기 저장 키를 넘긴다 */
  value?: Captions
  onChange?: (v: Captions) => void
  storageKey?: string
}

const INSTAGRAM = SNS_PROFILES.find((p) => p.value === 'instagram')!
const LANG_LABEL = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label])) as Record<string, string>

function load(key?: string): Captions {
  if (!key) return {}
  try {
    const raw = localStorage.getItem(key) ?? ''
    if (!raw) return {}
    // 예전에는 한국어 캡션 한 개를 글자로 저장했다
    return raw.startsWith('{') ? (JSON.parse(raw) as Captions) : { ko: raw }
  } catch {
    return {}
  }
}

/**
 * 인스타그램에 영상과 함께 올릴 캡션: 기존 인스타그램 캡션 규칙(3줄 이내 + 해시태그 3~5개)으로 언어별로 만들고,
 * 브랜드 고정 해시태그와 사이트 링크(예: https://bulbaek.com, https://hellokorean.site)를 코드로 한 번 더 보장한다.
 * Hello Korean은 영어·중국어·일본어·베트남어·인도네시아어 번역을 기본으로 함께 고른다.
 */
export default function ReelCaption({ brandName, topic, content, value, onChange, storageKey }: Props) {
  const { channels } = useChannels()
  const [local, setLocal] = useState<Captions>(() => load(storageKey))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const captions = value ?? local
  const brand = channels.find((c) => c.name.replace(/\s/g, '') === (brandName ?? '').replace(/\s/g, '')) ?? null
  const site = bareDomain(brandSite(brand?.name ?? brandName, brand?.siteUrl))
  const brandLangs = brandLanguages(brand?.name ?? brandName)
  const [langs, setLangs] = useState<string[]>(['ko', ...brandLangs])

  // 브랜드가 바뀌면 그 브랜드의 기본 번역 언어로
  useEffect(() => {
    setLangs(['ko', ...brandLangs])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandLangs.join(',')])

  function set(v: Captions) {
    if (onChange) onChange(v)
    else {
      setLocal(v)
      try {
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(v))
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

  async function copy(text: string) {
    setToast((await copyText(text)) ? '복사되었습니다' : '복사하지 못했습니다. 글을 길게 눌러 직접 복사해 주세요.')
  }

  async function makeOne(language: string) {
    const post = await generatePost({
      snsType: 'instagram',
      language,
      topic: topic.trim() || undefined,
      content: `인스타그램 릴스(세로 영상)에 함께 올릴 캡션. 영상 자막(한국어):\n${content.trim()}`,
      instructions: '릴스 영상 캡션만 쓴다. 카드 이미지는 없으므로 cards는 빈 배열로 둔다. 영상 자막을 그대로 반복하지 말고 보고 싶게 만드는 훅으로 시작한다.',
      brand: brand || site ? { name: brand?.name ?? brandName ?? '', siteUrl: site, description: brand?.description ?? '', rules: brand?.rules ?? '', hashtags: brand?.hashtags ?? [] } : undefined,
    })
    const body = site ? ensureSiteLink(post.body, site) : post.body
    return composeCopyText(body, post.hashtags, brand?.hashtags ?? [], INSTAGRAM.hashtags[1])
  }

  async function make() {
    setError(null)
    if (!content.trim() && !topic.trim()) return setError('먼저 영상 자막이나 주제를 넣어 주세요.')
    if (!langs.length) return setError('언어를 하나 이상 골라 주세요.')
    setBusy(true)
    const order = LANGUAGES.map((l) => l.value as string).filter((l) => langs.includes(l))
    const results = await Promise.allSettled(order.map(makeOne))
    const next: Captions = {}
    const failed: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') next[order[i]] = r.value
      else failed.push(`${LANG_LABEL[order[i]]}: ${r.reason instanceof Error ? r.reason.message : '실패'}`)
    })
    set(next)
    if (failed.length) setError(failed.join(' / '))
    const first = next[order.find((l) => next[l]) ?? '']
    if (first) await copy(first)
    setBusy(false)
  }

  const shown = LANGUAGES.map((l) => l.value as string).filter((l) => captions[l])
  const missing = (text: string) => !!site && !!text && !text.toLowerCase().includes(`https://${site.toLowerCase()}`)

  return (
    <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
      <h2 className="mb-1 text-sm font-bold text-forest-900">인스타그램 캡션</h2>
      <p className="mb-2 text-[11px] leading-snug text-muted">
        영상과 함께 올릴 캡션입니다. 3줄 이내 + 해시태그{brand ? `(${brand.name} 고정 해시태그 포함)` : ''}
        {site ? `, 사이트 링크 https://${site} 를 꼭 넣습니다.` : '. 브랜드를 고르면 사이트 링크·고정 해시태그가 들어갑니다.'}
      </p>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="캡션 언어">
        {LANGUAGES.map((l) => {
          const on = langs.includes(l.value)
          return (
            <button
              key={l.value}
              onClick={() => setLangs(on ? langs.filter((x) => x !== l.value) : [...langs, l.value])}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}
            >
              {l.label}
            </button>
          )
        })}
      </div>
      {brandLangs.length > 0 && <p className="mb-2 text-[11px] text-muted">{brand?.name ?? brandName}: 한국어 + {brandLangs.map((l) => LANG_LABEL[l]).join('·')} 번역을 함께 만듭니다.</p>}
      <button onClick={make} disabled={busy} className="w-full rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:opacity-60">
        {busy ? `캡션 쓰는 중… (${langs.length}개 언어)` : shown.length ? '✨ 캡션 다시 만들기' : '✨ 캡션 만들기'}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {shown.map((l) => (
        <div key={l} className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-forest-900">{LANG_LABEL[l]}</span>
            <button onClick={() => copy(captions[l])} className="rounded-lg border border-forest-700 bg-white px-2.5 py-1 font-semibold text-forest-700">
              복사
            </button>
          </div>
          <textarea value={captions[l]} onChange={(e) => set({ ...captions, [l]: e.target.value })} rows={6} aria-label={`인스타그램 캡션 ${LANG_LABEL[l]}`} className="w-full resize-y rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500" />
          {missing(captions[l]) && (
            <button onClick={() => set({ ...captions, [l]: ensureSiteLink(captions[l], site) })} className="mt-0.5 text-xs font-medium text-red-700 underline">
              사이트 링크가 빠졌습니다 — https://{site} 넣기
            </button>
          )}
        </div>
      ))}
      {toast && <p className="mt-1 text-center text-xs text-forest-700">{toast}</p>}
      {site && (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          인스타그램은 캡션 속 주소를 눌리는 링크로 바꿔 주지 않습니다. 프로필의 웹사이트(링크) 칸에도 https://{site} 를 걸어 두고, 캡션에 "프로필 링크"를 안내하면 좋습니다.
        </p>
      )}
    </section>
  )
}
