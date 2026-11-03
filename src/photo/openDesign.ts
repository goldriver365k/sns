import type { AiBackground } from '../components/AiBgPanel'
import type { PickedImage } from '../lib/images'
import { DEFAULT_SETTINGS, NO_TRANSFORM } from './compose'
import { cutoutFromMask, loadImage, type DesignListItem } from './designs'
import { openSaved } from './editorStore'

/** 내 디자인 1개를 불러와 편집기에 연다 (배경 제거 AI를 다시 돌리지 않음) */
export async function openDesign(item: DesignListItem) {
  const [orig, mask, bgEl] = await Promise.all([loadImage(item.originalId), loadImage(item.maskId), item.aiBg ? loadImage(item.aiBg.id) : Promise.resolve(null)])
  if (!orig || !mask) throw new Error('저장된 사진을 불러오지 못했습니다. 네트워크를 확인해 주세요.')
  const cutout = cutoutFromMask(orig, mask)
  const original: PickedImage = { id: item.originalId, url: orig.src, el: orig, source: 'file', width: orig.naturalWidth, height: orig.naturalHeight }
  const bg: AiBackground | null = bgEl && item.aiBg ? { id: `saved-${item.aiBg.id}`, url: bgEl.src, el: bgEl, prompt: item.aiBg.prompt, kind: item.aiBg.kind ?? 'ai' } : null
  openSaved(
    {
      original,
      cutout,
      status: 'done',
      tool: 'background',
      title: item.title,
      designId: item.id,
      originalId: item.originalId,
      maskId: item.maskId,
      storedBgs: bg && item.aiBg ? { [bg.id]: item.aiBg.id } : {},
    },
    {
      settings: { ...DEFAULT_SETTINGS, ...item.settings },
      transform: { ...NO_TRANSFORM, ...item.transform },
      texts: item.texts ?? [],
      aiBgId: bg?.id ?? null,
    },
    bg,
  )
}
