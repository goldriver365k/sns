import { TYPO_SETS } from '../components/photo/TextPanel'
import { prepareImage } from '../lib/images'
import { targetSize, type SizeId } from './compose'
import { getEditor, openPhoto, patchDoc, setEditor } from './editorStore'
import { renderSample, SAMPLE_BGS } from './sampleBgs'

/**
 * 글자 포스터를 사진 없이 시작한다: 고른 크기의 흰 바탕을 원본 대신 쓰고(상품 자리에는 투명 1px, 배경 지우기 없음),
 * 기본 샘플 배경(크림) + 글자 세트 "큰 제목형"으로 편집기를 준비한다. 호출한 쪽에서 /photo/edit 로 이동한다.
 */
export async function startTypoPoster(size?: SizeId) {
  const want = size ?? getEditor().design.settings.size
  const s: SizeId = want === 'original' ? 'portrait' : want
  const out = targetSize({ ...getEditor().design.settings, size: s }, 1080, 1350)
  const blank = document.createElement('canvas')
  blank.width = out.w
  blank.height = out.h
  const bctx = blank.getContext('2d')!
  bctx.fillStyle = '#ffffff'
  bctx.fillRect(0, 0, out.w, out.h)
  const blob = await new Promise<Blob>((res, rej) => blank.toBlob((b) => (b ? res(b) : rej(new Error('바탕을 만들지 못했습니다.'))), 'image/png'))
  const img = await prepareImage(blob, 'file')
  const none = document.createElement('canvas')
  none.width = 1
  none.height = 1
  openPhoto(img, 'text', { bg: 'image', showProduct: false, shadow: 'none', size: s }, { canvas: none, x: 0, y: 0 }, TYPO_SETS[0].layers)
  const sample = SAMPLE_BGS.find((x) => x.id === 'cream') ?? SAMPLE_BGS[0]
  const el = await renderSample(sample, out.w, out.h)
  const id = `sample-${sample.id}-${Date.now().toString(36)}`
  setEditor((st) => ({ aiBgs: [{ id, url: el.src, el, prompt: `샘플 배경: ${sample.name}`, kind: 'image' }, ...st.aiBgs], design: { ...st.design, aiBgId: id } }))
  const d = new Date()
  patchDoc({ title: `글자 포스터 ${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` })
}
