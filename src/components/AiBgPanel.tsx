import { useState } from 'react'
import { generateImage } from '../lib/api'
import { inputBase } from './ui'

/** 만든 AI 배경 (이번 작업에서만 보관) */
export type AiBackground = { id: string; url: string; el: HTMLImageElement; prompt: string }

/** 자주 쓰는 촬영 장면 (AI에 보낼 설명) */
const SCENES = [
  { label: '대리석 테이블', prompt: '밝은 흰 대리석 테이블 위, 뒤쪽은 부드러운 회색 벽, 고급스러운 자연광' },
  { label: '원목 테이블', prompt: '따뜻한 원목 테이블 위, 창으로 들어오는 오후 햇살, 뒤쪽은 흐릿한 거실' },
  { label: '카페 창가', prompt: '아늑한 카페 창가 테이블 위, 창밖은 흐릿한 거리, 부드러운 아침 빛' },
  { label: '주방 조리대', prompt: '깔끔한 밝은 주방 조리대 위, 뒤쪽 흐릿한 타일 벽과 식물' },
  { label: '파스텔 받침대', prompt: '파스텔 톤 원기둥 받침대 위, 단색 파스텔 배경, 부드러운 스튜디오 조명' },
  { label: '고급 검정', prompt: '어두운 검정 무광 받침대 위, 은은한 측면 조명, 고급스러운 분위기' },
  { label: '야외 햇살', prompt: '햇살 좋은 야외 잔디 위 평평한 돌판, 뒤쪽은 흐릿한 나무와 하늘' },
  { label: '봄 꽃', prompt: '밝은 테이블 위, 가장자리에 흐릿한 벚꽃 가지, 화사한 봄 분위기' },
  { label: '여름 바다', prompt: '모래 위 평평한 나무 판, 뒤쪽은 흐릿한 푸른 바다와 하늘, 여름 햇살' },
  { label: '가을', prompt: '원목 테이블 위, 가장자리에 흐릿한 단풍잎, 따뜻한 가을 오후 빛' },
  { label: '크리스마스', prompt: '테이블 위, 뒤쪽에 흐릿한 크리스마스 전구 불빛과 소나무 가지, 따뜻한 분위기' },
]

const MAX_KEEP = 6

type Props = {
  shape: 'square' | 'portrait' | 'landscape'
  backgrounds: AiBackground[]
  selectedId: string | null
  onAdd: (bg: AiBackground) => void
  onSelect: (id: string) => void
}

function loadEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('배경 이미지를 읽지 못했습니다.'))
    el.src = src
  })
}

/**
 * AI 배경: OpenAI로 상품이 없는 배경 장면만 만들고, 배경을 지운 상품을 그 위에 얹는다.
 * 상품은 AI가 다시 그리지 않으므로 실제 상품과 똑같이 나온다(SPEC 5-1 음식 사진 원칙 유지).
 */
export default function AiBgPanel({ shape, backgrounds, selectedId, onAdd, onSelect }: Props) {
  const [prompt, setPrompt] = useState(SCENES[0].prompt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function make() {
    const text = prompt.trim()
    if (!text) return setError('어떤 배경을 만들지 골라 주세요.')
    setBusy(true)
    setError(null)
    try {
      const url = await generateImage({ prompt: text, purpose: 'productBg', shape })
      onAdd({ id: Math.random().toString(36).slice(2, 10), url, el: await loadEl(url), prompt: text })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 배경을 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-cream-300 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {SCENES.map((s) => (
          <button key={s.label} type="button" aria-pressed={prompt === s.prompt} onClick={() => setPrompt(s.prompt)} className={`rounded-full border px-2.5 py-1 text-xs ${prompt === s.prompt ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 text-ink'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea aria-label="AI 배경 설명" rows={3} maxLength={300} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="예) 햇살 드는 원목 테이블 위, 뒤쪽은 흐릿한 화분" className={`${inputBase} resize-y px-3 py-2 text-sm`} />
      <button type="button" onClick={make} disabled={busy} className="w-full rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300 disabled:text-muted">
        {busy ? 'AI 배경 만드는 중… (최대 30초)' : backgrounds.length ? '✨ 새 AI 배경 만들기' : '✨ AI 배경 만들기'}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}

      {backgrounds.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted">만든 배경 — 눌러서 바꾸기 (최근 {MAX_KEEP}개)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {backgrounds.map((b, i) => (
              <button key={b.id} type="button" aria-label={`AI 배경 ${i + 1}`} aria-pressed={b.id === selectedId} title={b.prompt} onClick={() => onSelect(b.id)} className={`overflow-hidden rounded-lg border-2 ${b.id === selectedId ? 'border-forest-700' : 'border-transparent'}`}>
                <img src={b.url} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">상품은 AI가 다시 그리지 않고 원본 사진 그대로 얹습니다. 배경 1장을 만들 때마다 OpenAI 이미지 사용료가 듭니다. 만든 배경은 이 화면을 닫으면 사라지니 결과를 저장해 두세요.</p>
    </div>
  )
}

export const MAX_AI_BACKGROUNDS = MAX_KEEP
