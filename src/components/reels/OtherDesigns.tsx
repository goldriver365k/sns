import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { drawKwFrame, ensureKwFonts, KW_DESIGNS, KW_H, KW_W, sceneTimings, type KwDesignId } from '../../keyword/render'
import { keywordScenesFrom, matchStore, sendToKeyword, sendToTteolbok, tteolbokCopyFrom } from '../../reels/handoff'
import { drawTteolbokFrame, ensureTteolbokFonts, loadBear, TT_DESIGNS, TT_H, TT_W, type DesignId } from '../../tteolbok/render'
import { useBrandStores } from '../../tteolbok/stores'
import { estimateSeconds, makeCues, voiceTexts } from '../../tteolbok/timeline'
import type { ReelProject } from '../../reels/types'

type Pick = { kind: 'tteolbok'; id: DesignId; name: string } | { kind: 'keyword'; id: KwDesignId; name: string }

const TW = 72
const TH = 128

/**
 * 자동 릴스 내용으로 털복이 숏폼(3안)·핵심어 타이포(4안) 디자인을 고른다.
 * 썸네일은 지금 장면 자막을 그 형식에 그대로 옮긴 모습. 고르면 내용을 옮기고 그 탭을 연다.
 */
export default function OtherDesigns({ project, brandName }: { project: ReelProject; brandName?: string }) {
  const navigate = useNavigate()
  const stores = useBrandStores()
  const [bear, setBear] = useState<HTMLImageElement | null>(null)
  const [picked, setPicked] = useState<Pick | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const thumbs = useRef<Record<string, HTMLCanvasElement | null>>({})

  useEffect(() => {
    loadBear().then(setBear).catch(() => undefined)
  }, [])

  const store = matchStore(stores, brandName)
  const storeBox = store ? { name: store.name, loc: store.loc, bg: store.bg, fg: store.fg } : { name: brandName ?? '', loc: '' }
  const textSig = JSON.stringify(project.scenes.map((s) => [s.text, s.priceText]))
  const copy = useMemo(() => tteolbokCopyFrom(project), [textSig]) // eslint-disable-line react-hooks/exhaustive-deps
  const kwScenes = useMemo(() => keywordScenesFrom(project), [textSig]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasText = kwScenes.length > 0

  useEffect(() => {
    let cancel = false
    Promise.all([ensureTteolbokFonts({ copy, store: storeBox }), ensureKwFonts({ scenes: kwScenes, store: storeBox })]).then(() => {
      if (cancel) return
      const cues = makeCues(voiceTexts(copy).map(estimateSeconds) as [number, number, number], copy)
      const timings = sceneTimings(kwScenes).list
      const draw = (key: string, w: number, h: number, fn: (c: CanvasRenderingContext2D) => void) => {
        const el = thumbs.current[key]
        const c = el?.getContext('2d')
        if (!el || !c) return
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, el.width, el.height)
        c.save()
        c.scale(el.width / w, el.height / h)
        fn(c)
        c.restore()
      }
      for (const d of TT_DESIGNS) draw(`t-${d.id}`, TT_W, TT_H, (c) => drawTteolbokFrame(c, { design: d.id, copy, store: storeBox, cues, voice: false, aiLabel: false, bear, env: null }, 999))
      for (const d of KW_DESIGNS) draw(`k-${d.id}`, KW_W, KW_H, (c) => drawKwFrame(c, { design: d.id, scenes: kwScenes, timings, store: storeBox, aiLabel: false }, 1e6))
    })
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy, kwScenes, bear, store?.id, brandName])

  async function send(ai: boolean) {
    if (!picked) return
    setError(null)
    setBusy(true)
    try {
      if (picked.kind === 'tteolbok') {
        await sendToTteolbok(project, picked.id, { ai, store })
        navigate('/reels/tteolbok')
      } else {
        await sendToKeyword(project, picked.id, { ai, store })
        navigate('/reels/keyword')
      }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : '옮기지 못했습니다.'} [그대로 옮기기]는 AI 없이 됩니다.`)
    } finally {
      setBusy(false)
    }
  }

  const thumb = (key: string, p: Pick, label: string) => (
    <button
      key={key}
      onClick={() => setPicked(p)}
      disabled={!hasText || busy}
      aria-pressed={picked?.kind === p.kind && picked.id === p.id}
      title={label}
      className={`flex flex-col items-center gap-0.5 rounded-lg border-2 p-0.5 text-[10px] disabled:opacity-50 ${picked?.kind === p.kind && picked.id === p.id ? 'border-forest-700' : 'border-transparent'}`}
    >
      <canvas ref={(el) => void (thumbs.current[key] = el)} width={TW} height={TH} className="w-full rounded bg-cream-200" />
      <span className="truncate">{p.name}</span>
    </button>
  )

  return (
    <div className="mt-3 border-t border-cream-300 pt-3">
      <div className="mb-1 text-xs font-semibold text-forest-900">다른 형식 디자인으로 만들기</div>
      <p className="mb-2 text-[11px] leading-snug text-muted">이 릴스의 자막으로 털복이 숏폼·핵심어 타이포 영상을 만듭니다(사진은 쓰지 않는 글자형 영상). 그림은 자막을 그대로 옮긴 모습입니다.</p>
      {!hasText && <p className="mb-2 text-[11px] text-red-700">먼저 장면 자막을 써 주세요.</p>}
      <div className="mb-1 text-[11px] font-medium text-muted">털복이 숏폼</div>
      <div className="grid grid-cols-4 gap-1">{TT_DESIGNS.map((d) => thumb(`t-${d.id}`, { kind: 'tteolbok', id: d.id, name: d.name }, d.desc))}</div>
      <div className="mt-2 mb-1 text-[11px] font-medium text-muted">핵심어 타이포</div>
      <div className="grid grid-cols-4 gap-1">{KW_DESIGNS.map((d) => thumb(`k-${d.id}`, { kind: 'keyword', id: d.id, name: d.name }, d.desc))}</div>

      {picked && (
        <div className="mt-2 rounded-xl border border-forest-700 bg-white p-3 text-xs">
          <p className="font-semibold text-forest-900">
            {picked.kind === 'tteolbok' ? '털복이 숏폼' : '핵심어 타이포'} · {picked.name}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            {picked.kind === 'tteolbok' ? '제목·포인트·말풍선 3줄' : '장면별 핵심어 + 문장(2~5장면)'} 형식으로 옮기고 그 탭을 엽니다. 그 탭에 있던 문구는 이 내용으로 바뀝니다.
            {store ? ` 하단 상호: ${store.name}.` : ' 하단 상호는 그 탭에서 고릅니다.'} 목소리·음악·MP4는 그 탭에서 만듭니다.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button onClick={() => send(true)} disabled={busy} className="rounded-lg bg-forest-700 py-2 font-semibold text-cream-50 disabled:opacity-60">
              {busy ? '옮기는 중…' : '✨ AI로 맞춰 옮기기'}
            </button>
            <button onClick={() => send(false)} disabled={busy} className="rounded-lg border border-forest-700 py-2 font-semibold text-forest-700 disabled:opacity-60">
              그대로 옮기기
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">AI로 맞춰 옮기기는 서버 AI(OpenAI)로 그 형식의 글자 수에 맞게 다시 씁니다.</p>
          {error && <p className="mt-1 text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}
