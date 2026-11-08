import { useEffect, useRef, useState } from 'react'
import type { AiBackground } from '../AiBgPanel'
import { fetchPhoto, searchPhotos, type FoundPhoto } from '../../photo/bgSearch'
import { findSamples, renderSample, sampleThumb, type SampleBg } from '../../photo/sampleBgs'

type Tab = 'mine' | 'sample' | 'web'

type Props = {
  /** 결과 크기 (샘플을 이 비율로 그린다) */
  outW: number
  outH: number
  /** 지금까지 넣은 사진 배경 (내 사진·샘플·무료 사진) */
  photos: AiBackground[]
  selectedId: string | null
  onAdd: (bg: AiBackground) => void
  onSelect: (id: string) => void
  onUpload: () => void
  onPasteBlob: (blob: Blob) => void
}

const tabBtn = (on: boolean) => `flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${on ? 'bg-forest-700 text-cream-50' : 'text-ink hover:bg-cream-200'}`
const newId = () => Math.random().toString(36).slice(2, 10)

function loadEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
    el.src = src
  })
}

/**
 * 사진 배경 고르기: 내 사진(올리기·붙여넣기) / 기본 샘플(앱이 그린 배경, 찾기) / 무료 사진 찾기(CC0 공개 사진).
 * 고른 배경은 모두 "사진 배경"으로 들어가 저장·다시 열기가 같은 방식으로 된다.
 */
export default function BgLibraryPanel({ outW, outH, photos, selectedId, onAdd, onSelect, onUpload, onPasteBlob }: Props) {
  const [tab, setTab] = useState<Tab>('mine')
  const [sampleQ, setSampleQ] = useState('')
  const [webQ, setWebQ] = useState('')
  const [found, setFound] = useState<FoundPhoto[] | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const thumbs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const samples = findSamples(sampleQ)
  const selected = photos.find((p) => p.id === selectedId)

  // 샘플 목록 그림
  useEffect(() => {
    if (tab !== 'sample') return
    for (const s of samples) {
      const c = thumbs.current[s.id]
      if (c) sampleThumb(c, s)
    }
  }, [tab, sampleQ, outW, outH]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pickSample(s: SampleBg) {
    setError(null)
    setBusy(s.id)
    try {
      const el = await renderSample(s, outW, outH)
      onAdd({ id: `sample-${s.id}-${newId()}`, url: el.src, el, prompt: `샘플 배경: ${s.name}`, kind: 'image' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '샘플 배경을 넣지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function search(nextPage = 1) {
    if (!webQ.trim()) return setError('찾을 말을 입력해 주세요. 예) 원목 테이블, 바다, 꽃')
    setError(null)
    setBusy('search')
    try {
      const r = await searchPhotos(webQ, nextPage)
      setFound(nextPage === 1 ? r.results : [...(found ?? []), ...r.results])
      setPage(nextPage)
      if (!r.results.length && nextPage === 1) setError('찾은 사진이 없습니다. 다른 말(영어도 됩니다)로 찾아보세요.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 찾지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function pickPhoto(p: FoundPhoto) {
    setError(null)
    setBusy(p.id)
    try {
      const f = await fetchPhoto(p.id)
      const url = `data:${f.mime};base64,${f.data}`
      const el = await loadEl(url)
      const credit = [f.title || '무료 사진', f.creator && `by ${f.creator}`, f.source, f.license.toUpperCase()].filter(Boolean).join(' · ')
      onAdd({ id: `web-${p.id.slice(0, 8)}-${newId()}`, url, el, prompt: `무료 사진: ${credit}`, kind: 'image' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 넣지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function pasteButton() {
    setError(null)
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) return onPasteBlob(await item.getType(type))
      }
      setError('복사해 둔 사진이 없습니다. 사진을 복사한 뒤 다시 눌러 주세요.')
    } catch {
      setError('이 브라우저는 붙여넣기 버튼을 지원하지 않습니다. Ctrl+V로 붙여넣거나 [내 사진 올리기]를 써 주세요.')
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-cream-300 bg-white p-3">
      <div className="flex gap-1 rounded-xl bg-cream-100 p-1" role="tablist" aria-label="사진 배경 고르기">
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')} className={tabBtn(tab === 'mine')}>내 사진·붙여넣기</button>
        <button type="button" role="tab" aria-selected={tab === 'sample'} onClick={() => setTab('sample')} className={tabBtn(tab === 'sample')}>기본 샘플</button>
        <button type="button" role="tab" aria-selected={tab === 'web'} onClick={() => setTab('web')} className={tabBtn(tab === 'web')}>무료 사진 찾기</button>
      </div>

      {tab === 'mine' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onUpload} className="rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900">
              📁 내 사진 올리기
            </button>
            <button type="button" onClick={pasteButton} className="rounded-lg border border-forest-700 px-3 py-2 text-sm font-semibold text-forest-700">
              📋 붙여넣기
            </button>
          </div>
          <p className="text-xs text-muted">다른 곳에서 복사한 배경 사진을 이 화면에서 <b>Ctrl+V</b>로 붙여넣어도 배경으로 들어갑니다.</p>
        </div>
      )}

      {tab === 'sample' && (
        <div className="space-y-2">
          <input value={sampleQ} onChange={(e) => setSampleQ(e.target.value)} placeholder="찾기 예) 파스텔, 원목, 겨울, 고급" aria-label="샘플 찾기" className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm outline-none focus:border-forest-500" />
          <div className="grid grid-cols-4 gap-1.5">
            {samples.map((s) => (
              <button key={s.id} type="button" onClick={() => pickSample(s)} disabled={!!busy} title={s.tags} aria-label={`샘플 배경 ${s.name}`} className="flex flex-col items-center gap-0.5 text-[11px] disabled:opacity-60">
                <canvas ref={(el) => void (thumbs.current[s.id] = el)} width={72} height={Math.round((72 * outH) / Math.max(1, outW))} className="w-full rounded-md border border-cream-300" />
                <span className="truncate">{busy === s.id ? '넣는 중…' : s.name}</span>
              </button>
            ))}
          </div>
          {!samples.length && <p className="text-xs text-muted">맞는 샘플이 없습니다. [무료 사진 찾기]도 써 보세요.</p>}
          <p className="text-xs text-muted">이 앱이 직접 그린 배경이라 저작권 걱정 없이 쓸 수 있습니다. 글자 포스터 배경으로도 좋습니다.</p>
        </div>
      )}

      {tab === 'web' && (
        <div className="space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void search(1)
            }}
            className="flex gap-1.5"
          >
            <input value={webQ} onChange={(e) => setWebQ(e.target.value)} placeholder="예) 원목 테이블, 바다, 꽃" aria-label="무료 사진 찾기" className="min-w-0 flex-1 rounded-lg border border-cream-300 px-3 py-2 text-sm outline-none focus:border-forest-500" />
            <button type="submit" disabled={busy === 'search'} className="shrink-0 rounded-lg bg-forest-700 px-3 text-sm font-semibold text-cream-50 disabled:opacity-60">
              {busy === 'search' ? '찾는 중…' : '찾기'}
            </button>
          </form>
          {found && found.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {found.map((p) => (
                  <button key={p.id} type="button" onClick={() => pickPhoto(p)} disabled={!!busy} title={`${p.title} · ${p.source}`} aria-label={`무료 사진 ${p.title}`} className="relative overflow-hidden rounded-md border border-cream-300 disabled:opacity-60">
                    <img src={p.thumb} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    {busy === p.id && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] text-white">넣는 중…</span>}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => search(page + 1)} disabled={!!busy || page >= 10} className="w-full rounded-lg border border-cream-300 py-1.5 text-xs disabled:opacity-50">
                더 보기
              </button>
            </>
          )}
          <p className="text-xs text-muted">Openverse에서 저작권 표시가 필요 없는 공개 사진(CC0·퍼블릭 도메인)만 찾습니다 — 상업적으로 써도 됩니다. 영어로 찾으면 더 많이 나옵니다.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}

      {photos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted">넣은 배경 — 눌러서 바꾸기</p>
          <div className="grid grid-cols-4 gap-1.5">
            {photos.map((b, i) => (
              <button key={b.id} type="button" aria-label={`사진 배경 ${i + 1}`} aria-pressed={b.id === selectedId} title={b.prompt} onClick={() => onSelect(b.id)} className={`overflow-hidden rounded-lg border-2 ${b.id === selectedId ? 'border-forest-700' : 'border-transparent'}`}>
                <img src={b.url} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
          {selected && <p className="mt-1 truncate text-[11px] text-muted" title={selected.prompt}>{selected.prompt}</p>}
        </div>
      )}
    </div>
  )
}
