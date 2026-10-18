import { useEffect, useRef, useState } from 'react'
import { dataUrlToBlob, MAX_IMAGES, prepareImage, type PickedImage } from '../lib/images'
import { generateImage } from '../lib/api'
import { btnLink, fieldLabel, inputBase } from './ui'

type Props = {
  images: PickedImage[]
  onChange: (images: PickedImage[]) => void
  snsType: string
  brandName: string
  /** 음식 브랜드면 실제 메뉴처럼 보이는 음식 사진은 AI로 만들지 않는다 */
  foodBrand: boolean
  /** AI 설명칸 기본값(콘텐츠 내용·계획 주제) */
  suggestion: string
  isInstagram: boolean
}

/** AI 이미지 만들기 — 사용자 요청으로 보류. 다시 쓰려면 true로 바꾸고 OPENAI_IMAGE_MODEL을 설정한다. */
const AI_IMAGE_ENABLED = false

const STYLES = [
  { value: 'photo', label: '사진 느낌' },
  { value: 'illust', label: '일러스트' },
  { value: 'minimal', label: '미니멀 배경' },
]

/** 이미지 넣기: 붙여넣기(Ctrl+V) · 끌어다 놓기 · 파일 찾기 (AI로 만들기는 보류) */
export default function ImagePicker({ images, onChange, snsType, brandName, foodBrand, suggestion, isInstagram }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('photo')
  const [generating, setGenerating] = useState(false)
  const imagesRef = useRef(images)
  imagesRef.current = images
  const full = images.length >= MAX_IMAGES

  async function add(blobs: Blob[], source: PickedImage['source']) {
    setError(null)
    const room = MAX_IMAGES - imagesRef.current.length
    if (room <= 0) {
      setError(`이미지는 ${MAX_IMAGES}장까지 넣을 수 있습니다.`)
      return
    }
    const picked: PickedImage[] = []
    for (const b of blobs.slice(0, room)) {
      try {
        picked.push(await prepareImage(b, source))
      } catch (e) {
        setError(e instanceof Error ? e.message : '이미지를 넣지 못했습니다.')
      }
    }
    if (blobs.length > room) setError(`이미지는 ${MAX_IMAGES}장까지 넣을 수 있어 일부만 넣었습니다.`)
    if (picked.length) onChange([...imagesRef.current, ...picked])
  }

  // 화면 어디서든 이미지를 붙여넣으면 추가 (글자 붙여넣기는 그대로 동작)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      add(files, 'paste')
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remove(id: string) {
    const target = images.find((i) => i.id === id)
    if (target) URL.revokeObjectURL(target.url)
    onChange(images.filter((i) => i.id !== id))
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...images]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(next)
  }

  async function runAi() {
    const text = (prompt || suggestion).trim()
    if (!text) {
      setError('어떤 이미지를 만들지 적어 주세요.')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const dataUrl = await generateImage({ prompt: text, style, snsType, brandName, foodBrand })
      await add([await dataUrlToBlob(dataUrl)], 'ai')
      setAiOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 만들지 못했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className={`${fieldLabel} mb-0`}>이미지</span>
        <span className="text-xs text-muted">{images.length}/{MAX_IMAGES}</span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')), 'file')
        }}
        className={`rounded-xl border-2 border-dashed p-4 text-center transition ${drag ? 'border-forest-500 bg-forest-50' : 'border-cream-300 bg-white'}`}
      >
        {images.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <li key={img.id} className="group relative overflow-hidden rounded-lg border border-cream-300 bg-cream-100">
                <img src={img.url} alt={`이미지 ${i + 1}`} className="aspect-square w-full object-cover" />
                <span className="absolute top-1 left-1 rounded bg-black/55 px-1.5 text-[11px] text-white">
                  {isInstagram && i < 3 ? `카드 ${i + 1}` : i + 1}
                  {img.source === 'ai' && ' · AI'}
                </span>
                <button type="button" aria-label={`이미지 ${i + 1} 빼기`} onClick={() => remove(img.id)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-sm leading-6 text-white hover:bg-red-600">
                  ×
                </button>
                {images.length > 1 && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/40 px-1">
                    <button type="button" aria-label="앞으로" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-white disabled:opacity-30">‹</button>
                    <button type="button" aria-label="뒤로" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="px-1 text-white disabled:opacity-30">›</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-muted">
          {full ? '이미지를 더 넣으려면 하나를 빼 주세요.' : '여기에 끌어다 놓거나, 복사한 이미지를 붙여넣으세요 (Ctrl+V)'}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" disabled={full} onClick={() => fileRef.current?.click()} className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm font-medium text-forest-700 hover:border-forest-500 disabled:opacity-40">
            파일 찾기
          </button>
          {AI_IMAGE_ENABLED && <button type="button" disabled={full} onClick={() => setAiOpen((v) => !v)} className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm font-medium text-forest-700 hover:border-forest-500 disabled:opacity-40">
            AI로 만들기
          </button>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            add([...(e.target.files ?? [])], 'file')
            e.target.value = ''
          }}
        />
      </div>

      {AI_IMAGE_ENABLED && aiOpen && !full && (
        <div className="mt-3 space-y-3 rounded-xl border border-cream-300 bg-white p-4">
          <textarea
            aria-label="만들 이미지 설명"
            rows={3}
            maxLength={1000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={suggestion ? `비워 두면: ${suggestion.slice(0, 60)}` : '예) 따뜻한 햇살이 드는 캠퍼스 벤치, 가을 분위기'}
            className={`${inputBase} resize-y text-sm`}
          />
          <div className="flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <button key={s.value} type="button" aria-pressed={style === s.value} onClick={() => setStyle(s.value)} className={`rounded-full border px-3 py-1 text-xs ${style === s.value ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 text-ink'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {foodBrand && <p className="text-xs text-muted">음식 브랜드는 실제 메뉴처럼 보이는 음식 사진 대신 분위기·소품·일러스트 위주로 만듭니다. 메뉴 사진은 직접 찍은 사진을 넣어 주세요.</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setAiOpen(false)} className={btnLink}>닫기</button>
            <button type="button" onClick={runAi} disabled={generating} className="rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:bg-cream-300 disabled:text-muted">
              {generating ? '만드는 중… (최대 30초)' : '이미지 만들기'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {isInstagram && images.length > 0 && <p className="mt-1 text-xs text-muted">앞의 3장이 순서대로 카드 1·2·3에 들어갑니다. ‹ › 로 순서를 바꾸거나, 카드 편집기에서 카드마다 고를 수 있습니다.</p>}
    </div>
  )
}
