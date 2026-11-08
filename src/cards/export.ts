export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다.'))), 'image/png'),
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadPng(blob: Blob, filename: string) {
  downloadBlob(blob, filename)
}

export async function downloadZip(files: { name: string; blob: Blob }[], zipName: string) {
  const { default: JSZip } = await import('jszip') // 압축할 때만 내려받는다
  const zip = new JSZip()
  files.forEach((f) => zip.file(f.name, f.blob))
  downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName)
}

/** 휴대폰 공유 화면으로 이미지를 넘길 수 있는지 (거기서 "이미지 저장"을 누르면 사진 앱에 저장됨) */
export function canShareImages() {
  try {
    const probe = new File([new Blob()], 'a.png', { type: 'image/png' })
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * 갤러리 저장: 공유 화면을 열어 사진 앱에 저장한다. 공유를 못 하는 기기(PC 등)는 PNG로 내려받는다.
 * 'shared' | 'downloaded' | 'cancelled'
 */
export async function saveToGallery(files: { name: string; blob: Blob }[]) {
  const list = files.map((f) => new File([f.blob], f.name, { type: 'image/png' }))
  if (canShareImages() && navigator.canShare({ files: list })) {
    try {
      await navigator.share({ files: list })
      return 'shared' as const
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled' as const
    }
  }
  files.forEach((f, i) => setTimeout(() => downloadBlob(f.blob, f.name), i * 300))
  return 'downloaded' as const
}
