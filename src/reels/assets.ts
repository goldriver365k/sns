import { newSceneId } from './store'
import type { AssetKind, ReelAsset } from './types'

const MAX_VIDEO_MB = 300
const MAX_VIDEO_SEC = 180

const MAX_SIDE = 2160

/**
 * 사진을 긴 변 2160px 이하로 줄인다. PNG·WebP·GIF는 투명한 부분(로고·캐릭터·누끼 사진)을
 * 지키기 위해 PNG로, 나머지는 JPEG로 저장한다.
 */
async function loadImageFile(file: File) {
  const raw = URL.createObjectURL(file)
  try {
    const src = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('이미지를 읽지 못했습니다. 다른 파일로 시도해 주세요.'))
      el.src = raw
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(src.naturalWidth, src.naturalHeight))
    const w = Math.round(src.naturalWidth * scale)
    const h = Math.round(src.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(src, 0, 0, w, h)
    const keepAlpha = /png|webp|gif/i.test(file.type)
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 처리하지 못했습니다.'))), keepAlpha ? 'image/png' : 'image/jpeg', 0.92),
    )
    const url = URL.createObjectURL(blob)
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('이미지를 처리하지 못했습니다.'))
      img.src = url
    })
    return { url, el, width: w, height: h }
  } finally {
    URL.revokeObjectURL(raw)
  }
}

/** 업로드·붙여넣기한 파일을 릴스 자료로 만든다. 사진은 긴 변 2160px로 줄이고(투명 배경 유지), 영상은 그대로 쓴다. */
export async function loadAsset(file: File, kind: AssetKind): Promise<ReelAsset> {
  if (file.type.startsWith('image/')) {
    const img = await loadImageFile(file)
    return { id: newSceneId(), kind, type: 'image', name: file.name || '붙여넣은 이미지', url: img.url, el: img.el, width: img.width, height: img.height }
  }
  if (file.type.startsWith('video/')) {
    if (kind !== 'media') throw new Error('로고와 캐릭터는 이미지 파일만 넣을 수 있습니다.')
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`영상은 ${MAX_VIDEO_MB}MB까지 넣을 수 있습니다.`)
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.loop = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () =>
        reject(new Error('이 브라우저에서 열 수 없는 영상입니다. 크롬·엣지·사파리 최신 버전을 쓰거나, MP4(H.264) 또는 WebM 파일로 바꿔 넣어 주세요.'))
    })
    if (video.duration > MAX_VIDEO_SEC) {
      URL.revokeObjectURL(url)
      throw new Error(`영상은 ${MAX_VIDEO_SEC / 60}분 이하만 넣을 수 있습니다.`)
    }
    return { id: newSceneId(), kind, type: 'video', name: file.name, url, el: video, width: video.videoWidth, height: video.videoHeight, duration: video.duration }
  }
  throw new Error('사진 또는 영상 파일만 넣을 수 있습니다.')
}

export function releaseAsset(a: ReelAsset) {
  if (a.type === 'video') (a.el as HTMLVideoElement).pause()
  URL.revokeObjectURL(a.url)
}
