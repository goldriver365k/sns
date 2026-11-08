import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MyDesigns from '../components/photo/MyDesigns'
import { prepareImage } from '../lib/images'
import { SIZES, targetSize, type PhotoSettings, type SizeId, type TextLayer } from '../photo/compose'
import { POSTER_SETS, TYPO_SETS } from '../components/photo/TextPanel'
import { renderSample, SAMPLE_BGS } from '../photo/sampleBgs'
import { getEditor, openPhoto, patchDoc, setEditor, useEditor, type EditorTool } from '../photo/editorStore'

/** noPhoto: 사진 없이 시작 (글자 포스터) */
type Tile = { id: string; icon: string; label: string; desc: string; tool: EditorTool; preset?: Partial<PhotoSettings>; texts?: Omit<TextLayer, 'id'>[]; noPhoto?: boolean }

/** 홈 화면 도구: 누르면 사진을 고르고, 그 도구가 열린 편집기로 간다 */
const TILES: Tile[] = [
  { id: 'remove', icon: '✂️', label: '배경 지우기', desc: '상품만 깔끔하게', tool: 'background', preset: { bg: 'transparent', shadow: 'none' } },
  { id: 'white', icon: '⬜', label: '흰 배경', desc: '스마트스토어·쿠팡 대표 이미지', tool: 'background', preset: { bg: 'color', color: '#ffffff', size: 'market', shadow: 'floor' } },
  { id: 'ai', icon: '✨', label: 'AI 배경', desc: '대리석·카페·계절 장면', tool: 'background', preset: { bg: 'ai', shadow: 'floor' } },
  { id: 'studio', icon: '💡', label: '스튜디오 배경', desc: '조명 받은 단색 배경', tool: 'background', preset: { bg: 'studio' } },
  { id: 'shadow', icon: '🌗', label: 'AI 그림자', desc: '바닥·부드러운 그림자', tool: 'shadow' },
  { id: 'resize', icon: '📐', label: '크기 바꾸기', desc: '쇼핑몰·인스타·유튜브·직접 입력', tool: 'size' },
  { id: 'text', icon: '🔤', label: '글자 넣기', desc: '가격·문구·할인 띠', tool: 'text' },
  // 포스터: 사진을 그대로 배경으로 깔고 A4 세로 + 행사 포스터 문구로 시작 (글자 패널에서 세트·글꼴 변경)
  { id: 'poster', icon: '🪧', label: '포스터 만들기', desc: 'A4·A3 인쇄용, 사진 배경 + 글자', tool: 'text', preset: { size: 'a4', bg: 'photo', showProduct: false }, texts: POSTER_SETS[0].layers },
  // 글자 포스터: 사진 없이 샘플 배경 + 글자만 (타이포그래피 포스트)
  { id: 'typo', icon: '🅰️', label: '글자 포스터', desc: '그림 없이 글자만, 사진 필요 없음', tool: 'text', preset: { bg: 'image', showProduct: false, shadow: 'none' }, texts: TYPO_SETS[0].layers, noPhoto: true },
  { id: 'video', icon: '🎞', label: '제품 영상 (AI)', desc: '사진을 움직이는 영상으로', tool: 'video' },
  { id: 'reel', icon: '🎬', label: '릴스 만들기', desc: '자막·음악 넣은 MP4', tool: 'video' },
]

/** 상품 사진 편집 홈: 사진으로 시작 + 도구 타일 (Photoroom 홈 화면과 같은 흐름) */
export default function PhotoHome() {
  const navigate = useNavigate()
  const { doc } = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<Tile | null>(null)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 시작할 크기: 마지막에 쓴 크기를 기본으로 (도구 타일이 크기를 정하면 그 크기)
  const [size, setSize] = useState<SizeId>(() => getEditor().design.settings.size)

  async function start(blob: Blob | undefined, tile: Tile | null) {
    if (!blob) return
    setError(null)
    try {
      const img = await prepareImage(blob, 'file')
      openPhoto(img, tile?.tool ?? 'background', { size, ...tile?.preset }, undefined, tile?.texts)
      navigate('/photo/edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 열지 못했습니다.')
    }
  }

  /** 사진 없이 시작: 빈 바탕을 원본 대신 쓰고, 기본 샘플 배경(크림)과 글자 세트로 연다 */
  async function startWithoutPhoto(tile: Tile) {
    setError(null)
    try {
      const s = size === 'original' ? 'portrait' : size
      const out = targetSize({ ...getEditor().design.settings, size: s }, 1080, 1350)
      const blank = document.createElement('canvas')
      blank.width = out.w
      blank.height = out.h
      const bctx = blank.getContext('2d')!
      bctx.fillStyle = '#ffffff'
      bctx.fillRect(0, 0, out.w, out.h)
      const blob = await new Promise<Blob>((res, rej) => blank.toBlob((b) => (b ? res(b) : rej(new Error('바탕을 만들지 못했습니다.'))), 'image/png'))
      const img = await prepareImage(blob, 'file')
      // 상품이 없으므로 투명한 1px 그림을 상품 자리로 둔다 (배경 지우기 없음)
      const none = document.createElement('canvas')
      none.width = 1
      none.height = 1
      openPhoto(img, tile.tool, { ...tile.preset, size: s }, { canvas: none, x: 0, y: 0 }, tile.texts)
      const sample = SAMPLE_BGS.find((x) => x.id === 'cream') ?? SAMPLE_BGS[0]
      const el = await renderSample(sample, out.w, out.h)
      const id = `sample-${sample.id}-${Date.now().toString(36)}`
      setEditor((st) => ({ aiBgs: [{ id, url: el.src, el, prompt: `샘플 배경: ${sample.name}`, kind: 'image' }, ...st.aiBgs], design: { ...st.design, aiBgId: id } }))
      const d = new Date()
      patchDoc({ title: `글자 포스터 ${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` })
      navigate('/photo/edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : '글자 포스터를 시작하지 못했습니다.')
    }
  }

  function pick(tile: Tile | null) {
    if (tile?.noPhoto) return void startWithoutPhoto(tile)
    pending.current = tile
    fileRef.current?.click()
  }

  // 화면 어디서든 사진을 붙여넣으면 바로 편집 시작
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      start(file, null)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="상품 사진 편집" description="사진 한 장으로 판매용 상품 사진, AI 배경, 제품 영상, 릴스까지 만듭니다." />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          start([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')), null)
        }}
        className={`flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition sm:flex-row sm:justify-between sm:text-left ${drag ? 'border-forest-500 bg-forest-50' : 'border-cream-300 bg-white'}`}
      >
        <div>
          <p className="text-xl font-bold text-forest-900">사진으로 시작</p>
          <p className="mt-1 text-[15px] text-muted">상품 사진을 끌어다 놓거나 붙여넣으세요 (Ctrl+V). 배경은 자동으로 지워집니다.</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-forest-900">만들 크기</span>
            <select aria-label="만들 크기" value={size} onChange={(e) => setSize(e.target.value as SizeId)} className="flex-1 rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500">
              {SIZES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                  {x.w ? ` (${x.w}×${x.h})` : ` — ${x.hint}`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => pick(null)} className="rounded-2xl bg-forest-700 px-7 py-4 text-[16px] font-semibold text-cream-50 hover:bg-forest-900">
            ＋ 사진 고르기
          </button>
          <p className="text-xs text-muted sm:text-right">편집 중에도 위쪽 [크기]에서 바꿀 수 있습니다</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          start(e.target.files?.[0], pending.current)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {doc && (
        <Link to="/photo/edit" className="mt-4 flex items-center gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-3 hover:border-forest-500">
          <img src={doc.original.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
          <span className="text-[15px] font-medium text-forest-900">편집하던 사진 이어서 하기 →</span>
        </Link>
      )}

      <h2 className="mt-10 mb-3 text-lg font-bold text-forest-900">도구</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => pick(t)} className="flex h-full w-full flex-col items-start gap-2 rounded-2xl border border-cream-300 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-forest-500">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream-100 text-xl" aria-hidden>
                {t.icon}
              </span>
              <span className="text-[15px] font-semibold text-ink">{t.label}</span>
              <span className="text-xs text-muted">{t.desc}</span>
            </button>
          </li>
        ))}
        <li>
          <Link to="/photo/batch" className="flex h-full w-full flex-col items-start gap-2 rounded-2xl border border-cream-300 bg-white p-4 transition hover:-translate-y-0.5 hover:border-forest-500">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream-100 text-xl" aria-hidden>
              🗂
            </span>
            <span className="text-[15px] font-semibold text-ink">여러 장 한꺼번에</span>
            <span className="text-xs text-muted">최대 30장, 같은 설정으로</span>
          </Link>
        </li>
      </ul>
      <MyDesigns />

      <p className="mt-6 text-xs text-muted">배경 지우기는 이 기기 안에서 처리합니다(사진을 서버로 보내지 않음). AI 배경·제품 영상만 AI 서버를 쓰며 사용료가 듭니다.</p>
    </div>
  )
}
