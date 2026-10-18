/** 게시물에 넣는 이미지 (붙여넣기·파일·AI 생성). 지금은 이 화면에서만 쓰고, 원본 보관은 Storage를 켠 뒤 추가한다. */
export type PickedImage = {
  id: string
  /** 화면·캔버스용 주소 (같은 사이트 주소라 PNG 저장이 막히지 않는다) */
  url: string
  el: HTMLImageElement
  source: 'paste' | 'file' | 'ai'
  width: number
  height: number
}

/** 이번 작업에서 쓰는 이미지 최대 개수 (입력 폼 + 카드 편집기 합계) */
export const MAX_IMAGES = 10
/** 긴 변 최대 크기 — 카드(1080×1350)에 충분하고 휴대폰 메모리를 아낀다 */
const MAX_SIDE = 2160

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다. 다른 파일로 시도해 주세요.'))
    img.src = src
  })
}

/** 파일·붙여넣은 이미지·AI 이미지를 적당한 크기로 줄여 쓸 수 있게 만든다. */
export async function prepareImage(blob: Blob, source: PickedImage['source']): Promise<PickedImage> {
  if (!blob.type.startsWith('image/')) throw new Error('이미지 파일만 넣을 수 있습니다.')
  const raw = URL.createObjectURL(blob)
  try {
    const img = await loadImage(raw)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    const out = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 처리하지 못했습니다.'))), 'image/jpeg', 0.92))
    const url = URL.createObjectURL(out)
    return { id: Math.random().toString(36).slice(2, 10), url, el: await loadImage(url), source, width: w, height: h }
  } finally {
    URL.revokeObjectURL(raw)
  }
}

export async function dataUrlToBlob(dataUrl: string) {
  return (await fetch(dataUrl)).blob()
}

/** 이미지를 PNG로 클립보드에 복사 (SNS 앱에 바로 붙여넣기). 지원하지 않는 브라우저면 false */
export async function copyImage(img: PickedImage): Promise<boolean> {
  try {
    if (!('ClipboardItem' in window)) return false
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    canvas.getContext('2d')!.drawImage(img.el, 0, 0)
    const png = new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return true
  } catch {
    return false
  }
}
